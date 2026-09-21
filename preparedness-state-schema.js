(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesPreparednessSchema = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SCHEMA_VERSION = 2;
  const ALLOWED_FIELDS = Object.freeze([
    'schemaVersion',
    'step',
    'platform',
    'answers',
    'results',
    'createdAt',
    'updatedAt'
  ]);
  const ANSWER_FIELDS = Object.freeze([
    'screenProtection',
    'cloudBackup',
    'passwordSecurity',
    'travelConnectivity'
  ]);
  const RESULT_FIELDS = Object.freeze([
    'screen_protection',
    'cloud_backup',
    'password_security',
    'travel_connectivity'
  ]);
  const STEPS = Object.freeze([
    'orientation',
    'platform',
    'screenProtection',
    'cloudBackup',
    'passwordSecurity',
    'travelConnectivity',
    'results'
  ]);
  const ENUMS = Object.freeze({
    platform: Object.freeze(['iphone', 'android', 'other', 'not_sure', null]),
    screenProtection: Object.freeze(['both', 'some', 'neither', 'not_sure', null]),
    cloudBackup: Object.freeze(['yes', 'no', 'not_sure', null]),
    passwordSecurity: Object.freeze(['all', 'some', 'none', 'not_sure', null]),
    travel: Object.freeze(['yes', 'no', 'not_applicable', 'not_sure', null]),
    result: Object.freeze(['protected', 'needs_setup', 'not_sure', 'not_applicable', null])
  });

  function isAllowed(list, value) {
    return list.indexOf(value) !== -1;
  }

  function unknownKeys(input, allowed) {
    return Object.keys(input || {}).filter((key) => allowed.indexOf(key) === -1);
  }

  function createInitialState(nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    return {
      schemaVersion: SCHEMA_VERSION,
      step: 'orientation',
      platform: null,
      answers: {
        screenProtection: null,
        cloudBackup: null,
        passwordSecurity: null,
        travelConnectivity: null
      },
      results: {
        screen_protection: null,
        cloud_backup: null,
        password_security: null,
        travel_connectivity: null
      },
      createdAt: now,
      updatedAt: now
    };
  }

  function validateState(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, error: 'invalid-state' };
    }
    if (unknownKeys(input, ALLOWED_FIELDS).length) {
      return { ok: false, error: 'unknown-field' };
    }
    if (input.schemaVersion !== SCHEMA_VERSION) {
      return { ok: false, error: 'invalid-schema' };
    }
    if (!isAllowed(STEPS, input.step)) {
      return { ok: false, error: 'invalid-step' };
    }
    if (!isAllowed(ENUMS.platform, input.platform)) {
      return { ok: false, error: 'invalid-platform' };
    }
    if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) {
      return { ok: false, error: 'invalid-answers' };
    }
    if (unknownKeys(input.answers, ANSWER_FIELDS).length) {
      return { ok: false, error: 'unknown-field' };
    }
    if (!isAllowed(ENUMS.screenProtection, input.answers.screenProtection)) {
      return { ok: false, error: 'invalid-answer' };
    }
    if (!isAllowed(ENUMS.cloudBackup, input.answers.cloudBackup)) {
      return { ok: false, error: 'invalid-answer' };
    }
    if (!isAllowed(ENUMS.passwordSecurity, input.answers.passwordSecurity)) {
      return { ok: false, error: 'invalid-answer' };
    }
    if (!isAllowed(ENUMS.travel, input.answers.travelConnectivity)) {
      return { ok: false, error: 'invalid-answer' };
    }
    if (!input.results || typeof input.results !== 'object' || Array.isArray(input.results)) {
      return { ok: false, error: 'invalid-results' };
    }
    if (unknownKeys(input.results, RESULT_FIELDS).length) {
      return { ok: false, error: 'unknown-field' };
    }
    for (let i = 0; i < RESULT_FIELDS.length; i += 1) {
      if (!isAllowed(ENUMS.result, input.results[RESULT_FIELDS[i]])) {
        return { ok: false, error: 'invalid-result' };
      }
    }
    if (typeof input.createdAt !== 'number' || typeof input.updatedAt !== 'number') {
      return { ok: false, error: 'invalid-timestamps' };
    }
    return { ok: true, state: input };
  }

  return {
    SCHEMA_VERSION,
    ALLOWED_FIELDS,
    ANSWER_FIELDS,
    RESULT_FIELDS,
    STEPS,
    ENUMS,
    createInitialState,
    validateState
  };
});
