---
layout: questionbank
title: Question bank dashboard
permalink: /questionbank/dashboard/
qb_page: dashboard
---

<section class="qb-hero">
  <div class="wrap">
    <nav class="crumbs"><a href="{{ '/questionbank/' | relative_url }}">Question bank</a> <span>/</span> <span>Dashboard</span></nav>
    <h1>Progress dashboard</h1>
    <p class="field-desc">Per-subspecialty stats for the active profile. Export or import your local progress as JSON.</p>
  </div>
</section>

<section class="section wrap">
  <div id="qb-profile-bar" class="qb-profile-bar" hidden>
    <span>Profile: <strong id="qb-active-profile-name"></strong></span>
    <button type="button" class="btn btn-ghost btn-sm" id="qb-switch-profile">Switch profile</button>
  </div>

  <div class="qb-dashboard-actions">
    <button type="button" id="qb-export-btn" class="btn btn-secondary">Export backup (JSON)</button>
    <label class="btn btn-secondary qb-file-label">
      Import backup
      <input type="file" id="qb-import-input" accept="application/json,.json" hidden>
    </label>
  </div>

  <div id="qb-dashboard-summary" class="qb-summary-grid" aria-live="polite">
    <p class="muted">Loading summary…</p>
  </div>

  <h2 class="qb-section-title">By subspecialty</h2>
  <div id="qb-dashboard-stats" class="qb-stats-grid">
    <p class="empty-state">Loading stats…</p>
  </div>

  <h2 class="qb-section-title">Recent attempts</h2>
  <div id="qb-recent-attempts" class="qb-recent-list">
    <p class="muted">No attempts yet.</p>
  </div>
</section>

<div id="qb-profile-modal" class="qb-modal" hidden role="dialog" aria-modal="true" aria-labelledby="qb-profile-title">
  <div class="qb-modal-backdrop" data-close-modal></div>
  <div class="qb-modal-panel">
    <h2 id="qb-profile-title">Choose a study profile</h2>
    <div id="qb-profile-list" class="qb-profile-list"></div>
    <form id="qb-new-profile-form" class="qb-inline-form">
      <input type="text" id="qb-new-profile-name" placeholder="New profile name" required maxlength="40" aria-label="New profile name">
      <button type="submit" class="btn btn-primary">Create</button>
    </form>
  </div>
</div>
