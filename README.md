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

Validate content and build:

```bash
bundle exec rake          # validate + jekyll build
bundle exec rake validate
ruby scripts/validate_content.rb
```

## Project structure

```
_config.yml              Site config, collections, and the login hash
_data/fields.yml         Subspecialty taxonomy (name, accent, icon)
_data/tags.yml           Controlled tag vocabulary
_data/stains.yml         Preferred histology stain names
_layouts/                default, home, field, disease
_includes/               cards, gallery, callouts, IHC/DDx tables, pager, related
_diseases/               One Markdown file per disease (Jekyll collection)
fields/                  Generated field pages (see scripts/generate_fields.rb)
assets/css/main.scss    Design system entry (partials in `_sass/`)
assets/js/               auth, search, viewer, toc, filter, nav
_sass/                   SCSS partials (_tokens, _disease, _viewer, …)
assets/images/<field>/<entry-slug>/   Histology images
scripts/                 validate, generate fields, new entry/field
```

## Adding a new entry

```bash
ruby scripts/new_entry.rb "Tubular adenoma" gastrointestinal
```

Or manually:

1. Copy `_diseases/template.md` to `_diseases/<your-entry>.md`.
2. Set the front matter: `title`, `field` (must match a `slug` in `_data/fields.yml`),
   `tags` (must match `_data/tags.yml`), optional `synonyms`, `quick_facts`, `images`,
   `ihc`, and `ddx`.
3. Write the body using the standard `##` section headings.
4. Put images in `assets/images/<field>/<your-entry>/` and list them under `images:`.

Optional scaffolding in Markdown / front matter:

- `{% include callout.html kind="pearl" text="…" %}` — pearl / pitfall / grading / note
- `{% include ihc-table.html rows=page.ihc %}` and `{% include ddx-table.html rows=page.ddx %}` —
  place these includes under the matching `##` sections; define the rows in front matter
- `gallery_position: before` — show histology above the body (default is after)

## Adding a new field

```bash
ruby scripts/new_field.rb --slug oral --name "Oral pathology" \
  --description "Oral cavity and odontogenic lesions." --accent "#E8D5B7" --icon "🦷"
```

Or edit `_data/fields.yml` and run:

```bash
ruby scripts/generate_fields.rb
```

## Search, tags, and navigation

- Header search indexes title, synonyms, tags, field, summary, quick facts, and full body.
- `/tags/` lists every controlled tag with matching entries; badges link there.
- Field pages offer tag filter chips (`?tag=malignant` works too).
- Disease pages include prev/next within the field and related same-field entries.

## Login / privacy

The site shows a passphrase prompt (current passphrase: **`Stockholm`**). Change it by
replacing the SHA-256 hash in `_config.yml` under `auth.sha256`:

```bash
printf 'your-new-passphrase' | sha256sum
```

**Important:** this gate is cosmetic. This is a static site hosted from a *public*
repository, so the content is still readable in the repo and in page source. For real
privacy you would need to make the repository private (GitHub Pages on private repos
requires a paid plan, and user-site Pages are still publicly served unless you have
Enterprise private Pages) or host the site behind an authenticating server.
