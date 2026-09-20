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
    const progress = document.getElementById('progress-label');
    const questionIndex = logic.QUESTION_ORDER.indexOf(state.step);
    if (id === 'question' && questionIndex >= 0) {
      progress.hidden = false;
      progress.textContent = 'Question ' + (questionIndex + 1) + ' of 5';
    } else {
      progress.hidden = true;
    }
    const focusId = id === 'orientation' ? 'orientation-title' : id === 'results' ? 'results-title' : 'legend-question';
    const focusEl = document.getElementById(focusId);
    if (focusEl && typeof focusEl.focus === 'function') focusEl.focus();
  }

  function renderQuestion(questionId) {
    const question = content.getQuestion(questionId);
    if (!question) return;
    document.getElementById('legend-question').textContent = question.title;
    document.getElementById('question-help').textContent = question.help || '';
    const holder = document.getElementById('question-choices');
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
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + choice.label));
      holder.appendChild(label);
    });
    document.getElementById('form-question').setAttribute('data-question-id', questionId);
    state.step = questionId;
    showScreen('question');
    announce(question.title);
  }

  function statusLabel(value) {
    if (value === 'protected') return 'Protected';
    if (value === 'needs_setup') return 'Needs setup';
    if (value === 'not_sure') return 'Not sure';
    return 'Not assessed';
  }

  function renderRecommendations(categoryId, card) {
    const ids = logic.recommendationIdsFor(state).filter(function (id) {
      const record = registry.getRecord(id);
      return record && record.gap === categoryId;
    });
    const displayable = registry.displayableRecords(ids);
    if (!displayable.length) {
      const note = document.createElement('p');
      note.className = 'plan-intro';
      note.textContent = content.NEUTRAL_MISSING;
      card.appendChild(note);
      return;
    }
    displayable.forEach(function (record) {
      const article = document.createElement('article');
      article.className = 'recommendation-card';
      const heading = document.createElement('h3');
      heading.textContent = record.title;
      const copy = document.createElement('p');
      copy.textContent = record.copy;
      const link = document.createElement('a');
      link.className = 'btn btn-secondary';
      link.href = record.destinationUrl;
      link.target = '_blank';
      link.rel = registry.linkRel(record);
      link.textContent = 'Open ' + record.providerName;
      link.addEventListener('click', function () {
        track('preparedness_recommendation_clicked', {
          recommendationId: record.id,
          commercialType: record.commercialType
        });
      });
      article.appendChild(heading);
      article.appendChild(copy);
      article.appendChild(link);
      if (record.commercialType !== 'none') {
        const disclosure = document.createElement('p');
        disclosure.className = 'disclosure';
        disclosure.textContent = record.disclosure || content.CARD_DISCLOSURE;
        article.appendChild(disclosure);
      }
      card.appendChild(article);
      track('preparedness_recommendation_displayed', {
        recommendationId: record.id,
        commercialType: record.commercialType
      });
    });
  }

  function renderResults() {
    const mapped = logic.mapResults(state);
    state = mapped;
    const list = document.getElementById('results-list');
    list.innerHTML = '';
    content.CATEGORIES.forEach(function (category) {
      const result = state.results[category.id];
      const card = document.createElement('article');
      card.className = 'result-card';
      const heading = document.createElement('h2');
      heading.textContent = category.title;
      const status = document.createElement('p');
      status.className = 'status-pill';
      status.textContent = statusLabel(result);
      const copy = document.createElement('p');
      if (result === 'protected') copy.textContent = category.protectedCopy;
      else if (result === 'not_sure') copy.textContent = category.notSureCopy;
      else if (result === 'needs_setup') copy.textContent = category.needsSetupCopy;
      else copy.textContent = category.missingCopy;
      card.appendChild(heading);
      card.appendChild(status);
      card.appendChild(copy);
      if (result === 'needs_setup') {
        track('preparedness_gap_identified', { category: category.id });
        renderRecommendations(category.id, card);
      }
      list.appendChild(card);
    });
    document.getElementById('page-disclosure').textContent = content.PAGE_DISCLOSURE;
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
})();
