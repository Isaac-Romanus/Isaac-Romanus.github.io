#!/usr/bin/env ruby
# frozen_string_literal: true

# Scaffold a new disease entry from the template.
# Usage:
#   ruby scripts/new_entry.rb "Tubular adenoma" gastrointestinal
#   ruby scripts/new_entry.rb --title "Basal cell carcinoma" --field dermatopathology

require "pathname"
require "fileutils"
require "yaml"
require "date"

ROOT = Pathname.new(__dir__).parent
TEMPLATE = ROOT.join("_diseases/template.md")
DISEASES = ROOT.join("_diseases")
FIELDS = ROOT.join("_data/fields.yml")

def slugify(text)
  text.to_s.downcase
      .gsub(/[^a-z0-9]+/, "-")
      .gsub(/-+/, "-")
      .gsub(/^-|-$/, "")
end

def usage!
  warn <<~USAGE
    Usage:
      ruby scripts/new_entry.rb "Title" <field-slug>
      ruby scripts/new_entry.rb --title "Title" --field <field-slug> [--slug custom-slug]
  USAGE
  exit 1
end

args = ARGV.dup
title = nil
field = nil
slug = nil

while (arg = args.shift)
  case arg
  when "--title" then title = args.shift
  when "--field" then field = args.shift
  when "--slug" then slug = args.shift
  when "--help", "-h" then usage!
  else
    if title.nil?
      title = arg
    elsif field.nil?
      field = arg
    else
      usage!
    end
  end
end

usage! if title.to_s.strip.empty? || field.to_s.strip.empty?

fields = YAML.safe_load(File.read(FIELDS), permitted_classes: [Date, Time], aliases: true) || []
slugs = fields.map { |f| f["slug"] }
unless slugs.include?(field)
  warn "Unknown field '#{field}'. Known: #{slugs.join(', ')}"
  exit 1
end

slug ||= slugify(title)
out = DISEASES.join("#{slug}.md")
if out.exist?
  warn "Already exists: #{out.relative_path_from(ROOT)}"
  exit 1
end

text = File.read(TEMPLATE)
text = text.sub(/^published: false\n/, "")
text = text.sub(/^title: ".*"$/, "title: \"#{title}\"")
text = text.sub(/^field: .*$/, "field: #{field}")
# Point image stubs at the conventional folder
text = text.gsub(%r{/assets/images/gastrointestinal/example/}, "/assets/images/#{field}/#{slug}/")

File.write(out, text)

img_dir = ROOT.join("assets/images/#{field}/#{slug}")
FileUtils.mkdir_p(img_dir)

puts "Created #{out.relative_path_from(ROOT)}"
puts "Image folder: #{img_dir.relative_path_from(ROOT)}"
puts "Next: edit the front matter, write sections, add histology images."
