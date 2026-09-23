const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const analytics = require('../analytics-events.js');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const indexHtml = read('index.html');
const recoveryHtml = read('recovery.html');
const preparednessHtml = read('preparedness.html');
const successPaidHtml = read('recovery-plan-success.html');
const successHtml = read('success.html');
const imeiSuccessHtml = read('imei-success.html');
const privacyHtml = read('privacy.html');
const robots = read('robots.txt');
const vercel = JSON.parse(read('vercel.json'));
const analyticsSrc = read('analytics-events.js');
const analyticsPageInitSrc = read('analytics-page-init.js');
const core = read('recovery-plan-core.js');

const rootStaticAnalyticsPages = [
  'about.html',
  'contact.html',
  'privacy.html',
  'terms.html',
  'imei-check.html',
  'imei-success.html',
  'success.html',
  'blog1.html',
  'replacement-phone-guide.html'
];
const blogStaticAnalyticsPages = [
  'blog/index.html',
  'blog/how-to-report-lost-stolen-phone-carrier-2026.html',
  'blog/iphone-vs-android-safer-if-lost-2026.html',
  'blog/lost-android-checklist-2025.html',
  'blog/lost-iphone-checklist-2025.html',
  'blog/lost-iphone-dead-battery.html',
  'blog/lost-phone-airport-2025.html',
  'blog/lost-phone-at-bar-night-out-2026.html',
  'blog/lost-phone-at-concert-2026.html',
  'blog/lost-phone-holiday-party-2025.html',
  'blog/lost-phone-in-hotel-room-2026.html',
  'blog/lost-phone-in-taxi-uber-2026.html',
  'blog/lost-phone-statistics-2026.html',
  'blog/lost-phone-uber-lyft-2025.html',
  'blog/phone-insurance-theft-loss-2026.html',
  'blog/stolen-iphone-activation-lock-2026.html',
  'blog/top-10-tips-prevent-losing-phone-2026.html',
  'blog/ultimate-airtag-setup-2025.html'
];
const staticAnalyticsPages = [...rootStaticAnalyticsPages, ...blogStaticAnalyticsPages];

function headerBlock(source, hostPattern) {
  return vercel.headers.find((block) => {
    if (block.source !== source) return false;
    if (hostPattern) {
      return !!(block.has && hostPattern.test(JSON.stringify(block.has)));
    }
    return !block.has;
  });
}

function hasRobotsNoindex(block) {
  return !!(block && block.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow, noarchive'));
}

test('homepage is production-indexable and global noindex is removed', () => {
  assert.equal(/name="robots"[^>]*noindex/i.test(indexHtml), false);
  assert.equal(/name="robots"[^>]*noindex/i.test(privacyHtml), false);
  const globalHeaders = headerBlock('/(.*)');
  assert.ok(globalHeaders);
  assert.equal(hasRobotsNoindex(globalHeaders), false);
  assert.ok(globalHeaders.headers.some((header) => header.key === 'Content-Security-Policy'));
  assert.ok(globalHeaders.headers.some((header) => header.key === 'X-Content-Type-Options' && header.value === 'nosniff'));
});

test('production robots no longer globally disallow all', () => {
  assert.equal(/User-agent:\s*\*\s*Disallow:\s*\/\s*$/m.test(robots), false);
  assert.match(robots, /Allow:\s*\//);
  assert.match(robots, /Disallow:\s*\/recovery\.html/);
  assert.match(robots, /Disallow:\s*\/preparedness\.html/);
  assert.match(robots, /Disallow:\s*\/recovery-plan-success\.html/);
  assert.match(robots, /Disallow:\s*\/success\.html/);
  assert.match(robots, /Disallow:\s*\/imei-success\.html/);
  assert.match(robots, /Disallow:\s*\/api\//);
  assert.match(robots, /Disallow:\s*\/private\//);
});

test('sensitive pages remain noindex', () => {
  [recoveryHtml, preparednessHtml, successPaidHtml, successHtml, imeiSuccessHtml].forEach((html) => {
    assert.match(html, /noindex, nofollow, noarchive/);
  });
  ['/recovery.html', '/preparedness.html', '/recovery-plan-success.html', '/success.html', '/imei-success.html'].forEach((source) => {
    assert.equal(hasRobotsNoindex(headerBlock(source)), true, source);
  });
});

test('staging and preview hosts remain noindex', () => {
  const preview = headerBlock('/(.*)', /vercel/);
  assert.equal(hasRobotsNoindex(preview), true);
});

test('paid PDF protection is unchanged', () => {
  assert.ok(vercel.redirects.some((item) => item.source === '/private/:path*' && item.destination === '/404'));
  assert.equal(vercel.functions['api/recovery-plan-pdf.js'].includeFiles, 'private/paid-downloads/**');
  assert.match(core, /loadApprovedPdf/);
  assert.equal(/generatePdf\(mapped\.model\)/.test(core), false);
});

test('analytics production-only host gating is unchanged', () => {
  assert.equal(analytics.GA_MEASUREMENT_ID, 'G-VQ8XCGGXN7');
  assert.equal(analytics.CLARITY_PROJECT_ID, 'uivo0q97p5');
  assert.equal(analytics.isProductionHost('lostphones.com'), true);
  assert.equal(analytics.isProductionHost('www.lostphones.com'), true);
  assert.equal(analytics.isProductionHost('lostphones-v2-staging.vercel.app'), false);
  assert.equal(analytics.isProductionHost('localhost'), false);
  assert.match(analyticsSrc, /send_page_view:\s*false/);
});

test('all 27 static pages use the shared analytics layer and initializer', () => {
  assert.equal(staticAnalyticsPages.length, 27);
  staticAnalyticsPages.forEach((relative) => {
    const html = read(relative);
    const prefix = relative.startsWith('blog/') ? '../' : '';
    const layer = `<script src="${prefix}analytics-events.js"></script>`;
    const initializer = `<script src="${prefix}analytics-page-init.js"></script>`;
    assert.equal(html.includes('no-op: production analytics disabled in staging'), false, relative);
    assert.equal(/gtag\s*\(\s*['"]event/.test(html), false, relative);
    assert.equal(html.includes(layer), true, `${relative}: shared layer`);
    assert.equal(html.includes(initializer), true, `${relative}: initializer`);
    assert.ok(html.indexOf(layer) < html.indexOf(initializer), `${relative}: script ordering`);
  });
});

test('static initializer delegates only to the shared host-gated layer', () => {
  assert.match(analyticsPageInitSrc, /window\.LostPhonesAnalytics/);
  assert.match(analyticsPageInitSrc, /LostPhonesAnalytics\.init\(\)/);
  assert.equal(/G-[A-Z0-9]+/.test(analyticsPageInitSrc), false);
  assert.equal(/clarity/i.test(analyticsPageInitSrc), false);
  assert.equal(/hostname|location/.test(analyticsPageInitSrc), false);
});

test('all 31 public HTML pages have an approved shared analytics bootstrap', () => {
  const publicHtml = fs.readdirSync(root).filter((name) => name.endsWith('.html'))
    .concat(fs.readdirSync(path.join(root, 'blog')).filter((name) => name.endsWith('.html')).map((name) => `blog/${name}`));
  assert.equal(publicHtml.length, 31);
  publicHtml.forEach((relative) => {
    assert.match(read(relative), /analytics-events\.js/, relative);
  });
  assert.match(read('homepage.js'), /LostPhonesAnalytics\.init\(\)/);
  assert.match(read('recovery.js'), /analytics\.init\(\)/);
  assert.match(read('preparedness.js'), /analytics\.init\(\)/);
  assert.match(read('recovery-plan-success.js'), /analytics\.init\(\)/);
});

test('legacy success tokens are removed before the shared initializer runs', () => {
  [successHtml, imeiSuccessHtml].forEach((html) => {
    assert.ok(html.indexOf('history.replaceState') > -1);
    assert.ok(html.indexOf('history.replaceState') < html.indexOf('analytics-page-init.js'));
  });
  assert.ok(imeiSuccessHtml.indexOf("urlParams.get('session_id')") < imeiSuccessHtml.indexOf('history.replaceState'));
});

test('only the approved GA and Clarity production identifiers are present', () => {
  const sourceFiles = fs.readdirSync(root)
    .filter((name) => /\.(?:html|js)$/.test(name))
    .concat(fs.readdirSync(path.join(root, 'blog')).filter((name) => /\.(?:html|js)$/.test(name)).map((name) => `blog/${name}`));
  const combined = sourceFiles.map(read).join('\n');
  assert.deepEqual([...new Set(combined.match(/G-[A-Z0-9]+/g) || [])], ['G-VQ8XCGGXN7']);
  assert.equal(analytics.CLARITY_PROJECT_ID, 'uivo0q97p5');
});
