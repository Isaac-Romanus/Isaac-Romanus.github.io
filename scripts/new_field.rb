#!/usr/bin/env ruby
# frozen_string_literal: true

# Add a new pathology field to _data/fields.yml and regenerate field pages.
# Usage:
#   ruby scripts/new_field.rb --slug oral --name "Oral pathology" --short Oral \
#     --description "Oral cavity and odontogenic lesions." --accent "#E8D5B7" --icon "🦷"

require "pathname"
require "yaml"
require "date"

ROOT = Pathname.new(__dir__).parent
FIELDS_PATH = ROOT.join("_data/fields.yml")

def usage!
  warn <<~USAGE
    Usage:
      ruby scripts/new_field.rb --slug <slug> --name "Display Name" \\
        [--short Short] [--description "..."] [--accent "#A8E6CF"] [--icon "🔬"]
  USAGE
  exit 1
end

opts = {
  "slug" => nil,
  "name" => nil,
  "short" => nil,
  "description" => "",
  "accent" => "#D6CDEA",
  "icon" => "🔬"
}

args = ARGV.dup
while (arg = args.shift)
  case arg
  when "--slug" then opts["slug"] = args.shift
  when "--name" then opts["name"] = args.shift
  when "--short" then opts["short"] = args.shift
  when "--description" then opts["description"] = args.shift
  when "--accent" then opts["accent"] = args.shift
  when "--icon" then opts["icon"] = args.shift
  when "--help", "-h" then usage!
  else usage!
  end
end

usage! if opts["slug"].to_s.strip.empty? || opts["name"].to_s.strip.empty?
opts["short"] ||= opts["name"]

unless opts["slug"].match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/)
  warn "Slug must be lowercase kebab-case (e.g. soft-tissue-bone)"
  exit 1
end

fields = YAML.safe_load(File.read(FIELDS_PATH), permitted_classes: [Date, Time], aliases: true) || []
if fields.any? { |f| f["slug"] == opts["slug"] }
  warn "Field slug already exists: #{opts["slug"]}"
  exit 1
end

entry = {
  "slug" => opts["slug"],
  "name" => opts["name"],
  "short" => opts["short"],
  "description" => opts["description"],
  "accent" => opts["accent"],
  "icon" => opts["icon"]
}

# Append as YAML block while preserving file comments/header if present.
header = File.read(FIELDS_PATH)[/\A(?:#.*\n)*/] || ""
body_fields = fields + [entry]
# Prefer readable block dump
dumped = body_fields.map do |f|
  <<~YAML
    - slug: #{f['slug']}
      name: #{f['name']}
      short: #{f['short']}
      description: #{f['description']}
      accent: "#{f['accent']}"
      icon: "#{f['icon']}"
  YAML
end.join("\n")

File.write(FIELDS_PATH, "#{header}#{dumped}")
puts "Added #{opts['slug']} to _data/fields.yml"

ok = system("ruby", ROOT.join("scripts/generate_fields.rb").to_s)
exit(ok ? 0 : 1)
