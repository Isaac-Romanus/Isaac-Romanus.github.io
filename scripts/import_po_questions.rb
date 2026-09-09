#!/usr/bin/env ruby
# frozen_string_literal: true

# Import Pathology Outlines board-review questions into assets/data/questions/.
#
# Mimics a real Chrome browser (UA + Client Hints + cookie jar + navigation
# warmup) and uses paced waits / Retry-After backoff to reduce HTTP 429s.
#
# Usage:
#   ruby scripts/import_po_questions.rb --sid 6 --out assets/data/questions/gi-liver.json
#   ruby scripts/import_po_questions.rb --sid 6 --limit 20 --delay 2.5 --jitter 1.5
#   ruby scripts/import_po_questions.rb --sid 6 --chid 148.0.7778.96 --merge
#
# Requires: gem install nokogiri
# Requires written permission from Pathology Outlines for personal educational use.

require "optparse"
require "json"
require "net/http"
require "uri"
require "fileutils"
require "securerandom"
require "digest"
require "time"
require "cgi"
require "shellwords"
require "date"
require "yaml"

begin
  require "nokogiri"
rescue LoadError
  warn "Missing dependency: nokogiri. Install with: gem install nokogiri"
  exit 1
end

ROOT = File.expand_path("..", __dir__)
DEFAULT_OUT_DIR = File.join(ROOT, "assets", "data", "questions")
IMAGE_DIR = File.join(ROOT, "assets", "images", "questionbank")
COOKIE_JAR = File.join(ROOT, "tmp", "po_import_cookies.txt")
LAST_HTML = File.join(ROOT, "tmp", "po_last_response.html")
USER_AGENTS_CACHE = File.join(ROOT, "tmp", "chrome_ua_cache.txt")
SUBS_YAML = File.join(ROOT, "_data", "po_subspecialties.yml")

def load_taxonomy
  begin
    require "yaml"
    rows = YAML.safe_load(File.read(SUBS_YAML), permitted_classes: [Date, Time], aliases: true) || []
  rescue LoadError, Errno::ENOENT, Psych::Exception
    rows = []
  end
  taxonomy = {}
  rows.each do |row|
    next unless row.is_a?(Hash) && row["sid"]

    taxonomy[row["sid"].to_i] = {
      sid: row["slug"].to_s,
      name: row["name"].to_s,
      fields: Array(row["fields"]).map(&:to_s)
    }
  end
  taxonomy
end

TAXONOMY = load_taxonomy.freeze

BASE_HOST = "https://www.pathologyoutlines.com"
HOME_URL = "#{BASE_HOST}/"
INDEX_URL = "#{BASE_HOST}/review-questions"
QUESTION_URL = "#{BASE_HOST}/review-questions"

DISTRACTOR_EXPLANATION =
  "This option is incorrect. Review the correct-answer explanation and the linked " \
  "PathologyOutlines topic for why this distractor does not fit."

options = {
  sid: nil,
  chid: nil,
  out: nil,
  limit: nil,
  download_images: true,
  dry_run: false,
  merge: false,
  delay: 2.0,
  jitter: 1.5,
  retries: 6,
  chrome_major: nil,
  warmup: true
}

OptionParser.new do |opts|
  opts.banner = "Usage: ruby scripts/import_po_questions.rb --sid N [options]"
  opts.on("--sid N", Integer, "Pathology Outlines subspecialty id") { |v| options[:sid] = v }
  opts.on("--chid VERSION", String, "Chrome full version for Client Hints (e.g. 148.0.7778.96)") { |v| options[:chid] = v }
  opts.on("--chrome-major N", Integer, "Override Chrome major version in UA") { |v| options[:chrome_major] = v }
  opts.on("--out PATH", String, "Output JSON path") { |v| options[:out] = v }
  opts.on("--limit N", Integer, "Max questions to import") { |v| options[:limit] = v }
  opts.on("--delay SECONDS", Float, "Base wait between requests (default: 2.0)") { |v| options[:delay] = v }
  opts.on("--jitter SECONDS", Float, "Random extra wait 0..N (default: 1.5)") { |v| options[:jitter] = v }
  opts.on("--retries N", Integer, "Max retries on 429/5xx (default: 6)") { |v| options[:retries] = v }
  opts.on("--no-images", "Do not download images; hotlink PO URLs") { options[:download_images] = false }
  opts.on("--no-warmup", "Skip homepage / index warmup") { options[:warmup] = false }
  opts.on("--dry-run", "Parse and print summary without writing") { options[:dry_run] = true }
  opts.on("--merge", "Merge with existing output file by id") { options[:merge] = true }
end.parse!

abort "Missing --sid" unless options[:sid]
meta = TAXONOMY[options[:sid]] || {
  sid: "po-#{options[:sid]}",
  name: "PO #{options[:sid]}",
  fields: []
}
out_path = options[:out] || File.join(DEFAULT_OUT_DIR, "#{meta[:sid]}.json")

# ---------------------------------------------------------------------------
# Chrome identity (imitate this machine's Chrome)
# ---------------------------------------------------------------------------

def detect_chrome_version
  candidates = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ]
  candidates.each do |bin|
    next unless system("command -v #{Shellwords.escape(bin)} >/dev/null 2>&1") || File.executable?(bin)

    out = `#{Shellwords.escape(bin)} --version 2>/dev/null`.to_s.strip
    if (m = out.match(/(\d+\.\d+\.\d+\.\d+)/))
      return m[1]
    end
    if (m = out.match(/(\d+)\./))
      return "#{m[1]}.0.0.0"
    end
  end

  # Linux Chrome user-data Last Version file
  home = ENV["HOME"].to_s
  [
    File.join(home, ".config/google-chrome/Last Version"),
    File.join(home, ".config/chromium/Last Version")
  ].each do |path|
    next unless File.file?(path)

    ver = File.read(path).to_s.strip
    return ver if ver.match?(/\A\d+\.\d+\.\d+\.\d+\z/)
  end

  nil
end

chrome_full = options[:chid] || detect_chrome_version || "148.0.7778.96"
chrome_major = (options[:chrome_major] || chrome_full.split(".").first).to_s
FileUtils.mkdir_p(File.dirname(USER_AGENTS_CACHE))
File.write(USER_AGENTS_CACHE, chrome_full)

# Match a current desktop Chrome on Linux (this Cloud Agent environment).
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " \
             "(KHTML, like Gecko) Chrome/#{chrome_full} Safari/537.36"
SEC_CH_UA = %("Not:A-Brand";v="99", "Google Chrome";v="#{chrome_major}", "Chromium";v="#{chrome_major}")

warn "Chrome identity: #{chrome_full} (major #{chrome_major})"
warn "User-Agent: #{USER_AGENT}"

# ---------------------------------------------------------------------------
# Cookie jar + Chrome-like HTTP client with waits / Retry-After
# ---------------------------------------------------------------------------

module CookieJar
  module_function

  def load(path)
    return {} unless File.file?(path)

    cookies = {}
    File.foreach(path) do |line|
      line = line.strip
      next if line.empty? || line.start_with?("#")

      parts = line.split("\t")
      next unless parts.length >= 7

      _domain, _flag, _path, _secure, _expires, name, value = parts
      cookies[name] = value
    end
    cookies
  end

  def save(path, cookies, domain: ".pathologyoutlines.com")
    FileUtils.mkdir_p(File.dirname(path))
    lines = ["# Netscape HTTP Cookie File", "# pathologyoutlines import jar", "#"]
    cookies.each do |name, value|
      lines << [domain, "TRUE", "/", "FALSE", "0", name, value].join("\t")
    end
    File.write(path, "#{lines.join("\n")}\n")
  end

  def merge_from_response!(cookies, response)
    Array(response.get_fields("set-cookie")).each do |raw|
      pair = raw.split(";", 2).first
      name, value = pair.split("=", 2)
      next if name.nil? || value.nil?

      cookies[name.strip] = value.strip
    end
  end

  def header(cookies)
    cookies.map { |k, v| "#{k}=#{v}" }.join("; ")
  end
end

class ChromeClient
  def initialize(cookies:, delay:, jitter:, retries:)
    @cookies = cookies
    @delay = delay
    @jitter = jitter
    @retries = retries
    @last_url = HOME_URL
    @request_count = 0
  end

  attr_reader :cookies, :last_url, :request_count

  def wait!(label: nil)
    seconds = @delay + (rand * @jitter)
    warn format("  wait %.2fs%s", seconds, label ? " (#{label})" : "")
    sleep(seconds)
  end

  def get(url, referer: nil, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
    uri = URI(url)
    attempt = 0
    loop do
      attempt += 1
      wait!(label: "before request ##{@request_count + 1}") if @request_count.positive?
      @request_count += 1

      response = perform_get(uri, referer: referer || @last_url, accept: accept)
      CookieJar.merge_from_response!(@cookies, response)
      CookieJar.save(COOKIE_JAR, @cookies)

      code = response.code.to_i
      if code == 429 || code >= 500
        ra = response["retry-after"].to_s.strip
        backoff = if ra.match?(/\A\d+\z/)
                    ra.to_f
                  elsif !ra.empty?
                    begin
                      [Time.httpdate(ra) - Time.now, 5].max
                    rescue ArgumentError
                      8.0 * attempt
                    end
                  else
                    8.0 * attempt
                  end
        backoff = [[backoff, 3.0].max, 120.0].min
        warn "  HTTP #{code} — sleeping #{backoff.round(1)}s (attempt #{attempt}/#{@retries})"
        raise "HTTP #{code} for #{url} after #{@retries} retries" if attempt >= @retries

        sleep(backoff)
        next
      end

      unless response.is_a?(Net::HTTPSuccess)
        raise "HTTP #{response.code} for #{url}: #{response.body.to_s[0, 200]}"
      end

      @last_url = url
      return response.body
    end
  end

  def download(url, dest, referer:)
    uri = URI(url)
    attempt = 0
    loop do
      attempt += 1
      wait!(label: "image download")
      response = perform_get(
        uri,
        referer: referer,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      )
      CookieJar.merge_from_response!(@cookies, response)
      code = response.code.to_i
      if code == 429 || code >= 500
        raise "image HTTP #{code} after retries" if attempt >= @retries

        sleep([[8.0 * attempt, 3].max, 60].min)
        next
      end
      return false unless response.is_a?(Net::HTTPSuccess)

      FileUtils.mkdir_p(File.dirname(dest))
      File.binwrite(dest, response.body)
      return true
    end
  rescue StandardError => e
    warn "  image download failed: #{e.message}"
    false
  end

  private

  def perform_get(uri, referer:, accept:)
    Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 30, read_timeout: 120) do |http|
      req = Net::HTTP::Get.new(uri)
      apply_chrome_headers!(req, uri: uri, referer: referer, accept: accept)
      http.request(req)
    end
  end

  def apply_chrome_headers!(req, uri:, referer:, accept:)
    req["User-Agent"] = USER_AGENT
    req["Accept"] = accept
    req["Accept-Language"] = "en-US,en;q=0.9"
    req["Accept-Encoding"] = "identity"
    req["Cache-Control"] = "max-age=0"
    req["Connection"] = "keep-alive"
    req["Upgrade-Insecure-Requests"] = "1"
    req["Sec-CH-UA"] = SEC_CH_UA
    req["Sec-CH-UA-Mobile"] = "?0"
    req["Sec-CH-UA-Platform"] = %("Linux")
    req["Sec-Fetch-Dest"] = accept.start_with?("image/") ? "image" : "document"
    req["Sec-Fetch-Mode"] = accept.start_with?("image/") ? "no-cors" : "navigate"
    req["Sec-Fetch-Site"] = referer.to_s.include?(uri.host.to_s) ? "same-origin" : "none"
    req["Sec-Fetch-User"] = "?1" unless accept.start_with?("image/")
    req["Referer"] = referer if referer && !referer.empty?
    cookie = CookieJar.header(@cookies)
    req["Cookie"] = cookie unless cookie.empty?
  end
end

# ---------------------------------------------------------------------------
# PO HTML parser (current board-review markup)
# ---------------------------------------------------------------------------

def absolute_url(url)
  return nil if url.nil? || url.strip.empty?

  u = url.strip
  return u if u.start_with?("http://", "https://")
  return "#{BASE_HOST}#{u}" if u.start_with?("/")

  "#{BASE_HOST}/#{u}"
end

def clean_text(str)
  CGI.unescapeHTML(str.to_s).gsub(/\u00a0/, " ").gsub(/\s+/, " ").strip
end

def extract_question_stem(body)
  clone = body.dup
  clone.css(".img1, .img2, .img3, ol, script, style").remove
  text = clean_text(clone.inner_text)
  text = text.sub(/\AQuestion\s+\d+\s*/i, "")
  text
end

def extract_images(body)
  urls = []
  body.css(".img1, .img2, .img3").each do |wrap|
    href = wrap.at_css("a[href]")&.[]("href")
    src = wrap.at_css("img[src]")&.[]("src")
    alt = wrap.at_css("img")&.[]("alt").to_s
    caption = wrap.at_css("a[data-title]")&.[]("data-title").to_s
    url = absolute_url(href) || absolute_url(src)
    next if url.nil?
    next if url.include?("NoImage.jpg")
    next if urls.any? { |u| u[:src] == url }

    urls << { src: url, alt: clean_text(alt), caption: clean_text(caption) }
  end
  urls
end

def parse_answer_block(answer_body)
  return [nil, "", nil, nil] unless answer_body

  bold = answer_body.at_css("b")
  letter = bold && clean_text(bold.text).upcase[0]
  full = clean_text(answer_body.inner_text)
  full = full.sub(/\AAnswer\s+\d+\s*/i, "")
  full = full.sub(/\s*Comment Here\s*/i, " ")
  explanation = full.sub(/\A[A-D]\s*\.\s*/i, "").strip
  explanation = explanation.sub(/\s*Reference:\s*.*\z/i, "").strip

  ref = answer_body.at_css("a[href*='topic/'], a[href*='pathologyoutlines.com']")
  topic = ref && absolute_url(ref["href"])
  chapter = nil
  if ref
    label = clean_text(ref.text)
    chapter = label.split(" - ").first if label && !label.empty?
  end
  [letter, explanation, topic, chapter]
end

def letter_to_index(letter, count)
  return nil if letter.nil?

  idx = letter.upcase.ord - "A".ord
  return nil if idx.negative? || idx >= count

  idx
end

def parse_questions(html, limit: nil, po_sid:, fields:, source_url:)
  doc = Nokogiri::HTML(html)
  blocks = doc.css(".block_content")
  warn "Parser found #{blocks.size} .block_content nodes"
  results = []

  blocks.each do |block|
    break if limit && results.size >= limit

    q_sec = block.at_css(".block_section.question")
    next unless q_sec

    q_body = q_sec.at_css(".block_body") || q_sec
    a_sec = block.at_css(".block_section.answer")
    a_body = a_sec&.at_css(".block_body.answer_block, .answer_block, .block_body")

    option_texts = q_body.css("ol.liststyle2 li, ol li").map { |li| clean_text(li.text) }.reject(&:empty?)
    next if option_texts.size < 2

    stem = extract_question_stem(q_body)
    next if stem.empty?

    images = extract_images(q_body)
    letter, explanation, _topic_url, chapter = parse_answer_block(a_body)
    correct = letter_to_index(letter, option_texts.size)
    next if correct.nil?

    po_id = q_sec["id"].to_s.sub(/\Apracticequestion/i, "")
    po_id = Digest::SHA1.hexdigest(stem)[0, 10] if po_id.empty?

    options = option_texts.each_with_index.map do |text, idx|
      {
        "key" => ("A".ord + idx).chr,
        "text" => text,
        "correct" => idx == correct,
        "explanation" => idx == correct ? explanation : DISTRACTOR_EXPLANATION
      }
    end

    image_objs = images.map do |im|
      { "src" => im[:src], "alt" => im[:alt], "caption" => im[:caption] }
    end

    results << {
      "id" => "po-#{po_id}",
      "source" => "pathologyoutlines",
      "source_url" => source_url,
      "po_subspecialty_id" => po_sid,
      "po_chapter" => chapter,
      "fields" => fields.dup,
      "tags" => [],
      "stem" => stem,
      "image" => image_objs[0] && image_objs[0]["src"],
      "options" => options,
      "related_disease" => nil,
      "explanation_status" => "partial",
      "images" => image_objs
    }
  end

  results
end

def download_images!(client, questions, subspecialty, referer:)
  FileUtils.mkdir_p(IMAGE_DIR)
  questions.each_with_index do |q, qi|
    imgs = q["images"]
    next if imgs.nil? || imgs.empty?

    local_images = []
    imgs.each_with_index do |img, ii|
      src = img["src"].to_s
      next if src.empty?

      ext = File.extname(URI(src).path)
      ext = ".jpg" if ext.empty? || ext.length > 5
      fname = "#{subspecialty}-#{q["id"].gsub(/[^a-z0-9\-]/i, "")}-#{ii}#{ext}"
      dest = File.join(IMAGE_DIR, fname)
      rel = "/assets/images/questionbank/#{fname}"

      if File.file?(dest) && File.size(dest).positive?
        warn "  [#{qi + 1}] reuse #{fname}"
        local_images << img.merge("src" => rel)
        next
      end

      warn "  [#{qi + 1}] download #{src}"
      if client.download(src, dest, referer: referer)
        local_images << img.merge("src" => rel)
      else
        local_images << img # keep hotlink
      end
    end

    q["images"] = local_images
    q["image"] = local_images[0] && local_images[0]["src"]
  end
end

def read_bank(path)
  return [] unless File.file?(path)

  data = JSON.parse(File.read(path))
  data.is_a?(Array) ? data : Array(data["questions"])
end

def merge_questions(existing, incoming)
  by_id = {}
  existing.each { |q| by_id[q["id"]] = q }
  incoming.each { |q| by_id[q["id"]] = q }
  by_id.values
end

def write_bank!(path, questions)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, JSON.pretty_generate(questions) + "\n")
end

def update_index!(bank_path, meta, _count = nil)
  index_path = File.join(DEFAULT_OUT_DIR, "index.json")
  index = if File.file?(index_path)
            JSON.parse(File.read(index_path))
          else
            { "version" => 1, "banks" => {} }
          end
  banks = index["banks"]
  # Preserve legacy hash map: { "gi-liver" => "gi-liver.json" }
  if banks.is_a?(Hash)
    banks[meta[:sid]] = File.basename(bank_path)
  else
    banks = Array(banks)
    banks.reject! { |b| b.is_a?(Hash) && b["id"] == meta[:sid] }
    rel = bank_path.sub(%r{\A#{Regexp.escape(ROOT)}/?}, "")
    banks << {
      "id" => meta[:sid],
      "name" => meta[:name],
      "path" => rel.start_with?("assets/") ? "/#{rel}" : rel
    }
    banks.sort_by! { |b| b["name"].to_s }
  end
  index["banks"] = banks
  index["updatedAt"] = Time.now.utc.iso8601
  File.write(index_path, JSON.pretty_generate(index) + "\n")
end

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

FileUtils.mkdir_p(File.join(ROOT, "tmp"))
cookies = CookieJar.load(COOKIE_JAR)
client = ChromeClient.new(
  cookies: cookies,
  delay: options[:delay],
  jitter: options[:jitter],
  retries: options[:retries]
)

question_page = "#{QUESTION_URL}?sid=#{options[:sid]}"

if options[:warmup]
  begin
    warn "Warmup: homepage"
    client.get(HOME_URL, referer: "")
    warn "Warmup: question bank index"
    client.get(INDEX_URL, referer: HOME_URL)
  rescue StandardError => e
    warn "Warmup skipped after error: #{e.message}"
  end
end

warn "Fetching questions: #{question_page}"
html = client.get(question_page, referer: INDEX_URL)
File.write(LAST_HTML, html)
warn "Saved raw HTML → #{LAST_HTML} (#{html.bytesize} bytes)"

questions = parse_questions(
  html,
  limit: options[:limit],
  po_sid: options[:sid],
  fields: meta[:fields] || [],
  source_url: question_page
)
warn "Parsed #{questions.size} questions"

if options[:download_images] && !options[:dry_run]
  warn "Downloading images (paced)…"
  download_images!(client, questions, meta[:sid], referer: question_page)
end

if options[:dry_run]
  with_img = questions.count { |q| Array(q["images"]).any? }
  warn "Dry run: #{questions.size} questions, #{with_img} with images"
  questions.first(3).each do |q|
    warn "- #{q["id"]}: #{q["stem"][0, 80]}… imgs=#{Array(q["images"]).size}"
  end
  exit 0
end

if options[:merge] && File.file?(out_path)
  old = read_bank(out_path)
  questions = merge_questions(old, questions)
  warn "Merged → #{questions.size} total questions"
end

# Only update the shared index when writing into assets/data/questions/
writing_to_assets = File.expand_path(out_path).start_with?(File.expand_path(DEFAULT_OUT_DIR) + File::SEPARATOR)
write_bank!(out_path, questions)
update_index!(out_path, meta, questions.size) if writing_to_assets
warn "Wrote #{questions.size} questions → #{out_path}"
warn "Done."
