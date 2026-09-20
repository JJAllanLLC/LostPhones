(function () {
  const logic = window.LostPhonesRecoveryLogic;
  const content = window.LostPhonesRecoveryContent;
  const session = window.LostPhonesRecoverySession;
  const planCore = window.LostPhonesRecoveryPlanCore;
  const planClient = window.LostPhonesRecoveryPlanClient;
  const analytics = window.LostPhonesAnalytics;
  if (!logic || !content) {
    return;
  }

  const app = document.getElementById('recovery-app');
  const live = document.getElementById('status-live');
  const progress = document.getElementById('progress-label');
  const screens = {
    orientation: document.getElementById('screen-orientation'),
    situation: document.getElementById('screen-situation'),
    platform: document.getElementById('screen-platform'),
    currentDevice: document.getElementById('screen-currentDevice'),
    question: document.getElementById('screen-question'),
    action: document.getElementById('screen-action')
  };

  let state = logic.createInitialState();
  let historyStack = ['situation'];
  let showingOutcomes = false;
  let offerTracked = false;
  let resetReturnFocus = null;

  const EXCEPTION_OUTCOMES = {
    cannot_sign_in: true,
    cannot_receive_verification: true,
    service_unavailable: true,
    unknown: true,
    still_blocked: true,
    waiting_for_provider: true,
    needs_owner: true,
    cannot_access_carrier: true
  };

  const SHORT_OUTCOMES = {
    nearby: 'Phone is nearby',
    located_safe: 'Location is safe to reach',
    located_unsafe: 'Location may be unsafe',
    offline: 'Phone is offline',
    not_found: 'No useful location',
    unknown: 'I could not tell',
    heard_nearby: 'I heard the phone nearby',
    not_heard: 'I did not hear it',
    marked: 'I marked it lost or locked it',
    could_not_mark: 'I could not mark it lost or lock it',
    cannot_sign_in: 'I cannot sign in',
    cannot_receive_verification: 'I cannot receive a verification code',
    service_unavailable: 'The official service was unavailable'
  };

  const PROGRESS_STAGES = [
    { id: 'safety', label: 'Immediate safety', ids: ['personal-safety'] },
    { id: 'find', label: 'Find or secure phone', ids: ['identify-platform', 'apple-play-sound', 'google-play-sound', 'apple-locate-device', 'google-locate-device', 'apple-mark-lost', 'google-mark-lost', 'recovered-device-security-check'] },
    { id: 'protect', label: 'Protect access', ids: ['apple-auth-fallback', 'google-auth-fallback', 'protect-primary-account', 'protect-mobile-line', 'protect-financial-accounts'] },
    { id: 'review', label: 'Review and finish', ids: ['report-and-document', 'erase-device-decision', 'recovery-replacement-transition'] }
  ];

  const questionSteps = {
    situation: 'Question 1 of 3',
    platform: 'Question 2 of 3',
    currentDevice: 'Question 3 of 3'
  };

  const focusTargets = {
    orientation: 'orientation-title',
    situation: 'legend-situation',
    platform: 'legend-platform',
    currentDevice: 'legend-currentDevice',
    question: 'legend-question',
    action: 'action-title'
  };

  function announce(message) {
    live.textContent = '';
    window.setTimeout(function () {
      live.textContent = message;
    }, 20);
  }

  function selectedValue(form, name) {
    const field = form.querySelector('input[name="' + name + '"]:checked');
    return field ? field.value : null;
  }

  function restoreChoice(name, value) {
    if (!value) return;
    const input = app.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (input) {
      input.checked = true;
      syncChoiceStyles(input.form);
      enableContinue(input.form);
    }
  }

  function syncChoiceStyles(form) {
    if (!form) return;
    form.querySelectorAll('.choice').forEach(function (label) {
      const input = label.querySelector('input');
      label.classList.toggle('is-selected', !!(input && input.checked));
    });
  }

  function enableContinue(form) {
    if (!form) return;
    const submit = form.querySelector('#continue-situation, #continue-platform, #continue-currentDevice');
    if (!submit) return;
    submit.disabled = !form.querySelector('input[type="radio"]:checked');
  }

  function setTriageProgress(step) {
    const bar = document.getElementById('triage-progress');
    if (!bar) return;
    const index = { situation: 1, platform: 2, currentDevice: 3 }[step] || 0;
    bar.hidden = !index;
    bar.querySelectorAll('.segment').forEach(function (seg) {
      const n = Number(seg.getAttribute('data-seg'));
      seg.classList.toggle('is-current', n === index);
      seg.classList.toggle('is-done', n < index);
    });
  }

  function showScreen(step) {
    Object.keys(screens).forEach(function (key) {
      screens[key].hidden = key !== step;
    });

    if (questionSteps[step]) {
      progress.hidden = false;
      progress.textContent = 'Three quick questions';
    } else if (step === 'orientation') {
      progress.hidden = false;
      progress.textContent = 'Three quick questions, then your safest next step.';
    } else {
      progress.hidden = true;
    }
    setTriageProgress(step);

    const focusId = focusTargets[step];
    const focusNode = document.getElementById(focusId);
    if (focusNode) focusNode.focus();
  }

  function pushHistory(step) {
    if (historyStack[historyStack.length - 1] !== step) {
      historyStack.push(step);
    }
  }

  function track(eventName, properties) {
    if (analytics && typeof analytics.track === 'function') {
      analytics.track(eventName, properties);
    }
  }

  function hidePaidOffer() {
    const panel = document.getElementById('paid-offer');
    if (panel) panel.hidden = true;
  }

  function renderPaidOffer() {
    const panel = document.getElementById('paid-offer');
    if (!panel || !planCore) {
      hidePaidOffer();
      return;
    }
    if (!planCore.isPaidOfferEligible(state)) {
      hidePaidOffer();
      return;
    }
    if (!offerTracked) {
      offerTracked = true;
      track('recovery_stabilization_reached', { status: state.stabilizationStatus });
      track('recovery_paid_offer_eligible', { status: state.stabilizationStatus });
    }
    if (planCore.shouldRenderOffer(state, planClient && planClient.isDismissed())) {
      panel.hidden = false;
      track('recovery_paid_offer_viewed', { status: state.stabilizationStatus });
    } else {
      hidePaidOffer();
    }
  }

  async function persistIfPossible() {
    if (!session) return;
    if (state.answers.currentDevice === 'public') return;
    if (!session.getToken()) return;
    await session.update(state, state.answers.currentDevice);
  }

  function statusLabel(status) {
    if (status === 'recovered') return 'You are safer now';
    if (status === 'stabilized') return 'Immediate risks contained';
    if (status === 'stabilized_with_blockers') return 'Immediate risks contained';
    return '';
  }

  function planStatusText(item) {
    if (item.status === 'completed') return 'Done';
    if (item.status === 'blocked') {
      if (/apple|iphone/i.test(item.actionId || item.title || '')) return 'Waiting on Apple';
      if (/google|android/i.test(item.actionId || item.title || '')) return 'Waiting on Google';
      return 'Needs another route';
    }
    if (item.status === 'not_applicable') return 'Not needed';
    if (item.status === 'skipped') return 'Skipped';
    if (item.status === 'active') return 'Current';
    return 'Later';
  }

  function stageStatus(stage, currentId) {
    const plan = logic.buildPlan(state);
    const items = [].concat(plan.now, plan.next, plan.later).filter(function (item) {
      return stage.ids.indexOf(item.actionId) !== -1 && item.status !== 'not_applicable';
    });
    if (!items.length) return 'Later';
    if (currentId && stage.ids.indexOf(currentId) !== -1) return 'Current';
    if (items.some(function (item) { return item.status === 'blocked'; })) return 'Needs attention';
    if (items.every(function (item) { return item.status === 'completed' || item.status === 'skipped'; })) return 'Done';
    if (items.some(function (item) { return item.status === 'active'; })) return 'Current';
    return 'Later';
  }

  function renderProgress(currentId, complete) {
    const rail = document.getElementById('progress-rail');
    const stagesEl = document.getElementById('progress-stages');
    const kicker = document.getElementById('progress-kicker');
    if (!rail || !stagesEl) return;
    stagesEl.innerHTML = '';
    let doneCount = 0;
    let currentLabel = '';
    PROGRESS_STAGES.forEach(function (stage) {
      const status = stageStatus(stage, currentId);
      if (status === 'Done') doneCount += 1;
      if (status === 'Current') currentLabel = stage.label;
      const row = document.createElement('div');
      row.className = 'progress-stage';
      if (status === 'Done') row.classList.add('is-done');
      if (status === 'Current') row.classList.add('is-current');
      if (status === 'Needs attention') row.classList.add('is-attention');
      const name = document.createElement('span');
      name.textContent = stage.label;
      const meta = document.createElement('span');
      meta.className = 'progress-stage-status';
      meta.textContent = status;
      row.appendChild(name);
      row.appendChild(meta);
      stagesEl.appendChild(row);
    });
    kicker.textContent = complete
      ? 'You are safer now'
      : (doneCount ? (doneCount + ' safety area' + (doneCount === 1 ? '' : 's') + ' completed') : 'You are making progress');
    if (currentLabel && !complete) kicker.textContent += '. Current: ' + currentLabel;
    rail.hidden = false;
  }

  function renderPlan(expanded) {
    const panel = document.getElementById('plan-panel');
    const plan = logic.buildPlan(state);
    const buckets = {
      now: document.getElementById('plan-now'),
      next: document.getElementById('plan-next'),
      later: document.getElementById('plan-later')
    };
    ['now', 'next', 'later'].forEach(function (lane) {
      buckets[lane].innerHTML = '';
      plan[lane].forEach(function (item) {
        const li = document.createElement('li');
        li.className = 'plan-item plan-' + item.status;
        const title = document.createElement('span');
        title.textContent = item.title;
        const meta = document.createElement('span');
        meta.className = 'plan-status';
        meta.textContent = planStatusText(item);
        li.appendChild(title);
        li.appendChild(meta);
        buckets[lane].appendChild(li);
      });
    });
    panel.hidden = false;
    panel.open = !!expanded;
    const statusEl = document.getElementById('journey-status');
    const label = statusLabel(plan.status);
    if (label) {
      statusEl.hidden = false;
      statusEl.textContent = label;
      statusEl.className = 'status-pill is-secured';
    } else {
      statusEl.hidden = true;
    }
  }

  function renderResume() {
    const box = document.getElementById('resume-box');
    const copy = document.getElementById('resume-copy');
    const controls = document.getElementById('resume-controls');
    const feedback = document.getElementById('resume-feedback');
    controls.innerHTML = '';
    feedback.hidden = true;

    const device = state.answers.currentDevice;
    if (!device || !session) {
      box.hidden = true;
      return;
    }

    box.hidden = false;
    if (device === 'public') {
      copy.textContent = 'This is a public or shared device. LostPhones will not save a resume token here.';
      return;
    }
    if (device === 'borrowed') {
      copy.textContent = 'This browser session is not saved on this device. You can copy a private resume link if you need to continue later.';
    } else {
      copy.textContent = 'On a trusted device you can save a private resume token for seven days, or copy a resume link.';
    }

    if (device === 'trusted') {
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'btn btn-secondary';
      save.textContent = 'Save for seven days';
      save.addEventListener('click', function () {
        ensureSession().then(function (ok) {
          feedback.hidden = false;
          feedback.textContent = ok ? 'Saved on this device for up to seven days.' : 'Could not save this recovery.';
        });
      });
      controls.appendChild(save);
    }

    const copyLink = document.createElement('button');
    copyLink.type = 'button';
    copyLink.className = 'btn btn-secondary';
    copyLink.textContent = 'Copy resume link';
    copyLink.addEventListener('click', function () {
      ensureSession().then(function (ok) {
        const url = ok ? session.copyResumeLink() : null;
        if (!url) {
          feedback.hidden = false;
          feedback.textContent = 'Could not create a resume link.';
          return;
        }
        const done = function () {
          feedback.hidden = false;
          feedback.textContent = 'Resume link copied. Keep it private.';
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done).catch(done);
        } else {
          done();
        }
      });
    });
    controls.appendChild(copyLink);
  }

  async function ensureSession() {
    if (!session) return false;
    if (state.answers.currentDevice === 'public') return false;
    if (session.getToken()) {
      const updated = await session.update(state, state.answers.currentDevice);
      return !!(updated && updated.ok);
    }
    const created = await session.create(state, state.answers.currentDevice);
    return !!(created && created.ok && created.token);
  }

  function renderPrivacy(guidance) {
    const box = document.getElementById('privacy-box');
    const title = document.getElementById('privacy-title');
    const list = document.getElementById('privacy-list');
    list.innerHTML = '';
    if (!guidance || !guidance.items || !guidance.items.length) {
      box.hidden = true;
      return;
    }
    title.textContent = guidance.title;
    guidance.items.forEach(function (item) {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    box.hidden = false;
  }

  function splitSteps(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .split('. ')
      .map(function (part, index, arr) {
        const trimmed = part.trim();
        if (!trimmed) return '';
        return /[.!?]$/.test(trimmed) || index === arr.length - 1 ? trimmed : trimmed + '.';
      })
      .filter(Boolean)
      .slice(0, 4);
  }

  function renderSteps(text) {
    const list = document.getElementById('action-steps');
    const fallback = document.getElementById('action-instruction');
    list.innerHTML = '';
    const steps = splitSteps(text);
    if (!steps.length) {
      fallback.hidden = false;
      fallback.textContent = text;
      return;
    }
    fallback.hidden = true;
    steps.forEach(function (step) {
      const li = document.createElement('li');
      li.textContent = step;
      list.appendChild(li);
    });
  }

  function externalLink(href, label, leavingText, actionId) {
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    const sr = document.createElement('span');
    sr.className = 'live-region';
    sr.textContent = ' Opens in a new tab';
    link.appendChild(sr);
    if (leavingText) link.setAttribute('aria-describedby', 'leaving-note');
    link.addEventListener('click', function () {
      const result = logic.startExternalAction(state, actionId);
      if (result.ok) {
        showingOutcomes = false;
        applyView(result, false);
      }
    });
    return link;
  }

  function outcomeButton(action, outcome) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    const label = document.createElement('span');
    label.textContent = SHORT_OUTCOMES[outcome.id] || outcome.label;
    button.appendChild(label);
    if (SHORT_OUTCOMES[outcome.id] && SHORT_OUTCOMES[outcome.id] !== outcome.label) {
      const help = document.createElement('span');
      help.className = 'outcome-help';
      help.textContent = outcome.label;
      button.appendChild(help);
    }
    button.addEventListener('click', function () {
      const result = logic.recordOutcome(state, action.actionId, outcome.id);
      showingOutcomes = false;
      applyView(result, true);
    });
    return button;
  }

  function renderOutcomes(action) {
    const box = document.getElementById('outcome-box');
    const prompt = document.getElementById('return-prompt');
    const primary = document.getElementById('outcome-primary');
    const exceptionsWrap = document.getElementById('outcome-exceptions');
    const exceptions = document.getElementById('outcome-exception-controls');
    primary.innerHTML = '';
    exceptions.innerHTML = '';
    if (!action || !action.boundedOutcomes || !action.boundedOutcomes.length) {
      box.hidden = true;
      return;
    }
    document.getElementById('outcome-heading').textContent = 'What did you find?';
    prompt.textContent = action.returnPrompt || 'Choose the closest result. LostPhones does not infer success from a new tab.';
    const extras = [];
    action.boundedOutcomes.forEach(function (outcome) {
      const button = outcomeButton(action, outcome);
      if (EXCEPTION_OUTCOMES[outcome.id]) extras.push(button);
      else primary.appendChild(button);
    });
    extras.forEach(function (button) { exceptions.appendChild(button); });
    exceptionsWrap.hidden = extras.length === 0;
    box.hidden = false;
  }

  function renderCompleteSummary() {
    const box = document.getElementById('complete-summary');
    const groups = document.getElementById('complete-groups');
    const heading = document.getElementById('complete-heading');
    const copy = document.getElementById('complete-copy');
    const eraseSlot = document.getElementById('review-erase-slot');
    const plan = logic.buildPlan(state);
    const all = [].concat(plan.now, plan.next, plan.later);
    const secured = all.filter(function (item) { return item.status === 'completed'; });
    const attention = all.filter(function (item) { return item.status === 'blocked'; });
    const later = all.filter(function (item) { return item.status === 'pending' || item.status === 'skipped'; });
    heading.textContent = state.status === 'recovered' ? 'Phone recovered' : 'Immediate risks contained';
    copy.textContent = state.status === 'stabilized_with_blockers'
      ? 'You are safer now. A waiting step still needs an official service or the owner.'
      : 'You are safer now. The immediate risk is under control. Here is what is secure and what can wait.';
    groups.innerHTML = '';
    [
      { title: 'Secured', items: secured },
      { title: 'Still needs attention', items: attention },
      { title: 'Can wait', items: later }
    ].forEach(function (group) {
      const section = document.createElement('section');
      const h = document.createElement('h3');
      h.textContent = group.title;
      const ul = document.createElement('ul');
      ul.className = 'plan-list';
      (group.items.length ? group.items : [{ title: 'None recorded' }]).forEach(function (item) {
        const li = document.createElement('li');
        li.textContent = item.title;
        ul.appendChild(li);
      });
      section.appendChild(h);
      section.appendChild(ul);
      groups.appendChild(section);
    });
    const eraseStatus = state.actions['erase-device-decision'] && state.actions['erase-device-decision'].status;
    const canErase = logic.isEraseAvailable(state) && eraseStatus !== 'completed' && eraseStatus !== 'active';
    eraseSlot.hidden = !canErase;
    eraseSlot.textContent = 'Review erase option';
    eraseSlot.onclick = function () {
      applyView(logic.reviewErase(state), true);
    };
    box.hidden = false;
  }

  function renderAction(view) {
    const record = view.action;
    const title = document.getElementById('action-title');
    const reason = document.getElementById('action-reason');
    const caution = document.getElementById('action-caution');
    const leaving = document.getElementById('leaving-note');
    const support = document.getElementById('support-note');
    const supportDetails = document.getElementById('support-details');
    const controls = document.getElementById('action-controls');
    const awaiting = document.getElementById('awaiting-banner');
    const imBack = document.getElementById('im-back');
    const complete = document.getElementById('complete-summary');
    const why = document.getElementById('why-copy');

    controls.innerHTML = '';
    leaving.hidden = true;
    supportDetails.hidden = true;
    document.getElementById('outcome-box').hidden = true;
    complete.hidden = true;

    if (!record) {
      document.getElementById('action-kicker').textContent = 'Summary';
      title.textContent = statusLabel(state.status) || 'You are safer now';
      reason.textContent = 'You are safer now. The immediate risk is under control. Here is what is secure and what can wait.';
      renderSteps('Use the free summary below. Print or save it before considering the optional PDF.');
      caution.textContent = 'LostPhones still will not ask for passwords, codes, or account details.';
      awaiting.hidden = true;
      renderCompleteSummary();
      renderPrivacy(content.privacyGuidance[state.answers.currentDevice]);
      renderProgress(null, true);
      renderPlan(true);
      renderResume();
      renderPaidOffer();
      showScreen('action');
      announce(title.textContent);
      return;
    }

    document.getElementById('action-kicker').textContent = 'Current step';
    title.textContent = record.title;
    if (record.actionId === 'apple-auth-fallback' || record.actionId === 'google-auth-fallback') {
      const service = record.nextServiceName || (record.actionId.indexOf('apple') === 0 ? 'Apple Account Recovery' : 'Google Account Recovery');
      reason.textContent = 'You could not sign in, but you still have a safe next step. Use ' + service + ', then come back here.';
    } else {
      reason.textContent = record.reason;
    }
    renderSteps(record.instruction);
    caution.textContent = record.caution;
    why.textContent = record.reason;
    renderPrivacy(content.privacyGuidance[state.answers.currentDevice]);

    const awaitingReturn = !!view.awaitingReturn;
    awaiting.hidden = !awaitingReturn;
    if (awaitingReturn) {
      const service = record.nextServiceName || record.officialProvider || 'the official service';
      document.getElementById('awaiting-copy').textContent = service + ' opened in a new tab. When you finish there, return here and choose I am back.';
    }

    if (!awaitingReturn && record.leavingLabel && (record.officialUrl || record.requiresExternalReturn)) {
      leaving.textContent = (record.nextServiceName || 'The official service') + ' will open in a new tab. Keep this page open and come back when you finish.';
      leaving.hidden = false;
    }

    if (record.supportSourceUrl) {
      const supportLink = document.createElement('a');
      supportLink.href = record.supportSourceUrl;
      supportLink.target = '_blank';
      supportLink.rel = 'noopener noreferrer';
      supportLink.textContent = 'Official support article (opens in a new tab)';
      support.textContent = '';
      support.appendChild(supportLink);
      supportDetails.hidden = false;
    }

    if (!awaitingReturn && !showingOutcomes) {
      if (record.officialUrl && record.primaryControlLabel) {
        controls.appendChild(externalLink(record.officialUrl, record.primaryControlLabel, record.leavingLabel, record.actionId));
      } else if (record.requiresExternalReturn) {
        const opened = document.createElement('button');
        opened.type = 'button';
        opened.className = 'btn btn-primary';
        opened.textContent = 'I’ve opened the official app or website';
        opened.addEventListener('click', function () {
          const result = logic.startExternalAction(state, record.actionId);
          if (result.ok) {
            showingOutcomes = false;
            applyView(result, false);
          }
        });
        controls.appendChild(opened);
      } else if (record.boundedOutcomes && record.boundedOutcomes.length) {
        renderOutcomes(record);
      }

      if (record.secondaryOfficialUrl) {
        controls.appendChild(externalLink(record.secondaryOfficialUrl, record.secondaryOfficialLabel, record.secondaryLeavingLabel, record.actionId));
      }
    }

    if (awaitingReturn) {
      const again = externalLink(record.officialUrl || record.supportSourceUrl || '#', 'Open again', record.leavingLabel, record.actionId);
      again.className = 'btn btn-secondary';
      controls.appendChild(again);
    }

    if (showingOutcomes) {
      awaiting.hidden = true;
      renderOutcomes(record);
    }

    imBack.onclick = function () {
      showingOutcomes = true;
      renderAction(view);
      announce('Back from the official service? Tell us what you found.');
      const heading = document.getElementById('outcome-heading');
      if (heading) heading.focus();
    };

    renderProgress(record.actionId, false);
    renderPlan(false);
    renderResume();
    hidePaidOffer();
    showScreen('action');
    announce(awaitingReturn ? (record.nextServiceName || 'The official service') + ' opened in a new tab. When you finish there, return here and choose I am back.' : record.title);
  }

  function renderDynamicQuestion(view) {
    const question = view.question;
    document.getElementById('legend-question').querySelector('h1').textContent = question.title;
    document.getElementById('question-help').textContent = question.help || '';
    const holder = document.getElementById('question-choices');
    holder.innerHTML = '';
    question.choices.forEach(function (choice) {
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'dynamic-question';
      input.value = choice.id;
      input.required = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + choice.label));
      holder.appendChild(label);
    });
    document.getElementById('form-question').setAttribute('data-question-id', question.id);
    showScreen('question');
    announce(question.title);
  }

  function applyView(view, persist) {
    if (!view || !view.ok) {
      state.step = 'action';
      showScreen('action');
      document.getElementById('action-title').textContent = 'We need a complete answer set';
      document.getElementById('action-reason').textContent = 'LostPhones will not guess the next step from incomplete or invalid answers.';
      renderSteps('Go back and choose one option on each screen.');
      document.getElementById('action-caution').textContent = 'No official recovery service was selected.';
      hidePaidOffer();
      announce('The recovery answers are incomplete. No action was guessed.');
      return;
    }

    state = view.state;
    if (persist) persistIfPossible();

    if (view.type === 'question') {
      pushHistory('question:' + view.questionId);
      if (view.questionId === 'situation' || view.questionId === 'platform' || view.questionId === 'currentDevice') {
        restoreChoice(view.questionId, state.answers[view.questionId]);
        showScreen(view.questionId);
        announce(questionSteps[view.questionId] || view.question.title);
        return;
      }
      renderDynamicQuestion(view);
      return;
    }

    pushHistory('action:' + (view.actionId || state.status));
    renderAction(view);
  }

  function startOver() {
    const reset = function () {
      state = logic.createInitialState();
      historyStack = ['situation'];
      showingOutcomes = false;
      offerTracked = false;
      app.querySelectorAll('input[type="radio"]').forEach(function (input) {
        input.checked = false;
      });
      document.getElementById('plan-panel').hidden = true;
      document.getElementById('resume-box').hidden = true;
      hidePaidOffer();
      showScreen('situation');
      announce('Recovery started over. Answers cleared.');
    };
    if (session) {
      session.remove().then(reset).catch(reset);
    } else {
      reset();
    }
  }

  function openResetDialog() {
    const dialog = document.getElementById('reset-dialog');
    resetReturnFocus = document.getElementById('start-over-request');
    document.body.classList.add('dialog-open');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    document.getElementById('reset-confirm').focus();
  }

  function closeResetDialog() {
    const dialog = document.getElementById('reset-dialog');
    if (dialog.open) dialog.close();
    document.body.classList.remove('dialog-open');
    if (resetReturnFocus) resetReturnFocus.focus();
  }

  function goBack() {
    showingOutcomes = false;
    if (historyStack.length > 1) historyStack.pop();
    const previous = historyStack[historyStack.length - 1] || 'situation';
    if (previous === 'orientation' || previous === 'situation') {
      showScreen('situation');
      announce('Moved back.');
      return;
    }
    if (previous === 'situation' || previous === 'platform' || previous === 'currentDevice') {
      restoreChoice(previous, state.answers[previous]);
      showScreen(previous);
      announce('Moved back.');
      return;
    }
    applyView(logic.evaluate(state), false);
    announce('Moved back.');
  }

  function continueFrom(step, value) {
    if (step === 'orientation') {
      pushHistory('situation');
      restoreChoice('situation', state.answers.situation);
      showScreen('situation');
      announce('Question 1 of 3.');
      return;
    }
    const result = logic.answerQuestion(state, step, value);
    applyView(result, true);
  }

  document.getElementById('begin-recovery').addEventListener('click', function () {
    continueFrom('orientation');
  });

  ['situation', 'platform', 'currentDevice'].forEach(function (name) {
    const form = document.getElementById('form-' + name);
    form.addEventListener('change', function () {
      syncChoiceStyles(form);
      enableContinue(form);
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const value = selectedValue(event.currentTarget, name);
      if (value) continueFrom(name, value);
    });
  });

  document.getElementById('form-question').addEventListener('submit', function (event) {
    event.preventDefault();
    const questionId = event.currentTarget.getAttribute('data-question-id');
    const value = selectedValue(event.currentTarget, 'dynamic-question');
    if (questionId && value) applyView(logic.answerQuestion(state, questionId, value), true);
  });

  const keepPlan = document.getElementById('keep-recovery-plan');
  if (keepPlan) {
    keepPlan.addEventListener('click', function () {
      const feedback = document.getElementById('paid-offer-feedback');
      if (!planClient) {
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = 'Checkout is unavailable right now. Your free plan is still here.';
        }
        return;
      }
      track('recovery_checkout_started', {
        productId: analytics ? analytics.PRODUCT_ID : 'recovery-complete-plan',
        value: analytics ? analytics.PRODUCT_VALUE : 8.95
      });
      planClient.startCheckout(state).then(function (result) {
        if (result && result.ok && result.url) {
          window.location.href = result.url;
          return;
        }
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = 'Checkout is unavailable right now. Your free plan is still here.';
        }
      }).catch(function () {
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = 'Checkout is unavailable right now. Your free plan is still here.';
        }
      });
    });
  }

  const dismissPlan = document.getElementById('dismiss-recovery-plan');
  if (dismissPlan) {
    dismissPlan.addEventListener('click', function () {
      if (planClient) planClient.dismissOffer();
      hidePaidOffer();
      track('recovery_paid_offer_dismissed', { status: state.stabilizationStatus });
      announce('Continuing with the free recovery plan.');
    });
  }

  document.getElementById('print-summary').addEventListener('click', function () {
    window.print();
  });

  document.getElementById('start-over-request').addEventListener('click', openResetDialog);
  document.getElementById('reset-cancel').addEventListener('click', closeResetDialog);
  document.getElementById('reset-confirm').addEventListener('click', function () {
    closeResetDialog();
    startOver();
  });
  document.getElementById('reset-dialog').addEventListener('cancel', closeResetDialog);

  app.addEventListener('click', function (event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.getAttribute('data-action');
    if (action === 'back') goBack();
    else if (action === 'start-over') openResetDialog();
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      const raised = window.visualViewport.height < window.innerHeight - 80;
      document.body.classList.toggle('keyboard-open', raised);
    });
  }

  function boot() {
    showScreen('situation');
    if (planClient && /[?&]checkout=cancelled/.test(window.location.search || '')) {
      const restored = planClient.restoreCheckoutState();
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      if (restored) {
        state = restored;
        applyView(logic.evaluate(state), false);
        announce('Checkout was cancelled. Your free recovery plan is still here.');
        return;
      }
    }
    if (!session) return;
    const fragmentToken = session.consumeResumeFragment();
    const stored = fragmentToken || session.loadPersistedToken('trusted');
    if (!stored) return;
    session.read(stored).then(function (result) {
      if (!result || !result.ok || !result.state) {
        announce('That resume link is no longer available.');
        return;
      }
      state = result.state;
      applyView(logic.evaluate(state), false);
      announce('Resumed your recovery plan.');
    }).catch(function () {
      announce('That resume link is no longer available.');
    });
  }

  boot();
})();
