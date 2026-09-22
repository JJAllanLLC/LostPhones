const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { PDFDocument } = require('pdf-lib');
const logic = require('../recovery-logic.js');
const plan = require('../recovery-plan-core.js');
const pdf = require('../recovery-plan-pdf.js');
const sessionCore = require('../recovery-session-core.js');

function triage(situation, platform, currentDevice) {
  let view = { state: logic.createInitialState() };
  view = logic.answerQuestion(view.state, 'situation', situation);
  view = logic.answerQuestion(view.state, 'platform', platform);
  view = logic.answerQuestion(view.state, 'currentDevice', currentDevice);
  return view;
}

function stabilizeIphone() {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  return view;
}

function stabilizeAndroid() {
  let view = triage('stolen', 'android', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'google-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'google-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  return view;
}

function stabilizeWithBlockers() {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'cannot_access_carrier');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  return view;
}

function pdfVisibleText(bytes) {
  const raw = Buffer.from(bytes).toString('latin1');
  const parts = [raw];
  const re = /stream\r?\n([\s\S]*?)\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const payload = Buffer.from(match[1], 'latin1');
    try {
      const inflated = zlib.inflateSync(payload).toString('latin1');
      parts.push(inflated.replace(/<([0-9A-Fa-f]+)>/g, function (_, hex) {
        return Buffer.from(hex, 'hex').toString('latin1');
      }));
    } catch (error) {
      try {
        const inflated = zlib.inflateRawSync(payload).toString('latin1');
        parts.push(inflated.replace(/<([0-9A-Fa-f]+)>/g, function (_, hex) {
          return Buffer.from(hex, 'hex').toString('latin1');
        }));
      } catch (ignored) {
        // Non-deflate streams are ignored.
      }
    }
  }
  return parts.join('\n');
}

function recoverIphone() {
  let view = triage('nearby', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-play-sound', 'heard_nearby');
  view = logic.answerQuestion(view.state, 'recovered', 'yes');
  view = logic.answerQuestion(view.state, 'unlockRisk', 'probably_not');
  view = logic.answerQuestion(view.state, 'suspiciousActivity', 'no');
  return view;
}

function failedLostMode() {
  const locate = 'apple-locate-device';
  const mark = 'apple-mark-lost';
  let view = triage('lost', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, locate, 'not_found');
  view = logic.recordOutcome(view.state, mark, 'could_not_mark');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  return view;
}

test('free recovery never requires payment', () => {
  const start = triage('lost', 'iphone', 'trusted');
  assert.equal(start.ok, true);
  assert.equal(start.actionId, 'apple-locate-device');
  assert.equal(plan.isPaidOfferEligible(start.state), false);
  const complete = stabilizeIphone();
  assert.equal(complete.type, 'complete');
  const evaluated = logic.evaluate(complete.state);
  assert.equal(evaluated.ok, true);
  assert.ok(evaluated.type === 'complete' || !evaluated.action);
});

test('offer is absent before stabilization and present after eligible statuses', () => {
  const active = triage('lost', 'android', 'trusted');
  assert.equal(plan.isPaidOfferEligible(active.state), false);
  assert.equal(plan.shouldRenderOffer(active.state, false), false);

  const stabilized = stabilizeIphone();
  assert.equal(stabilized.state.stabilizationStatus, 'stabilized');
  assert.equal(plan.isPaidOfferEligible(stabilized.state), true);
  assert.equal(plan.shouldRenderOffer(stabilized.state, false), true);

  const blocked = stabilizeWithBlockers();
  assert.equal(blocked.state.stabilizationStatus, 'stabilized_with_blockers');
  assert.equal(plan.isPaidOfferEligible(blocked.state), true);

  const recovered = recoverIphone();
  assert.equal(recovered.state.status, 'recovered');
  assert.equal(recovered.state.stabilizationStatus, 'stabilized');
  assert.equal(plan.isPaidOfferEligible(recovered.state), true);
});

test('dismissal preserves the free recovery experience', () => {
  const complete = stabilizeIphone();
  assert.equal(plan.shouldRenderOffer(complete.state, true), false);
  const evaluated = logic.evaluate(complete.state);
  assert.equal(evaluated.ok, true);
  const planView = logic.buildPlan(complete.state);
  assert.ok(planView.now.length + planView.next.length + planView.later.length > 0);
});

test('checkout config separates live and test Stripe environments', () => {
  const testPrice = plan.KNOWN_TEST_PRICE_ID;
  const prodPrice = 'price_1ProdPlaceholderSafety000';
  assert.equal(plan.getCheckoutConfig({}).error, 'missing-config');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: testPrice,
    SITE_URL: plan.STAGING_ORIGIN
  }).error, 'live-key');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'rk_live_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: testPrice,
    SITE_URL: plan.STAGING_ORIGIN
  }).error, 'live-key');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'not-a-key',
    STRIPE_RECOVERY_PLAN_PRICE_ID: testPrice,
    SITE_URL: plan.STAGING_ORIGIN
  }).error, 'malformed-config');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: prodPrice,
    SITE_URL: 'http://localhost:3000'
  }).error, 'live-key');
  const staging = plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: testPrice,
    SITE_URL: plan.STAGING_ORIGIN
  });
  assert.equal(staging.ok, true);
  assert.equal(staging.environment, 'preview');
  const local = plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: testPrice,
    SITE_URL: 'http://localhost:3000'
  });
  assert.equal(local.ok, true);
  assert.equal(local.environment, 'local');
  const production = plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: prodPrice,
    SITE_URL: plan.PRODUCTION_ORIGIN
  });
  assert.equal(production.ok, true);
  assert.equal(production.environment, 'production');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: testPrice,
    SITE_URL: plan.PRODUCTION_ORIGIN
  }).error, 'test-key');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: testPrice,
    SITE_URL: plan.PRODUCTION_ORIGIN
  }).error, 'test-price');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: prodPrice,
    SITE_URL: 'https://lostphones-v2-staging.vercel.app'
  }).error, 'live-key');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: prodPrice,
    SITE_URL: 'https://www.lostphones.com'
  }).error, 'malformed-config');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: prodPrice,
    SITE_URL: 'http://lostphones.com'
  }).error, 'malformed-config');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_RECOVERY_PLAN_PRICE_ID: prodPrice,
    SITE_URL: ''
  }).error, 'missing-config');
  assert.equal(plan.getCheckoutConfig({
    STRIPE_SECRET_KEY: 'sk_live_example',
    SITE_URL: plan.PRODUCTION_ORIGIN
  }).error, 'missing-config');
  const params = plan.buildCheckoutSessionParams(staging.siteUrl, staging.priceId, 'opaque-token-value');
  assert.equal(params.mode, 'payment');
  assert.equal(params.line_items[0].price, testPrice);
  assert.equal(params.line_items[0].quantity, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(params, 'payment_method_types'), false);
  assert.equal(params.success_url, plan.STAGING_ORIGIN + '/recovery-plan-success.html?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(params.cancel_url, plan.STAGING_ORIGIN + '/recovery.html?checkout=cancelled');
});

test('no recovery data or resume token enters Stripe metadata', () => {
  const state = stabilizeIphone().state;
  const params = plan.buildCheckoutSessionParams(plan.STAGING_ORIGIN, 'price_1Sbsnf6SN9rpiA041qTi745y', 'opaque-token-value');
  assert.equal(plan.checkoutParamsAreIsolated(params, state), true);
  assert.deepEqual(Object.keys(params.metadata), ['purchaseContext']);
  assert.equal(params.client_reference_id, 'opaque-token-value');
  const serialized = JSON.stringify(params);
  assert.equal(serialized.includes('apple-mark-lost'), false);
  assert.equal(serialized.includes('trusted'), false);
  assert.equal(serialized.includes('resume'), false);
});

test('purchase context uses hashed keys and a fixed seven-day TTL', async () => {
  const redis = sessionCore.createMemoryRedis();
  const token = sessionCore.generateToken();
  const stored = await plan.storePurchaseContext(redis, token, stabilizeIphone().state, 'cs_test_paid', Date.now());
  assert.equal(stored.ok, true);
  const key = plan.purchaseRedisKey(token);
  assert.equal(key.startsWith('recovery-plan:v1:'), true);
  assert.equal(key.includes(token), false);
  assert.equal((await redis.ttl(key)), 604800);
  const record = await redis.get(key);
  assert.equal(JSON.stringify(record).includes(token), false);
});

test('PDF allowlist excludes prohibited data and uses display titles', () => {
  const mapped = plan.buildPdfModel(stabilizeIphone().state, Date.parse('2026-09-20T12:00:00Z'));
  assert.equal(mapped.ok, true);
  const serialized = JSON.stringify(mapped.model);
  assert.equal(serialized.includes('apple-mark-lost'), false);
  assert.equal(serialized.includes('session_id'), false);
  assert.equal(serialized.includes('recovery-plan:v1:'), false);
  assert.match(mapped.model.cover.product, /Complete Recovery and Protection Plan/);
  assert.equal(mapped.model.summary.platform, 'iPhone');
  assert.equal(mapped.model.blankDates.length, 4);
  assert.ok(mapped.model.officialLinks.length > 0);
  assert.equal(plan.assertPdfModelSafe(mapped.model).ok, true);
});

test('representative iPhone and Android PDFs stay personalized and free of internal IDs', async () => {
  const iphone = plan.buildPdfModel(stabilizeIphone().state, Date.now());
  const android = plan.buildPdfModel(stabilizeAndroid().state, Date.now());
  assert.equal(iphone.ok, true);
  assert.equal(android.ok, true);
  assert.equal(iphone.model.summary.platform, 'iPhone');
  assert.equal(android.model.summary.platform, 'Android');
  assert.match(iphone.model.cover.personalization, /iPhone/);
  assert.match(android.model.cover.personalization, /Android/);
  const iphonePdf = await pdf.generatePdf(iphone.model);
  const androidPdf = await pdf.generatePdf(android.model);
  assert.ok(Buffer.isBuffer(iphonePdf));
  assert.ok(Buffer.isBuffer(androidPdf));
  assert.equal(iphonePdf.includes('apple-mark-lost'), false);
  assert.equal(androidPdf.includes('google-mark-lost'), false);
  assert.equal(iphonePdf.toString('latin1').includes('iPhone') || iphone.model.summary.platform === 'iPhone', true);
});

test('PDF personalization uses the correct article and a three-page US Letter layout', async () => {
  const iphone = plan.buildPdfModel(stabilizeIphone().state, Date.parse('2026-09-20T12:00:00Z'));
  const android = plan.buildPdfModel(stabilizeAndroid().state, Date.parse('2026-09-20T12:00:00Z'));
  const blocked = plan.buildPdfModel(stabilizeWithBlockers().state, Date.parse('2026-09-20T12:00:00Z'));
  const recovered = plan.buildPdfModel(recoverIphone().state, Date.parse('2026-09-20T12:00:00Z'));
  assert.equal(iphone.ok, true);
  assert.equal(android.ok, true);
  assert.equal(blocked.ok, true);
  assert.equal(recovered.ok, true);
  assert.match(iphone.model.cover.personalization, /Prepared for an iPhone reported stolen/);
  assert.match(android.model.cover.personalization, /Prepared for an Android reported stolen/);
  assert.equal(/a iPhone/.test(iphone.model.cover.personalization), false);
  assert.ok(blocked.model.blocked.length > 0);
  assert.ok(iphone.model.officialLinks.every((item) => item.label && item.url && item.label !== item.url));

  const cases = [iphone, android, blocked, recovered];
  for (const mapped of cases) {
    assert.equal(plan.assertPdfModelSafe(mapped.model).ok, true);
    const bytes = await pdf.generatePdf(mapped.model);
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 3);
    const size = loaded.getPage(0).getSize();
    assert.equal(Math.round(size.width), 612);
    assert.equal(Math.round(size.height), 792);
    const text = pdfVisibleText(bytes);
    assert.match(text, /Private recovery record/);
    assert.match(text, /Page 1 of 3/);
    assert.match(text, /Page 3 of 3/);
    assert.equal(text.includes('session_id'), false);
    assert.equal(text.includes('recovery-plan:v1:'), false);
    assert.equal(text.includes('apple-mark-lost'), false);
    assert.equal(/a iPhone/.test(text), false);
  }
});

test('stabilized journeys are offer-eligible and recovered low-risk is eligible', () => {
  const stabilized = stabilizeIphone();
  assert.equal(stabilized.type, 'complete');
  assert.equal(stabilized.state.status, 'stabilized');
  assert.equal(logic.hasCriticalBlocker(stabilized.state), false);
  assert.equal(plan.isPaidOfferEligible(stabilized.state), true);

  const recovered = recoverIphone();
  assert.equal(recovered.state.status, 'recovered');
  assert.equal(plan.isPaidOfferEligible(recovered.state), true);
  assert.equal(plan.shouldRenderOffer(recovered.state, false), true);
});

test('non-critical waiting blockers stay offer-eligible', () => {
  const blocked = stabilizeWithBlockers();
  assert.equal(blocked.state.stabilizationStatus, 'stabilized_with_blockers');
  assert.equal(logic.hasCriticalBlocker(blocked.state), false);
  assert.equal(plan.isPaidOfferEligible(blocked.state), true);
});

test('critical blocker hides the paid offer until explicit acknowledgment', () => {
  const blocked = failedLostMode();
  assert.equal(blocked.state.status, 'stabilized_with_blockers');
  assert.equal(logic.hasCriticalBlocker(blocked.state), true);
  assert.equal(plan.isPaidOfferEligible(blocked.state), false);
  assert.equal(plan.shouldRenderOffer(blocked.state, false), false);
  const acked = logic.acknowledgeCriticalBlocker(blocked.state);
  assert.equal(acked.state.criticalBlockerAcknowledged, true);
  assert.equal(acked.type, 'complete');
  assert.equal(plan.isPaidOfferEligible(acked.state), true);
  assert.equal(plan.shouldRenderOffer(acked.state, false), true);
});

test('purchase decline and checkout cancel keep the free plan and prevention path', () => {
  const complete = stabilizeIphone();
  assert.equal(plan.shouldRenderOffer(complete.state, true), false);
  assert.equal(plan.isPaidOfferEligible(complete.state), true);
  const params = plan.buildCheckoutSessionParams(plan.STAGING_ORIGIN, 'price_1Sbsnf6SN9rpiA041qTi745y', 'opaque-token-value');
  assert.match(params.cancel_url, /\/recovery\.html\?checkout=cancelled$/);
  const fs = require('fs');
  const path = require('path');
  const recoveryHtml = fs.readFileSync(path.join(__dirname, '..', 'recovery.html'), 'utf8');
  const recoveryJs = fs.readFileSync(path.join(__dirname, '..', 'recovery.js'), 'utf8');
  const successHtml = fs.readFileSync(path.join(__dirname, '..', 'recovery-plan-success.html'), 'utf8');
  assert.match(recoveryHtml + recoveryJs, /Emergency recovery is complete/);
  assert.match(recoveryHtml, /Protect My Phone for Next Time/);
  assert.match(recoveryHtml, /preparedness\.html/);
  assert.match(recoveryHtml, /I[’']m done for now/);
  assert.match(successHtml, /Protect My Phone for Next Time/);
  assert.match(successHtml, /I[’']m done for now/);
  assert.match(successHtml, /Emergency recovery is complete/);
});
