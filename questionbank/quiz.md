---
layout: questionbank
title: Quiz
permalink: /questionbank/quiz/
qb_page: quiz
---

<section class="qb-quiz-wrap wrap">
  <nav class="crumbs"><a href="{{ '/questionbank/' | relative_url }}">Question bank</a> <span>/</span> <span id="qb-quiz-crumb">Quiz</span></nav>

  <div id="qb-quiz-loading" class="empty-state">Loading questions…</div>
  <div id="qb-quiz-empty" class="empty-state" hidden>No questions match this session. <a href="{{ '/questionbank/' | relative_url }}">Back to question bank</a></div>

  <div id="qb-quiz-app" class="qb-quiz-app" hidden>
    <header class="qb-quiz-header">
      <div class="qb-quiz-meta">
        <span id="qb-quiz-mode-label" class="badge badge-field"></span>
      </div>
      <div class="qb-quiz-tools">
        <span id="qb-exam-timer" class="qb-exam-timer" hidden></span>
        <div class="qb-flag-tools">
          <button type="button" id="qb-flag-btn" class="btn btn-ghost btn-sm" title="Flag this question for later review" aria-pressed="false">⚑ Flag</button>
          <button type="button" id="qb-flagged-list-btn" class="btn btn-secondary btn-sm" aria-expanded="false" aria-controls="qb-flagged-panel">
            Flagged <span id="qb-flagged-count" class="qb-flagged-count">0</span>
          </button>
          <div id="qb-flagged-panel" class="qb-flagged-panel" hidden role="dialog" aria-label="Flagged questions">
            <p class="qb-flagged-heading">In this quiz</p>
            <ul id="qb-flagged-list" class="qb-flagged-list"></ul>
            <p id="qb-flagged-empty" class="muted small">No flagged questions in this quiz yet. Tap Flag on any question to save it.</p>
            <p id="qb-flagged-extra" class="muted small" hidden></p>
            <a id="qb-review-flagged-link" class="btn btn-primary btn-sm" href="{{ '/questionbank/quiz/' | relative_url }}?mode=flagged">Review all flagged</a>
          </div>
        </div>
        <button type="button" id="qb-end-session" class="btn btn-ghost btn-sm">End session</button>
      </div>
    </header>

    <div class="qb-progress-block">
      <div class="qb-progress-top">
        <p id="qb-progress-label" class="qb-progress-label">Question 0 of 0</p>
        <p id="qb-progress-sub" class="qb-progress-sub muted small">0 answered</p>
      </div>
      <div
        class="qb-progress"
        role="progressbar"
        id="qb-progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="0"
        aria-labelledby="qb-progress-label"
      >
        <div id="qb-progress-bar" class="qb-progress-bar"></div>
      </div>
    </div>

    <article class="qb-question-card">
      <div id="qb-question-stem" class="qb-stem"></div>
      <div id="qb-question-images" class="qb-question-images" hidden>
        <p class="qb-images-hint muted small">Click an image to zoom and pan · scroll/pinch to zoom · drag when zoomed</p>
        <div id="qb-question-image-gallery" class="qb-image-gallery"></div>
      </div>
      <form id="qb-options-form" class="qb-options"></form>
      <div class="qb-quiz-actions">
        <button type="button" id="qb-prev-btn" class="btn btn-secondary">← Previous</button>
        <button type="submit" form="qb-options-form" id="qb-submit-btn" class="btn btn-primary">Submit answer</button>
        <button type="button" id="qb-next-btn" class="btn btn-secondary" hidden>Next question →</button>
        <button type="button" id="qb-finish-exam-btn" class="btn btn-primary" hidden>Finish exam</button>
      </div>
      <div id="qb-explanations" class="qb-explanations" hidden></div>
      <footer class="qb-question-footer">
        <p id="qb-attribution" class="qb-attribution muted"></p>
        <p id="qb-related-disease" class="qb-related" hidden></p>
      </footer>
    </article>
  </div>

  <div id="qb-exam-results" class="qb-exam-results" hidden></div>
</section>

<div id="qb-profile-modal" class="qb-modal" hidden role="dialog" aria-modal="true" aria-labelledby="qb-profile-title">
  <div class="qb-modal-backdrop" data-close-modal></div>
  <div class="qb-modal-panel">
    <h2 id="qb-profile-title">Choose a study profile</h2>
    <p class="muted">Select or create a profile before quizzing.</p>
    <div id="qb-profile-list" class="qb-profile-list"></div>
    <form id="qb-new-profile-form" class="qb-inline-form">
      <input type="text" id="qb-new-profile-name" placeholder="New profile name" required maxlength="40" aria-label="New profile name">
      <button type="submit" class="btn btn-primary">Create &amp; start</button>
    </form>
  </div>
</div>
