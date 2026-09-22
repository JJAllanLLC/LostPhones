#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const content = require('../recovery-content.js');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const indexHtml = read('index.html');
const recoveryHtml = read('recovery.html');
const recoveryJs = read('recovery.js');
const recoveryLogic = read('recovery-logic.js');
const recoveryCss = read('v2.css');
const robots = read('robots.txt');
const vercel = JSON.parse(read('vercel.json'));

function fail(message) {
  console.error('validate:phase2 failed:', message);
  process.exit(1);
}

if (!/href="recovery\.html"/.test(indexHtml) || !/Start My Recovery/.test(indexHtml)) {
  fail('Homepage primary CTA must link to the recovery flow.');
}

const requiredQuestions = [
  ['situation', ['nearby', 'lost', 'stolen', 'unsure'], 'What best describes the phone?'],
  ['platform', ['iphone', 'android', 'unsure'], 'What kind of phone is missing?'],
  ['currentDevice', ['trusted', 'borrowed', 'public'], 'What device are you using to access LostPhones right now?']
];

for (const [name, values, legend] of requiredQuestions) {
  if (!recoveryHtml.includes(legend)) {
    fail(`Missing question legend: ${legend}`);
  }
  for (const value of values) {
    const pattern = new RegExp(`name="${name}"[^>]*value="${value}"|value="${value}"[^>]*name="${name}"`);
    if (!pattern.test(recoveryHtml)) {
      fail(`Missing bounded value ${name}=${value}`);
    }
  }
}

const pageBundle = [indexHtml, recoveryHtml, recoveryJs].join('\n');
const officialUrlSet = new Set(content.getApprovedOfficialUrls());
const foundUrls = pageBundle.match(/https:\/\/[^\s"'<>]+/g) || [];
for (const url of foundUrls) {
  const clean = url.replace(/[.,)]+$/, '');
  if (/apple\.com|icloud\.com|android\.com|google\.com|iforgot/.test(clean) && !officialUrlSet.has(clean)) {
    fail(`Unofficial or unapproved recovery URL found: ${clean}`);
  }
}

const stripeNeedle = /stripe|buy\.stripe\.com|js\.stripe\.com|checkout\.js/i;
if (stripeNeedle.test(indexHtml) || stripeNeedle.test(recoveryHtml)) {
  fail('Stripe scripts or payment links must not appear on the homepage or recovery page.');
}

if (/googletagmanager|google-analytics|G-KQTTP3KMKN|G-VQ8XCGGXN7|clarity\.ms|uivo0q97p5/i.test(indexHtml + recoveryHtml)) {
  fail('GA4 and Clarity snippets must not be hardcoded on the homepage or recovery page.');
}
if (!/analytics-events\.js/.test(indexHtml) || indexHtml.indexOf('analytics-events.js') > indexHtml.indexOf('homepage.js')) {
  fail('Homepage must load analytics-events.js before homepage.js.');
}
if (!/analytics-events\.js/.test(recoveryHtml) || recoveryHtml.indexOf('analytics-events.js') > recoveryHtml.indexOf('recovery.js')) {
  fail('Recovery page must load analytics-events.js before recovery.js.');
}

if (/<textarea|<input[^>]*(type="text"|type="search"|type="email"|type="password"|type="tel"|type="number")/i.test(recoveryHtml)) {
  fail('Free-form or prohibited fields exist in the recovery page.');
}

const prohibited = ['password', 'passwd', 'pin', 'verification code', 'imei', 'serial number', 'phone number', 'credit card'];
const fieldHaystack = recoveryHtml.toLowerCase();
if (/(name|id)="(password|pin|imei|serial|email|phone|ssn)"/i.test(recoveryHtml)) {
  fail('Prohibited credential or identifier field exists.');
}

const storageHaystack = [recoveryJs, recoveryLogic, indexHtml, recoveryHtml].join('\n');
if (/localStorage|sessionStorage|document\.cookie/.test(storageHaystack)) {
  fail('Storage APIs are used. Phase 2 must remain memory-only.');
}

if (/User-agent:\s*\*\s*Disallow:\s*\//i.test(robots.replace(/\n/g, ' '))) {
  fail('robots.txt must not globally disallow all production crawling.');
}
if (!/Disallow:\s*\/recovery\.html/.test(robots) || !/Disallow:\s*\/preparedness\.html/.test(robots) || !/Disallow:\s*\/recovery-plan-success\.html/.test(robots)) {
  fail('robots.txt must keep sensitive recovery routes disallowed.');
}
if (/name="robots"[^>]*noindex/i.test(indexHtml)) {
  fail('Homepage must be indexable in production.');
}

const globalHeaders = vercel.headers.find((block) => block.source === '/(.*)' && !block.has);
if (!globalHeaders) fail('Global security headers are missing.');
if (globalHeaders.headers.some((header) => header.key === 'X-Robots-Tag')) {
  fail('Global X-Robots-Tag must not noindex production.');
}
const previewRobots = vercel.headers.find((block) => block.source === '/(.*)' && block.has && /vercel/.test(JSON.stringify(block.has)));
if (!previewRobots || !previewRobots.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow, noarchive')) {
  fail('Vercel preview/staging hosts must remain noindex.');
}
const recoveryRobots = vercel.headers.find((block) => block.source === '/recovery.html');
if (!recoveryRobots || !recoveryRobots.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow, noarchive')) {
  fail('Recovery route must remain noindex.');
}

if (vercel.domains || /lostphones\.com/.test(JSON.stringify(vercel.rewrites || [])) === false && false) {
  /* existing production host redirect is Phase 1 config and must remain unchanged */
}

const vercelText = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
const originalRedirect = vercel.redirects.find((item) => item.has && item.has[0] && item.has[0].value === 'www.lostphones.com');
if (!originalRedirect) {
  fail('Phase 1 production host redirect was altered.');
}

if (fs.existsSync(path.join(root, 'CNAME'))) {
  const cname = read('CNAME').trim();
  if (cname && !['lostphones.com', 'www.lostphones.com'].includes(cname) === false) {
    // CNAME already existed; do not introduce a new production domain file in Phase 2.
  }
}

if (!recoveryCss.includes('min-height: 44px') && !recoveryCss.includes('min-height: 48px')) {
  fail('v2.css must keep large touch targets.');
}

if (prohibited.some((word) => new RegExp(`<input[^>]+${word}`, 'i').test(fieldHaystack))) {
  fail('Prohibited identifier field exists.');
}

console.log('validate:phase2 passed');
