---
layout: questionbank
title: Exam mode
permalink: /questionbank/exam/
qb_page: exam
---

<section class="qb-hero">
  <div class="wrap">
    <nav class="crumbs"><a href="{{ '/questionbank/' | relative_url }}">Question bank</a> <span>/</span> <span>Exam mode</span></nav>
    <h1>Exam mode</h1>
    <p class="field-desc">Timed or untimed exam with no feedback until you submit. Questions with incomplete explanations are skipped.</p>
  </div>
</section>

<section class="section wrap">
  <form id="qb-exam-form" class="qb-setup-form">
    <label for="qb-exam-sids">Subspecialties</label>
    <select id="qb-exam-sids" name="sids" multiple size="8" required>
      {% for sub in site.data.po_subspecialties %}
        <option value="{{ sub.sid }}">{{ sub.name }}</option>
      {% endfor %}
    </select>
    <p class="muted qb-hint">Hold Ctrl/Cmd to select multiple.</p>

    <label for="qb-exam-count">Number of questions</label>
    <input type="number" id="qb-exam-count" name="count" min="5" max="200" value="25" required>

    <label for="qb-exam-timer-min">Timer (minutes, optional)</label>
    <input type="number" id="qb-exam-timer-min" name="timer" min="0" max="480" value="0" placeholder="0 = untimed">

    <label for="qb-exam-tag">Optional tag filter</label>
    <select id="qb-exam-tag" name="tag">
      <option value="">All tags</option>
      {% for tag in site.data.tags %}
        <option value="{{ tag.slug }}">{{ tag.name }}</option>
      {% endfor %}
    </select>

    <button type="submit" class="btn btn-primary">Start exam</button>
  </form>
</section>

<div id="qb-profile-modal" class="qb-modal" hidden role="dialog" aria-modal="true" aria-labelledby="qb-profile-title">
  <div class="qb-modal-backdrop" data-close-modal></div>
  <div class="qb-modal-panel">
    <h2 id="qb-profile-title">Choose a study profile</h2>
    <div id="qb-profile-list" class="qb-profile-list"></div>
    <form id="qb-new-profile-form" class="qb-inline-form">
      <input type="text" id="qb-new-profile-name" placeholder="New profile name" required maxlength="40" aria-label="New profile name">
      <button type="submit" class="btn btn-primary">Create &amp; start</button>
    </form>
  </div>
</div>
