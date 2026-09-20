const { test } = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../recovery-logic.js');
const content = require('../recovery-content.js');

function answeredState(situation, platform, currentDevice, extra) {
  const state = logic.createInitialState();
  state.step = 'action';
  state.answers = { situation, platform, currentDevice };
  return Object.assign(state, extra || {});
}

test('nearby iPhone → Apple play-sound action', () => {
  const result = logic.selectFirstAction(answeredState('nearby', 'iphone', 'trusted'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'apple-play-sound');
  assert.equal(result.content.officialUrl, content.OFFICIAL_URLS.appleFind);
  assert.match(result.content.title, /^Play /);
});

test('lost iPhone → Apple locate action', () => {
  const result = logic.selectFirstAction(answeredState('lost', 'iphone', 'trusted'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'apple-locate-mark-lost');
  assert.equal(result.content.officialUrl, content.OFFICIAL_URLS.appleFind);
});

test('stolen iPhone → personal-safety action with iPhone context', () => {
  const result = logic.selectFirstAction(answeredState('stolen', 'iphone', 'trusted'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'personal-safety');
  assert.equal(result.content.platform, 'iphone');
  assert.equal(result.content.nextServiceName, 'Apple Find Devices');
  assert.match(result.content.instruction, /Apple Find Devices/);
  assert.match(result.content.instruction, /Never confront|Do not confront/i);
});

test('nearby Android → Google play-sound action', () => {
  const result = logic.selectFirstAction(answeredState('nearby', 'android', 'trusted'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'google-play-sound');
  assert.equal(result.content.officialUrl, content.OFFICIAL_URLS.googleFind);
});

test('lost Android → Google locate action', () => {
  const result = logic.selectFirstAction(answeredState('lost', 'android', 'trusted'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'google-locate-secure');
  assert.equal(result.content.officialUrl, content.OFFICIAL_URLS.googleFind);
});

test('stolen Android → personal-safety action with Android context', () => {
  const result = logic.selectFirstAction(answeredState('stolen', 'android', 'trusted'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'personal-safety');
  assert.equal(result.content.platform, 'android');
  assert.equal(result.content.nextServiceName, 'Google Find Hub');
  assert.match(result.content.instruction, /Google Find Hub/);
});

test('unsure situation plus iPhone → reversible Apple location action', () => {
  const result = logic.selectFirstAction(answeredState('unsure', 'iphone', 'trusted'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'apple-reversible-locate');
  assert.match(result.content.caution, /confront/i);
});

test('unsure situation plus Android → reversible Google location action', () => {
  const result = logic.selectFirstAction(answeredState('unsure', 'android', 'trusted'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'google-reversible-locate');
  assert.match(result.content.caution, /confront/i);
});

test('unknown platform → identify-platform action', () => {
  for (const situation of ['nearby', 'lost', 'unsure']) {
    const result = logic.selectFirstAction(answeredState(situation, 'unsure', 'trusted'));
    assert.equal(result.ok, true);
    assert.equal(result.actionId, 'identify-platform');
    assert.equal(result.content.officialUrl, null);
  }
});

test('borrowed device → borrowed privacy modifier', () => {
  const result = logic.selectFirstAction(answeredState('nearby', 'iphone', 'borrowed'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'apple-play-sound');
  assert.equal(result.privacyModifier, 'borrowed');
  assert.equal(result.privacyGuidance.id, 'borrowed');
  assert.ok(result.privacyGuidance.items.includes('Use the phone owner’s account only.'));
});

test('public/shared device → public privacy modifier', () => {
  const result = logic.selectFirstAction(answeredState('lost', 'android', 'public'));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'google-locate-secure');
  assert.equal(result.privacyModifier, 'public');
  assert.equal(result.privacyGuidance.id, 'public');
  assert.ok(result.privacyGuidance.items.includes('Do not save passwords.'));
});

test('Apple blocked authentication → Apple recovery fallback', () => {
  const result = logic.selectFirstAction(answeredState('lost', 'iphone', 'borrowed', {
    blockedReason: 'cannot-sign-in'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'apple-auth-fallback');
  assert.equal(result.content.officialUrl, content.OFFICIAL_URLS.appleAccountRecovery);
  assert.equal(result.privacyModifier, 'borrowed');
  assert.match(result.content.instruction, /Find Devices/);
});

test('Google blocked authentication → Google recovery fallback', () => {
  const result = logic.selectFirstAction(answeredState('nearby', 'android', 'public', {
    blockedReason: 'cannot-sign-in'
  }));
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'google-auth-fallback');
  assert.equal(result.content.officialUrl, content.OFFICIAL_URLS.googleAccountRecovery);
  assert.equal(result.privacyModifier, 'public');
});

test('invalid or incomplete state → safe validation failure, not a guessed action', () => {
  const incomplete = logic.selectFirstAction(logic.createInitialState());
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.error, 'incomplete-state');
  assert.equal(incomplete.actionId, null);

  const invalid = logic.selectFirstAction(answeredState('teleported', 'iphone', 'trusted'));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, 'invalid-state');
  assert.equal(invalid.actionId, null);

  const missing = logic.selectFirstAction(null);
  assert.equal(missing.ok, false);
  assert.equal(missing.actionId, null);

  const unknownPlatformAuth = logic.selectFirstAction(answeredState('nearby', 'unsure', 'trusted', {
    blockedReason: 'cannot-sign-in'
  }));
  assert.equal(unknownPlatformAuth.ok, false);
  assert.equal(unknownPlatformAuth.actionId, null);
});

test('all combinations return only approved action IDs', () => {
  const results = logic.allCombinations();
  assert.equal(results.length, 36);
  for (const entry of results) {
    assert.equal(entry.result.ok, true, `${entry.situation}/${entry.platform}/${entry.currentDevice} failed`);
    assert.ok(
      logic.APPROVED_ACTION_IDS.includes(entry.result.actionId),
      `${entry.result.actionId} is not approved`
    );
  }
});
