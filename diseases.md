---
layout: default
title: All entries (A–Z)
permalink: /diseases/
---
<section class="field-header" style="--accent: #cabdf0">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="{{ '/' | relative_url }}">Home</a> <span>/</span> <span>A&ndash;Z</span></nav>
    <h1>All entries</h1>
    <p class="field-desc">Every note in the notebook, alphabetically. Press <kbd>/</kbd> to search titles, synonyms, tags, and body text.</p>
    <p class="muted">{{ site.diseases | size }} entr{% if site.diseases.size == 1 %}y{% else %}ies{% endif %}</p>
  </div>
</section>

<section class="section wrap">
  {% assign sorted = site.diseases | sort: "title" %}
  {% if sorted.size == 0 %}
    <p class="empty-state">No entries yet. Add Markdown files to <code>_diseases/</code> to get started.</p>
  {% else %}
    {% assign grouped = sorted | group_by_exp: "d", "d.title | slice: 0 | upcase" %}
    <nav class="az-jump" aria-label="Jump to letter">
      {% for group in grouped %}
        <a href="#letter-{{ group.name }}">{{ group.name }}</a>
      {% endfor %}
    </nav>
    {% for group in grouped %}
      <h2 class="az-letter" id="letter-{{ group.name }}">{{ group.name }}</h2>
      <div class="disease-list">
        {% for disease in group.items %}
          {% include disease-card.html disease=disease %}
        {% endfor %}
      </div>
    {% endfor %}
  {% endif %}
</section>
