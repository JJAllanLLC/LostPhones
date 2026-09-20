(function () {
  const analytics = window.LostPhonesAnalytics;
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const statusEl = document.getElementById('download-status');
  const retry = document.getElementById('retry-download');
  let captured = sessionId;

  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  function track(eventName, properties) {
    if (analytics && typeof analytics.track === 'function') {
      analytics.track(eventName, properties);
    }
  }

  function showError(message) {
    statusEl.textContent = message;
    retry.hidden = false;
    retry.focus();
  }

  function showReady() {
    statusEl.textContent = 'Payment confirmed. Your PDF is ready. Keep this private recovery record somewhere safe.';
    retry.hidden = false;
  }

  async function downloadPdf() {
    if (!captured) {
      showError('This download link is missing a verified payment. Return to your free plan or try checkout again.');
      return;
    }
    statusEl.textContent = 'Preparing your download…';
    retry.hidden = false;
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
        showError('The PDF could not be generated from this payment. Your free recovery plan is still available.');
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
      showError('The PDF could not be downloaded right now. You can try again without leaving this page.');
    }
  }

  retry.addEventListener('click', function () {
    downloadPdf();
  });

  downloadPdf();
})();
