#!/usr/bin/env node
/**
 * scripts/set-firebase-sa-secret.js
 * Shadow Reaper — Safe Firebase Service Account Secret Setter
 *
 * Reads the service account JSON from a local file (NEVER committed),
 * validates it is parseable JSON, then pipes it to wrangler secret put.
 *
 * Usage:
 *   node scripts/set-firebase-sa-secret.js /path/to/service-account.json
 *
 * The file is read, validated, and piped to wrangler without any terminal
 * quoting, escaping, or truncation artifacts.
 *
 * SECURITY:
 *   - The JSON file must NOT be inside the project directory
 *   - The file path is never logged
 *   - The JSON content is never printed
 *   - After running this script, delete the JSON file immediately
 */

'use strict';

const fs           = require('fs');
const path         = require('path');
const { spawnSync } = require('child_process');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/set-firebase-sa-secret.js /path/to/service-account.json');
  process.exit(1);
}

const absPath = path.resolve(filePath);

// Read file
let raw;
try {
  raw = fs.readFileSync(absPath, 'utf8').trim();
} catch (e) {
  console.error('Cannot read file:', e.message);
  process.exit(1);
}

// Validate it is parseable JSON with required service account fields
let sa;
try {
  sa = JSON.parse(raw);
} catch (e) {
  console.error('File is not valid JSON:', e.message);
  process.exit(1);
}

const required = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email'];
for (const field of required) {
  if (!sa[field]) {
    console.error('Missing required field in service account JSON: ' + field);
    process.exit(1);
  }
}

if (sa.type !== 'service_account') {
  console.error('JSON type field is not "service_account". Got: ' + sa.type);
  process.exit(1);
}

// Safe diagnostics only — never print the actual values
console.log('Service account validation:');
console.log('  type         :', sa.type);
console.log('  project_id   :', sa.project_id);
console.log('  private_key  : [present, length=' + sa.private_key.length + ']');
console.log('  client_email : [present]');
console.log('  JSON length  :', raw.length, 'chars');
console.log('  First char   :', raw[0], '(should be {)');
console.log('');

if (raw[0] !== '{') {
  console.error('JSON does not start with {. Aborting.');
  process.exit(1);
}

console.log('Piping to: wrangler secret put FIREBASE_SERVICE_ACCOUNT ...');

// Pipe the raw JSON directly to wrangler — no shell quoting
const result = spawnSync(
  'npx',
  ['wrangler', 'secret', 'put', 'FIREBASE_SERVICE_ACCOUNT',
   '--config', 'cloudflare/wrangler-cloud.toml'],
  {
    input:  raw,
    stdio:  ['pipe', 'inherit', 'inherit'],
    cwd:    path.resolve(__dirname, '..'),
    encoding: 'utf8',
  }
);

if (result.status !== 0) {
  console.error('wrangler secret put failed with exit code:', result.status);
  process.exit(1);
}

console.log('');
console.log('Secret FIREBASE_SERVICE_ACCOUNT set successfully.');
console.log('');
console.log('IMPORTANT: Delete the service account JSON file now:');
console.log('  rm "' + absPath + '"');
console.log('  (Do not commit it. Do not leave it on disk.)');
