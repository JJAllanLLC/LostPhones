(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesAnalytics = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GA_MEASUREMENT_ID = 'G-VQ8XCGGXN7';
  const CLARITY_PROJECT_ID = 'uivo0q97p5';
  const PRODUCT_ID = 'recovery_plan';
  const PRODUCT_VALUE = 8.95;
  const PRODUCT_CURRENCY = 'USD';
  const HANDOFF_STORAGE_KEY = 'lostphones.analytics.pendingOfficialHandoff';
  const ATTEMPT_FIRED_KEY = 'lostphones.analytics.attemptEvents';
  const PRODUCTION_HOSTS = Object.freeze(['lostphones.com', 'www.lostphones.com']);

  const EVENT_PROPERTIES = Object.freeze({
    recovery_started: Object.freeze([]),
    triage_completed: Object.freeze(['platform_category', 'incident_category', 'device_context']),
    official_service_opened: Object.freeze(['provider', 'action_type']),
    returned_to_lostphones: Object.freeze(['provider', 'action_type', 'away_duration_bucket']),
    outcome_selected: Object.freeze(['outcome_category']),
    stabilization_reached: Object.freeze(['stabilization_type']),
    pdf_offer_viewed: Object.freeze([]),
    checkout_started: Object.freeze(['product', 'value', 'currency']),
    purchase_completed: Object.freeze(['product', 'value', 'currency']),
    pdf_downloaded: Object.freeze(['product']),
    prevention_started: Object.freeze([])
  });

  const ALLOWED_EVENTS = Object.freeze(Object.keys(EVENT_PROPERTIES));
  const ALLOWED_PROPERTY_NAMES = Object.freeze([
    'platform_category',
    'incident_category',
    'device_context',
    'provider',
    'action_type',
    'away_duration_bucket',
    'outcome_category',
    'stabilization_type',
    'product',
    'value',
    'currency'
  ]);

  const PROPERTY_VALUES = Object.freeze({
    platform_category: Object.freeze(['iphone', 'android', 'unsure']),
    incident_category: Object.freeze(['nearby', 'lost', 'stolen', 'unsure']),
    device_context: Object.freeze(['trusted', 'borrowed', 'public']),
    provider: Object.freeze(['apple', 'google', 'carrier', 'financial', 'other']),
    action_type: Object.freeze([
      'play_sound',
      'locate',
      'secure_device',
      'account_recovery',
      'protect_account',
      'protect_line',
      'protect_financial',
      'erase',
      'replacement_support',
      'report_document',
      'other'
    ]),
    away_duration_bucket: Object.freeze(['under_1m', '1_to_5m', '5_to_30m', 'over_30m']),
    outcome_category: Object.freeze([
      'nearby',
      'located_safe',
      'located_unsafe',
      'offline',
      'not_found',
      'unknown',
      'heard_nearby',
      'not_heard',
      'marked',
      'could_not_mark',
      'recovered_access',
      'still_blocked',
      'waiting_for_provider',
      'service_unavailable',
      'secured',
      'already_secure',
      'cannot_sign_in',
      'cannot_receive_verification',
      'needs_owner',
      'cannot_access_carrier',
      'no_exposure',
      'documented',
      'skipped_for_now',
      'confirmed_erase',
      'not_now',
      'in_hand_safe',
      'unsafe_to_retrieve',
      'acknowledged',
      'safe',
      'still_unsafe',
      'iphone',
      'android',
      'still_unsure'
    ]),
    stabilization_type: Object.freeze(['complete', 'blockers_remaining']),
    product: Object.freeze(['recovery_plan']),
    currency: Object.freeze(['USD'])
  });

  const FORBIDDEN_PROPERTY_NAMES = Object.freeze([
    'name',
    'email',
    'phone',
    'password',
    'passcode',
    'pin',
    'verification_code',
    'recovery_key',
    'imei',
    'serial',
    'serial_number',
    'account_id',
    'carrier',
    'card',
    'bank',
    'url',
    'href',
    'search',
    'hash',
    'fragment',
    'query',
    'token',
    'resumeToken',
    'resume_token',
    'sessionId',
    'session_id',
    'answers',
    'actionOutcomes',
    'outcome',
    'platform',
    'state',
    'purchaseContext',
    'stripe',
    'stripeSessionId',
    'payment_intent',
    'customer',
    'userId',
    'user_id',
    'clarity_id'
  ]);

  const ONCE_PER_ATTEMPT = Object.freeze([
    'recovery_started',
    'triage_completed',
    'stabilization_reached',
    'pdf_offer_viewed',
    'prevention_started',
    'purchase_completed'
  ]);

  const ACTION_TYPES = Object.freeze({
    'apple-play-sound': 'play_sound',
    'google-play-sound': 'play_sound',
    'apple-locate-device': 'locate',
    'google-locate-device': 'locate',
    'apple-mark-lost': 'secure_device',
    'google-mark-lost': 'secure_device',
    'apple-auth-fallback': 'account_recovery',
    'google-auth-fallback': 'account_recovery',
    'protect-primary-account': 'protect_account',
    'protect-mobile-line': 'protect_line',
    'protect-financial-accounts': 'protect_financial',
    'erase-device-decision': 'erase',
    'recovery-replacement-transition': 'replacement_support',
    'report-and-document': 'report_document'
  });

  const runtime = {
    initialized: false,
    enabled: false,
    window: null,
    document: null,
    location: null,
    storage: null,
    gtag: null,
    injectScripts: true,
    listenersBound: false,
    returnLock: false,
    fired: Object.create(null),
    dispatched: []
  };

  function reject(error) {
    return { ok: false, error: error, dispatched: false };
  }

  function isProductionHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return PRODUCTION_HOSTS.indexOf(host) !== -1;
  }

  function looksSensitive(value) {
    if (typeof value !== 'string') return false;
    if (/https?:\/\//i.test(value)) return true;
    if (value.indexOf('@') !== -1) return true;
    if (/[?#&=]/.test(value)) return true;
    if (/session_id|cs_live_|cs_test_|sk_live_|sk_test_|pi_live_|pi_test_|imei|password|passcode|resume=|recovery-session/i.test(value)) return true;
    return false;
  }

  function sanitizeProperties(eventName, properties) {
    if (ALLOWED_EVENTS.indexOf(eventName) === -1) {
      return reject('unknown-event');
    }
    const payload = properties && typeof properties === 'object' ? properties : {};
    if (Array.isArray(payload)) return reject('invalid-properties');

    const keys = Object.keys(payload);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (FORBIDDEN_PROPERTY_NAMES.indexOf(key) !== -1) return reject('forbidden-property');
      if (ALLOWED_PROPERTY_NAMES.indexOf(key) === -1) return reject('unknown-property');
    }

    const allowed = EVENT_PROPERTIES[eventName];
    const unexpected = keys.filter(function (key) {
      return allowed.indexOf(key) === -1;
    });
    if (unexpected.length) return reject('unexpected-property');

    const clean = {};
    for (let j = 0; j < keys.length; j += 1) {
      const name = keys[j];
      const value = payload[name];
      if (value !== null && typeof value === 'object') return reject('invalid-value');
      if (typeof value !== 'string' && typeof value !== 'number') return reject('invalid-value');
      if (looksSensitive(String(value))) return reject('sensitive-value');
      if (name === 'value') {
        if (value !== PRODUCT_VALUE) return reject('invalid-value');
        clean[name] = PRODUCT_VALUE;
        continue;
      }
      const allowedValues = PROPERTY_VALUES[name];
      if (allowedValues && allowedValues.indexOf(value) === -1) return reject('invalid-value');
      clean[name] = value;
    }

    return { ok: true, properties: clean };
  }

  function classifyOfficialAction(actionId, officialProvider) {
    const id = String(actionId || '');
    const providerRaw = String(officialProvider || '').toLowerCase();
    let provider = 'other';
    if (providerRaw === 'apple' || id.indexOf('apple-') === 0) provider = 'apple';
    else if (providerRaw === 'google' || id.indexOf('google-') === 0) provider = 'google';
    else if (id === 'protect-mobile-line') provider = 'carrier';
    else if (id === 'protect-financial-accounts') provider = 'financial';
    const actionType = ACTION_TYPES[id] || 'other';
    return { provider: provider, action_type: actionType };
  }

  function durationBucket(ms) {
    const elapsed = typeof ms === 'number' && isFinite(ms) ? Math.max(0, ms) : 0;
    if (elapsed < 60000) return 'under_1m';
    if (elapsed < 5 * 60000) return '1_to_5m';
    if (elapsed < 30 * 60000) return '5_to_30m';
    return 'over_30m';
  }

  function getStorage() {
    if (runtime.storage) return runtime.storage;
    try {
      if (typeof sessionStorage !== 'undefined') return sessionStorage;
    } catch (error) {
      return null;
    }
    return null;
  }

  function loadAttemptFired() {
    const storage = getStorage();
    if (!storage || typeof storage.getItem !== 'function') return;
    try {
      const raw = storage.getItem(ATTEMPT_FIRED_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      ['recovery_started', 'triage_completed', 'stabilization_reached', 'pdf_offer_viewed'].forEach(function (name) {
        if (data[name] === true) runtime.fired[name] = true;
      });
    } catch (error) {
      return;
    }
  }

  function persistAttemptFired() {
    const storage = getStorage();
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(ATTEMPT_FIRED_KEY, JSON.stringify({
      recovery_started: !!runtime.fired.recovery_started,
      triage_completed: !!runtime.fired.triage_completed,
      stabilization_reached: !!runtime.fired.stabilization_reached,
      pdf_offer_viewed: !!runtime.fired.pdf_offer_viewed
    }));
  }

  function readHandoff() {
    const storage = getStorage();
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      const raw = storage.getItem(HANDOFF_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      return {
        provider: data.provider,
        action_type: data.action_type,
        opened_at: data.opened_at,
        left: !!data.left
      };
    } catch (error) {
      return null;
    }
  }

  function writeHandoff(marker) {
    const storage = getStorage();
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify({
      provider: marker.provider,
      action_type: marker.action_type,
      opened_at: marker.opened_at,
      left: !!marker.left
    }));
  }

  function clearHandoff() {
    const storage = getStorage();
    if (!storage || typeof storage.removeItem !== 'function') return;
    storage.removeItem(HANDOFF_STORAGE_KEY);
  }

  function safePageLocation(loc) {
    const origin = loc && loc.origin ? String(loc.origin) : '';
    const pathname = loc && loc.pathname ? String(loc.pathname) : '/';
    return origin + pathname;
  }

  function dispatchGa(eventName, properties) {
    const gtag = runtime.gtag || (runtime.window && runtime.window.gtag);
    if (typeof gtag !== 'function') return false;
    if (properties && Object.keys(properties).length) {
      gtag('event', eventName, properties);
    } else {
      gtag('event', eventName);
    }
    runtime.dispatched.push({ event: eventName, properties: properties || {} });
    return true;
  }

  function injectGa() {
    const doc = runtime.document;
    const win = runtime.window;
    if (!doc || !win || typeof doc.createElement !== 'function') return;
    if (doc.getElementById && doc.getElementById('lostphones-ga4')) return;
    win.dataLayer = win.dataLayer || [];
    if (typeof win.gtag !== 'function') {
      win.gtag = function gtag() {
        win.dataLayer.push(arguments);
      };
    }
    runtime.gtag = runtime.gtag || win.gtag;
    const script = doc.createElement('script');
    script.async = true;
    script.id = 'lostphones-ga4';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    if (doc.head && doc.head.appendChild) doc.head.appendChild(script);
    win.gtag('js', new Date());
    win.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted'
    });
    win.gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      anonymize_ip: true
    });
  }

  function injectClarity() {
    const doc = runtime.document;
    const win = runtime.window;
    if (!doc || !win || typeof doc.createElement !== 'function') return;
    if (doc.getElementById && doc.getElementById('lostphones-clarity')) return;
    win.clarity = win.clarity || function clarity() {
      (win.clarity.q = win.clarity.q || []).push(arguments);
    };
    const script = doc.createElement('script');
    script.async = true;
    script.id = 'lostphones-clarity';
    script.src = 'https://www.clarity.ms/tag/' + CLARITY_PROJECT_ID;
    if (doc.head && doc.head.appendChild) doc.head.appendChild(script);
  }

  function emitSafePageView() {
    dispatchGa('page_view', {
      page_location: safePageLocation(runtime.location)
    });
  }

  function notePageHidden() {
    if (!runtime.enabled) return;
    const marker = readHandoff();
    if (!marker) return;
    if (!marker.left) {
      marker.left = true;
      writeHandoff(marker);
    }
  }

  function maybeEmitReturn() {
    if (!runtime.enabled || runtime.returnLock) return { ok: true, dispatched: false };
    const marker = readHandoff();
    if (!marker || !marker.left) return { ok: true, dispatched: false };
    runtime.returnLock = true;
    clearHandoff();
    const openedAt = typeof marker.opened_at === 'number' ? marker.opened_at : 0;
    const result = track('returned_to_lostphones', {
      provider: marker.provider,
      action_type: marker.action_type,
      away_duration_bucket: durationBucket(Date.now() - openedAt)
    });
    runtime.returnLock = false;
    return result;
  }

  function bindReturnListeners() {
    if (runtime.listenersBound) return;
    const win = runtime.window;
    const doc = runtime.document;
    if (!win || typeof win.addEventListener !== 'function') return;
    runtime.listenersBound = true;
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', function () {
        if (doc.hidden) notePageHidden();
        else maybeEmitReturn();
      });
    }
    win.addEventListener('blur', function () {
      notePageHidden();
    });
    win.addEventListener('pagehide', function () {
      notePageHidden();
    });
    win.addEventListener('focus', function () {
      maybeEmitReturn();
    });
  }

  function track(eventName, properties) {
    const sanitized = sanitizeProperties(eventName, properties);
    if (!sanitized.ok) return sanitized;
    if (ONCE_PER_ATTEMPT.indexOf(eventName) !== -1 && runtime.fired[eventName]) {
      return { ok: true, dispatched: false, duplicate: true, event: { event: eventName, properties: sanitized.properties } };
    }
    const event = {
      event: eventName,
      properties: sanitized.properties,
      transport: runtime.enabled ? 'ga4' : (runtime.initialized ? 'disabled' : 'uninitialized')
    };
    if (ONCE_PER_ATTEMPT.indexOf(eventName) !== -1) {
      runtime.fired[eventName] = true;
      if (eventName !== 'prevention_started' && eventName !== 'purchase_completed') {
        persistAttemptFired();
      }
    }
    if (!runtime.enabled) {
      return { ok: true, dispatched: false, event: event };
    }
    const dispatched = dispatchGa(eventName, sanitized.properties);
    return { ok: true, dispatched: dispatched, event: event };
  }

  function noteOfficialServiceOpened(details) {
    const meta = classifyOfficialAction(details && details.actionId, details && details.officialProvider);
    const result = track('official_service_opened', meta);
    if (runtime.enabled && result.ok) {
      writeHandoff({
        provider: meta.provider,
        action_type: meta.action_type,
        opened_at: Date.now(),
        left: false
      });
    }
    return result;
  }

  function init(options) {
    if (runtime.initialized) {
      return { ok: true, enabled: runtime.enabled, duplicate: true };
    }
    const opts = options && typeof options === 'object' ? options : {};
    runtime.window = opts.window || (typeof window !== 'undefined' ? window : null);
    runtime.document = opts.document || (runtime.window && runtime.window.document) || (typeof document !== 'undefined' ? document : null);
    runtime.location = opts.location || (runtime.window && runtime.window.location) || (typeof location !== 'undefined' ? location : null);
    runtime.storage = opts.storage || null;
    runtime.gtag = typeof opts.gtag === 'function' ? opts.gtag : (runtime.window && runtime.window.gtag) || null;
    runtime.injectScripts = opts.injectScripts !== false;
    const hostname = opts.hostname || (runtime.location && runtime.location.hostname) || '';
    runtime.enabled = isProductionHost(hostname);
    runtime.initialized = true;
    loadAttemptFired();
    if (!runtime.enabled) {
      return { ok: true, enabled: false };
    }
    if (runtime.injectScripts) {
      injectGa();
      injectClarity();
    }
    bindReturnListeners();
    emitSafePageView();
    return { ok: true, enabled: true };
  }

  function resetRecoveryAttempt() {
    runtime.fired.recovery_started = false;
    runtime.fired.triage_completed = false;
    runtime.fired.stabilization_reached = false;
    runtime.fired.pdf_offer_viewed = false;
    const storage = getStorage();
    if (storage && typeof storage.removeItem === 'function') {
      storage.removeItem(ATTEMPT_FIRED_KEY);
    }
  }

  function resetPrevention() {
    runtime.fired.prevention_started = false;
  }

  function resetForTests() {
    const storage = getStorage();
    if (storage && typeof storage.removeItem === 'function') {
      storage.removeItem(HANDOFF_STORAGE_KEY);
      storage.removeItem(ATTEMPT_FIRED_KEY);
    }
    runtime.initialized = false;
    runtime.enabled = false;
    runtime.window = null;
    runtime.document = null;
    runtime.location = null;
    runtime.storage = null;
    runtime.gtag = null;
    runtime.injectScripts = true;
    runtime.listenersBound = false;
    runtime.returnLock = false;
    runtime.fired = Object.create(null);
    runtime.dispatched = [];
  }

  return {
    GA_MEASUREMENT_ID: GA_MEASUREMENT_ID,
    CLARITY_PROJECT_ID: CLARITY_PROJECT_ID,
    PRODUCT_ID: PRODUCT_ID,
    PRODUCT_VALUE: PRODUCT_VALUE,
    PRODUCT_CURRENCY: PRODUCT_CURRENCY,
    HANDOFF_STORAGE_KEY: HANDOFF_STORAGE_KEY,
    PRODUCTION_HOSTS: PRODUCTION_HOSTS,
    ALLOWED_EVENTS: ALLOWED_EVENTS,
    EVENT_PROPERTIES: EVENT_PROPERTIES,
    ALLOWED_PROPERTY_NAMES: ALLOWED_PROPERTY_NAMES,
    init: init,
    track: track,
    isProductionHost: isProductionHost,
    classifyOfficialAction: classifyOfficialAction,
    durationBucket: durationBucket,
    noteOfficialServiceOpened: noteOfficialServiceOpened,
    notePageHidden: notePageHidden,
    maybeEmitReturn: maybeEmitReturn,
    readHandoff: readHandoff,
    resetRecoveryAttempt: resetRecoveryAttempt,
    resetPrevention: resetPrevention,
    resetForTests: resetForTests,
    getRuntime: function () {
      return runtime;
    }
  };
});
