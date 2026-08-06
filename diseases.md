---
layout: default
title: All entries (A–Z)
permalink: /diseases/
---
<section class="field-header" style="--accent: #cabdf0">
  <div class="wrap">
    <nav class="crumbs"><a href="{{ '/' | relative_url }}">Home</a> <span>/</span> <span>A&ndash;Z</span></nav>
    <h1>All entries</h1>
    <p class="field-desc">Every note in the notebook, alphabetically. Use your browser's find (Ctrl/Cmd&nbsp;+&nbsp;F) to jump to a term.</p>
    <p class="muted">{{ site.diseases | size }} entr{% if site.diseases.size == 1 %}y{% else %}ies{% endif %}</p>
  </div>
</section>

<section class="section wrap">
  {% assign sorted = site.diseases | sort: "title" %}
  {% if sorted.size == 0 %}
    <p class="empty-state">No entries yet. Add Markdown files to <code>_diseases/</code> to get started.</p>
  {% else %}
    {% assign grouped = sorted | group_by_exp: "d", "d.title | slice: 0 | upcase" %}
    {% for group in grouped %}
      <h2 class="az-letter">{{ group.name }}</h2>
      <div class="disease-list">
        {% for disease in group.items %}
          {% include disease-card.html disease=disease %}
        {% endfor %}
      </div>
    {% endfor %}
  {% endif %}
</section>
