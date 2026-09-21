(function () {
  const analytics = window.LostPhonesAnalytics;
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const titleEl = document.getElementById('download-title');
  const copyEl = document.getElementById('download-copy');
  const statusEl = document.getElementById('download-status');
  const filenameEl = document.getElementById('download-filename');
  const disclosureEl = document.getElementById('download-disclosure');
  const completeEl = document.getElementById('download-complete');
  const retry = document.getElementById('retry-download');
  let captured = sessionId;
  let verified = false;

  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  function track(eventName, properties) {
    if (analytics && typeof analytics.track === 'function') {
      analytics.track(eventName, properties);
    }
  }

  function setState(state) {
    document.body.setAttribute('data-download-state', state);
  }

  function showPending() {
    setState('pending');
    document.title = 'Download recovery plan | LostPhones';
    titleEl.textContent = 'Checking your download';
    copyEl.textContent = 'Preparing your download…';
    statusEl.textContent = 'Preparing your download…';
    filenameEl.hidden = true;
    disclosureEl.hidden = true;
    completeEl.hidden = true;
    retry.hidden = true;
    statusEl.hidden = false;
  }

  function showError() {
    setState('error');
    document.title = 'We could not verify this download link. | LostPhones';
    titleEl.textContent = 'We could not verify this download link.';
    copyEl.textContent = 'Return to your free plan or try checkout again.';
    statusEl.textContent = '';
    statusEl.hidden = true;
    filenameEl.hidden = true;
    disclosureEl.hidden = true;
    completeEl.hidden = true;
    retry.hidden = !captured;
    titleEl.focus();
  }

  function showReady() {
    verified = true;
    setState('success');
    document.title = 'Payment confirmed | LostPhones';
    titleEl.textContent = 'Payment confirmed';
    copyEl.textContent = 'Your PDF is ready. Keep this private recovery record somewhere safe.';
    statusEl.textContent = '';
    statusEl.hidden = true;
    filenameEl.hidden = false;
    disclosureEl.hidden = false;
    completeEl.hidden = false;
    retry.hidden = false;
  }

  async function downloadPdf() {
    if (!captured) {
      showError();
      return;
    }
    if (!verified) showPending();
    else {
      statusEl.hidden = false;
      statusEl.textContent = 'Preparing your download…';
    }
    try {
      const response = await fetch('/api/recovery-plan-pdf', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        },
        body: JSON.stringify({ sessionId: captured })
      });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || type.indexOf('application/pdf') === -1) {
        showError();
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'lostphones-recovery-plan.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showReady();
      retry.focus();
      track('recovery_checkout_succeeded', {
        productId: analytics ? analytics.PRODUCT_ID : 'recovery-complete-plan',
        value: analytics ? analytics.PRODUCT_VALUE : 8.95
      });
      track('recovery_pdf_delivered', {
        productId: analytics ? analytics.PRODUCT_ID : 'recovery-complete-plan'
      });
    } catch (error) {
      showError();
    }
  }

  retry.addEventListener('click', function () {
    downloadPdf();
  });

  (function bindSuccessMenu() {
    const toggle = document.getElementById('emergency-menu-toggle');
    const nav = document.getElementById('emergency-nav');
    if (!toggle || !nav) return;
    const inertRoots = [
      document.querySelector('.skip-link'),
      document.querySelector('.emergency-brand'),
      document.querySelector('.recovery-scene'),
      document.querySelector('.site-footer')
    ];

    function isMobile() {
      return window.matchMedia('(max-width: 959px)').matches;
    }

    function menuItems() {
      const links = Array.prototype.slice.call(nav.querySelectorAll('a'));
      return [toggle].concat(links);
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
      document.body.classList.toggle('emergency-nav-open', show);
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

  downloadPdf();
})();
