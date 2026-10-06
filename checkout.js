document.querySelectorAll('.pdf-button').forEach(button => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
  });
});

document.querySelectorAll('[title="Checkout disabled in staging"]').forEach(link => {
  link.href = '#';
  link.title = 'Open secure checkout for the $8.95 recovery and protection plan';
  link.removeAttribute('aria-disabled');
  link.removeAttribute('onclick');
  link.removeAttribute('target');
  link.addEventListener('click', async event => {
    event.preventDefault();
    if (link.getAttribute('aria-busy') === 'true') return;
    link.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/recovery-plan-checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        },
        body: JSON.stringify({ purchaseMode: 'direct' })
      });
      const result = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !result.ok || !result.url) throw new Error('checkout-unavailable');
      window.location.assign(result.url);
    } catch (error) {
      link.removeAttribute('aria-busy');
      link.title = 'Checkout is temporarily unavailable. Please try again.';
    }
  });
});
