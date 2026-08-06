---
# Copy this file to _diseases/<your-entry>.md (or run: ruby scripts/new_entry.rb "Title" <field>)
# and set published: true (or remove it).
published: false
title: "Entry title"
# `field` must match a slug in _data/fields.yml
field: gastrointestinal
synonyms:
  - Alternate name
# Tags must match a slug (or name) in _data/tags.yml
tags:
  - benign
# Optional one-line summary shown on cards (used if no synonyms)
summary: Short description for listing cards.
# Optional key/value facts shown in a box at the top of the page
quick_facts:
  - label: Typical age
    value: "—"
  - label: Key IHC
    value: "—"
# Gallery placement: omit or "after" (default, after body) · "before" (above body)
# gallery_position: before
# Histology images. Store files under assets/images/<field>/<entry-slug>/
# Prefer stain names from _data/stains.yml
images:
  - src: /assets/images/gastrointestinal/example/low.svg
    caption: Low-power architecture.
    stain: H&E
    magnification: 40x
    alt: Describe the histology for accessibility.
# Optional structured tables — include under the matching ## sections:
# {% raw %}{% include ihc-table.html rows=page.ihc %}{% endraw %}
# {% raw %}{% include ddx-table.html rows=page.ddx %}{% endraw %}
# ihc:
#   - marker: BerEP4
#     result: Positive
#     notes: Helps vs SCC
# ddx:
#   - entity: Trichoepithelioma
#     favors: Retraction artifact, connection to epidermis
#     against: Papillary mesenchymal bodies
---

## Definition

Brief definition.

## Epidemiology

Who gets it, how often.

## Clinical features

Presentation, sites, symptoms.

## Gross

Macroscopic appearance.

## Microscopic (histology)

Key histologic features.

## Immunohistochemistry & special stains

Useful markers.

## Molecular

Relevant genetics.

## Differential diagnosis

What to rule out.

## Prognosis & treatment

Behavior and management.

## References

- Source 1
