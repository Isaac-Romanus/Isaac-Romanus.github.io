#!/usr/bin/env ruby
# frozen_string_literal: true

# Validate disease front matter against controlled vocabularies.
# Usage: ruby scripts/validate_content.rb
# Exit 0 on success, 1 on errors.

require "yaml"
require "pathname"
require "date"

ROOT = Pathname.new(__dir__).parent
DISEASES = ROOT.join("_diseases")
FIELDS = ROOT.join("_data/fields.yml")
TAGS = ROOT.join("_data/tags.yml")
EXPECTED_H2 = [
  "Definition",
  "Epidemiology",
  "Clinical features",
  "Gross",
  "Microscopic (histology)",
  "Immunohistochemistry & special stains",
  "Molecular",
  "Differential diagnosis",
  "Prognosis & treatment",
  "References"
].freeze

def load_yaml(path)
  YAML.safe_load(File.read(path), permitted_classes: [Date, Time], aliases: true) || []
end

def parse_front_matter(path)
  text = File.read(path)
  return [{}, text] unless text.start_with?("---")
  parts = text.split(/^---\s*$/, 3)
  return [{}, text] if parts.length < 3
  data = YAML.safe_load(parts[1], permitted_classes: [Date, Time], aliases: true) || {}
  [data, parts[2]]
end

def heading_titles(body)
  body.scan(/^##\s+(.+?)\s*$/).flatten.map { |h| h.gsub(/\{:.*\}\s*$/, "").strip }
end

field_slugs = load_yaml(FIELDS).map { |f| f["slug"].to_s }
tag_slugs = load_yaml(TAGS).map { |t| t["slug"].to_s.downcase }
tag_names = load_yaml(TAGS).map { |t| t["name"].to_s.downcase }

errors = []
warnings = []

Dir.glob(DISEASES.join("*.md").to_s).sort.each do |path|
  name = File.basename(path)
  next if name == "template.md"

  data, body = parse_front_matter(path)
  next if data["published"] == false

  if data["title"].to_s.strip.empty?
    errors << "#{name}: missing title"
  end

  field = data["field"].to_s
  if field.empty?
    errors << "#{name}: missing field"
  elsif !field_slugs.include?(field)
    errors << "#{name}: unknown field '#{field}' (expected one of: #{field_slugs.join(', ')})"
  end

  Array(data["tags"]).each do |tag|
    key = tag.to_s.strip.downcase
    unless tag_slugs.include?(key) || tag_names.include?(key)
      errors << "#{name}: unknown tag '#{tag}' — add it to _data/tags.yml or use an existing slug"
    end
  end

  Array(data["images"]).each_with_index do |img, i|
    src = img.is_a?(Hash) ? img["src"].to_s : ""
    if src.empty?
      errors << "#{name}: images[#{i}] missing src"
    else
      rel = src.sub(%r{\A/}, "")
      abs = ROOT.join(rel)
      warnings << "#{name}: image not found on disk: #{src}" unless abs.file?
    end
    alt = img.is_a?(Hash) ? img["alt"].to_s : ""
    warnings << "#{name}: images[#{i}] missing alt text" if alt.empty?
  end

  present = heading_titles(body)
  missing = EXPECTED_H2.reject { |h| present.any? { |p| p.casecmp?(h) } }
  unless missing.empty?
    warnings << "#{name}: missing recommended sections: #{missing.join('; ')}"
  end
end

# Orphan check: field pages should exist for every field slug
field_slugs.each do |slug|
  page = ROOT.join("fields/#{slug}.md")
  warnings << "fields/#{slug}.md missing — run: ruby scripts/generate_fields.rb" unless page.file?
end

puts "Pathology Notebook content validation"
puts "------------------------------------"
if errors.empty? && warnings.empty?
  puts "OK — no issues found."
  exit 0
end

errors.each { |e| puts "ERROR: #{e}" }
warnings.each { |w| puts "WARN:  #{w}" }
puts
puts "#{errors.size} error(s), #{warnings.size} warning(s)"
exit(errors.empty? ? 0 : 1)
