#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const content = require('../recovery-content.js');
const schema = require('../recovery-state-schema.js');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function fail(message) {
  console.error('validate:phase3 failed:', message);
  process.exit(1);
}

const requiredFiles = [
  'recovery-content.js',
  'recovery-logic.js',
  'recovery.js',
  'recovery.html',
  'recovery-state-schema.js',
  'recovery-session-client.js',
  'recovery-session-core.js',
  'api/recovery-session.js',
  'scripts/validate-phase3.cjs',
  'tests/recovery-journeys.test.cjs',
  'tests/recovery-session-schema.test.cjs',
  'tests/recovery-session-api.test.cjs'
];

for (const rel of requiredFiles) {
  if (!fs.existsSync(path.join(root, rel))) {
    fail('Missing required file: ' + rel);
  }
}

const requiredActions = [
  'personal-safety',
  'identify-platform',
  'apple-play-sound',
  'google-play-sound',
  'apple-locate-device',
  'google-locate-device',
  'apple-mark-lost',
  'google-mark-lost',
  'apple-auth-fallback',
  'google-auth-fallback',
  'protect-primary-account',
  'protect-mobile-line',
  'protect-financial-accounts',
  'report-and-document',
  'erase-device-decision',
  'recovered-device-security-check',
  'recovery-replacement-transition'
];

for (const actionId of requiredActions) {
  if (content.APPROVED_ACTION_IDS.indexOf(actionId) === -1) {
    fail('Missing registered action: ' + actionId);
  }
  const action = content.getAction(actionId, 'iphone') || content.getAction(actionId, 'android') || content.getAction(actionId, 'unsure');
  if (!action) fail('Missing action record: ' + actionId);
  if (!action.applicableConditions) fail('Missing applicable conditions: ' + actionId);
  if (!action.title || !action.instruction) fail('Missing approved copy: ' + actionId);
  if (!action.lastReviewed || !action.owner || !action.reviewTrigger) fail('Missing review metadata: ' + actionId);
  if (!action.boundedOutcomes || !action.boundedOutcomes.length) fail('Missing bounded outcomes: ' + actionId);
  if (!action.sourceUrl && !action.officialUrl && !action.supportSourceUrl && actionId.indexOf('protect-mobile') === -1 && actionId.indexOf('protect-financial') === -1 && actionId !== 'identify-platform' && actionId !== 'personal-safety' && !(actionId === 'protect-primary-account' && action.platform === 'unsure') && !(actionId === 'report-and-document' && action.platform === 'unsure')) {
    fail('Missing official/source URL: ' + actionId);
  }
}

content.actions.forEach((action) => {
  if (action.officialUrl && !content.isOfficialUrl(action.officialUrl)) {
    fail('officialUrl must be https: ' + action.actionId + '/' + action.platform);
  }
});

if (typeof content.isOfficialUrl !== 'function' || !content.isOfficialUrl(content.OFFICIAL_URLS.appleFind) || content.isOfficialUrl('#') || content.isOfficialUrl('javascript:alert(1)')) {
  fail('isOfficialUrl must accept https destinations and reject fake hrefs.');
}

if (schema.SCHEMA_VERSION !== 2) {
  fail('Schema version must be 2.');
}
if (schema.ENUMS.blockedReason.indexOf('could_not_secure_device') === -1) {
  fail('Schema must include could_not_secure_device.');
}
if (!content.BLOCKED_REASON_COPY.could_not_secure_device || !/not complete/.test(content.BLOCKED_REASON_COPY.could_not_secure_device)) {
  fail('Blocked copy for could_not_secure_device is missing.');
}

const api = read('api/recovery-session.js');
if (!api.includes('UPSTASH_REDIS_KV_REST_API_URL') || !api.includes('UPSTASH_REDIS_KV_REST_API_TOKEN')) {
  fail('API must initialize Redis with the staging KV REST URL and token.');
}
if (/Redis\.fromEnv\(/.test(api)) {
  fail('Do not use Redis.fromEnv(); staging uses custom-prefixed names.');
}

const core = read('recovery-session-core.js');
if (!core.includes('recovery:v1:') || !core.includes('sha256') || !core.includes('randomBytes(32)')) {
  fail('Resume tokens must be 32 random bytes, hashed with SHA-256, and stored as recovery:v1:<hash>.');
}
if (!core.includes('604800')) {
  fail('TTL must be exactly 604800 seconds.');
}

const client = read('recovery-session-client.js');
if (!client.includes('#resume=') || !client.includes('replaceState') || !client.includes('localStorage')) {
  fail('Resume client must use a fragment token, strip it, and isolate persistence.');
}
if (!/TOKEN_STORAGE_KEY|lostphones\.recoveryToken/.test(client)) {
  fail('Trusted persistence must store only the opaque token.');
}

const recoveryJs = read('recovery.js');
if (/localStorage|sessionStorage|document\.cookie/.test(recoveryJs)) {
  fail('recovery.js must not call storage APIs; persistence belongs in the session client.');
}
if (!recoveryJs.includes('Review erase option')) {
  fail('Stabilized view must offer Review erase option when erase is available.');
}

const recoveryHtml = read('recovery.html');
if (!/noopener noreferrer/.test(recoveryHtml + recoveryJs)) {
  fail('Official links must use noopener noreferrer.');
}
if (!/noindex, nofollow, noarchive/.test(recoveryHtml)) {
  fail('Recovery page must remain noindex/nofollow/noarchive.');
}
if (/<textarea|<input[^>]*(type="text"|type="email"|type="password")/i.test(recoveryHtml)) {
  fail('Recovery page must not collect free-form or credential fields.');
}

const vercel = JSON.parse(read('vercel.json'));
const recoveryHeaders = vercel.headers.find((block) => block.source === '/recovery.html');
if (!recoveryHeaders) {
  fail('vercel.json must set recovery-route headers.');
}
const referrer = recoveryHeaders.headers.find((header) => header.key === 'Referrer-Policy');
if (!referrer || referrer.value !== 'no-referrer') {
  fail('Recovery route must send Referrer-Policy: no-referrer.');
}
const robotsHeader = vercel.headers
  .flatMap((block) => block.headers)
  .find((header) => header.key === 'X-Robots-Tag');
if (!robotsHeader || robotsHeader.value !== 'noindex, nofollow, noarchive') {
  fail('X-Robots-Tag noindex/nofollow/noarchive must remain.');
}

const haystack = [
  recoveryHtml,
  read('index.html'),
  recoveryJs,
  read('recovery-logic.js'),
  read('recovery-content.js')
].join('\n');
if (/buy\.stripe\.com|js\.stripe\.com|G-KQTTP3KMKN|G-VQ8XCGGXN7|uivo0q97p5|clarity\.ms|indexnow/i.test(haystack)) {
  fail('Analytics IDs, IndexNow, or Stripe must not be activated inside recovery markup or recovery logic.');
}
if (/openai|anthropic|react|next\/|createRoot/.test(haystack)) {
  fail('Phase 3 must stay static HTML/CSS/JavaScript.');
}

const privacy = read('privacy.html');
if (!/seven days|7 days|seven-day/i.test(privacy) || !/SHA-256|hash/i.test(privacy)) {
  fail('Privacy policy must describe the hashed seven-day resume record.');
}

console.log('validate:phase3 passed');
