/* Builds the "On this page" table of contents from Quick facts, Histology,
   and H2 headings; highlights the active section while scrolling. */
(function () {
  var toc = document.getElementById('toc');
  var main = document.querySelector('.disease-main');
  var body = document.querySelector('.disease-body');
  if (!toc || !main) return;

  var sections = [];
  var usedIds = {};

  function slugify(label, i) {
    var base = (label || 'section')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'section-' + i;
    var id = base;
    var n = 2;
    while (usedIds[id] || document.getElementById(id)) {
      id = base + '-' + n;
      n += 1;
    }
    usedIds[id] = true;
    return id;
  }

  function addNode(el, label) {
    if (!el) return;
    if (!el.id) el.id = slugify(label, sections.length);
    else usedIds[el.id] = true;
    sections.push({ el: el, label: label || el.getAttribute('data-toc-label') || el.textContent });
  }

  var qf = main.querySelector('#quick-facts');
  if (qf) addNode(qf, qf.getAttribute('data-toc-label') || 'Quick facts');

  var hist = main.querySelector('#histology');
  var histBeforeBody = hist && body &&
    (hist.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING);

  if (hist && histBeforeBody) addNode(hist, hist.getAttribute('data-toc-label') || 'Histology');

  if (body) {
    Array.prototype.forEach.call(body.querySelectorAll('h2'), function (h) {
      addNode(h, h.textContent);
    });
  }

  if (hist && !histBeforeBody) addNode(hist, hist.getAttribute('data-toc-label') || 'Histology');

  if (!sections.length) {
    var wrap = toc.closest('.disease-toc');
    if (wrap) wrap.style.display = 'none';
    return;
  }

  var mobile = document.createElement('details');
  mobile.className = 'toc-mobile';
  mobile.innerHTML = '<summary>On this page</summary><nav class="toc-mobile-nav"></nav>';
  var mobileNav = mobile.querySelector('nav');
  if (main.firstChild) main.insertBefore(mobile, main.firstChild);
  else main.appendChild(mobile);

  var links = [];
  sections.forEach(function (sec) {
    var a = document.createElement('a');
    a.href = '#' + sec.el.id;
    a.textContent = sec.label;
    toc.appendChild(a);

    var a2 = document.createElement('a');
    a2.href = '#' + sec.el.id;
    a2.textContent = sec.label;
    mobileNav.appendChild(a2);

    links.push({ a: a, a2: a2, el: sec.el });
  });

  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (item) {
          var on = item.el === en.target;
          item.a.classList.toggle('active', on);
          item.a2.classList.toggle('active', on);
        });
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    sections.forEach(function (sec) { obs.observe(sec.el); });
  }
})();
