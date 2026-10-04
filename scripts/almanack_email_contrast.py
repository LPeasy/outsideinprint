"""Pair the generated Almanack's paper and ink without depending on its body.

Buttondown Classic removes the supplied body attributes and adds important
dark-mode quote/link rules. Keep the approved parchment palette on retained
elements in both color schemes. This is not a guarantee against an email
client's non-CSS color inversion; a received-client review is still required.
Only generated email HTML passes through this helper, never a provider wrapper.
"""

import re
from html import escape
from html.parser import HTMLParser

CONTRAST_CONTRACT = "parchment-paired-v1"
PAPER = "#f4eddf"
INK = "#332a22"
SECONDARY = "#554d42"
LINK = "#346782"

# Explicitly enumerate our live content. Images, SVG, document metadata and
# provider legal/footer markup are not targets of a global stylesheet.
PAIRED_TAGS = frozenset("""body table tr td th header section article footer div
    blockquote p h1 h2 h3 h4 h5 h6 ul ol li dl dt dd strong b em i cite span
    small figcaption a pre code""".split())
VOID_TAGS = frozenset("area base br col embed hr img input link meta param source track wbr".split())
COLOR_PROPERTIES = frozenset(("color", "background", "background-color"))


def _set_attribute(raw, name, value):
    """Replace just one attribute, preserving every other source byte."""
    pattern = re.compile(r'\s+([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+))?')
    attribute = f'{name}="{escape(value, quote=True)}"'
    for match in pattern.finditer(raw):
        if match[1].lower() == name:
            return raw[:match.start()] + " " + attribute + raw[match.end():]
    end = raw.rfind("/>") if raw.endswith("/>") else raw.rfind(">")
    return raw[:end] + " " + attribute + raw[end:]


class _PairedEmail(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.offsets = [0]
        self.offsets.extend(match.end() for match in re.finditer("\n", source))
        self.stack = []
        self.body_count = 0
        self.edits = []
        self.feed(source)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "body":
            self.body_count += 1
        inside = tag == "body" or "body" in self.stack
        if inside and tag in PAIRED_TAGS:
            raw = self.get_starttag_text()
            style = attrs.get("style", "")
            linked = tag == "a" or "a" in self.stack
            secondary = (tag in ("small", "cite") or "footer" in self.stack
                         or bool(re.search(r"font-size\s*:\s*14px", style, re.I)))
            ink = LINK if linked else SECONDARY if secondary else INK
            keep = []
            for declaration in style.split(";"):
                declaration = declaration.strip()
                prop = declaration.split(":", 1)[0].strip().lower()
                if declaration and prop not in COLOR_PROPERTIES and not (
                        linked and prop in ("text-decoration", "text-decoration-line")):
                    keep.append(declaration)
            # Inline important declarations beat the observed provider quote
            # rules; direct child colors also survive a lost parent color.
            keep += [f"color:{ink}!important", f"background-color:{PAPER}!important"]
            if linked:
                keep.append("text-decoration:underline!important")
            updated = _set_attribute(raw, "style", ";".join(keep) + ";")
            if tag in ("body", "table", "td", "th"):
                updated = _set_attribute(updated, "bgcolor", PAPER)
            if tag == "table":
                updated = _set_attribute(updated, "data-oip-contrast", CONTRAST_CONTRACT)
            line, column = self.getpos()
            start = self.offsets[line - 1] + column
            self.edits.append((start, start + len(raw), updated))
        if tag not in VOID_TAGS:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            index = len(self.stack) - 1 - self.stack[::-1].index(tag)
            del self.stack[index:]

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)


def apply_contrast(source):
    """Return byte-preserved content with bounded changes to element styling."""
    parsed = _PairedEmail(source)
    if parsed.body_count != 1 or not parsed.edits:
        raise ValueError("Contrast protection requires one generated email body.")
    for start, end, replacement in reversed(parsed.edits):
        source = source[:start] + replacement + source[end:]
    return source
