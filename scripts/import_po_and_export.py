#!/usr/bin/env python3
"""Import Pathology Outlines review questions and export CSV/Excel.

Mimics Chrome (UA + Client Hints + cookies + paced waits) to reduce HTTP 429s.
Parses each .block_content so images stay tied to their question.

Usage:
  .venv/bin/python scripts/import_po_and_export.py --sid 6
  .venv/bin/python scripts/import_po_and_export.py --sid 6 --html tmp/po_last_response.html
  .venv/bin/python scripts/import_po_and_export.py --sid 6 --no-images-download

Requires written permission from Pathology Outlines for personal educational use.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import time
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "assets" / "data" / "questions"
IMAGE_DIR = ROOT / "assets" / "images" / "questionbank"
DATA_DIR = ROOT / "data" / "questionbanks"
TMP_DIR = ROOT / "tmp"
ARTIFACT_DIR = Path("/opt/cursor/artifacts")
COOKIE_JAR = TMP_DIR / "po_import_cookies.json"
LAST_HTML = TMP_DIR / "po_last_response.html"
SUBS_YAML = ROOT / "_data" / "po_subspecialties.yml"

BASE = "https://www.pathologyoutlines.com"
HOME_URL = f"{BASE}/"
INDEX_URL = f"{BASE}/review-questions"

DISTRACTOR = (
    "This option is incorrect. Review the correct-answer explanation and the "
    "linked PathologyOutlines topic for why this distractor does not fit."
)

NAN = "NaN"


def load_taxonomy() -> dict[int, dict[str, Any]]:
    try:
        import yaml  # type: ignore
    except ImportError:
        yaml = None
    taxonomy: dict[int, dict[str, Any]] = {}
    if yaml and SUBS_YAML.is_file():
        rows = yaml.safe_load(SUBS_YAML.read_text()) or []
        for row in rows:
            if not isinstance(row, dict) or row.get("sid") is None:
                continue
            taxonomy[int(row["sid"])] = {
                "slug": str(row.get("slug") or f"po-{row['sid']}"),
                "name": str(row.get("name") or f"PO {row['sid']}"),
                "fields": [str(f) for f in (row.get("fields") or [])],
            }
    # Fallback for GI if YAML missing
    taxonomy.setdefault(
        6,
        {
            "slug": "gi-liver",
            "name": "GI / liver",
            "fields": ["gastrointestinal", "liver-pancreas"],
        },
    )
    return taxonomy


def detect_chrome_version() -> str:
    for path in (
        Path.home() / ".config/google-chrome/Last Version",
        Path.home() / ".config/chromium/Last Version",
    ):
        if path.is_file():
            ver = path.read_text().strip()
            if re.fullmatch(r"\d+\.\d+\.\d+\.\d+", ver):
                return ver
    return "148.0.7778.96"


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    t = unescape(s)
    t = t.replace("\xa0", " ")
    t = re.sub(r"\s+", " ", t).strip()
    return t


@dataclass
class ChromeSession:
    chrome_full: str
    delay: float
    jitter: float
    retries: int
    cookies: dict[str, str] = field(default_factory=dict)
    last_url: str = HOME_URL
    request_count: int = 0

    def __post_init__(self) -> None:
        self.major = self.chrome_full.split(".")[0]
        self.ua = (
            f"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            f"(KHTML, like Gecko) Chrome/{self.chrome_full} Safari/537.36"
        )
        self.sec_ch_ua = (
            f'"Not:A-Brand";v="99", "Google Chrome";v="{self.major}", '
            f'"Chromium";v="{self.major}"'
        )
        if COOKIE_JAR.is_file():
            try:
                self.cookies = json.loads(COOKIE_JAR.read_text())
            except json.JSONDecodeError:
                self.cookies = {}

    def _save_cookies(self) -> None:
        TMP_DIR.mkdir(parents=True, exist_ok=True)
        COOKIE_JAR.write_text(json.dumps(self.cookies, indent=2) + "\n")

    def wait(self, label: str | None = None) -> None:
        seconds = self.delay + random.random() * self.jitter
        msg = f"  wait {seconds:.2f}s"
        if label:
            msg += f" ({label})"
        print(msg, flush=True)
        time.sleep(seconds)

    def _headers(self, url: str, referer: str | None, accept: str) -> dict[str, str]:
        host = urlparse(url).netloc
        ref_host = urlparse(referer or "").netloc
        is_image = accept.startswith("image/")
        headers = {
            "User-Agent": self.ua,
            "Accept": accept,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "identity",
            "Cache-Control": "max-age=0",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-CH-UA": self.sec_ch_ua,
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"Linux"',
            "Sec-Fetch-Dest": "image" if is_image else "document",
            "Sec-Fetch-Mode": "no-cors" if is_image else "navigate",
            "Sec-Fetch-Site": "same-origin" if ref_host == host else "none",
        }
        if not is_image:
            headers["Sec-Fetch-User"] = "?1"
        if referer:
            headers["Referer"] = referer
        if self.cookies:
            headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        return headers

    def get(self, url: str, referer: str | None = None, accept: str | None = None) -> str:
        accept = accept or (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,image/apng,*/*;q=0.8"
        )
        attempt = 0
        while True:
            attempt += 1
            if self.request_count > 0:
                self.wait(f"before request #{self.request_count + 1}")
            self.request_count += 1
            resp = requests.get(
                url,
                headers=self._headers(url, referer or self.last_url, accept),
                timeout=120,
            )
            for c in resp.cookies:
                self.cookies[c.name] = c.value
            self._save_cookies()
            code = resp.status_code
            if code == 429 or code >= 500:
                ra = resp.headers.get("Retry-After", "").strip()
                if ra.isdigit():
                    backoff = float(ra)
                else:
                    backoff = min(max(8.0 * attempt, 3.0), 120.0)
                print(f"  HTTP {code} — sleeping {backoff:.1f}s (attempt {attempt}/{self.retries})", flush=True)
                if attempt >= self.retries:
                    raise RuntimeError(f"HTTP {code} for {url} after {self.retries} retries")
                time.sleep(backoff)
                continue
            if not resp.ok:
                raise RuntimeError(f"HTTP {code} for {url}: {resp.text[:200]}")
            self.last_url = url
            return resp.text

    def download(self, url: str, dest: Path, referer: str) -> bool:
        attempt = 0
        accept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        while attempt < self.retries:
            attempt += 1
            self.wait("image download")
            try:
                resp = requests.get(
                    url,
                    headers=self._headers(url, referer, accept),
                    timeout=120,
                )
            except requests.RequestException as exc:
                print(f"  image error: {exc}", flush=True)
                time.sleep(min(8.0 * attempt, 60))
                continue
            for c in resp.cookies:
                self.cookies[c.name] = c.value
            self._save_cookies()
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(min(8.0 * attempt, 60))
                continue
            if not resp.ok:
                return False
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(resp.content)
            return True
        return False


def abs_url(url: str | None) -> str | None:
    if not url or not str(url).strip():
        return None
    u = str(url).strip()
    # Some PO markup has leading spaces or http:// without www
    if u.startswith(("http://", "https://")):
        u = u.replace("://www.pathologyoutlines.com//", "://www.pathologyoutlines.com/")
        u = u.replace("://pathologyoutlines.com//", "://www.pathologyoutlines.com/")
        return u
    return urljoin(BASE + "/", u.lstrip("/")).replace(
        "://www.pathologyoutlines.com//", "://www.pathologyoutlines.com/"
    )


def extract_images(body) -> list[dict[str, str]]:
    """Pull images only from this question body (.img1/.img2/.img3)."""
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for wrap in body.select(".img1, .img2, .img3"):
        a = wrap.select_one("a[href]")
        img = wrap.select_one("img[src]")
        href = a.get("href") if a else None
        src = img.get("src") if img else None
        url = abs_url(href) or abs_url(src)
        if not url or "NoImage.jpg" in url or url in seen:
            continue
        # Normalize http→https for pathologyoutlines
        if url.startswith("http://www.pathologyoutlines.com"):
            url = "https://" + url[len("http://") :]
        if url.startswith("http://pathologyoutlines.com"):
            url = "https://www." + url[len("http://") :]
        seen.add(url)
        alt = clean_text(img.get("alt") if img else "")
        if alt.lower() == "missing image":
            alt = ""
        caption = clean_text(a.get("data-title") if a else "")
        out.append({"src": url, "alt": alt, "caption": caption, "source_url": url})
    return out


def extract_options_from_ol(body) -> list[str]:
    option_els = body.select("ol.liststyle2 li") or body.select("ol li")
    return [t for t in (clean_text(li.get_text(" ")) for li in option_els) if t]


def extract_options_from_letters(body) -> list[str]:
    """Fallback when options are plain 'A. … B. …' text instead of <li>."""
    clone = BeautifulSoup(str(body), "lxml")
    root = clone.select_one(".block_body") or clone
    for sel in (".img1", ".img2", ".img3", "script", "style"):
        for node in root.select(sel):
            node.decompose()
    text = clean_text(root.get_text(" "))
    # Split on "A. " … "B. " patterns
    parts = re.split(r"(?=(?:^|\s)([A-E])\.\s)", text)
    # Manual scan
    matches = list(re.finditer(r"(?:^|\s)([A-E])\.\s+", text))
    if len(matches) < 2:
        return []
    options: list[str] = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        opt = clean_text(text[start:end])
        # Stop at answer section leakage
        opt = re.split(r"\bAnswer\s+\d+\b", opt, flags=re.I)[0].strip()
        if opt:
            options.append(opt)
    # Only accept if letters are sequential from A
    letters = [m.group(1) for m in matches[: len(options)]]
    expected = [chr(ord("A") + i) for i in range(len(letters))]
    if letters != expected:
        return []
    return options


def extract_stem(body, option_texts: list[str]) -> str:
    """Stem may sit outside <ol> or as text nodes inside <ol> before <li>."""
    clone = BeautifulSoup(str(body), "lxml")
    root = clone.select_one(".block_body") or clone
    for sel in (".img1", ".img2", ".img3", "script", "style"):
        for node in root.select(sel):
            node.decompose()

    stem_bits: list[str] = []
    ol = root.select_one("ol")
    if ol is not None:
        # Text before the list
        for sibling in list(ol.previous_siblings):
            if getattr(sibling, "get_text", None):
                stem_bits.insert(0, sibling.get_text(" "))
            elif isinstance(sibling, str):
                stem_bits.insert(0, sibling)
        # Text inside ol before first li (common PO pattern)
        for child in ol.children:
            name = getattr(child, "name", None)
            if name == "li":
                break
            if name is not None:
                stem_bits.append(child.get_text(" "))
            elif isinstance(child, str):
                stem_bits.append(child)
        # Remove lis so they don't leak if we fall back to full text
        for li in ol.select("li"):
            li.decompose()
    else:
        stem_bits.append(root.get_text(" "))

    text = clean_text(" ".join(stem_bits))
    text = re.sub(r"^Question\s+\d+\s*", "", text, flags=re.I)
    # Strip leading A–E option echoes if fallback sucked them in
    for opt in option_texts:
        if opt and text.endswith(opt):
            text = text[: -len(opt)].strip()
            text = re.sub(r"[A-E]\.\s*$", "", text).strip()
    # If letter-prefixed options leaked into stem, cut at first "A. "
    if option_texts and re.search(r"(?:^|\s)A\.\s+", text):
        text = re.split(r"(?:^|\s)A\.\s+", text, maxsplit=1)[0].strip()

    # If still empty, derive by subtracting options from full body text
    if not text:
        full = clean_text(root.get_text(" "))
        full = re.sub(r"^Question\s+\d+\s*", "", full, flags=re.I)
        for opt in reversed(option_texts):
            idx = full.rfind(opt)
            if idx >= 0:
                full = full[:idx]
        full = re.sub(r"(?:[A-E]\.\s*)+$", "", full).strip()
        text = clean_text(full)
    return text


def parse_answer(answer_body) -> tuple[str | None, str, str | None, str | None]:
    if answer_body is None:
        return None, "", None, None
    bold = answer_body.find("b")
    letter = clean_text(bold.get_text())[:1].upper() if bold else None
    full = clean_text(answer_body.get_text(" "))
    full = re.sub(r"^Answer\s+\d+\s*", "", full, flags=re.I)
    full = re.sub(r"\s*Comment Here\s*", " ", full, flags=re.I)
    explanation = re.sub(r"^[A-E]\s*\.\s*", "", full, flags=re.I).strip()
    explanation = re.sub(r"\s*Reference:\s*.*$", "", explanation, flags=re.I).strip()

    ref = answer_body.select_one("a[href*='topic/'], a[href*='pathologyoutlines.com']")
    topic = abs_url(ref.get("href")) if ref else None
    chapter = None
    if ref:
        label = clean_text(ref.get_text())
        if label:
            chapter = label.split(" - ")[0].strip() or None
    return letter, explanation, topic, chapter


def letter_index(letter: str | None, count: int) -> int | None:
    if not letter:
        return None
    idx = ord(letter.upper()) - ord("A")
    if idx < 0 or idx >= count:
        return None
    return idx


def split_distractor_notes(correct_explanation: str, option_keys: list[str], correct_key: str) -> dict[str, str]:
    """Best-effort split of 'Answers B, C and D are incorrect because…'."""
    out = {k: NAN for k in option_keys}
    out[correct_key] = correct_explanation or NAN
    m = re.search(
        r"Answers?\s+([A-E](?:\s*,\s*[A-E])*(?:\s*(?:and|&)\s*[A-E])?)\s+are incorrect because\s+(.+)$",
        correct_explanation,
        flags=re.I,
    )
    if not m:
        return out
    letters_raw, reason = m.group(1), clean_text(m.group(2))
    letters = re.findall(r"[A-E]", letters_raw.upper())
    for L in letters:
        if L in out and L != correct_key:
            out[L] = f"Incorrect because {reason}" if reason else DISTRACTOR
    # Trim the packed distractor clause from the correct explanation when split worked
    if letters:
        trimmed = re.sub(
            r"\s*Answers?\s+[A-E].*are incorrect because\s+.+$",
            "",
            correct_explanation,
            flags=re.I,
        ).strip()
        if trimmed:
            out[correct_key] = trimmed
    return out


def parse_questions(html: str, *, po_sid: int, fields: list[str], source_url: str, limit: int | None) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    blocks = soup.select(".block_content")
    print(f"Parser found {len(blocks)} .block_content nodes", flush=True)
    results: list[dict[str, Any]] = []
    skipped = {"no_q": 0, "opts": 0, "stem": 0, "answer": 0}

    for block in blocks:
        if limit is not None and len(results) >= limit:
            break
        q_sec = block.select_one(".block_section.question")
        if not q_sec:
            skipped["no_q"] += 1
            continue
        q_body = q_sec.select_one(".block_body") or q_sec
        a_sec = block.select_one(".block_section.answer")
        a_body = None
        if a_sec:
            a_body = a_sec.select_one(".block_body.answer_block, .answer_block, .block_body")

        option_texts = extract_options_from_ol(q_body)
        if len(option_texts) < 2:
            option_texts = extract_options_from_letters(q_body)
        if len(option_texts) < 2:
            skipped["opts"] += 1
            continue

        stem = extract_stem(q_body, option_texts)
        if not stem:
            skipped["stem"] += 1
            continue

        images = extract_images(q_body)
        letter, explanation, topic_url, chapter = parse_answer(a_body)
        correct = letter_index(letter, len(option_texts))
        if correct is None:
            skipped["answer"] += 1
            continue

        po_id = (q_sec.get("id") or "").replace("practicequestion", "")
        if not po_id:
            po_id = hashlib.sha1(stem.encode()).hexdigest()[:10]

        keys = [chr(ord("A") + i) for i in range(len(option_texts))]
        correct_key = keys[correct]
        expl_map = split_distractor_notes(explanation, keys, correct_key)
        # Ensure correct always has the main explanation text
        if expl_map[correct_key] in ("", NAN):
            expl_map[correct_key] = explanation or NAN
        # For remaining distractors still NaN, keep NaN in export but use placeholder in app JSON
        options = []
        for i, text in enumerate(option_texts):
            key = keys[i]
            is_correct = i == correct
            app_expl = expl_map[key]
            if app_expl == NAN:
                app_expl = DISTRACTOR if not is_correct else (explanation or "")
            options.append(
                {
                    "key": key,
                    "text": text,
                    "correct": is_correct,
                    "explanation": app_expl,
                }
            )

        # completeness: partial unless every distractor got a specific (non-generic) note
        specific = all(
            (o["explanation"] and o["explanation"] != DISTRACTOR)
            for o in options
            if not o["correct"]
        ) and bool(explanation)
        status = "complete" if specific else "partial"

        number_label = None
        heading = q_sec.select_one(".f12b")
        if heading:
            m = re.search(r"Question\s+(\d+)", clean_text(heading.get_text()), flags=re.I)
            if m:
                number_label = int(m.group(1))

        results.append(
            {
                "id": f"po-{po_id}",
                "number": number_label if number_label is not None else len(results) + 1,
                "source": "pathologyoutlines",
                "source_url": source_url,
                "po_subspecialty_id": po_sid,
                "po_chapter": chapter,
                "topic_url": topic_url,
                "fields": list(fields),
                "tags": [],
                "stem": stem,
                "image": images[0]["src"] if images else None,
                "options": options,
                "related_disease": None,
                "explanation_status": status,
                "images": images,
                "_expl_export": expl_map,
            }
        )

    print(f"Parsed {len(results)} questions; skipped={skipped}", flush=True)
    return results


def download_images(session: ChromeSession, questions: list[dict], slug: str, referer: str) -> None:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    for qi, q in enumerate(questions):
        imgs = q.get("images") or []
        if not imgs:
            continue
        local_imgs = []
        for ii, img in enumerate(imgs):
            src = img.get("src") or ""
            if not src:
                continue
            ext = Path(urlparse(src).path).suffix or ".jpg"
            if len(ext) > 5:
                ext = ".jpg"
            fname = f"{slug}-{q['id']}-{ii}{ext}"
            dest = IMAGE_DIR / fname
            rel = f"/assets/images/questionbank/{fname}"
            if dest.is_file() and dest.stat().st_size > 0:
                print(f"  [{qi + 1}] reuse {fname}", flush=True)
                local_imgs.append({**img, "src": rel, "source_url": src})
                continue
            print(f"  [{qi + 1}] download {src}", flush=True)
            if session.download(src, dest, referer=referer):
                local_imgs.append({**img, "src": rel, "source_url": src})
            else:
                # Keep hotlink; still record original URL
                local_imgs.append({**img, "source_url": src})
        q["images"] = local_imgs
        q["image"] = local_imgs[0]["src"] if local_imgs else None


def to_bank_json(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    bank = []
    for q in questions:
        item = {k: v for k, v in q.items() if not k.startswith("_")}
        # Drop helper-only fields not in app schema
        item.pop("number", None)
        item.pop("topic_url", None)
        # Keep topic on source via optional fields already present
        bank.append(item)
    return bank


def questions_to_dataframe(questions: list[dict[str, Any]], subspecialty_name: str) -> pd.DataFrame:
    rows = []
    for q in questions:
        opts = {o["key"]: o for o in q.get("options") or []}
        expl = q.get("_expl_export") or {}
        # Image links: prefer original PO URL (source_url) then src
        img_links: list[str] = []
        for im in q.get("images") or []:
            link = im.get("source_url") or im.get("src")
            if link and link not in img_links:
                img_links.append(link)
        if not img_links and q.get("image"):
            img_links.append(q["image"])

        def opt_text(letter: str) -> str:
            o = opts.get(letter)
            return o["text"] if o else NAN

        def opt_expl(letter: str) -> str:
            if letter in expl:
                return expl[letter] if expl[letter] not in ("", None) else NAN
            o = opts.get(letter)
            if not o:
                return NAN
            # For export, map generic distractor placeholder back to NaN
            e = o.get("explanation") or ""
            if e == DISTRACTOR:
                return NAN
            return e or NAN

        rows.append(
            {
                "number": q.get("number") if q.get("number") is not None else NAN,
                "subspecialty": subspecialty_name,
                "question_id": q.get("id") or NAN,
                "question_title": q.get("stem") or NAN,
                "alternative_A": opt_text("A"),
                "alternative_B": opt_text("B"),
                "alternative_C": opt_text("C"),
                "alternative_D": opt_text("D"),
                "alternative_E": opt_text("E"),
                "explanation_A": opt_expl("A"),
                "explanation_B": opt_expl("B"),
                "explanation_C": opt_expl("C"),
                "explanation_D": opt_expl("D"),
                "explanation_E": opt_expl("E"),
                "correct_answer": next((o["key"] for o in (q.get("options") or []) if o.get("correct")), NAN),
                "image_link": img_links[0] if img_links else NAN,
                "image_links_all": " | ".join(img_links) if img_links else NAN,
                "image_count": len(img_links),
                "po_chapter": q.get("po_chapter") or NAN,
                "topic_url": q.get("topic_url") or NAN,
                "source_url": q.get("source_url") or NAN,
                "explanation_status": q.get("explanation_status") or NAN,
            }
        )
    cols = [
        "number",
        "subspecialty",
        "question_id",
        "question_title",
        "alternative_A",
        "alternative_B",
        "alternative_C",
        "alternative_D",
        "alternative_E",
        "explanation_A",
        "explanation_B",
        "explanation_C",
        "explanation_D",
        "explanation_E",
        "correct_answer",
        "image_link",
        "image_links_all",
        "image_count",
        "po_chapter",
        "topic_url",
        "source_url",
        "explanation_status",
    ]
    return pd.DataFrame(rows, columns=cols)


def update_index(slug: str, filename: str) -> None:
    index_path = DEFAULT_OUT / "index.json"
    if index_path.is_file():
        index = json.loads(index_path.read_text())
    else:
        index = {"version": 1, "banks": {}}
    banks = index.get("banks") or {}
    if isinstance(banks, dict):
        banks[slug] = filename
    else:
        banks = {slug: filename}
    index["banks"] = banks
    index["updatedAt"] = datetime.now(timezone.utc).isoformat()
    index_path.write_text(json.dumps(index, indent=2) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sid", type=int, required=True)
    ap.add_argument("--chid", type=str, default=None)
    ap.add_argument("--html", type=str, default=None, help="Parse local HTML instead of fetching")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--delay", type=float, default=2.0)
    ap.add_argument("--jitter", type=float, default=1.5)
    ap.add_argument("--retries", type=int, default=8)
    ap.add_argument("--no-warmup", action="store_true")
    ap.add_argument("--download-images", action="store_true", help="Download images locally (slow, large)")
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    tax = load_taxonomy()
    meta = tax.get(args.sid) or {
        "slug": f"po-{args.sid}",
        "name": f"PO {args.sid}",
        "fields": [],
    }
    slug = meta["slug"]
    source_url = f"{INDEX_URL}?sid={args.sid}"
    out_json = Path(args.out) if args.out else DEFAULT_OUT / f"{slug}.json"

    chrome = args.chid or detect_chrome_version()
    print(f"Chrome identity: {chrome}", flush=True)
    session = ChromeSession(
        chrome_full=chrome,
        delay=args.delay,
        jitter=args.jitter,
        retries=args.retries,
    )

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    if args.html:
        html = Path(args.html).read_text(encoding="utf-8", errors="replace")
        print(f"Loaded local HTML ({len(html)} bytes)", flush=True)
    else:
        if not args.no_warmup:
            try:
                print("Warmup: homepage", flush=True)
                session.get(HOME_URL, referer="")
                print("Warmup: question bank index", flush=True)
                session.get(INDEX_URL, referer=HOME_URL)
            except Exception as exc:  # noqa: BLE001
                print(f"Warmup skipped after error: {exc}", flush=True)
        print(f"Fetching questions: {source_url}", flush=True)
        html = session.get(source_url, referer=INDEX_URL)
        LAST_HTML.write_text(html, encoding="utf-8")
        print(f"Saved raw HTML → {LAST_HTML} ({len(html)} bytes)", flush=True)

    questions = parse_questions(
        html,
        po_sid=args.sid,
        fields=meta["fields"],
        source_url=source_url,
        limit=args.limit,
    )
    if not questions:
        raise SystemExit("No questions parsed")

    if args.download_images:
        print("Downloading images (paced)…", flush=True)
        download_images(session, questions, slug, referer=source_url)

    # Ensure every question with images has an accessible link field
    for q in questions:
        for im in q.get("images") or []:
            if "source_url" not in im:
                # Hotlinked src is already the accessible URL
                if str(im.get("src", "")).startswith("http"):
                    im["source_url"] = im["src"]

    bank = to_bank_json(questions)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(bank, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if out_json.resolve().is_relative_to(DEFAULT_OUT.resolve()):
        update_index(slug, out_json.name)
    print(f"Wrote {len(bank)} questions → {out_json}", flush=True)

    df = questions_to_dataframe(questions, meta["name"])
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    csv_name = f"{slug}_questions.csv"
    xlsx_name = f"{slug}_questions.xlsx"
    csv_repo = DATA_DIR / csv_name
    xlsx_repo = DATA_DIR / xlsx_name
    df.to_csv(csv_repo, index=False)
    df.to_excel(xlsx_repo, index=False, sheet_name="questions")
    # Local / artifact copies
    df.to_csv(ARTIFACT_DIR / csv_name, index=False)
    df.to_excel(ARTIFACT_DIR / xlsx_name, index=False, sheet_name="questions")
    df.to_csv(TMP_DIR / csv_name, index=False)
    df.to_excel(TMP_DIR / xlsx_name, index=False, sheet_name="questions")

    with_img = int((df["image_link"] != NAN).sum())
    missing_img_link = df[(df["image_count"] > 0) & (df["image_link"] == NAN)]
    print(f"CSV/Excel: {csv_repo} / {xlsx_repo}", flush=True)
    print(f"Artifacts: {ARTIFACT_DIR / csv_name}", flush=True)
    print(f"Rows={len(df)} with_image_link={with_img} missing_required_links={len(missing_img_link)}", flush=True)
    print("Done.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
