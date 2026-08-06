/* Builds the "On this page" table of contents from Quick facts, Histology,
   and H2 headings; highlights the active section while scrolling. */
(function () {
  var toc = document.getElementById('toc');
  var main = document.querySelector('.disease-main');
  var body = document.querySelector('.disease-body');
  if (!toc || !main) return;

  var sections = [];

  function addNode(el, label) {
    if (!el) return;
    if (!el.id) {
      el.id = (label || 'section')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'section';
    }
    sections.push({ el: el, label: label || el.getAttribute('data-toc-label') || el.textContent });
  }

  var qf = main.querySelector('#quick-facts');
  if (qf) addNode(qf, qf.getAttribute('data-toc-label') || 'Quick facts');

  var hist = main.querySelector('#histology');
  // Prefer histology after body in TOC order when gallery is after prose:
  // we'll insert body h2s first if histology comes after .disease-body in DOM.
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

  // Mobile in-page TOC (shown when sidebar is hidden)
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
    links.push({ a: a, el: sec.el });

    var a2 = a.cloneNode(true);
    mobileNav.appendChild(a2);
  });

  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (item) {
          item.a.classList.toggle('active', item.el === en.target);
        });
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    sections.forEach(function (sec) { obs.observe(sec.el); });
  }
})();
