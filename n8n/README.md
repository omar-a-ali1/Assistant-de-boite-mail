# Workflows n8n

Quatre workflows automatisent la partie « boîte e-mail réelle ». Ils sont
**désactivés par défaut** et n'ont aucun identifiant en dur : toutes les clés
passent par des variables d'environnement ou par les identifiants n8n.

| Fichier | Rôle | Déclencheur |
| --- | --- | --- |
| `workflows/01-sync-gmail.json` | Importe les nouveaux messages Gmail (dédupliqué côté backend) | Gmail Trigger (toutes les minutes) |
| `workflows/02-classification.json` | Classe et résume les e-mails en attente via l'IA | Schedule (toutes les 2 min) |
| `workflows/03-send-reply.json` | Envoie une réponse approuvée, puis rapporte le résultat | Webhook `POST /webhook/send-reply` |
| `workflows/04-error-handler.json` | Journalise les échecs de workflow dans le backend | Error Trigger |

## Sens des appels

```
Navigateur -> Backend (session + CSRF) -> n8n (X-Webhook-Secret) -> Gmail
                                   ^                                  |
                                   +---- webhooks de retour ----------+
```

- Le **navigateur n'appelle jamais n8n** : seul le backend déclenche l'envoi.
- Tous les appels n8n → backend portent l'en-tête `X-Webhook-Secret`.
- Le backend considère un envoi comme `SENT` uniquement après le retour
  explicite du workflow. Un échec réseau devient `UNKNOWN` (jamais renvoyé
  automatiquement).

## Prérequis

Variables d'environnement (déjà transmises au conteneur n8n par
`docker-compose.yaml`) :

```
BACKEND_BASE_URL=http://backend:4000
N8N_WEBHOOK_SECRET=<même valeur que le backend>
MAILBOX_ADDRESS=demo@example.com
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-versatile
AI_API_KEY=<clé Groq ou compatible OpenAI>
```

Dans `.env`, pour que le backend puisse déclencher l'envoi :

```
N8N_SEND_REPLY_WEBHOOK_URL=http://n8n:5678/webhook/send-reply
```

`N8N_SYNC_WEBHOOK_URL` et `N8N_CLASSIFICATION_WEBHOOK_URL` peuvent rester
vides : ces deux workflows fonctionnent sur planification.

## Importer les workflows

### Via l'interface

1. Ouvrir http://localhost:5678 et créer le compte propriétaire.
2. **Workflows → Import from File** pour chacun des quatre fichiers.
3. Ouvrir chaque workflow et **enregistrer**.

### En ligne de commande

```bash
for f in n8n/workflows/*.json; do
  docker compose cp "$f" n8n:/tmp/workflow.json
  docker compose exec n8n n8n import:workflow --input=/tmp/workflow.json
done
```

## Identifiants à associer

1. **Gmail OAuth2** (workflows 01 et 03) : dans n8n, *Credentials → New →
   Gmail OAuth2*. Renseignez `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` et
   `GMAIL_REDIRECT_URI`, puis remplacez le placeholder
   `REPLACE_WITH_GMAIL_CREDENTIAL_ID` dans les nœuds en sélectionnant le
   credential créé.
2. **Clé IA** : aucun credential n8n n'est nécessaire, le workflow lit
   `AI_API_KEY` dans l'environnement.
3. **Workflow d'erreur** : dans les paramètres de chaque workflow, choisissez
   `04 - Gestion des erreurs` comme *Error Workflow*.

## Activer

Activez d'abord `03 - Envoi de réponse`, puis `02 - Classification IA`, puis
`01 - Synchronisation Gmail`. Le workflow d'erreur n'a pas besoin d'être
activé pour être utilisé comme *Error Workflow*.

## Mode démonstration (sans Gmail)

Sans identifiants Gmail, laissez les workflows **inactifs**. L'application
reste entièrement démontrable : import par `npm run seed`, classification IA
côté backend (`AI_PROVIDER=mock` par défaut) et envoi de réponse enregistré
en base. Le backend signale alors explicitement
`NO_WORKFLOW` et n'affiche jamais un envoi comme réussi.

## Vérification

```bash
# Secret refusé
curl -i -X POST http://localhost:5678/webhook/send-reply \
  -H 'Content-Type: application/json' -d '{}'

# Déclenchement d'un envoi (à faire via l'application : le backend ajoute
# replyId, to, subject, body, gmailThreadId et Idempotency-Key)
```

Après un envoi réel, vérifiez dans n8n l'exécution du workflow 03 puis, dans
l'application, le statut `Envoyé` du fil concerné.
