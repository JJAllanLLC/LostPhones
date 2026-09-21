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

  const CONSUMER_STAGES = [
    {
      id: 'find',
      label: 'Find or secure phone',
      kicker: 'Find your phone',
      fallback: 'Locate or secure the missing phone',
      ids: PROGRESS_STAGES[0].ids.concat(PROGRESS_STAGES[1].ids)
    },
    {
      id: 'protect',
      label: 'Protect access',
      kicker: 'Protect access',
      fallback: 'Secure your account',
      ids: PROGRESS_STAGES[2].ids
    },
    {
      id: 'review',
      label: 'Review and finish',
      kicker: 'Review and finish',
      fallback: 'Check your results and next steps',
      ids: PROGRESS_STAGES[3].ids
    }
  ];

  const STEP_ICONS = {
    open: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.8"/><path d="M14.7 9.3 11.2 10.8 9.3 14.7l3.5-1.5 1.9-3.9Z" fill="currentColor"/></svg>',
    device: '<svg viewBox="0 0 24 24" fill="none"><rect x="8" y="3.5" width="8" height="17" rx="1.8" stroke="currentColor" stroke-width="1.9"/><path d="M11 17.6h2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.6 9.6v4.8h3.3L12.6 18V6L7.9 9.6H4.6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.5 9.1a3.5 3.5 0 0 1 0 5.8M17.8 7a6.5 6.5 0 0 1 0 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    return: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H7.5M11.5 7.5 7 12l4.5 4.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  const OUTCOME_ICONS = {
    nearby: { tone: 'signal', svg: '<svg viewBox="0 0 24 24" fill="none"><circle cx="6.6" cy="12" r="1.55" fill="currentColor"/><path d="M10.2 8.6a5.4 5.4 0 0 1 0 6.8M13.6 6.3a9 9 0 0 1 0 11.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>' },
    heard_nearby: { tone: 'signal', svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.6 9.6v4.8h3.3L12.6 18V6L7.9 9.6H4.6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.5 9.1a3.5 3.5 0 0 1 0 5.8M17.8 7a6.5 6.5 0 0 1 0 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
    located_safe: { tone: 'safe', svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 21s-6.2-5.4-6.2-10.1A6.2 6.2 0 0 1 12 4.7a6.2 6.2 0 0 1 6.2 6.2C18.2 15.6 12 21 12 21Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10.8" r="2.15" stroke="currentColor" stroke-width="1.8"/></svg>' },
    located_unsafe: { tone: 'alert', svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4.4 20.2 19H3.8L12 4.4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9.6v4.3M12 16.6v.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>' },
    offline: { tone: 'device', svg: '<svg viewBox="0 0 24 24" fill="none"><rect x="8" y="3.5" width="8" height="17" rx="1.8" stroke="currentColor" stroke-width="1.9"/><path d="M11 17.6h2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>' },
    not_found: { tone: 'hidden', svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M3.2 12s3.7-6.4 8.8-6.4 8.8 6.4 8.8 6.4-3.7 6.4-8.8 6.4S3.2 12 3.2 12Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.25" stroke="currentColor" stroke-width="1.8"/><path d="m4.4 19.2 15.2-14.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
    not_heard: { tone: 'hidden', svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.6 9.6v4.8h3.3L12.6 18V6L7.9 9.6H4.6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m4 5 16 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' }
  };

  const OUTCOME_CHEVRON = '<svg viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
    const stepLabel = document.getElementById('triage-step-label');
    const head = document.getElementById('recovery-progress');
    if (!bar) return;
    const index = { situation: 1, platform: 2, currentDevice: 3 }[step] || 0;
    bar.hidden = !index;
    if (stepLabel) {
      stepLabel.hidden = !index;
      if (index) stepLabel.textContent = 'STEP ' + index + ' OF 3';
    }
    if (head) head.hidden = !index;
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

    const isTriage = !!questionSteps[step];
    document.body.setAttribute('data-recovery-phase', isTriage || step === 'orientation' ? 'triage' : 'action');
    if (step !== 'action') {
      document.body.setAttribute('data-recovery-return', '0');
      document.body.setAttribute('data-recovery-complete', '0');
    }

    if (isTriage) {
      progress.hidden = false;
      progress.textContent = 'Three quick questions';
    } else if (step === 'orientation') {
      progress.hidden = false;
      progress.textContent = 'Three quick questions, then your safest next step.';
    } else {
      progress.hidden = true;
    }
    setTriageProgress(step);

    if (step === 'action') {
      const focusNode = document.getElementById('action-title');
      if (focusNode) focusNode.focus();
    }
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
      if (item.blockedReason === 'service_unavailable' || item.blockedReason === 'waiting_for_provider') {
        return 'Retry later';
      }
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

  function shortActionDetail(record) {
    if (!record) return '';
    if (record.progressDetail) return record.progressDetail;
    if (!record.title) return '';
    return record.title.split(' through ')[0];
  }

  function setActionTitle(el, text) {
    if (!el) return;
    el.textContent = '';
    const parts = String(text || '').split(' through ');
    if (parts.length === 2) {
      el.appendChild(document.createTextNode(parts[0]));
      el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode('through ' + parts[1]));
      return;
    }
    el.textContent = text || '';
  }

  function stageDetail(stage, status, record) {
    if (status === 'Current' && record) return shortActionDetail(record);
    if (stage.id === 'protect') {
      if (state.answers.platform === 'unsure') return 'Protect the account connected to the missing phone';
      return state.answers.platform === 'android' ? 'Secure your Google account' : 'Secure your Apple account';
    }
    if (stage.id === 'find' && record && stage.ids.indexOf(record.actionId) !== -1) return shortActionDetail(record);
    return stage.fallback;
  }

  function renderProgress(currentId, complete, record) {
    const rail = document.getElementById('progress-rail');
    const stagesEl = document.getElementById('progress-stages');
    const kicker = document.getElementById('progress-kicker');
    const stepLabel = document.getElementById('action-step-label');
    const bar = document.getElementById('action-journey-progress');
    const actionKicker = document.getElementById('action-kicker');
    if (!rail || !stagesEl) return;
    stagesEl.innerHTML = '';
    let currentIndex = 0;
    CONSUMER_STAGES.forEach(function (stage, index) {
      const status = complete ? (index < CONSUMER_STAGES.length - 1 ? 'Done' : 'Current') : stageStatus(stage, currentId);
      if (status === 'Current') currentIndex = index;
      if (status === 'Done' && index >= currentIndex && !complete) currentIndex = index;
      const row = document.createElement('div');
      row.className = 'progress-stage';
      if (status === 'Done') row.classList.add('is-done');
      if (status === 'Current') row.classList.add('is-current');
      if (status === 'Needs attention') row.classList.add('is-attention');
      const num = document.createElement('span');
      num.className = 'progress-stage-num';
      num.textContent = String(index + 1);
      const copy = document.createElement('div');
      copy.className = 'progress-stage-copy';
      const name = document.createElement('strong');
      name.textContent = stage.label;
      const detail = document.createElement('span');
      detail.textContent = stageDetail(stage, status, record);
      copy.appendChild(name);
      copy.appendChild(detail);
      row.appendChild(num);
      row.appendChild(copy);
      stagesEl.appendChild(row);
    });
    if (kicker) kicker.textContent = complete ? 'You are safer now' : "You're making progress";
    if (stepLabel) {
      stepLabel.hidden = false;
      stepLabel.textContent = 'STEP ' + (currentIndex + 1) + ' OF 3';
    }
    if (bar) {
      bar.querySelectorAll('.segment').forEach(function (seg) {
        const n = Number(seg.getAttribute('data-journey'));
        seg.classList.toggle('is-current', n === currentIndex + 1);
        seg.classList.toggle('is-done', n < currentIndex + 1);
      });
    }
    if (actionKicker) actionKicker.textContent = CONSUMER_STAGES[currentIndex].kicker;
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
    const complete = document.body.getAttribute('data-recovery-complete') === '1';
    const label = statusLabel(plan.status);
    if (label && !complete) {
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
      copy.textContent = 'On your own phone, tablet, or computer you can save a private resume token for seven days, or copy a resume link.';
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

  function whyLedeText(record) {
    if (!record) return 'Learn why this step helps.';
    if (/play a sound/i.test(record.title || '')) {
      return record.platform === 'android'
        ? 'Learn how playing a sound can help you find your phone.'
        : 'Learn how playing a sound can help you find your iPhone.';
    }
    return 'Learn why this step helps you recover safely.';
  }

  function sourceLedeText(record) {
    if (!record) return 'Official recovery service';
    if (record.officialProvider === 'Apple') return 'Apple Find Devices (iCloud.com)';
    if (record.officialProvider === 'Google') return 'Google Find Hub';
    return record.officialProvider ? record.officialProvider + ' official service' : 'Official recovery service';
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

  function renderSteps(source) {
    const list = document.getElementById('action-steps');
    const fallback = document.getElementById('action-instruction');
    list.innerHTML = '';
    const record = source && typeof source === 'object' ? source : null;
    const text = record ? record.instruction : source;
    const structured = record && record.instructionSteps && record.instructionSteps.length
      ? record.instructionSteps
      : splitSteps(text).map(function (step, index) {
        const icons = ['open', 'device', 'sound', 'return'];
        return { icon: icons[index] || 'open', title: step, body: '' };
      });
    if (!structured.length) {
      fallback.hidden = true;
      fallback.textContent = text || '';
      list.hidden = true;
      return;
    }
    fallback.hidden = true;
    list.hidden = false;
    structured.forEach(function (step, index) {
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'action-step-num';
      num.textContent = String(index + 1);
      const icon = document.createElement('span');
      icon.className = 'action-step-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = STEP_ICONS[step.icon] || STEP_ICONS.open;
      const copy = document.createElement('span');
      copy.className = 'action-step-copy';
      const title = document.createElement('strong');
      title.textContent = step.title;
      copy.appendChild(title);
      if (step.body) {
        const body = document.createElement('span');
        body.textContent = step.body;
        copy.appendChild(body);
      }
      li.appendChild(num);
      li.appendChild(icon);
      li.appendChild(copy);
      list.appendChild(li);
    });
  }

  function presentCaution(text) {
    return String(text || '').replace(/\bThis (computer|phone|device) cannot\b/i, 'This device cannot');
  }

  let lastCaution = '';

  function renderCaution(text) {
    if (arguments.length) lastCaution = text || '';
    const box = document.getElementById('action-caution');
    const title = document.getElementById('action-caution-title');
    const body = document.getElementById('action-caution-body');
    const presented = presentCaution(lastCaution);
    if (!box || !title) return;
    if (!presented) {
      box.hidden = true;
      return;
    }
    const parts = presented.split('. ');
    const heading = parts.shift() || presented;
    title.textContent = /[.!?]$/.test(heading) ? heading : heading + '.';
    if (body) {
      const rest = parts.join('. ').trim();
      body.textContent = rest;
      body.hidden = !rest;
    }
    box.hidden = false;
  }

  function renderHelp(record) {
    const cards = document.querySelectorAll('.action-help-card');
    const sound = record && record.boundedOutcomes && record.boundedOutcomes.some(function (outcome) {
      return outcome.id === 'not_heard';
    });
    cards.forEach(function (card) {
      card.hidden = !sound;
    });
    if (!sound) return;
    document.querySelectorAll('.action-help-title').forEach(function (title) {
      title.textContent = "Can't hear the sound?";
    });
    document.querySelectorAll('.action-help-copy').forEach(function (copy) {
      copy.textContent = "If you don't hear it, we'll help you try other options next.";
    });
  }

  function hasOfficialDestination(record) {
    return !!(record && content.isOfficialUrl(record.officialUrl));
  }

  function isManualExternal(record) {
    return !!(record && record.requiresExternalReturn && !hasOfficialDestination(record));
  }

  function internalControl(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function externalLink(href, label, leavingText, actionId) {
    if (!content.isOfficialUrl(href)) return null;
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    link.appendChild(labelEl);
    const icon = document.createElement('span');
    icon.className = 'external-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M14 5h5v5M19 5 10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6.5A1.5 1.5 0 0 1 6 5h4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    link.appendChild(icon);
    const sr = document.createElement('span');
    sr.className = 'live-region';
    sr.textContent = ' Opens in a new tab';
    link.appendChild(sr);
    if (leavingText) link.setAttribute('aria-describedby', 'action-keep-open');
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
    button.className = 'outcome-row';
    button.setAttribute('data-outcome', outcome.id);
    const iconMeta = OUTCOME_ICONS[outcome.id] || { tone: 'device', svg: STEP_ICONS.device };
    const icon = document.createElement('span');
    icon.className = 'outcome-icon is-' + iconMeta.tone;
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iconMeta.svg;
    const copy = document.createElement('span');
    copy.className = 'outcome-copy';
    const title = document.createElement('strong');
    title.textContent = SHORT_OUTCOMES[outcome.id] || outcome.label;
    copy.appendChild(title);
    if (outcome.label && outcome.label !== title.textContent) {
      const help = document.createElement('span');
      help.className = 'outcome-help';
      help.textContent = outcome.label;
      copy.appendChild(help);
    }
    const chevron = document.createElement('span');
    chevron.className = 'outcome-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = OUTCOME_CHEVRON;
    button.appendChild(icon);
    button.appendChild(copy);
    button.appendChild(chevron);
    button.addEventListener('click', function () {
      const result = logic.recordOutcome(state, action.actionId, outcome.id);
      showingOutcomes = false;
      applyView(result, true);
    });
    return button;
  }

  function renderOutcomes(action, returnMode) {
    const box = document.getElementById('outcome-box');
    const heading = document.getElementById('outcome-heading');
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
    heading.textContent = 'What did you find?';
    heading.hidden = !!returnMode;
    prompt.textContent = action.returnPrompt || 'Choose the closest result. LostPhones does not infer success from a new tab.';
    prompt.hidden = !!returnMode;
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

  function completeLede(current) {
    if (current.status === 'recovered') {
      return 'The phone is with you. Use the short summary below, then choose what to do next.';
    }
    if (current.status === 'stabilized_with_blockers') {
      return logic.hasCriticalBlocker(current)
        ? 'A critical step still needs attention. Your free summary stays available.'
        : 'Immediate risks are contained. A waiting step still needs an official service or the owner.';
    }
    return 'Immediate risks are contained. Your free summary is ready.';
  }

  function appendSummaryGroup(groups, title, items, limit) {
    const section = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = title;
    const ul = document.createElement('ul');
    ul.className = 'plan-list complete-summary-list';
    const visible = items.slice(0, limit);
    const remainder = items.length - visible.length;
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = 'None recorded';
      ul.appendChild(li);
    } else {
      visible.forEach(function (item) {
        const li = document.createElement('li');
        li.textContent = item.title;
        ul.appendChild(li);
      });
      if (remainder > 0) {
        const li = document.createElement('li');
        li.className = 'complete-more';
        li.textContent = '+' + remainder + ' more in the full plan';
        ul.appendChild(li);
      }
    }
    section.appendChild(h);
    section.appendChild(ul);
    groups.appendChild(section);
  }

  function renderCompleteSummary() {
    const box = document.getElementById('complete-summary');
    const groups = document.getElementById('complete-groups');
    const eraseSlot = document.getElementById('review-erase-slot');
    const blockerBox = document.getElementById('blocker-ack');
    const blockerCopy = document.getElementById('blocker-ack-copy');
    const plan = logic.buildPlan(state);
    const all = [].concat(plan.now, plan.next, plan.later).filter(function (item) {
      return item.actionId !== 'recovered-device-security-check';
    });
    const secured = all.filter(function (item) { return item.status === 'completed'; });
    const attention = all.filter(function (item) { return item.status === 'blocked'; });
    const later = all.filter(function (item) { return item.status === 'pending' || item.status === 'skipped'; });
    groups.innerHTML = '';
    appendSummaryGroup(groups, 'Secured', secured, 3);
    appendSummaryGroup(groups, 'Still needs attention', attention, 4);
    appendSummaryGroup(groups, 'Can wait', later, 3);
    const eraseStatus = state.actions['erase-device-decision'] && state.actions['erase-device-decision'].status;
    const canErase = logic.isEraseAvailable(state) && eraseStatus !== 'completed' && eraseStatus !== 'active';
    if (canErase) {
      eraseSlot.hidden = false;
      eraseSlot.removeAttribute('disabled');
      eraseSlot.removeAttribute('aria-hidden');
      eraseSlot.removeAttribute('tabindex');
      eraseSlot.textContent = 'Review erase option';
      eraseSlot.onclick = function () {
        applyView(logic.reviewErase(state), true);
      };
    } else {
      eraseSlot.hidden = true;
      eraseSlot.setAttribute('disabled', 'disabled');
      eraseSlot.setAttribute('aria-hidden', 'true');
      eraseSlot.tabIndex = -1;
      eraseSlot.textContent = 'Review erase option';
      eraseSlot.onclick = null;
    }
    const blockers = logic.listCriticalBlockers(state);
    if (blockerBox && blockerCopy) {
      if (blockers.length && !state.criticalBlockerAcknowledged) {
        blockerCopy.textContent = blockers.map(function (item) { return item.copy; }).join(' ');
        blockerBox.hidden = false;
      } else {
        blockerBox.hidden = true;
      }
    }
    box.hidden = false;
  }

  function renderAction(view) {
    const record = view.action;
    const title = document.getElementById('action-title');
    const reason = document.getElementById('action-reason');
    const leaving = document.getElementById('leaving-note');
    const keepOpen = document.getElementById('action-keep-open');
    const support = document.getElementById('support-note');
    const supportDetails = document.getElementById('support-details');
    const controls = document.getElementById('action-controls');
    const awaiting = document.getElementById('awaiting-banner');
    const awaitingTitle = document.getElementById('awaiting-title');
    const againSlot = document.getElementById('return-again-slot');
    const imBack = document.getElementById('im-back');
    const complete = document.getElementById('complete-summary');
    const why = document.getElementById('why-copy');
    const moreDetails = document.getElementById('more-details');
    const wasReturn = document.body.getAttribute('data-recovery-return') === '1';

    controls.innerHTML = '';
    if (againSlot) againSlot.innerHTML = '';
    leaving.hidden = true;
    if (keepOpen) keepOpen.hidden = true;
    supportDetails.hidden = true;
    document.getElementById('outcome-box').hidden = true;
    complete.hidden = true;
    document.body.setAttribute('data-recovery-return', '0');
    document.body.setAttribute('data-recovery-complete', '0');

    if (!record) {
      document.body.setAttribute('data-recovery-complete', '1');
      document.getElementById('action-kicker').textContent = 'Finished';
      setActionTitle(title, 'Emergency recovery is complete.');
      reason.textContent = completeLede(state);
      renderSteps('');
      renderCaution('');
      awaiting.hidden = true;
      if (moreDetails) {
        moreDetails.open = false;
        const summaryStrong = moreDetails.querySelector('.more-details-summary strong');
        const summarySpan = moreDetails.querySelector('.more-details-summary span');
        if (summaryStrong) summaryStrong.textContent = 'Full recovery plan';
        if (summarySpan) summarySpan.textContent = 'Open only if you want every remaining detail.';
      }
      renderHelp(null);
      renderCompleteSummary();
      renderPrivacy(content.privacyGuidance[state.answers.currentDevice]);
      renderProgress(null, true, null);
      renderPlan(false);
      renderResume();
      renderPaidOffer();
      showScreen('action');
      announce(title.textContent);
      return;
    }

    if (moreDetails) {
      const summaryStrong = moreDetails.querySelector('.more-details-summary strong');
      const summarySpan = moreDetails.querySelector('.more-details-summary span');
      if (summaryStrong) summaryStrong.textContent = 'More details';
      if (summarySpan) summarySpan.textContent = 'Helpful information about this step.';
    }

    document.getElementById('action-kicker').textContent = 'Current step';
    setActionTitle(title, record.title);
    if (record.actionId === 'apple-auth-fallback' || record.actionId === 'google-auth-fallback') {
      const service = record.nextServiceName || (record.actionId.indexOf('apple') === 0 ? 'Apple Account Recovery' : 'Google Account Recovery');
      reason.textContent = 'You could not sign in, but you still have a safe next step. Use ' + service + ', then come back here.';
    } else {
      reason.textContent = record.reason;
    }
    renderSteps(record);
    renderCaution(record.caution);
    renderHelp(record);
    why.textContent = record.reason;
    const whyLede = document.getElementById('why-lede');
    if (whyLede) whyLede.textContent = whyLedeText(record);
    renderPrivacy(content.privacyGuidance[state.answers.currentDevice]);

    const officialHandoff = hasOfficialDestination(record);
    const awaitingReturn = !!(view.awaitingReturn && officialHandoff);
    if (awaitingReturn) showingOutcomes = true;
    const returnMode = awaitingReturn;
    const manualOutcomeMode = !!(showingOutcomes && isManualExternal(record));
    document.body.setAttribute('data-recovery-return', returnMode ? '1' : '0');
    if (moreDetails) {
      if (returnMode) moreDetails.open = false;
      else if (wasReturn) moreDetails.open = true;
    }

    awaiting.hidden = !returnMode;
    if (returnMode) {
      const service = record.nextServiceName || record.officialProvider || 'The official service';
      if (awaitingTitle) awaitingTitle.textContent = service + ' opened in a new tab. Welcome back.';
      document.getElementById('awaiting-copy').textContent = 'Let us know what you found so we can guide you to the next step.';
      setActionTitle(title, 'What did you find?');
      reason.textContent = record.returnPrompt || 'Back from the official service? Tell us what you found. LostPhones does not infer a location from the tab opening.';
      renderHelp(null);
    }

    if (!awaitingReturn && record.leavingLabel && officialHandoff) {
      leaving.textContent = record.leavingLabel;
      leaving.hidden = true;
      if (keepOpen) keepOpen.hidden = returnMode;
    } else if (keepOpen) {
      keepOpen.hidden = true;
    }

    const supportLede = document.getElementById('support-lede');
    if (supportLede) supportLede.textContent = sourceLedeText(record);
    if (record.supportSourceUrl || officialHandoff) {
      const supportHref = record.supportSourceUrl || record.officialUrl;
      if (content.isOfficialUrl(supportHref)) {
        const supportLink = document.createElement('a');
        supportLink.href = supportHref;
        supportLink.target = '_blank';
        supportLink.rel = 'noopener noreferrer';
        supportLink.textContent = record.supportSourceUrl
          ? 'Official support article (opens in a new tab)'
          : (record.primaryControlLabel || 'Official service') + ' (opens in a new tab)';
        support.textContent = '';
        support.appendChild(supportLink);
        supportDetails.hidden = false;
      }
    }

    if (!returnMode) {
      if (record.actionId === 'personal-safety') {
        controls.appendChild(internalControl('I’m somewhere safe now', 'btn btn-primary', function () {
          showingOutcomes = false;
          applyView(logic.recordOutcome(state, 'personal-safety', 'safe'), true);
        }));
        controls.appendChild(internalControl('I still need to get to safety', 'btn btn-secondary', function () {
          showingOutcomes = false;
          applyView(logic.recordOutcome(state, 'personal-safety', 'still_unsafe'), true);
        }));
      } else if (officialHandoff && record.primaryControlLabel) {
        const official = externalLink(record.officialUrl, record.primaryControlLabel, record.leavingLabel, record.actionId);
        if (official) controls.appendChild(official);
      } else if (isManualExternal(record)) {
        if (manualOutcomeMode) {
          renderOutcomes(record, false);
        } else {
          controls.appendChild(internalControl('I finished in the official app or site', 'btn btn-primary', function () {
            showingOutcomes = true;
            renderAction(view);
            announce(record.returnPrompt || 'Choose the closest result.');
          }));
        }
      } else if (record.boundedOutcomes && record.boundedOutcomes.length) {
        renderOutcomes(record, false);
      }

      if (record.secondaryOfficialUrl && content.isOfficialUrl(record.secondaryOfficialUrl)) {
        const secondary = externalLink(record.secondaryOfficialUrl, record.secondaryOfficialLabel, record.secondaryLeavingLabel, record.actionId);
        if (secondary) controls.appendChild(secondary);
      }
    }

    if (returnMode) {
      const again = externalLink(record.officialUrl, 'Open again', record.leavingLabel, record.actionId);
      if (again) {
        again.className = 'return-again';
        if (againSlot) againSlot.appendChild(again);
        else controls.appendChild(again);
      }
      renderOutcomes(record, true);
    }

    imBack.onclick = function () {
      showingOutcomes = true;
      renderAction(view);
      announce('Back from the official service? Tell us what you found.');
      if (title) title.focus();
    };

    renderProgress(record.actionId, false, record);
    renderPlan(false);
    renderResume();
    hidePaidOffer();
    showScreen('action');
    announce(returnMode ? (record.nextServiceName || record.officialProvider || 'The official service') + ' opened in a new tab. Welcome back. Tell us what you found.' : record.title);
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
      setActionTitle(document.getElementById('action-title'), 'We need a complete answer set');
      document.getElementById('action-reason').textContent = 'LostPhones will not guess the next step from incomplete or invalid answers.';
      renderSteps('Go back and choose one option on each screen.');
      renderCaution('No official recovery service was selected.');
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
      announce('Continuing with the free recovery plan. You can still protect your phone for next time.');
    });
  }

  const acknowledgeBlocker = document.getElementById('acknowledge-blocker');
  if (acknowledgeBlocker) {
    acknowledgeBlocker.addEventListener('click', function () {
      applyView(logic.acknowledgeCriticalBlocker(state), true);
      announce('Remaining critical step noted. The optional plan is available if you want it.');
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

  (function bindRecoveryMenu() {
    const toggle = document.getElementById('emergency-menu-toggle');
    const nav = document.getElementById('emergency-nav');
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('emergency-nav-open', open);
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 960px)').matches) setOpen(false);
    });
  })();

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
