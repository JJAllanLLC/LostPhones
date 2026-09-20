(function (global, factory) {
  const api = factory(
    typeof module === 'object' && module.exports
      ? require('./recovery-content.js')
      : global.LostPhonesRecoveryContent
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesRecoveryLogic = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (content) {
  if (!content) {
    throw new Error('LostPhones recovery content registry is missing.');
  }

  const SITUATIONS = Object.freeze(['nearby', 'lost', 'stolen', 'unsure']);
  const PLATFORMS = Object.freeze(['iphone', 'android', 'unsure']);
  const CURRENT_DEVICES = Object.freeze(['trusted', 'borrowed', 'public']);
  const STEPS = Object.freeze([
    'orientation',
    'situation',
    'platform',
    'currentDevice',
    'action',
    'auth-fallback'
  ]);

  function createInitialState() {
    return {
      version: 1,
      step: 'orientation',
      answers: {
        situation: null,
        platform: null,
        currentDevice: null
      },
      privacyMode: 'memory-only',
      currentActionId: null,
      blockedReason: null
    };
  }

  function isAllowedValue(list, value) {
    return list.indexOf(value) !== -1;
  }

  function failure(code, message) {
    return {
      ok: false,
      error: code,
      message: message,
      actionId: null,
      content: null,
      privacyModifier: null
    };
  }

  function validateState(state) {
    if (!state || typeof state !== 'object') {
      return failure('invalid-state', 'Recovery state is missing.');
    }

    if (state.version !== 1) {
      return failure('invalid-state', 'Recovery state version is not supported.');
    }

    if (state.privacyMode !== 'memory-only') {
      return failure('invalid-state', 'Recovery state must remain memory-only.');
    }

    if (state.step && STEPS.indexOf(state.step) === -1) {
      return failure('invalid-state', 'Recovery step is not recognized.');
    }

    if (state.blockedReason != null && state.blockedReason !== 'cannot-sign-in') {
      return failure('invalid-state', 'Recovery blocked reason is not recognized.');
    }

    if (!state.answers || typeof state.answers !== 'object') {
      return failure('invalid-state', 'Recovery answers are missing.');
    }

    const { situation, platform, currentDevice } = state.answers;
    const present = [situation, platform, currentDevice];
    const provided = present.filter((value) => value != null);

    if (provided.length < 3) {
      if (provided.some((value, index) => {
        const allowed = [SITUATIONS, PLATFORMS, CURRENT_DEVICES][present.indexOf(value)];
        return value != null && allowed && allowed.indexOf(value) === -1;
      })) {
        return failure('invalid-state', 'A recovery answer is not in the allowed set.');
      }

      if (
        (situation != null && !isAllowedValue(SITUATIONS, situation)) ||
        (platform != null && !isAllowedValue(PLATFORMS, platform)) ||
        (currentDevice != null && !isAllowedValue(CURRENT_DEVICES, currentDevice))
      ) {
        return failure('invalid-state', 'A recovery answer is not in the allowed set.');
      }

      return failure('incomplete-state', 'Recovery answers are incomplete.');
    }

    if (!isAllowedValue(SITUATIONS, situation) || !isAllowedValue(PLATFORMS, platform) || !isAllowedValue(CURRENT_DEVICES, currentDevice)) {
      return failure('invalid-state', 'A recovery answer is not in the allowed set.');
    }

    if (state.currentActionId != null && content.APPROVED_ACTION_IDS.indexOf(state.currentActionId) === -1) {
      return failure('invalid-state', 'The current action is not approved.');
    }

    return { ok: true };
  }

  function resolvePrimaryActionId(situation, platform) {
    if (situation === 'stolen') {
      return 'personal-safety';
    }

    if (platform === 'unsure') {
      return 'identify-platform';
    }

    if (situation === 'nearby') {
      return platform === 'iphone' ? 'apple-play-sound' : 'google-play-sound';
    }

    if (situation === 'lost') {
      return platform === 'iphone' ? 'apple-locate-mark-lost' : 'google-locate-secure';
    }

    if (situation === 'unsure') {
      return platform === 'iphone' ? 'apple-reversible-locate' : 'google-reversible-locate';
    }

    return null;
  }

  function resolveAuthFallbackId(platform) {
    if (platform === 'iphone') {
      return 'apple-auth-fallback';
    }
    if (platform === 'android') {
      return 'google-auth-fallback';
    }
    return null;
  }

  function success(state, actionId, record) {
    return {
      ok: true,
      error: null,
      actionId: actionId,
      platform: state.answers.platform,
      situation: state.answers.situation,
      currentDevice: state.answers.currentDevice,
      privacyModifier: state.answers.currentDevice,
      privacyGuidance: content.privacyGuidance[state.answers.currentDevice],
      content: record
    };
  }

  function selectFirstAction(state) {
    const validation = validateState(state);
    if (!validation.ok) {
      return validation;
    }

    if (state.blockedReason === 'cannot-sign-in') {
      const fallbackId = resolveAuthFallbackId(state.answers.platform);
      if (!fallbackId) {
        return failure('invalid-state', 'Authentication fallback requires a known platform.');
      }

      const primaryId = resolvePrimaryActionId(state.answers.situation, state.answers.platform);
      if (!primaryId || content.AUTH_RELEVANT_ACTION_IDS.indexOf(primaryId) === -1) {
        return failure('invalid-state', 'Authentication fallback is not relevant for this action.');
      }

      const record = content.getAction(fallbackId, state.answers.platform);
      if (!record) {
        return failure('invalid-state', 'No approved authentication fallback was found.');
      }

      return success(state, fallbackId, record);
    }

    const actionId = resolvePrimaryActionId(state.answers.situation, state.answers.platform);
    if (!actionId || content.APPROVED_ACTION_IDS.indexOf(actionId) === -1) {
      return failure('invalid-state', 'No approved first action was found.');
    }

    const record = content.getAction(actionId, state.answers.platform);
    if (!record) {
      return failure('invalid-state', 'No approved action copy was found.');
    }

    if (record.applicableSituations.indexOf(state.answers.situation) === -1) {
      return failure('invalid-state', 'The selected action does not apply to this situation.');
    }

    return success(state, actionId, record);
  }

  function allCombinations() {
    const results = [];
    SITUATIONS.forEach((situation) => {
      PLATFORMS.forEach((platform) => {
        CURRENT_DEVICES.forEach((currentDevice) => {
          const state = createInitialState();
          state.step = 'action';
          state.answers = { situation, platform, currentDevice };
          results.push({
            situation,
            platform,
            currentDevice,
            result: selectFirstAction(state)
          });
        });
      });
    });
    return results;
  }

  return {
    SITUATIONS,
    PLATFORMS,
    CURRENT_DEVICES,
    STEPS,
    APPROVED_ACTION_IDS: content.APPROVED_ACTION_IDS,
    createInitialState,
    validateState,
    selectFirstAction,
    allCombinations
  };
});
