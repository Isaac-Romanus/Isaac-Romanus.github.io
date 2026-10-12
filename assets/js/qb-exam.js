/* Exam mode — timer, deferred feedback, results summary. */
(function (global) {
  var timerId = null;
  var endsAt = 0;

  function startTimer(minutes, el, onExpire) {
    stopTimer();
    if (!minutes || minutes <= 0) {
      if (el) el.hidden = true;
      return;
    }
    endsAt = Date.now() + minutes * 60 * 1000;
    if (el) {
      el.hidden = false;
      tick(el, onExpire);
      timerId = setInterval(function () { tick(el, onExpire); }, 1000);
    }
  }

  function tick(el, onExpire) {
    var remain = Math.max(0, endsAt - Date.now());
    var sec = Math.ceil(remain / 1000);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    el.textContent = m + ':' + String(s).padStart(2, '0');
    el.classList.toggle('is-low', sec <= 60);
    if (remain <= 0) {
      stopTimer();
      if (onExpire) onExpire();
    }
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function gradeExam(questions, answers) {
    var correct = 0;
    var breakdown = (questions || []).map(function (q, i) {
      var selected = answers[i];
      var correctOpt = (q.options || []).find(function (o) { return o.correct; });
      var isCorrect = correctOpt && selected === correctOpt.key;
      if (isCorrect) correct += 1;
      return {
        question: q,
        selected: selected,
        correct: isCorrect,
        correctKey: correctOpt ? correctOpt.key : null
      };
    });
    return {
      total: questions.length,
      correct: correct,
      pct: questions.length ? Math.round((correct / questions.length) * 100) : 0,
      breakdown: breakdown
    };
  }

  function renderResults(container, result, showExplanations) {
    container.innerHTML = '';
    container.hidden = false;

    var h = document.createElement('h2');
    h.className = 'qb-exam-score';
    h.textContent = result.correct + ' / ' + result.total + ' (' + result.pct + '%)';
    container.appendChild(h);

    var p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Exam complete. Review your answers below.';
    container.appendChild(p);

    var list = document.createElement('div');
    list.className = 'qb-exam-breakdown';

    result.breakdown.forEach(function (row, idx) {
      var item = document.createElement('details');
      item.className = 'qb-explanation';
      item.open = !row.correct;
      var summary = document.createElement('summary');
      summary.innerHTML = '<strong>Q' + (idx + 1) + ':</strong> ' +
        (row.correct ? '✓ Correct' : '✗ Incorrect (you: ' + (row.selected || '—') + ', answer: ' + row.correctKey + ')');
      item.appendChild(summary);

      var stem = document.createElement('p');
      stem.textContent = row.question.stem;
      item.appendChild(stem);

      if (showExplanations && global.QBQuiz) {
        var exp = document.createElement('div');
        global.QBQuiz.renderExplanations(exp, row.question, row.selected);
        exp.hidden = false;
        item.appendChild(exp);
      }

      list.appendChild(item);
    });

    container.appendChild(list);

    var back = document.createElement('p');
    back.innerHTML = '<a class="btn btn-secondary" href="' +
      global.QBQuiz.assetUrl('/questionbank/') + '">Back to question bank</a>';
    container.appendChild(back);
  }

  global.QBExam = {
    startTimer: startTimer,
    stopTimer: stopTimer,
    gradeExam: gradeExam,
    renderResults: renderResults
  };
})(window);
