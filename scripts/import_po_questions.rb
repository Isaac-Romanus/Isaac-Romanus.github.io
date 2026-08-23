#!/usr/bin/env ruby
# frozen_string_literal: true

# Import Pathology Outlines review questions into JSON bank files.
# Usage:
#   ruby scripts/import_po_questions.rb --sid 6 --chapter Colon --limit 30
#   ruby scripts/import_po_questions.rb --sid 6 --output assets/data/questions/gi-liver.json

require "json"
require "net/http"
require "uri"
require "pathname"
require "fileutils"
require "nokogiri"
require "optparse"

ROOT = Pathname.new(__dir__).parent
SUBS = ROOT.join("_data/po_subspecialties.yml")
IMG_DIR = ROOT.join("assets/images/questionbank")

def load_subs
  require "yaml"
  YAML.safe_load(File.read(SUBS), permitted_classes: [Date, Time], aliases: true) || []
end

def slug_for_sid(sid)
  load_subs.find { |s| s["sid"] == sid }&.dig("slug") || "sid-#{sid}"
end

def fetch_html(sid, chapter: nil)
  uri = URI("https://www.pathologyoutlines.com/review-questions?sid=#{sid}")
  uri.query = URI.encode_www_form({ sid: sid, chapter: chapter }.compact)
  Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 60) do |http|
    req = Net::HTTP::Get.new(uri)
    req["User-Agent"] = "PathologyNotebookImporter/1.0 (personal study; contact via repo)"
    res = http.request(req)
    raise "HTTP #{res.code} for #{uri}" unless res.is_a?(Net::HTTPSuccess)
    res.body
  end
end

def strip_html(text)
  text.to_s.gsub(/<[^>]+>/, " ").gsub(/\s+/, " ").strip
end

def parse_answer_explanations(answer_text)
  distractors = {}
  answer_text.scan(/Answer\s+([A-D])\s+is\s+incorrect\s+because\s+(.*?)(?=Answer\s+[A-D]\s+is\s+incorrect|Answers?\s+[A-D]|Comment|$)/mi) do |letter, expl|
    distractors[letter.upcase] = expl.strip.gsub(/\s+/, " ")
  end
  distractors
end

def extract_correct_key(answer_text)
  m = answer_text.match(/\A\s*([A-D])\./i)
  m ? m[1].upcase : nil
end

def main_explanation(answer_text, correct_key)
  text = answer_text.dup
  if correct_key
    text.sub!(/\A\s*#{correct_key}\.\s*/i, "")
    text.sub!(/\.\s*Answers?\s+[A-D].*\z/mi, ".")
    text.sub!(/\.\s*Answer\s+[A-D]\s+is\s+incorrect.*\z/mi, ".")
  end
  text.strip.gsub(/\s+/, " ")
end

def download_image(url, sid, qnum)
  return nil if url.to_s.strip.empty?
  uri = URI(url.start_with?("http") ? url : "https://www.pathologyoutlines.com#{url}")
  FileUtils.mkdir_p(IMG_DIR)
  ext = File.extname(uri.path)
  ext = ".jpg" if ext.empty?
  fname = "po-sid#{sid}-q#{format('%04d', qnum)}#{ext}"
  dest = IMG_DIR.join(fname)
  unless dest.exist?
    Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https") do |http|
      res = http.get(uri.path + (uri.query ? "?#{uri.query}" : ""))
      File.binwrite(dest, res.body) if res.is_a?(Net::HTTPSuccess)
    end
  end
  "/assets/images/questionbank/#{fname}"
rescue StandardError
  nil
end

def parse_questions(html, sid:, chapter: nil, limit: nil)
  doc = Nokogiri::HTML(html)
  blocks = doc.css(".question_block, .review_question, div.question")
  questions = []

  if blocks.empty?
    # Fallback: parse plain-text blocks from markdown-converted layout
    body = doc.at("body")&.text.to_s
    body.split(/(?=Question\s+\d+\s*\n)/i).each do |chunk|
      next unless chunk.match?(/\AQuestion\s+\d+/i)
      num = chunk[/Question\s+(\d+)/i, 1].to_i
      parts = chunk.split(/Answer\s+#{num}\s*\n/i, 2)
      next if parts.length < 2
      stem_part = parts[0].sub(/Question\s+\d+\s*\n/i, "").strip
      answer_part = parts[1].strip
      stem_lines = stem_part.lines.map(&:strip).reject(&:empty?)
      option_lines = stem_lines.select { |l| l.match?(/^\d+\.\s+/) }
      stem_text = stem_lines.reject { |l| l.match?(/^\d+\.\s+/) }.join(" ")
      next if option_lines.empty?

      keys = %w[A B C D E]
      options = option_lines.first(4).map.with_index do |line, i|
        { "key" => keys[i], "text" => line.sub(/^\d+\.\s+/, "").strip }
      end
      correct_key = extract_correct_key(answer_part)
      distractors = parse_answer_explanations(answer_part)
      main_expl = main_explanation(answer_part, correct_key)

      options.each do |opt|
        opt["correct"] = opt["key"] == correct_key
        opt["explanation"] = if opt["correct"]
                               main_expl
                             else
                               distractors[opt["key"]] || "See PathologyOutlines explanation."
                             end
      end

      questions << {
        "id" => "po-gi-#{format('%04d', num)}",
        "source" => "pathologyoutlines",
        "source_url" => "https://www.pathologyoutlines.com/review-questions?sid=#{sid}",
        "po_subspecialty_id" => sid,
        "po_chapter" => chapter,
        "fields" => sid == 6 ? %w[gastrointestinal liver-pancreas] : [],
        "tags" => [],
        "stem" => stem_text,
        "image" => nil,
        "options" => options,
        "related_disease" => nil,
        "explanation_status" => "complete"
      }
    end
  else
    blocks.each_with_index do |block, idx|
      stem = strip_html(block.at_css(".question_text, .question")&.inner_html)
      option_els = block.css(".answer_option, .option, li")
      answer_el = block.at_css(".answer_text, .answer")
      answer_text = strip_html(answer_el&.text)
      correct_key = extract_correct_key(answer_text)
      distractors = parse_answer_explanations(answer_text)
      main_expl = main_explanation(answer_text, correct_key)

      options = option_els.first(4).map.with_index do |el, i|
        key = (%w[A B C D])[i]
        {
          "key" => key,
          "text" => strip_html(el.text),
          "correct" => key == correct_key,
          "explanation" => key == correct_key ? main_expl : (distractors[key] || "")
        }
      end

      img_url = block.at_css("img")&.[]("src")
      image = download_image(img_url, sid, idx + 1)

      questions << {
        "id" => "po-#{slug_for_sid(sid)}-#{format('%04d', idx + 1)}",
        "source" => "pathologyoutlines",
        "source_url" => "https://www.pathologyoutlines.com/review-questions?sid=#{sid}",
        "po_subspecialty_id" => sid,
        "po_chapter" => chapter,
        "fields" => sid == 6 ? %w[gastrointestinal liver-pancreas] : [],
        "tags" => [],
        "stem" => stem,
        "image" => image,
        "options" => options,
        "related_disease" => nil,
        "explanation_status" => options.all? { |o| !o["explanation"].to_s.strip.empty? } ? "complete" : "partial"
      }
    end
  end

  questions = questions.first(limit) if limit
  questions
end

options = { sid: 6, chapter: nil, limit: nil, output: nil }
OptionParser.new do |opts|
  opts.on("--sid N", Integer) { |v| options[:sid] = v }
  opts.on("--chapter NAME") { |v| options[:chapter] = v }
  opts.on("--limit N", Integer) { |v| options[:limit] = v }
  opts.on("--output PATH") { |v| options[:output] = v }
end.parse!

slug = slug_for_sid(options[:sid])
output = options[:output] ? ROOT.join(options[:output]) : ROOT.join("assets/data/questions/#{slug}.json")

puts "Fetching PO sid=#{options[:sid]}#{" chapter=#{options[:chapter]}" if options[:chapter]}..."
html = fetch_html(options[:sid], chapter: options[:chapter])
questions = parse_questions(html, sid: options[:sid], chapter: options[:chapter], limit: options[:limit])

if questions.empty?
  warn "No questions parsed — site may be rate-limiting or HTML structure changed."
  exit 1
end

FileUtils.mkdir_p(output.dirname)
File.write(output, JSON.pretty_generate(questions))
puts "Wrote #{questions.length} questions to #{output.relative_path_from(ROOT)}"
