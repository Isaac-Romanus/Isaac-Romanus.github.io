#!/usr/bin/env ruby
# frozen_string_literal: true

# Interactive scaffold for a single question JSON object.
# Usage: ruby scripts/new_question.rb --interactive

require "json"
require "optparse"
require "pathname"
require "yaml"
require "securerandom"

ROOT = Pathname.new(__dir__).parent
SUBS = ROOT.join("_data/po_subspecialties.yml")
FIELDS = ROOT.join("_data/fields.yml")
TAGS = ROOT.join("_data/tags.yml")

def ask(prompt, default: nil)
  print prompt
  print " [#{default}]" if default
  print ": "
  val = $stdin.gets&.strip
  val = default if val.to_s.empty? && default
  val
end

def ask_yes(prompt, default: "y")
  (%w[y yes].include?(ask("#{prompt} (y/n)", default: default).to_s.downcase))
end

subs = YAML.safe_load(File.read(SUBS), permitted_classes: [Date, Time], aliases: true) || []
fields = YAML.safe_load(File.read(FIELDS), permitted_classes: [Date, Time], aliases: true) || []
tags_vocab = YAML.safe_load(File.read(TAGS), permitted_classes: [Date, Time], aliases: true) || []

interactive = ARGV.include?("--interactive") || ARGV.empty?
unless interactive
  warn "Usage: ruby scripts/new_question.rb --interactive"
  exit 1
end

puts "Pathology Notebook — new question"
puts "Subspecialties:"
subs.each { |s| puts "  #{s['sid']}: #{s['name']}" }
sid = ask("PO subspecialty id", default: "6").to_i
sub = subs.find { |s| s["sid"] == sid }
slug = sub ? sub["slug"] : "sid-#{sid}"

chapter = ask("Chapter / topic", default: "Colon")
stem = ask("Question stem")
related = ask("Related disease slug (optional)", default: "")

field_slugs = fields.map { |f| f["slug"] }
selected_fields = ask("Fields (#{field_slugs.join(', ')})", default: (sub&.dig("fields") || []).join(", "))
  .split(",").map(&:strip).reject(&:empty?)

tag_slugs = tags_vocab.map { |t| t["slug"] }
selected_tags = ask("Tags (#{tag_slugs.join(', ')})", default: "")
  .split(",").map(&:strip).reject(&:empty?)

options = []
%w[A B C D].each do |key|
  text = ask("Option #{key}")
  correct = ask_yes("Is #{key} correct?", default: key == "A" ? "y" : "n")
  expl = ask("Explanation for #{key}")
  options << { "key" => key, "text" => text, "correct" => correct, "explanation" => expl }
end

correct_count = options.count { |o| o["correct"] }
if correct_count != 1
  warn "Warning: expected exactly one correct option, found #{correct_count}"
end

id = ask("Question id", default: "po-#{slug}-#{SecureRandom.hex(3)}")
question = {
  "id" => id,
  "source" => "pathologyoutlines",
  "source_url" => "https://www.pathologyoutlines.com/review-questions?sid=#{sid}",
  "po_subspecialty_id" => sid,
  "po_chapter" => chapter,
  "fields" => selected_fields,
  "tags" => selected_tags,
  "stem" => stem,
  "image" => nil,
  "options" => options,
  "related_disease" => related.empty? ? nil : related,
  "explanation_status" => "complete"
}

out_dir = ROOT.join("assets/data/questions")
out_dir.mkpath
out_file = out_dir.join("#{slug}.json")
existing = out_file.exist? ? JSON.parse(File.read(out_file)) : []
existing << question
File.write(out_file, JSON.pretty_generate(existing))
puts "Appended to #{out_file.relative_path_from(ROOT)} (#{existing.length} total)"
