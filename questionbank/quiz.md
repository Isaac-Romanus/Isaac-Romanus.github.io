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
        <span id="qb-quiz-progress" class="muted"></span>
      </div>
      <div class="qb-quiz-tools">
        <span id="qb-exam-timer" class="qb-exam-timer" hidden></span>
        <button type="button" id="qb-bookmark-btn" class="btn btn-ghost btn-sm" title="Bookmark">☆ Bookmark</button>
        <button type="button" id="qb-end-session" class="btn btn-ghost btn-sm">End session</button>
      </div>
    </header>

    <article class="qb-question-card">
      <div id="qb-question-stem" class="qb-stem"></div>
      <figure id="qb-question-image" class="qb-question-image" hidden>
        <button type="button" class="figure-zoom qb-image-zoom" data-full="">
          <img src="" alt="" loading="lazy">
        </button>
      </figure>
      <form id="qb-options-form" class="qb-options"></form>
      <div class="qb-quiz-actions">
        <button type="submit" form="qb-options-form" id="qb-submit-btn" class="btn btn-primary">Submit answer</button>
        <button type="button" id="qb-next-btn" class="btn btn-secondary" hidden>Next question</button>
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
