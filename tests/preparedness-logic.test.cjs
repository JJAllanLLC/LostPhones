const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const logic = require('../preparedness-logic.js');
const schema = require('../preparedness-state-schema.js');
const registry = require('../preparedness-recommendations.js');
const analytics = require('../analytics-events.js');
const recoveryLogic = require('../recovery-logic.js');

function answerAll(platform, answers) {
  let view = { state: logic.createInitialState() };
  view = logic.answerQuestion(view.state, 'platform', platform);
  view = logic.answerQuestion(view.state, 'screenProtection', answers.screenProtection);
  view = logic.answerQuestion(view.state, 'cloudBackup', answers.cloudBackup);
  view = logic.answerQuestion(view.state, 'passwordSecurity', answers.passwordSecurity);
  view = logic.answerQuestion(view.state, 'travelConnectivity', answers.travelConnectivity);
  return view;
}

test('schema rejects unknown fields and undocumented enums', () => {
  const state = logic.createInitialState();
  state.extra = true;
  assert.equal(schema.validateState(state).ok, false);
  const valid = logic.createInitialState();
  valid.platform = 'windows';
  assert.equal(schema.validateState(valid).ok, false);
});

test('deterministic mapping for all four preparedness categories', () => {
  const protectedView = answerAll('iphone', {
    screenProtection: 'yes',
    cloudBackup: 'yes',
    passwordSecurity: 'yes',
    travelConnectivity: 'yes'
  });
  assert.equal(protectedView.type, 'results');
  assert.deepEqual(protectedView.state.results, {
    screen_protection: 'protected',
    cloud_backup: 'protected',
    password_security: 'protected',
    travel_connectivity: 'protected'
  });

  const setupView = answerAll('android', {
    screenProtection: 'no',
    cloudBackup: 'no',
    passwordSecurity: 'no',
    travelConnectivity: 'no'
  });
  assert.deepEqual(setupView.state.results, {
    screen_protection: 'needs_setup',
    cloud_backup: 'needs_setup',
    password_security: 'needs_setup',
    travel_connectivity: 'needs_setup'
  });

  const unsureView = answerAll('not_sure', {
    screenProtection: 'not_sure',
    cloudBackup: 'not_sure',
    passwordSecurity: 'not_sure',
    travelConnectivity: 'not_sure'
  });
  assert.deepEqual(unsureView.state.results, {
    screen_protection: 'not_sure',
    cloud_backup: 'not_sure',
    password_security: 'not_sure',
    travel_connectivity: 'not_sure'
  });

  const travelProtected = answerAll('other', {
    screenProtection: 'yes',
    cloudBackup: 'no',
    passwordSecurity: 'yes',
    travelConnectivity: 'not_needed_now'
  });
  assert.equal(travelProtected.state.results.travel_connectivity, 'protected');
});

test('protected and not_sure categories do not force commercial recommendations', () => {
  const protectedView = answerAll('iphone', {
    screenProtection: 'yes',
    cloudBackup: 'yes',
    passwordSecurity: 'yes',
    travelConnectivity: 'yes'
  });
  assert.deepEqual(logic.displayableRecommendations(protectedView.state), []);
  assert.deepEqual(logic.recommendationIdsFor(protectedView.state), []);

  const unsureView = answerAll('android', {
    screenProtection: 'not_sure',
    cloudBackup: 'not_sure',
    passwordSecurity: 'not_sure',
    travelConnectivity: 'not_sure'
  });
  assert.deepEqual(logic.displayableRecommendations(unsureView.state), []);
  assert.ok(logic.recommendationIdsFor(unsureView.state).every((id) => {
    const record = registry.getRecord(id);
    return record && unsureView.state.results[record.gap] === 'needs_setup';
  }));
});

test('needs_setup uses only matching active registry records', () => {
  const iphone = answerAll('iphone', {
    screenProtection: 'no',
    cloudBackup: 'no',
    passwordSecurity: 'no',
    travelConnectivity: 'yes'
  });
  const ids = logic.recommendationIdsFor(iphone.state);
  assert.ok(ids.includes('case-search-amazon'));
  assert.ok(ids.includes('screen-protector-search-amazon'));
  assert.ok(ids.includes('icloud-backup-official'));
  assert.ok(ids.includes('apple-passwords-official'));
  assert.equal(ids.includes('android-backup-official'), false);
  assert.equal(ids.includes('google-password-manager-official'), false);
  logic.displayableRecommendations(iphone.state).forEach((record) => {
    assert.equal(record.active, true);
    assert.ok(record.destinationUrl);
    assert.equal(record.platform === 'any' || record.platform === 'iphone', true);
  });
});

test('inactive recommendation does not display and inactive eSIM slot does not break results', () => {
  const view = answerAll('iphone', {
    screenProtection: 'yes',
    cloudBackup: 'yes',
    passwordSecurity: 'yes',
    travelConnectivity: 'no'
  });
  assert.equal(view.ok, true);
  assert.equal(view.state.results.travel_connectivity, 'needs_setup');
  const ids = logic.recommendationIdsFor(view.state);
  assert.ok(ids.includes('travel-connectivity-provider'));
  const displayable = logic.displayableRecommendations(view.state);
  assert.equal(displayable.some((item) => item.id === 'travel-connectivity-provider'), false);
  assert.equal(displayable.length, 0);
});

test('affiliate URL comes only from the registry', () => {
  const record = registry.getRecord('case-search-amazon');
  assert.equal(record.destinationUrl, 'https://www.amazon.com/s?k=protective+phone+case&tag=lostphones-20');
  const protector = registry.getRecord('screen-protector-search-amazon');
  assert.equal(protector.destinationUrl.indexOf('tag=lostphones-20') !== -1, true);
  logic.displayableRecommendations(answerAll('android', {
    screenProtection: 'no',
    cloudBackup: 'yes',
    passwordSecurity: 'yes',
    travelConnectivity: 'yes'
  }).state).forEach((item) => {
    assert.equal(item.destinationUrl, registry.getRecord(item.id).destinationUrl);
  });
});

test('emergency recovery logic is independent of the commercial registry', () => {
  const source = fs.readFileSync(path.join(__dirname, '../recovery-logic.js'), 'utf8');
  assert.equal(source.includes('preparedness-recommendations'), false);
  const view = recoveryLogic.selectFirstAction((() => {
    const state = recoveryLogic.createInitialState();
    state.answers.situation = 'lost';
    state.answers.platform = 'iphone';
    state.answers.currentDevice = 'trusted';
    return state;
  })());
  assert.equal(view.ok, true);
  assert.equal(view.actionId, 'apple-locate-device');
});

test('analytics allowlists events and properties and stays local-only', () => {
  const ok = analytics.track('preparedness_started');
  assert.equal(ok.ok, true);
  assert.equal(ok.event.transport, 'local-only');
  assert.equal(analytics.track('unknown_event').ok, false);
  assert.equal(analytics.track('preparedness_gap_identified', { category: 'screen_protection', extra: true }).ok, false);
  assert.equal(analytics.track('preparedness_recommendation_clicked', { recommendationId: 'case-search-amazon', url: 'https://example.com' }).ok, false);
  assert.equal(analytics.track('recovery_checkout_started', { productId: analytics.PRODUCT_ID, value: analytics.PRODUCT_VALUE, sessionId: 'cs_test' }).ok, false);
  assert.equal(analytics.track('recovery_paid_offer_viewed', { status: 'stabilized' }).ok, true);
});
