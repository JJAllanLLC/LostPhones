const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const analytics = require('../analytics-events.js');

const recoveryJs = fs.readFileSync(path.join(__dirname, '..', 'recovery.js'), 'utf8');
const successJs = fs.readFileSync(path.join(__dirname, '..', 'recovery-plan-success.js'), 'utf8');
const helperSrc = fs.readFileSync(path.join(__dirname, '..', 'analytics-events.js'), 'utf8');

function memoryStorage() {
  const data = Object.create(null);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    dump() {
      return data;
    }
  };
}

function mockDocument() {
  const scripts = [];
  const listeners = {};
  return {
    scripts,
    hidden: false,
    getElementById() {
      return null;
    },
    createElement(tag) {
      return { tagName: tag, async: false, src: '', id: '' };
    },
    head: {
      appendChild(el) {
        scripts.push(el);
      }
    },
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    }
  };
}

function gtagRecorder() {
  const calls = [];
  function gtag() {
    calls.push(Array.prototype.slice.call(arguments));
  }
  gtag.calls = calls;
  return gtag;
}

function enableProduction(overrides) {
  analytics.resetForTests();
  const gtag = (overrides && overrides.gtag) || gtagRecorder();
  const storage = (overrides && overrides.storage) || memoryStorage();
  const documentRef = (overrides && overrides.document) || mockDocument();
  const location = Object.assign({
    hostname: 'lostphones.com',
    origin: 'https://lostphones.com',
    pathname: '/recovery.html',
    search: '',
    hash: ''
  }, (overrides && overrides.location) || {});
  const win = Object.assign({
    addEventListener() {},
    document: documentRef,
    location: location,
    gtag: gtag
  }, (overrides && overrides.window) || {});
  const result = analytics.init(Object.assign({
    hostname: location.hostname,
    injectScripts: false,
    gtag: gtag,
    storage: storage,
    document: documentRef,
    window: win,
    location: location
  }, overrides || {}));
  return { gtag, storage, document: documentRef, window: win, location, result };
}

test('analytics does not initialize on script load', () => {
  analytics.resetForTests();
  assert.equal(analytics.getRuntime().initialized, false);
  assert.equal(analytics.getRuntime().enabled, false);
});

test('host gating enables only lostphones.com and www.lostphones.com', () => {
  const allowed = ['lostphones.com', 'www.lostphones.com'];
  const blocked = [
    'lostphones-v2-staging.vercel.app',
    'lostphones-git-v2-development.vercel.app',
    'example.vercel.app',
    'localhost',
    '127.0.0.1',
    'staging.lostphones.com',
    ''
  ];
  allowed.forEach((hostname) => {
    assert.equal(analytics.isProductionHost(hostname), true, hostname);
    analytics.resetForTests();
    const gtag = gtagRecorder();
    const init = analytics.init({ hostname, injectScripts: false, gtag });
    assert.equal(init.enabled, true, hostname);
    assert.ok(gtag.calls.some((call) => call[0] === 'event' && call[1] === 'page_view'), hostname);
  });
  blocked.forEach((hostname) => {
    assert.equal(analytics.isProductionHost(hostname), false, hostname);
    analytics.resetForTests();
    const gtag = gtagRecorder();
    const scripts = [];
    const documentRef = {
      getElementById() { return null; },
      createElement() { return { tagName: 'script', async: true, src: '', id: '' }; },
      head: { appendChild(el) { scripts.push(el); } }
    };
    const init = analytics.init({ hostname, injectScripts: true, gtag, document: documentRef, window: { document: documentRef, addEventListener() {} } });
    assert.equal(init.enabled, false, hostname);
    assert.equal(gtag.calls.length, 0, hostname);
    assert.equal(scripts.length, 0, hostname);
    const tracked = analytics.track('recovery_started');
    assert.equal(tracked.ok, true);
    assert.equal(tracked.dispatched, false);
    assert.equal(tracked.event.transport, 'disabled');
  });
});

test('init is idempotent and does not re-emit the safe page view', () => {
  const { gtag, result } = enableProduction();
  assert.equal(result.enabled, true);
  const pageViews = gtag.calls.filter((call) => call[0] === 'event' && call[1] === 'page_view');
  assert.equal(pageViews.length, 1);
  const second = analytics.init({ hostname: 'lostphones.com', injectScripts: false, gtag });
  assert.equal(second.duplicate, true);
  assert.equal(gtag.calls.filter((call) => call[0] === 'event' && call[1] === 'page_view').length, 1);
});

test('approved event allowlist is exact', () => {
  assert.deepEqual(analytics.ALLOWED_EVENTS.slice().sort(), [
    'checkout_started',
    'official_service_opened',
    'outcome_selected',
    'pdf_downloaded',
    'pdf_offer_viewed',
    'prevention_started',
    'purchase_completed',
    'recovery_started',
    'returned_to_lostphones',
    'stabilization_reached',
    'triage_completed'
  ]);
});

test('approved property allowlist is exact', () => {
  assert.deepEqual(analytics.ALLOWED_PROPERTY_NAMES.slice().sort(), [
    'action_type',
    'away_duration_bucket',
    'currency',
    'device_context',
    'incident_category',
    'outcome_category',
    'platform_category',
    'product',
    'provider',
    'stabilization_type',
    'value'
  ]);
});

test('unknown events and unknown properties are rejected', () => {
  analytics.resetForTests();
  assert.equal(analytics.track('unknown_event').ok, false);
  assert.equal(analytics.track('unknown_event').error, 'unknown-event');
  assert.equal(analytics.track('recovery_started', { extra: 'nope' }).ok, false);
  assert.equal(analytics.track('triage_completed', { platform_category: 'iphone', incident_category: 'lost', device_context: 'trusted', extra: true }).ok, false);
  assert.equal(analytics.track('checkout_started', { product: 'recovery_plan', value: 8.95, currency: 'USD', sessionId: 'cs_test' }).error, 'forbidden-property');
});

test('sensitive values, URLs, tokens, and free text are never dispatched', () => {
  const { gtag } = enableProduction();
  const rejected = [
    analytics.track('outcome_selected', { outcome_category: 'user@example.com' }),
    analytics.track('outcome_selected', { email: 'user@example.com' }),
    analytics.track('official_service_opened', { provider: 'apple', action_type: 'https://icloud.com' }),
    analytics.track('checkout_started', { product: 'recovery_plan', value: 8.95, currency: 'USD', session_id: 'cs_test_paid' }),
    analytics.track('purchase_completed', { product: 'recovery_plan', value: 8.95, currency: 'USD', token: 'resume-token' }),
    analytics.track('returned_to_lostphones', { provider: 'apple', action_type: 'locate', away_duration_bucket: 'under_1m', url: 'https://lostphones.com/recovery.html?session_id=abc' })
  ];
  rejected.forEach((result) => {
    assert.equal(result.ok, false);
  });
  const payload = JSON.stringify(gtag.calls);
  assert.equal(payload.includes('@'), false);
  assert.equal(payload.includes('session_id'), false);
  assert.equal(payload.includes('cs_test'), false);
  assert.equal(payload.includes('resume-token'), false);
});

test('safe page views exclude query strings and fragments', () => {
  analytics.resetForTests();
  const gtag = gtagRecorder();
  analytics.init({
    hostname: 'www.lostphones.com',
    injectScripts: false,
    gtag,
    location: {
      hostname: 'www.lostphones.com',
      origin: 'https://www.lostphones.com',
      pathname: '/recovery-plan-success.html',
      search: '?session_id=cs_test_paid&foo=bar',
      hash: '#resume=secret-token'
    }
  });
  const pageView = gtag.calls.find((call) => call[0] === 'event' && call[1] === 'page_view');
  assert.ok(pageView);
  assert.equal(pageView[2].page_location, 'https://www.lostphones.com/recovery-plan-success.html');
  const serialized = JSON.stringify(pageView);
  assert.equal(serialized.includes('?'), false);
  assert.equal(serialized.includes('#'), false);
  assert.equal(serialized.includes('session_id'), false);
  assert.equal(serialized.includes('resume'), false);
});

test('success page removes session_id before analytics initialization', () => {
  const replaceIdx = successJs.indexOf('replaceState');
  const initIdx = successJs.indexOf('analytics.init');
  assert.ok(replaceIdx >= 0);
  assert.ok(initIdx > replaceIdx);
  assert.match(successJs, /params\.get\('session_id'\)/);
  assert.match(successJs, /window\.location\.pathname/);
});

test('recovery consumes the resume fragment before Clarity initialization', () => {
  const consumeIdx = recoveryJs.indexOf('consumeResumeFragment');
  const initIdx = recoveryJs.indexOf('analytics.init');
  assert.ok(consumeIdx >= 0);
  assert.ok(initIdx > consumeIdx);
  assert.equal(helperSrc.includes('https://www.clarity.ms/tag/'), true);
  assert.equal(recoveryJs.includes('clarity.ms'), false);
  assert.equal(recoveryJs.includes('uivo0q97p5'), false);
});

test('official handoff marker stores only approved fields', () => {
  const { storage, gtag } = enableProduction();
  const opened = analytics.noteOfficialServiceOpened({
    actionId: 'apple-locate-device',
    officialProvider: 'Apple'
  });
  assert.equal(opened.ok, true);
  const raw = JSON.parse(storage.getItem(analytics.HANDOFF_STORAGE_KEY));
  assert.deepEqual(Object.keys(raw).sort(), ['action_type', 'left', 'opened_at', 'provider']);
  assert.equal(raw.provider, 'apple');
  assert.equal(raw.action_type, 'locate');
  assert.equal(raw.left, false);
  assert.equal(typeof raw.opened_at, 'number');
  const serialized = JSON.stringify(raw);
  assert.equal(serialized.includes('http'), false);
  assert.equal(serialized.includes('token'), false);
  assert.ok(gtag.calls.some((call) => call[0] === 'event' && call[1] === 'official_service_opened'));
});

test('return event requires an actual hidden or blurred state and fires once', () => {
  const { storage, gtag } = enableProduction();
  analytics.noteOfficialServiceOpened({ actionId: 'protect-mobile-line' });
  const before = gtag.calls.filter((call) => call[1] === 'returned_to_lostphones').length;
  assert.equal(analytics.maybeEmitReturn().dispatched, false);
  assert.equal(gtag.calls.filter((call) => call[1] === 'returned_to_lostphones').length, before);
  analytics.notePageHidden();
  const first = analytics.maybeEmitReturn();
  assert.equal(first.ok, true);
  assert.equal(first.dispatched, true);
  assert.equal(storage.getItem(analytics.HANDOFF_STORAGE_KEY), null);
  const properties = first.event.properties;
  assert.deepEqual(Object.keys(properties).sort(), ['action_type', 'away_duration_bucket', 'provider']);
  assert.equal(Object.prototype.hasOwnProperty.call(properties, 'success'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(properties, 'completed'), false);
  assert.equal(properties.provider, 'carrier');
  const second = analytics.maybeEmitReturn();
  assert.equal(second.dispatched, false);
  assert.equal(gtag.calls.filter((call) => call[1] === 'returned_to_lostphones').length, 1);
});

test('checkout events contain no Stripe identifiers', () => {
  const { gtag } = enableProduction();
  const ok = analytics.track('checkout_started', {
    product: 'recovery_plan',
    value: 8.95,
    currency: 'USD'
  });
  assert.equal(ok.ok, true);
  const call = gtag.calls.find((item) => item[1] === 'checkout_started');
  assert.ok(call);
  assert.deepEqual(call[2], { product: 'recovery_plan', value: 8.95, currency: 'USD' });
  assert.equal(JSON.stringify(call).includes('cs_'), false);
  assert.equal(JSON.stringify(call).includes('session'), false);
  const checkoutBlock = recoveryJs.match(/track\('checkout_started'[\s\S]*?\}\);/);
  assert.ok(checkoutBlock);
  assert.equal(/sessionId|cs_|url|email/.test(checkoutBlock[0]), false);
  assert.match(recoveryJs, /result && result\.ok && result\.url/);
  assert.ok(recoveryJs.indexOf("track('checkout_started'") > recoveryJs.indexOf('startCheckout'));
});

test('purchase event requires a verified payment result', () => {
  const verifyIdx = successJs.indexOf("application/pdf");
  const purchaseIdx = successJs.indexOf("purchase_completed");
  const fetchIdx = successJs.indexOf('/api/recovery-plan-pdf');
  assert.ok(fetchIdx >= 0 && verifyIdx > fetchIdx);
  assert.ok(purchaseIdx > verifyIdx);
  assert.match(successJs, /if \(!response\.ok \|\| type\.indexOf\('application\/pdf'\) === -1\) \{\s*showError\(\);/);
  assert.ok(successJs.indexOf("purchase_completed") > successJs.indexOf('link.click()'));
});

test('Clarity does not receive sensitive custom tags or user IDs', () => {
  assert.equal(analytics.CLARITY_PROJECT_ID, 'uivo0q97p5');
  assert.equal(analytics.GA_MEASUREMENT_ID, 'G-VQ8XCGGXN7');
  assert.equal(/clarity\(\s*['"]identify/.test(helperSrc), false);
  assert.equal(/clarity\(\s*['"]set/.test(helperSrc), false);
  analytics.resetForTests();
  const gtag = gtagRecorder();
  const documentRef = mockDocument();
  const win = {
    addEventListener() {},
    document: documentRef,
    location: { hostname: 'lostphones.com', origin: 'https://lostphones.com', pathname: '/' },
    gtag
  };
  analytics.init({
    hostname: 'lostphones.com',
    injectScripts: true,
    gtag,
    document: documentRef,
    window: win,
    location: win.location
  });
  assert.ok(documentRef.scripts.some((script) => script.src === 'https://www.clarity.ms/tag/uivo0q97p5'));
  assert.ok(documentRef.scripts.some((script) => script.src.indexOf('googletagmanager.com/gtag/js?id=G-VQ8XCGGXN7') !== -1));
  assert.equal(typeof win.clarity, 'function');
  assert.equal((win.clarity.q || []).length, 0);
  const config = gtag.calls.find((call) => call[0] === 'config');
  assert.equal(config[2].send_page_view, false);
});

test('once-per-attempt events are deduplicated', () => {
  const { gtag } = enableProduction();
  const first = analytics.track('recovery_started');
  const second = analytics.track('recovery_started');
  assert.equal(first.dispatched, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.dispatched, false);
  analytics.track('pdf_offer_viewed');
  analytics.track('pdf_offer_viewed');
  assert.equal(gtag.calls.filter((call) => call[1] === 'pdf_offer_viewed').length, 1);
  analytics.resetRecoveryAttempt();
  const third = analytics.track('recovery_started');
  assert.equal(third.dispatched, true);
});

test('pdf download again remains a legitimate download event', () => {
  const { gtag } = enableProduction();
  assert.equal(analytics.track('purchase_completed', { product: 'recovery_plan', value: 8.95, currency: 'USD' }).dispatched, true);
  assert.equal(analytics.track('purchase_completed', { product: 'recovery_plan', value: 8.95, currency: 'USD' }).duplicate, true);
  assert.equal(analytics.track('pdf_downloaded', { product: 'recovery_plan' }).dispatched, true);
  assert.equal(analytics.track('pdf_downloaded', { product: 'recovery_plan' }).dispatched, true);
  assert.equal(gtag.calls.filter((call) => call[1] === 'pdf_downloaded').length, 2);
});
