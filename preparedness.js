(function () {
  const logic = window.LostPhonesPreparednessLogic;
  const content = window.LostPhonesPreparednessContent;
  const registry = window.LostPhonesPreparednessRecommendations;
  const analytics = window.LostPhonesAnalytics;
  const app = document.getElementById('preparedness-app');
  if (!logic || !content || !app) return;

  let state = logic.createInitialState();
  const historyStack = ['orientation'];
  let started = false;
  let completed = false;

  function announce(message) {
    document.getElementById('status-live').textContent = message;
  }

  function track(eventName, properties) {
    if (analytics && typeof analytics.track === 'function') {
      analytics.track(eventName, properties);
    }
  }

  function showScreen(id) {
    document.getElementById('screen-orientation').hidden = id !== 'orientation';
    document.getElementById('screen-question').hidden = id !== 'question';
    document.getElementById('screen-results').hidden = id !== 'results';
    document.body.setAttribute('data-prep-phase', id);
    const progress = document.getElementById('progress-label');
    const rail = document.getElementById('prep-progress');
    const questionIndex = logic.QUESTION_ORDER.indexOf(state.step);
    const stepNum = id === 'results' ? 5 : id === 'question' && questionIndex >= 0 ? questionIndex + 1 : 1;
    if (rail) {
      rail.hidden = false;
      Array.prototype.forEach.call(rail.querySelectorAll('.segment'), function (seg, index) {
        const n = index + 1;
        if (id === 'results') {
          seg.classList.toggle('is-done', true);
          seg.classList.toggle('is-current', false);
        } else {
          seg.classList.toggle('is-current', n === stepNum);
          seg.classList.toggle('is-done', n < stepNum);
        }
      });
    }
    if (progress) {
      progress.hidden = false;
      progress.textContent = 'STEP ' + stepNum + ' OF 5';
    }
    const focusId = id === 'orientation' ? 'orientation-title' : id === 'results' ? 'results-title' : 'legend-question';
    const focusRoot = document.getElementById(focusId);
    const focusEl = focusRoot && focusRoot.querySelector ? (focusRoot.querySelector('h1') || focusRoot) : focusRoot;
    if (focusEl && typeof focusEl.focus === 'function') focusEl.focus();
  }

  function syncChoiceStyles(form) {
    if (!form) return;
    form.querySelectorAll('.choice').forEach(function (label) {
      const input = label.querySelector('input');
      label.classList.toggle('is-selected', !!(input && input.checked));
    });
  }

  function enableContinue(form) {
    const submit = document.getElementById('continue-preparedness');
    if (!form || !submit) return;
    submit.disabled = !form.querySelector('input[type="radio"]:checked');
  }

  function renderQuestion(questionId) {
    const question = content.getQuestion(questionId);
    if (!question) return;
    const heading = document.getElementById('legend-question').querySelector('h1') || document.getElementById('legend-question');
    heading.textContent = question.title;
    document.getElementById('question-help').textContent = question.help || '';
    const holder = document.getElementById('question-choices');
    const form = document.getElementById('form-question');
    holder.innerHTML = '';
    question.choices.forEach(function (choice) {
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'preparedness-question';
      input.value = choice.id;
      input.required = true;
      if ((questionId === 'platform' && state.platform === choice.id) || state.answers[questionId] === choice.id) {
        input.checked = true;
      }
      const copy = document.createElement('span');
      copy.className = 'choice-copy';
      const title = document.createElement('strong');
      title.textContent = choice.label;
      copy.appendChild(title);
      label.appendChild(input);
      label.appendChild(copy);
      holder.appendChild(label);
    });
    form.setAttribute('data-question-id', questionId);
    state.step = questionId;
    syncChoiceStyles(form);
    enableContinue(form);
    showScreen('question');
    announce(question.title);
  }

  function statusLabel(value) {
    if (value === 'protected') return 'Protected';
    if (value === 'needs_setup') return 'Needs setup';
    if (value === 'not_sure') return 'Not sure';
    if (value === 'not_applicable') return 'Not applicable';
    return 'Not assessed';
  }

  function appendRecommendation(parent, record, primary) {
    const article = document.createElement('article');
    article.className = 'recommendation-card';
    const heading = document.createElement('h3');
    heading.textContent = record.title;
    const copy = document.createElement('p');
    copy.textContent = record.copy;
    const link = document.createElement('a');
    link.className = primary ? 'btn btn-primary' : 'btn btn-secondary';
    link.href = record.destinationUrl;
    link.target = '_blank';
    link.rel = registry.linkRel(record);
    link.textContent = record.commercialType === 'amazon_associate'
      ? 'Browse ' + record.title.toLowerCase() + ' on Amazon'
      : 'Open official ' + record.providerName + ' guide';
    link.addEventListener('click', function () {
      track('preparedness_recommendation_clicked', {
        recommendationId: record.id,
        commercialType: record.commercialType
      });
    });
    article.appendChild(heading);
    article.appendChild(copy);
    article.appendChild(link);
    if (record.commercialType === 'amazon_associate') {
      const disclosure = document.createElement('p');
      disclosure.className = 'disclosure';
      disclosure.textContent = record.disclosure || content.CARD_DISCLOSURE;
      article.appendChild(disclosure);
    }
    parent.appendChild(article);
    track('preparedness_recommendation_displayed', {
      recommendationId: record.id,
      commercialType: record.commercialType
    });
  }

  function renderResults() {
    const mapped = logic.mapResults(state);
    state = mapped;
    const lead = logic.leadCategory(state);
    const split = logic.splitRecommendations(state);
    const overview = document.getElementById('results-overview');
    const first = document.getElementById('first-action');
    const nextSection = document.getElementById('recommended-next');
    const nextList = document.getElementById('recommended-next-list');
    const productSection = document.getElementById('optional-products');
    const productList = document.getElementById('optional-products-list');
    const disclosure = document.getElementById('page-disclosure');
    overview.innerHTML = '';
    first.innerHTML = '';
    nextList.innerHTML = '';
    productList.innerHTML = '';

    const leadCategory = lead ? content.getCategory(lead.categoryId) : null;
    if (leadCategory) {
      const kicker = document.createElement('p');
      kicker.className = 'kicker';
      kicker.textContent = content.leadKicker(lead.kind);
      const heading = document.createElement('h2');
      heading.textContent = leadCategory.title;
      const copy = document.createElement('p');
      copy.textContent = content.resultCopy(leadCategory, lead.kind, state.answers[leadCategory.answerId]);
      first.appendChild(kicker);
      first.appendChild(heading);
      first.appendChild(copy);
      const leadOfficial = split.official.filter(function (record) {
        return record.gap === lead.categoryId;
      });
      leadOfficial.forEach(function (record) {
        appendRecommendation(first, record, true);
      });
      if (lead.kind === 'needs_setup') track('preparedness_gap_identified', { category: lead.categoryId });
    }

    const remainingIds = logic.remainingCategories(state, lead && lead.categoryId);
    remainingIds.forEach(function (id) {
      if (state.results[id] === 'needs_setup') track('preparedness_gap_identified', { category: id });
    });
    const remainingOfficial = split.official.filter(function (record) {
      return !lead || record.gap !== lead.categoryId;
    });
    remainingOfficial.forEach(function (record) {
      appendRecommendation(nextList, record, false);
    });
    remainingIds.forEach(function (id) {
      if (remainingOfficial.some(function (record) { return record.gap === id; })) return;
      const category = content.getCategory(id);
      if (!category) return;
      const note = document.createElement('article');
      note.className = 'recommendation-card';
      const heading = document.createElement('h3');
      heading.textContent = category.title;
      const copy = document.createElement('p');
      copy.textContent = content.resultCopy(category, state.results[id], state.answers[category.answerId]);
      note.appendChild(heading);
      note.appendChild(copy);
      if (id === 'travel_connectivity' && state.results[id] === 'needs_setup') {
        const extra = document.createElement('p');
        extra.className = 'plan-intro';
        extra.textContent = content.NEUTRAL_MISSING;
        note.appendChild(extra);
      }
      nextList.appendChild(note);
    });
    if (lead && lead.categoryId === 'travel_connectivity' && lead.kind === 'needs_setup' && !split.official.some(function (record) {
      return record.gap === 'travel_connectivity';
    })) {
      const extra = document.createElement('p');
      extra.className = 'plan-intro';
      extra.textContent = content.NEUTRAL_MISSING;
      first.appendChild(extra);
    }
    nextSection.hidden = !nextList.childNodes.length;

    productSection.hidden = !split.products.length;
    split.products.forEach(function (record) {
      appendRecommendation(productList, record, false);
    });

    const ranked = content.CATEGORIES.slice().sort(function (a, b) {
      const order = { needs_setup: 0, not_sure: 1, protected: 2, not_applicable: 3 };
      return (order[state.results[a.id]] == null ? 9 : order[state.results[a.id]])
        - (order[state.results[b.id]] == null ? 9 : order[state.results[b.id]]);
    });
    ranked.forEach(function (category) {
      const result = state.results[category.id];
      const row = document.createElement('div');
      row.className = 'overview-row is-' + result;
      const label = document.createElement('span');
      label.textContent = category.title;
      const status = document.createElement('span');
      status.className = 'status-pill' + (result === 'protected' ? ' is-secured' : result === 'needs_setup' ? ' is-attention' : '');
      status.textContent = statusLabel(result);
      row.appendChild(label);
      row.appendChild(status);
      overview.appendChild(row);
    });

    const counts = { needs_setup: 0, not_sure: 0, protected: 0, not_applicable: 0 };
    ranked.forEach(function (category) {
      const result = state.results[category.id];
      if (counts[result] != null) counts[result] += 1;
    });
    const summary = document.getElementById('results-summary');
    if (summary) {
      let text = counts.needs_setup + ' area' + (counts.needs_setup === 1 ? '' : 's') + ' need setup / '
        + counts.not_sure + ' area' + (counts.not_sure === 1 ? '' : 's') + ' to verify / '
        + counts.protected + ' area' + (counts.protected === 1 ? '' : 's') + ' protected';
      if (counts.not_applicable) {
        text += ' / ' + counts.not_applicable + ' not applicable';
      }
      summary.textContent = text;
    }

    if (split.showAmazonDisclosure) {
      disclosure.hidden = false;
      disclosure.textContent = content.PAGE_DISCLOSURE;
    } else {
      disclosure.hidden = true;
      disclosure.textContent = '';
    }

    showScreen('results');
    announce('Your safety plan is ready.');
    if (!completed) {
      completed = true;
      track('preparedness_completed');
    }
  }

  function applyView(view) {
    if (!view || !view.ok) {
      announce('Choose one option to continue.');
      return;
    }
    state = view.state;
    if (view.type === 'question') {
      historyStack.push(view.questionId);
      renderQuestion(view.questionId);
      return;
    }
    historyStack.push('results');
    renderResults();
  }

  function selectedValue(form) {
    const input = form.querySelector('input[name="preparedness-question"]:checked');
    return input ? input.value : null;
  }

  function startOver() {
    state = logic.createInitialState();
    historyStack.length = 0;
    historyStack.push('orientation');
    started = false;
    completed = false;
    showScreen('orientation');
    announce('Preparedness started over.');
  }

  function goBack() {
    if (historyStack.length > 1) historyStack.pop();
    const previous = historyStack[historyStack.length - 1] || 'orientation';
    if (previous === 'orientation') {
      showScreen('orientation');
      announce('Moved back.');
      return;
    }
    if (previous === 'results') {
      renderResults();
      return;
    }
    renderQuestion(previous);
  }

  document.getElementById('begin-preparedness').addEventListener('click', function () {
    if (!started) {
      started = true;
      track('preparedness_started');
    }
    applyView(logic.evaluate(state));
  });

  document.getElementById('form-question').addEventListener('change', function (event) {
    syncChoiceStyles(event.currentTarget);
    enableContinue(event.currentTarget);
  });
  document.getElementById('form-question').addEventListener('submit', function (event) {
    event.preventDefault();
    const questionId = event.currentTarget.getAttribute('data-question-id');
    const value = selectedValue(event.currentTarget);
    if (questionId && value) applyView(logic.answerQuestion(state, questionId, value));
  });

  app.addEventListener('click', function (event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.getAttribute('data-action');
    if (action === 'back') goBack();
    else if (action === 'start-over') startOver();
  });

  showScreen('orientation');
  if (document.referrer && /recovery\.html/.test(document.referrer)) {
    track('preparedness_return_engagement');
  }

  (function bindPrepMenu() {
    const toggle = document.getElementById('prep-menu-toggle');
    const nav = document.getElementById('prep-nav');
    if (!toggle || !nav) return;
    const inertRoots = [
      document.querySelector('.skip-link'),
      document.querySelector('.prep-header .prep-brand'),
      document.querySelector('.prep-scene'),
      document.querySelector('.site-footer')
    ];

    function isMobile() {
      return window.matchMedia('(max-width: 959px)').matches;
    }

    function menuItems() {
      return [toggle].concat(Array.prototype.slice.call(nav.querySelectorAll('a')));
    }

    function setInert(open) {
      inertRoots.forEach(function (el) {
        if (!el) return;
        el.inert = open;
        if (open) el.setAttribute('aria-hidden', 'true');
        else el.removeAttribute('aria-hidden');
      });
    }

    function setOpen(open, restoreFocus) {
      const mobile = isMobile();
      const show = !!(open && mobile);
      toggle.setAttribute('aria-expanded', String(show));
      toggle.setAttribute('aria-label', show ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('prep-nav-open', show);
      if (mobile) nav.setAttribute('aria-hidden', show ? 'false' : 'true');
      else nav.removeAttribute('aria-hidden');
      setInert(show);
      if (show) {
        const first = nav.querySelector('a');
        if (first) first.focus();
      } else if (restoreFocus !== false && mobile) {
        toggle.focus();
      }
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false, false);
    });
    document.addEventListener('keydown', function (event) {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = menuItems();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (!isMobile()) setOpen(false, false);
    });
    setOpen(false, false);
  })();
})();
