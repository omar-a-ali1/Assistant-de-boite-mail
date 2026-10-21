# Architecture

## Vue d'ensemble

```
Navigateur ──HTTP──► Backend Express ──SQL──► PostgreSQL
                          │  ▲
              IMAP/SMTP   │  │ webhooks (X-Webhook-Secret)
                          ▼  │
                  Gmail (par utilisateur)     n8n ──► GreenMail / IA
```

Le backend est le **seul point d'entrée applicatif** : il porte
l'authentification, les autorisations, la validation, l'idempotence et la
persistance. Le frontend ne connaît que l'API REST du backend. n8n n'est jamais
exposé au navigateur.

## Composants

| Composant | Rôle | Technologies |
| --- | --- | --- |
| `apps/frontend` | Interface responsive | Vue 3, Vite, Pinia, Vue Router, Tailwind v4 |
| `apps/backend` | API REST, auth, règles métier, outbox d'envoi | Express CJS, `pg`, Joi, bcrypt |
| PostgreSQL | Source de vérité durable | PostgreSQL 16, migrations SQL |
| n8n | Intégrations boîte mail et IA | Workflows JSON, webhooks |
| GreenMail / Gmail / IA | Boîte locale de démo, Gmail par utilisateur, fournisseur IA | IMAP/SMTP (GreenMail, Gmail App Password), API compatible OpenAI |

### Frontend

- `views/` : `LoginView`, `RegisterView`, `TodayView`, `InboxView`, `ThreadView`.
- `components/ui/` : bibliothèque locale de composants (bouton, champ, carte,
  dialogue, toast…) sans dépendance à un design system lourd.
- `stores/auth.js` : état de session en mémoire (jamais de jeton en
  `localStorage`).
- `services/apiClient.js` : client Axios unique (`withCredentials`, en-tête
  CSRF, gestion des 401).
- `components/emails/ReplyComposer.vue` : génération, édition, sauvegarde,
  confirmation explicite, suivi d'envoi et réessai sûr.

### Backend

```
src/
├── app.js                 # middlewares + montage des routeurs + Swagger
├── config/                # env (Joi), db (pool, transactions), session, constantes
├── docs/openapi.js        # spécification OpenAPI 3 (source unique)
├── routes/                # index + auth/mail/email/draft/reply.route + webhooks n8n
├── controllers/           # adaptation HTTP
├── services/              # règles métier (auth, import, reply, ai, n8n, summary)
├── models/                # SQL paramétré
├── middlewares/           # auth, CSRF, validation, rate limit, erreurs
├── validation/            # schémas Joi séparés par domaine (auth, mail, email, webhooks, IA)
└── tests/                 # Vitest + Supertest
```

Chaque ressource possède son routeur (`auth.route.js`, `mail.route.js`,
`email.route.js`, `draft.route.js`, `reply.route.js`) monté par
`routes/index.js`. Les webhooks
n8n restent isolés dans `routes/webhooks.js`, montés avant le contrôle CSRF
puisqu'ils s'authentifient par `X-Webhook-Secret`. La spécification OpenAPI est
exposée publiquement sur `/swagger-docs` (Swagger UI) et `/swagger-docs.json`.

Séparation stricte : les contrôleurs ne contiennent pas de SQL, les modèles ne
contiennent pas de règles métier, les services orchestrent les transactions.

## Modèle de données

```
users ─┬── sessions (store serveur)
       └──1:N──► threads ──1:N──► emails ──1:N──► drafts
                    │                              │
                    └────────1:N──► replies ◄──────┘
                                      │
                             idempotency_records
sync_state   sync_runs   audit_events
```

Toutes les tables métier (fils, e-mails, brouillons, réponses, idempotence,
synchronisation) portent un `user_id` : les requêtes sont filtrées par
utilisateur et les clés uniques incluent `user_id`.

| Table | Rôle | Contraintes clés |
| --- | --- | --- |
| `users` | Comptes | e-mail unique insensible à la casse (`normalize_email`) ; `mailbox_address`, secret Gmail chiffré, date de vérification |
| `sessions` | Sessions serveur | gérées par `connect-pg-simple` |
| `threads` | Fils de messages | unique `(user_id, normalize_email(mailbox), gmail_thread_id)` |
| `emails` | Messages | unique `(user_id, normalize_email(mailbox), gmail_message_id)` ; statut, catégorie, priorité, `needs_review` |
| `drafts` | Brouillons IA | ton ∈ `formal/neutral/short` |
| `replies` | Outbox d'envoi | `idempotency_key` unique par utilisateur ; statut ∈ `PENDING/SENDING/SENT/FAILED/UNKNOWN` |
| `idempotency_records` | Journal d'idempotence | unique `(user_id, idempotency_key, operation_type)` + empreinte de requête |
| `sync_state` | État de synchronisation | unique par utilisateur ; curseur historique conservé pour compatibilité |
| `sync_runs` | Historique de synchronisation | statut, compteurs, curseurs |
| `audit_events` | Journal d'audit | métadonnées JSON assainies |

Le jeu de démonstration insère 30 e-mails répartis sur 28 fils, avec
catégories, priorités et statuts variés.

## Flux principaux

### Inscription et connexion

1. `POST /auth/register` exige une adresse Gmail et un mot de passe
   d'application d'au moins 8 caractères (16 pour un vrai compte Google). Le mot de passe d'application est vérifié par
   IMAP + SMTP, puis chiffré en AES-256-GCM. Un doublon d'e-mail renvoie
   `409 EMAIL_ALREADY_EXISTS`.
2. Le compte est créé, importé (25 derniers messages) et la session est ouverte
   immédiatement. Un échec de synchronisation transitoire n'annule pas
   l'inscription.
3. `POST /auth/login` vérifie l'e-mail et le hash bcrypt.
4. La session est créée en base ; le cookie `HttpOnly` est posé.
5. Un jeton CSRF est généré et renvoyé au client ; il sera exigé sur toutes
   les requêtes mutantes. Un compte Gmail existant peut être connecté via
   `POST /mail/connect`.

### Synchronisation Gmail par utilisateur

1. `POST /mail/sync` authentifie l'utilisateur et récupère ses identifiants
   Gmail déchiffrés.
2. Le backend se connecte à `imap.gmail.com:993`, lit les 50 derniers messages
   de `INBOX` et les normalise.
3. L'import est idempotent par `(user_id, gmail_message_id)` ; le curseur et
   l'historique de synchronisation sont propres à l'utilisateur.
4. Les nouveaux e-mails sont classifiés par lots bornés.
5. `POST /mail/connect` permet à un compte Gmail existant d'enregistrer un
   nouveau mot de passe d'application et lance la même synchronisation.

### Import hérité via n8n (GreenMail)

Ce flux reste disponible pour la boîte de démonstration partagée ; les comptes
Gmail utilisateurs utilisent la synchronisation directe décrite ci-dessus.

1. Le workflow 01 est déclenché par IMAP sur `INBOX` (`["UNSEEN"]`).
2. n8n normalise les messages (`Message-ID`, `References`, corps texte) et suit
   le dernier UID pour ne pas relire indéfiniment les mêmes messages.
3. Les messages sont envoyés par lots de 50 à
   `POST /webhooks/sync/import`.
4. Chaque lot est traité dans **une transaction** : `upsert` du fil, puis
   `INSERT ... ON CONFLICT DO NOTHING` sur `(user_id, gmail_message_id)`.
5. `sync_runs` journalise l'exécution ; la déduplication absorbe les relectures.
   L'endpoint `GET /webhooks/sync/state` et le curseur restent disponibles pour
   compatibilité, mais ne pilotent plus le workflow IMAP.

### Classification IA

1. n8n récupère les e-mails non classés (`/webhooks/classification/pending`).
2. Chaque e-mail est envoyé au modèle avec une consigne stricte (contenu =
   données, jamais instructions) et `response_format=json_object`.
3. La sortie est validée (catégorie fermée, priorité 1–3, résumé et action
   bornés). En cas de JSON invalide : **une nouvelle tentative**, puis repli
   `autre` + `needsReview=true`.
4. Les résultats validés sont renvoyés à
   `/webhooks/classification/results`.

### Demande de brouillon

1. `POST /emails/:id/draft` avec un ton.
2. Le service IA produit un texte ; le brouillon est persisté.
3. L'utilisateur peut le modifier et le sauvegarder
   (`PATCH /drafts/:id`).

### Envoi d'une réponse

1. Le frontend envoie `POST /emails/:id/reply` avec un en-tête
   `Idempotency-Key` et `confirm: true`.
2. Dans une transaction, le backend prend un verrou consultatif
   (`pg_advisory_xact_lock`) sur la clé, vérifie l'empreinte de la requête,
   crée `replies` + `idempotency_records`, puis valide.
3. Après commit, il passe la réponse en `SENDING`. Pour un compte Gmail
   connecté, le backend envoie directement via SMTP avec les identifiants de
   l'utilisateur ; sinon il appelle le webhook n8n (mode démo hérité).
4. n8n ou le backend appelle `POST /webhooks/reply/outcome` avec `SENT`,
   `FAILED` ou `UNKNOWN`.
5. `UNKNOWN` exige une réconciliation ; seul `FAILED` est réessayable.

## Garanties de fiabilité

### Absence de doublon d'import

Index unique fonctionnel sur `(user_id, normalize_email(mailbox_address),
gmail_message_id)` + `ON CONFLICT DO NOTHING`. Un même message importé deux
fois (ou dans deux lots qui se chevauchent) n'est enregistré qu'une fois.

### Absence de double envoi

- `idempotency_key` **unique par utilisateur** sur `replies`.
- Verrou consultatif transactionnel : les requêtes concurrentes portant la même
  clé sont sérialisées ; la seconde voit l'enregistrement existant.
- **Empreinte** de la requête : réutiliser une clé avec un contenu différent
  renvoie `409 IDEMPOTENCY_CONFLICT`.
- L'état est persisté **avant** l'appel externe ; un échec ambigu ne peut pas
  être transformé en succès optimiste.

### Machine à états

```
PENDING ──► SENDING ──► SENT
   │           │  └───► FAILED ──► (retry) PENDING
   │           └──────► UNKNOWN ──► réconciliation → SENT/FAILED
   └──────────────────► FAILED / UNKNOWN
```

Transitions autorisées uniquement (`ALLOWED_TRANSITIONS`) ; `SENT` est
terminal. Un callback tardif ou forgé ne peut pas « dé-envoyer » un message.

### Réconciliation

Un balayage toutes les 5 minutes passe les réponses restées en `SENDING`
depuis plus de 15 minutes en `UNKNOWN` (`STALE_SENDING`) : le message a peut-être
été délivré, il n'est donc **jamais** renvoyé automatiquement.

### Gestion des erreurs

- Erreurs normalisées (`AppError`) avec code, message et statut HTTP.
- Webhooks n8n : secret obligatoire, comparaison à temps constant.
- Workflow n8n dédié (Error Trigger) qui journalise les échecs assainis.
- Envoi : timeout réseau → `UNKNOWN`, rejet explicite → `FAILED`.

## Sécurité

| Risque | Mesure |
| --- | --- |
| Vol de session | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production |
| CSRF | Jeton en session + en-tête `X-CSRF-Token`, comparaison à temps constant |
| Force brute | Rate limiting sur `/auth/login` et `/auth/register` |
| Webhook forgé | Secret partagé `X-Webhook-Secret` à temps constant |
| Injection SQL | Requêtes paramétrées uniquement |
| XSS | Rendu Vue échappé par défaut (pas de `v-html`) |
| Fuite de secrets | Variables d'environnement, `.env` ignoré, logs assainis |
| Contenu hostile pour l'IA | Consigne « données, pas instructions », contexte borné |

## Choix techniques

- **PostgreSQL plutôt que SQLite** : transactions concurrentes, verrous
  consultatifs, index fonctionnels et `jsonb`, adaptés à l'idempotence et au
  déploiement multi-conteneurs.
- **SQL pur plutôt qu'un ORM** : contrôle total des `ON CONFLICT`, des verrous
  et des index ; migrations inspectables et réversibles.
- **Sessions serveur plutôt que JWT** : révocation immédiate, aucun jeton
  exposé au JavaScript, CSRF maîtrisé.
- **Découpage n8n en quatre workflows** : isolation des pannes, activation
  indépendante, reprise ciblée et lisibilité opérationnelle.
- **Abstraction du fournisseur IA** : `mock` pour la démo et les tests,
  `groq` pour le réel, sans changer le reste du code.
- **Frontend Vue 3 + Composition API** : réactivité simple, bundle léger,
  composants locaux sans dépendance à un design system externe.
