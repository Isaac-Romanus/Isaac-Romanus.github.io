# Pathology Notebook

A modern, pastel, text-first study notebook for pathology residents, built with
[Jekyll](https://jekyllrb.com/) and served via GitHub Pages. Notes are organized by
subspecialty ("fields"), each disease is a structured Markdown entry, and histology
images are handled with a simple folder convention plus a built-in zoom/pan viewer.

## Local development

Requires Ruby + Bundler (see `Gemfile`).

```bash
bundle install
bundle exec jekyll serve --host 0.0.0.0 --port 4000
# open http://localhost:4000/
```

## Project structure

```
_config.yml              Site config, collections, and the login hash
_data/fields.yml         The subspecialty taxonomy (name, accent color, icon)
_layouts/                default, home, field, disease
_includes/               head, header, footer, cards, figure/gallery, login
_diseases/               One Markdown file per disease (a Jekyll collection)
fields/                  One page per field (lists that field's entries)
assets/css/main.scss     Pastel design system
assets/js/               auth.js (login), viewer.js (image lightbox), toc.js
assets/images/<field>/<entry-slug>/   Histology images
```

## Adding a new entry

1. Copy `_diseases/template.md` to `_diseases/<your-entry>.md`.
2. Set the front matter: `title`, `field` (must match a `slug` in `_data/fields.yml`),
   optional `synonyms`, `tags`, `quick_facts`, and `images`.
3. Write the body using the standard `##` section headings.
4. Put images in `assets/images/<field>/<your-entry>/` and list them under `images:`
   with `src`, `caption`, `stain`, `magnification`, and `alt`.

## Adding a new field

Add an entry to `_data/fields.yml` and create a matching page in `fields/<slug>.md`
(copy an existing one and change the `field`, `title`, and `permalink`).

## Login / privacy

The site shows a passphrase prompt (default passphrase: **`resident`**). Change it by
replacing the SHA-256 hash in `_config.yml` under `auth.sha256`:

```bash
printf 'your-new-passphrase' | sha256sum
```

**Important:** this gate is cosmetic. This is a static site hosted from a *public*
repository, so the content is still readable in the repo and in page source. For real
privacy you would need to make the repository private (GitHub Pages on private repos
requires a paid plan, and user-site Pages are still publicly served unless you have
Enterprise private Pages) or host the site behind an authenticating server.
