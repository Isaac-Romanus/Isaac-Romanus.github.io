---
layout: home
title: Home
heading: Pathology Notebook
intro: >-
  A calm, searchable place for high-yield surgical and anatomic pathology notes,
  organized by subspecialty and illustrated with your own histology images.
---

<section class="section wrap" id="recent">
  <div class="section-head">
    <h2>Recent entries</h2>
    <p class="muted">Newest notes first (by <code>updated</code> date in front matter).</p>
  </div>
  {% assign recent = site.diseases | where_exp: "d", "d.updated" | sort: "updated" | reverse %}
  {% if recent.size == 0 %}
    {% assign recent = site.diseases | sort: "title" %}
  {% endif %}
  {% if site.diseases.size == 0 %}
    <p class="empty-state">No entries yet. Add Markdown files to <code>_diseases/</code>.</p>
  {% else %}
    <div class="disease-list recent-list">
      {% for disease in recent limit: 5 %}
        {% include disease-card.html disease=disease %}
      {% endfor %}
    </div>
  {% endif %}
</section>
