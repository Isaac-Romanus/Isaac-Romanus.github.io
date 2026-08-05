/* Builds the "On this page" table of contents from H2 headings and
   highlights the active section while scrolling. */
(function () {
  var toc = document.getElementById('toc');
  var body = document.querySelector('.disease-body');
  if (!toc || !body) return;

  var heads = body.querySelectorAll('h2');
  if (!heads.length) {
    var wrap = toc.closest('.disease-toc');
    if (wrap) wrap.style.display = 'none';
    return;
  }

  var links = [];
  Array.prototype.forEach.call(heads, function (h, i) {
    if (!h.id) {
      h.id = (h.textContent || 'section-' + i)
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'section-' + i;
    }
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    toc.appendChild(a);
    links.push(a);
  });

  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) {
          l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    Array.prototype.forEach.call(heads, function (h) { obs.observe(h); });
  }
})();
