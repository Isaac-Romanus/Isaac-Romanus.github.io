/* Question bank — page router, profile gate, quiz UI. */
(function () {
  var cfg = window.PN_QB || {};
  var page = cfg.page || 'index';
  var profile = null;
  var session = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function showModal() {
    var modal = $('#qb-profile-modal');
    if (modal) modal.hidden = false;
  }

  function hideModal() {
    var modal = $('#qb-profile-modal');
    if (modal) modal.hidden = true;
  }

  function updateProfileBar() {
    var bar = $('#qb-profile-bar');
    var nameEl = $('#qb-active-profile-name');
    if (!profile || !bar) return;
    bar.hidden = false;
    if (nameEl) nameEl.textContent = profile.name;
  }

  function renderProfileList() {
    var list = $('#qb-profile-list');
    if (!list || !window.QBStorage) return;
    window.QBStorage.listProfiles().then(function (profiles) {
      list.innerHTML = '';
      profiles.forEach(function (p) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qb-profile-item' + (profile && profile.id === p.id ? ' is-active' : '');
        btn.innerHTML = '<span>' + esc(p.name) + '</span><span class="muted">Select</span>';
        btn.addEventListener('click', function () {
          window.QBStorage.setActiveProfileId(p.id);
          profile = p;
          hideModal();
          updateProfileBar();
          onProfileReady();
        });
        list.appendChild(btn);
      });
    });
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function bindProfileForm() {
    var form = $('#qb-new-profile-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#qb-new-profile-name');
      var name = input ? input.value.trim() : '';
      if (!name) return;
      window.QBStorage.createProfile(name).then(function (p) {
        window.QBStorage.setActiveProfileId(p.id);
        profile = p;
        if (input) input.value = '';
        hideModal();
        updateProfileBar();
        onProfileReady();
      });
    });
  }

  var profileGateRequired = false;

  function bindModalClose() {
    $all('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', function () {
        // On gated pages, closing without a profile is not allowed.
        if (profileGateRequired && !profile) {
          alert('Enter a study profile name before starting.');
          return;
        }
        hideModal();
      });
    });
  }

  function requireProfile(gate) {
    profileGateRequired = !!gate;
    return window.QBStorage.ensureProfile().then(function (p) {
      profile = p;
      updateProfileBar();
      renderProfileList();
      bindProfileForm();
      bindModalClose();

      var switchBtn = $('#qb-switch-profile');
      if (switchBtn) switchBtn.addEventListener('click', function () {
        profileGateRequired = false;
        renderProfileList();
        showModal();
      });

      if (gate && !profile) {
        showModal();
        return;
      }
      if (profile) onProfileReady();
      else if (!gate) onProfileReady();
      else showModal();
    }).catch(function (err) {
      console.error(err);
      alert('Could not initialize question bank storage: ' + err.message);
    });
  }

  function onProfileReady() {
    if (page === 'index') initIndex();
    else if (page === 'dashboard') initDashboard();
    else if (page === 'mixed') initMixed();
    else if (page === 'exam') initExamSetup();
    else if (page === 'quiz') initQuiz();
    else if (page === 'add') initAdd();
  }

  function initIndex() {
    if (!window.QBQuiz) return;
    var subs = cfg.subspecialties || [];
    subs.forEach(function (sub) {
      window.QBQuiz.countBySid(sub.slug).then(function (n) {
        var el = document.querySelector('.qb-local-count[data-sid="' + sub.sid + '"]');
        if (el) el.textContent = n ? n + ' loaded locally' : 'No local bank yet';
      });
    });
  }

  function initDashboard() {
    var statsEl = $('#qb-dashboard-stats');
    var recentEl = $('#qb-recent-attempts');
    var summaryEl = $('#qb-dashboard-summary');
    if (!statsEl || !window.QBStorage || !profile) return;

    Promise.all([
      window.QBStorage.getAttemptsForProfile(profile.id),
      window.QBStorage.getWrongQuestionIds(profile.id),
      window.QBStorage.getBookmarks(profile.id),
      window.QBStorage.getLeitnerForProfile(profile.id),
      window.QBQuiz ? window.QBQuiz.loadManifest().catch(function () { return { banks: {} }; }) : { banks: {} }
    ]).then(function (parts) {
      var attempts = parts[0] || [];
      var wrongIds = parts[1] || [];
      var bookmarks = parts[2] || [];
      var leitner = parts[3] || [];
      renderDashboardSummary(summaryEl, attempts, wrongIds, bookmarks, leitner);
      renderDashboardStats(statsEl, attempts);
      renderRecentAttempts(recentEl, attempts);
    });

    var exportBtn = $('#qb-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        window.QBStorage.exportBackup(profile.id).then(function (data) {
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'pathology-notebook-qb-backup.json';
          a.click();
          URL.revokeObjectURL(a.href);
        });
      });
    }

    var importInput = $('#qb-import-input');
    if (importInput) {
      importInput.addEventListener('change', function () {
        var file = importInput.files && importInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(reader.result);
            window.QBStorage.importBackup(data).then(function () {
              alert('Backup imported successfully.');
              initDashboard();
            });
          } catch (e) {
            alert('Invalid backup file.');
          }
        };
        reader.readAsText(file);
        importInput.value = '';
      });
    }
  }

  function renderDashboardSummary(el, attempts, wrongIds, bookmarks, leitner) {
    if (!el) return;
    var correct = attempts.filter(function (a) { return a.correct; }).length;
    var accuracy = attempts.length ? Math.round((correct / attempts.length) * 100) : 0;
    var boxCounts = [0, 0, 0, 0, 0];
    (leitner || []).forEach(function (row) {
      var box = Math.max(1, Math.min(5, row.box || 1));
      boxCounts[box - 1] += 1;
    });
    el.innerHTML =
      '<article class="qb-summary-card"><h3>Attempts</h3><p class="qb-summary-value">' + attempts.length + '</p></article>' +
      '<article class="qb-summary-card"><h3>Accuracy</h3><p class="qb-summary-value">' + (attempts.length ? accuracy + '%' : '—') + '</p></article>' +
      '<article class="qb-summary-card"><h3>Still wrong</h3><p class="qb-summary-value">' + wrongIds.length + '</p>' +
        '<a class="btn btn-ghost btn-sm" href="' + (window.QBQuiz ? window.QBQuiz.assetUrl('/questionbank/quiz/?mode=review&sids=' + (cfg.subspecialties || []).map(function (s) { return s.sid; }).join(',')) : '#') + '">Review</a></article>' +
      '<article class="qb-summary-card"><h3>Bookmarks</h3><p class="qb-summary-value">' + bookmarks.length + '</p></article>' +
      '<article class="qb-summary-card qb-summary-leitner"><h3>Leitner boxes</h3>' +
        '<div class="qb-leitner-bars">' + boxCounts.map(function (n, i) {
          return '<span title="Box ' + (i + 1) + ': ' + n + '"><em>B' + (i + 1) + '</em><strong>' + n + '</strong></span>';
        }).join('') + '</div></article>';
  }

  function renderDashboardStats(el, attempts) {
    var subs = cfg.subspecialties || [];
    var bySid = {};
    attempts.forEach(function (a) {
      if (!bySid[a.sid]) bySid[a.sid] = { total: 0, correct: 0 };
      bySid[a.sid].total += 1;
      if (a.correct) bySid[a.sid].correct += 1;
    });

    el.innerHTML = '';
    subs.forEach(function (sub) {
      var s = bySid[sub.sid] || { total: 0, correct: 0 };
      var pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      var card = document.createElement('article');
      card.className = 'qb-stat-card';
      card.innerHTML =
        '<h3>' + esc(sub.name) + '</h3>' +
        '<div class="qb-stat-row"><span>Attempts</span><span>' + s.total + '</span></div>' +
        '<div class="qb-stat-row"><span>Accuracy</span><span>' + (s.total ? pct + '%' : '—') + '</span></div>' +
        '<div class="qb-stat-bar"><span style="width:' + pct + '%"></span></div>';
      el.appendChild(card);
    });

    if (!subs.length) {
      el.innerHTML = '<p class="empty-state">No subspecialties configured.</p>';
    }
  }

  function renderRecentAttempts(el, attempts) {
    if (!el) return;
    var recent = attempts.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 15);
    if (!recent.length) {
      el.innerHTML = '<p class="muted">No attempts yet.</p>';
      return;
    }
    el.innerHTML = '';
    recent.forEach(function (a) {
      var div = document.createElement('div');
      div.className = 'qb-recent-item';
      div.textContent = new Date(a.ts).toLocaleString() + ' · Q ' + a.questionId +
        ' · ' + (a.correct ? 'correct' : 'wrong') + ' · ' + (a.mode || 'practice');
      el.appendChild(div);
    });
  }

  function initMixed() {
    var form = $('#qb-mixed-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var sids = $all('input[name="sid"]:checked', form).map(function (el) { return el.value; });
      if (sids.length < 2) {
        alert('Select at least two subspecialties.');
        return;
      }
      var count = $('#qb-mixed-count').value;
      var mode = $('#qb-mixed-mode').value;
      var tag = $('#qb-mixed-tag').value;
      var params = new URLSearchParams({
        mode: mode,
        sids: sids.join(','),
        count: count
      });
      if (tag) params.set('tag', tag);
      window.location.href = window.QBQuiz.assetUrl('/questionbank/quiz/?' + params.toString());
    });
  }

  function initExamSetup() {
    var form = $('#qb-exam-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var select = $('#qb-exam-sids');
      var sids = Array.prototype.map.call(select.selectedOptions, function (o) { return o.value; });
      if (!sids.length) {
        alert('Select at least one subspecialty.');
        return;
      }
      var params = new URLSearchParams({
        mode: 'exam',
        sids: sids.join(','),
        count: $('#qb-exam-count').value
      });
      var timer = $('#qb-exam-timer-min').value;
      if (timer && Number(timer) > 0) params.set('timer', timer);
      var tag = $('#qb-exam-tag').value;
      if (tag) params.set('tag', tag);
      window.location.href = window.QBQuiz.assetUrl('/questionbank/quiz/?' + params.toString());
    });
  }

  function parseQuizParams() {
    var p = new URLSearchParams(window.location.search);
    return {
      mode: p.get('mode') || 'practice',
      sid: p.get('sid'),
      sids: (p.get('sids') || p.get('sid') || '').split(',').filter(Boolean),
      count: p.get('count') ? parseInt(p.get('count'), 10) : null,
      tag: p.get('tag') || null,
      timer: p.get('timer') ? parseInt(p.get('timer'), 10) : 0,
      field: p.get('field') || null,
      related: p.get('related') || null,
      qid: p.get('qid') || null
    };
  }

  function initQuiz() {
    var params = parseQuizParams();
    var loading = $('#qb-quiz-loading');
    var empty = $('#qb-quiz-empty');
    var app = $('#qb-quiz-app');
    var modeLabel = $('#qb-quiz-mode-label');
    var progressEl = $('#qb-quiz-progress');
    var crumb = $('#qb-quiz-crumb');

    if (crumb) crumb.textContent = window.QBQuiz.modeLabel(params.mode);
    if (modeLabel) modeLabel.textContent = window.QBQuiz.modeLabel(params.mode);

    var prepOpts = {
      sids: params.sids,
      mode: params.mode,
      count: params.count,
      tag: params.tag,
      profileId: profile.id
    };

    window.QBQuiz.prepareSession(prepOpts).then(function (questions) {
      if (params.qid) {
        questions = questions.filter(function (q) { return q.id === params.qid; });
      }
      if (loading) loading.hidden = true;
      if (!questions.length) {
        if (empty) empty.hidden = false;
        return;
      }
      if (app) app.hidden = false;

      session = {
        mode: params.mode,
        questions: questions,
        index: 0,
        answers: [],
        params: params
      };

      if (params.mode === 'exam' && params.timer && window.QBExam) {
        window.QBExam.startTimer(params.timer, $('#qb-exam-timer'), finishExam);
      }

      bindQuizControls();
      showQuestion();
    }).catch(function (err) {
      if (loading) loading.textContent = 'Error loading questions: ' + err.message;
    });
  }

  function bindQuizControls() {
    var form = $('#qb-options-form');
    var submitBtn = $('#qb-submit-btn');
    var nextBtn = $('#qb-next-btn');
    var finishBtn = $('#qb-finish-exam-btn');
    var bookmarkBtn = $('#qb-bookmark-btn');
    var endBtn = $('#qb-end-session');

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (session.mode === 'exam') submitExamAnswer();
        else submitPracticeAnswer();
      });
    }

    if (nextBtn) nextBtn.addEventListener('click', nextQuestion);
    if (finishBtn) finishBtn.addEventListener('click', finishExam);
    if (endBtn) endBtn.addEventListener('click', function () {
      if (confirm('End this session?')) {
        window.location.href = window.QBQuiz.assetUrl('/questionbank/');
      }
    });

    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', function () {
        var q = session.questions[session.index];
        window.QBStorage.toggleBookmark(profile.id, q.id).then(function (on) {
          bookmarkBtn.textContent = on ? '★ Bookmarked' : '☆ Bookmark';
        });
      });
    }
  }

  function showQuestion() {
    var q = session.questions[session.index];
    var total = session.questions.length;
    var progressEl = $('#qb-quiz-progress');
    var form = $('#qb-options-form');
    var expl = $('#qb-explanations');
    var submitBtn = $('#qb-submit-btn');
    var nextBtn = $('#qb-next-btn');
    var finishBtn = $('#qb-finish-exam-btn');
    var bookmarkBtn = $('#qb-bookmark-btn');

    if (progressEl) {
      progressEl.textContent = 'Question ' + (session.index + 1) + ' of ' + total;
    }

    window.QBQuiz.renderStem($('#qb-question-stem'), q.stem);
    window.QBQuiz.renderImages($('#qb-question-images'), q);
    window.QBQuiz.renderAttribution($('#qb-attribution'), q);
    window.QBQuiz.renderRelated($('#qb-related-disease'), q);

    var examMode = session.mode === 'exam';
    window.QBQuiz.renderOptions(form, q, {
      disabled: false,
      reveal: false,
      selected: session.answers[session.index] || null,
      examMode: examMode
    });

    if (expl) expl.hidden = true;
    if (submitBtn) submitBtn.hidden = false;
    if (nextBtn) nextBtn.hidden = true;
    if (finishBtn) {
      finishBtn.hidden = !examMode;
      finishBtn.textContent = session.index >= total - 1 ? 'Finish exam' : 'Finish early';
    }

    if (bookmarkBtn && !examMode) {
      window.QBStorage.isBookmarked(profile.id, q.id).then(function (on) {
        bookmarkBtn.textContent = on ? '★ Bookmarked' : '☆ Bookmark';
      });
    } else if (bookmarkBtn) {
      bookmarkBtn.hidden = examMode;
    }
  }

  function getSelectedKey() {
    var checked = document.querySelector('#qb-options-form input[name="qb-answer"]:checked');
    return checked ? checked.value : null;
  }

  function submitPracticeAnswer() {
    var q = session.questions[session.index];
    var selected = getSelectedKey();
    if (!selected) {
      alert('Select an answer.');
      return;
    }

    var correctOpt = (q.options || []).find(function (o) { return o.correct; });
    var correct = correctOpt && selected === correctOpt.key;

    window.QBStorage.recordAttempt(profile.id, {
      questionId: q.id,
      sid: q.po_subspecialty_id,
      mode: session.mode,
      correct: correct,
      selectedKey: selected
    });

    if (session.mode === 'leitner' && window.QBLeitner) {
      window.QBStorage.getLeitnerBox(profile.id, q.id).then(function (entry) {
        var box = window.QBLeitner.advanceBox(entry && entry.box, correct);
        window.QBStorage.setLeitnerBox(profile.id, q.id, box, q.po_subspecialty_id);
      });
    }

    window.QBQuiz.renderOptions($('#qb-options-form'), q, {
      disabled: true,
      reveal: true,
      selected: selected,
      examMode: false
    });
    window.QBQuiz.renderExplanations($('#qb-explanations'), q, selected);

    $('#qb-submit-btn').hidden = true;
    $('#qb-next-btn').hidden = false;
  }

  function submitExamAnswer() {
    var selected = getSelectedKey();
    if (!selected) {
      alert('Select an answer.');
      return;
    }
    session.answers[session.index] = selected;

    if (session.index >= session.questions.length - 1) finishExam();
    else {
      session.index += 1;
      showQuestion();
    }
  }

  function nextQuestion() {
    if (session.index >= session.questions.length - 1) {
      window.location.href = window.QBQuiz.assetUrl('/questionbank/');
      return;
    }
    session.index += 1;
    showQuestion();
  }

  function finishExam() {
    if (!window.QBExam) return;
    window.QBExam.stopTimer();

    // Capture the current question's selection, then leave truly unanswered as null.
    var currentSelection = getSelectedKey();
    if (session.answers[session.index] === undefined && currentSelection) {
      session.answers[session.index] = currentSelection;
    }
    session.questions.forEach(function (_, i) {
      if (session.answers[i] === undefined) session.answers[i] = null;
    });

    var result = window.QBExam.gradeExam(session.questions, session.answers);

    session.questions.forEach(function (q, i) {
      window.QBStorage.recordAttempt(profile.id, {
        questionId: q.id,
        sid: q.po_subspecialty_id,
        mode: 'exam',
        correct: result.breakdown[i].correct,
        selectedKey: session.answers[i]
      });
    });

    window.QBStorage.saveExamSession({
      profileId: profile.id,
      mode: 'exam',
      total: result.total,
      correct: result.correct,
      pct: result.pct,
      questionIds: session.questions.map(function (q) { return q.id; })
    });

    $('#qb-quiz-app').hidden = true;
    window.QBExam.renderResults($('#qb-exam-results'), result, true);
  }

  function initAdd() {
    var form = $('#qb-add-form');
    var yamlBtn = $('#qb-export-yaml-btn');
    var yamlOut = $('#qb-add-yaml');
    var status = $('#qb-add-status');
    var pendingImages = [];

    function renderAddPreviews() {
      var root = $('#qb-add-image-previews');
      if (!root) return;
      root.innerHTML = '';
      pendingImages.forEach(function (item, idx) {
        var figure = document.createElement('figure');
        figure.className = 'qb-question-image figure qb-add-preview';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'figure-zoom qb-image-zoom';
        btn.setAttribute('data-full', item.src);
        btn.setAttribute('aria-label', 'Preview image ' + (idx + 1));
        var img = document.createElement('img');
        img.src = item.src;
        img.alt = item.alt || 'Upload preview';
        btn.appendChild(img);
        figure.appendChild(btn);
        var tools = document.createElement('div');
        tools.className = 'qb-add-preview-tools';
        var cap = document.createElement('input');
        cap.type = 'text';
        cap.placeholder = 'Caption (optional)';
        cap.value = item.caption || '';
        cap.addEventListener('input', function () { item.caption = cap.value; });
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-ghost btn-sm';
        remove.textContent = 'Remove';
        remove.addEventListener('click', function () {
          pendingImages.splice(idx, 1);
          renderAddPreviews();
        });
        tools.appendChild(cap);
        tools.appendChild(remove);
        figure.appendChild(tools);
        root.appendChild(figure);
      });
    }

    function readFileAsDataUrl(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    var fileInput = $('#qb-add-image-files');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var files = Array.prototype.slice.call(fileInput.files || []);
        Promise.all(files.map(function (file) {
          return readFileAsDataUrl(file).then(function (dataUrl) {
            return {
              src: dataUrl,
              alt: file.name || 'Uploaded image',
              caption: '',
              name: file.name
            };
          });
        })).then(function (items) {
          pendingImages = pendingImages.concat(items);
          renderAddPreviews();
          fileInput.value = '';
        });
      });
    }

    var urlBtn = $('#qb-add-image-url-btn');
    var urlInput = $('#qb-add-image-url');
    if (urlBtn && urlInput) {
      urlBtn.addEventListener('click', function () {
        var url = urlInput.value.trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url) && !/^data:/i.test(url)) {
          alert('Enter a full http(s) image URL (PathologyOutlines links are supported).');
          return;
        }
        pendingImages.push({
          src: url,
          alt: 'Question image',
          caption: ''
        });
        urlInput.value = '';
        renderAddPreviews();
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = formToQuestion(form, pendingImages);
        window.QBStorage.saveCustomQuestion(q).then(function (saved) {
          if (status) {
            status.hidden = false;
            status.textContent = 'Saved question "' + saved.id + '" to this device' +
              (pendingImages.length ? ' with ' + pendingImages.length + ' image(s)' : '') + '.';
          }
        });
      });
    }

    if (yamlBtn) {
      yamlBtn.addEventListener('click', function () {
        var q = formToQuestion(form, pendingImages);
        var yaml = questionToYaml(q);
        if (yamlOut) {
          yamlOut.hidden = false;
          yamlOut.textContent = yaml;
        }
      });
    }
  }

  function formToQuestion(form, images) {
    var stem = $('#qb-add-stem').value.trim();
    var chapter = $('#qb-add-chapter').value.trim();
    var sid = parseInt($('#qb-add-sid').value, 10);
    var fields = ($('#qb-add-fields').value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var tags = ($('#qb-add-tags').value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var related = $('#qb-add-related').value.trim() || null;
    var correct = (form.querySelector('input[name="correct"]:checked') || {}).value || 'A';
    var letters = ['A', 'B', 'C', 'D'];
    var options = letters.map(function (L) {
      return {
        key: L,
        text: form.querySelector('[name="option_' + L + '"]').value.trim(),
        correct: L === correct,
        explanation: form.querySelector('[name="explanation_' + L + '"]').value.trim()
      };
    });
    var normalizedImages = (images || []).map(function (item) {
      return {
        src: item.src,
        alt: item.alt || 'Question image',
        caption: item.caption || ''
      };
    });
    return {
      id: 'custom-' + Date.now(),
      source: 'custom',
      source_url: null,
      po_subspecialty_id: sid,
      po_chapter: chapter,
      fields: fields,
      tags: tags,
      stem: stem,
      image: normalizedImages.length ? normalizedImages[0].src : null,
      images: normalizedImages,
      options: options,
      related_disease: related,
      explanation_status: 'complete'
    };
  }

  function questionToYaml(q) {
    var lines = ['- id: "' + q.id + '"',
      '  source: custom',
      '  po_subspecialty_id: ' + q.po_subspecialty_id,
      '  po_chapter: "' + (q.po_chapter || '').replace(/"/g, '\\"') + '"',
      '  fields: [' + (q.fields || []).map(function (f) { return '"' + f + '"'; }).join(', ') + ']',
      '  tags: [' + (q.tags || []).map(function (t) { return '"' + t + '"'; }).join(', ') + ']',
      '  stem: "' + (q.stem || '').replace(/"/g, '\\"') + '"'];
    if (q.images && q.images.length) {
      lines.push('  images:');
      q.images.forEach(function (img) {
        var src = img.src || '';
        if (src.indexOf('data:') === 0) {
          lines.push('    - src: "<data-url omitted — keep uploaded image in IndexedDB or save file under assets/images/questionbank/>"');
        } else {
          lines.push('    - src: "' + src.replace(/"/g, '\\"') + '"');
        }
        lines.push('      alt: "' + (img.alt || '').replace(/"/g, '\\"') + '"');
        lines.push('      caption: "' + (img.caption || '').replace(/"/g, '\\"') + '"');
      });
    } else {
      lines.push('  images: []');
    }
    lines.push('  options:');
    (q.options || []).forEach(function (o) {
      lines.push('    - key: "' + o.key + '"');
      lines.push('      text: "' + (o.text || '').replace(/"/g, '\\"') + '"');
      lines.push('      correct: ' + o.correct);
      lines.push('      explanation: "' + (o.explanation || '').replace(/"/g, '\\"') + '"');
    });
    lines.push('  related_disease: ' + (q.related_disease ? '"' + q.related_disease + '"' : 'null'));
    lines.push('  explanation_status: complete');
    return lines.join('\n');
  }

  ready(function () {
    if (!window.QBStorage) return;
    // Always require an explicit profile before quiz / mixed / exam / dashboard / add.
    // Index can render the grid without a profile (counts still load).
    var gatePages = ['quiz', 'mixed', 'exam', 'dashboard', 'add'];
    var needsGate = gatePages.indexOf(page) >= 0;
    requireProfile(needsGate);
  });
})();
