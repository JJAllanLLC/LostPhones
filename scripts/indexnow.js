#!/usr/bin/env node
/**
 * IndexNow submission is gated and off by default.
 *
 * This script MUST NOT make any network request unless BOTH:
 *   INDEXNOW_ENABLED=true
 *   APP_ENV=production
 *
 * Staging default: no network submission.
 * This protection is staging-only and must be removed or conditioned
 * safely before any future production launch.
 */

const enabled = process.env.INDEXNOW_ENABLED === 'true';
const isProduction = process.env.APP_ENV === 'production';

if (!enabled || !isProduction) {
  console.log(
    'IndexNow skipped: requires INDEXNOW_ENABLED=true and APP_ENV=production. Default is no network submission.'
  );
  process.exit(0);
}

const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
if (!siteUrl) {
  console.error('IndexNow aborted: SITE_URL is required when IndexNow is enabled.');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');
const keyPath = path.join(__dirname, '..', 'key.txt');
const key = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8').trim() : '';
if (!key) {
  console.error('IndexNow aborted: key file missing.');
  process.exit(1);
}

const urls = [
  `${siteUrl}/`,
  `${siteUrl}/start`,
  `${siteUrl}/blog/index.html`,
  `${siteUrl}/imei-check.html`,
  `${siteUrl}/replacement-phone-guide.html`
];

Promise.all(
  urls.map((url) => {
    const endpoint = `https://www.bing.com/indexnow?url=${encodeURIComponent(url)}&key=${encodeURIComponent(key)}`;
    return fetch(endpoint).then((res) => {
      if (!res.ok) {
        throw new Error(`IndexNow failed for a URL with status ${res.status}`);
      }
    });
  })
)
  .then(() => {
    console.log('IndexNow submitted for production URLs.');
  })
  .catch((err) => {
    console.error('IndexNow submission failed:', err.message);
    process.exit(1);
  });
