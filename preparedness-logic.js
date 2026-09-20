(function (global, factory) {
  const api = factory(
    global && global.LostPhonesPreparednessSchema,
    global && global.LostPhonesPreparednessRecommendations
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesPreparednessLogic = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (schemaDep, registryDep) {
  const schema = schemaDep || (typeof require === 'function' ? require('./preparedness-state-schema.js') : null);
  const registry = registryDep || (typeof require === 'function' ? require('./preparedness-recommendations.js') : null);

  const YES_NO_MAP = Object.freeze({
    yes: 'protected',
    no: 'needs_setup',
    not_sure: 'not_sure'
  });
  const TRAVEL_MAP = Object.freeze({
    yes: 'protected',
    not_needed_now: 'protected',
    no: 'needs_setup',
    not_sure: 'not_sure'
  });
  const QUESTION_ORDER = Object.freeze([
    'platform',
    'screenProtection',
    'cloudBackup',
    'passwordSecurity',
    'travelConnectivity'
  ]);

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function mapYesNo(value) {
    return YES_NO_MAP[value] || null;
  }

  function mapResults(state) {
    const next = clone(state);
    next.results.screen_protection = mapYesNo(next.answers.screenProtection);
    next.results.cloud_backup = mapYesNo(next.answers.cloudBackup);
    next.results.password_security = mapYesNo(next.answers.passwordSecurity);
    next.results.travel_connectivity = TRAVEL_MAP[next.answers.travelConnectivity] || null;
    return next;
  }

  function recommendationIdsFor(state) {
    const ids = [];
    const validated = schema.validateState(state);
    if (!validated.ok) return ids;
    const current = mapResults(validated.state);
    const platform = current.platform;
    registry.RECORDS.forEach((record) => {
      if (current.results[record.gap] !== 'needs_setup') return;
      if (record.platform !== 'any' && record.platform !== platform) return;
      ids.push(record.id);
    });
    return ids;
  }

  function displayableRecommendations(state) {
    return registry.displayableRecords(recommendationIdsFor(state));
  }

  function nextQuestion(state) {
    if (!state.platform) return 'platform';
    for (let i = 1; i < QUESTION_ORDER.length; i += 1) {
      const id = QUESTION_ORDER[i];
      if (!state.answers[id]) return id;
    }
    return null;
  }

  function evaluate(state) {
    const validated = schema.validateState(state);
    if (!validated.ok) return validated;
    const current = mapResults(validated.state);
    const questionId = nextQuestion(current);
    if (questionId) {
      current.step = questionId;
      return { ok: true, type: 'question', questionId: questionId, state: current };
    }
    current.step = 'results';
    return {
      ok: true,
      type: 'results',
      state: current,
      recommendationIds: recommendationIdsFor(current)
    };
  }

  function answerQuestion(state, questionId, value) {
    const validated = schema.validateState(state);
    if (!validated.ok) return validated;
    const next = clone(validated.state);
    next.updatedAt = Date.now();
    if (questionId === 'platform') {
      next.platform = value;
      next.step = 'screenProtection';
    } else if (questionId === 'screenProtection' || questionId === 'cloudBackup' || questionId === 'passwordSecurity') {
      next.answers[questionId] = value;
    } else if (questionId === 'travelConnectivity') {
      next.answers.travelConnectivity = value;
    } else {
      return { ok: false, error: 'invalid-question' };
    }
    const mapped = mapResults(next);
    const checked = schema.validateState(mapped);
    if (!checked.ok) return checked;
    return evaluate(checked.state);
  }

  return {
    QUESTION_ORDER,
    clone,
    mapResults,
    recommendationIdsFor,
    displayableRecommendations,
    evaluate,
    answerQuestion,
    createInitialState: schema.createInitialState,
    validateState: schema.validateState
  };
});
