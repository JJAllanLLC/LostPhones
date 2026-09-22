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
const core = read('recovery-plan-core.js');

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
