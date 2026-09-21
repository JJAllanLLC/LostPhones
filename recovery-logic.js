(function (global, factory) {
  const api = factory(
    global && global.LostPhonesRecoveryContent,
    global && global.LostPhonesRecoverySchema
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesRecoveryLogic = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (browserContent, browserSchema) {
  const content = browserContent || (typeof require === 'function' ? require('./recovery-content.js') : null);
  const schema = browserSchema || (typeof require === 'function' ? require('./recovery-state-schema.js') : null);

  const STEPS = Object.freeze([
    'orientation',
    'triage-situation',
    'triage-platform',
    'triage-device',
    'safety-check',
    'first-action',
    'action',
    'awaiting-return',
    'plan',
    'auth-fallback',
    'complete'
  ]);

  const FORBIDDEN_STATE_FIELDS = Object.freeze([
    'email',
    'phone',
    'imei',
    'serial',
    'location',
    'password',
    'code',
    'reportNumber',
    'incidentDescription'
  ]);

  function now() {
    return Date.now();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createInitialState() {
    const state = schema.createState();
    state.step = 'orientation';
    state.privacyMode = 'memory-only';
    return state;
  }

  function isSignInBlock(reason) {
    return reason === 'cannot_sign_in' || reason === 'cannot-sign-in' || reason === 'cannot_receive_verification';
  }

  function normalizeBlockedReason(reason) {
    if (reason === 'cannot-sign-in') return 'cannot_sign_in';
    return reason || null;
  }

  function actionRecord(state, actionId) {
    if (!state.actions[actionId]) {
      state.actions[actionId] = {
        status: 'pending',
        outcome: null,
        blockedReason: null,
        updatedAt: null
      };
    }
    return state.actions[actionId];
  }

  function statusOf(state, actionId) {
    return actionRecord(state, actionId).status;
  }

  function isFinished(state, actionId) {
    const status = statusOf(state, actionId);
    return status === 'completed' || status === 'skipped' || status === 'not_applicable';
  }

  function isBlocked(state, actionId) {
    return statusOf(state, actionId) === 'blocked';
  }

  function isOpen(state, actionId) {
    return !isFinished(state, actionId) && !isBlocked(state, actionId);
  }

  function playSoundId(platform) {
    if (platform === 'iphone') return 'apple-play-sound';
    if (platform === 'android') return 'google-play-sound';
    return null;
  }

  function locateId(platform) {
    if (platform === 'iphone') return 'apple-locate-device';
    if (platform === 'android') return 'google-locate-device';
    return null;
  }

  function markLostId(platform) {
    if (platform === 'iphone') return 'apple-mark-lost';
    if (platform === 'android') return 'google-mark-lost';
    return null;
  }

  function authFallbackId(platform) {
    if (platform === 'iphone') return 'apple-auth-fallback';
    if (platform === 'android') return 'google-auth-fallback';
    return null;
  }

  function findProviderActionIds(platform) {
    if (platform === 'iphone') return ['apple-play-sound', 'apple-locate-device', 'apple-mark-lost'];
    if (platform === 'android') return ['google-play-sound', 'google-locate-device', 'google-mark-lost'];
    return [];
  }

  function isUnknownPlatformFallback(state) {
    return state.answers.platform === 'unsure'
      && actionRecord(state, 'identify-platform').outcome === 'still_unsure';
  }

  function isFindServiceUnavailable(state) {
    return findProviderActionIds(state.answers.platform).some((id) => {
      const rec = actionRecord(state, id);
      return rec.blockedReason === 'service_unavailable' || rec.outcome === 'service_unavailable';
    });
  }

  function deferFindProviderActions(state) {
    if (!isFindServiceUnavailable(state)) return;
    findProviderActionIds(state.answers.platform).forEach((id) => {
      if (isOpen(state, id)) {
        markAction(state, id, {
          status: 'blocked',
          outcome: 'waiting_for_provider',
          blockedReason: 'waiting_for_provider'
        });
      }
    });
  }

  function applyUnknownPlatformFallback(state) {
    [
      'apple-play-sound',
      'google-play-sound',
      'apple-locate-device',
      'google-locate-device',
      'apple-mark-lost',
      'google-mark-lost',
      'apple-auth-fallback',
      'google-auth-fallback',
      'erase-device-decision'
    ].forEach((id) => {
      if (isOpen(state, id) && statusOf(state, id) === 'pending') {
        setNotApplicable(state, id);
      }
    });
  }

  function releaseFindRetry(state, completedFindId) {
    findProviderActionIds(state.answers.platform).forEach((id) => {
      if (id === completedFindId) return;
      const rec = actionRecord(state, id);
      if (rec.status === 'blocked' && rec.blockedReason === 'waiting_for_provider') {
        markAction(state, id, { status: 'pending', outcome: null, blockedReason: null });
      }
    });
  }

  function markAction(state, actionId, fields) {
    const record = actionRecord(state, actionId);
    Object.keys(fields).forEach((key) => {
      record[key] = fields[key];
    });
    record.updatedAt = now();
    state.updatedAt = record.updatedAt;
    return record;
  }

  function setNotApplicable(state, actionId) {
    if (statusOf(state, actionId) === 'pending' || statusOf(state, actionId) === 'active') {
      markAction(state, actionId, { status: 'not_applicable', outcome: null, blockedReason: null });
    }
  }

  function syncPlatformActions(state) {
    const platform = state.answers.platform;
    const apple = [
      'apple-play-sound',
      'apple-locate-device',
      'apple-mark-lost',
      'apple-auth-fallback'
    ];
    const google = [
      'google-play-sound',
      'google-locate-device',
      'google-mark-lost',
      'google-auth-fallback'
    ];
    if (platform === 'iphone') google.forEach((id) => setNotApplicable(state, id));
    if (platform === 'android') apple.forEach((id) => setNotApplicable(state, id));
    if (platform !== 'unsure') setNotApplicable(state, 'identify-platform');
    if (state.answers.situation === 'nearby' && state.answers.recovered !== 'no') {
      // keep play sound applicable
    } else if (state.answers.situation !== 'nearby') {
      const sound = playSoundId(platform);
      if (sound && isOpen(state, sound) && statusOf(state, sound) === 'pending') {
        setNotApplicable(state, sound);
      }
    }
  }

  function userIsSafe(state) {
    const answers = state.answers;
    if (answers.safety === 'safe') return true;
    if (answers.safety === 'unsafe' || answers.safety === 'unsure') return false;
    if (answers.situation === 'stolen' || answers.deviceLocation === 'located_unsafe') return false;
    return true;
  }

  function needsSafetyGate(state) {
    const answers = state.answers;
    return answers.situation === 'stolen'
      || answers.deviceLocation === 'located_unsafe'
      || answers.safety === 'unsafe'
      || answers.safety === 'unsure';
  }

  function stillMissing(state) {
    return state.answers.recovered !== 'yes';
  }

  function hasCompromiseSignal(state) {
    const answers = state.answers;
    return answers.suspiciousActivity === 'yes'
      || answers.unlockRisk === 'yes'
      || answers.unlockRisk === 'possible'
      || answers.financialExposure === 'yes';
  }

  function needsPrimaryAccount(state) {
    const answers = state.answers;
    if (answers.platform === 'unsure') return isUnknownPlatformFallback(state);
    if (answers.recovered === 'yes' && !hasCompromiseSignal(state) && answers.situation !== 'stolen' && answers.suspiciousActivity !== 'unsure' && answers.unlockRisk !== 'unsure') {
      return false;
    }
    return answers.situation === 'stolen'
      || answers.situation === 'unsure'
      || answers.situation === 'lost'
      || hasCompromiseSignal(state)
      || answers.suspiciousActivity === 'unsure'
      || answers.unlockRisk === 'unsure';
  }

  function needsMobileLine(state) {
    const answers = state.answers;
    if (answers.platform === 'unsure') return isUnknownPlatformFallback(state);
    if (answers.recovered === 'yes' && answers.situation !== 'stolen' && !hasCompromiseSignal(state) && answers.verificationAccess !== 'no') {
      return false;
    }
    const mark = markLostId(answers.platform);
    return answers.situation === 'stolen'
      || answers.situation === 'unsure'
      || answers.verificationAccess === 'no'
      || isSignInBlock(state.blockedReason)
      || statusOf(state, 'apple-auth-fallback') === 'blocked'
      || statusOf(state, 'google-auth-fallback') === 'blocked'
      || statusOf(state, playSoundId(answers.platform) || 'apple-play-sound') === 'blocked'
      || statusOf(state, locateId(answers.platform) || 'apple-locate-device') === 'blocked'
      || (mark && isBlocked(state, mark));
  }

  function needsFinancial(state) {
    const answers = state.answers;
    if (answers.platform === 'unsure' && !isUnknownPlatformFallback(state)) return false;
    if (answers.financialExposure === 'no' && answers.suspiciousActivity !== 'yes') return false;
    if (answers.recovered === 'yes' && answers.situation !== 'stolen' && answers.financialExposure !== 'yes' && answers.suspiciousActivity !== 'yes' && answers.suspiciousActivity !== 'unsure') {
      return false;
    }
    return answers.situation === 'stolen'
      || answers.financialExposure === 'yes'
      || answers.financialExposure === 'unsure'
      || answers.suspiciousActivity === 'yes'
      || answers.suspiciousActivity === 'unsure';
  }

  function reversibleExhausted(state) {
    const platform = state.answers.platform;
    const locate = locateId(platform);
    const mark = markLostId(platform);
    if (!locate || !mark) return isUnknownPlatformFallback(state);
    const locateOk = isFinished(state, locate) || isBlocked(state, locate);
    const markOk = isFinished(state, mark) || isBlocked(state, mark);
    return locateOk && markOk;
  }

  function recoveryUnlikely(state) {
    const location = state.answers.deviceLocation;
    return location === 'offline' || location === 'not_found' || location === 'unknown' || location === 'located_unsafe';
  }

  function materialRisk(state) {
    const answers = state.answers;
    return answers.situation === 'stolen'
      || answers.suspiciousActivity === 'yes'
      || answers.unlockRisk === 'yes'
      || answers.financialExposure === 'yes';
  }

  function isEraseAvailable(state) {
    if (!stillMissing(state)) return false;
    if (state.answers.platform !== 'iphone' && state.answers.platform !== 'android') return false;
    if (!reversibleExhausted(state)) return false;
    if (!recoveryUnlikely(state)) return false;
    if (!materialRisk(state)) return false;
    return true;
  }

  function shouldAskRecovered(state) {
    if (state.answers.recovered != null) return false;
    if (!stillMissing(state)) return false;
    const location = state.answers.deviceLocation;
    const sound = playSoundId(state.answers.platform);
    const heard = sound && actionRecord(state, sound).outcome === 'heard_nearby';
    return heard || location === 'nearby' || location === 'located_safe';
  }

  function foundPathRisk(state) {
    const answers = state.answers;
    return answers.situation === 'stolen'
      || answers.unlockRisk === 'yes'
      || answers.unlockRisk === 'possible'
      || answers.unlockRisk === 'unsure'
      || answers.suspiciousActivity === 'yes'
      || answers.suspiciousActivity === 'unsure'
      || answers.financialExposure === 'yes'
      || answers.financialExposure === 'unsure';
  }

  function questionView(state, questionId) {
    const next = clone(state);
    next.currentQuestionId = questionId;
    next.currentActionId = null;
    next.step = questionId === 'safety' ? 'safety-check' : (questionId.indexOf('triage') === 0 || ['situation', 'platform', 'currentDevice'].indexOf(questionId) !== -1 ? 'triage-' + (questionId === 'currentDevice' ? 'device' : questionId) : 'plan');
    if (questionId === 'situation') next.step = 'triage-situation';
    if (questionId === 'platform') next.step = 'triage-platform';
    if (questionId === 'currentDevice') next.step = 'triage-device';
    next.updatedAt = now();
    return {
      ok: true,
      type: 'question',
      questionId: questionId,
      question: content.getQuestion(questionId, next.answers.platform),
      state: next,
      action: null
    };
  }

  function actionView(state, actionId) {
    const next = clone(state);
    const platform = next.answers.platform || 'unsure';
    const action = content.getAction(actionId, platform) || content.getAction(actionId, 'unsure');
    next.currentActionId = actionId;
    next.currentQuestionId = null;
    next.step = actionId.indexOf('auth-fallback') !== -1 ? 'auth-fallback' : (next.awaitingExternalReturnActionId ? 'awaiting-return' : 'first-action');
    if (next.status === 'stabilized' || next.status === 'stabilized_with_blockers' || next.status === 'recovered') {
      next.step = 'complete';
    }
    next.updatedAt = now();
    return {
      ok: true,
      type: 'action',
      actionId: actionId,
      action: action,
      awaitingReturn: next.awaitingExternalReturnActionId === actionId,
      eraseAvailable: isEraseAvailable(next),
      state: next
    };
  }

  function completeView(state) {
    const next = clone(state);
    next.step = 'complete';
    next.currentQuestionId = null;
    next.currentActionId = next.currentActionId;
    next.updatedAt = now();
    return {
      ok: true,
      type: 'complete',
      actionId: null,
      action: null,
      state: next,
      eraseAvailable: isEraseAvailable(next)
    };
  }

  function markPossessionConfirmed(state) {
    if (!state || state.answers.recovered !== 'yes') return;
    state.answers.safety = 'safe';
    markAction(state, 'recovered-device-security-check', {
      status: 'completed',
      outcome: 'in_hand_safe',
      blockedReason: null
    });
  }

  function isCriticalAccountBlock(reason) {
    return reason === 'cannot_sign_in' || reason === 'cannot_receive_verification';
  }

  function listCriticalBlockers(state) {
    const snapshot = state || createInitialState();
    const platform = snapshot.answers.platform || 'unsure';
    const items = [];
    const mark = markLostId(platform);
    if (mark && isBlocked(snapshot, mark) && actionRecord(snapshot, mark).blockedReason === 'could_not_secure_device') {
      const action = content.getAction(mark, platform) || content.getAction(mark, 'unsure');
      items.push({
        actionId: mark,
        title: action ? action.title : mark,
        copy: content.BLOCKED_REASON_COPY.could_not_secure_device
      });
    }
    if (needsPrimaryAccount(snapshot) && isBlocked(snapshot, 'protect-primary-account') && isCriticalAccountBlock(actionRecord(snapshot, 'protect-primary-account').blockedReason)) {
      const action = content.getAction('protect-primary-account', platform) || content.getAction('protect-primary-account', 'unsure');
      const reason = actionRecord(snapshot, 'protect-primary-account').blockedReason;
      items.push({
        actionId: 'protect-primary-account',
        title: action ? action.title : 'protect-primary-account',
        copy: content.BLOCKED_REASON_COPY[reason] || content.BLOCKED_REASON_COPY.cannot_sign_in
      });
    }
    const auth = authFallbackId(platform);
    if (auth && isBlocked(snapshot, auth) && isCriticalAccountBlock(actionRecord(snapshot, auth).blockedReason)) {
      const action = content.getAction(auth, platform) || content.getAction(auth, 'unsure');
      const reason = actionRecord(snapshot, auth).blockedReason;
      items.push({
        actionId: auth,
        title: action ? action.title : auth,
        copy: content.BLOCKED_REASON_COPY[reason] || content.BLOCKED_REASON_COPY.cannot_sign_in
      });
    }
    return items;
  }

  function hasCriticalBlocker(state) {
    return listCriticalBlockers(state).length > 0;
  }

  function acknowledgeCriticalBlocker(state) {
    const next = clone(state || createInitialState());
    next.criticalBlockerAcknowledged = true;
    next.updatedAt = now();
    return evaluate(next);
  }

  function applicableProtectionComplete(state, actionId, needed) {
    if (!needed) {
      if (isOpen(state, actionId) || isBlocked(state, actionId)) {
        setNotApplicable(state, actionId);
      }
      return true;
    }
    if (isFinished(state, actionId)) return true;
    if (isBlocked(state, actionId)) return false;
    return false;
  }

  function assessStabilization(state) {
    const next = clone(state);
    const answers = next.answers;
    const safe = userIsSafe(next);
    const deviceHandled = answers.recovered === 'yes'
      || answers.deviceSecured === 'yes'
      || (reversibleExhausted(next) && stillMissing(next))
      || isUnknownPlatformFallback(next);
    const primaryNeeded = needsPrimaryAccount(next);
    const lineNeeded = needsMobileLine(next);
    const financialNeeded = needsFinancial(next);
    const primaryDone = applicableProtectionComplete(next, 'protect-primary-account', primaryNeeded);
    const lineDone = applicableProtectionComplete(next, 'protect-mobile-line', lineNeeded);
    const financialDone = applicableProtectionComplete(next, 'protect-financial-accounts', financialNeeded);
    const primaryBlocked = primaryNeeded && isBlocked(next, 'protect-primary-account');
    const lineBlocked = lineNeeded && isBlocked(next, 'protect-mobile-line');
    const financialBlocked = financialNeeded && isBlocked(next, 'protect-financial-accounts');
    const locateBlocked = isBlocked(next, locateId(answers.platform) || '');
    const markBlocked = isBlocked(next, markLostId(answers.platform) || '');
    const authBlocked = isBlocked(next, authFallbackId(answers.platform) || '');
    const unresolvedCompromise = answers.suspiciousActivity === 'yes' && !primaryDone && !primaryBlocked;

    if (!safe || !deviceHandled || unresolvedCompromise) {
      next.status = 'active';
      next.stabilizationStatus = 'in_progress';
      return { status: 'active', withBlockers: false, state: next };
    }

    if (!primaryDone && !primaryBlocked) {
      next.status = 'active';
      next.stabilizationStatus = 'in_progress';
      return { status: 'active', withBlockers: false, state: next };
    }
    if (!lineDone && !lineBlocked) {
      next.status = 'active';
      next.stabilizationStatus = 'in_progress';
      return { status: 'active', withBlockers: false, state: next };
    }
    if (!financialDone && !financialBlocked) {
      next.status = 'active';
      next.stabilizationStatus = 'in_progress';
      return { status: 'active', withBlockers: false, state: next };
    }

    const blockers = primaryBlocked || lineBlocked || financialBlocked || locateBlocked || markBlocked || authBlocked
      || isBlocked(next, 'personal-safety')
      || isUnknownPlatformFallback(next);

    if (answers.recovered === 'yes' && !foundPathRisk(next) && !blockers) {
      next.status = 'recovered';
      next.stabilizationStatus = 'stabilized';
      return { status: 'recovered', withBlockers: false, state: next };
    }

    if (blockers) {
      next.status = 'stabilized_with_blockers';
      next.stabilizationStatus = 'stabilized_with_blockers';
      return { status: 'stabilized_with_blockers', withBlockers: true, state: next };
    }

    next.status = 'stabilized';
    next.stabilizationStatus = 'stabilized';
    return { status: 'stabilized', withBlockers: false, state: next };
  }

  function evaluateFound(state) {
    const next = clone(state);
    ['apple-play-sound', 'google-play-sound', 'apple-locate-device', 'google-locate-device', 'apple-mark-lost', 'google-mark-lost', 'erase-device-decision'].forEach((id) => {
      if (isOpen(next, id) && statusOf(next, id) === 'pending') setNotApplicable(next, id);
    });

    markPossessionConfirmed(next);

    if (next.answers.unlockRisk == null) return questionView(next, 'unlockRisk');
    if (next.answers.suspiciousActivity == null) return questionView(next, 'suspiciousActivity');

    if (foundPathRisk(next)) {
      if (next.answers.financialExposure == null && next.answers.situation === 'stolen') {
        next.answers.financialExposure = 'unsure';
      }
      if (needsPrimaryAccount(next) && isOpen(next, 'protect-primary-account')) {
        return actionView(next, 'protect-primary-account');
      }
      if (needsMobileLine(next) && isOpen(next, 'protect-mobile-line')) {
        return actionView(next, 'protect-mobile-line');
      }
      if (next.answers.financialExposure == null && (next.answers.suspiciousActivity === 'yes' || next.answers.unlockRisk === 'yes')) {
        return questionView(next, 'financialExposure');
      }
      if (needsFinancial(next) && isOpen(next, 'protect-financial-accounts')) {
        return actionView(next, 'protect-financial-accounts');
      }
    } else {
      setNotApplicable(next, 'protect-primary-account');
      setNotApplicable(next, 'protect-mobile-line');
      setNotApplicable(next, 'protect-financial-accounts');
    }

    const assessed = assessStabilization(next);
    return completeView(assessed.state);
  }

  function evaluate(state) {
    if (!state || typeof state !== 'object') {
      return { ok: false, error: 'invalid-state', message: 'Recovery state is missing.' };
    }

    const next = clone(state);
    const answers = next.answers;

    if (!answers.situation) return questionView(next, 'situation');
    if (!answers.platform) return questionView(next, 'platform');
    if (!answers.currentDevice) return questionView(next, 'currentDevice');

    syncPlatformActions(next);
    deferFindProviderActions(next);

    if (next.awaitingExternalReturnActionId) {
      const waitingId = next.awaitingExternalReturnActionId;
      const waitingAction = content.getAction(waitingId, answers.platform) || content.getAction(waitingId, 'unsure');
      if (!waitingAction || !content.isOfficialUrl(waitingAction.officialUrl)) {
        next.awaitingExternalReturnActionId = null;
      } else {
        const view = actionView(next, waitingId);
        view.awaitingReturn = true;
        view.state.step = 'awaiting-return';
        return view;
      }
    }

    if (needsSafetyGate(next)) {
      if (answers.safety == null) return questionView(next, 'safety');
      if (answers.safety !== 'safe') {
        return actionView(next, 'personal-safety');
      }
      if (isOpen(next, 'personal-safety') && statusOf(next, 'personal-safety') === 'pending') {
        markAction(next, 'personal-safety', { status: 'completed', outcome: 'safe', blockedReason: null });
      }
    } else if (statusOf(next, 'personal-safety') === 'pending') {
      setNotApplicable(next, 'personal-safety');
    }

    if (answers.platform === 'unsure' && isOpen(next, 'identify-platform')) {
      return actionView(next, 'identify-platform');
    }

    if (answers.recovered === 'yes') {
      return evaluateFound(next);
    }

    if (shouldAskRecovered(next)) {
      return questionView(next, 'recovered');
    }

    const sound = playSoundId(answers.platform);
    const locate = locateId(answers.platform);
    const mark = markLostId(answers.platform);
    const auth = authFallbackId(answers.platform);
    const findUnavailable = isFindServiceUnavailable(next);

    const signInBlocked = answers.accountAccess === 'no'
      || answers.verificationAccess === 'no'
      || isSignInBlock(next.blockedReason)
      || (sound && isSignInBlock(actionRecord(next, sound).blockedReason))
      || (locate && isSignInBlock(actionRecord(next, locate).blockedReason))
      || (mark && isSignInBlock(actionRecord(next, mark).blockedReason));

    if (signInBlocked && auth && isOpen(next, auth)) {
      return actionView(next, auth);
    }

    if (answers.situation === 'nearby' && sound && isOpen(next, sound) && stillMissing(next) && !findUnavailable) {
      return actionView(next, sound);
    }

    if (locate && isOpen(next, locate) && stillMissing(next) && !findUnavailable) {
      return actionView(next, locate);
    }

    if (mark && isOpen(next, mark) && stillMissing(next) && !findUnavailable && (locate ? !isOpen(next, locate) : true)) {
      const locateBlockedForAuth = locate && isBlocked(next, locate) && isSignInBlock(actionRecord(next, locate).blockedReason);
      const soundBlockedForAuth = sound && isBlocked(next, sound) && isSignInBlock(actionRecord(next, sound).blockedReason);
      if (!locateBlockedForAuth && !soundBlockedForAuth) {
        return actionView(next, mark);
      }
    }

    if (isUnknownPlatformFallback(next)) {
      if (needsMobileLine(next) && isOpen(next, 'protect-mobile-line')) {
        return actionView(next, 'protect-mobile-line');
      }
      if (needsPrimaryAccount(next) && isOpen(next, 'protect-primary-account')) {
        if (signInBlocked) {
          markAction(next, 'protect-primary-account', {
            status: 'blocked',
            outcome: 'cannot_sign_in',
            blockedReason: 'cannot_sign_in'
          });
        } else {
          return actionView(next, 'protect-primary-account');
        }
      }
      if (needsFinancial(next) && answers.financialExposure == null && answers.situation !== 'stolen') {
        return questionView(next, 'financialExposure');
      }
      if (needsFinancial(next) && isOpen(next, 'protect-financial-accounts')) {
        return actionView(next, 'protect-financial-accounts');
      }
      if (stillMissing(next) && isOpen(next, 'report-and-document')) {
        return actionView(next, 'report-and-document');
      }
      const unknownAssessed = assessStabilization(next);
      if (!isEraseAvailable(unknownAssessed.state) && isOpen(unknownAssessed.state, 'erase-device-decision') && statusOf(unknownAssessed.state, 'erase-device-decision') === 'pending') {
        setNotApplicable(unknownAssessed.state, 'erase-device-decision');
      }
      return completeView(unknownAssessed.state);
    }

    if (needsPrimaryAccount(next) && isOpen(next, 'protect-primary-account')) {
      if (signInBlocked) {
        markAction(next, 'protect-primary-account', {
          status: 'blocked',
          outcome: 'cannot_sign_in',
          blockedReason: 'cannot_sign_in'
        });
      } else {
        return actionView(next, 'protect-primary-account');
      }
    }

    if (needsMobileLine(next) && isOpen(next, 'protect-mobile-line')) {
      return actionView(next, 'protect-mobile-line');
    }

    if (needsFinancial(next) && answers.financialExposure == null && answers.situation !== 'stolen') {
      return questionView(next, 'financialExposure');
    }

    if (needsFinancial(next) && isOpen(next, 'protect-financial-accounts')) {
      return actionView(next, 'protect-financial-accounts');
    }

    const assessed = assessStabilization(next);
    if (!isEraseAvailable(assessed.state) && isOpen(assessed.state, 'erase-device-decision') && statusOf(assessed.state, 'erase-device-decision') === 'pending') {
      setNotApplicable(assessed.state, 'erase-device-decision');
    }

    if (assessed.status !== 'active') {
      return completeView(assessed.state);
    }

    if (stillMissing(assessed.state) && isOpen(assessed.state, 'report-and-document') && !needsPrimaryAccount(assessed.state) && !needsMobileLine(assessed.state) && !needsFinancial(assessed.state)) {
      return actionView(assessed.state, 'report-and-document');
    }

    return completeView(assessed.state);
  }

  function reviewErase(state) {
    if (!state || typeof state !== 'object') {
      return { ok: false, error: 'invalid-state', message: 'Recovery state is missing.' };
    }
    const next = clone(state);
    if (!isEraseAvailable(next)) {
      return evaluate(next);
    }
    return questionView(next, 'eraseAcknowledge');
  }

  function validateState(state) {
    if (!state || typeof state !== 'object') {
      return { ok: false, error: 'invalid-state', message: 'Recovery state is missing.', actionId: null };
    }
    if (state.version !== 2 && state.schemaVersion !== 2) {
      return { ok: false, error: 'invalid-state', message: 'Recovery state version is not supported.' };
    }
    if (!state.answers || typeof state.answers !== 'object') {
      return { ok: false, error: 'incomplete-state', message: 'Recovery answers are missing.', actionId: null };
    }
    const required = ['situation', 'platform', 'currentDevice'];
    for (let i = 0; i < required.length; i += 1) {
      const key = required[i];
      const value = state.answers[key];
      if (value == null || value === '') {
        return { ok: false, error: 'incomplete-state', message: 'A required recovery answer is missing.', actionId: null };
      }
      if (!schema.isAllowed(schema.ENUMS[key], value)) {
        return { ok: false, error: 'invalid-state', message: 'A required recovery answer is missing or invalid.', actionId: null };
      }
    }
    if (state.privacyMode !== 'memory-only' && state.privacyMode !== 'session' && state.privacyMode !== 'local-token') {
      return { ok: false, error: 'invalid-state', message: 'Privacy mode must stay on an approved in-session setting.', actionId: null };
    }
    if (state.step && STEPS.indexOf(state.step) === -1) {
      return { ok: false, error: 'invalid-state', message: 'Recovery step is not recognized.', actionId: null };
    }
    for (let i = 0; i < FORBIDDEN_STATE_FIELDS.length; i += 1) {
      const field = FORBIDDEN_STATE_FIELDS[i];
      if (Object.prototype.hasOwnProperty.call(state, field) || Object.prototype.hasOwnProperty.call(state.answers, field)) {
        return { ok: false, error: 'invalid-state', message: 'Recovery state contains a forbidden field.', actionId: null };
      }
    }
    return { ok: true, error: null, message: null };
  }

  function decorateActionResult(next, actionId, action) {
    const privacyModifier = next.answers.currentDevice;
    return {
      ok: true,
      action: action,
      content: action,
      actionId: actionId,
      state: next,
      privacyModifier: privacyModifier,
      privacyGuidance: content.privacyGuidance[privacyModifier] || null
    };
  }

  function selectFirstAction(state) {
    const validated = validateState(state);
    if (!validated.ok) return validated;

    const next = clone(state);
    const answers = next.answers;
    const blocked = normalizeBlockedReason(next.blockedReason);

    if (blocked === 'cannot_sign_in' || blocked === 'cannot_receive_verification') {
      const fallbackId = authFallbackId(answers.platform);
      if (!fallbackId) {
        return { ok: false, error: 'unsupported-fallback', message: 'Account recovery is unavailable until the phone type is known.', actionId: null };
      }
      const action = content.getAction(fallbackId, answers.platform);
      next.step = 'auth-fallback';
      next.currentActionId = fallbackId;
      return decorateActionResult(next, fallbackId, action);
    }

    let actionId = null;
    if (answers.situation === 'stolen') {
      actionId = 'personal-safety';
    } else if (answers.platform === 'unsure') {
      actionId = 'identify-platform';
    } else if (answers.situation === 'nearby') {
      actionId = playSoundId(answers.platform);
    } else {
      actionId = locateId(answers.platform);
    }

    const action = content.getAction(actionId, answers.platform);
    if (!action) {
      return { ok: false, error: 'missing-action', message: 'No approved action is available for this combination.', actionId: null };
    }

    next.step = 'first-action';
    next.currentActionId = actionId;
    return decorateActionResult(next, actionId, action);
  }

  function allCombinations() {
    const situations = ['nearby', 'lost', 'stolen', 'unsure'];
    const platforms = ['iphone', 'android', 'unsure'];
    const devices = ['trusted', 'borrowed', 'public'];
    const results = [];
    for (let i = 0; i < situations.length; i += 1) {
      for (let j = 0; j < platforms.length; j += 1) {
        for (let k = 0; k < devices.length; k += 1) {
          const state = createInitialState();
          state.answers.situation = situations[i];
          state.answers.platform = platforms[j];
          state.answers.currentDevice = devices[k];
          results.push({
            situation: situations[i],
            platform: platforms[j],
            currentDevice: devices[k],
            result: selectFirstAction(state)
          });
        }
      }
    }
    return results;
  }

  function answerQuestion(state, questionId, choiceId) {
    const next = clone(state || createInitialState());
    const question = content.getQuestion(questionId);
    if (!question) {
      return { ok: false, error: 'invalid-state', message: 'Question is not recognized.' };
    }
    const allowed = question.choices.some((choice) => choice.id === choiceId);
    if (!allowed) {
      return { ok: false, error: 'invalid-state', message: 'Answer is not in the allowed set.' };
    }

    if (questionId === 'eraseAcknowledge') {
      next.eraseAcknowledged = choiceId === 'yes';
      next.currentQuestionId = null;
      next.updatedAt = now();
      if (choiceId !== 'yes') {
        markAction(next, 'erase-device-decision', { status: 'skipped', outcome: 'not_now', blockedReason: null });
        return evaluate(next);
      }
      return questionView(next, 'eraseConfirm');
    }

    if (questionId === 'eraseConfirm') {
      next.currentQuestionId = null;
      next.updatedAt = now();
      if (choiceId !== 'yes') {
        markAction(next, 'erase-device-decision', { status: 'skipped', outcome: 'not_now', blockedReason: null });
        return evaluate(next);
      }
      return actionView(next, 'erase-device-decision');
    }

    if (Object.prototype.hasOwnProperty.call(next.answers, questionId) || schema.ANSWER_KEYS.indexOf(questionId) !== -1) {
      next.answers[questionId] = choiceId;
    }

    if (questionId === 'safety' && choiceId === 'safe') {
      markAction(next, 'personal-safety', { status: 'completed', outcome: 'safe', blockedReason: null });
    }

    if (questionId === 'recovered' && choiceId === 'yes') {
      ['apple-play-sound', 'google-play-sound', 'apple-locate-device', 'google-locate-device', 'erase-device-decision'].forEach((id) => {
        if (statusOf(next, id) === 'pending') setNotApplicable(next, id);
      });
      markPossessionConfirmed(next);
    }

    if (questionId === 'currentDevice') {
      next.privacyMode = 'memory-only';
    }

    next.currentQuestionId = null;
    next.updatedAt = now();
    return evaluate(next);
  }

  function mapOutcome(state, actionId, outcomeId) {
    const answers = state.answers;
    const blockedOutcomes = {
      cannot_sign_in: 'cannot_sign_in',
      cannot_receive_verification: 'cannot_receive_verification',
      service_unavailable: 'service_unavailable',
      cannot_access_carrier: 'cannot_access_carrier',
      waiting_for_provider: 'waiting_for_provider',
      needs_owner: 'needs_owner',
      still_blocked: 'cannot_sign_in',
      unsafe_to_retrieve: 'unsafe_to_retrieve'
    };

    if (blockedOutcomes[outcomeId]) {
      const reason = blockedOutcomes[outcomeId];
      markAction(state, actionId, { status: 'blocked', outcome: outcomeId, blockedReason: reason });
      state.blockedReason = reason;
      if (outcomeId === 'cannot_sign_in' || outcomeId === 'still_blocked') answers.accountAccess = 'no';
      if (outcomeId === 'cannot_receive_verification') answers.verificationAccess = 'no';
      if (outcomeId === 'cannot_access_carrier') answers.carrierAccess = 'no';
      if (outcomeId === 'unsafe_to_retrieve') {
        answers.recovered = 'no';
        answers.safety = answers.safety === 'safe' ? 'unsure' : answers.safety;
      }
      if (outcomeId === 'service_unavailable') {
        deferFindProviderActions(state);
      }
      return;
    }

    if (actionId === 'personal-safety') {
      if (outcomeId === 'safe') {
        answers.safety = 'safe';
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      } else {
        answers.safety = 'unsafe';
        markAction(state, actionId, { status: 'active', outcome: outcomeId, blockedReason: null });
      }
      return;
    }

    if (actionId === 'identify-platform') {
      if (outcomeId === 'iphone' || outcomeId === 'android') {
        answers.platform = outcomeId;
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
        syncPlatformActions(state);
      } else {
        markAction(state, actionId, { status: 'completed', outcome: 'still_unsure', blockedReason: null });
        applyUnknownPlatformFallback(state);
      }
      return;
    }

    if (actionId === 'apple-play-sound' || actionId === 'google-play-sound') {
      if (outcomeId === 'heard_nearby') {
        answers.deviceLocation = 'nearby';
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      } else {
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      }
      releaseFindRetry(state, actionId);
      return;
    }

    if (actionId === 'apple-locate-device' || actionId === 'google-locate-device') {
      if (['nearby', 'located_safe', 'located_unsafe', 'offline', 'not_found', 'unknown'].indexOf(outcomeId) !== -1) {
        answers.deviceLocation = outcomeId;
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
        if (outcomeId === 'offline') {
          // Locate can complete while offline; mark-lost remains available. Do not treat offline as erase.
        }
      } else {
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      }
      releaseFindRetry(state, actionId);
      return;
    }

    if (actionId === 'apple-mark-lost' || actionId === 'google-mark-lost') {
      if (outcomeId === 'marked') {
        answers.deviceSecured = 'yes';
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      } else if (outcomeId === 'could_not_mark') {
        answers.deviceSecured = 'no';
        markAction(state, actionId, {
          status: 'blocked',
          outcome: 'could_not_mark',
          blockedReason: 'could_not_secure_device'
        });
        state.blockedReason = 'could_not_secure_device';
      } else {
        answers.deviceSecured = 'no';
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      }
      return;
    }

    if (actionId === 'apple-auth-fallback' || actionId === 'google-auth-fallback') {
      if (outcomeId === 'recovered_access') {
        answers.accountAccess = 'yes';
        answers.verificationAccess = answers.verificationAccess === 'no' ? 'unsure' : answers.verificationAccess;
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
        state.blockedReason = null;
        ['apple-play-sound', 'google-play-sound', 'apple-locate-device', 'google-locate-device', 'apple-mark-lost', 'google-mark-lost', 'protect-primary-account'].forEach((id) => {
          if (isBlocked(state, id) && isSignInBlock(actionRecord(state, id).blockedReason)) {
            markAction(state, id, { status: 'pending', outcome: null, blockedReason: null });
          }
        });
      } else {
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      }
      return;
    }

    if (actionId === 'protect-primary-account') {
      if (outcomeId === 'secured' || outcomeId === 'already_secure') {
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      } else {
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      }
      return;
    }

    if (actionId === 'protect-mobile-line') {
      if (outcomeId === 'secured') {
        answers.carrierAccess = 'yes';
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      } else {
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      }
      return;
    }

    if (actionId === 'protect-financial-accounts') {
      if (outcomeId === 'secured' || outcomeId === 'no_exposure') {
        if (outcomeId === 'no_exposure') answers.financialExposure = 'no';
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      } else {
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      }
      return;
    }

    if (actionId === 'report-and-document') {
      const status = outcomeId === 'skipped_for_now' ? 'skipped' : 'completed';
      markAction(state, actionId, { status: status, outcome: outcomeId, blockedReason: null });
      return;
    }

    if (actionId === 'erase-device-decision') {
      const status = outcomeId === 'confirmed_erase' ? 'completed' : 'skipped';
      markAction(state, actionId, { status: status, outcome: outcomeId, blockedReason: null });
      return;
    }

    if (actionId === 'recovered-device-security-check') {
      if (outcomeId === 'in_hand_safe') {
        answers.recovered = 'yes';
        answers.safety = 'safe';
        markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      } else {
        markAction(state, actionId, { status: 'blocked', outcome: outcomeId, blockedReason: 'unsafe_to_retrieve' });
        answers.recovered = 'no';
      }
      return;
    }

    if (actionId === 'recovery-replacement-transition') {
      markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
      return;
    }

    markAction(state, actionId, { status: 'completed', outcome: outcomeId, blockedReason: null });
  }

  function recordOutcome(state, actionId, outcomeId) {
    const next = clone(state || createInitialState());
    const platform = next.answers.platform || 'unsure';
    const action = content.getAction(actionId, platform) || content.getAction(actionId, 'unsure');
    if (!action) {
      return { ok: false, error: 'missing-action', message: 'No approved action is available.' };
    }
    const allowed = (action.boundedOutcomes || []).some((item) => item.id === outcomeId);
    if (!allowed) {
      return { ok: false, error: 'invalid-state', message: 'Outcome is not in the allowed set.' };
    }
    if (next.awaitingExternalReturnActionId === actionId) {
      next.awaitingExternalReturnActionId = null;
    }
    mapOutcome(next, actionId, outcomeId);
    next.updatedAt = now();
    return evaluate(next);
  }

  function startExternalAction(state, actionId) {
    const next = clone(state || createInitialState());
    const platform = next.answers.platform || 'unsure';
    const action = content.getAction(actionId, platform) || content.getAction(actionId, 'unsure');
    if (!action) {
      return { ok: false, error: 'missing-action', message: 'No approved action is available.' };
    }
    if (!content.isOfficialUrl(action.officialUrl)) {
      return { ok: false, error: 'invalid-state', message: 'This action does not open an official service.' };
    }
    markAction(next, actionId, { status: 'active', outcome: null, blockedReason: actionRecord(next, actionId).blockedReason });
    next.awaitingExternalReturnActionId = actionId;
    next.currentActionId = actionId;
    next.currentQuestionId = null;
    next.step = 'awaiting-return';
    next.updatedAt = now();
    const view = actionView(next, actionId);
    view.awaitingReturn = true;
    return view;
  }

  function buildPlan(state) {
    const snapshot = clone(state || createInitialState());
    syncPlatformActions(snapshot);
    const platform = snapshot.answers.platform || 'unsure';
    const lanes = { now: [], next: [], later: [] };
    content.APPROVED_ACTION_IDS.forEach((actionId) => {
      const action = content.getAction(actionId, platform) || content.getAction(actionId, 'unsure');
      if (!action) return;
      const record = actionRecord(snapshot, actionId);
      const item = {
        actionId: actionId,
        title: action.title,
        lane: action.planLane,
        status: record.status,
        outcome: record.outcome,
        blockedReason: record.blockedReason,
        blockedCopy: record.blockedReason ? content.BLOCKED_REASON_COPY[record.blockedReason] : null
      };
      lanes[action.planLane].push(item);
    });
    const assessed = assessStabilization(snapshot);
    return {
      now: lanes.now,
      next: lanes.next,
      later: lanes.later,
      status: assessed.state.status,
      stabilizationStatus: assessed.state.stabilizationStatus
    };
  }

  return {
    STEPS,
    FORBIDDEN_STATE_FIELDS,
    APPROVED_ACTION_IDS: content.APPROVED_ACTION_IDS,
    createInitialState,
    validateState,
    selectFirstAction,
    allCombinations,
    evaluate,
    answerQuestion,
    recordOutcome,
    startExternalAction,
    buildPlan,
    isEraseAvailable,
    reviewErase,
    assessStabilization,
    hasCriticalBlocker,
    listCriticalBlockers,
    acknowledgeCriticalBlocker,
    clone
  };
});
