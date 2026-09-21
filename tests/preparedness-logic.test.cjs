const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const logic = require('../preparedness-logic.js');
const schema = require('../preparedness-state-schema.js');
const registry = require('../preparedness-recommendations.js');
const content = require('../preparedness-content.js');
const analytics = require('../analytics-events.js');
const recoveryLogic = require('../recovery-logic.js');

const PLATFORMS = ['iphone', 'android', 'other', 'not_sure'];
const SCREEN = ['both', 'some', 'neither', 'not_sure'];
const BACKUP = ['yes', 'no', 'not_sure'];
const PASSWORD = ['all', 'some', 'none', 'not_sure'];
const TRAVEL = ['yes', 'no', 'not_applicable', 'not_sure'];

function answerAll(platform, answers) {
  let view = { state: logic.createInitialState() };
  view = logic.answerQuestion(view.state, 'platform', platform);
  view = logic.answerQuestion(view.state, 'screenProtection', answers.screenProtection);
  view = logic.answerQuestion(view.state, 'cloudBackup', answers.cloudBackup);
  view = logic.answerQuestion(view.state, 'passwordSecurity', answers.passwordSecurity);
  view = logic.answerQuestion(view.state, 'travelConnectivity', answers.travelConnectivity);
  return view;
}

function expectedScreen(value) {
  if (value === 'both') return 'protected';
  if (value === 'some' || value === 'neither') return 'needs_setup';
  return 'not_sure';
}

function expectedBackup(value) {
  if (value === 'yes') return 'protected';
  if (value === 'no') return 'needs_setup';
  return 'not_sure';
}

function expectedPassword(value) {
  if (value === 'all') return 'protected';
  if (value === 'some' || value === 'none') return 'needs_setup';
  return 'not_sure';
}

function expectedTravel(value) {
  if (value === 'yes') return 'protected';
  if (value === 'not_applicable') return 'not_applicable';
  if (value === 'no') return 'needs_setup';
  return 'not_sure';
}

test('schema rejects unknown fields and undocumented enums', () => {
  const state = logic.createInitialState();
  state.extra = true;
  assert.equal(schema.validateState(state).ok, false);
  const valid = logic.createInitialState();
  valid.platform = 'windows';
  assert.equal(schema.validateState(valid).ok, false);
  const oldYes = logic.createInitialState();
  oldYes.answers.screenProtection = 'yes';
  assert.equal(schema.validateState(oldYes).ok, false);
  const oldTravel = logic.createInitialState();
  oldTravel.answers.travelConnectivity = 'not_needed_now';
  assert.equal(schema.validateState(oldTravel).ok, false);
});

test('compound answers do not mark Protected unless every required condition is known', () => {
  const mixedScreen = answerAll('iphone', {
    screenProtection: 'some',
    cloudBackup: 'yes',
    passwordSecurity: 'all',
    travelConnectivity: 'yes'
  });
  assert.equal(mixedScreen.state.results.screen_protection, 'needs_setup');
  assert.equal(mixedScreen.state.results.password_security, 'protected');

  const mixedPassword = answerAll('android', {
    screenProtection: 'both',
    cloudBackup: 'yes',
    passwordSecurity: 'some',
    travelConnectivity: 'yes'
  });
  assert.equal(mixedPassword.state.results.password_security, 'needs_setup');

  const neither = answerAll('other', {
    screenProtection: 'neither',
    cloudBackup: 'no',
    passwordSecurity: 'none',
    travelConnectivity: 'no'
  });
  assert.deepEqual(neither.state.results, {
    screen_protection: 'needs_setup',
    cloud_backup: 'needs_setup',
    password_security: 'needs_setup',
    travel_connectivity: 'needs_setup'
  });
});

test('travel Not applicable is distinct and does not count as Protected', () => {
  const view = answerAll('iphone', {
    screenProtection: 'both',
    cloudBackup: 'yes',
    passwordSecurity: 'all',
    travelConnectivity: 'not_applicable'
  });
  assert.equal(view.state.results.travel_connectivity, 'not_applicable');
  assert.notEqual(view.state.results.travel_connectivity, 'protected');
  const protectedCount = Object.keys(view.state.results).filter(function (id) {
    return view.state.results[id] === 'protected';
  }).length;
  assert.equal(protectedCount, 3);
  assert.equal(view.showAmazonDisclosure, false);
});

test('every changed answer combination maps truthfully across platforms', () => {
  let count = 0;
  PLATFORMS.forEach(function (platform) {
    SCREEN.forEach(function (screenProtection) {
      BACKUP.forEach(function (cloudBackup) {
        PASSWORD.forEach(function (passwordSecurity) {
          TRAVEL.forEach(function (travelConnectivity) {
            const view = answerAll(platform, {
              screenProtection: screenProtection,
              cloudBackup: cloudBackup,
              passwordSecurity: passwordSecurity,
              travelConnectivity: travelConnectivity
            });
            count += 1;
            assert.equal(view.ok, true);
            assert.equal(view.type, 'results');
            assert.equal(view.state.results.screen_protection, expectedScreen(screenProtection));
            assert.equal(view.state.results.cloud_backup, expectedBackup(cloudBackup));
            assert.equal(view.state.results.password_security, expectedPassword(passwordSecurity));
            assert.equal(view.state.results.travel_connectivity, expectedTravel(travelConnectivity));
            assert.ok(view.lead && view.lead.categoryId);
            assert.equal(view.state.results.screen_protection === 'protected', screenProtection === 'both');
            assert.equal(view.state.results.password_security === 'protected', passwordSecurity === 'all');
            assert.equal(view.state.results.travel_connectivity === 'protected', travelConnectivity === 'yes');
            const products = view.products || [];
            const official = view.official || [];
            products.forEach(function (record) {
              assert.equal(record.commercialType, 'amazon_associate');
              assert.equal(view.state.results[record.gap], 'needs_setup');
            });
            official.forEach(function (record) {
              assert.equal(record.commercialType, 'none');
              assert.equal(view.state.results[record.gap], 'needs_setup');
              assert.equal(record.platform === 'any' || record.platform === platform, true);
            });
            assert.equal(view.showAmazonDisclosure, products.length > 0);
            if (screenProtection === 'not_sure' && cloudBackup === 'not_sure' && passwordSecurity === 'not_sure') {
              assert.equal(products.length, 0);
            }
          });
        });
      });
    });
  });
  assert.equal(count, PLATFORMS.length * SCREEN.length * BACKUP.length * PASSWORD.length * TRAVEL.length);
});

test('results lead with the highest-risk next action', () => {
  const setup = answerAll('iphone', {
    screenProtection: 'neither',
    cloudBackup: 'no',
    passwordSecurity: 'none',
    travelConnectivity: 'no'
  });
  assert.equal(setup.lead.categoryId, 'password_security');
  assert.equal(setup.lead.kind, 'needs_setup');
  assert.ok(setup.official.some(function (record) { return record.id === 'apple-passwords-official'; }));

  const mixedThenBackup = answerAll('android', {
    screenProtection: 'some',
    cloudBackup: 'no',
    passwordSecurity: 'all',
    travelConnectivity: 'yes'
  });
  assert.equal(mixedThenBackup.lead.categoryId, 'cloud_backup');
  assert.ok(mixedThenBackup.official.some(function (record) { return record.id === 'android-backup-official'; }));

  const unsure = answerAll('other', {
    screenProtection: 'not_sure',
    cloudBackup: 'not_sure',
    passwordSecurity: 'not_sure',
    travelConnectivity: 'not_sure'
  });
  assert.equal(unsure.lead.categoryId, 'password_security');
  assert.equal(unsure.lead.kind, 'not_sure');
  assert.deepEqual(unsure.products, []);
  assert.deepEqual(unsure.official, []);

  const allClear = answerAll('iphone', {
    screenProtection: 'both',
    cloudBackup: 'yes',
    passwordSecurity: 'all',
    travelConnectivity: 'yes'
  });
  assert.equal(allClear.lead.kind, 'protected');
  assert.equal(allClear.lead.categoryId, 'password_security');
  assert.deepEqual(allClear.products, []);

  const travelNA = answerAll('android', {
    screenProtection: 'both',
    cloudBackup: 'yes',
    passwordSecurity: 'all',
    travelConnectivity: 'not_applicable'
  });
  assert.equal(travelNA.lead.kind, 'protected');
  assert.equal(travelNA.lead.categoryId, 'password_security');
  assert.equal(travelNA.state.results.travel_connectivity, 'not_applicable');
});

test('protected and not_sure categories do not force commercial recommendations', () => {
  const protectedView = answerAll('iphone', {
    screenProtection: 'both',
    cloudBackup: 'yes',
    passwordSecurity: 'all',
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
    screenProtection: 'neither',
    cloudBackup: 'no',
    passwordSecurity: 'none',
    travelConnectivity: 'yes'
  });
  const ids = logic.recommendationIdsFor(iphone.state);
  assert.ok(ids.includes('case-search-amazon'));
  assert.ok(ids.includes('screen-protector-search-amazon'));
  assert.ok(ids.includes('icloud-backup-official'));
  assert.ok(ids.includes('apple-passwords-official'));
  assert.equal(ids.includes('android-backup-official'), false);
  assert.equal(ids.includes('google-password-manager-official'), false);
  const split = logic.splitRecommendations(iphone.state);
  assert.equal(split.showAmazonDisclosure, true);
  split.official.forEach((record) => {
    assert.equal(record.commercialType, 'none');
  });
  split.products.forEach((record) => {
    assert.equal(record.commercialType, 'amazon_associate');
  });
  logic.displayableRecommendations(iphone.state).forEach((record) => {
    assert.equal(record.active, true);
    assert.ok(record.destinationUrl);
    assert.equal(record.platform === 'any' || record.platform === 'iphone', true);
  });
});

test('inactive recommendation does not display and inactive eSIM slot does not break results', () => {
  const view = answerAll('iphone', {
    screenProtection: 'both',
    cloudBackup: 'yes',
    passwordSecurity: 'all',
    travelConnectivity: 'no'
  });
  assert.equal(view.ok, true);
  assert.equal(view.state.results.travel_connectivity, 'needs_setup');
  const ids = logic.recommendationIdsFor(view.state);
  assert.ok(ids.includes('travel-connectivity-provider'));
  const displayable = logic.displayableRecommendations(view.state);
  assert.equal(displayable.some((item) => item.id === 'travel-connectivity-provider'), false);
  assert.equal(displayable.length, 0);
  assert.equal(view.showAmazonDisclosure, false);
  assert.match(content.NEUTRAL_MISSING, /eSIM/);
});

test('affiliate URL comes only from the registry', () => {
  const record = registry.getRecord('case-search-amazon');
  assert.equal(record.destinationUrl, 'https://www.amazon.com/s?k=protective+phone+case&tag=lostphones-20');
  const protector = registry.getRecord('screen-protector-search-amazon');
  assert.equal(protector.destinationUrl.indexOf('tag=lostphones-20') !== -1, true);
  logic.displayableRecommendations(answerAll('android', {
    screenProtection: 'neither',
    cloudBackup: 'yes',
    passwordSecurity: 'all',
    travelConnectivity: 'yes'
  }).state).forEach((item) => {
    assert.equal(item.destinationUrl, registry.getRecord(item.id).destinationUrl);
  });
});

test('Amazon disclosure is tied to a visible affiliate recommendation', () => {
  const withProduct = answerAll('iphone', {
    screenProtection: 'some',
    cloudBackup: 'yes',
    passwordSecurity: 'all',
    travelConnectivity: 'not_applicable'
  });
  assert.equal(withProduct.showAmazonDisclosure, true);
  assert.ok(withProduct.products.length > 0);

  const withoutProduct = answerAll('android', {
    screenProtection: 'both',
    cloudBackup: 'no',
    passwordSecurity: 'all',
    travelConnectivity: 'yes'
  });
  assert.equal(withoutProduct.showAmazonDisclosure, false);
  assert.equal(withoutProduct.products.length, 0);
  assert.ok(withoutProduct.official.some(function (record) { return record.id === 'android-backup-official'; }));
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
