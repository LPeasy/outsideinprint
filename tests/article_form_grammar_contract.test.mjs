import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

const articleSingle = read("layouts/_default/single.html");
const homepage = read("layouts/index.html");
const articlePlateLightbox = read("layouts/partials/article/plate-lightbox.html");
const variantKey = read("layouts/partials/article/variant-key.html");
const renderArticleBody = read("layouts/partials/render_article_body.html");
const css = read("assets/css/main.css");
const dialogueDir = path.resolve("content/essays/dialogues");
const dialogueFiles = [
  "all-ti.md",
  "broke-rich.md",
  "history-pushes-back.md",
  "peaches-or-greece.md",
  "smoke-and-brass.md",
  "the-free-lunch.md",
  "the-new-orthodoxy.md",
  "the-shape-of-sacrifice.md",
  "the-sound-of-authorit.md",
  "the-weight-of-promises.md",
  "willful-ignorance.md",
  "without-a-word.md",
];

test("article header follows the calm title-led form grammar", () => {
  const fleuron = articleSingle.indexOf('class="piece-fleuron"');
  const composition = articleSingle.indexOf('class="piece-header-composition"');
  const titleBlock = articleSingle.indexOf('class="piece-title-block"');
  const byline = articleSingle.indexOf('partial "authors/byline.html"', titleBlock);
  const subtitle = articleSingle.indexOf("with .Params.subtitle", byline);
  const mediaPlate = articleSingle.indexOf('<figure class="{{ delimit $plateClasses " " }}">', subtitle);
  const recordRail = articleSingle.indexOf('class="piece-record-rail"');
  const body = articleSingle.indexOf('class="piece-body"');
  const articleClose = articleSingle.indexOf("</article>", body);
  const lightboxInclude = articleSingle.indexOf('partial "article/plate-lightbox.html" .', articleClose);
  const conditionalPlateLightboxInclude = articleSingle.lastIndexOf("{{ if $plateImage }}", lightboxInclude);
  const conditionalPlateLightboxAfterArticle = articleSingle.indexOf("{{ if $plateImage }}", articleClose);

  assert.ok(fleuron >= 0);
  assert.ok(fleuron < composition);
  assert.ok(composition < titleBlock);
  assert.ok(titleBlock < byline);
  assert.ok(byline < subtitle);
  assert.ok(subtitle < mediaPlate);
  assert.ok(mediaPlate < recordRail);
  assert.ok(recordRail < body);
  assert.ok(articleClose < lightboxInclude);
  assert.ok(conditionalPlateLightboxInclude < articleClose);
  assert.equal(conditionalPlateLightboxAfterArticle, -1);
  assert.match(articleSingle, /imageConfig/);
  assert.match(articleSingle, /\$plateImageWidth = \.Width/);
  assert.match(articleSingle, /\$plateImageHeight = \.Height/);
  assert.match(articleSingle, /piece-header--side-plate/);
  assert.match(articleSingle, /piece-header--text-only/);
  assert.match(articleSingle, /data-article-plate-lightbox-trigger/);
  assert.match(articleSingle, /partial "article\/plate-lightbox\.html" \./);
  assert.doesNotMatch(articleSingle, /piece-media-plate--full/);
  assert.doesNotMatch(articleSingle, /piece-header--full-plate/);
  assert.doesNotMatch(articleSingle, /partial "archive\/lane-label\.html"/);
  assert.doesNotMatch(articleSingle, /piece-record-rail__item--collection-meta/);
  assert.doesNotMatch(articleSingle, /partial "running_header\.html"/);
  assert.doesNotMatch(articleSingle, /piece-series-marker/);
  assert.doesNotMatch(articleSingle, /piece-publication-strip/);
  assert.doesNotMatch(articleSingle, /piece-collection-strip/);
  assert.doesNotMatch(articleSingle, /From the Collection/);
  assert.doesNotMatch(articleSingle, /piece--collection-accent/);
  assert.doesNotMatch(articleSingle, /piece-collection-context/);
  assert.match(css, /\.piece-fleuron\{/);
  assert.match(css, /\.piece-header-composition\{/);
  assert.match(css, /\.piece-record-rail\{/);
  assert.match(css, /\.piece-media-plate\{/);
  assert.match(css, /\.piece-media-plate__trigger\{/);
  assert.match(css, /\.piece-hero\{/);
  assert.match(articlePlateLightbox, /data-article-plate-lightbox/);
  assert.match(articlePlateLightbox, /data-article-plate-lightbox-image-button/);
  assert.match(articlePlateLightbox, /document\.addEventListener\("click"/);
  assert.match(articlePlateLightbox, /closest\("\[data-article-plate-lightbox-trigger\]"\)/);
  assert.match(articlePlateLightbox, /bodyImageSelector = "\.piece-body img"/);
  assert.match(articlePlateLightbox, /article-lightbox-image/);
  assert.match(articlePlateLightbox, /trigger\.matches\(bodyImageSelector\)/);
  assert.match(articlePlateLightbox, /querySelectorAll\(bodyImageSelector\)/);
  assert.match(articlePlateLightbox, /parent\.closest\("a, button, \[role=\\"button\\"\], \[data-article-plate-lightbox-trigger\]"\)/);
  assert.match(articlePlateLightbox, /bodyImageSrc\(bodyImage\)/);
  assert.match(articlePlateLightbox, /bodyImage\.classList\.add\(bodyImageClass\)/);
  assert.match(articlePlateLightbox, /setAttribute\("role", "button"\)/);
  assert.match(articlePlateLightbox, /setAttribute\("tabindex", "0"\)/);
  assert.match(articlePlateLightbox, /setAttribute\("aria-label", "Open image fullscreen: " \+ imageTitle\)/);
  assert.match(articlePlateLightbox, /bodyImage\.currentSrc \|\| bodyImage\.src/);
  assert.match(articlePlateLightbox, /bodyImage\.naturalWidth > 0/);
  assert.match(articlePlateLightbox, /bodyImage\.naturalHeight > 0/);
  assert.match(articlePlateLightbox, /bodyImage\.closest\("\.piece-body figure"\)/);
  assert.match(articlePlateLightbox, /figure\.querySelector\("figcaption"\)/);
  assert.match(articlePlateLightbox, /figure\.querySelector\("\.article-source-caption"\)/);
  assert.match(articlePlateLightbox, /normalizeCaptionText\(captionText \|\| elementText\(sourceCaption\)\)/);
  assert.match(articlePlateLightbox, /captionText === normalizeCaptionText\(imageTitle\)/);
  assert.doesNotMatch(articlePlateLightbox, /captionText \|\| elementText\(sourceCaption\) \|\| imageTitle/);
  assert.match(articlePlateLightbox, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(articlePlateLightbox, /event\.key === "Spacebar"/);
  assert.match(articlePlateLightbox, /document\.body\.classList\.add\("cartoon-lightbox-open"\)/);
  assert.match(articlePlateLightbox, /imageButton\.addEventListener\("click", closeLightbox\)/);
  assert.match(css, /\.piece-body img\.article-lightbox-image\{/);
  assert.match(css, /\.piece-body img\.article-lightbox-image:focus-visible\{/);
});

test("modern bios use dossier headers with portrait fallback and shared prose", () => {
  for (const snippet of [
    'eq $articleVariant "modernbio"',
    ".Params.portrait_image",
    ".Params.portrait_image_alt",
    ".Params.portrait_image_caption",
    ".Params.featured_image",
    "piece-header--text-only",
    "piece-portrait-plate",
    "piece-record-line",
    "piece-primary-note",
    'partial "article/modernbio-record.html" .',
  ]) {
    assert.match(articleSingle, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(variantKey, /section_label/);
  assert.match(variantKey, /modern-bio/);
  assert.match(variantKey, /modern-bios/);
  assert.match(variantKey, /Params\.series/);
  assert.match(variantKey, /Params\.collections/);

  const modernBioGate = articleSingle.indexOf('if eq $articleVariant "modernbio"');
  const portraitParam = articleSingle.indexOf(".Params.portrait_image", modernBioGate);
  const featuredFallback = articleSingle.indexOf(".Params.featured_image", portraitParam);
  const featuredMarksPortrait = articleSingle.indexOf('{{ $plateKind = "portrait" }}', featuredFallback);
  const portraitPlate = articleSingle.indexOf("piece-portrait-plate", featuredMarksPortrait);
  const textOnlyClass = articleSingle.indexOf("piece-header--text-only");
  assert.ok(portraitParam > modernBioGate);
  assert.ok(featuredFallback > portraitParam);
  assert.ok(featuredMarksPortrait > featuredFallback);
  assert.ok(portraitPlate > featuredMarksPortrait);
  assert.ok(textOnlyClass >= 0);

  assert.match(css, /\.article-variant-modernbio \.piece-title-block h1\{/);
  assert.match(css, /\.piece-header--side-plate \.piece-header-composition\{/);
  assert.doesNotMatch(css, /\.piece-header--full-plate/);
  assert.match(css, /\.piece-portrait-plate\{/);
  assert.doesNotMatch(css, /\.article-variant-modernbio \.piece-body/);
});

test("dialogue variant derives from library_type and transforms speaker labels only in dialogues", () => {
  assert.match(variantKey, /library_type/);
  assert.match(variantKey, /eq \$libraryType "dialogue"/);
  assert.match(variantKey, /\$variant = "dialogue"/);
  assert.match(articleSingle, /article-variant-%s/);

  const dialogueGate = renderArticleBody.indexOf('if eq (partial "article/variant-key.html" .) "dialogue"');
  const transform = renderArticleBody.indexOf('class="dialogue-turn"', dialogueGate);
  assert.ok(dialogueGate >= 0);
  assert.ok(transform > dialogueGate);
  assert.equal(renderArticleBody.indexOf('class="dialogue-turn"'), transform);
  assert.match(renderArticleBody, /\[\^:<>"\\n\]\[\^:<>"\\n\]\{0,36\}\?/);
  assert.match(renderArticleBody, /data-speaker="\$1"/);
  assert.match(renderArticleBody, /dialogue-turn--syd/);
  assert.match(renderArticleBody, /dialogue-turn--oliver/);
  assert.match(renderArticleBody, /dialogue-turn--tony/);

  assert.match(css, /\.article-variant-dialogue \.piece-body\{/);
  assert.match(css, /\.article-variant-dialogue \.piece-body > p:not\(\.dialogue-turn\)\{/);
  assert.match(css, /\.dialogue-turn\{/);
  assert.match(css, /\.dialogue-turn__speaker\{/);
  assert.match(css, /\.dialogue-turn__text\{/);
  assert.doesNotMatch(css, /chat-bubble|message-bubble|left-right|dialogue-bubble/);
});

test("article aftermatter is one publication record plus compact exits", () => {
  assert.doesNotMatch(articleSingle, /partial "newsletter_signup\.html"/);
  assert.doesNotMatch(articleSingle, /partial "authors\/card\.html"/);
  assert.match(homepage, /partial "newsletter_signup\.html"/);

  const byline = articleSingle.indexOf('partial "authors/byline.html"');
  const aftermatter = articleSingle.indexOf('class="piece-aftermatter"');
  const publicationRecord = articleSingle.indexOf('class="article-publication-record"', aftermatter);
  const citation = articleSingle.indexOf("article-publication-record__section--citation", publicationRecord);
  const revisions = articleSingle.indexOf("article-publication-record__section--revisions", publicationRecord);
  const continuation = articleSingle.indexOf('partial "collections/reading-path.html" .', publicationRecord);
  const exitLinks = articleSingle.indexOf('"class" "journey-links--article-exit"', continuation);
  assert.ok(byline >= 0);
  assert.ok(byline < aftermatter);
  assert.ok(publicationRecord > aftermatter);
  assert.ok(citation > publicationRecord);
  assert.ok(revisions > citation);
  assert.ok(continuation > publicationRecord);
  assert.ok(exitLinks > continuation);

  assert.match(articleSingle, /class="article-publication-record"/);
  assert.match(articleSingle, /\{\{ if or \(ne \.Params\.show_citation false\) \.Params\.revision_history \}\}/);
  assert.match(articleSingle, /\{\{ if ne \.Params\.show_citation false \}\}/);
  assert.match(articleSingle, /article-publication-record__section--citation/);
  assert.match(articleSingle, /<code>[\s\S]*Outside In Print[\s\S]*\.Permalink[\s\S]*<\/code>/);
  assert.match(articleSingle, /\{\{ with \.Params\.revision_history \}\}/);
  assert.match(articleSingle, /article-publication-record__section--revisions/);
  assert.match(articleSingle, /"class" "journey-links--article-exit"/);
  assert.match(css, /\.article-publication-record\{/);
  assert.match(css, /\.journey-links--article-exit\{/);

  const archive = articleSingle.indexOf('"label" "Archive"');
  const collections = articleSingle.indexOf('"label" "Collections"', archive);
  const library = articleSingle.indexOf('"label" "Library"', collections);
  const newsletter = articleSingle.indexOf('"label" "Newsletter"', library);
  assert.ok(archive >= 0);
  assert.ok(collections > archive);
  assert.ok(library > collections);
  assert.ok(newsletter > library);
  assert.equal(articleSingle.match(/"label" "Newsletter"/g)?.length, 1);
});

test("all dialogue markdown files retain dialogue metadata and speaker-label turns", () => {
  assert.equal(dialogueFiles.length, 12);

  for (const file of dialogueFiles) {
    const source = fs.readFileSync(path.join(dialogueDir, file), "utf8");
    const lines = source.split(/\r?\n/);
    const closingDelimiter = lines.findIndex((line, index) => index > 0 && line === "---");
    assert.equal(lines[0], "---", `${file} needs an opening front matter delimiter`);
    assert.ok(closingDelimiter > 0, `${file} needs a closing front matter delimiter`);

    const frontMatter = lines.slice(1, closingDelimiter).join("\n");
    const body = lines.slice(closingDelimiter + 1).join("\n");
    assert.match(frontMatter, /^library_type:\s*['"]dialogue['"]/m);
    assert.match(body, /^\*\*[A-Za-z][A-Za-z .'-]{0,36}:\*\* /m, `${file} needs at least one speaker-label turn`);
  }
});
