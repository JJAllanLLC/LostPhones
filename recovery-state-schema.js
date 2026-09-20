(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesRecoverySchema = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SCHEMA_VERSION = 2;
  const FLOW_VERSION = 3;
  const SESSION_TTL_SECONDS = 604800;
  const MAX_RECORD_BYTES = 16384;
  const REDIS_KEY_PREFIX = 'recovery:v1:';

  const ACTION_IDS = Object.freeze([
    'personal-safety',
    'identify-platform',
    'apple-play-sound',
    'google-play-sound',
    'apple-locate-device',
    'google-locate-device',
    'apple-mark-lost',
    'google-mark-lost',
    'apple-auth-fallback',
    'google-auth-fallback',
    'protect-primary-account',
    'protect-mobile-line',
    'protect-financial-accounts',
    'report-and-document',
    'erase-device-decision',
    'recovered-device-security-check',
    'recovery-replacement-transition'
  ]);

  const QUESTION_IDS = Object.freeze([
    'situation',
    'platform',
    'currentDevice',
    'safety',
    'accountAccess',
    'verificationAccess',
    'deviceLocation',
    'deviceSecured',
    'recovered',
    'unlockRisk',
    'suspiciousActivity',
    'carrierAccess',
    'financialExposure',
    'eraseAcknowledge',
    'eraseConfirm'
  ]);

  const ENUMS = Object.freeze({
    status: Object.freeze(['active', 'recovered', 'stabilized', 'stabilized_with_blockers']),
    situation: Object.freeze(['nearby', 'lost', 'stolen', 'unsure']),
    platform: Object.freeze(['iphone', 'android', 'unsure']),
    currentDevice: Object.freeze(['trusted', 'borrowed', 'public']),
    safety: Object.freeze(['safe', 'unsafe', 'unsure', null]),
    accountAccess: Object.freeze(['yes', 'no', 'unsure', null]),
    verificationAccess: Object.freeze(['yes', 'no', 'unsure', null]),
    deviceLocation: Object.freeze(['nearby', 'located_safe', 'located_unsafe', 'offline', 'not_found', 'unknown', null]),
    deviceSecured: Object.freeze(['yes', 'no', 'pending', 'unsure', null]),
    recovered: Object.freeze(['yes', 'no', null]),
    unlockRisk: Object.freeze(['probably_not', 'possible', 'yes', 'unsure', null]),
    suspiciousActivity: Object.freeze(['yes', 'no', 'unsure', null]),
    carrierAccess: Object.freeze(['yes', 'no', 'unsure', null]),
    financialExposure: Object.freeze(['yes', 'no', 'unsure', null]),
    actionStatus: Object.freeze(['pending', 'active', 'completed', 'blocked', 'skipped', 'not_applicable']),
    blockedReason: Object.freeze([
      'cannot_sign_in',
      'cannot_receive_verification',
      'device_offline',
      'service_unavailable',
      'cannot_access_carrier',
      'waiting_for_provider',
      'needs_owner',
      'unsafe_to_retrieve',
      'could_not_secure_device',
      null
    ]),
    stabilizationStatus: Object.freeze(['not_started', 'in_progress', 'stabilized', 'stabilized_with_blockers', null]),
    privacyMode: Object.freeze(['memory-only', 'session', 'local-token'])
  });

  const ANSWER_KEYS = Object.freeze(Object.keys(ENUMS).filter((key) => [
    'situation',
    'platform',
    'currentDevice',
    'safety',
    'accountAccess',
    'verificationAccess',
    'deviceLocation',
    'deviceSecured',
    'recovered',
    'unlockRisk',
    'suspiciousActivity',
    'carrierAccess',
    'financialExposure'
  ].indexOf(key) !== -1));

  const STATE_KEYS = Object.freeze([
    'schemaVersion',
    'flowVersion',
    'version',
    'status',
    'step',
    'answers',
    'actions',
    'currentQuestionId',
    'currentActionId',
    'awaitingExternalReturnActionId',
    'stabilizationStatus',
    'privacyMode',
    'blockedReason',
    'eraseAcknowledged',
    'createdAt',
    'updatedAt',
    'expiresAt'
  ]);

  const ACTION_RECORD_KEYS = Object.freeze(['status', 'outcome', 'blockedReason', 'updatedAt']);

  function now() {
    return Date.now();
  }

  function utf8ByteLength(value) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.byteLength(value, 'utf8');
    }
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(value).length;
    }
    return String(value).length;
  }

  function emptyAnswers() {
    const answers = {};
    ANSWER_KEYS.forEach((key) => {
      answers[key] = null;
    });
    return answers;
  }

  function emptyActions() {
    const actions = {};
    ACTION_IDS.forEach((id) => {
      actions[id] = {
        status: 'pending',
        outcome: null,
        blockedReason: null,
        updatedAt: null
      };
    });
    return actions;
  }

  function createState() {
    const timestamp = now();
    return {
      schemaVersion: SCHEMA_VERSION,
      flowVersion: FLOW_VERSION,
      version: SCHEMA_VERSION,
      status: 'active',
      step: 'orientation',
      answers: emptyAnswers(),
      actions: emptyActions(),
      currentQuestionId: null,
      currentActionId: null,
      awaitingExternalReturnActionId: null,
      stabilizationStatus: 'not_started',
      privacyMode: 'memory-only',
      blockedReason: null,
      eraseAcknowledged: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: timestamp + SESSION_TTL_SECONDS * 1000
    };
  }

  function isAllowed(list, value) {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i] === value) return true;
    }
    return false;
  }

  function extraKeys(object, allowed) {
    return Object.keys(object || {}).filter((key) => allowed.indexOf(key) === -1);
  }

  function failure(error, message) {
    return { ok: false, error: error, message: message, state: null };
  }

  function validatePersistedState(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return failure('invalid-state', 'Recovery state is missing.');
    }

    const extras = extraKeys(input, STATE_KEYS);
    if (extras.length) {
      return failure('unknown-field', 'Unknown recovery fields are not allowed.');
    }

    if (input.schemaVersion !== SCHEMA_VERSION && input.version !== SCHEMA_VERSION) {
      return failure('invalid-state', 'Recovery state version is not supported.');
    }

    if (input.answers && extraKeys(input.answers, ANSWER_KEYS).length) {
      return failure('unknown-field', 'Unknown answer fields are not allowed.');
    }

    if (input.actions && extraKeys(input.actions, ACTION_IDS).length) {
      return failure('unknown-field', 'Unknown action records are not allowed.');
    }

    if (input.status != null && !isAllowed(ENUMS.status, input.status)) {
      return failure('invalid-state', 'Recovery status is not recognized.');
    }

    if (input.privacyMode != null && !isAllowed(ENUMS.privacyMode, input.privacyMode)) {
      return failure('invalid-state', 'Privacy mode is not recognized.');
    }

    if (input.currentQuestionId != null && QUESTION_IDS.indexOf(input.currentQuestionId) === -1) {
      return failure('invalid-state', 'Question id is not recognized.');
    }

    if (input.currentActionId != null && ACTION_IDS.indexOf(input.currentActionId) === -1) {
      return failure('invalid-state', 'Action id is not recognized.');
    }

    if (input.awaitingExternalReturnActionId != null && ACTION_IDS.indexOf(input.awaitingExternalReturnActionId) === -1) {
      return failure('invalid-state', 'Awaiting action id is not recognized.');
    }

    if (input.stabilizationStatus != null && !isAllowed(ENUMS.stabilizationStatus, input.stabilizationStatus)) {
      return failure('invalid-state', 'Stabilization status is not recognized.');
    }

    if (input.blockedReason != null && !isAllowed(ENUMS.blockedReason, input.blockedReason) && input.blockedReason !== 'cannot-sign-in') {
      return failure('invalid-state', 'Blocked reason is not recognized.');
    }

    const answers = input.answers || {};
    for (let i = 0; i < ANSWER_KEYS.length; i += 1) {
      const key = ANSWER_KEYS[i];
      if (answers[key] !== undefined && !isAllowed(ENUMS[key], answers[key])) {
        return failure('invalid-state', 'A recovery answer is not in the allowed set.');
      }
    }

    const actions = input.actions || {};
    const actionIds = Object.keys(actions);
    for (let i = 0; i < actionIds.length; i += 1) {
      const id = actionIds[i];
      const record = actions[id];
      if (!record || typeof record !== 'object') {
        return failure('invalid-state', 'Action record is invalid.');
      }
      if (extraKeys(record, ACTION_RECORD_KEYS).length) {
        return failure('unknown-field', 'Unknown action record fields are not allowed.');
      }
      if (record.status != null && !isAllowed(ENUMS.actionStatus, record.status)) {
        return failure('invalid-state', 'Action status is not recognized.');
      }
      if (record.blockedReason != null && !isAllowed(ENUMS.blockedReason, record.blockedReason)) {
        return failure('invalid-state', 'Action blocked reason is not recognized.');
      }
      if (record.outcome != null && typeof record.outcome !== 'string') {
        return failure('invalid-state', 'Action outcome is invalid.');
      }
      if (record.updatedAt != null && typeof record.updatedAt !== 'number') {
        return failure('invalid-state', 'Action timestamp is invalid.');
      }
    }

    const serialized = JSON.stringify(input);
    if (utf8ByteLength(serialized) > MAX_RECORD_BYTES) {
      return failure('oversized-state', 'Recovery record exceeds the maximum size.');
    }

    return { ok: true, error: null, message: null, state: input };
  }

  function serializeState(state) {
    const picked = {};
    STATE_KEYS.forEach((key) => {
      if (state[key] !== undefined) picked[key] = state[key];
    });
    const serialized = JSON.stringify(picked);
    if (utf8ByteLength(serialized) > MAX_RECORD_BYTES) {
      return failure('oversized-state', 'Recovery record exceeds the maximum size.');
    }
    const validated = validatePersistedState(JSON.parse(serialized));
    if (!validated.ok) return validated;
    return { ok: true, json: serialized, state: validated.state };
  }

  return {
    SCHEMA_VERSION,
    FLOW_VERSION,
    SESSION_TTL_SECONDS,
    MAX_RECORD_BYTES,
    REDIS_KEY_PREFIX,
    ACTION_IDS,
    QUESTION_IDS,
    ENUMS,
    ANSWER_KEYS,
    STATE_KEYS,
    ACTION_RECORD_KEYS,
    createState,
    validatePersistedState,
    serializeState,
    extraKeys,
    isAllowed
  };
});
