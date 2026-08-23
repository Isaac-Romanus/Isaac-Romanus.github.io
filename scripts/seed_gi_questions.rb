#!/usr/bin/env ruby
# frozen_string_literal: true

# Seed GI/liver questions from cached PO text export (offline fallback when rate-limited).
# Usage: ruby scripts/seed_gi_questions.rb

require "json"
require "pathname"

ROOT = Pathname.new(__dir__).parent
SOURCE = Pathname.new("/home/ubuntu/.cursor/projects/workspace/agent-tools/f08ac6be-d3e2-45ae-8d49-fe36f1123f80.txt")
OUT = ROOT.join("assets/data/questions/gi-liver.json")

def parse_distractors(text)
  out = {}
  text.scan(/Answer\s+([A-D])\s+is\s+incorrect\s+because\s+(.*?)(?=Answer\s+[A-D]\s+is\s+incorrect|Answers?\s+[A-D]|Comment|$)/mi) do |letter, expl|
    out[letter.upcase] = expl.strip.gsub(/\s+/, " ")
  end
  out
end

def main_expl(text, key)
  t = text.dup
  t.sub!(/\A\s*#{key}\.\s*/i, "")
  t.sub!(/\.\s*Answers?\s+[A-D].*\z/mi, ".")
  t.sub!(/\.\s*Answer\s+[A-D]\s+is\s+incorrect.*\z/mi, ".")
  t.strip.gsub(/\s+/, " ")
end

def infer_chapter(stem, answer)
  ref = answer[/Reference:\s*(.+?)(?:\s*Comment|$)/i, 1]
  return ref.split("-").first.strip if ref
  return "Appendix" if stem.match?(/append/i)
  return "Colon" if stem.match?(/colon|colorect|adenoma|polyp/i)
  return "Liver" if stem.match?(/liver|hepat/i)
  return "Stomach" if stem.match?(/stomach|gastric/i)
  "GI / liver"
end

def infer_tags(stem, chapter)
  tags = []
  tags << "malignant" if stem.match?(/carcinoma|malignant|GIST|neuroendocrine tumor|adenocarcinoma/i)
  tags << "benign" if stem.match?(/hyperplasia|benign/i) && !tags.include?("malignant")
  tags << "inflammatory" if stem.match?(/appendicitis|inflammation|granulomatous/i)
  tags << "precursor-lesion" if stem.match?(/dysplasia|adenoma|LAMN|HAMN/i)
  tags << "infectious" if stem.match?(/cystic fibrosis|malakoplakia/i)
  tags.uniq
end

def infer_related(stem, chapter)
  return "tubular-adenoma" if stem.match?(/tubular adenoma|colorectal adenoma/i)
  nil
end

text = SOURCE.exist? ? File.read(SOURCE) : ""
chunks = text.split(/(?=^Question\s+\d+\s*$)/)
questions = []

chunks.each do |chunk|
  num = chunk[/^Question\s+(\d+)/, 1]
  next unless num

  parts = chunk.split(/^Answer\s+#{num}\s*$/, 2)
  next if parts.length < 2

  body = parts[0].sub(/^Question\s+\d+\s*\n?/, "").strip
  answer = parts[1].strip

  lines = body.lines.map(&:strip).reject(&:empty?)
  numbered = lines.select { |l| l.match?(/^\d+\.\s+/) }
  inline_abcd = body.match?(/\bA\.\s+.+\bB\.\s+/m)

  options = []
  stem = ""

  if numbered.any?
    stem = lines.reject { |l| l.match?(/^\d+\.\s+/) }.join(" ")
    keys = %w[A B C D]
    numbered.first(4).each_with_index do |line, i|
      options << { "key" => keys[i], "text" => line.sub(/^\d+\.\s+/, "") }
    end
  elsif inline_abcd
    stem = body.sub(/\s*A\.\s+.+/m, "").strip
    body.scan(/\b([A-D])\.\s+([^A-D]+?)(?=\s+[A-D]\.\s+|\z)/) do |k, txt|
      options << { "key" => k, "text" => txt.strip }
    end
  else
    next
  end

  next if options.length < 2

  correct_key = answer[/\A\s*([A-D])\./, 1]&.upcase
  next unless correct_key

  distractors = parse_distractors(answer)
  main = main_expl(answer, correct_key)

  options.each do |opt|
    opt["correct"] = opt["key"] == correct_key
    opt["explanation"] = if opt["correct"]
                           main
                         else
                           distractors[opt["key"]] || "See PathologyOutlines.com for full discussion."
                         end
  end

  chapter = infer_chapter(stem, answer)
  questions << {
    "id" => "po-gi-#{format('%04d', num.to_i)}",
    "source" => "pathologyoutlines",
    "source_url" => "https://www.pathologyoutlines.com/review-questions?sid=6",
    "po_subspecialty_id" => 6,
    "po_chapter" => chapter,
    "fields" => %w[gastrointestinal liver-pancreas],
    "tags" => infer_tags(stem, chapter),
    "stem" => stem,
    "image" => nil,
    "options" => options,
    "related_disease" => infer_related(stem, chapter),
    "explanation_status" => "complete"
  }
end

questions = questions.first(40)
raise "No questions parsed from source" if questions.empty?

OUT.dirname.mkpath
File.write(OUT, JSON.pretty_generate(questions))
puts "Seeded #{questions.length} questions to #{OUT.relative_path_from(ROOT)}"
