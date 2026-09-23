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
  'tests/analytics-events.test.cjs',
  'tests/recovery-plan-core.test.cjs',
  'tests/recovery-plan-api.test.cjs',
  'tests/production-readiness.test.cjs',
  'scripts/validate-phase4.cjs',
  'api/create-checkout-session.js',
  'checkout.js',
  'success.html',
  'LostPhones-Premium-Guide.pdf',
  'private/paid-downloads/LostPhones_Complete_Recovery_Protection_Plan_2026_Final.pdf'
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
if (!/Don't wait\. Be prepared\./.test(indexHtml) || !/Protect your phone\./.test(indexHtml)) {
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
if (!/Your emergency is handled\. Don’t leave the rest to memory\./.test(recoveryHtml)) {
  fail('Paid offer title is missing.');
}
if (!/Get My Complete Recovery &amp; Protection Plan — \$8\.95/.test(recoveryHtml)) {
  fail('Paid offer CTA is missing.');
}
if (!/Continue with free recovery guidance/.test(recoveryHtml)) {
  fail('Paid offer dismiss copy is missing.');
}
if (!/My Complete Recovery &amp; Protection Plan/.test(recoveryHtml)) {
  fail('Paid offer product name is missing.');
}
if (!/22 pages\. One-time purchase\. No subscription\. Yours to keep\./.test(recoveryHtml)) {
  fail('Paid offer value line is missing.');
}
if (!/Instant download after purchase/.test(recoveryHtml)) {
  fail('Paid offer download reassurance is missing.');
}
if (/Optional complete recovery PDF|Personalized recovery record|private copy of this journey/.test(recoveryHtml)) {
  fail('Paid offer must not use session-copy or personalized PDF positioning.');
}
if (/localStorage|sessionStorage|document\.cookie/.test(recoveryJs + recoveryHtml)) {
  fail('recovery.js/html must not call storage APIs.');
}

const core = read('recovery-plan-core.js');
if (!core.includes('https://lostphones.com') || !core.includes('https://lostphones-v2-staging.vercel.app')) {
  fail('SITE_URL must be validated against production and staging origins.');
}
if (!core.includes('recovery-plan:v1:') || !core.includes('604800')) {
  fail('Purchase context must use recovery-plan:v1:<hash> and a 604800-second TTL.');
}
if (!core.includes('sk_live_') || !core.includes('rk_live_') || !core.includes('sk_test_')) {
  fail('Checkout config must separate live and test Stripe keys.');
}
if (!core.includes('test-key') || !core.includes('live-key') || !core.includes('test-price')) {
  fail('Checkout config must fail closed on mixed Stripe environments.');
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
if (!/loadApprovedPdf/.test(core + pdfApi)) fail('Paid fulfillment must load the approved static PDF.');
if (/generatePdf\(mapped\.model\)/.test(core) || /generatePdf: pdf\.generatePdf/.test(pdfApi)) {
  fail('Paid fulfillment must not generate a runtime PDF.');
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
const globalHeaders = vercel.headers.find((block) => block.source === '/(.*)' && !block.has);
if (globalHeaders && globalHeaders.headers.some((header) => header.key === 'X-Robots-Tag')) {
  fail('Global X-Robots-Tag must not noindex production.');
}
['/preparedness.html', '/recovery-plan-success.html'].forEach((source) => {
  const block = vercel.headers.find((item) => item.source === source);
  if (!block || !block.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow, noarchive')) {
    fail('Sensitive route must remain noindex: ' + source);
  }
});
const previewRobots = vercel.headers.find((block) => block.source === '/(.*)' && block.has && /vercel/.test(JSON.stringify(block.has)));
if (!previewRobots || !previewRobots.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow, noarchive')) {
  fail('Preview/staging hosts must remain noindex.');
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
if (!analytics.includes('G-VQ8XCGGXN7')) fail('GA4 measurement ID is missing.');
if (!analytics.includes('uivo0q97p5')) fail('Clarity project ID is missing.');
if (!/send_page_view:\s*false/.test(analytics)) fail('GA4 must disable automatic page views.');
if (!analytics.includes('lostphones.com') || !analytics.includes('www.lostphones.com')) {
  fail('Production host gating is missing.');
}
if (!/vercel\.app/.test(analytics) && !/isProductionHost/.test(analytics)) {
  fail('Analytics must stay disabled outside the production hosts.');
}
if (!/function init\s*\(/.test(analytics)) fail('Analytics must expose init().');
if (!analytics.includes('lostphones.analytics.pendingOfficialHandoff')) {
  fail('Official-service return marker is missing.');
}
if (/clarity\(\s*['"]identify|clarity\(\s*['"]set/.test(analytics)) {
  fail('Clarity must not receive custom tags or user IDs.');
}

console.log('validate:phase4 passed');
