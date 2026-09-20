const { test } = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../recovery-state-schema.js');
const logic = require('../recovery-logic.js');

test('rejects unknown fields, invalid enums, and oversized records', () => {
  const valid = logic.createInitialState();
  valid.answers.situation = 'lost';
  valid.answers.platform = 'iphone';
  valid.answers.currentDevice = 'trusted';

  const unknown = schema.validatePersistedState(Object.assign({}, valid, { secretEmail: 'a@b.c' }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error, 'unknown-field');

  const unknownAnswer = schema.validatePersistedState(Object.assign({}, valid, {
    answers: Object.assign({}, valid.answers, { email: 'a@b.c' })
  }));
  assert.equal(unknownAnswer.ok, false);

  const invalidEnum = schema.validatePersistedState(Object.assign({}, valid, {
    answers: Object.assign({}, valid.answers, { situation: 'teleported' })
  }));
  assert.equal(invalidEnum.ok, false);

  const huge = logic.createInitialState();
  huge.answers.situation = 'lost';
  huge.answers.platform = 'iphone';
  huge.answers.currentDevice = 'trusted';
  huge.actions['apple-locate-device'].outcome = 'x'.repeat(20000);
  const oversized = schema.validatePersistedState(huge);
  assert.equal(oversized.ok, false);
  assert.equal(oversized.error, 'oversized-state');
});

test('createState uses schema version 2 and allowed action statuses', () => {
  const state = schema.createState();
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.status, 'active');
  assert.equal(state.actions['personal-safety'].status, 'pending');
  assert.equal(state.awaitingExternalReturnActionId, null);
  assert.ok(schema.ENUMS.actionStatus.includes('blocked'));
  assert.ok(schema.ENUMS.blockedReason.includes('unsafe_to_retrieve'));
});
