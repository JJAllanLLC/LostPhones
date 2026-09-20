#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function fail(message) {
  console.error('validate:phase4 failed:', message);
  process.exit(1);
}

const requiredFiles = [
  'preparedness.html',
  'preparedness-state-schema.js',
  'preparedness-content.js',
  'preparedness-logic.js',
  'preparedness-recommendations.js',
  'preparedness.js',
  'analytics-events.js',
  'recovery-plan-core.js',
  'recovery-plan-pdf.js',
  'recovery-plan-success.html',
  'recovery-plan-success.js',
  'recovery-plan-client.js',
  'api/recovery-plan-checkout.js',
  'api/recovery-plan-pdf.js',
  'tests/preparedness-logic.test.cjs',
  'tests/recovery-plan-core.test.cjs',
  'tests/recovery-plan-api.test.cjs',
  'scripts/validate-phase4.cjs',
  'api/create-checkout-session.js',
  'checkout.js',
  'success.html',
  'LostPhones-Premium-Guide.pdf'
];

for (const rel of requiredFiles) {
  if (!fs.existsSync(path.join(root, rel))) {
    fail('Missing required file: ' + rel);
  }
}

const indexHtml = read('index.html');
if (!/Start My Recovery/.test(indexHtml) || !/href="recovery\.html"/.test(indexHtml)) {
  fail('Homepage primary CTA must remain Start My Recovery.');
}
if (!/Not an emergency\? Protect yourself before it happens\./.test(indexHtml)) {
  fail('Homepage must use the approved preparedness prompt.');
}
if (!/Build My Safety Plan/.test(indexHtml) || !/preparedness\.html/.test(indexHtml)) {
  fail('Homepage must link Build My Safety Plan to preparedness.html.');
}
if (/coming-later/.test(indexHtml)) {
  fail('Homepage coming-later dialog must be removed.');
}

const recoveryHtml = read('recovery.html');
const recoveryJs = read('recovery.js');
if (!/Optional complete recovery PDF/.test(recoveryHtml)) {
  fail('Paid offer title is missing.');
}
if (!/Download my complete recovery PDF — \$8\.95/.test(recoveryHtml)) {
  fail('Paid offer CTA is missing.');
}
if (!/No thanks — continue free/.test(recoveryHtml)) {
  fail('Paid offer dismiss copy is missing.');
}
if (/localStorage|sessionStorage|document\.cookie/.test(recoveryJs + recoveryHtml)) {
  fail('recovery.js/html must not call storage APIs.');
}

const core = read('recovery-plan-core.js');
if (!core.includes('https://lostphones-v2-staging.vercel.app')) {
  fail('SITE_URL must be validated against the exact staging origin.');
}
if (!core.includes('recovery-plan:v1:') || !core.includes('604800')) {
  fail('Purchase context must use recovery-plan:v1:<hash> and a 604800-second TTL.');
}
if (!core.includes('sk_live_') || !core.includes('rk_live_')) {
  fail('Checkout config must reject live Stripe keys.');
}
if (/payment_method_types\s*:/.test(core)) {
  fail('Checkout must omit payment_method_types.');
}

const checkoutApi = read('api/recovery-plan-checkout.js');
const pdfApi = read('api/recovery-plan-pdf.js');
if (!checkoutApi.includes('process.env.STRIPE_SECRET_KEY') && !core.includes('STRIPE_SECRET_KEY')) {
  fail('Stripe secret must be read from process.env at runtime.');
}
if (/console\.(log|info|debug|error)\([^)]*(body|state|token|session|pdf)/i.test(checkoutApi + pdfApi + core)) {
  fail('Sensitive checkout or PDF data must not be logged.');
}
if (/STRIPE_WEBHOOK_SECRET/.test(checkoutApi + pdfApi + core + read('.env.example'))) {
  fail('Do not add STRIPE_WEBHOOK_SECRET.');
}

const successJs = read('recovery-plan-success.js');
if (!successJs.includes('replaceState') || !successJs.includes('/api/recovery-plan-pdf')) {
  fail('Success page must strip the session id and POST it to the PDF endpoint.');
}

const preparednessHtml = read('preparedness.html');
const recommendations = read('preparedness-recommendations.js');
const preparednessContent = read('preparedness-content.js');
if (!/As an Amazon Associate, LostPhones earns from qualifying purchases\./.test(preparednessContent)) {
  fail('Page-level Amazon Associate disclosure is missing.');
}
if (!/We may earn a commission from qualifying purchases or referrals, at no extra cost to you\./.test(preparednessContent + recommendations)) {
  fail('Commercial card disclosure is missing.');
}
if (!recommendations.includes('tag=lostphones-20')) {
  fail('Amazon tracking ID lostphones-20 is missing from the registry.');
}
if (!recommendations.includes("id: 'travel-connectivity-provider'") || !recommendations.includes('active: false')) {
  fail('Inactive travel connectivity record is missing.');
}
if (/\bbest\b/i.test(preparednessContent + read('preparedness.js') + preparednessHtml)) {
  fail('Preparedness copy must not say best.');
}
if (!recommendations.includes('forbidden-copy')) {
  fail('Recommendation records must reject forbidden copy.');
}
if (!/nofollow sponsored noopener noreferrer/.test(recommendations)) {
  fail('Commercial links must use nofollow sponsored noopener noreferrer.');
}

const pkg = JSON.parse(read('package.json'));
if (!pkg.dependencies['pdf-lib']) fail('pdf-lib must be a dependency.');
if (!pkg.scripts['validate:phase4']) fail('validate:phase4 script is missing.');
if (!/preparedness-logic\.test\.cjs/.test(pkg.scripts.test)) fail('npm test must include Phase 4 tests.');

const vercel = JSON.parse(read('vercel.json'));
const robotsHeader = vercel.headers.flatMap((block) => block.headers).find((header) => header.key === 'X-Robots-Tag');
if (!robotsHeader || robotsHeader.value !== 'noindex, nofollow, noarchive') {
  fail('X-Robots-Tag noindex/nofollow/noarchive must remain.');
}
const originalRedirect = vercel.redirects.find((item) => item.has && item.has[0] && item.has[0].value === 'www.lostphones.com');
if (!originalRedirect) fail('Phase 1 production host redirect was altered.');
['/preparedness.html', '/recovery-plan-success.html', '/api/recovery-plan-checkout', '/api/recovery-plan-pdf'].forEach((source) => {
  const block = vercel.headers.find((item) => item.source === source);
  if (!block) fail('Missing no-store/no-referrer headers for ' + source);
  const referrer = block.headers.find((header) => header.key === 'Referrer-Policy');
  const cache = block.headers.find((header) => header.key === 'Cache-Control');
  if (!referrer || referrer.value !== 'no-referrer') fail('Referrer-Policy no-referrer missing for ' + source);
  if (!cache || cache.value.indexOf('no-store') === -1) fail('Cache-Control no-store missing for ' + source);
});

const haystack = [
  indexHtml,
  recoveryHtml,
  recoveryJs,
  read('recovery-logic.js'),
  preparednessHtml
].join('\n');
if (/GoldenRetriever|goldenretriever\.hair/i.test(haystack)) {
  fail('GoldenRetriever.hair must remain untouched.');
}
if (/buy\.stripe\.com|js\.stripe\.com/i.test(indexHtml + recoveryHtml + preparednessHtml)) {
  fail('Stripe.js must not be loaded on marketing or recovery pages.');
}

const legacy = read('api/create-checkout-session.js');
if (!legacy.includes('STRIPE_IMEI_PRICE_ID') || !legacy.includes('metadata: { imei }')) {
  fail('Legacy IMEI checkout must remain in place.');
}

const analytics = read('analytics-events.js');
if (!analytics.includes("transport: 'local-only'") && !analytics.includes('local-only')) {
  fail('Analytics must remain local-only by default.');
}

console.log('validate:phase4 passed');
