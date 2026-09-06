#!/usr/bin/env ruby
# frozen_string_literal: true

# Validate question JSON banks under assets/data/questions/.
# Usage: ruby scripts/validate_questions.rb

require "json"
require "pathname"
require "yaml"
require "date"

ROOT = Pathname.new(__dir__).parent
QUESTIONS = ROOT.join("assets/data/questions")
INDEX = QUESTIONS.join("index.json")
FIELDS = ROOT.join("_data/fields.yml")
TAGS = ROOT.join("_data/tags.yml")
SUBS = ROOT.join("_data/po_subspecialties.yml")

REQUIRED_KEYS = %w[id source po_subspecialty_id stem options explanation_status].freeze
OPTION_KEYS = %w[key text correct explanation].freeze

def load_yaml(path)
  YAML.safe_load(File.read(path), permitted_classes: [Date, Time], aliases: true) || []
end

field_slugs = load_yaml(FIELDS).map { |f| f["slug"].to_s }
tag_slugs = load_yaml(TAGS).map { |t| t["slug"].to_s.downcase }
valid_sids = load_yaml(SUBS).map { |s| s["sid"] }

errors = []
warnings = []
seen_ids = {}

unless INDEX.file?
  errors << "Missing #{INDEX.relative_path_from(ROOT)}"
else
  index = JSON.parse(File.read(INDEX))
  banks = index["banks"] || {}

  banks.each do |slug, file|
    path = QUESTIONS.join(file)
    unless path.file?
      errors << "Bank file missing: #{file} (slug #{slug})"
      next
    end

    data = JSON.parse(File.read(path))
    list = data.is_a?(Array) ? data : (data["questions"] || [])
    list.each_with_index do |q, i|
      prefix = "#{file}[#{i}] (#{q['id'] || 'no-id'})"

      REQUIRED_KEYS.each do |k|
        errors << "#{prefix}: missing #{k}" if q[k].nil?
      end

      if q["id"]
        if seen_ids[q["id"]]
          errors << "#{prefix}: duplicate id (also in #{seen_ids[q["id"]]})"
        else
          seen_ids[q["id"]] = prefix
        end
      end

      sid = q["po_subspecialty_id"]
      errors << "#{prefix}: unknown po_subspecialty_id #{sid}" if sid && !valid_sids.include?(sid)

      Array(q["fields"]).each do |f|
        errors << "#{prefix}: unknown field '#{f}'" unless field_slugs.include?(f.to_s)
      end

      Array(q["tags"]).each do |t|
        errors << "#{prefix}: unknown tag '#{t}'" unless tag_slugs.include?(t.to_s.downcase)
      end

      opts = q["options"] || []
      errors << "#{prefix}: need at least 2 options" if opts.length < 2
      correct = opts.select { |o| o["correct"] }
      errors << "#{prefix}: need exactly 1 correct option" unless correct.length == 1

      opts.each_with_index do |opt, oi|
        OPTION_KEYS.each do |k|
          errors << "#{prefix} option #{oi}: missing #{k}" if opt[k].nil? && k != "explanation"
        end
      end

      generic_re = /see pathologyoutlines\.com for (full )?discussion|this option is incorrect\. review the correct-answer/i
      if q["explanation_status"] == "complete"
        opts.each do |opt|
          exp = opt["explanation"].to_s.strip
          if exp.empty?
            errors << "#{prefix} option #{opt['key']}: empty explanation but explanation_status is complete"
          elsif !opt["correct"] && exp.match?(generic_re)
            errors << "#{prefix} option #{opt['key']}: generic placeholder explanation but explanation_status is complete"
          end
        end
      elsif q["explanation_status"] == "partial"
        opts.each do |opt|
          warnings << "#{prefix} option #{opt['key']}: empty explanation" if opt["explanation"].to_s.strip.empty?
        end
      else
        errors << "#{prefix}: explanation_status must be 'complete' or 'partial' (got #{q['explanation_status'].inspect})"
      end

      if q["source"] == "pathologyoutlines" && q["source_url"].to_s.strip.empty?
        warnings << "#{prefix}: PO question missing source_url"
      end
    end
  end
end

puts "Question bank validation"
puts "------------------------"
if errors.empty? && warnings.empty?
  puts "OK — #{seen_ids.size} question(s) validated."
  exit 0
end

errors.each { |e| puts "ERROR: #{e}" }
warnings.each { |w| puts "WARN:  #{w}" }
puts
puts "#{errors.size} error(s), #{warnings.size} warning(s)"
exit(errors.empty? ? 0 : 1)
