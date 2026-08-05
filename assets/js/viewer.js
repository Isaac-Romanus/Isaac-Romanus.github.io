/* Histology slide viewer — a lightweight "read it like Sectra" lightbox.
   Click a figure to open, then: scroll to zoom toward the cursor, drag to pan,
   double-click to zoom in/out, on-screen controls, and keyboard shortcuts.
   Adapted and extended from the original annotation tool's image logic. */
(function () {
  var MIN = 1, MAX = 16;

  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML =
    '<div class="lb-toolbar">' +
      '<button type="button" class="lb-btn" data-act="out" title="Zoom out (-)">&minus;</button>' +
      '<span class="lb-zoom" data-role="zoom">100%</span>' +
      '<button type="button" class="lb-btn" data-act="in" title="Zoom in (+)">+</button>' +
      '<button type="button" class="lb-btn" data-act="reset" title="Reset (0)">Reset</button>' +
      '<button type="button" class="lb-btn" data-act="invert" title="Invert (I)">Invert</button>' +
      '<button type="button" class="lb-btn lb-close" data-act="close" title="Close (Esc)">&times;</button>' +
    '</div>' +
    '<div class="lb-stage">' +
      '<img alt="" draggable="false">' +
    '</div>' +
    '<div class="lb-caption" data-role="caption"></div>' +
    '<div class="lb-hint">Scroll to zoom &middot; drag to pan &middot; double-click to zoom &middot; I invert &middot; 0 reset &middot; Esc close</div>';
  document.body.appendChild(lb);

  var stage = lb.querySelector('.lb-stage');
  var img = lb.querySelector('img');
  var zoomLabel = lb.querySelector('[data-role="zoom"]');
  var caption = lb.querySelector('[data-role="caption"]');

  var scale = 1, tx = 0, ty = 0, inverted = false;
  var dragging = false, lastX = 0, lastY = 0, moved = false;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function clampPan() {
    var bw = img.offsetWidth, bh = img.offsetHeight;
    if (!bw || !bh) return;
    var maxX = Math.max(0, (bw * scale - stage.clientWidth) / 2);
    var maxY = Math.max(0, (bh * scale - stage.clientHeight) / 2);
    tx = clamp(tx, -maxX, maxX);
    ty = clamp(ty, -maxY, maxY);
  }

  function apply() {
    clampPan();
    img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    img.style.filter = inverted ? 'invert(1)' : 'none';
    img.style.cursor = scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in';
    zoomLabel.textContent = Math.round(scale * 100) + '%';
  }

  function reset() { scale = 1; tx = 0; ty = 0; apply(); }

  function zoomAt(clientX, clientY, factor) {
    var rect = stage.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dx = clientX - cx, dy = clientY - cy;
    var next = clamp(scale * factor, MIN, MAX);
    var k = next / scale;
    if (k === 1) return;
    tx = dx - k * (dx - tx);
    ty = dy - k * (dy - ty);
    scale = next;
    if (scale === 1) { tx = 0; ty = 0; }
    apply();
  }

  function centerZoom(factor) {
    var rect = stage.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function open(src, alt, cap) {
    img.src = src;
    img.alt = alt || '';
    caption.textContent = cap || '';
    inverted = false;
    reset();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    img.src = '';
  }

  // Open from any figure
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.figure-zoom');
    if (!btn) return;
    e.preventDefault();
    var inner = btn.querySelector('img');
    var fig = btn.closest('figure');
    var cap = fig ? fig.querySelector('.fig-caption') : null;
    open(btn.getAttribute('data-full'), inner ? inner.alt : '', cap ? cap.textContent : '');
  });

  // Toolbar
  lb.querySelector('.lb-toolbar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'in') centerZoom(1.4);
    else if (act === 'out') centerZoom(1 / 1.4);
    else if (act === 'reset') { inverted = false; reset(); }
    else if (act === 'invert') { inverted = !inverted; apply(); }
    else if (act === 'close') close();
  });

  // Click backdrop (stage empty area) closes; but not after a drag
  stage.addEventListener('click', function (e) {
    if (e.target === stage && !moved) close();
  });

  // Wheel zoom toward cursor
  stage.addEventListener('wheel', function (e) {
    if (!lb.classList.contains('open')) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, -e.deltaY > 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  // Drag to pan
  img.addEventListener('mousedown', function (e) {
    e.preventDefault();
    dragging = true; moved = false;
    lastX = e.clientX; lastY = e.clientY;
    apply();
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    tx += dx; ty += dy;
    lastX = e.clientX; lastY = e.clientY;
    apply();
  });
  window.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false; apply();
    setTimeout(function () { moved = false; }, 0);
  });

  // Double-click zooms toward cursor (or resets when already zoomed in)
  img.addEventListener('dblclick', function (e) {
    e.preventDefault();
    if (scale >= 4) { inverted = inverted; reset(); }
    else zoomAt(e.clientX, e.clientY, 2.2);
  });

  // Keyboard
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    var k = e.key.toLowerCase();
    var step = 40;
    if (e.key === 'Escape') close();
    else if (k === 'i') { inverted = !inverted; apply(); }
    else if (k === '0') { inverted = false; reset(); }
    else if (e.key === '+' || e.key === '=') centerZoom(1.4);
    else if (e.key === '-' || e.key === '_') centerZoom(1 / 1.4);
    else if (e.key === 'ArrowLeft') { tx += step; apply(); }
    else if (e.key === 'ArrowRight') { tx -= step; apply(); }
    else if (e.key === 'ArrowUp') { ty += step; apply(); }
    else if (e.key === 'ArrowDown') { ty -= step; apply(); }
  });

  window.addEventListener('resize', function () { if (lb.classList.contains('open')) apply(); });
})();
