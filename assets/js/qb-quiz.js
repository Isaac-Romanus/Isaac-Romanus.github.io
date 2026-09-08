/* Quiz engine — load questions, render UI, handle modes. */
(function (global) {
  var cache = {};
  var manifestPromise = null;

  function baseUrl() {
    var cfg = global.PN_QB || {};
    return cfg.baseUrl || '';
  }

  function assetUrl(path) {
    var b = baseUrl();
    if (b && b.slice(-1) === '/') b = b.slice(0, -1);
    return (b || '') + path;
  }

  function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = fetch(assetUrl('/assets/data/questions/index.json'))
      .then(function (r) {
        if (!r.ok) throw new Error('Question index not found');
        return r.json();
      });
    return manifestPromise;
  }

  function loadBank(slug) {
    if (cache[slug]) return Promise.resolve(cache[slug]);
    return loadManifest().then(function (manifest) {
      var file = manifest.banks[slug];
      if (!file) return [];
      return fetch(assetUrl('/assets/data/questions/' + file))
        .then(function (r) {
          if (!r.ok) throw new Error('Failed to load ' + slug);
          return r.json();
        })
        .then(function (data) {
          var questions = Array.isArray(data) ? data : (data.questions || []);
          cache[slug] = questions;
          return questions;
        });
    });
  }

  function slugForSid(sid) {
    var subs = (global.PN_QB && global.PN_QB.subspecialties) || [];
    var sub = subs.find(function (s) { return String(s.sid) === String(sid); });
    return sub ? sub.slug : null;
  }

  function loadBySids(sids) {
    var slugs = sids.map(slugForSid).filter(Boolean);
    var unique = slugs.filter(function (s, i, a) { return a.indexOf(s) === i; });
    return Promise.all(unique.map(loadBank)).then(function (parts) {
      return parts.reduce(function (acc, qs) { return acc.concat(qs); }, []);
    });
  }

  function loadCustomQuestions(sids) {
    if (!global.QBStorage) return Promise.resolve([]);
    return global.QBStorage.getCustomQuestions().then(function (rows) {
      if (!sids || !sids.length) return rows || [];
      var set = {};
      sids.forEach(function (s) { set[String(s)] = true; });
      return (rows || []).filter(function (q) {
        return set[String(q.po_subspecialty_id)];
      });
    });
  }

  function mergeQuestions(staticQs, customQs) {
    var map = {};
    (staticQs || []).forEach(function (q) { map[q.id] = q; });
    (customQs || []).forEach(function (q) { map[q.id] = q; });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function filterByTag(questions, tag) {
    if (!tag) return questions;
    var t = tag.toLowerCase();
    return questions.filter(function (q) {
      return (q.tags || []).some(function (x) { return String(x).toLowerCase() === t; });
    });
  }

  function filterComplete(questions) {
    return questions.filter(function (q) {
      return q.explanation_status === 'complete';
    });
  }

  function filterByMode(questions, mode, profileId) {
    // Always return a Promise — prepareSession chains .then() on this result.
    if (mode === 'exam') return Promise.resolve(filterComplete(questions));
    if (!global.QBStorage || mode === 'practice' || mode === 'leitner' || mode === 'tag') {
      return Promise.resolve(questions);
    }
    if (mode === 'review') {
      return global.QBStorage.getWrongQuestionIds(profileId).then(function (ids) {
        var set = {};
        ids.forEach(function (id) { set[id] = true; });
        return questions.filter(function (q) { return set[q.id]; });
      });
    }
    if (mode === 'unanswered') {
      return global.QBStorage.getAnsweredQuestionIds(profileId).then(function (ids) {
        var set = {};
        ids.forEach(function (id) { set[id] = true; });
        return questions.filter(function (q) { return !set[q.id]; });
      });
    }
    return Promise.resolve(questions);
  }

  function prepareSession(opts) {
    var sids = opts.sids || (opts.sid ? [opts.sid] : []);
    var mode = opts.mode || 'practice';
    var count = opts.count || null;
    var tag = opts.tag || null;
    var profileId = opts.profileId;

    return Promise.all([loadBySids(sids), loadCustomQuestions(sids)]).then(function (parts) {
      var merged = mergeQuestions(parts[0], parts[1]);
      merged = filterByTag(merged, tag);
      if (mode === 'exam') merged = filterComplete(merged);

      return filterByMode(merged, mode, profileId).then(function (filtered) {
        if (mode === 'leitner' && global.QBLeitner && global.QBStorage) {
          return global.QBStorage.getLeitnerForProfile(profileId).then(function (rows) {
            var due = global.QBLeitner.pickDueQuestions(filtered, rows, profileId);
            if (count) due = due.slice(0, count);
            return due;
          });
        }
        var pool = shuffle(filtered);
        if (count) pool = pool.slice(0, count);
        return pool;
      });
    });
  }

  function countBySid(slug) {
    return loadBank(slug).then(function (qs) { return qs.length; }).catch(function () { return 0; });
  }

  function findRelated(questions, diseaseSlug) {
    if (!diseaseSlug) return [];
    return questions.filter(function (q) {
      return q.related_disease === diseaseSlug;
    });
  }

  function modeLabel(mode) {
    var labels = {
      practice: 'Practice',
      review: 'Review wrong',
      unanswered: 'Unanswered only',
      leitner: 'Leitner',
      exam: 'Exam',
      mixed: 'Mixed quiz',
      tag: 'Tag quiz'
    };
    return labels[mode] || mode;
  }

  function renderStem(el, text) {
    el.textContent = '';
    el.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderOptions(form, question, opts) {
    form.innerHTML = '';
    var disabled = opts.disabled;
    var reveal = opts.reveal;
    var selected = opts.selected;
    var examMode = opts.examMode;

    (question.options || []).forEach(function (opt) {
      var label = document.createElement('label');
      label.className = 'qb-option';
      if (reveal) {
        if (opt.correct) label.classList.add('is-reveal-correct');
        if (selected === opt.key && !opt.correct) label.classList.add('is-wrong');
        if (selected === opt.key && opt.correct) label.classList.add('is-correct');
      }

      var input = document.createElement('input');
      input.type = examMode ? 'radio' : 'radio';
      input.name = 'qb-answer';
      input.value = opt.key;
      input.disabled = disabled;
      if (selected === opt.key) input.checked = true;

      var key = document.createElement('span');
      key.className = 'qb-option-key';
      key.textContent = opt.key + '.';

      var text = document.createElement('span');
      text.className = 'qb-option-text';
      text.textContent = opt.text;

      label.appendChild(input);
      label.appendChild(key);
      label.appendChild(text);
      form.appendChild(label);
    });
  }

  function renderExplanations(container, question, selectedKey) {
    container.innerHTML = '';
    container.hidden = false;
    (question.options || []).forEach(function (opt) {
      var div = document.createElement('div');
      div.className = 'qb-explanation';
      if (opt.correct) div.classList.add('is-correct');
      else if (selectedKey === opt.key) div.classList.add('is-wrong');
      div.innerHTML = '<strong>' + escapeHtml(opt.key) + (opt.correct ? ' (correct)' : '') + '</strong>' +
        escapeHtml(opt.explanation || 'No explanation provided.');
      container.appendChild(div);
    });
  }

  function renderImage(fig, question) {
    if (!question.image) {
      fig.hidden = true;
      return;
    }
    fig.hidden = false;
    var btn = fig.querySelector('.figure-zoom');
    var img = fig.querySelector('img');
    var src = question.image;
    if (src.charAt(0) === '/') src = assetUrl(src);
    img.src = src;
    img.alt = 'Question image';
    btn.setAttribute('data-full', src);
  }

  function renderAttribution(el, question) {
    var url = question.source_url || 'https://www.pathologyoutlines.com/review-questions';
    el.innerHTML = 'Source: <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">PathologyOutlines.com</a>' +
      (question.po_chapter ? ' · ' + escapeHtml(question.po_chapter) : '') +
      ' · Content © PathologyOutlines.com, Inc.';
  }

  function renderRelated(el, question) {
    if (!question.related_disease) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var href = assetUrl('/diseases/' + question.related_disease + '/');
    el.innerHTML = 'Related notebook entry: <a href="' + escapeHtml(href) + '">' +
      escapeHtml(question.related_disease.replace(/-/g, ' ')) + '</a>';
  }

  global.QBQuiz = {
    loadManifest: loadManifest,
    loadBank: loadBank,
    loadBySids: loadBySids,
    slugForSid: slugForSid,
    prepareSession: prepareSession,
    countBySid: countBySid,
    findRelated: findRelated,
    modeLabel: modeLabel,
    renderStem: renderStem,
    renderOptions: renderOptions,
    renderExplanations: renderExplanations,
    renderImage: renderImage,
    renderAttribution: renderAttribution,
    renderRelated: renderRelated,
    shuffle: shuffle,
    assetUrl: assetUrl
  };
})(window);
