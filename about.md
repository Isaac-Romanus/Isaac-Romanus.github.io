---
layout: default
title: About
permalink: /about/
---
<section class="field-header" style="--accent: #A0D2EB">
  <div class="wrap">
    <nav class="crumbs"><a href="{{ '/' | relative_url }}">Home</a> <span>/</span> <span>About</span></nav>
    <h1>About this notebook</h1>
    <p class="field-desc">What this is, how it is organized, and how to add to it.</p>
  </div>
</section>

<section class="section wrap prose" style="max-width: 760px;">

This is a personal study notebook for anatomic and surgical pathology, inspired by
references like PathologyOutlines but kept intentionally simple, calm, and fast.

## How it is organized

- **Fields** &mdash; each subspecialty (GI, dermatopathology, hematopathology, &hellip;)
  has its own page listing every entry in that field.
- **Entries** &mdash; each disease is a single Markdown file with a consistent set of
  sections and an optional gallery of histology images.
- **A&ndash;Z** &mdash; a flat, alphabetical index of everything.

## Adding a new entry

1. Copy `_diseases/template.md` to a new file such as `_diseases/my-entry.md`.
2. Set the front matter (`title`, `field`, `synonyms`, `tags`, and any `images`).
3. Write the body using the standard `##` section headings.
4. Drop histology images into `assets/images/<field>/<entry-slug>/` and reference
   them in the front matter `images:` list.

## A note on the login

The notebook sits behind a simple passphrase prompt. Because the site is a static,
public GitHub Pages site, this gate is **cosmetic** &mdash; it hides the interface but
does not encrypt the content. See the project README for options if real privacy is
needed.

</section>
