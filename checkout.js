const stripe = Stripe('pk_test_51SbsOq6SN9rpiA04VH13F4vsQpZSWpa3latHAsBstp38OfaZcXnQcxKCPWFTyOCHslYBvewAWp5az1S5vXSMcRXK00RzOb4g55');

document.querySelectorAll('.pdf-button').forEach(button => {
  button.addEventListener('click', () => {
    stripe.redirectToCheckout({
      lineItems: [{ price: 'price_1Sbsnf6SN9rpiA041qTi745y', quantity: 1 }],
      mode: 'payment',
      successUrl: window.location.origin + '/success.html',
      cancelUrl: window.location.href,
    });
  });
});
