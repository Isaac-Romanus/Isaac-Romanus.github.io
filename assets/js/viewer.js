/* Histology image lightbox with zoom / pan / invert.
   Adapted from the original annotation tool's image-interaction logic. */
(function () {
  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML =
    '<button class="lightbox-close" aria-label="Close viewer">&times;</button>' +
    '<img alt="">' +
    '<div class="lightbox-hint">Scroll to zoom \u00b7 drag to pan \u00b7 I to invert \u00b7 0 to reset \u00b7 Esc to close</div>';
  document.body.appendChild(lb);

  var img = lb.querySelector('img');
  var closeBtn = lb.querySelector('.lightbox-close');

  var scale = 1, tx = 0, ty = 0, inverted = false;
  var dragging = false, startX = 0, startY = 0;

  function apply() {
    img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    img.style.filter = inverted ? 'invert(1)' : 'none';
  }
  function reset() { scale = 1; tx = 0; ty = 0; inverted = false; apply(); }

  function open(src, alt) {
    img.src = src;
    img.alt = alt || '';
    reset();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    img.src = '';
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.figure-zoom');
    if (!btn) return;
    e.preventDefault();
    var inner = btn.querySelector('img');
    open(btn.getAttribute('data-full'), inner ? inner.alt : '');
  });

  closeBtn.addEventListener('click', close);
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

  lb.addEventListener('wheel', function (e) {
    if (!lb.classList.contains('open')) return;
    e.preventDefault();
    scale *= (-e.deltaY > 0 ? 1.12 : 0.89);
    scale = Math.min(8, Math.max(1, scale));
    if (scale === 1) { tx = 0; ty = 0; }
    apply();
  }, { passive: false });

  img.addEventListener('mousedown', function (e) {
    if (scale <= 1) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX - tx;
    startY = e.clientY - ty;
    img.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    tx = e.clientX - startX;
    ty = e.clientY - startY;
    apply();
  });
  window.addEventListener('mouseup', function () { dragging = false; img.style.cursor = 'grab'; });

  img.addEventListener('dblclick', reset);

  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    var k = e.key.toLowerCase();
    if (e.key === 'Escape') close();
    else if (k === 'i') { inverted = !inverted; apply(); }
    else if (k === '0') reset();
  });
})();
