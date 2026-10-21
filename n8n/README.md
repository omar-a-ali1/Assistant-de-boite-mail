# Workflows n8n

Quatre workflows automatisent la partie « boîte e-mail réelle ». Ils sont
**inactifs par défaut** et n'ont aucun secret en dur : les identifiants de la
boîte passent par les credentials n8n, les autres clés par l'environnement.

| Fichier | Rôle | Déclencheur |
| --- | --- | --- |
| `workflows/01-sync-gmail.json` | Synchronisation IMAP des nouveaux e-mails vers le backend | IMAP (nouvel e-mail) |
| `workflows/02-classification.json` | Classe et résume les e-mails en attente via l'IA | Schedule (toutes les 2 min) |
| `workflows/03-send-reply.json` | Envoie une réponse approuvée par SMTP, puis rapporte le résultat | Webhook `POST /webhook/send-reply` |
| `workflows/04-error-handler.json` | Journalise les échecs de workflow dans le backend | Error Trigger |

## Comportements de fiabilité

- **IMAP** : le workflow 01 écoute la boîte `INBOX` avec `["UNSEEN"]`. Il ne
  marque pas les messages comme lus (`postProcessAction: nothing`) et suit le
  dernier UID (`trackLastMessageId: true`) pour ne pas relire indéfiniment les
  mêmes messages. Au premier démarrage, n8n récupère les non-lus depuis la date
  d'activation.
- **Déduplication** : chaque message est identifié par son `Message-ID` (ou son
  UID IMAP à défaut) ; le backend ignore les doublons
  (`ON CONFLICT DO NOTHING`). Une relecture IMAP ne crée donc pas de doublon.
- **Lots** : les messages sont découpés par 50 (le backend accepte jusqu'à 100).
- **Classification** : sortie validée contre une liste fermée ; en cas de JSON
  invalide, **une nouvelle tentative** est faite, puis repli sur `autre` avec
  `needsReview=true`. Pause de 2 s entre deux e-mails.
- **Quota IA (HTTP 429)** : le nœud IA réessaie jusqu'à 3 fois avec 20 s
  d'attente entre les tentatives.
- **Envoi** : le navigateur n'appelle jamais n8n ; le backend seul déclenche le
  webhook. Un résultat ambigu (timeout réseau) est rapporté `UNKNOWN`, jamais
  `SENT`.

## Sens des appels

```
Navigateur -> Backend (session + CSRF) -> n8n (X-Webhook-Secret) -> boîte mail (IMAP/SMTP)
                                   ^                                        |
                                   +---- webhooks de retour ----------------+
```

- Le **navigateur n'appelle jamais n8n** : seul le backend déclenche l'envoi.
- Tous les appels n8n → backend portent l'en-tête `X-Webhook-Secret`.
- Le backend considère un envoi comme `SENT` uniquement après le retour
  explicite du workflow. Un échec réseau devient `UNKNOWN` (jamais renvoyé
  automatiquement).

## Boîte mail locale (par défaut)

Aucun compte externe ni secret n'est nécessaire. Le stack Compose démarre
**GreenMail** avec une boîte de démonstration :

| Paramètre | Valeur |
| --- | --- |
| Adresse | `demo@example.com` |
| Mot de passe | `demo1234` |
| IMAP (réseau Compose) | `greenmail:3143`, sans TLS |
| SMTP (réseau Compose) | `greenmail:3025`, sans TLS |
| IMAP/SMTP depuis l'hôte | `127.0.0.1:3143` / `127.0.0.1:3025` |

`MAIL_MODE=local` est la valeur par défaut. Le script d'import configure les
credentials n8n sur cette boîte ; aucune modification de `.env` n'est requise.

Pour envoyer un e-mail de test depuis l'hôte :

```bash
python3 - <<'PY'
import smtplib
from email.message import EmailMessage

msg = EmailMessage()
msg['From'] = 'Client Test <client.test@example.com>'
msg['To'] = 'demo@example.com'
msg['Subject'] = 'Demande de devis - test local'
msg.set_content('Bonjour, pouvez-vous me faire parvenir un devis ?')

with smtplib.SMTP('127.0.0.1', 3025, timeout=10) as smtp:
    smtp.send_message(msg)
PY
```

Le workflow 01 s'exécute, le message est importé, puis il apparaît dans
l'application.

## Gmail (optionnel)

Pour utiliser un vrai compte Gmail à la place de GreenMail :

1. Activer la **validation en deux étapes** sur le compte Google.
2. Créer un **mot de passe d'application** sur
   <https://myaccount.google.com/apppasswords>.
3. Renseigner dans `.env` :

```bash
MAIL_MODE=gmail
MAILBOX_ADDRESS=votre.adresse@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
GMAIL_IMAP_HOST=imap.gmail.com
GMAIL_IMAP_PORT=993
GMAIL_SMTP_HOST=smtp.gmail.com
GMAIL_SMTP_PORT=465
```

Le mot de passe d'application peut être saisi avec ou sans espaces ; le script
d'import les retire. Ne jamais committer `.env`.

> **DNS Docker** : si les conteneurs ne résolvent pas `imap.gmail.com` /
> `smtp.gmail.com` (`EAI_AGAIN`), renseigner `DOCKER_DNS` dans `.env` avec le
> DNS de votre réseau (voir `.env.example`), puis recréer les services.

Variables transmises au conteneur n8n par les fichiers Compose :

```bash
BACKEND_BASE_URL=http://backend:4000
N8N_WEBHOOK_SECRET=<même valeur que le backend>
MAILBOX_ADDRESS=demo@example.com
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-versatile
AI_API_KEY=<clé Groq ou compatible OpenAI>
```

Dans `.env`, pour que le backend puisse déclencher l'envoi :

```bash
N8N_SEND_REPLY_WEBHOOK_URL=http://n8n:5678/webhook/send-reply
```

`N8N_SYNC_WEBHOOK_URL` et `N8N_CLASSIFICATION_WEBHOOK_URL` peuvent rester
vides : la synchronisation est pilotée par IMAP et la classification par
planification.

## Importer et activer

### Script automatique (recommandé)

```bash
node n8n/scripts/apply-mail.js
```

Le script :

1. démarre GreenMail et attend qu'il soit joignable (`MAIL_MODE=local`), ou
   vérifie les paramètres Gmail (`MAIL_MODE=gmail`) ;
2. importe les credentials `Boîte mail IMAP` (`usts-gmail-imap`) et
   `Boîte mail SMTP` (`usts-gmail-smtp`) ;
3. importe les quatre workflows ;
4. publie `01 - Synchronisation Gmail (IMAP)` et `03 - Envoi de réponse` ;
5. publie `02 - Classification IA` uniquement si `AI_API_KEY` est renseignée ;
6. recrée n8n pour charger les credentials et les workflows publiés.

Le script ne journalise jamais le mot de passe et supprime les fichiers
temporaires d'import.

### Via l'interface

1. Ouvrir <http://localhost:5678> et créer le compte propriétaire.
2. **Credentials → New** : créer `Boîte mail IMAP` (type IMAP) et
   `Boîte mail SMTP` (type SMTP). En mode local : hôte `greenmail`, ports
   `3143` / `3025`, sans TLS, utilisateur `demo@example.com`, mot de passe
   `demo1234`.
3. **Workflows → Import from File** pour chacun des quatre fichiers, puis
   sélectionner les credentials dans les nœuds IMAP/SMTP.
4. Publier les workflows.

## Activer

Le script publie déjà `03 - Envoi de réponse` et
`01 - Synchronisation Gmail`. Pour le faire manuellement, publiez d'abord
`03`, puis `02` (si une clé IA est disponible), puis `01`. Le workflow
d'erreur n'a pas besoin d'être activé pour être utilisé comme *Error Workflow*.

## Mode sans workflows

Si les workflows sont inactifs, l'application reste démontrable : import par
`npm run seed`, classification IA côté backend (`AI_PROVIDER=mock` par défaut)
et envoi de réponse enregistré en base. Le backend signale alors explicitement
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
l'application, le statut `Envoyé` du fil concerné. La boîte locale est
inspectable via l'API GreenMail sur <http://localhost:8080>.
