# Assistant de boîte mail — Web, API & automatisation n8n

Application fiable de tri et de réponse aux e-mails : liste filtrable, fils de
discussion, résumé du jour, brouillons rédigés par IA (toujours validés par
l'utilisateur) et envoi idempotent via n8n.

- **Frontend** : Vue 3, Vite, Pinia, Vue Router, Tailwind CSS v4, composants
  de type shadcn-vue, icônes Lucide.
- **Backend** : Node.js / Express (CommonJS), PostgreSQL, `pg` + SQL pur, Joi,
  sessions serveur (`connect-pg-simple`), bcrypt, Helmet, rate limiting.
- **Automatisation** : 4 workflows n8n (synchronisation, classification IA,
  envoi, gestion d'erreurs).
- **Base** : PostgreSQL 16, migrations versionnées, jeu de démonstration de
  30 e-mails.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Démarrage rapide (Docker)](#démarrage-rapide-docker)
- [Développement local](#développement-local)
- [Tests](#tests)
- [Workflows n8n](#workflows-n8n)
- [Sécurité](#sécurité)
- [Structure du dépôt](#structure-du-dépôt)
- [Limites connues](#limites-connues)

## Fonctionnalités

- Authentification par session (cookie `HttpOnly`, `SameSite=Lax`, `Secure` en
  production), aucune donnée accessible sans connexion.
- Liste des e-mails paginée avec filtres **combinables** : catégorie,
  priorité, statut, expéditeur, période, recherche plein texte (objet +
  contenu).
- Vue détail : fil de discussion complet, messages dans l'ordre, catégorie,
  priorité, résumé et action attendue.
- Bloc **Aujourd'hui** : statistiques du jour, répartition par catégorie et
  priorités, 5 e-mails prioritaires avec la **raison** de chaque choix.
- Brouillon IA modifiable avec **ton** au choix (`formel`, `neutre`, `court`),
  sauvegarde, puis envoi uniquement après **confirmation explicite**.
- Statut d'envoi visible : en attente, en cours, envoyé, échec (bouton
  « Réessayer »), incertain (réconciliation requise).
- Interface responsive desktop/mobile.

## Architecture

```
┌──────────────┐   HTTP + cookie de session + CSRF   ┌──────────────────┐
│ Navigateur   │ ──────────────────────────────────► │ Backend Express  │
│ Vue 3        │ ◄────────────────────────────────── │ (seule porte     │
└──────────────┘            JSON                     │  vers n8n)       │
                                                      └────────┬─────────┘
                                                               │ SQL (pg)
                                                      ┌────────▼─────────┐
                                                      │ PostgreSQL 16    │
                                                      │ users, sessions, │
                                                      │ threads, emails, │
                                                      │ drafts, replies, │
                                                      │ sync_*, audit    │
                                                      └────────▲─────────┘
                                                               │ webhooks signés
                                                      ┌────────┴─────────┐
                                                      │ n8n              │
                                                      │ 01 sync          │
                                                      │ 02 classification│
                                                      │ 03 envoi         │
                                                      │ 04 erreurs       │
                                                      └────────┬─────────┘
                                                               │ OAuth2 / API
                                                      ┌────────▼─────────┐
                                                      │ Gmail + IA       │
                                                      └──────────────────┘
```

Règles structurantes :

- Le **navigateur ne parle jamais à n8n** ; seul le backend déclenche l'envoi.
- Tout appel n8n → backend porte `X-Webhook-Secret` (comparaison à temps
  constant).
- Les réponses suivent une machine à états durable
  `PENDING → SENDING → SENT | FAILED | UNKNOWN`. Un résultat ambigu devient
  `UNKNOWN` et **bloque tout renvoi automatique**.

Détails : [`docs/architecture.md`](docs/architecture.md).

## Démarrage rapide (Docker)

Prérequis : Docker + Docker Compose.

```bash
# 1. Configuration
cp .env.example .env
node -e "const c=require('crypto'),fs=require('fs');let s=fs.readFileSync('.env','utf8');
for (const k of ['change-me-session-secret-please','change-me-webhook-secret-please','change-me-n8n-encryption-key'])
  s=s.replace(k,c.randomBytes(32).toString('hex'));
fs.writeFileSync('.env',s)"

# 2. Démarrage (migrations exécutées automatiquement au démarrage du backend)
docker compose up --build -d

# 3. Jeu de démonstration (30 e-mails, 28 fils)
docker compose exec backend node database/seed.js
```

- Application : http://localhost:5173
- API : http://localhost:4000/api/v1
- Documentation interactive (Swagger UI) : http://localhost:4000/api/docs
- Spécification brute (OpenAPI 3) : http://localhost:4000/api/docs.json
- n8n : http://localhost:5678

**Compte de démonstration** : `demo@example.com` / `demo1234`

> Si le port 5432 est déjà utilisé, mettez `POSTGRES_PORT=5433` dans `.env`.

### Développement avec rechargement à chaud (Fedora)

`fedora.compose.yaml` remplace le build de production par des montages de
sources avec rechargement automatique. Les montages utilisent l'option `:z`
pour que SELinux puisse les étiqueter, et des volumes nommés masquent les
`node_modules` installés sur l'hôte.

```bash
docker compose -f fedora.compose.yaml up --build
```

- Backend : `node --watch` (migrations au démarrage, redémarrage à chaque
  modification de `apps/backend`).
- Frontend : serveur Vite avec HMR sur `apps/frontend`.
- Les données PostgreSQL et n8n sont conservées dans des volumes dédiés.

Avec ce fichier, préfixez les commandes d'administration par
`docker compose -f fedora.compose.yaml exec …`.

Pour créer un autre utilisateur :

```bash
docker compose exec backend node scripts/create-user.js \
  --email vous@exemple.fr --password 'mot-de-passe-solide' --name 'Votre Nom'
```

## Développement local

Prérequis : Node.js 22+, PostgreSQL 16 (ou uniquement le conteneur Postgres).

```bash
# Base seule
docker compose up -d postgres

# Backend
cd apps/backend
npm ci
export DATABASE_URL=postgresql://usts:usts_dev_password@localhost:5432/usts_email
npm run migrate
npm run seed
npm run create-user -- --email demo@example.com --password demo1234 --name "Compte de démonstration"
npm run dev            # http://localhost:4000

# Frontend (autre terminal)
cd apps/frontend
npm ci
npm run dev            # http://localhost:5173
```

Le serveur Vite proxifie `/api` vers `VITE_API_PROXY_TARGET`
(par défaut `http://localhost:4000`).

## Tests

```bash
# Backend (base de test isolée : usts_email_test)
cd apps/backend
DATABASE_URL_TEST=postgresql://usts:usts_dev_password@localhost:5432/usts_email_test npm test

# Frontend
cd apps/frontend
npm test
```

Couverture backend : import idempotent, concurrence et conflit d'idempotence,
machine à états d'envoi, réconciliation `SENDING → UNKNOWN`, secret de webhook
(absent/erroné), validation de sortie IA, authentification/CSRF, API.
**51 tests backend + 3 tests frontend**.

## Workflows n8n

Les quatre workflows sont dans [`n8n/workflows/`](n8n/workflows/) et sont
**inactifs par défaut** (aucun identifiant en dur). Voir
[`n8n/README.md`](n8n/README.md) pour l'import, les identifiants Gmail, les
variables d'environnement et l'ordre d'activation.

En **mode démonstration** (sans Gmail), laissez-les inactifs : l'application
reste entièrement utilisable et n'affiche jamais un envoi comme réussi
(statut `NO_WORKFLOW` explicite).

## Sécurité

- Mots de passe hachés avec bcrypt ; secrets uniquement en variables
  d'environnement (`.env` ignoré par Git).
- Sessions serveur en base, cookie `HttpOnly` ; jeton CSRF exigé sur toute
  requête mutante (`X-CSRF-Token`).
- Webhooks protégés par `X-Webhook-Secret` comparé à temps constant.
- Helmet, CORS restreint en production, limite de corps 1 Mo, rate limiting
  sur la connexion et les webhooks.
- Aucune donnée sensible (mot de passe, secret, cookie) dans les logs.
- Requêtes SQL entièrement paramétrées.

## Structure du dépôt

```
.
├── apps
│   ├── backend
│   │   ├── database          # migrations SQL + runner + seed
│   │   ├── scripts           # création d'utilisateur
│   │   └── src               # app, config, routes, services, models, tests
│   └── frontend
│       └── src               # views, components/ui, stores, services
├── docs                      # architecture, API, rapport
├── infra/postgres/init.sql   # base n8n
├── n8n
│   ├── workflows             # exports JSON
│   └── README.md
├── docker-compose.yaml
├── fedora.compose.yaml       # dev Fedora : bind mounts + hot reload
└── .env.example
```

## Limites connues

- L'envoi réel et la synchronisation Gmail nécessitent des identifiants OAuth2
  Gmail et une clé IA ; sans eux, l'application fonctionne en mode
  démonstration.
- La classification IA par défaut (`AI_PROVIDER=mock`) est déterministe et
  hors ligne ; `AI_PROVIDER=groq` active un modèle réel.
- Le conteneur frontend lance le serveur de développement Vite ; pour la
  production, servir `npm run build` derrière un reverse proxy.
- La signature HMAC des webhooks (en plus du secret partagé) et le temps réel
  (SSE/WebSocket) sont des améliorations possibles, non implémentées.
