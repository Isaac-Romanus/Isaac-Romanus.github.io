---
layout: default
title: Tags
permalink: /tags/
---
<section class="field-header" style="--accent: #cabdf0">
  <div class="wrap">
    <nav class="crumbs"><a href="{{ '/' | relative_url }}">Home</a> <span>/</span> <span>Tags</span></nav>
    <h1>Tags</h1>
    <p class="field-desc">Browse entries by controlled vocabulary tags. Tag badges on disease pages link here.</p>
  </div>
</section>

<section class="section wrap">
  {% for tag in site.data.tags %}
    {% assign tag_slug = tag.slug | downcase %}
    {% assign tag_name = tag.name | downcase %}
    {% assign matches = "" | split: "" %}
    {% for d in site.diseases %}
      {% assign hit = false %}
      {% for t in d.tags %}
        {% assign t_norm = t | strip | downcase %}
        {% if t_norm == tag_slug or t_norm == tag_name %}
          {% assign hit = true %}
        {% endif %}
      {% endfor %}
      {% if hit %}
        {% assign matches = matches | push: d %}
      {% endif %}
    {% endfor %}

    <section class="tag-group" id="{{ tag.slug }}">
      <div class="tag-group-head">
        <h2>{{ tag.name }}</h2>
        {% if tag.description %}<p class="muted">{{ tag.description }}</p>{% endif %}
        <p class="muted small">{{ matches | size }} entr{% if matches.size == 1 %}y{% else %}ies{% endif %}</p>
      </div>
      {% if matches.size == 0 %}
        <p class="empty-state">No entries with this tag yet.</p>
      {% else %}
        {% assign sorted = matches | sort: "title" %}
        <div class="disease-list">
          {% for disease in sorted %}
            {% include disease-card.html disease=disease %}
          {% endfor %}
        </div>
      {% endif %}
    </section>
  {% endfor %}
</section>
