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

  const QUESTION_ORDER = Object.freeze([
    'platform',
    'screenProtection',
    'cloudBackup',
    'passwordSecurity',
    'travelConnectivity'
  ]);
  const RISK_ORDER = Object.freeze([
    'password_security',
    'cloud_backup',
    'screen_protection',
    'travel_connectivity'
  ]);
  const KIND_ORDER = Object.freeze(['needs_setup', 'not_sure', 'protected', 'not_applicable']);

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function mapScreen(value) {
    if (value === 'both') return 'protected';
    if (value === 'some' || value === 'neither') return 'needs_setup';
    if (value === 'not_sure') return 'not_sure';
    return null;
  }

  function mapBackup(value) {
    if (value === 'yes') return 'protected';
    if (value === 'no') return 'needs_setup';
    if (value === 'not_sure') return 'not_sure';
    return null;
  }

  function mapPassword(value) {
    if (value === 'all') return 'protected';
    if (value === 'some' || value === 'none') return 'needs_setup';
    if (value === 'not_sure') return 'not_sure';
    return null;
  }

  function mapTravel(value) {
    if (value === 'yes') return 'protected';
    if (value === 'not_applicable') return 'not_applicable';
    if (value === 'no') return 'needs_setup';
    if (value === 'not_sure') return 'not_sure';
    return null;
  }

  function mapResults(state) {
    const next = clone(state);
    next.results.screen_protection = mapScreen(next.answers.screenProtection);
    next.results.cloud_backup = mapBackup(next.answers.cloudBackup);
    next.results.password_security = mapPassword(next.answers.passwordSecurity);
    next.results.travel_connectivity = mapTravel(next.answers.travelConnectivity);
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

  function splitRecommendations(state) {
    const displayable = displayableRecommendations(state);
    const official = displayable.filter((record) => record.commercialType === 'none');
    const products = displayable.filter((record) => record.commercialType === 'amazon_associate');
    return {
      official: official,
      products: products,
      showAmazonDisclosure: products.length > 0
    };
  }

  function leadCategory(state) {
    const results = state.results || {};
    for (let k = 0; k < KIND_ORDER.length; k += 1) {
      const kind = KIND_ORDER[k];
      for (let i = 0; i < RISK_ORDER.length; i += 1) {
        const id = RISK_ORDER[i];
        if (results[id] === kind) return { categoryId: id, kind: kind };
      }
    }
    return null;
  }

  function remainingCategories(state, leadId) {
    const results = state.results || {};
    return RISK_ORDER.filter((id) => id !== leadId && (results[id] === 'needs_setup' || results[id] === 'not_sure'));
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
    const split = splitRecommendations(current);
    return {
      ok: true,
      type: 'results',
      state: current,
      recommendationIds: recommendationIdsFor(current),
      lead: leadCategory(current),
      official: split.official,
      products: split.products,
      showAmazonDisclosure: split.showAmazonDisclosure
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
    RISK_ORDER,
    clone,
    mapResults,
    recommendationIdsFor,
    displayableRecommendations,
    splitRecommendations,
    leadCategory,
    remainingCategories,
    evaluate,
    answerQuestion,
    createInitialState: schema.createInitialState,
    validateState: schema.validateState
  };
});
