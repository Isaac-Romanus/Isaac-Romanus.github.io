/* IndexedDB storage for question bank user state. */
(function (global) {
  var DB_NAME = 'pathology_notebook_qb';
  var DB_VERSION = 1;
  var dbPromise = null;

  var STORES = {
    profiles: { keyPath: 'id', indexes: [] },
    attempts: { keyPath: 'id', indexes: ['profileId', 'questionId', 'sid', 'ts'] },
    bookmarks: { keyPath: ['profileId', 'questionId'], indexes: ['profileId'] },
    leitner: { keyPath: ['profileId', 'questionId'], indexes: ['profileId', 'box'] },
    customQuestions: { keyPath: 'id', indexes: ['po_subspecialty_id'] },
    examSessions: { keyPath: 'id', indexes: ['profileId', 'ts'] }
  };

  function uid() {
    return 'qb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        Object.keys(STORES).forEach(function (name) {
          if (db.objectStoreNames.contains(name)) return;
          var cfg = STORES[name];
          var store = db.createObjectStore(name, { keyPath: cfg.keyPath });
          (cfg.indexes || []).forEach(function (idx) {
            if (!store.indexNames.contains(idx)) store.createIndex(idx, idx, { unique: false });
          });
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Failed to open IndexedDB')); };
    });
    return dbPromise;
  }

  function tx(storeNames, mode) {
    return openDb().then(function (db) {
      return db.transaction(storeNames, mode || 'readonly');
    });
  }

  function promisifyRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function getAll(storeName) {
    return tx([storeName]).then(function (t) {
      return promisifyRequest(t.objectStore(storeName).getAll());
    });
  }

  function put(storeName, value) {
    return tx([storeName], 'readwrite').then(function (t) {
      return promisifyRequest(t.objectStore(storeName).put(value));
    });
  }

  function remove(storeName, key) {
    return tx([storeName], 'readwrite').then(function (t) {
      return promisifyRequest(t.objectStore(storeName).delete(key));
    });
  }

  function getByIndex(storeName, indexName, value) {
    return tx([storeName]).then(function (t) {
      return promisifyRequest(t.objectStore(storeName).index(indexName).getAll(value));
    });
  }

  var ACTIVE_KEY = 'pn_qb_active_profile';

  function getActiveProfileId() {
    try { return localStorage.getItem(ACTIVE_KEY); } catch (e) { return null; }
  }

  function setActiveProfileId(id) {
    try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {}
  }

  function listProfiles() {
    return getAll('profiles').then(function (rows) {
      return (rows || []).sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
    });
  }

  function createProfile(name) {
    var profile = { id: uid(), name: name.trim(), createdAt: Date.now() };
    return put('profiles', profile).then(function () { return profile; });
  }

  /* Resolve the active profile if one was explicitly chosen.
     Never auto-creates a "Default" profile — callers must gate until the user picks/creates one. */
  function ensureProfile() {
    return listProfiles().then(function (profiles) {
      var activeId = getActiveProfileId();
      var active = profiles.find(function (p) { return p.id === activeId; });
      if (active) return active;
      // Stale localStorage pointer — clear it; do not invent a profile.
      if (activeId) setActiveProfileId('');
      return null;
    });
  }

  function recordAttempt(profileId, data) {
    var row = {
      id: uid(),
      profileId: profileId,
      questionId: data.questionId,
      sid: data.sid,
      mode: data.mode,
      correct: !!data.correct,
      selectedKey: data.selectedKey || null,
      ts: Date.now()
    };
    return put('attempts', row);
  }

  function getAttemptsForProfile(profileId) {
    return getByIndex('attempts', 'profileId', profileId);
  }

  function getWrongQuestionIds(profileId) {
    return getAttemptsForProfile(profileId).then(function (rows) {
      var map = {};
      (rows || []).forEach(function (r) {
        if (!map[r.questionId]) map[r.questionId] = { wrong: 0, correct: 0, last: r };
        if (r.correct) map[r.questionId].correct += 1;
        else map[r.questionId].wrong += 1;
        if (r.ts >= (map[r.questionId].last.ts || 0)) map[r.questionId].last = r;
      });
      return Object.keys(map).filter(function (qid) {
        var s = map[qid];
        return s.last && !s.last.correct;
      });
    });
  }

  function getAnsweredQuestionIds(profileId) {
    return getAttemptsForProfile(profileId).then(function (rows) {
      var set = {};
      (rows || []).forEach(function (r) { set[r.questionId] = true; });
      return Object.keys(set);
    });
  }

  function toggleBookmark(profileId, questionId) {
    var key = [profileId, questionId];
    return tx(['bookmarks'], 'readwrite').then(function (t) {
      var store = t.objectStore('bookmarks');
      return promisifyRequest(store.get(key)).then(function (existing) {
        if (existing) return promisifyRequest(store.delete(key)).then(function () { return false; });
        return promisifyRequest(store.put({ profileId: profileId, questionId: questionId, ts: Date.now() }))
          .then(function () { return true; });
      });
    });
  }

  function isBookmarked(profileId, questionId) {
    return tx(['bookmarks']).then(function (t) {
      return promisifyRequest(t.objectStore('bookmarks').get([profileId, questionId]));
    }).then(function (row) { return !!row; });
  }

  function getBookmarks(profileId) {
    return getByIndex('bookmarks', 'profileId', profileId);
  }

  function getLeitnerBox(profileId, questionId) {
    return tx(['leitner']).then(function (t) {
      return promisifyRequest(t.objectStore('leitner').get([profileId, questionId]));
    });
  }

  function setLeitnerBox(profileId, questionId, box, sid) {
    return put('leitner', {
      profileId: profileId,
      questionId: questionId,
      box: box,
      sid: sid,
      updatedAt: Date.now()
    });
  }

  function getLeitnerForProfile(profileId) {
    return getByIndex('leitner', 'profileId', profileId);
  }

  function saveCustomQuestion(question) {
    if (!question.id) question.id = 'custom-' + uid();
    question.source = question.source || 'custom';
    question.createdAt = Date.now();
    return put('customQuestions', question).then(function () { return question; });
  }

  function getCustomQuestions() {
    return getAll('customQuestions');
  }

  function saveExamSession(session) {
    if (!session.id) session.id = uid();
    session.ts = Date.now();
    return put('examSessions', session);
  }

  function exportBackup(profileId) {
    return Promise.all([
      listProfiles(),
      getAttemptsForProfile(profileId),
      getBookmarks(profileId),
      getLeitnerForProfile(profileId),
      getCustomQuestions(),
      getAll('examSessions').then(function (rows) {
        return (rows || []).filter(function (r) { return r.profileId === profileId; });
      })
    ]).then(function (parts) {
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        activeProfileId: profileId,
        profiles: parts[0],
        attempts: parts[1],
        bookmarks: parts[2],
        leitner: parts[3],
        customQuestions: parts[4],
        examSessions: parts[5]
      };
    });
  }

  function importBackup(data) {
    if (!data || data.version !== 1) {
      return Promise.reject(new Error('Unsupported backup format.'));
    }
    var stores = [];
    if (data.profiles) stores.push('profiles');
    if (data.attempts) stores.push('attempts');
    if (data.bookmarks) stores.push('bookmarks');
    if (data.leitner) stores.push('leitner');
    if (data.customQuestions) stores.push('customQuestions');
    if (data.examSessions) stores.push('examSessions');

    return tx(stores, 'readwrite').then(function (t) {
      var ops = [];
      if (data.profiles) {
        data.profiles.forEach(function (row) {
          ops.push(promisifyRequest(t.objectStore('profiles').put(row)));
        });
      }
      if (data.attempts) {
        data.attempts.forEach(function (row) {
          ops.push(promisifyRequest(t.objectStore('attempts').put(row)));
        });
      }
      if (data.bookmarks) {
        data.bookmarks.forEach(function (row) {
          ops.push(promisifyRequest(t.objectStore('bookmarks').put(row)));
        });
      }
      if (data.leitner) {
        data.leitner.forEach(function (row) {
          ops.push(promisifyRequest(t.objectStore('leitner').put(row)));
        });
      }
      if (data.customQuestions) {
        data.customQuestions.forEach(function (row) {
          ops.push(promisifyRequest(t.objectStore('customQuestions').put(row)));
        });
      }
      if (data.examSessions) {
        data.examSessions.forEach(function (row) {
          ops.push(promisifyRequest(t.objectStore('examSessions').put(row)));
        });
      }
      return Promise.all(ops);
    }).then(function () {
      if (data.activeProfileId) setActiveProfileId(data.activeProfileId);
    });
  }

  global.QBStorage = {
    uid: uid,
    ensureProfile: ensureProfile,
    listProfiles: listProfiles,
    createProfile: createProfile,
    getActiveProfileId: getActiveProfileId,
    setActiveProfileId: setActiveProfileId,
    recordAttempt: recordAttempt,
    getAttemptsForProfile: getAttemptsForProfile,
    getWrongQuestionIds: getWrongQuestionIds,
    getAnsweredQuestionIds: getAnsweredQuestionIds,
    toggleBookmark: toggleBookmark,
    isBookmarked: isBookmarked,
    getBookmarks: getBookmarks,
    getLeitnerBox: getLeitnerBox,
    setLeitnerBox: setLeitnerBox,
    getLeitnerForProfile: getLeitnerForProfile,
    saveCustomQuestion: saveCustomQuestion,
    getCustomQuestions: getCustomQuestions,
    saveExamSession: saveExamSession,
    exportBackup: exportBackup,
    importBackup: importBackup
  };
})(window);
