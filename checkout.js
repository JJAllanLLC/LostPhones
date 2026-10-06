document.querySelectorAll('.pdf-button').forEach(button => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
  });
});

document.querySelectorAll('[title="Checkout disabled in staging"]').forEach(link => {
  link.href = '/recovery.html';
  link.title = 'Continue to the guided recovery flow';
  link.removeAttribute('aria-disabled');
  link.removeAttribute('onclick');
  link.removeAttribute('target');
});
