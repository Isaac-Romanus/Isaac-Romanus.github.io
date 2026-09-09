/* Histology slide viewer — lightweight Sectra-like lightbox.
   Click a figure to open, then: scroll/pinch to zoom, drag to pan,
   double-click to zoom, ←/→ for gallery navigation, invert, keyboard shortcuts. */
(function () {
  var MIN = 1, MAX = 16;

  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Histology image viewer');
  lb.innerHTML =
    '<div class="lb-toolbar">' +
      '<button type="button" class="lb-btn" data-act="prev" title="Previous (←)">‹</button>' +
      '<button type="button" class="lb-btn" data-act="out" title="Zoom out (-)">&minus;</button>' +
      '<span class="lb-zoom" data-role="zoom">100%</span>' +
      '<button type="button" class="lb-btn" data-act="in" title="Zoom in (+)">+</button>' +
      '<button type="button" class="lb-btn" data-act="next" title="Next (→)">›</button>' +
      '<button type="button" class="lb-btn" data-act="reset" title="Reset (0)">Reset</button>' +
      '<button type="button" class="lb-btn" data-act="invert" title="Invert (I)">Invert</button>' +
      '<button type="button" class="lb-btn lb-close" data-act="close" title="Close (Esc)">&times;</button>' +
    '</div>' +
    '<div class="lb-stage">' +
      '<img alt="" draggable="false">' +
    '</div>' +
    '<div class="lb-caption" data-role="caption"></div>' +
    '<div class="lb-hint">Scroll or pinch to zoom · drag to pan · ← → gallery · I invert · 0 reset · Esc close</div>';
  document.body.appendChild(lb);

  var stage = lb.querySelector('.lb-stage');
  var img = lb.querySelector('img');
  var zoomLabel = lb.querySelector('[data-role="zoom"]');
  var caption = lb.querySelector('[data-role="caption"]');
  var prevBtn = lb.querySelector('[data-act="prev"]');
  var nextBtn = lb.querySelector('[data-act="next"]');

  var scale = 1, tx = 0, ty = 0, inverted = false;
  var dragging = false, lastX = 0, lastY = 0, moved = false;
  var gallery = [];
  var index = 0;
  var lastFocus = null;
  var pinchStartDist = 0;
  var pinchStartScale = 1;

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

  function resetView() { scale = 1; tx = 0; ty = 0; apply(); }

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

  function collectGallery(fromBtn) {
    var root =
      (fromBtn && fromBtn.closest && (fromBtn.closest('.qb-question-images') || fromBtn.closest('.qb-add-previews') || fromBtn.closest('.qb-quiz-app') || fromBtn.closest('.disease-main'))) ||
      document.querySelector('.qb-question-images') ||
      document.querySelector('.disease-main') ||
      document;
    var buttons = root.querySelectorAll('.figure-zoom');
    gallery = Array.prototype.map.call(buttons, function (btn) {
      var inner = btn.querySelector('img');
      var fig = btn.closest('figure');
      var cap = fig ? fig.querySelector('.fig-caption') : null;
      return {
        src: btn.getAttribute('data-full'),
        alt: inner ? inner.alt : '',
        caption: cap ? cap.textContent : '',
        btn: btn
      };
    }).filter(function (item) { return !!item.src; });
    index = 0;
    for (var i = 0; i < gallery.length; i++) {
      if (gallery[i].btn === fromBtn) { index = i; break; }
    }
    var multi = gallery.length > 1;
    prevBtn.style.display = multi ? '' : 'none';
    nextBtn.style.display = multi ? '' : 'none';
  }

  function showCurrent() {
    var item = gallery[index];
    if (!item) return;
    img.src = item.src;
    img.alt = item.alt || '';
    caption.textContent = (gallery.length > 1 ? (index + 1) + ' / ' + gallery.length + ' · ' : '') + (item.caption || '');
    inverted = false;
    resetView();
  }

  function open(fromBtn) {
    lastFocus = document.activeElement;
    collectGallery(fromBtn);
    showCurrent();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
    lb.querySelector('.lb-close').focus();
  }

  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    img.src = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function step(delta) {
    if (gallery.length < 2) return;
    index = (index + delta + gallery.length) % gallery.length;
    showCurrent();
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.figure-zoom');
    if (!btn) return;
    e.preventDefault();
    open(btn);
  });

  lb.querySelector('.lb-toolbar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'in') centerZoom(1.4);
    else if (act === 'out') centerZoom(1 / 1.4);
    else if (act === 'reset') { inverted = false; resetView(); }
    else if (act === 'invert') { inverted = !inverted; apply(); }
    else if (act === 'close') close();
    else if (act === 'prev') step(-1);
    else if (act === 'next') step(1);
  });

  stage.addEventListener('click', function (e) {
    if (e.target === stage && !moved) close();
  });

  stage.addEventListener('wheel', function (e) {
    if (!lb.classList.contains('open')) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, -e.deltaY > 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

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

  // Touch: single-finger pan, two-finger pinch zoom
  stage.addEventListener('touchstart', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.touches.length === 1) {
      dragging = true; moved = false;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      dragging = false;
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.sqrt(dx * dx + dy * dy) || 1;
      pinchStartScale = scale;
    }
  }, { passive: true });

  stage.addEventListener('touchmove', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.touches.length === 1 && dragging) {
      e.preventDefault();
      var x = e.touches[0].clientX, y = e.touches[0].clientY;
      var dx = x - lastX, dy = y - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      tx += dx; ty += dy;
      lastX = x; lastY = y;
      apply();
    } else if (e.touches.length === 2) {
      e.preventDefault();
      var dx2 = e.touches[0].clientX - e.touches[1].clientX;
      var dy2 = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
      var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      var target = clamp(pinchStartScale * (dist / pinchStartDist), MIN, MAX);
      var factor = target / scale;
      if (factor !== 1) zoomAt(midX, midY, factor);
    }
  }, { passive: false });

  stage.addEventListener('touchend', function () {
    dragging = false;
    setTimeout(function () { moved = false; }, 0);
  });

  img.addEventListener('dblclick', function (e) {
    e.preventDefault();
    if (scale >= 4) { resetView(); }
    else zoomAt(e.clientX, e.clientY, 2.2);
  });

  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    var k = e.key.toLowerCase();
    var stepPx = 40;
    if (e.key === 'Escape') close();
    else if (k === 'i') { inverted = !inverted; apply(); }
    else if (k === '0') { inverted = false; resetView(); }
    else if (e.key === '+' || e.key === '=') centerZoom(1.4);
    else if (e.key === '-' || e.key === '_') centerZoom(1 / 1.4);
    else if (e.key === 'ArrowLeft') {
      if (gallery.length > 1) { e.preventDefault(); step(-1); }
      else { tx += stepPx; apply(); }
    } else if (e.key === 'ArrowRight') {
      if (gallery.length > 1) { e.preventDefault(); step(1); }
      else { tx -= stepPx; apply(); }
    } else if (e.key === 'ArrowUp') { ty += stepPx; apply(); }
    else if (e.key === 'ArrowDown') { ty -= stepPx; apply(); }
    else if (k === 'n') step(1);
    else if (k === 'p') step(-1);
  });

  // Focus trap while open
  lb.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !lb.classList.contains('open')) return;
    var focusable = lb.querySelectorAll('button:not([style*="display: none"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  window.addEventListener('resize', function () { if (lb.classList.contains('open')) apply(); });
})();
