(function () {
  const logic = window.LostPhonesRecoveryLogic;
  const content = window.LostPhonesRecoveryContent;
  const session = window.LostPhonesRecoverySession;
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
  let historyStack = ['orientation'];
  let showingOutcomes = false;

  const questionSteps = {
    situation: 'Step 1 of 3',
    platform: 'Step 2 of 3',
    currentDevice: 'Step 3 of 3'
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
    if (input) input.checked = true;
  }

  function showScreen(step) {
    Object.keys(screens).forEach(function (key) {
      screens[key].hidden = key !== step;
    });

    if (questionSteps[step]) {
      progress.hidden = false;
      progress.textContent = questionSteps[step];
    } else {
      progress.hidden = true;
    }

    const focusId = focusTargets[step];
    const focusNode = document.getElementById(focusId);
    if (focusNode) {
      focusNode.focus();
    }
  }

  function pushHistory(step) {
    if (historyStack[historyStack.length - 1] !== step) {
      historyStack.push(step);
    }
  }

  async function persistIfPossible() {
    if (!session) return;
    if (state.answers.currentDevice === 'public') return;
    if (!session.getToken()) return;
    await session.update(state, state.answers.currentDevice);
  }

  function statusLabel(status) {
    if (status === 'recovered') return 'Recovered';
    if (status === 'stabilized') return 'Stabilized';
    if (status === 'stabilized_with_blockers') return 'Stabilized with blockers';
    return '';
  }

  function planStatusText(item) {
    if (item.status === 'completed') return 'Completed';
    if (item.status === 'blocked') return 'Blocked — not complete';
    if (item.status === 'not_applicable') return 'No longer applicable';
    if (item.status === 'skipped') return 'Skipped';
    if (item.status === 'active') return 'In progress';
    return 'Pending';
  }

  function renderPlan() {
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
        if (item.status === 'pending' && item.lane !== 'now' && state.status === 'active' && !item.blockedReason) {
          // keep pending later/next visible for orientation
        }
        const li = document.createElement('li');
        li.className = 'plan-item plan-' + item.status;
        const title = document.createElement('span');
        title.textContent = item.title;
        const meta = document.createElement('span');
        meta.className = 'plan-status';
        meta.textContent = planStatusText(item);
        li.appendChild(title);
        li.appendChild(meta);
        if (item.blockedCopy) {
          const blocked = document.createElement('p');
          blocked.className = 'plan-blocked';
          blocked.textContent = item.blockedCopy;
          li.appendChild(blocked);
        }
        buckets[lane].appendChild(li);
      });
    });
    panel.hidden = false;

    const statusEl = document.getElementById('journey-status');
    const label = statusLabel(plan.status);
    if (label) {
      statusEl.hidden = false;
      statusEl.textContent = label;
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
      copy.textContent = 'This is a public or shared device. LostPhones will not save a resume token here. Use a private browsing window if you can, sign out of every official service, and close the browser when you finish.';
      return;
    }

    if (device === 'borrowed') {
      copy.textContent = 'This browser session is not saved on this device. You can copy a private resume link if you need to continue later. Sign out of official services when you finish.';
    } else {
      copy.textContent = 'On a trusted device you can save a private resume token for seven days, or copy a resume link. LostPhones stores only bounded recovery choices, never passwords or locations.';
    }

    if (device === 'trusted') {
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'btn btn-secondary';
      save.textContent = 'Save on this device';
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
          feedback.textContent = 'Resume link copied. It is private. Do not send it to analytics or post it publicly.';
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

  function externalLink(href, label, leavingText, actionId) {
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    if (leavingText) {
      link.setAttribute('aria-describedby', 'leaving-note');
    }
    link.addEventListener('click', function () {
      const result = logic.startExternalAction(state, actionId);
      if (result.ok) {
        showingOutcomes = false;
        applyView(result, false);
      }
    });
    return link;
  }

  function renderOutcomes(action) {
    const box = document.getElementById('outcome-box');
    const prompt = document.getElementById('return-prompt');
    const controls = document.getElementById('outcome-controls');
    controls.innerHTML = '';
    if (!action || !action.boundedOutcomes || !action.boundedOutcomes.length) {
      box.hidden = true;
      return;
    }
    prompt.textContent = action.returnPrompt || 'Choose the closest result. LostPhones does not infer success from a new tab.';
    action.boundedOutcomes.forEach(function (outcome) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary';
      button.textContent = outcome.label;
      button.addEventListener('click', function () {
        const result = logic.recordOutcome(state, action.actionId, outcome.id);
        showingOutcomes = false;
        applyView(result, true);
      });
      controls.appendChild(button);
    });
    box.hidden = false;
  }

  function renderAction(view) {
    const record = view.action;
    const title = document.getElementById('action-title');
    const reason = document.getElementById('action-reason');
    const instruction = document.getElementById('action-instruction');
    const caution = document.getElementById('action-caution');
    const leaving = document.getElementById('leaving-note');
    const support = document.getElementById('support-note');
    const controls = document.getElementById('action-controls');
    const awaiting = document.getElementById('awaiting-banner');
    const imBack = document.getElementById('im-back');

    controls.innerHTML = '';
    leaving.hidden = true;
    support.hidden = true;
    document.getElementById('outcome-box').hidden = true;

    if (!record) {
      title.textContent = statusLabel(state.status) || 'Recovery status';
      reason.textContent = state.status === 'stabilized_with_blockers'
        ? 'Safe independent protections are done. A blocked step still needs an official service or the owner, and it remains visible in Next.'
        : 'The immediate risk is contained. Reporting, documentation, and replacement can wait.';
      instruction.textContent = 'Use the plan below for leftover later work. Start over if this is a new incident.';
      caution.textContent = 'LostPhones still will not ask for passwords, codes, or account details.';
      awaiting.hidden = true;
      renderPrivacy(content.privacyGuidance[state.answers.currentDevice]);
      renderPlan();
      renderResume();
      showScreen('action');
      announce(title.textContent);
      return;
    }

    title.textContent = record.title;
    reason.textContent = record.reason;
    instruction.textContent = record.instruction;
    caution.textContent = record.caution;
    renderPrivacy(content.privacyGuidance[state.answers.currentDevice]);

    const awaitingReturn = !!view.awaitingReturn;
    awaiting.hidden = !awaitingReturn;
    if (awaitingReturn) {
      document.getElementById('awaiting-copy').textContent = record.leavingLabel
        || 'The official service opens separately. Keep LostPhones available and return afterward.';
    }

    if (record.leavingLabel && (record.officialUrl || record.requiresExternalReturn)) {
      leaving.textContent = record.leavingLabel;
      leaving.hidden = false;
    }

    if (record.supportSourceUrl) {
      const supportLink = document.createElement('a');
      supportLink.href = record.supportSourceUrl;
      supportLink.target = '_blank';
      supportLink.rel = 'noopener noreferrer';
      supportLink.textContent = 'Official support article';
      support.textContent = 'Support source: ';
      support.appendChild(supportLink);
      support.hidden = false;
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
        if (record.secondaryLeavingLabel) {
          const secondLeave = document.createElement('p');
          secondLeave.className = 'leaving-note';
          secondLeave.textContent = record.secondaryLeavingLabel;
          controls.appendChild(secondLeave);
        }
        controls.appendChild(externalLink(record.secondaryOfficialUrl, record.secondaryOfficialLabel, record.secondaryLeavingLabel, record.actionId));
      }
    }

    if (showingOutcomes) {
      awaiting.hidden = true;
      renderOutcomes(record);
    }

    imBack.onclick = function () {
      showingOutcomes = true;
      renderAction(view);
      announce('Choose what happened in the official service. LostPhones did not assume success.');
    };

    renderPlan();
    renderResume();
    showScreen('action');
    announce(awaitingReturn ? 'Return to LostPhones when you are done in the official service.' : record.title);
  }

  function renderDynamicQuestion(view) {
    const question = view.question;
    document.getElementById('legend-question').textContent = question.title;
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
      document.getElementById('action-instruction').textContent = 'Go back and choose one option on each screen.';
      document.getElementById('action-caution').textContent = 'No official recovery service was selected.';
      announce('The recovery answers are incomplete. No action was guessed.');
      return;
    }

    state = view.state;
    if (persist) {
      persistIfPossible();
    }

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
      historyStack = ['orientation'];
      showingOutcomes = false;
      app.querySelectorAll('input[type="radio"]').forEach(function (input) {
        input.checked = false;
      });
      document.getElementById('plan-panel').hidden = true;
      document.getElementById('resume-box').hidden = true;
      showScreen('orientation');
      announce('Recovery started over. Answers cleared.');
    };
    if (session) {
      session.remove().then(reset).catch(reset);
    } else {
      reset();
    }
  }

  function goBack() {
    showingOutcomes = false;
    if (historyStack.length > 1) {
      historyStack.pop();
    }
    const previous = historyStack[historyStack.length - 1] || 'orientation';
    if (previous === 'orientation') {
      showScreen('orientation');
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
      announce('Step 1 of 3.');
      return;
    }

    const result = logic.answerQuestion(state, step, value);
    applyView(result, true);
  }

  document.getElementById('begin-recovery').addEventListener('click', function () {
    continueFrom('orientation');
  });

  document.getElementById('form-situation').addEventListener('submit', function (event) {
    event.preventDefault();
    const value = selectedValue(event.currentTarget, 'situation');
    if (value) continueFrom('situation', value);
  });

  document.getElementById('form-platform').addEventListener('submit', function (event) {
    event.preventDefault();
    const value = selectedValue(event.currentTarget, 'platform');
    if (value) continueFrom('platform', value);
  });

  document.getElementById('form-currentDevice').addEventListener('submit', function (event) {
    event.preventDefault();
    const value = selectedValue(event.currentTarget, 'currentDevice');
    if (value) continueFrom('currentDevice', value);
  });

  document.getElementById('form-question').addEventListener('submit', function (event) {
    event.preventDefault();
    const questionId = event.currentTarget.getAttribute('data-question-id');
    const value = selectedValue(event.currentTarget, 'dynamic-question');
    if (questionId && value) {
      applyView(logic.answerQuestion(state, questionId, value), true);
    }
  });

  app.addEventListener('click', function (event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.getAttribute('data-action');
    if (action === 'back') {
      goBack();
    } else if (action === 'start-over') {
      startOver();
    }
  });

  function boot() {
    showScreen('orientation');
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
