/**
 * Deterministic demonstration dataset: ~30 entirely fictional French
 * emails across multiple threads, categories, priorities and statuses.
 *
 * - Idempotent: re-running does not create duplicates (unique Gmail
 *   message id per mailbox + ON CONFLICT).
 * - No real personal data.
 * - Used to demo and test the app without a Gmail account.
 *
 * Usage: `node database/seed.js`
 */
const bcrypt = require('bcrypt');
const { pool, withTransaction, closePool } = require('../src/config/db');
const config = require('../src/config/env');

const MAILBOX = config.mailboxAddress;

// Fixed demo password (development only, documented in README).
const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo1234';

/** Build a date offset in days from "now" at a fixed time (deterministic-ish). */
function daysAgo(days, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Thread + message definitions (all fictional). */
const THREADS = [
  {
    key: 't1',
    subject: 'Devis pour la refonte du site web',
    messages: [
      {
        id: 'demo-msg-001',
        sender: 'claire.martin@acme-fictif.fr',
        recipients: [MAILBOX],
        days: 0,
        hour: 8,
        category: 'client',
        priority: 3,
        status: 'TO_PROCESS',
        summary: 'La cliente demande un devis pour la refonte complète de son site web.',
        action: 'Préparer et envoyer un devis détaillé sous 48 heures.',
        body: "Bonjour,\n\nNous souhaitons refondre entièrement notre site vitrine et y ajouter un espace client. Pourriez-vous nous transmettre un devis détaillé, en précisant les délais et les modalités de paiement ?\n\nCordialement,\nClaire Martin\nACME (société fictive)",
      },
      {
        id: 'demo-msg-002',
        sender: MAILBOX,
        recipients: ['claire.martin@acme-fictif.fr'],
        days: 0,
        hour: 10,
        category: 'client',
        priority: 3,
        status: 'DRAFT_READY',
        summary: 'Brouillon de réponse préparé pour le devis client.',
        action: 'Relire et envoyer le brouillon de devis.',
        body: "Bonjour Claire,\n\nMerci pour votre message. Je vous prépare un devis détaillé que je vous transmets sous 48 heures.\n\nBien cordialement,",
      },
    ],
  },
  {
    key: 't2',
    subject: 'Facture F-2026-0042 impayée',
    messages: [
      {
        id: 'demo-msg-003',
        sender: 'comptabilite@fournisseur-fictif.fr',
        recipients: [MAILBOX],
        days: 0,
        hour: 11,
        category: 'facture',
        priority: 3,
        status: 'TO_PROCESS',
        summary: 'Relance concernant la facture F-2026-0042 toujours impayée.',
        action: 'Vérifier la facture et procéder au règlement ou contester.',
        body: "Bonjour,\n\nSauf erreur de notre part, la facture F-2026-0042 du mois dernier reste impayée. Nous vous remercions de bien vouloir régulariser la situation.\n\nCordialement,\nService comptabilité (fictif)",
      },
    ],
  },
  {
    key: 't3',
    subject: 'Rendez-vous de suivi projet',
    messages: [
      {
        id: 'demo-msg-004',
        sender: 'paul.durand@partenaire-fictif.fr',
        recipients: [MAILBOX],
        days: 0,
        hour: 14,
        category: 'rendez-vous',
        priority: 2,
        status: 'TO_PROCESS',
        summary: 'Proposition de rendez-vous de suivi la semaine prochaine.',
        action: 'Confirmer un créneau de rendez-vous.',
        body: "Bonjour,\n\nSeriez-vous disponible mardi ou mercredi prochain pour faire un point sur le projet ? Je peux me déplacer ou organiser une visioconférence.\n\nBien à vous,\nPaul Durand",
      },
    ],
  },
  {
    key: 't4',
    subject: 'Newsletter mensuelle - tendances tech',
    messages: [
      {
        id: 'demo-msg-005',
        sender: 'newsletter@media-fictif.fr',
        recipients: [MAILBOX],
        days: 0,
        hour: 7,
        category: 'newsletter',
        priority: 1,
        status: 'IGNORED',
        summary: 'Newsletter mensuelle sur les tendances technologiques.',
        action: 'Aucune action requise.',
        body: 'Découvrez notre sélection mensuelle des actualités technologiques (contenu de démonstration).',
      },
    ],
  },
  {
    key: 't5',
    subject: 'Félicitations, vous avez gagné un iPhone !',
    messages: [
      {
        id: 'demo-msg-006',
        sender: 'promo@suspect-fictif.xyz',
        recipients: [MAILBOX],
        days: 0,
        hour: 16,
        category: 'spam probable',
        priority: 1,
        status: 'IGNORED',
        summary: 'Message promotionnel suspect annonçant un gain improbable.',
        action: 'Ignorer ou bloquer l’expéditeur.',
        body: 'Cliquez vite pour réclamer votre cadeau ! (message de démonstration clairement frauduleux)',
      },
    ],
  },
  {
    key: 't6',
    subject: 'Demande de partenariat',
    messages: [
      {
        id: 'demo-msg-007',
        sender: 'sophie.laurent@societe-fictive.com',
        recipients: [MAILBOX],
        days: 1,
        hour: 9,
        category: 'autre',
        priority: 2,
        status: 'TO_PROCESS',
        summary: 'Une société propose un partenariat commercial.',
        action: 'Évaluer la proposition et répondre.',
        body: "Bonjour,\n\nNous proposons un partenariat autour de la formation. Seriez-vous ouvert à un échange ?\n\nCordialement,\nSophie Laurent",
      },
    ],
  },
  {
    key: 't7',
    subject: 'Facture abonnement logiciel',
    messages: [
      {
        id: 'demo-msg-008',
        sender: 'billing@saas-fictif.io',
        recipients: [MAILBOX],
        days: 1,
        hour: 12,
        category: 'facture',
        priority: 2,
        status: 'REPLIED',
        summary: 'Facture de renouvellement de l’abonnement logiciel.',
        action: 'Régler la facture (déjà traitée).',
        body: 'Votre abonnement annuel a été renouvelé. Facture ci-jointe (démonstration).',
      },
    ],
  },
  {
    key: 't8',
    subject: 'Report de la réunion hebdomadaire',
    messages: [
      {
        id: 'demo-msg-009',
        sender: 'team@entreprise-fictive.fr',
        recipients: [MAILBOX],
        days: 2,
        hour: 8,
        category: 'rendez-vous',
        priority: 2,
        status: 'REPLIED',
        summary: 'La réunion hebdomadaire est reportée à jeudi.',
        action: 'Mettre à jour l’agenda (déjà traité).',
        body: 'La réunion de lundi est reportée à jeudi 10h (démonstration).',
      },
    ],
  },
  {
    key: 't9',
    subject: 'Contenu promotionnel non sollicité',
    messages: [
      {
        id: 'demo-msg-010',
        sender: 'offres@promo-fictive.net',
        recipients: [MAILBOX],
        days: 2,
        hour: 15,
        category: 'spam probable',
        priority: 1,
        status: 'TO_PROCESS',
        summary: 'Offres commerciales non sollicitées nécessitant un tri.',
        action: 'Marquer comme indésirable.',
        body: 'Profitez de nos offres exceptionnelles (démonstration).',
      },
    ],
  },
  {
    key: 't10',
    subject: 'Nouveau projet : application mobile',
    messages: [
      {
        id: 'demo-msg-011',
        sender: 'karim.benali@client-fictif.com',
        recipients: [MAILBOX],
        days: 3,
        hour: 10,
        category: 'client',
        priority: 3,
        status: 'TO_PROCESS',
        summary: 'Un client souhaite lancer un nouveau projet d’application mobile.',
        action: 'Planifier un appel de cadrage.',
        body: "Bonjour,\n\nNous envisageons une application mobile pour notre service client. Pouvons-nous échanger sur le périmètre ?\n\nKarim Benali",
      },
      {
        id: 'demo-msg-012',
        sender: MAILBOX,
        recipients: ['karim.benali@client-fictif.com'],
        days: 3,
        hour: 13,
        category: 'client',
        priority: 3,
        status: 'DRAFT_READY',
        summary: 'Brouillon de réponse proposant un appel de cadrage.',
        action: 'Relire et envoyer le brouillon.',
        body: "Bonjour Karim,\n\nAvec plaisir. Je vous propose un appel en début de semaine prochaine pour cadrer le besoin.\n\nCordialement,",
      },
    ],
  },
  {
    key: 't11',
    subject: 'Newsletter : bonnes pratiques sécurité',
    messages: [
      {
        id: 'demo-msg-013',
        sender: 'info@securite-fictive.fr',
        recipients: [MAILBOX],
        days: 4,
        hour: 7,
        category: 'newsletter',
        priority: 1,
        status: 'IGNORED',
        summary: 'Newsletter sur les bonnes pratiques de sécurité.',
        action: 'Aucune action requise.',
        body: 'Nos conseils sécurité du mois (démonstration).',
      },
    ],
  },
  {
    key: 't12',
    subject: 'Rendez-vous déjeuner professionnel',
    messages: [
      {
        id: 'demo-msg-014',
        sender: 'amelie.rousseau@reseau-fictif.fr',
        recipients: [MAILBOX],
        days: 5,
        hour: 11,
        category: 'rendez-vous',
        priority: 2,
        status: 'REPLIED',
        summary: 'Invitation à un déjeuner professionnel.',
        action: 'Répondre à l’invitation (déjà traité).',
        body: 'Seriez-vous disponible pour un déjeuner la semaine prochaine ? (démonstration)',
      },
    ],
  },
  {
    key: 't13',
    subject: 'Question sur la facturation du support',
    messages: [
      {
        id: 'demo-msg-015',
        sender: 'lucas.girard@client-fictif.fr',
        recipients: [MAILBOX],
        days: 6,
        hour: 9,
        category: 'facture',
        priority: 2,
        status: 'TO_PROCESS',
        summary: 'Le client s’interroge sur une ligne de facturation du support.',
        action: 'Clarifier la ligne de facturation et répondre.',
        body: "Bonjour,\n\nJe ne comprends pas la ligne « support premium » sur la dernière facture. Pouvez-vous m’éclairer ?\n\nLucas",
      },
    ],
  },
  {
    key: 't14',
    subject: 'Demande de documentation technique',
    messages: [
      {
        id: 'demo-msg-016',
        sender: 'nadia.cherif@prospect-fictif.com',
        recipients: [MAILBOX],
        days: 7,
        hour: 14,
        category: 'client',
        priority: 2,
        status: 'TO_PROCESS',
        summary: 'Un prospect demande la documentation technique.',
        action: 'Envoyer la documentation demandée.',
        body: 'Pourriez-vous m’adresser la documentation technique de votre solution ? (démonstration)',
      },
    ],
  },
  {
    key: 't15',
    subject: 'Message tronqué nécessitant une vérification',
    messages: [
      {
        id: 'demo-msg-017',
        sender: 'expediteur@inconnu-fictif.fr',
        recipients: [MAILBOX],
        days: 7,
        hour: 16,
        category: 'autre',
        priority: 1,
        status: 'TO_PROCESS',
        needs_review: true,
        summary: 'Message dont la classification automatique a échoué (contenu ambigu).',
        action: 'Vérifier manuellement la catégorie et la priorité.',
        body: 'Bonjour, suite à notre conversation... (contenu de démonstration volontairement ambigu)',
      },
    ],
  },
  {
    key: 't16',
    subject: 'Confirmation de commande',
    messages: [
      {
        id: 'demo-msg-018',
        sender: 'commandes@boutique-fictive.fr',
        recipients: [MAILBOX],
        days: 8,
        hour: 10,
        category: 'autre',
        priority: 1,
        status: 'REPLIED',
        summary: 'Confirmation automatique d’une commande passée.',
        action: 'Aucune action requise (déjà traité).',
        body: 'Votre commande a bien été enregistrée (démonstration).',
      },
    ],
  },
  {
    key: 't17',
    subject: 'Invitation à un salon professionnel',
    messages: [
      {
        id: 'demo-msg-019',
        sender: 'contact@salon-fictif.fr',
        recipients: [MAILBOX],
        days: 9,
        hour: 8,
        category: 'autre',
        priority: 2,
        status: 'TO_PROCESS',
        summary: 'Invitation à participer à un salon professionnel.',
        action: 'Décider de la participation et répondre.',
        body: 'Nous vous invitons à notre salon annuel (démonstration).',
      },
    ],
  },
  {
    key: 't18',
    subject: 'Problème technique sur la plateforme',
    messages: [
      {
        id: 'demo-msg-020',
        sender: 'marie.petit@client-fictif.fr',
        recipients: [MAILBOX],
        days: 10,
        hour: 13,
        category: 'client',
        priority: 3,
        status: 'DRAFT_READY',
        summary: 'Une cliente signale un problème technique bloquant.',
        action: 'Répondre avec une solution et un délai.',
        body: "Bonjour,\n\nJe ne parviens plus à accéder à mon espace. C’est urgent, cela bloque mon équipe.\n\nMarie",
      },
    ],
  },
  {
    key: 't19',
    subject: 'Newsletter : nouveautés produits',
    messages: [
      {
        id: 'demo-msg-021',
        sender: 'news@produit-fictif.io',
        recipients: [MAILBOX],
        days: 11,
        hour: 7,
        category: 'newsletter',
        priority: 1,
        status: 'IGNORED',
        summary: 'Newsletter présentant les nouveautés produits.',
        action: 'Aucune action requise.',
        body: 'Découvrez nos nouveautés (démonstration).',
      },
    ],
  },
  {
    key: 't20',
    subject: 'Relance offre commerciale',
    messages: [
      {
        id: 'demo-msg-022',
        sender: 'ventes@demarchage-fictif.net',
        recipients: [MAILBOX],
        days: 12,
        hour: 15,
        category: 'spam probable',
        priority: 1,
        status: 'IGNORED',
        summary: 'Relance commerciale non sollicitée.',
        action: 'Ignorer.',
        body: 'Dernière chance pour profiter de notre offre (démonstration).',
      },
    ],
  },
  {
    key: 't21',
    subject: 'Réunion de bilan trimestriel',
    messages: [
      {
        id: 'demo-msg-023',
        sender: 'direction@entreprise-fictive.fr',
        recipients: [MAILBOX],
        days: 13,
        hour: 9,
        category: 'rendez-vous',
        priority: 2,
        status: 'REPLIED',
        summary: 'Convocation à la réunion de bilan trimestriel.',
        action: 'Confirmer la présence (déjà traité).',
        body: 'La réunion de bilan est fixée à vendredi (démonstration).',
      },
    ],
  },
  {
    key: 't22',
    subject: 'Facture hébergement serveur',
    messages: [
      {
        id: 'demo-msg-024',
        sender: 'factures@hosting-fictif.com',
        recipients: [MAILBOX],
        days: 14,
        hour: 11,
        category: 'facture',
        priority: 2,
        status: 'REPLIED',
        summary: 'Facture d’hébergement du serveur mensuel.',
        action: 'Régler la facture (déjà traité).',
        body: 'Facture d’hébergement du mois (démonstration).',
      },
    ],
  },
  {
    key: 't23',
    subject: 'Demande de rendez-vous commercial',
    messages: [
      {
        id: 'demo-msg-025',
        sender: 'julien.moreau@prospect-fictif.fr',
        recipients: [MAILBOX],
        days: 15,
        hour: 14,
        category: 'rendez-vous',
        priority: 2,
        status: 'TO_PROCESS',
        summary: 'Un prospect souhaite un rendez-vous commercial.',
        action: 'Proposer un créneau.',
        body: 'Pouvons-nous convenir d’un rendez-vous ? (démonstration)',
      },
    ],
  },
  {
    key: 't24',
    subject: 'Retour sur la prestation livrée',
    messages: [
      {
        id: 'demo-msg-026',
        sender: 'emma.blanc@client-fictif.com',
        recipients: [MAILBOX],
        days: 16,
        hour: 10,
        category: 'client',
        priority: 2,
        status: 'TO_PROCESS',
        summary: 'La cliente commente la prestation récemment livrée.',
        action: 'Remercier et proposer un suivi.',
        body: 'Merci pour la prestation, quelques remarques ci-dessous (démonstration).',
      },
    ],
  },
  {
    key: 't25',
    subject: 'Notification de sécurité du compte',
    messages: [
      {
        id: 'demo-msg-027',
        sender: 'security@service-fictif.fr',
        recipients: [MAILBOX],
        days: 18,
        hour: 22,
        category: 'autre',
        priority: 2,
        status: 'TO_PROCESS',
        summary: 'Notification de connexion inhabituelle au compte.',
        action: 'Vérifier l’activité du compte.',
        body: 'Une connexion inhabituelle a été détectée (démonstration).',
      },
    ],
  },
  {
    key: 't26',
    subject: 'Offre d’emploi : développeur full-stack',
    messages: [
      {
        id: 'demo-msg-028',
        sender: 'rh@recrutement-fictif.fr',
        recipients: [MAILBOX],
        days: 20,
        hour: 9,
        category: 'autre',
        priority: 1,
        status: 'IGNORED',
        summary: 'Proposition de recrutement non pertinente.',
        action: 'Ignorer.',
        body: 'Nous recherchons un développeur full-stack (démonstration).',
      },
    ],
  },
  {
    key: 't27',
    subject: 'Confirmation d’inscription webinaire',
    messages: [
      {
        id: 'demo-msg-029',
        sender: 'webinaire@event-fictif.com',
        recipients: [MAILBOX],
        days: 22,
        hour: 16,
        category: 'autre',
        priority: 1,
        status: 'REPLIED',
        summary: 'Confirmation d’inscription à un webinaire.',
        action: 'Ajouter à l’agenda (déjà traité).',
        body: 'Votre inscription au webinaire est confirmée (démonstration).',
      },
    ],
  },
  {
    key: 't28',
    subject: 'Litige sur la facture de maintenance',
    messages: [
      {
        id: 'demo-msg-030',
        sender: 'thomas.leroy@client-fictif.fr',
        recipients: [MAILBOX],
        days: 25,
        hour: 12,
        category: 'facture',
        priority: 3,
        status: 'TO_PROCESS',
        summary: 'Le client conteste une facture de maintenance.',
        action: 'Examiner la contestation et répondre rapidement.',
        body: 'Je conteste le montant de la maintenance de ce trimestre (démonstration).',
      },
    ],
  },
];

async function seed() {
  await withTransaction(async (client) => {
    // --- demo user (idempotent upsert by normalized email) ---
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, display_name, mailbox_address)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (normalize_email(email))
       DO UPDATE SET password_hash = EXCLUDED.password_hash, display_name = EXCLUDED.display_name,
                     mailbox_address = EXCLUDED.mailbox_address, updated_at = now()
       RETURNING id`,
      [DEMO_EMAIL, passwordHash, 'Compte de démonstration', MAILBOX]
    );
    const userId = userRes.rows[0].id;

    let emailCount = 0;
    let threadCount = 0;

    for (const thread of THREADS) {
      const messages = thread.messages;
      const latest = messages.reduce((acc, m) => (m.days < acc.days ? m : acc), messages[0]);

      const threadRes = await client.query(
        `INSERT INTO threads (user_id, mailbox_address, gmail_thread_id, subject, latest_message_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, gmail_thread_id)
         DO UPDATE SET subject = EXCLUDED.subject, latest_message_at = EXCLUDED.latest_message_at, updated_at = now()
         RETURNING id`,
        [userId, MAILBOX, `demo-thread-${thread.key}`, thread.subject, daysAgo(latest.days, latest.hour)]
      );
      const threadId = threadRes.rows[0].id;
      threadCount += 1;

      for (const m of messages) {
        await client.query(
          `INSERT INTO emails (
             user_id, mailbox_address, gmail_message_id, thread_id, sender, recipients, subject,
             body_text, received_at, category, priority, summary, expected_action,
             needs_review, processing_status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (user_id, gmail_message_id)
           DO UPDATE SET
             category = EXCLUDED.category,
             priority = EXCLUDED.priority,
             summary = EXCLUDED.summary,
             expected_action = EXCLUDED.expected_action,
             needs_review = EXCLUDED.needs_review,
             processing_status = EXCLUDED.processing_status,
             updated_at = now()`,
          [
            userId,
            MAILBOX,
            m.id,
            threadId,
            m.sender,
            JSON.stringify(m.recipients),
            thread.subject,
            m.body,
            daysAgo(m.days, m.hour),
            m.category,
            m.priority,
            m.summary,
            m.action,
            m.needs_review || false,
            m.status,
          ]
        );
        emailCount += 1;
      }
    }

    // --- sync_state row for the configured mailbox (idempotent) ---
    await client.query(
      `INSERT INTO sync_state (user_id, mailbox_address, cursor)
       VALUES ($1, $2, NULL)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, MAILBOX]
    );

    // --- one sent reply + one failed reply for UI demonstration (idempotent) ---
    const repliedEmail = await client.query(
      `SELECT id, thread_id FROM emails WHERE gmail_message_id = 'demo-msg-008'`
    );
    if (repliedEmail.rowCount > 0) {
      const { id: emailId, thread_id: threadId } = repliedEmail.rows[0];
      await client.query(
        `INSERT INTO replies (user_id, thread_id, original_email_id, idempotency_key, body, status, sent_at, provider_message_id, attempt_count)
         VALUES ($1, $2, $3, $4, $5, 'SENT', now(), $6, 1)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
        [
          userId,
          threadId,
          emailId,
          'demo-reply-sent-008',
          "Bonjour,\n\nNous confirmons le règlement de la facture. Merci de votre confiance.\n\nCordialement,",
          'demo-provider-msg-008',
        ]
      );
    }

    const failedEmail = await client.query(
      `SELECT id, thread_id FROM emails WHERE gmail_message_id = 'demo-msg-006'`
    );
    if (failedEmail.rowCount > 0) {
      const { id: emailId, thread_id: threadId } = failedEmail.rows[0];
      await client.query(
        `INSERT INTO replies (user_id, thread_id, original_email_id, idempotency_key, body, status, error_code, error_message, attempt_count, last_attempt_at)
         VALUES ($1, $2, $3, $4, $5, 'FAILED', 'PROVIDER_REJECTED', 'The provider rejected the message.', 1, now())
         ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
        [userId, threadId, emailId, 'demo-reply-failed-006', 'Réponse de démonstration en échec.']
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      `[seed] demo user=${DEMO_EMAIL} threads=${threadCount} emails=${emailCount} (idempotent; userId=${userId})`
    );
  });
}

seed()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[seed] FAILED: ${err.message}`);
    closePool().finally(() => process.exit(1));
  });
