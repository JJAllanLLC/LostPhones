(function (global, factory) {
  const api = factory(
    global && global.LostPhonesRecoverySchema,
    global && global.LostPhonesRecoveryLogic,
    global && global.LostPhonesRecoveryContent
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesRecoveryPlanCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (schemaDep, logicDep, contentDep) {
  const schema = schemaDep || (typeof require === 'function' ? require('./recovery-state-schema.js') : null);
  const logic = logicDep || (typeof require === 'function' ? require('./recovery-logic.js') : null);
  const content = contentDep || (typeof require === 'function' ? require('./recovery-content.js') : null);
  const sessionCore = typeof require === 'function' ? require('./recovery-session-core.js') : null;

  const PRODUCTION_ORIGIN = 'https://lostphones.com';
  const STAGING_ORIGIN = 'https://lostphones-v2-staging.vercel.app';
  const KNOWN_TEST_PRICE_ID = 'price_1Sbsnf6SN9rpiA041qTi745y';
  // Stripe price IDs do not encode live/test mode. Production rejects this known
  // staging test price; remaining live-vs-test price confirmation is a Phase 6
  // runtime config check in the Stripe dashboard.
  const PRODUCT_ID = 'recovery-complete-plan';
  const PRODUCT_VALUE = 8.95;
  const AMOUNT_TOTAL = 895;
  const CURRENCY = 'usd';
  const SESSION_TTL_SECONDS = 604800;
  const REDIS_KEY_PREFIX = 'recovery-plan:v1:';
  const APPROVED_PDF_RELATIVE_PATH = 'private/paid-downloads/LostPhones_Complete_Recovery_Protection_Plan_2026_Final.pdf';
  const APPROVED_PDF_DOWNLOAD_NAME = 'LostPhones_Complete_Recovery_Protection_Plan_2026.pdf';
  const ELIGIBLE_STATUSES = Object.freeze(['stabilized', 'stabilized_with_blockers']);
  const JSON_HEADERS = Object.freeze({
    'Cache-Control': 'no-store, private',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer'
  });

  const PLATFORM_LABELS = Object.freeze({
    iphone: 'iPhone',
    android: 'Android',
    unsure: 'Not sure'
  });
  const SITUATION_LABELS = Object.freeze({
    nearby: 'Misplaced nearby',
    lost: 'Lost',
    stolen: 'Stolen',
    unsure: 'Not sure'
  });
  const STATUS_LABELS = Object.freeze({
    recovered: 'Recovered',
    stabilized: 'Stabilized',
    stabilized_with_blockers: 'Stabilized with blockers',
    active: 'In progress'
  });

  const CLAIMS_CHECKLIST = Object.freeze([
    'Write down the official find-device status you saw, without copying location details.',
    'Keep the date you contacted the carrier.',
    'Keep the date you reviewed Apple or Google account security.',
    'If you file a police report, keep only the report number.',
    'If you file an insurance or replacement claim, keep the claim number and a copy of the official status screen.'
  ]);

  const BLANK_DATE_FIELDS = Object.freeze([
    'Date noticed: ______________',
    'Date carrier contacted: ______________',
    'Date account security reviewed: ______________',
    'Follow-up date: ______________'
  ]);

  const POST_RECOVERY_CHECKLIST = Object.freeze([
    'Review Apple or Google account sign-in devices and remove unknown ones.',
    'Confirm two-step verification still uses a method you control.',
    'Change passwords only in official account settings, never inside LostPhones.',
    'Watch bank and carrier statements for unexpected activity.',
    'Update trusted contacts with a new number only after the line is stable.'
  ]);

  const PREPAREDNESS_CHECKLIST = Object.freeze([
    'Screen protection: keep a case and an undamaged screen protector on the phone you use most.',
    'Cloud backup: confirm photos and contacts restore automatically.',
    'Password security: use unique passwords and two-step verification.',
    'Travel connectivity: keep a backup way to get mobile data if the main SIM stops working, or confirm it is not needed now.'
  ]);

  const EMERGENCY_REFERENCE = Object.freeze([
    'Move to safety first. Never confront a suspected thief.',
    'Open Apple Find Devices or Google Find Hub from a trusted device.',
    'Mark the phone lost or lock it before considering erase.',
    'Protect the Apple or Google account, then the mobile line, then financial accounts.',
    'Keep LostPhones open while official services open in a new tab, then come back and continue.',
    'LostPhones never asks for account secrets, codes, or device identifiers.',
    'Do not enter passwords, PINs, or recovery secrets into LostPhones.',
    'Ask the carrier to suspend or replace the mobile line through its official app or website.',
    'Protect the main Apple or Google account before financial apps.'
  ]);

  const PROHIBITED_PDF_PATTERNS = Object.freeze([
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /purchaseContext/i,
    /sk_live_|sk_test_|rk_live_|rk_test_/i,
    /cs_test_|cs_live_/i,
    /recovery:v1:|recovery-plan:v1:/i,
    /session_id/i,
    /UPSTASH|STRIPE_SECRET/i
  ]);

  function reject(error) {
    return { ok: false, error: error };
  }

  function isPaidOfferEligible(state) {
    const validated = schema.validatePersistedState(state);
    if (!validated.ok) return false;
    const assessed = logic.assessStabilization(validated.state);
    if (ELIGIBLE_STATUSES.indexOf(assessed.state.stabilizationStatus) === -1) return false;
    if (logic.hasCriticalBlocker(validated.state) && !validated.state.criticalBlockerAcknowledged) return false;
    return true;
  }

  function shouldRenderOffer(state, dismissed) {
    return isPaidOfferEligible(state) && !dismissed;
  }

  function normalizeSiteUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw.replace(/\/$/, '');
  }

  function parseSiteUrl(raw) {
    try {
      return new URL(normalizeSiteUrl(raw));
    } catch (error) {
      return null;
    }
  }

  function hostnameOf(value) {
    return String(value || '').toLowerCase();
  }

  function isProductionHostname(hostname) {
    const host = hostnameOf(hostname);
    return host === 'lostphones.com' || host === 'www.lostphones.com';
  }

  function isPreviewHostname(hostname) {
    return hostnameOf(hostname).endsWith('.vercel.app');
  }

  function isLocalHostname(hostname) {
    const host = hostnameOf(hostname);
    return host === 'localhost' || host === '127.0.0.1';
  }

  function stripeKeyMode(secretKey) {
    const key = String(secretKey || '');
    if (key.indexOf('sk_live_') === 0 || key.indexOf('rk_live_') === 0) return 'live';
    if (key.indexOf('sk_test_') === 0 || key.indexOf('rk_test_') === 0) return 'test';
    return 'malformed';
  }

  function requestHostname(headers) {
    const raw = headers && (headers.host || headers.Host);
    if (!raw || typeof raw !== 'string') return '';
    return hostnameOf(raw.split(':')[0]);
  }

  function siteUrlMatchesRequest(siteUrl, headers) {
    const parsed = parseSiteUrl(siteUrl);
    const requestHost = requestHostname(headers);
    if (!parsed || !requestHost) return false;
    const siteHost = hostnameOf(parsed.hostname);
    if (siteHost === requestHost) return true;
    return isProductionHostname(siteHost) && isProductionHostname(requestHost);
  }

  function getCheckoutConfig(env) {
    const source = env || (typeof process !== 'undefined' ? process.env : {});
    const secretKey = source.STRIPE_SECRET_KEY;
    const priceId = source.STRIPE_RECOVERY_PLAN_PRICE_ID;
    const siteUrl = normalizeSiteUrl(source.SITE_URL);
    if (!secretKey || !priceId || !siteUrl) return reject('missing-config');

    const parsed = parseSiteUrl(siteUrl);
    if (!parsed || parsed.username || parsed.password || parsed.hash) return reject('malformed-config');
    if (priceId.indexOf('price_') !== 0) return reject('malformed-config');

    const hostname = hostnameOf(parsed.hostname);
    const keyMode = stripeKeyMode(secretKey);
    if (keyMode === 'malformed') return reject('malformed-config');

    if (isProductionHostname(hostname)) {
      if (parsed.protocol !== 'https:') return reject('malformed-config');
      if (siteUrl !== PRODUCTION_ORIGIN) return reject('malformed-config');
      if (keyMode !== 'live') return reject('test-key');
      if (priceId === KNOWN_TEST_PRICE_ID) return reject('test-price');
      return {
        ok: true,
        secretKey: secretKey,
        priceId: priceId,
        siteUrl: siteUrl,
        environment: 'production'
      };
    }

    if (isPreviewHostname(hostname) || isLocalHostname(hostname)) {
      if (keyMode !== 'test') return reject('live-key');
      if (isPreviewHostname(hostname) && parsed.protocol !== 'https:') return reject('malformed-config');
      if (isLocalHostname(hostname) && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return reject('malformed-config');
      }
      return {
        ok: true,
        secretKey: secretKey,
        priceId: priceId,
        siteUrl: siteUrl,
        environment: isLocalHostname(hostname) ? 'local' : 'preview'
      };
    }

    return reject('malformed-config');
  }

  function purchaseRedisKey(token) {
    if (!sessionCore) return null;
    const hash = sessionCore.hashToken(token);
    if (!hash) return null;
    return REDIS_KEY_PREFIX + hash;
  }

  function buildCheckoutSessionParams(siteUrl, priceId, contextToken) {
    return {
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: siteUrl + '/recovery-plan-success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: siteUrl + '/recovery.html?checkout=cancelled',
      client_reference_id: contextToken,
      metadata: { purchaseContext: contextToken }
    };
  }

  function checkoutParamsAreIsolated(params, state) {
    const serialized = JSON.stringify(params);
    if (!serialized) return false;
    if (serialized.indexOf('actionOutcomes') !== -1) return false;
    if (serialized.indexOf('resumeToken') !== -1) return false;
    if (state && state.answers && serialized.indexOf(JSON.stringify(state.answers)) !== -1) return false;
    const metadataKeys = Object.keys(params.metadata || {});
    if (metadataKeys.length !== 1 || metadataKeys[0] !== 'purchaseContext') return false;
    if (Object.keys(params).indexOf('payment_method_types') !== -1) return false;
    return true;
  }

  function officialLinksFor(platform) {
    const urls = content.OFFICIAL_URLS;
    if (platform === 'android') {
      return [
        { label: 'Google Find Hub', url: urls.googleFind },
        { label: 'Google lost device support', url: urls.googleLostSupport },
        { label: 'Google account recovery', url: urls.googleAccountRecovery },
        { label: 'Google account security', url: urls.googleAccountSecurity }
      ];
    }
    return [
      { label: 'Apple Find Devices', url: urls.appleFind },
      { label: 'Apple lost device support', url: urls.appleLostSupport },
      { label: 'Apple account recovery', url: urls.appleAccountRecovery },
      { label: 'Apple account security', url: urls.appleAccountSecurity }
    ];
  }

  function actionTitle(actionId, platform) {
    const action = content.getAction(actionId, platform) || content.getAction(actionId, 'unsure');
    return action && action.title ? action.title : 'Recovery step';
  }

  function platformArticle(platform) {
    return platform === 'iphone' || platform === 'android' ? 'an' : 'a';
  }

  function situationPhrase(situation) {
    if (situation === 'nearby') return 'misplaced nearby';
    if (situation === 'lost') return 'lost';
    if (situation === 'stolen') return 'stolen';
    return 'missing';
  }

  function buildPdfModel(state, generatedAt) {
    const validated = schema.validatePersistedState(state);
    if (!validated.ok) return reject(validated.error || 'invalid-state');
    if (!isPaidOfferEligible(validated.state)) return reject('ineligible');
    const assessed = logic.assessStabilization(validated.state).state;
    const plan = logic.buildPlan(assessed);
    const platform = assessed.answers.platform;
    const generatedDate = new Date(generatedAt || Date.now()).toISOString().slice(0, 10);
    const completed = [];
    const remaining = [];
    const blocked = [];
    ['now', 'next', 'later'].forEach((lane) => {
      plan[lane].forEach((item) => {
        if (item.status === 'not_applicable') return;
        const entry = { title: actionTitle(item.actionId, platform) };
        if (item.status === 'completed') {
          completed.push(entry);
        } else if (item.status === 'blocked') {
          blocked.push({
            title: entry.title,
            copy: item.blockedCopy || 'This step is waiting and is not complete.'
          });
        } else {
          remaining.push(entry);
        }
      });
    });

    const model = {
      cover: {
        product: 'My Complete Recovery and Protection Plan',
        personalization: 'Prepared for '
          + platformArticle(platform)
          + ' '
          + (PLATFORM_LABELS[platform] || 'phone')
          + ' reported '
          + situationPhrase(assessed.answers.situation)
          + '.'
      },
      summary: {
        platform: PLATFORM_LABELS[platform] || 'Not specified',
        situation: SITUATION_LABELS[assessed.answers.situation] || 'Not specified',
        finalStatus: STATUS_LABELS[assessed.status] || STATUS_LABELS[assessed.stabilizationStatus] || 'Stabilized',
        generatedDate: generatedDate
      },
      completed: completed,
      remaining: remaining,
      blocked: blocked,
      officialLinks: officialLinksFor(platform),
      claimsChecklist: CLAIMS_CHECKLIST.slice(),
      blankDates: BLANK_DATE_FIELDS.slice(),
      postRecovery: POST_RECOVERY_CHECKLIST.slice(),
      preparedness: PREPAREDNESS_CHECKLIST.slice(),
      emergencyReference: EMERGENCY_REFERENCE.slice()
    };

    const safety = assertPdfModelSafe(model);
    if (!safety.ok) return safety;
    return { ok: true, model: model };
  }

  function assertPdfModelSafe(model) {
    const serialized = JSON.stringify(model);
    if (!serialized) return reject('empty-model');
    for (let i = 0; i < PROHIBITED_PDF_PATTERNS.length; i += 1) {
      if (PROHIBITED_PDF_PATTERNS[i].test(serialized)) {
        return reject('prohibited-data');
      }
    }
    if (content.APPROVED_ACTION_IDS.some((id) => serialized.indexOf(id) !== -1)) {
      return reject('internal-id');
    }
    return { ok: true };
  }

  function lineItemFrom(session) {
    const items = session && session.line_items && session.line_items.data;
    return items && items[0] ? items[0] : null;
  }

  function priceIdFrom(item) {
    if (!item) return null;
    if (typeof item.price === 'string') return item.price;
    if (item.price && item.price.id) return item.price.id;
    return null;
  }

  function purchaseTokenFrom(session) {
    if (!session) return null;
    if (typeof session.client_reference_id === 'string' && session.client_reference_id) {
      return session.client_reference_id;
    }
    if (session.metadata && typeof session.metadata.purchaseContext === 'string') {
      return session.metadata.purchaseContext;
    }
    return null;
  }

  function verifyPaidSession(session, config) {
    if (!session || typeof session !== 'object') return reject('unverified-session');
    if (session.mode !== 'payment') return reject('unverified-session');
    if (session.status !== 'complete') return reject('unverified-session');
    if (session.payment_status !== 'paid') return reject('unverified-session');
    if (session.amount_total !== AMOUNT_TOTAL) return reject('unverified-session');
    if (session.currency !== CURRENCY) return reject('unverified-session');
    const item = lineItemFrom(session);
    if (!item || item.quantity !== 1) return reject('unverified-session');
    if (priceIdFrom(item) !== config.priceId) return reject('unverified-session');
    const token = purchaseTokenFrom(session);
    if (!sessionCore || !sessionCore.isOpaqueToken(token)) return reject('unverified-session');
    return { ok: true, token: token, sessionId: session.id };
  }

  async function storePurchaseContext(redis, token, state, checkoutSessionId, nowMs) {
    const key = purchaseRedisKey(token);
    const createdAt = nowMs;
    const expiresAt = createdAt + SESSION_TTL_SECONDS * 1000;
    const record = {
      createdAt: createdAt,
      expiresAt: expiresAt,
      checkoutSessionId: checkoutSessionId,
      state: state
    };
    const serialized = JSON.stringify(record);
    if (serialized.indexOf(token) !== -1) {
      return reject('raw-token-leak');
    }
    await redis.set(key, record, { ex: SESSION_TTL_SECONDS });
    return { ok: true, key: key, createdAt: createdAt, expiresAt: expiresAt };
  }

  async function loadPurchaseContext(redis, token, checkoutSessionId, nowMs) {
    if (!sessionCore.isOpaqueToken(token)) return reject('unverified-session');
    const key = purchaseRedisKey(token);
    const record = await redis.get(key);
    if (!record || typeof record !== 'object') return reject('unverified-session');
    if (!record.expiresAt || record.expiresAt <= nowMs) {
      await redis.del(key);
      return reject('unverified-session');
    }
    if (record.checkoutSessionId !== checkoutSessionId) return reject('unverified-session');
    const validated = schema.validatePersistedState(record.state);
    if (!validated.ok) return reject('unverified-session');
    if (!isPaidOfferEligible(validated.state)) return reject('unverified-session');
    return { ok: true, state: validated.state, createdAt: record.createdAt, expiresAt: record.expiresAt };
  }

  function approvedPdfPath() {
    if (typeof require !== 'function') return null;
    const path = require('path');
    return path.join(__dirname, APPROVED_PDF_RELATIVE_PATH);
  }

  function loadApprovedPdf() {
    const filePath = approvedPdfPath();
    if (!filePath || typeof require !== 'function') return reject('unavailable');
    const fs = require('fs');
    let bytes;
    try {
      bytes = fs.readFileSync(filePath);
    } catch (error) {
      return reject('unavailable');
    }
    if (!bytes || !bytes.length) return reject('unavailable');
    return { ok: true, bytes: Buffer.from(bytes) };
  }

  function jsonResponse(status, body) {
    return { status: status, headers: Object.assign({}, JSON_HEADERS), body: body };
  }

  function parseBody(req) {
    let body = req && req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return null;
      }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body;
  }

  async function handleCheckout(req, deps, nowMs) {
    const clock = nowMs || Date.now();
    if (!req || req.method !== 'POST') {
      return jsonResponse(405, { ok: false, error: 'method-not-allowed' });
    }
    if (!sessionCore.isSameOrigin(req.headers || {})) {
      return jsonResponse(403, { ok: false, error: 'forbidden' });
    }
    const body = parseBody(req);
    if (!body) return jsonResponse(400, { ok: false, error: 'invalid-body' });

    const config = getCheckoutConfig(deps && deps.env);
    if (!config.ok) {
      return jsonResponse(503, { ok: false, error: config.error });
    }
    if (!siteUrlMatchesRequest(config.siteUrl, req.headers || {})) {
      return jsonResponse(503, { ok: false, error: 'host-mismatch' });
    }
    if (!deps || !deps.redis || !deps.stripe) {
      return jsonResponse(503, { ok: false, error: 'unavailable' });
    }

    const validated = schema.validatePersistedState(body.state);
    if (!validated.ok) return jsonResponse(400, { ok: false, error: validated.error || 'invalid-state' });
    if (!isPaidOfferEligible(validated.state)) {
      return jsonResponse(403, { ok: false, error: 'ineligible' });
    }

    const token = sessionCore.generateToken();
    const params = buildCheckoutSessionParams(config.siteUrl, config.priceId, token);
    if (!checkoutParamsAreIsolated(params, validated.state)) {
      return jsonResponse(500, { ok: false, error: 'unavailable' });
    }

    let session;
    try {
      session = await deps.stripe.checkout.sessions.create(params);
    } catch (error) {
      return jsonResponse(503, { ok: false, error: 'unavailable' });
    }
    if (!session || !session.id || !session.url) {
      return jsonResponse(503, { ok: false, error: 'unavailable' });
    }

    const stored = await storePurchaseContext(deps.redis, token, validated.state, session.id, clock);
    if (!stored.ok) return jsonResponse(503, { ok: false, error: 'unavailable' });
    return jsonResponse(200, { ok: true, url: session.url });
  }

  async function handlePdf(req, deps, nowMs) {
    const clock = nowMs || Date.now();
    if (!req || req.method !== 'POST') {
      return jsonResponse(405, { ok: false, error: 'method-not-allowed' });
    }
    if (!sessionCore.isSameOrigin(req.headers || {})) {
      return jsonResponse(403, { ok: false, error: 'forbidden' });
    }
    const body = parseBody(req);
    if (!body || typeof body.sessionId !== 'string' || !body.sessionId) {
      return jsonResponse(400, { ok: false, error: 'invalid-body' });
    }

    const config = getCheckoutConfig(deps && deps.env);
    if (!config.ok || !deps || !deps.redis || !deps.stripe) {
      return jsonResponse(503, { ok: false, error: 'unavailable' });
    }
    if (!siteUrlMatchesRequest(config.siteUrl, req.headers || {})) {
      return jsonResponse(503, { ok: false, error: 'host-mismatch' });
    }

    let session;
    try {
      session = await deps.stripe.checkout.sessions.retrieve(body.sessionId, { expand: ['line_items'] });
    } catch (error) {
      return jsonResponse(403, { ok: false, error: 'unverified-session' });
    }

    const verified = verifyPaidSession(session, config);
    if (!verified.ok) return jsonResponse(403, { ok: false, error: 'unverified-session' });

    const context = await loadPurchaseContext(deps.redis, verified.token, verified.sessionId, clock);
    if (!context.ok) return jsonResponse(403, { ok: false, error: 'unverified-session' });

    const loader = typeof deps.loadApprovedPdf === 'function' ? deps.loadApprovedPdf : loadApprovedPdf;
    let loaded;
    try {
      loaded = await loader();
    } catch (error) {
      return jsonResponse(503, { ok: false, error: 'unavailable' });
    }
    if (Buffer.isBuffer(loaded)) {
      loaded = { ok: true, bytes: loaded };
    }
    if (!loaded || !loaded.ok || !loaded.bytes) return jsonResponse(503, { ok: false, error: 'unavailable' });
    const bytes = Buffer.from(loaded.bytes);
    if (!bytes.length) return jsonResponse(503, { ok: false, error: 'unavailable' });

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="' + APPROVED_PDF_DOWNLOAD_NAME + '"',
        'Cache-Control': 'no-store, private',
        Pragma: 'no-cache',
        'Referrer-Policy': 'no-referrer'
      },
      body: bytes
    };
  }

  return {
    PRODUCTION_ORIGIN,
    STAGING_ORIGIN,
    KNOWN_TEST_PRICE_ID,
    PRODUCT_ID,
    PRODUCT_VALUE,
    AMOUNT_TOTAL,
    CURRENCY,
    SESSION_TTL_SECONDS,
    REDIS_KEY_PREFIX,
    APPROVED_PDF_RELATIVE_PATH,
    APPROVED_PDF_DOWNLOAD_NAME,
    ELIGIBLE_STATUSES,
    CLAIMS_CHECKLIST,
    BLANK_DATE_FIELDS,
    POST_RECOVERY_CHECKLIST,
    PREPAREDNESS_CHECKLIST,
    EMERGENCY_REFERENCE,
    isPaidOfferEligible,
    shouldRenderOffer,
    getCheckoutConfig,
    purchaseRedisKey,
    buildCheckoutSessionParams,
    checkoutParamsAreIsolated,
    buildPdfModel,
    assertPdfModelSafe,
    verifyPaidSession,
    storePurchaseContext,
    loadPurchaseContext,
    approvedPdfPath,
    loadApprovedPdf,
    handleCheckout,
    handlePdf
  };
});
