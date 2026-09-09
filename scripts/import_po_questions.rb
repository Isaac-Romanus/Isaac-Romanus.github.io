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

TAXONOMY = {
  6 => { sid: "gi-liver", name: "GI / Liver", tags: %w[gi liver] },
  2 => { sid: "breast", name: "Breast", tags: %w[breast] },
  3 => { sid: "dermatopathology", name: "Dermatopathology", tags: %w[derm] },
  7 => { sid: "hematopathology", name: "Hematopathology", tags: %w[heme] },
  9 => { sid: "genitourinary", name: "Genitourinary", tags: %w[gu] },
  8 => { sid: "gynecologic", name: "Gynecologic", tags: %w[gyn] },
  11 => { sid: "head-neck", name: "Head & Neck", tags: %w[hn] },
  15 => { sid: "soft-tissue-bone", name: "Soft Tissue / Bone", tags: %w[soft-tissue bone] },
  14 => { sid: "pulmonary", name: "Pulmonary", tags: %w[pulmonary] },
  4 => { sid: "endocrine", name: "Endocrine", tags: %w[endocrine] },
  5 => { sid: "forensic", name: "Forensic / Autopsy", tags: %w[forensic] },
  10 => { sid: "clinical-pathology", name: "Clinical Pathology", tags: %w[cp] },
  12 => { sid: "informatics", name: "Informatics", tags: %w[informatics] },
  13 => { sid: "molecular", name: "Molecular", tags: %w[molecular] },
  16 => { sid: "cytopathology", name: "Cytopathology", tags: %w[cyto] }
}.freeze

BASE_HOST = "https://www.pathologyoutlines.com"
HOME_URL = "#{BASE_HOST}/"
INDEX_URL = "#{BASE_HOST}/php/boardreview.php"
QUESTION_URL = "#{BASE_HOST}/php/boardreviewquestion.php"

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
meta = TAXONOMY[options[:sid]] || { sid: "po-#{options[:sid]}", name: "PO #{options[:sid]}", tags: [] }
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
      wait!("before request ##{@request_count + 1}") if @request_count.positive?
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
      wait!("image download")
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
  return [nil, "", nil] unless answer_body

  bold = answer_body.at_css("b")
  letter = bold && clean_text(bold.text).upcase[0]
  full = clean_text(answer_body.inner_text)
  # Drop UI chrome
  full = full.sub(/\AAnswer\s+\d+\s*/i, "")
  full = full.sub(/\s*Comment Here\s*/i, " ")
  explanation = full.sub(/\A[A-D]\s*\.\s*/i, "").strip
  # Prefer keeping "Answers X are incorrect..." as part of explanation
  ref = answer_body.at_css("a[href*='topic/'], a[href*='pathologyoutlines.com']")
  topic = ref && absolute_url(ref["href"])
  [letter, explanation, topic]
end

def letter_to_index(letter, count)
  return nil if letter.nil?

  idx = letter.upcase.ord - "A".ord
  return nil if idx.negative? || idx >= count

  idx
end

def parse_questions(html, limit: nil)
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

    options = q_body.css("ol.liststyle2 li, ol li").map { |li| clean_text(li.text) }.reject(&:empty?)
    next if options.size < 2

    stem = extract_question_stem(q_body)
    next if stem.empty?

    images = extract_images(q_body)
    letter, explanation, topic_url = parse_answer_block(a_body)
    correct = letter_to_index(letter, options.size)
    next if correct.nil?

    po_id = q_sec["id"].to_s.sub(/\Apracticequestion/i, "")
    po_id = Digest::SHA1.hexdigest(stem)[0, 10] if po_id.empty?

    answers = options.each_with_index.map do |text, idx|
      {
        "id" => ("a".."z").to_a[idx],
        "text" => text,
        "explanation" => idx == correct ? explanation : "",
        "explanationCompleteness" => idx == correct ? "complete" : "partial"
      }
    end

    # Attach distractor rationale when PO packs it into the correct explanation
    # ("Answers B, C and D are incorrect because..."). Keep on correct answer;
    # leave others partial unless we can split cleanly later.

    item = {
      "id" => "po-#{po_id}",
      "stem" => stem,
      "answers" => answers,
      "correctAnswerId" => answers[correct]["id"],
      "images" => images.map { |im| { "src" => im[:src], "alt" => im[:alt], "caption" => im[:caption] } },
      "image" => images[0] && images[0][:src],
      "tags" => [],
      "difficulty" => nil,
      "source" => {
        "type" => "pathology-outlines",
        "url" => nil,
        "topicUrl" => topic_url,
        "poQuestionId" => po_id,
        "licenseNote" => "Personal educational use only — written permission obtained."
      },
      "reviewStatus" => "imported",
      "createdAt" => Time.now.utc.iso8601,
      "updatedAt" => Time.now.utc.iso8601
    }
    results << item
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

def merge_questions(existing, incoming)
  by_id = {}
  existing.each { |q| by_id[q["id"]] = q }
  incoming.each { |q| by_id[q["id"]] = q }
  by_id.values
end

def write_bank!(path, meta, questions, po_sid:)
  FileUtils.mkdir_p(File.dirname(path))
  payload = {
    "version" => 1,
    "subspecialty" => {
      "id" => meta[:sid],
      "name" => meta[:name],
      "poSid" => po_sid
    },
    "updatedAt" => Time.now.utc.iso8601,
    "questions" => questions
  }
  File.write(path, JSON.pretty_generate(payload) + "\n")
end

def update_index!(bank_path, meta, count)
  index_path = File.join(DEFAULT_OUT_DIR, "index.json")
  index = File.file?(index_path) ? JSON.parse(File.read(index_path)) : { "version" => 1, "banks" => [] }
  rel = bank_path.sub(%r{\A#{Regexp.escape(ROOT)}/?}, "")
  banks = index["banks"] || []
  entry = {
    "id" => meta[:sid],
    "name" => meta[:name],
    "path" => rel.start_with?("assets/") ? "/#{rel}" : rel,
    "questionCount" => count
  }
  banks.reject! { |b| b["id"] == meta[:sid] }
  banks << entry
  banks.sort_by! { |b| b["name"].to_s }
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
  warn "Warmup: homepage"
  client.get(HOME_URL, referer: "")
  warn "Warmup: question bank index"
  client.get(INDEX_URL, referer: HOME_URL)
end

warn "Fetching questions: #{question_page}"
html = client.get(question_page, referer: INDEX_URL)
File.write(LAST_HTML, html)
warn "Saved raw HTML → #{LAST_HTML} (#{html.bytesize} bytes)"

questions = parse_questions(html, limit: options[:limit])
warn "Parsed #{questions.size} questions"

# Apply default tags from taxonomy
questions.each do |q|
  q["tags"] = (meta[:tags] + Array(q["tags"])).uniq
  q["source"]["url"] = question_page
end

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
  existing = JSON.parse(File.read(out_path))
  old = existing["questions"] || []
  questions = merge_questions(old, questions)
  warn "Merged → #{questions.size} total questions"
end

write_bank!(out_path, meta, questions, po_sid: options[:sid])
update_index!(out_path, meta, questions.size)
warn "Wrote #{questions.size} questions → #{out_path}"
warn "Done."
