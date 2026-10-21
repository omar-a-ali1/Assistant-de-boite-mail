/**
 * OpenAPI 3.0 description of the public API and the n8n webhooks.
 * Served by Swagger UI at /swagger-docs and as JSON at /swagger-docs.json.
 *
 * Kept as a plain object (rather than scattered annotations) so the
 * contract stays testable and cannot drift silently.
 *
 * @module docs/openapi
 */

const ErrorResponse = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        message: { type: 'string', example: 'Request validation failed.' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

const User = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    displayName: { type: 'string' },
  },
};

const Email = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    threadId: { type: 'string', format: 'uuid' },
    sender: { type: 'string' },
    recipients: { type: 'array', items: { type: 'string' } },
    subject: { type: 'string' },
    receivedAt: { type: 'string', format: 'date-time' },
    category: {
      type: 'string',
      nullable: true,
      enum: ['client', 'facture', 'rendez-vous', 'newsletter', 'spam probable', 'autre'],
    },
    priority: { type: 'integer', minimum: 1, maximum: 3, nullable: true },
    summary: { type: 'string', nullable: true },
    expectedAction: { type: 'string', nullable: true },
    needsReview: { type: 'boolean' },
    status: { type: 'string', enum: ['TO_PROCESS', 'DRAFT_READY', 'REPLIED', 'IGNORED'] },
    preview: { type: 'string' },
  },
};

const Draft = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    body: { type: 'string' },
    tone: { type: 'string', enum: ['formal', 'neutral', 'short'] },
    editedByUser: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const Reply = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN'] },
    providerMessageId: { type: 'string', nullable: true },
    errorCode: { type: 'string', nullable: true },
    errorMessage: { type: 'string', nullable: true },
    attemptCount: { type: 'integer' },
    retryable: { type: 'boolean' },
    needsReconciliation: { type: 'boolean' },
    sentAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Assistant de boîte mail — API',
    version: '1.0.0',
    description:
      'API REST de l’assistant e-mail et webhooks sécurisés consommés par n8n. ' +
      'Authentification par cookie de session ; les requêtes mutantes exigent ' +
      'l’en-tête `X-CSRF-Token`. Les webhooks exigent `X-Webhook-Secret`.',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 (le serveur Vite proxifie /api vers le backend)',
    },
  ],
  tags: [
    { name: 'Santé', description: 'Sondes de disponibilité' },
    { name: 'Authentification', description: 'Session et jeton CSRF' },
    { name: 'E-mails', description: 'Liste, fil de discussion et résumé du jour' },
    { name: 'Brouillons', description: 'Génération IA et édition des brouillons' },
    { name: 'Réponses', description: 'Envoi idempotent et suivi de livraison' },
    { name: 'Webhooks n8n', description: 'Appels serveur à serveur protégés par secret' },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'usts_sid',
        description: 'Cookie de session HttpOnly posé par POST /auth/login.',
      },
      csrfToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'Jeton renvoyé par /auth/login ou /auth/me. Requis sur POST/PATCH.',
      },
      idempotencyKey: {
        type: 'apiKey',
        in: 'header',
        name: 'Idempotency-Key',
        description: 'Clé unique (8 à 200 caractères) identifiant un envoi logique.',
      },
      webhookSecret: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Webhook-Secret',
        description: 'Secret partagé n8n ↔ backend (comparaison à temps constant).',
      },
    },
    parameters: {
      IdPath: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      Page: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
      Sender: {
        name: 'sender',
        in: 'query',
        schema: { type: 'string', maxLength: 254 },
        description: 'Recherche partielle sur l’expéditeur.',
      },
      Search: {
        name: 'search',
        in: 'query',
        schema: { type: 'string', maxLength: 200 },
        description: 'Recherche dans l’objet et le contenu.',
      },
      StartDate: {
        name: 'startDate',
        in: 'query',
        schema: { type: 'string', format: 'date-time' },
      },
      EndDate: {
        name: 'endDate',
        in: 'query',
        schema: { type: 'string', format: 'date-time' },
      },
      SortBy: {
        name: 'sortBy',
        in: 'query',
        schema: {
          type: 'string',
          enum: ['received_at', 'subject', 'sender', 'priority', 'category', 'status'],
          default: 'received_at',
        },
      },
      SortOrder: {
        name: 'sortOrder',
        in: 'query',
        schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
      },
    },
    schemas: {
      Error: ErrorResponse,
      User,
      Email,
      Draft,
      Reply,
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              csrfToken: { type: 'string' },
            },
          },
        },
      },
      EmailListResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Email' } },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
      ThreadDetail: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              thread: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  subject: { type: 'string' },
                  gmailThreadId: { type: 'string' },
                  latestMessageAt: { type: 'string', format: 'date-time' },
                },
              },
              messages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    sender: { type: 'string' },
                    recipients: { type: 'array', items: { type: 'string' } },
                    subject: { type: 'string' },
                    body: { type: 'string' },
                    receivedAt: { type: 'string', format: 'date-time' },
                    category: { type: 'string', nullable: true },
                    priority: { type: 'integer', nullable: true },
                    summary: { type: 'string', nullable: true },
                    expectedAction: { type: 'string', nullable: true },
                    needsReview: { type: 'boolean' },
                    status: { type: 'string' },
                  },
                },
              },
              drafts: { type: 'array', items: { $ref: '#/components/schemas/Draft' } },
              replies: { type: 'array', items: { $ref: '#/components/schemas/Reply' } },
            },
          },
        },
      },
      Summary: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              date: { type: 'string', format: 'date' },
              total: { type: 'integer' },
              byCategory: {
                type: 'object',
                properties: {
                  client: { type: 'integer' },
                  facture: { type: 'integer' },
                  'rendez-vous': { type: 'integer' },
                  newsletter: { type: 'integer' },
                  'spam probable': { type: 'integer' },
                  autre: { type: 'integer' },
                },
              },
              byStatus: {
                type: 'object',
                properties: {
                  TO_PROCESS: { type: 'integer' },
                  DRAFT_READY: { type: 'integer' },
                  REPLIED: { type: 'integer' },
                  IGNORED: { type: 'integer' },
                },
              },
              priority: {
                type: 'object',
                properties: {
                  high: { type: 'integer' },
                  medium: { type: 'integer' },
                  low: { type: 'integer' },
                },
              },
              needsReview: { type: 'integer' },
              topEmails: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    threadId: { type: 'string', format: 'uuid' },
                    sender: { type: 'string' },
                    subject: { type: 'string' },
                    receivedAt: { type: 'string', format: 'date-time' },
                    category: { type: 'string', nullable: true },
                    priority: { type: 'integer', nullable: true },
                    status: { type: 'string' },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      DraftCreateRequest: {
        type: 'object',
        required: ['tone'],
        properties: {
          tone: { type: 'string', enum: ['formal', 'neutral', 'short'] },
        },
      },
      DraftUpdateRequest: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 20000 },
          tone: { type: 'string', enum: ['formal', 'neutral', 'short'] },
        },
      },
      ReplyCreateRequest: {
        type: 'object',
        required: ['confirm'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 20000 },
          draftId: { type: 'string', format: 'uuid' },
          confirm: { type: 'boolean', enum: [true] },
        },
        oneOf: [{ required: ['body'] }, { required: ['draftId'] }],
      },
      ReplySubmitResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              status: { type: 'string', enum: ['PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN'] },
              idempotencyKey: { type: 'string' },
              attemptCount: { type: 'integer' },
              reused: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      SyncImportRequest: {
        type: 'object',
        required: ['mailbox', 'messages'],
        properties: {
          mailbox: { type: 'string', format: 'email' },
          cursor: { type: 'string', nullable: true },
          executionId: { type: 'string', nullable: true },
          messages: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              required: ['gmailMessageId', 'gmailThreadId', 'sender', 'receivedAt'],
              properties: {
                gmailMessageId: { type: 'string', maxLength: 255 },
                gmailThreadId: { type: 'string', maxLength: 255 },
                sender: { type: 'string', maxLength: 500 },
                recipients: { type: 'array', items: { type: 'string', maxLength: 500 } },
                subject: { type: 'string', maxLength: 1000 },
                bodyText: { type: 'string', maxLength: 500000 },
                receivedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      SyncRunRequest: {
        type: 'object',
        required: ['mailbox', 'status'],
        properties: {
          mailbox: { type: 'string', format: 'email' },
          executionId: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['RUNNING', 'SUCCESS', 'FAILED'] },
          cursorStart: { type: 'string', nullable: true },
          cursorEnd: { type: 'string', nullable: true },
          importedCount: { type: 'integer', minimum: 0 },
          updatedCount: { type: 'integer', minimum: 0 },
          skippedCount: { type: 'integer', minimum: 0 },
          failedCount: { type: 'integer', minimum: 0 },
          errorCode: { type: 'string', nullable: true },
          errorMessage: { type: 'string', maxLength: 500, nullable: true },
        },
      },
      ClassificationResultsRequest: {
        type: 'object',
        required: ['results'],
        properties: {
          results: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              required: ['emailId', 'category', 'priority', 'summary', 'expectedAction'],
              properties: {
                emailId: { type: 'string', format: 'uuid' },
                category: {
                  type: 'string',
                  enum: ['client', 'facture', 'rendez-vous', 'newsletter', 'spam probable', 'autre'],
                },
                priority: { type: 'integer', minimum: 1, maximum: 3 },
                summary: { type: 'string', maxLength: 500 },
                expectedAction: { type: 'string', maxLength: 500 },
                needsReview: { type: 'boolean', default: false },
              },
            },
          },
        },
      },
      ReplyOutcomeRequest: {
        type: 'object',
        required: ['replyId', 'status'],
        properties: {
          replyId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['SENT', 'FAILED', 'UNKNOWN'] },
          providerMessageId: { type: 'string', nullable: true },
          errorCode: { type: 'string', nullable: true },
          errorMessage: { type: 'string', maxLength: 500, nullable: true },
        },
      },
      WorkflowFailureRequest: {
        type: 'object',
        required: ['workflowName'],
        properties: {
          workflowName: { type: 'string', maxLength: 255 },
          executionId: { type: 'string', nullable: true },
          errorCode: { type: 'string', nullable: true },
          errorMessage: { type: 'string', maxLength: 500, nullable: true },
          occurredAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
    },
    responses: {
      Unauthorized: errorResponse('Session absente ou expirée.'),
      CsrfForbidden: errorResponse('Jeton CSRF absent ou invalide.'),
      ValidationError: errorResponse('Corps ou paramètres invalides.'),
      NotFound: errorResponse('Ressource inexistante.'),
      Conflict: errorResponse('Conflit d’idempotence ou transition d’état interdite.'),
      RateLimited: errorResponse('Trop de requêtes.'),
      WebhookUnauthorized: errorResponse('Secret de webhook absent ou erroné.'),
    },
  },
  security: [],
  paths: {
    '/health': {
      get: {
        tags: ['Santé'],
        summary: 'Sonde de vivacité',
        responses: {
          200: {
            description: 'Le processus répond.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'ok' },
                        time: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Santé'],
        summary: 'Sonde de disponibilité (vérifie PostgreSQL)',
        responses: {
          200: { description: 'Base joignable.' },
          503: errorResponse('Base indisponible (NOT_READY).'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentification'],
        summary: 'Connexion et création de session',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Session créée ; cookie HttpOnly et jeton CSRF renvoyés.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/Unauthorized' },
          429: { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentification'],
        summary: 'Détruit la session courante',
        security: [{ sessionCookie: [], csrfToken: [] }],
        responses: {
          200: { description: 'Session détruite.' },
          403: { $ref: '#/components/responses/CsrfForbidden' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentification'],
        summary: 'Utilisateur courant et jeton CSRF',
        security: [{ sessionCookie: [] }],
        responses: {
          200: {
            description: 'Utilisateur authentifié.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/emails': {
      get: {
        tags: ['E-mails'],
        summary: 'Liste paginée avec filtres combinables',
        security: [{ sessionCookie: [] }],
        parameters: [
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
          {
            name: 'category',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['client', 'facture', 'rendez-vous', 'newsletter', 'spam probable', 'autre'],
            },
          },
          { name: 'priority', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 3 } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['TO_PROCESS', 'DRAFT_READY', 'REPLIED', 'IGNORED'] },
          },
          { $ref: '#/components/parameters/Sender' },
          { $ref: '#/components/parameters/StartDate' },
          { $ref: '#/components/parameters/EndDate' },
          { $ref: '#/components/parameters/Search' },
          { $ref: '#/components/parameters/SortBy' },
          { $ref: '#/components/parameters/SortOrder' },
        ],
        responses: {
          200: {
            description: 'Page d’e-mails.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EmailListResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/summary': {
      get: {
        tags: ['E-mails'],
        summary: 'Résumé du jour et 5 e-mails prioritaires avec justification',
        security: [{ sessionCookie: [] }],
        parameters: [
          {
            name: 'date',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'date' },
            example: '2026-10-21',
          },
        ],
        responses: {
          200: {
            description: 'Statistiques et sélection priorisée.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Summary' } },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/threads/{id}': {
      get: {
        tags: ['E-mails'],
        summary: 'Fil de discussion complet (messages, brouillons, réponses)',
        security: [{ sessionCookie: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          200: {
            description: 'Détail du fil.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ThreadDetail' } },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/emails/{id}/draft': {
      post: {
        tags: ['Brouillons'],
        summary: 'Génère un brouillon IA (aucun envoi)',
        security: [{ sessionCookie: [], csrfToken: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/DraftCreateRequest' } },
          },
        },
        responses: {
          201: {
            description: 'Brouillon généré et enregistré.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      allOf: [
                        { $ref: '#/components/schemas/Draft' },
                        {
                          type: 'object',
                          properties: {
                            threadId: { type: 'string', format: 'uuid' },
                            originalEmailId: { type: 'string', format: 'uuid' },
                            aiGenerated: { type: 'boolean' },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/CsrfForbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/drafts/{id}': {
      patch: {
        tags: ['Brouillons'],
        summary: 'Modifie le contenu d’un brouillon',
        security: [{ sessionCookie: [], csrfToken: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/DraftUpdateRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Brouillon mis à jour.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Draft' } } },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/CsrfForbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/emails/{id}/reply': {
      post: {
        tags: ['Réponses'],
        summary: 'Envoie une réponse approuvée (idempotent)',
        description:
          'Exige `confirm: true` et l’en-tête `Idempotency-Key`. La réponse est ' +
          'persistée avant l’appel à n8n. Rejouer la même clé renvoie l’opération ' +
          'existante (200) ; la réutiliser avec un contenu différent renvoie 409.',
        security: [{ sessionCookie: [], csrfToken: [], idempotencyKey: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ReplyCreateRequest' } },
          },
        },
        responses: {
          202: {
            description: 'Nouvelle opération d’envoi créée.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReplySubmitResponse' },
              },
            },
          },
          200: {
            description: 'Opération existante réutilisée (même clé, même contenu).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReplySubmitResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/CsrfForbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
          422: errorResponse('Le brouillon appartient à un autre fil.'),
        },
      },
    },
    '/replies/{id}': {
      get: {
        tags: ['Réponses'],
        summary: 'Statut de livraison d’une réponse',
        security: [{ sessionCookie: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          200: {
            description: 'Statut courant.',
            content: {
              'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Reply' } } } },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/replies/{id}/retry': {
      post: {
        tags: ['Réponses'],
        summary: 'Réessaie uniquement une réponse FAILED',
        security: [{ sessionCookie: [], csrfToken: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          200: { description: 'Nouvelle tentative déclenchée.' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/CsrfForbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          409: {
            description:
              'Non réessayable : RECONCILIATION_REQUIRED (UNKNOWN), ALREADY_IN_PROGRESS ' +
              '(SENDING), ALREADY_SENT (SENT) ou NOT_RETRYABLE.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/webhooks/sync/state': {
      get: {
        tags: ['Webhooks n8n'],
        summary: 'Curseur de synchronisation durable',
        security: [{ webhookSecret: [] }],
        parameters: [
          {
            name: 'mailbox',
            in: 'query',
            schema: { type: 'string', format: 'email' },
          },
        ],
        responses: {
          200: {
            description: 'Curseur courant (ou null si aucune synchronisation).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        mailbox: { type: 'string' },
                        cursor: { type: 'string', nullable: true },
                        lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/WebhookUnauthorized' },
          429: { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/webhooks/sync/import': {
      post: {
        tags: ['Webhooks n8n'],
        summary: 'Importe un lot de messages (dédupliqué)',
        security: [{ webhookSecret: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SyncImportRequest' } },
          },
        },
        responses: {
          202: {
            description: 'Lot traité (les doublons sont ignorés).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        imported: { type: 'integer' },
                        skipped: { type: 'integer' },
                        mailbox: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/WebhookUnauthorized' },
        },
      },
    },
    '/webhooks/sync/run': {
      post: {
        tags: ['Webhooks n8n'],
        summary: 'Rapporte une exécution de synchronisation',
        security: [{ webhookSecret: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SyncRunRequest' } },
          },
        },
        responses: {
          200: { description: 'Exécution enregistrée.' },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/WebhookUnauthorized' },
        },
      },
    },
    '/webhooks/classification/pending': {
      get: {
        tags: ['Webhooks n8n'],
        summary: 'E-mails non classés à traiter',
        security: [{ webhookSecret: [] }],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: {
          200: {
            description: 'Liste bornée d’e-mails non classés.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          emailId: { type: 'string', format: 'uuid' },
                          subject: { type: 'string' },
                          body: { type: 'string' },
                          sender: { type: 'string' },
                          receivedAt: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/WebhookUnauthorized' },
        },
      },
    },
    '/webhooks/classification/results': {
      post: {
        tags: ['Webhooks n8n'],
        summary: 'Enregistre des classifications validées',
        security: [{ webhookSecret: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ClassificationResultsRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Résultats enregistrés.' },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/WebhookUnauthorized' },
        },
      },
    },
    '/webhooks/reply/outcome': {
      post: {
        tags: ['Webhooks n8n'],
        summary: 'Rapporte le résultat de livraison d’une réponse',
        security: [{ webhookSecret: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ReplyOutcomeRequest' } },
          },
        },
        responses: {
          200: { description: 'Résultat appliqué (idempotent).' },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/WebhookUnauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: {
            description: 'Transition d’état illégale (INVALID_TRANSITION).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/webhooks/workflow/failure': {
      post: {
        tags: ['Webhooks n8n'],
        summary: 'Journalise un échec de workflow n8n',
        security: [{ webhookSecret: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/WorkflowFailureRequest' } },
          },
        },
        responses: {
          202: { description: 'Échec enregistré dans audit_events.' },
          400: { $ref: '#/components/responses/ValidationError' },
          401: { $ref: '#/components/responses/WebhookUnauthorized' },
        },
      },
    },
  },
};

module.exports = openapi;
