---
layout: questionbank
title: Question bank
permalink: /questionbank/
qb_page: index
---

<section class="qb-hero">
  <div class="wrap">
    <nav class="crumbs"><a href="{{ '/' | relative_url }}">Home</a> <span>/</span> <span>Question bank</span></nav>
    <h1>Question bank</h1>
    <p class="field-desc">Practice board-style questions sourced from <a href="https://www.pathologyoutlines.com/review-questions" rel="noopener noreferrer" target="_blank">PathologyOutlines.com</a>. Progress is saved locally in your browser.</p>
    <div class="qb-hero-actions">
      <a class="btn btn-primary" href="{{ '/questionbank/dashboard/' | relative_url }}">Dashboard</a>
      <a class="btn btn-secondary" href="{{ '/questionbank/mixed/' | relative_url }}">Mixed quiz</a>
      <a class="btn btn-secondary" href="{{ '/questionbank/exam/' | relative_url }}">Exam mode</a>
      <a class="btn btn-secondary" href="{{ '/questionbank/add/' | relative_url }}">Add question</a>
    </div>
  </div>
</section>

<section class="section wrap">
  <div id="qb-profile-bar" class="qb-profile-bar" hidden>
    <span>Profile: <strong id="qb-active-profile-name"></strong></span>
    <button type="button" class="btn btn-ghost btn-sm" id="qb-switch-profile">Switch profile</button>
  </div>

  <div class="card-grid" id="qb-subspecialty-grid">
    {% for sub in site.data.po_subspecialties %}
      {% assign fld = site.data.fields | where: "slug", sub.fields.first | first %}
      <article class="field-card qb-sub-card" style="--accent: {{ fld.accent | default: '#D6CDEA' }}" data-sid="{{ sub.sid }}" data-slug="{{ sub.slug }}">
        <span class="field-icon" aria-hidden="true">{{ fld.icon | default: "📚" }}</span>
        <h2 class="field-name">{{ sub.name }}</h2>
        <p class="field-desc">~{{ sub.question_count_estimate }} questions on PO</p>
        <p class="field-count qb-local-count" data-sid="{{ sub.sid }}">Loading…</p>
        <div class="qb-card-actions">
          <a class="btn btn-primary btn-sm" href="{{ '/questionbank/quiz/' | relative_url }}?mode=practice&amp;sid={{ sub.sid }}">Practice</a>
          <a class="btn btn-secondary btn-sm" href="{{ '/questionbank/quiz/' | relative_url }}?mode=review&amp;sid={{ sub.sid }}">Review wrong</a>
          <a class="btn btn-secondary btn-sm" href="{{ '/questionbank/quiz/' | relative_url }}?mode=unanswered&amp;sid={{ sub.sid }}">Unanswered</a>
          <a class="btn btn-secondary btn-sm" href="{{ '/questionbank/quiz/' | relative_url }}?mode=leitner&amp;sid={{ sub.sid }}">Leitner</a>
        </div>
      </article>
    {% endfor %}
  </div>
</section>

<div id="qb-profile-modal" class="qb-modal" hidden role="dialog" aria-modal="true" aria-labelledby="qb-profile-title">
  <div class="qb-modal-backdrop" data-close-modal></div>
  <div class="qb-modal-panel">
    <h2 id="qb-profile-title">Choose a study profile</h2>
    <p class="muted">Profiles keep attempts, bookmarks, and Leitner progress separate on this device.</p>
    <div id="qb-profile-list" class="qb-profile-list"></div>
    <form id="qb-new-profile-form" class="qb-inline-form">
      <input type="text" id="qb-new-profile-name" placeholder="New profile name" required maxlength="40" aria-label="New profile name">
      <button type="submit" class="btn btn-primary">Create &amp; start</button>
    </form>
  </div>
</div>
