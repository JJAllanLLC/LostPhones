(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesAnalytics = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRODUCT_ID = 'recovery-complete-plan';
  const PRODUCT_VALUE = 8.95;

  const EVENT_PROPERTIES = Object.freeze({
    recovery_stabilization_reached: Object.freeze(['status']),
    recovery_paid_offer_eligible: Object.freeze(['status']),
    recovery_paid_offer_viewed: Object.freeze(['status']),
    recovery_paid_offer_dismissed: Object.freeze(['status']),
    recovery_checkout_started: Object.freeze(['productId', 'value']),
    recovery_checkout_succeeded: Object.freeze(['productId', 'value']),
    recovery_pdf_generated: Object.freeze(['productId']),
    recovery_pdf_delivered: Object.freeze(['productId']),
    preparedness_started: Object.freeze([]),
    preparedness_completed: Object.freeze([]),
    preparedness_gap_identified: Object.freeze(['category']),
    preparedness_recommendation_displayed: Object.freeze(['recommendationId', 'commercialType']),
    preparedness_recommendation_clicked: Object.freeze(['recommendationId', 'commercialType']),
    preparedness_return_engagement: Object.freeze([])
  });

  const ALLOWED_EVENTS = Object.freeze(Object.keys(EVENT_PROPERTIES));
  const ALLOWED_PROPERTY_NAMES = Object.freeze([
    'productId',
    'value',
    'status',
    'category',
    'recommendationId',
    'commercialType'
  ]);

  const FORBIDDEN_PROPERTY_NAMES = Object.freeze([
    'answers',
    'actionOutcomes',
    'outcome',
    'platform',
    'url',
    'state',
    'token',
    'resumeToken',
    'sessionId',
    'session_id',
    'purchaseContext',
    'email',
    'phone'
  ]);

  function reject(error) {
    return { ok: false, error: error, dispatched: false };
  }

  function track(eventName, properties, dispatcher) {
    if (ALLOWED_EVENTS.indexOf(eventName) === -1) {
      return reject('unknown-event');
    }
    const payload = properties && typeof properties === 'object' ? properties : {};
    if (Array.isArray(payload)) return reject('invalid-properties');

    const extra = Object.keys(payload).filter((key) => ALLOWED_PROPERTY_NAMES.indexOf(key) === -1);
    if (extra.length) return reject('unknown-property');

    for (let i = 0; i < FORBIDDEN_PROPERTY_NAMES.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(payload, FORBIDDEN_PROPERTY_NAMES[i])) {
        return reject('forbidden-property');
      }
    }

    const allowed = EVENT_PROPERTIES[eventName];
    const unexpected = Object.keys(payload).filter((key) => allowed.indexOf(key) === -1);
    if (unexpected.length) return reject('unexpected-property');

    const event = {
      event: eventName,
      properties: Object.assign({}, payload),
      transport: 'local-only'
    };

    if (typeof dispatcher === 'function') {
      dispatcher(event);
    } else if (typeof globalThis !== 'undefined' && typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
      globalThis.dispatchEvent(new globalThis.CustomEvent('lostphones-analytics', { detail: event }));
    }

    return { ok: true, dispatched: true, event: event };
  }

  return {
    PRODUCT_ID,
    PRODUCT_VALUE,
    ALLOWED_EVENTS,
    EVENT_PROPERTIES,
    ALLOWED_PROPERTY_NAMES,
    track
  };
});
