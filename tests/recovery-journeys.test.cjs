const { test } = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../recovery-logic.js');
const content = require('../recovery-content.js');

function triage(situation, platform, currentDevice) {
  let view = { state: logic.createInitialState() };
  view = logic.answerQuestion(view.state, 'situation', situation);
  view = logic.answerQuestion(view.state, 'platform', platform);
  view = logic.answerQuestion(view.state, 'currentDevice', currentDevice);
  return view;
}

function assertAction(view, actionId) {
  assert.equal(view.ok, true, 'view should succeed');
  assert.equal(view.type, 'action', `expected action ${actionId}, got ${view.type}:${view.questionId || view.actionId}`);
  assert.equal(view.actionId, actionId);
}

function assertQuestion(view, questionId) {
  assert.equal(view.ok, true);
  assert.equal(view.type, 'question', `expected question ${questionId}, got ${view.type}:${view.actionId || view.questionId}`);
  assert.equal(view.questionId, questionId);
}

test('misplaced iPhone found', () => {
  let view = triage('nearby', 'iphone', 'trusted');
  assertAction(view, 'apple-play-sound');
  view = logic.startExternalAction(view.state, 'apple-play-sound');
  assert.equal(view.awaitingReturn, true);
  view = logic.recordOutcome(view.state, 'apple-play-sound', 'heard_nearby');
  assert.equal(view.state.awaitingExternalReturnActionId, null);
  assertQuestion(view, 'recovered');
  assert.equal(view.question.title, 'Do you have the iPhone with you now?');
  assert.equal(view.question.help, 'Choose Yes only if the phone is physically with you and safe to keep. Do not retrieve it from an unsafe place.');
  view = logic.answerQuestion(view.state, 'recovered', 'yes');
  assertQuestion(view, 'unlockRisk');
  assert.equal(view.state.actions['recovered-device-security-check'].status, 'completed');
  assert.equal(view.state.actions['recovered-device-security-check'].outcome, 'in_hand_safe');
  assert.equal(content.getAction('recovered-device-security-check', 'iphone').officialUrl, null);
  assert.equal(logic.startExternalAction(view.state, 'recovered-device-security-check').ok, false);
  view = logic.answerQuestion(view.state, 'unlockRisk', 'probably_not');
  assertQuestion(view, 'suspiciousActivity');
  view = logic.answerQuestion(view.state, 'suspiciousActivity', 'no');
  assert.equal(view.type, 'complete');
  assert.ok(view.state.status === 'recovered' || view.state.status === 'stabilized');
});

test('misplaced iPhone not found', () => {
  let view = triage('nearby', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-play-sound', 'not_heard');
  assertAction(view, 'apple-locate-device');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  assertAction(view, 'apple-mark-lost');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  assert.equal(view.state.answers.deviceSecured, 'yes');
  assert.ok(['complete', 'action'].includes(view.type));
});

test('lost iPhone located safely', () => {
  let view = triage('lost', 'iphone', 'trusted');
  assertAction(view, 'apple-locate-device');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'located_safe');
  assertQuestion(view, 'recovered');
  view = logic.answerQuestion(view.state, 'recovered', 'no');
  assertAction(view, 'apple-mark-lost');
});

test('lost iPhone located unsafely', () => {
  let view = triage('lost', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'located_unsafe');
  assertQuestion(view, 'safety');
  view = logic.answerQuestion(view.state, 'safety', 'unsafe');
  assertAction(view, 'personal-safety');
  assert.match(view.action.instruction, /Do not confront|Never confront/i);
});

test('lost iPhone offline', () => {
  let view = triage('lost', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'offline');
  assert.equal(view.state.actions['apple-locate-device'].status, 'completed');
  assertAction(view, 'apple-mark-lost');
  assert.equal(logic.isEraseAvailable(view.state), false);
});

test('lost iPhone cannot sign in', () => {
  let view = triage('lost', 'iphone', 'trusted');
  view = logic.startExternalAction(view.state, 'apple-locate-device');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'cannot_sign_in');
  assert.equal(view.state.actions['apple-locate-device'].status, 'blocked');
  assertAction(view, 'apple-auth-fallback');
});

test('stolen iPhone', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  assertQuestion(view, 'safety');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  assertAction(view, 'apple-locate-device');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  assertAction(view, 'apple-mark-lost');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  assertAction(view, 'protect-primary-account');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  assertAction(view, 'protect-mobile-line');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  assertAction(view, 'protect-financial-accounts');
});

test('lost Android located', () => {
  let view = triage('lost', 'android', 'trusted');
  assertAction(view, 'google-locate-device');
  view = logic.recordOutcome(view.state, 'google-locate-device', 'located_safe');
  assertQuestion(view, 'recovered');
});

test('lost Android offline', () => {
  let view = triage('lost', 'android', 'trusted');
  view = logic.recordOutcome(view.state, 'google-locate-device', 'offline');
  assertAction(view, 'google-mark-lost');
  assert.equal(logic.isEraseAvailable(view.state), false);
});

test('lost Android cannot sign in', () => {
  let view = triage('lost', 'android', 'trusted');
  view = logic.recordOutcome(view.state, 'google-locate-device', 'cannot_sign_in');
  assertAction(view, 'google-auth-fallback');
});

test('stolen Android', () => {
  let view = triage('stolen', 'android', 'borrowed');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  assertAction(view, 'google-locate-device');
  view = logic.recordOutcome(view.state, 'google-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'google-mark-lost', 'marked');
  assertAction(view, 'protect-primary-account');
});

test('unknown platform', () => {
  let view = triage('lost', 'unsure', 'trusted');
  assertAction(view, 'identify-platform');
  view = logic.recordOutcome(view.state, 'identify-platform', 'iphone');
  assert.equal(view.state.answers.platform, 'iphone');
  assertAction(view, 'apple-locate-device');
});

test('uncertain loss or theft', () => {
  let view = triage('unsure', 'iphone', 'trusted');
  assertAction(view, 'apple-locate-device');
  assert.match(view.action.caution, /confront/i);
});

test('recovered phone without compromise indicators', () => {
  let view = triage('lost', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'located_safe');
  view = logic.answerQuestion(view.state, 'recovered', 'yes');
  view = logic.answerQuestion(view.state, 'unlockRisk', 'probably_not');
  view = logic.answerQuestion(view.state, 'suspiciousActivity', 'no');
  assert.ok(view.state.status === 'recovered' || view.state.status === 'stabilized');
  assert.equal(view.state.actions['apple-mark-lost'].status, 'not_applicable');
});

test('recovered phone with compromise indicators', () => {
  let view = triage('lost', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'nearby');
  view = logic.answerQuestion(view.state, 'recovered', 'yes');
  view = logic.answerQuestion(view.state, 'unlockRisk', 'yes');
  view = logic.answerQuestion(view.state, 'suspiciousActivity', 'yes');
  assertAction(view, 'protect-primary-account');
});

test('account access blocked', () => {
  let view = triage('lost', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'cannot_sign_in');
  assert.equal(view.state.actions['apple-locate-device'].blockedReason, 'cannot_sign_in');
  assertAction(view, 'apple-auth-fallback');
  view = logic.recordOutcome(view.state, 'apple-auth-fallback', 'still_blocked');
  assert.equal(view.state.actions['apple-auth-fallback'].status, 'blocked');
});

test('verification unavailable', () => {
  let view = triage('lost', 'android', 'trusted');
  view = logic.recordOutcome(view.state, 'google-locate-device', 'cannot_receive_verification');
  assertAction(view, 'google-auth-fallback');
  assert.equal(view.state.answers.verificationAccess, 'no');
});

test('borrowed device stays session-oriented', () => {
  const view = triage('nearby', 'iphone', 'borrowed');
  assert.equal(view.state.answers.currentDevice, 'borrowed');
  assert.equal(view.state.privacyMode, 'memory-only');
  assertAction(view, 'apple-play-sound');
});

test('public/shared device never requires local persistence', () => {
  const view = triage('lost', 'android', 'public');
  assert.equal(view.state.answers.currentDevice, 'public');
  assert.equal(content.privacyGuidance.public.items.some((item) => /private browsing|Close the browser/i.test(item)), true);
});

test('blocked action plus independent safe action', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'cannot_sign_in');
  view = logic.recordOutcome(view.state, 'apple-auth-fallback', 'still_blocked');
  assert.equal(view.state.actions['apple-locate-device'].status, 'blocked');
  assert.notEqual(view.state.actions['apple-locate-device'].status, 'completed');
  assertAction(view, 'protect-mobile-line');
});

test('stabilized after applicable protections', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  assert.equal(view.type, 'complete');
  assert.equal(view.state.status, 'stabilized');
  const plan = logic.buildPlan(view.state);
  assert.ok(plan.later.some((item) => item.actionId === 'report-and-document'));
  assert.ok(plan.later.some((item) => item.actionId === 'recovery-replacement-transition'));
});

test('stabilized with blockers keeps blocked action in Next', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'cannot_access_carrier');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  assert.equal(view.state.status, 'stabilized_with_blockers');
  assert.equal(view.state.actions['protect-mobile-line'].status, 'blocked');
  const plan = logic.buildPlan(view.state);
  const line = plan.next.find((item) => item.actionId === 'protect-mobile-line');
  assert.equal(line.status, 'blocked');
});

test('stabilization with Later tasks remaining', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'already_secure');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'no_exposure');
  assert.equal(view.state.status, 'stabilized');
  assert.ok(['pending', 'not_applicable'].includes(view.state.actions['report-and-document'].status));
  assert.ok(['pending', 'not_applicable'].includes(view.state.actions['recovery-replacement-transition'].status));
});

test('erase unavailable before prerequisites and not merely because offline', () => {
  let view = triage('lost', 'iphone', 'trusted');
  assert.equal(logic.isEraseAvailable(view.state), false);
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'offline');
  assert.equal(logic.isEraseAvailable(view.state), false);
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  assert.equal(logic.isEraseAvailable(view.state), false);
});

test('erase requires dual confirmation after reversible steps and risk', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'offline');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  assert.equal(view.type, 'complete');
  assert.equal(view.state.status, 'stabilized');
  assert.equal(logic.isEraseAvailable(view.state), true);
  assert.equal(view.eraseAvailable, true);
  view = logic.reviewErase(view.state);
  assertQuestion(view, 'eraseAcknowledge');
  view = logic.answerQuestion(view.state, 'eraseAcknowledge', 'yes');
  assertQuestion(view, 'eraseConfirm');
  view = logic.answerQuestion(view.state, 'eraseConfirm', 'yes');
  assertAction(view, 'erase-device-decision');
});

test('every external action has a return path and outcomes change guidance', () => {
  content.EXTERNAL_ACTION_IDS.forEach((actionId) => {
    const action = content.getAction(actionId, 'iphone') || content.getAction(actionId, 'android') || content.getAction(actionId, 'unsure');
    assert.ok(action, actionId);
    assert.equal(action.requiresExternalReturn, true, actionId + ' must require return');
    assert.ok(action.boundedOutcomes.length > 0, actionId + ' needs outcomes');
    assert.match(action.leavingLabel || action.instruction, /new tab|Keep LostPhones|return/i);
  });

  let view = triage('lost', 'iphone', 'trusted');
  view = logic.startExternalAction(view.state, 'apple-locate-device');
  assert.equal(view.state.awaitingExternalReturnActionId, 'apple-locate-device');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'located_unsafe');
  assert.equal(view.state.awaitingExternalReturnActionId, null);
  assertQuestion(view, 'safety');
});

test('schema version 2 state model is present after triage', () => {
  const view = triage('lost', 'iphone', 'trusted');
  assert.equal(view.state.schemaVersion, 2);
  assert.equal(view.state.version, 2);
  assert.ok(view.state.actions['apple-locate-device']);
  assert.equal(view.state.actions['apple-locate-device'].status, 'pending');
  assert.equal(view.state.answers.safety, null);
});

function failedMarkJourney(platform) {
  const locate = platform === 'iphone' ? 'apple-locate-device' : 'google-locate-device';
  const mark = platform === 'iphone' ? 'apple-mark-lost' : 'google-mark-lost';
  let view = triage('lost', platform, 'trusted');
  view = logic.recordOutcome(view.state, locate, 'not_found');
  view = logic.recordOutcome(view.state, mark, 'could_not_mark');
  const record = view.state.actions[mark];
  assert.equal(record.status, 'blocked');
  assert.notEqual(record.status, 'completed');
  assert.equal(record.outcome, 'could_not_mark');
  assert.equal(record.blockedReason, 'could_not_secure_device');
  assert.equal(view.state.answers.deviceSecured, 'no');
  assert.match(content.BLOCKED_REASON_COPY.could_not_secure_device, /not complete/);
  assertAction(view, 'protect-primary-account');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  assertAction(view, 'protect-mobile-line');
  assert.notEqual(view.state.status, 'stabilized');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  assert.equal(view.state.status, 'stabilized_with_blockers');
  assert.notEqual(view.state.status, 'stabilized');
  assert.equal(view.state.actions[mark].status, 'blocked');
  return view;
}

test('failed iPhone mark-lost stays blocked and cannot fully stabilize', () => {
  failedMarkJourney('iphone');
});

test('failed Android secure-device stays blocked and cannot fully stabilize', () => {
  failedMarkJourney('android');
});

test('successful marked outcome still completes and can fully stabilize', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  assert.equal(view.state.actions['apple-mark-lost'].status, 'completed');
  assert.equal(view.state.answers.deviceSecured, 'yes');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  assert.equal(view.state.status, 'stabilized');
});

test('qualifying stabilized stolen journey can review erase, and declining returns', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  assert.equal(view.type, 'complete');
  assert.equal(view.state.status, 'stabilized');
  assert.equal(logic.isEraseAvailable(view.state), true);
  view = logic.reviewErase(view.state);
  assertQuestion(view, 'eraseAcknowledge');
  view = logic.answerQuestion(view.state, 'eraseAcknowledge', 'no');
  assert.equal(view.type, 'complete');
  assert.equal(view.state.status, 'stabilized');
  view = logic.reviewErase(view.state);
  assertQuestion(view, 'eraseAcknowledge');
  view = logic.answerQuestion(view.state, 'eraseAcknowledge', 'yes');
  assertQuestion(view, 'eraseConfirm');
  view = logic.answerQuestion(view.state, 'eraseConfirm', 'no');
  assert.equal(view.type, 'complete');
  assert.equal(view.state.status, 'stabilized');
});

test('offline or low-risk missing journeys cannot expose erase', () => {
  let offline = triage('lost', 'iphone', 'trusted');
  offline = logic.recordOutcome(offline.state, 'apple-locate-device', 'offline');
  assert.equal(logic.isEraseAvailable(offline.state), false);
  let review = logic.reviewErase(offline.state);
  assert.notEqual(review.questionId, 'eraseAcknowledge');

  let lowRisk = triage('lost', 'iphone', 'trusted');
  lowRisk = logic.recordOutcome(lowRisk.state, 'apple-locate-device', 'not_found');
  lowRisk = logic.recordOutcome(lowRisk.state, 'apple-mark-lost', 'marked');
  lowRisk = logic.recordOutcome(lowRisk.state, 'protect-primary-account', 'secured');
  assert.equal(logic.isEraseAvailable(lowRisk.state), false);
  review = logic.reviewErase(lowRisk.state);
  assert.notEqual(review.questionId, 'eraseAcknowledge');
  assert.notEqual(lowRisk.state.status, 'active');
});

test('erase is not a stabilization prerequisite', () => {
  let view = triage('stolen', 'android', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'google-locate-device', 'offline');
  view = logic.recordOutcome(view.state, 'google-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  assert.equal(view.state.status, 'stabilized');
  assert.equal(view.type, 'complete');
  assert.ok(view.state.actions['erase-device-decision'].status === 'pending' || view.state.actions['erase-device-decision'].status === 'not_applicable');
  assert.equal(logic.isEraseAvailable(view.state), true);
});

test('B01 unsafe stays in safety until the person confirms', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'unsafe');
  assertAction(view, 'personal-safety');
  assert.equal(view.action.officialUrl, null);
  assert.equal(view.action.requiresExternalReturn, false);
  assert.equal(view.action.nextServiceName, null);
  assert.match(view.action.caution, /Never confront|Do not confront/i);
  assert.match(view.action.instruction, /Do not travel|do not travel/i);

  view = logic.recordOutcome(view.state, 'personal-safety', 'still_unsafe');
  assertAction(view, 'personal-safety');
  assert.equal(view.state.answers.safety, 'unsafe');
  assert.notEqual(view.actionId, 'apple-locate-device');
  assert.notEqual(view.actionId, 'apple-mark-lost');

  view = logic.recordOutcome(view.state, 'personal-safety', 'safe');
  assert.equal(view.state.answers.safety, 'safe');
  assert.equal(view.state.actions['personal-safety'].status, 'completed');
  assertAction(view, 'apple-locate-device');
});

test('B01 located-unsafe confirmation then next official action', () => {
  let view = triage('lost', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'located_unsafe');
  view = logic.answerQuestion(view.state, 'safety', 'unsafe');
  assertAction(view, 'personal-safety');
  view = logic.recordOutcome(view.state, 'personal-safety', 'still_unsafe');
  assertAction(view, 'personal-safety');
  view = logic.recordOutcome(view.state, 'personal-safety', 'safe');
  assertAction(view, 'apple-mark-lost');
});

test('B02 true official URL handoff versus manual no-URL actions', () => {
  const locate = content.getAction('apple-locate-device', 'iphone');
  const carrier = content.getAction('protect-mobile-line', 'iphone');
  const financial = content.getAction('protect-financial-accounts', 'android');
  assert.equal(content.isOfficialUrl(locate.officialUrl), true);
  assert.equal(content.isManualExternalAction(locate), false);
  assert.equal(content.isOfficialUrl(carrier.officialUrl), false);
  assert.equal(content.isOfficialUrl(financial.officialUrl), false);
  assert.equal(content.isManualExternalAction(carrier), true);
  assert.equal(content.isManualExternalAction(financial), true);
  assert.match(carrier.instruction, /official app or website/i);
  assert.match(financial.returnPrompt, /bank or card issuer/i);
  assert.notEqual(carrier.officialUrl, '#');
  assert.notEqual(financial.officialUrl, '#');

  let view = triage('lost', 'iphone', 'trusted');
  const opened = logic.startExternalAction(view.state, 'apple-locate-device');
  assert.equal(opened.ok, true);
  assert.equal(opened.awaitingReturn, true);
  assert.equal(opened.state.awaitingExternalReturnActionId, 'apple-locate-device');
  view = logic.recordOutcome(opened.state, 'apple-locate-device', 'not_found');
  assert.equal(view.state.awaitingExternalReturnActionId, null);
  assertAction(view, 'apple-mark-lost');

  const manualStart = logic.startExternalAction(view.state, 'protect-mobile-line');
  assert.equal(manualStart.ok, false);
  assert.equal(view.state.awaitingExternalReturnActionId, null);
});

test('B02 manual carrier and financial return outcomes stay internal', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  assertAction(view, 'protect-mobile-line');
  assert.equal(view.action.officialUrl, null);
  const refused = logic.startExternalAction(view.state, 'protect-mobile-line');
  assert.equal(refused.ok, false);
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'cannot_access_carrier');
  assert.equal(view.state.actions['protect-mobile-line'].status, 'blocked');
  assertAction(view, 'protect-financial-accounts');
  assert.equal(view.action.officialUrl, null);
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  assert.equal(view.state.status, 'stabilized_with_blockers');
});

test('B03 unknown platform can still identify iPhone', () => {
  let view = triage('lost', 'unsure', 'trusted');
  assertAction(view, 'identify-platform');
  view = logic.recordOutcome(view.state, 'identify-platform', 'iphone');
  assert.equal(view.state.answers.platform, 'iphone');
  assertAction(view, 'apple-locate-device');
});

test('B03 unknown platform can still identify Android', () => {
  let view = triage('lost', 'unsure', 'trusted');
  assertAction(view, 'identify-platform');
  view = logic.recordOutcome(view.state, 'identify-platform', 'android');
  assert.equal(view.state.answers.platform, 'android');
  assertAction(view, 'google-locate-device');
});

test('B03 unknown platform still-cannot-tell uses provider-neutral fallback', () => {
  let view = triage('lost', 'unsure', 'trusted');
  assertAction(view, 'identify-platform');
  view = logic.recordOutcome(view.state, 'identify-platform', 'still_unsure');
  assert.equal(view.state.answers.platform, 'unsure');
  assert.equal(view.state.actions['identify-platform'].status, 'completed');
  assertAction(view, 'protect-mobile-line');
  assert.match(view.action.reason, /do not require knowing/i);
  assert.equal(view.action.officialUrl, null);
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  assertAction(view, 'protect-primary-account');
  assert.equal(view.action.title, 'Protect the account connected to the missing phone');
  assert.doesNotMatch(view.action.title, /Apple|Google/);
  assert.equal(view.action.officialUrl, null);
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  assertAction(view, 'report-and-document');
  assert.match(view.action.instruction, /IMEI|serial/i);
  view = logic.recordOutcome(view.state, 'report-and-document', 'skipped_for_now');
  assert.equal(view.type, 'complete');
  assert.equal(view.state.status, 'stabilized_with_blockers');
  assert.notEqual(view.state.currentActionId, 'identify-platform');
});

test('B03 public/shared device keeps privacy rules on the neutral fallback', () => {
  let view = triage('lost', 'unsure', 'public');
  view = logic.recordOutcome(view.state, 'identify-platform', 'still_unsure');
  assertAction(view, 'protect-mobile-line');
  assert.equal(view.state.answers.currentDevice, 'public');
  assert.equal(view.state.privacyMode, 'memory-only');
  assert.equal(content.privacyGuidance.public.id, 'public');
  assert.ok(content.privacyGuidance.public.items.some((item) => /will not save a resume token/i.test(item)));
});

test('H01 recovered and low-risk stabilized journeys keep erase ineligible', () => {
  let recovered = triage('lost', 'iphone', 'trusted');
  recovered = logic.recordOutcome(recovered.state, 'apple-locate-device', 'located_safe');
  recovered = logic.answerQuestion(recovered.state, 'recovered', 'yes');
  recovered = logic.answerQuestion(recovered.state, 'unlockRisk', 'probably_not');
  recovered = logic.answerQuestion(recovered.state, 'suspiciousActivity', 'no');
  assert.ok(recovered.state.status === 'recovered' || recovered.state.status === 'stabilized');
  assert.equal(logic.isEraseAvailable(recovered.state), false);
  assert.equal(recovered.eraseAvailable, false);
  const recoveredReview = logic.reviewErase(recovered.state);
  assert.notEqual(recoveredReview.questionId, 'eraseAcknowledge');

  let lowRisk = triage('lost', 'iphone', 'trusted');
  lowRisk = logic.recordOutcome(lowRisk.state, 'apple-locate-device', 'not_found');
  lowRisk = logic.recordOutcome(lowRisk.state, 'apple-mark-lost', 'marked');
  lowRisk = logic.recordOutcome(lowRisk.state, 'protect-primary-account', 'secured');
  assert.equal(logic.isEraseAvailable(lowRisk.state), false);
  assert.ok(lowRisk.state.status === 'stabilized' || lowRisk.state.status === 'stabilized_with_blockers' || lowRisk.type === 'complete');
});

test('H01 risk-eligible erase remains available after reversible steps', () => {
  let view = triage('stolen', 'iphone', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  assert.equal(logic.isEraseAvailable(view.state), true);
  assert.equal(view.eraseAvailable, true);
});

test('H03 find service unavailable defers same-provider tasks and continues independently', () => {
  let view = triage('lost', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'service_unavailable');
  assert.equal(view.state.actions['apple-locate-device'].status, 'blocked');
  assert.equal(view.state.actions['apple-locate-device'].blockedReason, 'service_unavailable');
  assert.equal(view.state.actions['apple-mark-lost'].status, 'blocked');
  assert.equal(view.state.actions['apple-mark-lost'].blockedReason, 'waiting_for_provider');
  assert.notEqual(view.state.actions['apple-locate-device'].status, 'completed');
  assert.notEqual(view.state.actions['apple-mark-lost'].status, 'completed');
  assert.notEqual(view.actionId, 'apple-mark-lost');
  assertAction(view, 'protect-primary-account');

  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  assertAction(view, 'protect-mobile-line');
  assert.equal(view.state.actions['apple-mark-lost'].status, 'blocked');

  const retry = logic.clone(view.state);
  retry.actions['apple-locate-device'] = {
    status: 'pending',
    outcome: null,
    blockedReason: null,
    updatedAt: Date.now()
  };
  const resumed = logic.evaluate(retry);
  assertAction(resumed, 'apple-locate-device');
});

test('H02 recovered possession is authoritative and skips a second provider check', () => {
  const iphone = content.getQuestion('recovered', 'iphone');
  const android = content.getQuestion('recovered', 'android');
  assert.equal(iphone.title, 'Do you have the iPhone with you now?');
  assert.equal(android.title, 'Do you have the Android phone with you now?');
  assert.equal(iphone.help, 'Choose Yes only if the phone is physically with you and safe to keep. Do not retrieve it from an unsafe place.');
  assert.equal(android.help, iphone.help);
  assert.equal(content.getAction('recovered-device-security-check', 'android').officialUrl, null);
  assert.equal(content.getAction('recovered-device-security-check', 'android').requiresExternalReturn, false);
});

test('H02 recovered low-risk path completes emergency recovery', () => {
  let view = triage('nearby', 'iphone', 'trusted');
  view = logic.recordOutcome(view.state, 'apple-play-sound', 'heard_nearby');
  view = logic.answerQuestion(view.state, 'recovered', 'yes');
  assertQuestion(view, 'unlockRisk');
  assert.notEqual(view.actionId, 'recovered-device-security-check');
  view = logic.answerQuestion(view.state, 'unlockRisk', 'probably_not');
  view = logic.answerQuestion(view.state, 'suspiciousActivity', 'no');
  assert.equal(view.type, 'complete');
  assert.equal(view.state.status, 'recovered');
  assert.equal(view.state.stabilizationStatus, 'stabilized');
  assert.equal(logic.hasCriticalBlocker(view.state), false);
});

test('H02 recovered compromised path continues only needed account protection', () => {
  let view = triage('lost', 'android', 'trusted');
  view = logic.recordOutcome(view.state, 'google-locate-device', 'nearby');
  view = logic.answerQuestion(view.state, 'recovered', 'yes');
  assert.equal(view.question.title, 'Could someone else have unlocked or used it?');
  view = logic.answerQuestion(view.state, 'unlockRisk', 'yes');
  view = logic.answerQuestion(view.state, 'suspiciousActivity', 'yes');
  assertAction(view, 'protect-primary-account');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  assertQuestion(view, 'financialExposure');
  assert.notEqual(view.type, 'complete');
});

test('M01 official source labels follow the current action, not only the platform', () => {
  assert.equal(content.officialSourceLabel(content.getAction('apple-play-sound', 'iphone')), 'Apple Find Devices');
  assert.equal(content.officialSourceLabel(content.getAction('apple-locate-device', 'iphone')), 'Apple Find Devices');
  assert.equal(content.officialSourceLabel(content.getAction('apple-mark-lost', 'iphone')), 'Apple Find Devices');
  assert.equal(content.officialSourceLabel(content.getAction('apple-auth-fallback', 'iphone')), 'Apple Account Recovery');
  assert.equal(content.officialSourceLabel(content.getAction('protect-primary-account', 'iphone')), 'Apple Account');
  assert.equal(content.officialSourceLabel(content.getAction('google-play-sound', 'android')), 'Google Find Hub');
  assert.equal(content.officialSourceLabel(content.getAction('google-locate-device', 'android')), 'Google Find Hub');
  assert.equal(content.officialSourceLabel(content.getAction('google-mark-lost', 'android')), 'Google Find Hub');
  assert.equal(content.officialSourceLabel(content.getAction('google-auth-fallback', 'android')), 'Google Account Recovery');
  assert.equal(content.officialSourceLabel(content.getAction('protect-primary-account', 'android')), 'Google Account security');
  assert.notEqual(content.getAction('apple-auth-fallback', 'iphone').officialSourceLabel, 'Apple Find Devices');
  assert.notEqual(content.getAction('protect-primary-account', 'iphone').officialSourceLabel, 'Apple Find Devices');
});

test('M02 known-provider waiting copy names Apple or Google specifically', () => {
  const appleWait = content.getAction('apple-auth-fallback', 'iphone').boundedOutcomes.find((item) => item.id === 'waiting_for_provider');
  const googleWait = content.getAction('google-auth-fallback', 'android').boundedOutcomes.find((item) => item.id === 'waiting_for_provider');
  assert.equal(appleWait.label, 'I am waiting on Apple');
  assert.equal(googleWait.label, 'I am waiting on Google');
  assert.equal(appleWait.label.includes('Apple or Google'), false);
  assert.equal(googleWait.label.includes('Apple or Google'), false);
});

test('M03 unknown-platform progress stays provider-neutral', () => {
  const unsureAccount = content.getAction('protect-primary-account', 'unsure');
  assert.equal(unsureAccount.title, 'Protect the account connected to the missing phone');
  assert.equal(unsureAccount.officialProvider, null);
  assert.match(unsureAccount.instruction, /LostPhones will not guess Apple or Google/);
  assert.equal(/Secure your Apple account/.test(unsureAccount.title + unsureAccount.instruction), false);
});

test('L02 full recovery plan uses plain outcomes instead of internal workflow labels', () => {
  assert.equal(content.planStatusText({
    actionId: 'apple-mark-lost',
    status: 'blocked',
    outcome: 'could_not_mark',
    blockedReason: 'could_not_secure_device'
  }), 'Could not turn on Lost Mode');
  assert.equal(content.planStatusText({
    actionId: 'protect-mobile-line',
    status: 'blocked',
    outcome: 'waiting_for_provider',
    blockedReason: 'waiting_for_provider'
  }), 'Waiting for the carrier');
  assert.equal(content.planStatusText({
    actionId: 'apple-auth-fallback',
    status: 'blocked',
    outcome: 'waiting_for_provider',
    blockedReason: 'waiting_for_provider'
  }), 'Waiting on Apple');
  assert.equal(content.planStatusText({
    actionId: 'google-auth-fallback',
    status: 'blocked',
    outcome: 'waiting_for_provider',
    blockedReason: 'waiting_for_provider'
  }), 'Waiting on Google');
  assert.equal(content.planStatusText({
    actionId: 'report-and-document',
    status: 'pending'
  }), 'Not started yet');
  assert.equal(content.planStatusText({
    actionId: 'apple-locate-device',
    status: 'blocked',
    outcome: 'service_unavailable',
    blockedReason: 'service_unavailable'
  }), 'Retry later');
});

