# Rapport — Assistant de boîte mail

## 1. Objet

Application web de consultation et de réponse aux e-mails, avec synchronisation
Gmail par utilisateur, classification par IA, brouillons contrôlés par
l'utilisateur et envoi fiable. Chaque compte connecte sa propre boîte Gmail via
un mot de passe d'application ; les données sont isolées par utilisateur. Le
dépôt contient le site, le backend, ses tests, les exports des workflows n8n,
le `docker-compose.yml`, le `.env.example` et le script de démonstration.

## 2. Installation depuis un dépôt vierge

Prérequis : Docker et Docker Compose (ou Node.js 22+ et PostgreSQL 16).

```bash
git clone <url-du-depot>
cd Assistant-de-bo-te-mail

cp .env.example .env
node -e "const c=require('crypto'),fs=require('fs');let s=fs.readFileSync('.env','utf8');
for (const k of ['change-me-session-secret-please','change-me-webhook-secret-please','change-me-n8n-encryption-key'])
  s=s.replace(k,c.randomBytes(32).toString('hex'));
fs.writeFileSync('.env',s)"

docker compose up --build -d
docker compose exec backend node database/seed.js
```

- Application : http://localhost:5173
- Connexion : `demo@example.com` / `demo1234`
- Inscription : page `/register` (adresse Gmail + mot de passe d'application à 16 caractères)
- API : http://localhost:4000/api/v1
- Documentation interactive : http://localhost:4000/swagger-docs
- Spécification OpenAPI 3 : http://localhost:4000/swagger-docs.json
- n8n : http://localhost:5678

Les migrations sont appliquées automatiquement au démarrage du backend
(`ENTRYPOINT` du Dockerfile). Le seed est idempotent et peut être relancé.

Pour un autre compte :

```bash
docker compose exec backend node scripts/create-user.js \
  --email vous@exemple.fr --password 'mot-de-passe-solide' --name 'Votre Nom'
```

Sans Docker, voir la section « Développement local » du `README.md`.

### Développement Fedora avec rechargement à chaud

Le fichier `fedora.compose.yaml` monte les sources avec l'option SELinux `:z`,
masque les `node_modules` de l'hôte par des volumes nommés et lance le backend
avec `node --watch` et le frontend avec Vite (HMR) :

```bash
docker compose -f fedora.compose.yaml up --build
```

## 3. Architecture

```
Navigateur (Vue 3)
      │  HTTP, cookie HttpOnly + CSRF
      ▼
Backend Express ────── SQL ──────► PostgreSQL 16
      │  ▲
      │  │ webhooks X-Webhook-Secret
      ▼  │
      ├── IMAP/SMTP ──► Gmail du compte connecté
      └── n8n ──► GreenMail local / fournisseur IA
```

- Le navigateur ne contacte **jamais** n8n.
- Le backend est l'unique porte d'entrée : auth, validation, idempotence,
  persistance, machine à états d'envoi.
- n8n exécute les intégrations externes et rappelle le backend.

### Modèle de données

```
users ── sessions
threads ──1:N──► emails ──1:N──► drafts
   │                              │
   └────────1:N──► replies ◄──────┘
                     │
              idempotency_records

sync_state   sync_runs   audit_events
```

Contraintes déterminantes :

- Toutes les tables métier portent `user_id` ; les requêtes sont filtrées par
  utilisateur.
- `emails` : index unique `(user_id, normalize_email(mailbox), gmail_message_id)`.
- `replies` : `idempotency_key` unique par utilisateur + journal
  `idempotency_records` (utilisateur + clé + type d'opération + empreinte).
- `threads` : unique `(user_id, normalize_email(mailbox), gmail_thread_id)`.
- `sync_state` : état de synchronisation par utilisateur (curseur historique
  conservé pour compatibilité).
- `users` : `mailbox_address`, mot de passe d'application Gmail chiffré
  (AES-256-GCM) et date de vérification.

Le schéma complet et les flux sont détaillés dans
[`architecture.md`](architecture.md) ; les routes dans [`api.md`](api.md).

## 4. Choix techniques et raisons

| Choix | Raison |
| --- | --- |
| PostgreSQL | Transactions concurrentes, verrous consultatifs, index fonctionnels et `jsonb` : nécessaires à l'idempotence et à la déduplication. |
| SQL pur + `pg` (sans ORM) | Contrôle explicite des `ON CONFLICT`, des verrous et des index ; migrations lisibles. |
| Sessions serveur (`connect-pg-simple`) | Révocation immédiate, aucun jeton lisible par le JavaScript, CSRF maîtrisé. |
| Express + Joi | Validation centralisée des entrées HTTP **et** des sorties IA ; messages d'erreur normalisés. |
| Vue 3 + Composition API | Interface réactive et légère, composants locaux, build rapide. |
| Quatre workflows n8n | Isolation des pannes, activation indépendante, reprise ciblée, lisibilité. |
| Abstraction IA `mock` / `groq` | Démonstration et tests hors ligne, passage au réel sans changer le code métier. |
| Outbox d'envoi + états | Une transaction ne peut pas être atomique avec un envoi SMTP : `UNKNOWN` est un état de premier ordre. |

### Fiabilité de l'envoi

1. Clé d'idempotence obligatoire (en-tête `Idempotency-Key`).
2. Verrou consultatif transactionnel `pg_advisory_xact_lock(hashtext(clé))` :
   les requêtes concurrentes sont sérialisées.
3. Empreinte SHA-256 de la requête : réutiliser la clé avec un contenu
   différent renvoie `409`.
4. États `PENDING → SENDING → SENT | FAILED | UNKNOWN`, transitions contrôlées.
5. Seul `FAILED` est réessayable ; `UNKNOWN` exige une réconciliation.
6. Balayage périodique : un `SENDING` de plus de 15 minutes devient `UNKNOWN`.

### Synchronisation Gmail par utilisateur

- À l'inscription ou via `POST /mail/connect`, le backend vérifie le mot de
  passe d'application par IMAP + SMTP, le chiffre, puis importe les 25 derniers
  messages.
- `POST /mail/sync` lit les 50 derniers messages de `INBOX` via
  `imap.gmail.com:993`, les normalise (`Message-ID`, `References`, corps texte)
  et les importe de façon idempotente par utilisateur.
- Déduplication sur `(user_id, gmail_message_id)` : une relecture ne crée pas de
  doublon ; `sync_runs` et `sync_state` sont propres à l'utilisateur.
- Le flux n8n historique (workflow 01, `POST /webhooks/sync/import`) reste
  disponible pour la boîte GreenMail de démonstration.

## 5. Difficultés rencontrées et solutions

| Difficulté | Solution |
| --- | --- |
| Double clic / requêtes concurrentes créant deux envois | Verrou consultatif + contrainte unique + empreinte de requête. |
| Réutilisation d'une clé avec un autre contenu | `409 IDEMPOTENCY_CONFLICT` grâce à l'empreinte. |
| Panne entre `SENDING` et le retour du workflow | État `UNKNOWN` + réconciliation, jamais de renvoi aveugle. |
| Relecture IMAP des mêmes messages | Déduplication `(user_id, gmail_message_id)` + suivi du dernier UID. |
| Sortie IA non JSON ou hors schéma | Validation Joi, une nouvelle tentative, puis `autre` + `needsReview`. |
| Quota IA (HTTP 429) | Trois tentatives avec pause de 20 s + pause de 2 s entre e-mails. |
| Webhook forgé | Secret partagé comparé à temps constant. |
| Envoi ambigu (timeout) | Classé `UNKNOWN` (le message a peut-être été délivré). |
| Ports hôte Docker indisponibles sur la machine de vérification | Vérification initiale avec un PostgreSQL Podman local (port 5434) et le proxy Vite ; le stack Compose tourne désormais sur les ports 3000/5000/5433/5678. |
| Résolution DNS externe des conteneurs | Build des images avec `--add-host` pour npm ; correctif permanent du DNS Docker documenté. |

## 6. Résultats mesurés

Mesures effectuées sur le jeu de démonstration (30 e-mails), PostgreSQL local,
backend Node 22.

| Mesure | Résultat | Conditions |
| --- | --- | --- |
| Import de 30 e-mails (service `importBatch`) | **124 ms** (30 insérés, 0 ignoré) | Une transaction, 30 messages |
| Ré-import des mêmes 30 e-mails | **95 ms** (0 inséré, 30 ignorés) | Déduplication confirmée : 30 lignes au total |
| Sorties IA valides du premier coup | **30/30 = 100 %** | Provider `mock` déterministe, 7 ms |
| Tests backend | **69 réussis / 69** | Vitest + Supertest, base isolée |
| Tests frontend | **8 réussis / 8** | Vitest + Vue Test Utils |
| Build frontend | **succès** | Vite, ~1,1 s |
| Synchronisation IMAP locale | **succès** | GreenMail, workflow 01, e-mail importé |
| Envoi SMTP local | **SENT** | GreenMail, workflow 03, `providerMessageId` retourné |

**Portée honnête de ces mesures :**

- La durée mesurée couvre l'**ingestion backend** des 30 e-mails, pas le temps
  réseau d'une boîte réelle.
- Le taux de 100 % porte sur le provider `mock`, qui produit toujours un JSON
  conforme. Le taux du modèle réel (Groq) n'a pas été mesuré faute de clé ;
  le pipeline de validation et le repli ont en revanche été testés.
- Les workflows n8n ont été exécutés contre la **boîte locale GreenMail** :
  synchronisation IMAP (e-mail importé) et envoi SMTP (statut `SENT`,
  `providerMessageId` retourné) vérifiés. Un compte Gmail réel n'a pas été
  testé.

## 7. Tests automatisés

Couverture :

- import du même e-mail deux fois ;
- envoi de la même réponse deux fois, y compris en concurrence ;
- conflit de clé d'idempotence ;
- webhook sans secret et avec secret erroné ;
- sortie IA valide et sortie invalide (+ repli) ;
- machine à états : transition illégale, réconciliation `SENDING → UNKNOWN`,
  synchronisation du statut de l'e-mail ;
- authentification, CSRF, filtres et pagination de l'API ;
- inscription : vérification Gmail simulée, création + session immédiate,
  doublon insensible à la casse, validation de l'e-mail, du mot de passe et du
  mot de passe d'application ;
- isolation par utilisateur : listes, fils, résumé, réponses et clés
  d'idempotence ;
- connexion Gmail d'un compte existant et refus d'un compte non Gmail ;
- chiffrement/déchiffrement AES-256-GCM des identifiants Gmail.

```bash
cd apps/backend && npm test
cd apps/frontend && npm test
```

## 8. Sécurité

- bcrypt pour les mots de passe ; secrets uniquement en variables
  d'environnement.
- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production.
- CSRF par jeton de session comparé à temps constant.
- Webhooks n8n authentifiés par secret comparé à temps constant.
- Helmet, CORS restreint, limite de corps 1 Mo, rate limiting.
- Requêtes SQL paramétrées ; logs sans secret ni cookie.

## 9. Limites et améliorations

- **Inscription ouverte** : rate-limitée, sans code d'invitation ; elle exige
  une adresse Gmail et un mot de passe d'application vérifié. Les données sont
  isolées par utilisateur, avec une seule boîte par compte.
- **Gmail réel / IA réelle non exécutés** dans cet environnement : le parcours
  Gmail est couvert par des tests avec authentification simulée, mais la recette
  finale exige un mot de passe d'application réel et une clé Groq.
- **Frontend en mode développement** dans Compose ; servir le build statique
  derrière un reverse proxy en production.
- **Signature HMAC du corps** des webhooks en plus du secret partagé.
- **Temps réel** (SSE/WebSocket) pour rafraîchir la liste sans rechargement.
- **Masquage** des téléphones/IBAN avant envoi à l'IA.
- **Réponse automatique** encadrée pour une seule catégorie, avec garde-fou.
- **Réconciliation semi-automatique** : proposer à l'opérateur de vérifier le
  fil de la boîte avant de résoudre un `UNKNOWN`.
- **Multi-boîtes** : un seul compte Gmail connecté par utilisateur ; le modèle
  `mailbox_address` pourra être étendu à plusieurs boîtes.
- **Génération de client** à partir de la spécification OpenAPI (`/swagger-docs.json`).
