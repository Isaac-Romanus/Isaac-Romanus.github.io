/* Mobile nav toggle for the header tools panel. */
(function () {
  var btn = document.getElementById('nav-toggle');
  var panel = document.getElementById('site-nav-panel');
  if (!btn || !panel) return;

  function setOpen(open) {
    document.documentElement.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) {
      var first = panel.querySelector('a, button');
      if (first) setTimeout(function () { first.focus(); }, 0);
    }
  }

  btn.addEventListener('click', function () {
    setOpen(!document.documentElement.classList.contains('nav-open'));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.lightbox.open')) return;
    if (document.documentElement.classList.contains('nav-open')) {
      setOpen(false);
      btn.focus();
    }
  });

  document.addEventListener('click', function (e) {
    if (!document.documentElement.classList.contains('nav-open')) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    setOpen(false);
  });
})();
