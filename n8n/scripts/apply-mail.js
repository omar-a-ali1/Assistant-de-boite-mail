#!/usr/bin/env node
/**
 * Imports IMAP/SMTP credentials and the four workflows into the running n8n
 * instance, then publishes the sync and reply workflows.
 *
 * Default: local GreenMail demo mailbox (demo@example.com / demo1234), no .env
 * secret required. Set MAILBOX_ADDRESS + GMAIL_APP_PASSWORD in .env to use a
 * real Gmail account instead.
 *
 * Usage:
 *   node n8n/scripts/apply-mail.js
 *   COMPOSE_FILE=fedora.compose.yaml node n8n/scripts/apply-mail.js
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const dotenv = require(path.join(root, 'apps/backend/node_modules/dotenv'));
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const composeFile =
  process.env.COMPOSE_FILE ||
  (fs.existsSync(path.join(root, 'fedora.compose.yaml'))
    ? 'fedora.compose.yaml'
    : 'docker-compose.yaml');
const compose = ['compose', '-f', composeFile];

function fail(message) {
  console.error(`[mail] ${message}`);
  process.exit(1);
}

function run(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    fail(`command failed: docker ${args.join(' ')}`);
  }
}

function execN8n(args) {
  run([...compose, 'exec', '-T', 'n8n', 'n8n', ...args]);
}

function execContainer(args) {
  run([...compose, 'exec', '-T', 'n8n', ...args]);
}

function waitForN8n() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync(
      'docker',
      [
        ...compose,
        'exec',
        '-T',
        'n8n',
        'wget',
        '-qO-',
        'http://localhost:5678/healthz',
      ],
      { cwd: root, stdio: 'ignore' }
    );
    if (result.status === 0) return;
    spawnSync('sleep', ['2']);
  }
  fail('n8n did not become healthy after recreation.');
}

function waitForGreenMail() {
  const port = Number(process.env.GREENMAIL_IMAP_PORT || 3143);
  const probe = `const net=require('net');const s=net.connect(${port},'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(3000,()=>{s.destroy();process.exit(1)})`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync(process.execPath, ['-e', probe], {
      cwd: root,
      stdio: 'ignore',
    });
    if (result.status === 0) return;
    spawnSync('sleep', ['2']);
  }
  fail(`GreenMail did not become reachable on 127.0.0.1:${port}.`);
}

const configuredMailbox = String(process.env.MAILBOX_ADDRESS || '').trim();
const configuredPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const requestedMode = String(process.env.MAIL_MODE || 'local').toLowerCase();
const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredMailbox);

let mailbox;
let password;
let imapHost;
let imapPort;
let imapSecure;
let smtpHost;
let smtpPort;
let smtpSecure;
let disableStartTls;
let mode;

if (requestedMode === 'gmail') {
  if (!isEmail || configuredMailbox.toLowerCase() === 'demo@example.com') {
    fail(
      'MAIL_MODE=gmail: MAILBOX_ADDRESS must be the real Gmail address that owns the App Password.'
    );
  }
  if (!configuredPassword) {
    fail(
      'MAIL_MODE=gmail: GMAIL_APP_PASSWORD is empty. Create an App Password at https://myaccount.google.com/apppasswords.'
    );
  }
  mode = 'gmail';
  mailbox = configuredMailbox;
  password = configuredPassword;
  imapHost = process.env.GMAIL_IMAP_HOST || 'imap.gmail.com';
  imapPort = Number(process.env.GMAIL_IMAP_PORT || 993);
  imapSecure = true;
  smtpHost = process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com';
  smtpPort = Number(process.env.GMAIL_SMTP_PORT || 465);
  smtpSecure = true;
  disableStartTls = false;
} else if (requestedMode === 'local') {
  mode = 'local';
  mailbox = 'demo@example.com';
  password = 'demo1234';
  imapHost = 'greenmail';
  imapPort = 3143;
  imapSecure = false;
  smtpHost = 'greenmail';
  smtpPort = 3025;
  smtpSecure = false;
  disableStartTls = true;
} else {
  fail(`MAIL_MODE must be "local" or "gmail" (got "${requestedMode}").`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'usts-gmail-'));
const credentials = [
  {
    id: 'usts-gmail-imap',
    name: 'Boîte mail IMAP',
    type: 'imap',
    data: {
      user: mailbox,
      password,
      host: imapHost,
      port: imapPort,
      secure: imapSecure,
      allowUnauthorizedCerts: false,
    },
  },
  {
    id: 'usts-gmail-smtp',
    name: 'Boîte mail SMTP',
    type: 'smtp',
    data: {
      user: mailbox,
      password,
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      disableStartTls,
      hostName: '',
    },
  },
];

const workflows = [
  '01-sync-gmail.json',
  '02-classification.json',
  '03-send-reply.json',
  '04-error-handler.json',
];

try {
  if (mode === 'local') {
    console.log('[mail] Using local GreenMail demo mailbox (demo@example.com).');
    run([...compose, 'up', '-d', 'greenmail']);
    waitForGreenMail();
  } else {
    console.log(`[mail] Using Gmail mailbox ${mailbox}.`);
  }

  // Start n8n if needed, then make sure it receives the mailbox selected above
  // (compose interpolation would otherwise reuse a Gmail MAILBOX_ADDRESS).
  const mailEnv = { ...process.env, MAILBOX_ADDRESS: mailbox };
  run([...compose, 'up', '-d', 'n8n'], { env: mailEnv });
  waitForN8n();

  const credentialsFile = path.join(tmp, 'credentials.json');
  fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });

  run([
    ...compose,
    'cp',
    credentialsFile,
    'n8n:/tmp/usts-gmail-credentials.json',
  ]);
  execN8n(['import:credentials', '--input=/tmp/usts-gmail-credentials.json']);

  for (const file of workflows) {
    const source = path.join(root, 'n8n', 'workflows', file);
    const target = `/tmp/usts-${file}`;
    run([...compose, 'cp', source, `n8n:${target}`]);
    execN8n(['import:workflow', `--input=${target}`]);
  }

  execContainer([
    'sh',
    '-c',
    'rm -f /tmp/usts-gmail-credentials.json /tmp/usts-*.json',
  ]);

  for (const id of ['usts-sync-gmail', 'usts-send-reply']) {
    execN8n(['publish:workflow', `--id=${id}`]);
  }

  if (String(process.env.AI_API_KEY || '').trim()) {
    execN8n(['publish:workflow', '--id=usts-classification']);
  } else {
    console.log(
      '[mail] AI_API_KEY is empty: classification workflow left inactive (imported emails need review).'
    );
  }

  console.log('[mail] credentials and workflows imported; recreating n8n...');
  run([...compose, 'up', '-d', '--force-recreate', 'n8n'], { env: mailEnv });

  waitForN8n();

  console.log(`[mail] done. Mailbox: ${mailbox}`);
  console.log(`[mail] Send an email to ${mailbox} to trigger the first IMAP sync.`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
