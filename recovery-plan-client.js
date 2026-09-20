(function (global) {
  const DISMISS_KEY = 'lostphones.recoveryPlanOfferDismissed';
  const CHECKOUT_STATE_KEY = 'lostphones.recoveryPlanCheckoutState';
  const API_PATH = '/api/recovery-plan-checkout';

  function storage() {
    try {
      return global.sessionStorage || null;
    } catch (error) {
      return null;
    }
  }

  function isDismissed() {
    const store = storage();
    return !!(store && store.getItem(DISMISS_KEY) === '1');
  }

  function dismissOffer() {
    const store = storage();
    if (store) store.setItem(DISMISS_KEY, '1');
  }

  function preserveCheckoutState(state) {
    const schema = global.LostPhonesRecoverySchema;
    if (!schema) return false;
    const validated = schema.validatePersistedState(state);
    if (!validated.ok) return false;
    const store = storage();
    if (!store) return false;
    store.setItem(CHECKOUT_STATE_KEY, JSON.stringify(validated.state));
    return true;
  }

  function restoreCheckoutState() {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(CHECKOUT_STATE_KEY);
    store.removeItem(CHECKOUT_STATE_KEY);
    if (!raw) return null;
    const schema = global.LostPhonesRecoverySchema;
    if (!schema) return null;
    try {
      const parsed = JSON.parse(raw);
      const validated = schema.validatePersistedState(parsed);
      return validated.ok ? validated.state : null;
    } catch (error) {
      return null;
    }
  }

  async function startCheckout(state) {
    preserveCheckoutState(state);
    const response = await global.fetch(API_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ state: state })
    });
    const data = await response.json().catch(function () {
      return { ok: false, error: 'unavailable' };
    });
    if (data && data.ok && data.url) return { ok: true, url: data.url };
    return { ok: false, error: (data && data.error) || 'unavailable' };
  }

  global.LostPhonesRecoveryPlanClient = {
    DISMISS_KEY: DISMISS_KEY,
    CHECKOUT_STATE_KEY: CHECKOUT_STATE_KEY,
    isDismissed: isDismissed,
    dismissOffer: dismissOffer,
    preserveCheckoutState: preserveCheckoutState,
    restoreCheckoutState: restoreCheckoutState,
    startCheckout: startCheckout
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
