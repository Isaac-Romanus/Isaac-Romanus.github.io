/* Field-page tag filter chips. */
(function () {
  var root = document.querySelector('[data-filter-root]');
  var list = document.querySelector('[data-filter-list]');
  if (!root || !list) return;

  var empty = document.querySelector('.filter-empty');
  var buttons = root.querySelectorAll('.tag-filter');
  var items = list.querySelectorAll('.filter-item');

  function apply(filter) {
    var visible = 0;
    Array.prototype.forEach.call(items, function (item) {
      var tags = (item.getAttribute('data-tags') || '').toLowerCase();
      var show = filter === 'all' || (' ' + tags + ' ').indexOf(' ' + filter + ' ') !== -1 ||
        tags.split(/\s+/).indexOf(filter) !== -1;
      item.hidden = !show;
      if (show) visible += 1;
    });
    Array.prototype.forEach.call(buttons, function (btn) {
      var on = btn.getAttribute('data-filter') === filter;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (empty) empty.hidden = visible > 0;
  }

  Array.prototype.forEach.call(buttons, function (btn) {
    btn.setAttribute('aria-pressed', btn.classList.contains('is-active') ? 'true' : 'false');
    btn.addEventListener('click', function () {
      apply(btn.getAttribute('data-filter') || 'all');
    });
  });

  // Honor ?tag=slug on load
  var params = new URLSearchParams(window.location.search);
  var initial = params.get('tag');
  if (initial) apply(initial.toLowerCase());
})();
