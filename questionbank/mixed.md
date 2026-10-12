---
layout: questionbank
title: Mixed quiz
permalink: /questionbank/mixed/
qb_page: mixed
---

<section class="qb-hero">
  <div class="wrap">
    <nav class="crumbs"><a href="{{ '/questionbank/' | relative_url }}">Question bank</a> <span>/</span> <span>Mixed quiz</span></nav>
    <h1>Mixed subspecialty quiz</h1>
    <p class="field-desc">Pick two or more subspecialties and how many questions to draw from each loaded bank.</p>
  </div>
</section>

<section class="section wrap">
  <form id="qb-mixed-form" class="qb-setup-form">
    <fieldset>
      <legend>Subspecialties <span class="muted">(select 2+)</span></legend>
      <div class="qb-checkbox-grid">
        {% for sub in site.data.po_subspecialties %}
          <label class="qb-check-label">
            <input type="checkbox" name="sid" value="{{ sub.sid }}" data-slug="{{ sub.slug }}">
            {{ sub.name }}
          </label>
        {% endfor %}
      </div>
    </fieldset>

    <label for="qb-mixed-count">Questions per session</label>
    <input type="number" id="qb-mixed-count" name="count" min="5" max="200" value="20" required>

    <label for="qb-mixed-mode">Mode</label>
    <select id="qb-mixed-mode" name="mode">
      <option value="practice">Practice (immediate feedback)</option>
      <option value="review">Review wrong only</option>
      <option value="unanswered">Unanswered only</option>
      <option value="leitner">Leitner spaced repetition</option>
    </select>

    <label for="qb-mixed-tag">Optional tag filter</label>
    <select id="qb-mixed-tag" name="tag">
      <option value="">All tags</option>
      {% for tag in site.data.tags %}
        <option value="{{ tag.slug }}">{{ tag.name }}</option>
      {% endfor %}
    </select>

    <button type="submit" class="btn btn-primary">Start mixed quiz</button>
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
