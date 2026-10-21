# Documentation de l'API

Base URL : `http://localhost:4000/api/v1`

## Documentation interactive (Swagger)

La spécification OpenAPI 3 est servie par le backend :

- Swagger UI : http://localhost:4000/swagger-docs
- JSON brut : http://localhost:4000/swagger-docs.json

Elle couvre l'authentification, la boîte Gmail, les e-mails, les brouillons,
les réponses et les webhooks n8n, avec les schémas de requête/réponse et les
exigences de sécurité (cookie de session, CSRF, `Idempotency-Key`,
`X-Webhook-Secret`). Les routes sont découpées par ressource dans
`apps/backend/src/routes/{auth,mail,email,draft,reply}.route.js`.

## Conventions

- Succès : `{ "data": ... }` (les listes ajoutent un objet `meta`).
- Erreur : `{ "error": { "code": "...", "message": "...", "details": [] } }`.
- Authentification : cookie de session `usts_sid` (posé par `/auth/login`).
- Requêtes mutantes (`POST`, `PATCH`, `DELETE`) : en-tête `X-CSRF-Token`
  obligatoire (sauf `/auth/login` et `/auth/register`).
- Réponses d'envoi : en-tête `Idempotency-Key` obligatoire.

### Codes d'erreur usuels

| Code HTTP | `code` | Sens |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Corps/paramètres invalides |
| 400 | `GMAIL_ACCOUNT_REQUIRED` | L'adresse du compte n'est pas Gmail |
| 400 | `GMAIL_APP_PASSWORD_INVALID` | Mot de passe d'application ≠ 16 caractères |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | En-tête d'idempotence absent ou invalide |
| 401 | `UNAUTHORIZED` | Session absente ou expirée |
| 403 | `CSRF` | Jeton CSRF absent ou invalide |
| 404 | `NOT_FOUND` | Ressource inexistante |
| 409 | `IDEMPOTENCY_CONFLICT` | Clé réutilisée avec un contenu différent |
| 409 | `INVALID_TRANSITION` | Transition d'état d'envoi interdite |
| 409 | `RECONCILIATION_REQUIRED` | Envoi `UNKNOWN`, à réconcilier |
| 409 | `NOT_RETRYABLE` | Réponse non réessayable |
| 409 | `GMAIL_NOT_CONNECTED` | Aucune boîte Gmail connectée à ce compte |
| 422 | `UNPROCESSABLE_ENTITY` | Brouillon d'un autre fil |
| 422 | `GMAIL_AUTH_FAILED` | Gmail refuse l'adresse ou le mot de passe d'application |
| 429 | `RATE_LIMITED` | Trop de tentatives |
| 503 | `NOT_READY` | Base indisponible |

## Santé

### `GET /health`

```json
{ "data": { "status": "ok", "time": "2026-10-21T10:00:00.000Z" } }
```

### `GET /health/ready`

Vérifie la connexion PostgreSQL. `200` si prêt, `503` sinon.

## Authentification

### `POST /auth/register`

Crée un compte Gmail, vérifie le mot de passe d'application, importe les
derniers messages et ouvre immédiatement une session. L'adresse doit être
`@gmail.com` ou `@googlemail.com`.

```json
{
  "email": "vous@gmail.com",
  "password": "mot-de-passe-solide",
  "displayName": "Votre Nom",
  "gmailAppPassword": "abcd efgh ijkl mnop"
}
```

Le mot de passe d'application contient exactement 16 caractères alphanumériques
(les espaces sont ignorés). Il est vérifié par IMAP et SMTP puis stocké chiffré
(AES-256-GCM).

`201`

```json
{
  "data": {
    "user": {
      "id": "…",
      "email": "vous@gmail.com",
      "displayName": "Votre Nom",
      "mailboxAddress": "vous@gmail.com",
      "gmailConnected": true
    },
    "csrfToken": "…",
    "initialSync": { "imported": 12, "skipped": 0, "classified": 12 }
  }
}
```

Erreurs : `400 VALIDATION_ERROR`, `400 GMAIL_ACCOUNT_REQUIRED`,
`400 GMAIL_APP_PASSWORD_INVALID`, `409 EMAIL_ALREADY_EXISTS`,
`422 GMAIL_AUTH_FAILED`, `429 RATE_LIMITED`.

### `POST /auth/login`

```json
{ "email": "demo@example.com", "password": "demo1234" }
```

`200`

```json
{
  "data": {
    "user": { "id": "…", "email": "demo@example.com", "displayName": "Compte de démonstration" },
    "csrfToken": "…"
  }
}
```

### `POST /auth/logout`

Détruit la session. Requiert le jeton CSRF. `{ "data": { "ok": true } }`.

### `GET /auth/me`

Retourne l'utilisateur courant et le jeton CSRF. `401` si non authentifié.

## Boîte Gmail

Toutes les routes exigent une session. Chaque utilisateur ne voit et ne
synchronise que sa propre boîte.

### `GET /mail/status`

```json
{
  "data": {
    "mailbox": "vous@gmail.com",
    "gmailConnected": true,
    "verifiedAt": "2026-10-21T10:00:00.000Z",
    "lastSyncAt": "2026-10-21T10:05:00.000Z"
  }
}
```

### `POST /mail/connect`

Connecte Gmail à un compte Gmail existant qui n'a pas encore de mot de passe
d'application (par exemple un compte créé avant cette fonctionnalité). Le
mot de passe est vérifié, chiffré, puis une première synchronisation de 25
messages est lancée. Requiert le jeton CSRF.

```json
{ "gmailAppPassword": "abcd efgh ijkl mnop" }
```

```json
{
  "data": {
    "mailbox": "vous@gmail.com",
    "gmailConnected": true,
    "verifiedAt": "2026-10-21T10:00:00.000Z",
    "initialSync": { "imported": 12, "skipped": 0, "classified": 12 }
  }
}
```

Si la première synchronisation échoue, la connexion reste valide et
`initialSync` contient `error`.

### `POST /mail/sync`

Synchronise les 50 derniers messages Gmail (`GMAIL_SYNC_LIMIT`) et classifie
les nouveaux messages. Requiert le jeton CSRF. `409 GMAIL_NOT_CONNECTED` si
aucune boîte Gmail n'est connectée ; `409 GMAIL_CREDENTIALS_UNREADABLE` si le
secret stocké ne peut plus être déchiffré ; `422 GMAIL_SYNC_FAILED` en cas
d'échec IMAP.

```json
{ "data": { "imported": 3, "skipped": 47, "classified": 3 } }
```

## E-mails

### `GET /emails`

Paramètres (tous optionnels) :

| Paramètre | Type | Détail |
| --- | --- | --- |
| `page` | entier ≥ 1 | défaut 1 |
| `limit` | entier 1–100 | défaut 20 |
| `category` | `client`, `facture`, `rendez-vous`, `newsletter`, `spam probable`, `autre` | |
| `priority` | 1–3 | |
| `status` | `TO_PROCESS`, `DRAFT_READY`, `REPLIED`, `IGNORED` | |
| `sender` | texte ≤ 254 | recherche partielle |
| `startDate`, `endDate` | ISO 8601 | période |
| `search` | texte ≤ 200 | objet + contenu |
| `sortBy` | `received_at`, `subject`, `sender`, `priority`, `category`, `status` | |
| `sortOrder` | `asc`, `desc` | défaut `desc` |

```json
{
  "data": [
    {
      "id": "…",
      "threadId": "…",
      "sender": "client@exemple.fr",
      "recipients": ["demo@example.com"],
      "subject": "Demande de devis",
      "receivedAt": "2026-10-21T08:30:00.000Z",
      "category": "client",
      "priority": 3,
      "summary": "Le client demande un devis.",
      "expectedAction": "Envoyer un devis.",
      "needsReview": false,
      "status": "TO_PROCESS",
      "preview": "Bonjour, …"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 30, "totalPages": 2 }
}
```

Les filtres sont combinables (ET logique).

### `GET /threads/{id}`

Retourne le fil complet, les messages dans l'ordre, les brouillons et les
réponses.

```json
{
  "data": {
    "thread": { "id": "…", "subject": "…", "gmailThreadId": "…", "latestMessageAt": "…" },
    "messages": [
      {
        "id": "…",
        "sender": "…",
        "recipients": ["…"],
        "subject": "…",
        "body": "…",
        "receivedAt": "…",
        "category": "client",
        "priority": 3,
        "summary": "…",
        "expectedAction": "…",
        "needsReview": false,
        "status": "TO_PROCESS"
      }
    ],
    "drafts": [
      { "id": "…", "body": "…", "tone": "formal", "editedByUser": false, "createdAt": "…", "updatedAt": "…" }
    ],
    "replies": [
      {
        "id": "…",
        "status": "PENDING",
        "body": "…",
        "providerMessageId": null,
        "errorCode": "NO_WORKFLOW",
        "errorMessage": "…",
        "attemptCount": 1,
        "sentAt": null,
        "createdAt": "…"
      }
    ]
  }
}
```

### `GET /summary?date=YYYY-MM-DD`

```json
{
  "data": {
    "date": "2026-10-21",
    "total": 6,
    "byCategory": { "client": 2, "facture": 1, "rendez-vous": 1, "newsletter": 1, "spam probable": 1, "autre": 0 },
    "byStatus": { "TO_PROCESS": 3, "DRAFT_READY": 1, "REPLIED": 1, "IGNORED": 1 },
    "priority": { "high": 3, "medium": 1, "low": 2 },
    "needsReview": 0,
    "topEmails": [
      {
        "id": "…",
        "threadId": "…",
        "sender": "…",
        "subject": "…",
        "receivedAt": "…",
        "category": "client",
        "priority": 3,
        "status": "TO_PROCESS",
        "reason": "Sélectionné : priorité haute, en attente de traitement, catégorie client."
      }
    ]
  }
}
```

## Brouillons

### `POST /emails/{id}/draft`

```json
{ "tone": "formal" }
```

`tone` ∈ `formal`, `neutral`, `short`. `201`

```json
{
  "data": {
    "id": "…",
    "threadId": "…",
    "originalEmailId": "…",
    "body": "Bonjour, …",
    "tone": "formal",
    "aiGenerated": true,
    "createdAt": "…"
  }
}
```

Aucun envoi n'est déclenché par cette route.

### `PATCH /drafts/{id}`

```json
{ "body": "Texte modifié.", "tone": "neutral" }
```

`200` avec le brouillon mis à jour.

## Réponses

### `POST /emails/{id}/reply`

En-têtes :

```
X-CSRF-Token: <jeton>
Idempotency-Key: <uuid ou chaîne 8–200 caractères>
```

Corps (soit `body`, soit `draftId`) :

```json
{
  "body": "Bonjour, je vous confirme la prise en charge.",
  "confirm": true,
  "draftId": "…"
}
```

`confirm: true` est obligatoire. `202` à la création, `200` si la clé a déjà
été utilisée avec le **même** contenu.

```json
{
  "data": {
    "id": "…",
    "status": "PENDING",
    "idempotencyKey": "…",
    "attemptCount": 1,
    "reused": false,
    "createdAt": "…"
  }
}
```

Conflit (clé réutilisée avec un autre contenu) : `409 IDEMPOTENCY_CONFLICT`.

### `GET /replies/{id}`

```json
{
  "data": {
    "id": "…",
    "status": "FAILED",
    "providerMessageId": null,
    "errorCode": "GMAIL_SEND_FAILED",
    "errorMessage": "…",
    "attemptCount": 1,
    "retryable": true,
    "needsReconciliation": false,
    "sentAt": null,
    "createdAt": "…",
    "updatedAt": "…"
  }
}
```

Statuts : `PENDING`, `SENDING`, `SENT`, `FAILED`, `UNKNOWN`.
`retryable` est vrai uniquement pour `FAILED` ; `needsReconciliation` pour
`UNKNOWN`.

### `POST /replies/{id}/retry`

Réessaie uniquement une réponse `FAILED`. `409` sinon
(`RECONCILIATION_REQUIRED`, `ALREADY_IN_PROGRESS`, `ALREADY_SENT`,
`NOT_RETRYABLE`).

## Webhooks n8n

Toutes les routes ci-dessous exigent l'en-tête `X-Webhook-Secret`. Secret
absent ou erroné → `401`.

> Le workflow IMAP fourni n'utilise plus le curseur : il suit les UID IMAP et
> envoie `cursor: null`. Les routes `sync/state` et le champ `cursor` restent
> disponibles pour compatibilité et pour un éventuel client de synchronisation
> manuel.

### `GET /webhooks/sync/state?mailbox=...`

```json
{ "data": { "mailbox": "demo@example.com", "cursor": "1729500000", "lastSyncAt": "…" } }
```

### `POST /webhooks/sync/import`

```json
{
  "mailbox": "demo@example.com",
  "cursor": null,
  "executionId": "1234",
  "messages": [
    {
      "gmailMessageId": "18f…",
      "gmailThreadId": "18f…",
      "sender": "Client <client@exemple.fr>",
      "recipients": ["demo@example.com"],
      "subject": "Demande de devis",
      "bodyText": "Bonjour, …",
      "receivedAt": "2026-10-21T08:30:00.000Z"
    }
  ]
}
```

1 à 100 messages. `202` :

```json
{ "data": { "imported": 1, "skipped": 0, "mailbox": "demo@example.com" } }
```

Un message déjà présent est simplement ignoré (`skipped`).

### `POST /webhooks/sync/run`

Rapport d'exécution (`RUNNING`, `SUCCESS`, `FAILED`) avec les compteurs et le
curseur final.

### `GET /webhooks/classification/pending?limit=20`

Retourne jusqu'à 50 e-mails non classés.

### `POST /webhooks/classification/results`

```json
{
  "results": [
    {
      "emailId": "…",
      "category": "client",
      "priority": 3,
      "summary": "Le client demande un devis.",
      "expectedAction": "Envoyer un devis.",
      "needsReview": false
    }
  ]
}
```

1 à 100 résultats ; la catégorie doit appartenir à la liste fermée.

### `POST /webhooks/reply/outcome`

```json
{ "replyId": "…", "status": "SENT", "providerMessageId": "gmail-…" }
```

`status` ∈ `SENT`, `FAILED`, `UNKNOWN`. Les transitions illégales renvoient
`409`.

### `POST /webhooks/workflow/failure`

```json
{
  "workflowName": "01 - Synchronisation Gmail",
  "executionId": "1234",
  "errorCode": "ETIMEDOUT",
  "errorMessage": "timeout of 10000ms exceeded",
  "occurredAt": "2026-10-21T08:30:00.000Z"
}
```

Journalisé dans `audit_events` (`202`).
