#!/usr/bin/env python3
"""Safe structural cleanup for legacy Medium-style essay imports.

This utility intentionally stays conservative. It removes common wrapper HTML,
converts obvious Medium card remnants into plain markdown links, repairs common
mojibake, and strips duplicated title/subtitle blocks that were imported into
body content. It does not attempt substantive editorial rewrites.
"""

from __future__ import annotations

import argparse
import re
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


def convert_figure(match: re.Match[str]) -> str:
    src = match.group(1).strip()
    caption_html = match.group(2) or ''
    caption = strip_tags(convert_inline_markup(caption_html))
    if caption:
        return f'![]({src})\n\n*{caption}*\n'
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




def simplify_medium_card_bullets(text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        label = match.group(1)
        url = match.group(2)
        clean = strip_tags(label.replace('**', '').replace('*', ''))
        clean = re.sub(r'\s*(?:medium\.com|www\.[^\s]+)\s*$', '', clean)
        clean = re.sub(r'\s+', ' ', clean).strip(' -')
        return f'- [{clean}]({url})'

    return re.sub(r'(?m)^- \[(.*?)\]\((https?://[^)]+)\)$', repl, text)


def normalize_body(body: str, title: str, subtitle: str) -> str:
    body = apply_mojibake_map(body)
    body = remove_duplicate_headings(body, title, subtitle)
    body = MIXTAPE_RE.sub(convert_mixtape, body)
    body = FIGURE_RE.sub(convert_figure, body)
    body = convert_inline_markup(body)
    body = simplify_medium_card_bullets(body)
    body = COMMENT_RE.sub('', body)
    body = DIV_RE.sub('', body)
    body = HR_RE.sub('', body)
    body = body.replace('\r\n', '\n')
    body = re.sub(r'\n{3,}', '\n\n', body)
    body = re.sub(r'[ \t]+\n', '\n', body)
    return body.strip() + '\n'


def normalize_file(path: Path, write: bool) -> bool:
    original = path.read_text(encoding='utf-8')
    text = apply_mojibake_map(original)
    marker, front_matter, body = split_front_matter(text)
    title = extract_front_matter_value(front_matter, 'title')
    subtitle = extract_front_matter_value(front_matter, 'subtitle')
    normalized_body = normalize_body(body, title, subtitle)
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
