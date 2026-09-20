(function () {
  const logic = window.LostPhonesRecoveryLogic;
  if (!logic) {
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
    action: document.getElementById('screen-action')
  };

  let state = logic.createInitialState();
  let safeConfirmed = false;

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

  function startOver() {
    state = logic.createInitialState();
    safeConfirmed = false;
    app.querySelectorAll('input[type="radio"]').forEach(function (input) {
      input.checked = false;
    });
    showScreen('orientation');
    announce('Recovery started over. Answers cleared.');
  }

  function goBack() {
    safeConfirmed = false;
    state.blockedReason = null;
    state.currentActionId = null;

    if (state.step === 'situation') {
      state.step = 'orientation';
    } else if (state.step === 'platform') {
      state.step = 'situation';
    } else if (state.step === 'currentDevice') {
      state.step = 'platform';
    } else if (state.step === 'action' || state.step === 'auth-fallback') {
      state.step = 'currentDevice';
    } else {
      state.step = 'orientation';
    }

    showScreen(state.step === 'auth-fallback' ? 'action' : state.step);
    announce('Moved back.');
  }

  function continueFrom(step, value) {
    if (step === 'orientation') {
      state.step = 'situation';
      restoreChoice('situation', state.answers.situation);
      showScreen('situation');
      announce('Step 1 of 3.');
      return;
    }

    if (step === 'situation') {
      state.answers.situation = value;
      state.step = 'platform';
      restoreChoice('platform', state.answers.platform);
      showScreen('platform');
      announce('Step 2 of 3.');
      return;
    }

    if (step === 'platform') {
      state.answers.platform = value;
      state.step = 'currentDevice';
      restoreChoice('currentDevice', state.answers.currentDevice);
      showScreen('currentDevice');
      announce('Step 3 of 3.');
      return;
    }

    if (step === 'currentDevice') {
      state.answers.currentDevice = value;
      state.blockedReason = null;
      safeConfirmed = false;
      renderAction();
    }
  }

  function externalLink(href, label, leavingText) {
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    if (leavingText) {
      link.setAttribute('aria-describedby', 'leaving-note');
    }
    return link;
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

  function renderAction() {
    const result = logic.selectFirstAction(state);
    const title = document.getElementById('action-title');
    const reason = document.getElementById('action-reason');
    const instruction = document.getElementById('action-instruction');
    const caution = document.getElementById('action-caution');
    const leaving = document.getElementById('leaving-note');
    const support = document.getElementById('support-note');
    const controls = document.getElementById('action-controls');

    controls.innerHTML = '';
    leaving.hidden = true;
    support.hidden = true;

    if (!result.ok) {
      state.step = 'action';
      title.textContent = 'We need a complete answer set';
      reason.textContent = 'LostPhones will not guess the next step from incomplete or invalid answers.';
      instruction.textContent = 'Go back and choose one option on each screen.';
      caution.textContent = 'No official recovery service was selected.';
      renderPrivacy(null);
      showScreen('action');
      announce('The recovery answers are incomplete. No action was guessed.');
      return;
    }

    const record = result.content;
    state.currentActionId = result.actionId;
    state.step = result.actionId.indexOf('auth-fallback') !== -1 ? 'auth-fallback' : 'action';

    title.textContent = record.title;
    reason.textContent = record.reason;
    instruction.textContent = record.instruction;
    caution.textContent = record.caution;
    renderPrivacy(result.privacyGuidance);

    if (record.leavingLabel && record.officialUrl) {
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

    if (record.actionId === 'personal-safety' && !safeConfirmed) {
      const safeButton = document.createElement('button');
      safeButton.type = 'button';
      safeButton.className = 'btn btn-primary';
      safeButton.textContent = record.primaryControlLabel;
      safeButton.addEventListener('click', function () {
        safeConfirmed = true;
        renderAction();
        announce('Safety confirmed. Stay where you are.');
      });
      controls.appendChild(safeButton);
    } else if (record.actionId === 'personal-safety' && safeConfirmed) {
      const nextNote = document.createElement('p');
      nextNote.textContent = record.nextServiceName
        ? record.nextServiceName + ' is the next official service once you are safe. LostPhones is not adding further recovery steps in this guide yet.'
        : 'Stay safe. Identify the missing phone before using an official recovery service. LostPhones is not adding further recovery steps in this guide yet.';
      controls.appendChild(nextNote);
      if (record.officialUrl && record.nextServiceName) {
        controls.appendChild(externalLink(record.officialUrl, 'Open ' + record.nextServiceName, record.leavingLabel));
        leaving.textContent = record.leavingLabel;
        leaving.hidden = !record.leavingLabel;
      }
    } else if (record.officialUrl && record.primaryControlLabel) {
      controls.appendChild(externalLink(record.officialUrl, record.primaryControlLabel, record.leavingLabel));
    }

    if (record.secondaryOfficialUrl) {
      if (record.secondaryLeavingLabel) {
        const secondLeave = document.createElement('p');
        secondLeave.className = 'leaving-note';
        secondLeave.textContent = record.secondaryLeavingLabel;
        controls.appendChild(secondLeave);
      }
      controls.appendChild(externalLink(record.secondaryOfficialUrl, record.secondaryOfficialLabel, record.secondaryLeavingLabel));
    }

    if (record.authRelevant && state.blockedReason !== 'cannot-sign-in' && (record.actionId !== 'personal-safety' || safeConfirmed)) {
      const authButton = document.createElement('button');
      authButton.type = 'button';
      authButton.className = 'btn btn-secondary';
      authButton.textContent = 'I can’t sign in';
      authButton.addEventListener('click', function () {
        state.blockedReason = 'cannot-sign-in';
        renderAction();
        announce('Official account recovery options are shown. LostPhones still will not ask for a password.');
      });
      controls.appendChild(authButton);
    }

    showScreen('action');
    announce(record.title);
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

  showScreen('orientation');
})();
