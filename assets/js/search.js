/* Lightweight, dependency-free client-side search over _diseases.
   Loads /search.json on first use, ranks matches across title / synonyms /
   tags / field / summary / body, and shows a results dropdown with keyboard
   navigation. */
(function () {
  var box = document.querySelector('.search');
  var input = document.getElementById('site-search');
  var panel = document.getElementById('search-results');
  if (!box || !input || !panel) return;

  var url = box.getAttribute('data-search-url') || '/search.json';
  var docs = null;
  var loading = false;
  var results = [];
  var active = -1;

  function load() {
    if (docs || loading) return;
    loading = true;
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) { docs = data || []; if (input.value) run(input.value); })
      .catch(function () { docs = []; })
      .finally(function () { loading = false; });
  }

  function asText(v) {
    if (!v) return '';
    if (Array.isArray(v)) return v.join(' ');
    return String(v);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function highlight(text, terms) {
    var out = escapeHtml(text);
    terms.forEach(function (t) {
      if (!t) return;
      out = out.replace(new RegExp('(' + escapeRe(t) + ')', 'ig'), '<mark>$1</mark>');
    });
    return out;
  }

  function snippet(doc, terms) {
    var body = asText(doc.body);
    var lower = body.toLowerCase();
    var pos = -1;
    for (var i = 0; i < terms.length; i++) {
      var p = lower.indexOf(terms[i]);
      if (p !== -1 && (pos === -1 || p < pos)) pos = p;
    }
    if (pos === -1) {
      var fallback = asText(doc.summary) || asText(doc.synonyms);
      return highlight(fallback.slice(0, 130), terms);
    }
    var start = Math.max(0, pos - 45);
    var end = Math.min(body.length, pos + 90);
    var frag = (start > 0 ? '… ' : '') + body.slice(start, end) + (end < body.length ? ' …' : '');
    return highlight(frag, terms);
  }

  function score(doc, terms) {
    var title = asText(doc.title).toLowerCase();
    var syn = asText(doc.synonyms).toLowerCase();
    var tags = asText(doc.tags).toLowerCase();
    var field = asText(doc.field).toLowerCase();
    var summary = asText(doc.summary).toLowerCase();
    var body = asText(doc.body).toLowerCase();

    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      var termScore = 0;
      if (title.indexOf(t) !== -1) { termScore += 8; if (title.indexOf(t) === 0) termScore += 4; }
      if (syn.indexOf(t) !== -1) termScore += 5;
      if (tags.indexOf(t) !== -1) termScore += 4;
      if (field.indexOf(t) !== -1) termScore += 3;
      if (summary.indexOf(t) !== -1) termScore += 2;
      if (body.indexOf(t) !== -1) termScore += 1;
      if (termScore === 0) return 0; // AND: every term must match somewhere
      total += termScore;
    }
    return total;
  }

  function run(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!docs || terms.length === 0) { close(); return; }

    results = docs
      .map(function (d) { return { doc: d, s: score(d, terms) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 8);

    active = -1;
    render(terms, q);
  }

  function render(terms, q) {
    if (results.length === 0) {
      panel.innerHTML = '<div class="search-empty">No matches for “' + escapeHtml(q) + '”.</div>';
      panel.hidden = false;
      box.classList.add('open');
      return;
    }
    var html = results.map(function (r, i) {
      var d = r.doc;
      return '<a class="search-hit" role="option" href="' + d.url + '" data-i="' + i + '">' +
               '<span class="hit-title">' + highlight(asText(d.title), terms) + '</span>' +
               '<span class="hit-field">' + escapeHtml(asText(d.field)) + '</span>' +
               '<span class="hit-snip">' + snippet(d, terms) + '</span>' +
             '</a>';
    }).join('');
    panel.innerHTML = html;
    panel.hidden = false;
    box.classList.add('open');
  }

  function close() {
    panel.hidden = true;
    box.classList.remove('open');
    active = -1;
  }

  function setActive(i) {
    var hits = panel.querySelectorAll('.search-hit');
    if (!hits.length) return;
    active = (i + hits.length) % hits.length;
    hits.forEach(function (h, idx) { h.classList.toggle('active', idx === active); });
    hits[active].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('focus', load);
  input.addEventListener('input', function () { load(); run(input.value); });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      var hits = panel.querySelectorAll('.search-hit');
      if (hits.length) { e.preventDefault(); (hits[active] || hits[0]).click(); }
    } else if (e.key === 'Escape') {
      if (!panel.hidden) { close(); } else { input.blur(); }
    }
  });

  document.addEventListener('click', function (e) {
    if (!box.contains(e.target)) close();
  });

  // "/" focuses the search box (unless already typing in a field)
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/') return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    input.focus();
  });
})();
