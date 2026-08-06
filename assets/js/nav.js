/* Mobile nav toggle for the header tools panel. */
(function () {
  var btn = document.getElementById('nav-toggle');
  var panel = document.getElementById('site-nav-panel');
  if (!btn || !panel) return;

  function setOpen(open) {
    document.documentElement.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  btn.addEventListener('click', function () {
    setOpen(!document.documentElement.classList.contains('nav-open'));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });

  document.addEventListener('click', function (e) {
    if (!document.documentElement.classList.contains('nav-open')) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    setOpen(false);
  });
})();
