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
    if (mode === 'flagged') {
      return global.QBStorage.getBookmarks(profileId).then(function (rows) {
        var set = {};
        (rows || []).forEach(function (r) { set[r.questionId] = true; });
        return questions.filter(function (q) { return set[q.id]; });
      });
    }
    return Promise.resolve(questions);
  }

  function loadAllBanks() {
    return loadManifest().then(function (manifest) {
      var banks = manifest.banks || {};
      var slugs = Object.keys(banks);
      return Promise.all(slugs.map(loadBank)).then(function (parts) {
        return parts.reduce(function (acc, qs) { return acc.concat(qs); }, []);
      });
    });
  }

  function prepareSession(opts) {
    var sids = opts.sids || (opts.sid ? [opts.sid] : []);
    var mode = opts.mode || 'practice';
    var count = opts.count || null;
    var tag = opts.tag || null;
    var profileId = opts.profileId;

    // Flagged review can span all banks when no sid filter is provided.
    var staticPromise = (mode === 'flagged' && !sids.length)
      ? loadAllBanks()
      : loadBySids(sids);

    return Promise.all([staticPromise, loadCustomQuestions(sids.length ? sids : null)]).then(function (parts) {
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
        // Keep flagged order stable (bookmark order approximated by bank order).
        var pool = mode === 'flagged' ? filtered : shuffle(filtered);
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
      tag: 'Tag quiz',
      flagged: 'Flagged'
    };
    return labels[mode] || mode;
  }

  var GENERIC_EXPL_RE = /this option is incorrect\. review the correct-answer|see pathologyoutlines\.com for/i;

  function isMeaningfulExplanation(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    if (GENERIC_EXPL_RE.test(t)) return false;
    return true;
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

    (question.options || []).forEach(function (opt) {
      var label = document.createElement('label');
      label.className = 'qb-option';
      if (reveal) {
        if (opt.correct) label.classList.add('is-reveal-correct');
        if (selected === opt.key && !opt.correct) label.classList.add('is-wrong');
        if (selected === opt.key && opt.correct) label.classList.add('is-correct');
      }

      // Letter on its own row (left), independent of option text length.
      var key = document.createElement('span');
      key.className = 'qb-option-key';
      key.textContent = opt.key + '.';

      var body = document.createElement('span');
      body.className = 'qb-option-body';

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'qb-answer';
      input.value = opt.key;
      input.disabled = disabled;
      if (selected === opt.key) input.checked = true;
      input.setAttribute('aria-label', 'Option ' + opt.key);

      var text = document.createElement('span');
      text.className = 'qb-option-text';
      text.textContent = opt.text;

      body.appendChild(input);
      body.appendChild(text);
      label.appendChild(key);
      label.appendChild(body);
      form.appendChild(label);
    });
  }

  function renderExplanations(container, question, selectedKey) {
    container.innerHTML = '';
    container.hidden = false;
    (question.options || []).forEach(function (opt) {
      var meaningful = isMeaningfulExplanation(opt.explanation);
      var isSelectedWrong = selectedKey === opt.key && !opt.correct;
      // Always show the correct answer; include wrong answers that have real explanations
      // (and always include the option the user picked, even if generic).
      if (!opt.correct && !meaningful && !isSelectedWrong) return;

      var div = document.createElement('div');
      div.className = 'qb-explanation';
      if (opt.correct) div.classList.add('is-correct');
      else if (isSelectedWrong) div.classList.add('is-wrong');
      var body = meaningful
        ? opt.explanation
        : (opt.explanation || 'No explanation provided.');
      div.innerHTML = '<strong>' + escapeHtml(opt.key) + (opt.correct ? ' (correct)' : '') + '</strong>' +
        escapeHtml(body);
      container.appendChild(div);
    });
  }

  function clearExplanations(container) {
    if (!container) return;
    container.innerHTML = '';
    container.hidden = true;
  }

  /** Normalize legacy `image` string and `images` array into [{src, alt, caption}]. */
  function normalizeImages(question) {
    var list = [];
    if (Array.isArray(question.images)) {
      question.images.forEach(function (item) {
        if (!item) return;
        if (typeof item === 'string') {
          if (item) list.push({ src: item, alt: '', caption: '', source_url: '' });
        } else if (item.src) {
          list.push({
            src: item.src,
            alt: item.alt || item.caption || 'Question image',
            caption: item.caption || '',
            source_url: item.source_url || ''
          });
        }
      });
    }
    if (!list.length && question.image) {
      list.push({
        src: question.image,
        alt: question.image_alt || 'Question image',
        caption: question.image_caption || ''
      });
    }
    return list;
  }

  function resolveImageSrc(src) {
    if (!src) return '';
    // Absolute http(s), data:, blob: — use as-is (PO hotlinks + custom uploads).
    if (/^(https?:|data:|blob:)/i.test(src)) return src;
    if (src.charAt(0) === '/') return assetUrl(src);
    return assetUrl('/' + src);
  }

  function renderImages(container, question) {
    if (!container) return;
    var gallery = container.querySelector('.qb-image-gallery') || container;
    var images = normalizeImages(question);
    var qId = question && question.id ? String(question.id) : '';
    gallery.innerHTML = '';
    if (!images.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    images.forEach(function (item, idx) {
      var src = resolveImageSrc(item.src);
      // Prefer original PO URL for attribution / fallback when local file fails.
      var sourceUrl = item.source_url || ( /^(https?:)/i.test(item.src || '') ? item.src : '' );
      var figure = document.createElement('figure');
      figure.className = 'qb-question-image figure';
      figure.setAttribute('data-image-index', String(idx));
      if (qId) figure.setAttribute('data-question-id', qId);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'figure-zoom qb-image-zoom';
      btn.setAttribute('data-full', src);
      btn.setAttribute('aria-label', 'Open image ' + (idx + 1) + ' in zoom viewer');
      var img = document.createElement('img');
      img.src = src;
      img.alt = item.alt || ('Question image ' + (idx + 1));
      img.loading = 'lazy';
      // Avoid PO hotlink blocks that key off Referer from GitHub Pages.
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.onerror = function () {
        // Fall back to original remote URL once if local path failed.
        if (sourceUrl && img.getAttribute('data-fallback') !== '1' && src !== sourceUrl) {
          img.setAttribute('data-fallback', '1');
          img.referrerPolicy = 'no-referrer';
          img.src = sourceUrl;
          btn.setAttribute('data-full', sourceUrl);
          return;
        }
        figure.classList.add('is-broken');
        if (!figure.querySelector('.qb-image-error')) {
          var err = document.createElement('p');
          err.className = 'qb-image-error muted small';
          var link = sourceUrl || src;
          err.innerHTML = 'Image failed to load.' +
            (link ? ' <a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">Open image link</a>' : '');
          figure.appendChild(err);
        }
      };
      btn.appendChild(img);
      figure.appendChild(btn);
      if (item.caption) {
        var cap = document.createElement('figcaption');
        var span = document.createElement('span');
        span.className = 'fig-caption';
        span.textContent = item.caption;
        cap.appendChild(span);
        figure.appendChild(cap);
      }
      gallery.appendChild(figure);
    });
  }

  // Backward-compatible alias used by older call sites.
  function renderImage(container, question) {
    renderImages(container, question);
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
    clearExplanations: clearExplanations,
    isMeaningfulExplanation: isMeaningfulExplanation,
    renderImage: renderImage,
    renderImages: renderImages,
    normalizeImages: normalizeImages,
    resolveImageSrc: resolveImageSrc,
    renderAttribution: renderAttribution,
    renderRelated: renderRelated,
    shuffle: shuffle,
    assetUrl: assetUrl
  };
})(window);
