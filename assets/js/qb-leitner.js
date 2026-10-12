/* Leitner spaced repetition — 5 boxes. */
(function (global) {
  var MAX_BOX = 5;

  var INTERVALS = {
    1: 0,
    2: 1,
    3: 3,
    4: 7,
    5: 14
  };

  function advanceBox(current, correct) {
    var box = current || 1;
    if (correct) return Math.min(MAX_BOX, box + 1);
    return 1;
  }

  function isDue(entry) {
    if (!entry) return true;
    var box = entry.box || 1;
    var days = INTERVALS[box] || 0;
    if (days === 0) return true;
    var updated = entry.updatedAt || 0;
    var dueAt = updated + days * 24 * 60 * 60 * 1000;
    return Date.now() >= dueAt;
  }

  function pickDueQuestions(allQuestions, leitnerRows, profileId) {
    var map = {};
    (leitnerRows || []).forEach(function (r) {
      if (r.profileId === profileId) map[r.questionId] = r;
    });

    var due = [];
    var fresh = [];

    (allQuestions || []).forEach(function (q) {
      var entry = map[q.id];
      if (!entry) fresh.push(q);
      else if (isDue(entry)) due.push({ question: q, box: entry.box || 1 });
    });

    due.sort(function (a, b) { return a.box - b.box; });
    var ordered = due.map(function (d) { return d.question; }).concat(fresh);
    return ordered;
  }

  function boxLabel(box) {
    return 'Box ' + (box || 1) + ' / ' + MAX_BOX;
  }

  global.QBLeitner = {
    MAX_BOX: MAX_BOX,
    advanceBox: advanceBox,
    isDue: isDue,
    pickDueQuestions: pickDueQuestions,
    boxLabel: boxLabel
  };
})(window);
