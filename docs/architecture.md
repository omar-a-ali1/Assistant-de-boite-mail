# Architecture

## Vue d'ensemble

```
Navigateur ──HTTP──► Backend Express ──SQL──► PostgreSQL
                          │  ▲
                          ▼  │ webhooks (X-Webhook-Secret)
                         n8n ─┴──► Gmail / fournisseur IA
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
| n8n | Intégrations Gmail et IA | Workflows JSON, webhooks |
| Gmail / IA | Fournisseurs externes | OAuth2 Gmail, API compatible OpenAI |

### Frontend

- `views/` : `LoginView`, `TodayView`, `InboxView`, `ThreadView`.
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
├── routes/                # index + auth/email/draft/reply.route + webhooks n8n
├── controllers/           # adaptation HTTP
├── services/              # règles métier (auth, import, reply, ai, n8n, summary)
├── models/                # SQL paramétré
├── middlewares/           # auth, CSRF, validation, rate limit, erreurs
├── validation/            # schémas Joi (HTTP + IA)
└── tests/                 # Vitest + Supertest
```

Chaque ressource possède son routeur (`auth.route.js`, `email.route.js`,
`draft.route.js`, `reply.route.js`) monté par `routes/index.js`. Les webhooks
n8n restent isolés dans `routes/webhooks.js`, montés avant le contrôle CSRF
puisqu'ils s'authentifient par `X-Webhook-Secret`. La spécification OpenAPI est
exposée publiquement sur `/api/docs` (Swagger UI) et `/api/docs.json`.

Séparation stricte : les contrôleurs ne contiennent pas de SQL, les modèles ne
contiennent pas de règles métier, les services orchestrent les transactions.

## Modèle de données

```
users ─┐
       └── sessions (store serveur)

threads ──1:N──► emails ──1:N──► drafts
   │                              │
   └────────1:N──► replies ◄──────┘
                     │
              idempotency_records
sync_state   sync_runs   audit_events
```

| Table | Rôle | Contraintes clés |
| --- | --- | --- |
| `users` | Comptes | e-mail unique insensible à la casse (`normalize_email`) |
| `sessions` | Sessions serveur | gérées par `connect-pg-simple` |
| `threads` | Fils Gmail | unique `(normalize_email(mailbox), gmail_thread_id)` |
| `emails` | Messages | unique `(normalize_email(mailbox), gmail_message_id)` ; statut, catégorie, priorité, `needs_review` |
| `drafts` | Brouillons IA | ton ∈ `formal/neutral/short` |
| `replies` | Outbox d'envoi | `idempotency_key` unique ; statut ∈ `PENDING/SENDING/SENT/FAILED/UNKNOWN` |
| `idempotency_records` | Journal d'idempotence | unique `(idempotency_key, operation_type)` + empreinte de requête |
| `sync_state` | Curseur durable | unique par boîte |
| `sync_runs` | Historique de synchronisation | statut, compteurs, curseurs |
| `audit_events` | Journal d'audit | métadonnées JSON assainies |

Le jeu de démonstration insère 30 e-mails répartis sur 28 fils, avec
catégories, priorités et statuts variés.

## Flux principaux

### Connexion

1. `POST /auth/login` vérifie l'e-mail et le hash bcrypt.
2. La session est créée en base ; le cookie `HttpOnly` est posé.
3. Un jeton CSRF est généré et renvoyé au client ; il sera exigé sur toutes
   les requêtes mutantes.

### Import (n8n → backend)

1. n8n lit le curseur via `GET /webhooks/sync/state`.
2. Gmail est interrogé avec `after:<curseur>` et pagination automatique.
3. Les messages sont normalisés puis envoyés par lots de 50 à
   `POST /webhooks/sync/import`.
4. Chaque lot est traité dans **une transaction** : `upsert` du fil, puis
   `INSERT ... ON CONFLICT DO NOTHING` sur `(mailbox, gmail_message_id)`.
5. Le curseur n'avance qu'après le **dernier** lot importé.

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
3. Après commit, il passe la réponse en `SENDING` et appelle le webhook n8n.
4. n8n envoie via Gmail puis rappelle
   `POST /webhooks/reply/outcome` avec `SENT`, `FAILED` ou `UNKNOWN`.
5. `UNKNOWN` exige une réconciliation ; seul `FAILED` est réessayable.

## Garanties de fiabilité

### Absence de doublon d'import

Index unique fonctionnel sur `(normalize_email(mailbox_address),
gmail_message_id)` + `ON CONFLICT DO NOTHING`. Un même message importé deux
fois (ou dans deux lots qui se chevauchent) n'est enregistré qu'une fois.

### Absence de double envoi

- `idempotency_key` **unique** sur `replies`.
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
| Force brute | Rate limiting sur `/auth/login` |
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
