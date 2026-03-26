#!/usr/bin/env python3
"""Safe structural cleanup for legacy Medium-style essay imports.

This utility intentionally stays conservative. It removes common wrapper HTML,
converts obvious Medium card remnants into plain markdown links, repairs common
mojibake, strips duplicated lead metadata, and normalizes a narrow set of
image-caption patterns that the Hugo article body partial already understands.
It does not attempt substantive editorial rewrites.
"""

from __future__ import annotations

import argparse
import html
import re
from datetime import date
from pathlib import Path
from typing import Iterable

MOJIBAKE_MAP = {
    "\u00e2\u20ac\u2122": "\u2019",
    "\u00e2\u20ac\u0153": "\u201c",
    "\u00e2\u20ac\u009d": "\u201d",
    "\u00e2\u20ac\u201d": "\u2014",
    "\u00e2\u20ac\u201c": "\u2013",
    "\u00e2\u20ac\u00a6": "\u2026",
    "\u00e2\u2020\u2019": "\u2192",
    "\u00e2\u2030\u02c6": "\u2248",
    "\u00e2\u02c6\u2019": "\u2212",
    "\u00e2\u20ac\u0161": " ",
    "\u00c2\u00a0": " ",
    "\u00c2\u00b9": "1",
    "\u00c2\u00b2": "2",
    "\u00c2\u00b3": "3",
    "\u00c2": "",
}

A_RE = re.compile(r'<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.I | re.S)
SPAN_RE = re.compile(r'<span[^>]*>(.*?)</span>', re.I | re.S)
FIGURE_RE = re.compile(
    r'<figure[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*?/?>\s*(?:<figcaption>(.*?)</figcaption>\s*)?</figure>',
    re.I | re.S,
)
MIXTAPE_RE = re.compile(r'<div[^>]*mixtapeEmbed[^>]*>(.*?)</div>', re.I | re.S)
EMBEDDED_MEDIA_RE = re.compile(
    r'(?im)^\s*\[Embedded media:\s*(?:\[(?P<label>[^\]]+)\]\((?P<link>https?://[^)]+)\)|(?P<url>https?://[^\]\s]+))\s*\]\s*$'
)
IMAGE_LINE_RE = re.compile(
    r'^\s*!\[(?P<alt>[^\]]*)\]\((?P<src>\S+?)(?:\s+"(?P<title>[^"]*)")?\)\s*$'
)
DIV_RE = re.compile(r'^\s*</?div\b[^>]*>\s*$', re.I | re.M)
HR_RE = re.compile(r'^\s*-{20,}\s*$', re.M)
COMMENT_RE = re.compile(r'^\s*<!-- raw HTML omitted -->\s*$', re.M)
TAG_RE = re.compile(r'</?(?:strong|em|p|br|blockquote)\b[^>]*>', re.I)


def split_front_matter(text: str) -> tuple[str, str, str]:
    if not text.startswith('---\n') and not text.startswith('---\r\n'):
        return '', '', text
    parts = re.split(r'^---\s*$', text, maxsplit=2, flags=re.M)
    if len(parts) < 3:
        return '', '', text
    return '---', parts[1].strip('\r\n'), parts[2].lstrip('\r\n')


def apply_mojibake_map(text: str) -> str:
    for bad, good in MOJIBAKE_MAP.items():
        text = text.replace(bad, good)
    return text


def extract_front_matter_value(front_matter: str, key: str) -> str:
    match = re.search(rf'(?m)^{re.escape(key)}:\s*"?(.*?)"?\s*$', front_matter)
    return match.group(1).strip() if match else ''


def strip_tags(text: str) -> str:
    text = TAG_RE.sub('', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def strip_markdown_links(text: str) -> str:
    return re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)


def strip_outer_emphasis(text: str) -> str:
    stripped = text.strip()
    while len(stripped) >= 2 and (
        (stripped.startswith('*') and stripped.endswith('*'))
        or (stripped.startswith('_') and stripped.endswith('_'))
    ):
        candidate = stripped[1:-1].strip()
        if not candidate or candidate == stripped:
            break
        stripped = candidate
    return stripped


def normalize_plain_text(text: str) -> str:
    clean = convert_inline_markup(text)
    clean = strip_markdown_links(clean)
    clean = html.unescape(clean)
    clean = re.sub(r'\s+', ' ', clean)
    return strip_outer_emphasis(clean).strip()


def normalize_lead_token(text: str) -> str:
    plain = normalize_plain_text(text).lower()
    return re.sub(r'[^a-z0-9]+', '', plain)


def build_date_variants(date_value: str) -> set[str]:
    try:
        parsed = date.fromisoformat(date_value.strip())
    except ValueError:
        return set()

    def ordinal(day: int) -> str:
        if 10 <= day % 100 <= 20:
            suffix = 'th'
        else:
            suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(day % 10, 'th')
        return f'{day}{suffix}'

    month_full = parsed.strftime('%B')
    month_abbr = parsed.strftime('%b')
    abbr_variants = {month_abbr, f'{month_abbr}.'}
    if month_abbr == 'Sep':
        abbr_variants.update({'Sept', 'Sept.'})

    variants = {
        f'{month_full} {parsed.day}, {parsed.year}',
        f'{month_full} {ordinal(parsed.day)}, {parsed.year}',
    }
    for month in abbr_variants:
        variants.add(f'{month} {parsed.day}, {parsed.year}')
        variants.add(f'{month} {ordinal(parsed.day)}, {parsed.year}')
    return {normalize_lead_token(value) for value in variants}


def convert_anchor(match: re.Match[str]) -> str:
    url = match.group(1).strip()
    label = strip_tags(convert_anchors(match.group(2)))
    if not label:
        return url
    return f'[{label}]({url})'


def convert_anchors(text: str) -> str:
    while True:
        new_text = A_RE.sub(convert_anchor, text)
        if new_text == text:
            return text
        text = new_text


def convert_inline_markup(text: str) -> str:
    text = SPAN_RE.sub(lambda m: m.group(1), text)
    text = re.sub(r'<strong>(.*?)</strong>', r'**\1**', text, flags=re.I | re.S)
    text = re.sub(r'<em>(.*?)</em>', r'*\1*', text, flags=re.I | re.S)
    text = convert_anchors(text)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'</?p\b[^>]*>', '', text, flags=re.I)
    return text


def convert_mixtape(match: re.Match[str]) -> str:
    raw_block = match.group(1)
    url_match = re.search(r'href="([^"]+)"', raw_block)
    title_match = re.search(r'<strong>(.*?)</strong>', raw_block, re.I | re.S)
    url = url_match.group(1).strip() if url_match else ''
    title = strip_tags(title_match.group(1)) if title_match else ''
    if not url or not title:
        block = convert_inline_markup(raw_block)
        links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', block)
        if not links:
            return ''
        title, url = links[0]
        title = re.sub(r'\s+', ' ', strip_tags(title)).strip()
    return f'- [{title}]({url})\n'


def build_caption_block(caption: str) -> str:
    caption_md = convert_inline_markup(caption).strip()
    caption_md = re.sub(r'\s+', ' ', caption_md)
    caption_md = strip_outer_emphasis(caption_md)
    caption_plain = normalize_plain_text(caption_md)
    if not caption_plain:
        return ''
    if re.match(r'(?i)^photo by\b', caption_plain):
        return caption_plain
    if re.match(r'(?i)^(source:|courtesy of |image courtesy of |image source:)', caption_plain):
        return caption_md
    if '|' in caption_plain:
        return f'> {caption_md}'
    return f'*{caption_md}*'


def convert_figure(match: re.Match[str]) -> str:
    src = match.group(1).strip()
    caption_html = match.group(2) or ''
    caption = build_caption_block(caption_html)
    if caption:
        return f'![]({src})\n\n{caption}\n'
    return f'![]({src})\n'


def remove_duplicate_headings(body: str, title: str, subtitle: str) -> str:
    if title:
        title_re = re.escape(title)
        if subtitle:
            subtitle_re = re.escape(subtitle)
            body = re.sub(
                rf'^\s*###\s+{title_re}\s*\n\s*####\s+{subtitle_re}\s*\n+',
                '',
                body,
                count=1,
                flags=re.M,
            )
        body = re.sub(rf'^\s*###\s+{title_re}\s*\n+', '', body, count=1, flags=re.M)
    if subtitle:
        subtitle_re = re.escape(subtitle)
        body = re.sub(rf'^\s*{subtitle_re}\s*\n+', '', body, count=1, flags=re.M)
        body = re.sub(rf'^\s*####\s+{subtitle_re}\s*\n+', '', body, count=1, flags=re.M)
    return body


def remove_leading_metadata_lines(body: str, title: str, subtitle: str, date_value: str) -> str:
    lines = body.splitlines()
    title_token = normalize_lead_token(title) if title else ''
    subtitle_token = normalize_lead_token(subtitle) if subtitle else ''
    date_tokens = build_date_variants(date_value)

    while True:
        first_index = next((index for index, line in enumerate(lines) if line.strip()), None)
        if first_index is None:
            break
        token = normalize_lead_token(lines[first_index])
        if token and (token == title_token or token == subtitle_token or token in date_tokens):
            del lines[first_index]
            continue
        break

    return '\n'.join(lines)




def simplify_medium_card_bullets(text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        label = match.group(1)
        url = match.group(2)
        clean = strip_tags(label.replace('**', '').replace('*', ''))
        clean = re.sub(r'\s*(?:medium\.com|www\.[^\s]+)\s*$', '', clean)
        clean = re.sub(r'\s+', ' ', clean).strip(' -')
        return f'- [{clean}]({url})'

    return re.sub(r'(?m)^- \[(.*?)\]\((https?://[^)]+)\)$', repl, text)


def normalize_embedded_media_lines(text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        label = (match.group('label') or 'Embedded media').strip()
        url = (match.group('link') or match.group('url') or '').strip()
        if not url:
            return match.group(0)
        if label.startswith('http://') or label.startswith('https://'):
            label = 'Embedded media'
        return f'- [{label}]({url})'

    return EMBEDDED_MEDIA_RE.sub(repl, text)


def normalize_caption_line(line: str) -> str | None:
    stripped = line.strip()
    if not stripped:
        return None
    if stripped.startswith('> ') or stripped.startswith('Source:'):
        return None
    if re.match(r'(?i)^photo by .+ on unsplash$', stripped):
        return None

    unwrapped = strip_outer_emphasis(stripped)
    plain = normalize_plain_text(unwrapped)

    if not plain:
        return None

    if re.match(r'(?i)^photo by .+ on (unsplash|pexels)$', plain):
        return plain
    if re.match(r'(?i)^(source:|courtesy of |image courtesy of |image source:)', plain):
        return unwrapped
    if ('|' in plain) and (stripped != f'> {unwrapped}'):
        return f'> {unwrapped}'
    return None


def normalize_image_caption_blocks(text: str) -> str:
    lines = text.splitlines()
    out: list[str] = []
    i = 0

    while i < len(lines):
        out.append(lines[i])
        image_match = IMAGE_LINE_RE.match(lines[i].strip())
        if not image_match or image_match.group('title'):
            i += 1
            continue

        j = i + 1
        blank_lines: list[str] = []
        while j < len(lines) and not lines[j].strip():
            blank_lines.append(lines[j])
            j += 1

        if j >= len(lines):
            out.extend(blank_lines)
            break

        normalized_caption = normalize_caption_line(lines[j])
        if normalized_caption is None:
            out.extend(blank_lines)
            i += 1
            continue

        if blank_lines:
            out.append('')
        out.append(normalized_caption)
        i = j + 1

    return '\n'.join(out)


def normalize_body(body: str, title: str, subtitle: str, date_value: str) -> str:
    body = apply_mojibake_map(body)
    body = remove_duplicate_headings(body, title, subtitle)
    body = remove_leading_metadata_lines(body, title, subtitle, date_value)
    body = MIXTAPE_RE.sub(convert_mixtape, body)
    body = FIGURE_RE.sub(convert_figure, body)
    body = convert_inline_markup(body)
    body = normalize_embedded_media_lines(body)
    body = normalize_image_caption_blocks(body)
    body = simplify_medium_card_bullets(body)
    body = COMMENT_RE.sub('', body)
    body = DIV_RE.sub('', body)
    body = HR_RE.sub('', body)
    body = body.replace('\r\n', '\n')
    body = re.sub(r'\n{3,}', '\n\n', body)
    body = re.sub(r'[ \t]+\n', '\n', body)
    return body.strip() + '\n'


def normalize_file(path: Path, write: bool) -> bool:
    original = path.read_text(encoding='utf-8-sig')
    text = apply_mojibake_map(original)
    marker, front_matter, body = split_front_matter(text)
    title = extract_front_matter_value(front_matter, 'title')
    subtitle = extract_front_matter_value(front_matter, 'subtitle')
    date_value = extract_front_matter_value(front_matter, 'date')
    normalized_body = normalize_body(body, title, subtitle, date_value)
    normalized = f'---\n{front_matter}\n---\n\n{normalized_body}' if marker else normalized_body
    changed = normalized != original
    if changed and write:
        path.write_text(normalized, encoding='utf-8', newline='\n')
    return changed


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Normalize legacy Medium-style essay scaffolding.')
    parser.add_argument('paths', nargs='+', help='Markdown files to normalize.')
    parser.add_argument('--write', action='store_true', help='Write normalized content back to disk.')
    args = parser.parse_args(argv)

    changed = 0
    for raw_path in args.paths:
        path = Path(raw_path)
        file_changed = normalize_file(path, write=args.write)
        status = 'changed' if file_changed else 'clean'
        print(f'{status}: {path.as_posix()}')
        if file_changed:
            changed += 1
    print(f'processed={len(args.paths)} changed={changed} write={args.write}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
