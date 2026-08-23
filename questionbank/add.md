---
layout: questionbank
title: Add question
permalink: /questionbank/add/
qb_page: add
---

<section class="qb-hero">
  <div class="wrap">
    <nav class="crumbs"><a href="{{ '/questionbank/' | relative_url }}">Question bank</a> <span>/</span> <span>Add question</span></nav>
    <h1>Add custom question</h1>
    <p class="field-desc">Save a question to IndexedDB on this device and export as YAML for inclusion in the repo.</p>
  </div>
</section>

<section class="section wrap">
  <form id="qb-add-form" class="qb-setup-form qb-add-form">
    <label for="qb-add-stem">Question stem</label>
    <textarea id="qb-add-stem" name="stem" rows="4" required></textarea>

    <label for="qb-add-chapter">Chapter / topic</label>
    <input type="text" id="qb-add-chapter" name="chapter" placeholder="e.g. Colon">

    <label for="qb-add-sid">PO subspecialty</label>
    <select id="qb-add-sid" name="sid" required>
      {% for sub in site.data.po_subspecialties %}
        <option value="{{ sub.sid }}">{{ sub.name }}</option>
      {% endfor %}
    </select>

    <label for="qb-add-fields">Notebook fields (comma-separated slugs)</label>
    <input type="text" id="qb-add-fields" name="fields" placeholder="gastrointestinal, liver-pancreas">

    <label for="qb-add-tags">Tags (comma-separated slugs)</label>
    <input type="text" id="qb-add-tags" name="tags" placeholder="malignant, benign">

    <label for="qb-add-related">Related disease slug (optional)</label>
    <input type="text" id="qb-add-related" name="related_disease" placeholder="tubular-adenoma">

    <fieldset class="qb-options-fieldset">
      <legend>Answer options</legend>
      <div id="qb-add-options">
        {% for letter in "ABCD" %}
          <div class="qb-add-option-row" data-key="{{ letter }}">
            <label>{{ letter }}. <input type="text" name="option_{{ letter }}" required placeholder="Option text"></label>
            <label class="qb-check-label"><input type="radio" name="correct" value="{{ letter }}" {% if letter == "A" %}checked{% endif %}> Correct</label>
            <textarea name="explanation_{{ letter }}" rows="2" placeholder="Explanation for {{ letter }}"></textarea>
          </div>
        {% endfor %}
      </div>
    </fieldset>

    <div class="qb-form-actions">
      <button type="submit" class="btn btn-primary">Save to device</button>
      <button type="button" id="qb-export-yaml-btn" class="btn btn-secondary">Export YAML</button>
    </div>
  </form>

  <div id="qb-add-status" class="qb-add-status" hidden></div>
  <pre id="qb-add-yaml" class="qb-yaml-output" hidden></pre>
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
