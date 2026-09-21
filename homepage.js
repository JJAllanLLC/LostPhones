(function () {
  var toggle = document.getElementById('hp-menu-toggle');
  var nav = document.getElementById('hp-nav');
  if (!toggle || !nav) return;
  var inertRoots = [
    document.querySelector('.skip-link'),
    document.querySelector('.hp-header .hp-brand'),
    document.getElementById('main'),
    document.querySelector('.hp-footer')
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
    var mobile = isMobile();
    var show = !!(open && mobile);
    toggle.setAttribute('aria-expanded', String(show));
    toggle.setAttribute('aria-label', show ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('hp-nav-open', show);
    if (mobile) nav.setAttribute('aria-hidden', show ? 'false' : 'true');
    else nav.removeAttribute('aria-hidden');
    setInert(show);
    if (show) {
      var first = nav.querySelector('a');
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
    var items = menuItems();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
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
