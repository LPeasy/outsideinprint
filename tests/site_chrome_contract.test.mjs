import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readCurrentCartoonSlug(source) {
  const currentMatch = source.match(/^current:\s*(.+)$/m);
  assert.ok(currentMatch, "expected editorial cartoons data to define a current slug");
  return currentMatch[1].trim();
}

function classTokensForElement(source, elementPattern, label) {
  const elementMatch = source.match(elementPattern);
  assert.ok(elementMatch, `expected ${label} element`);
  const classMatch = elementMatch[0].match(/\bclass="([^"]+)"/);
  assert.ok(classMatch, `expected ${label} element to have a class attribute`);
  return new Set(classMatch[1].trim().split(/\s+/));
}

function cssRule(source, selector) {
  const ruleMatch = source.match(new RegExp(`(?:^|\\n)${escapeRegex(selector)}\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(ruleMatch, `expected CSS rule for ${selector}`);
  return ruleMatch[0];
}

function frontMatter(source, label) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  assert.ok(match, `expected YAML front matter in ${label}`);
  return match[1];
}

function markdownFilesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return markdownFilesUnder(entryPath);
    }
    return entry.isFile() && path.extname(entry.name).toLowerCase() === ".md" ? [entryPath] : [];
  });
}

function studioSampleValues(source, label) {
  const sourceFrontMatter = frontMatter(source, label);
  const objectMatch = sourceFrontMatter.match(/^studio_sample:\s*\r?\n((?: {2}[^\r\n]+(?:\r?\n|$))+)/m);
  assert.ok(objectMatch, `expected ${label} to define a studio_sample object`);
  const entries = [...objectMatch[1].matchAll(/^ {2}([a-z_]+):\s*(?:"([^"]*)"|'([^']*)'|([^\r\n]+))\s*$/gm)]
    .map((match) => [match[1], match[2] ?? match[3] ?? match[4].trim()]);
  assert.deepEqual(entries.map(([key]) => key), ["input", "work", "proof"], `${label} studio_sample must contain only input, work, and proof in order`);
  return Object.fromEntries(entries);
}

const masthead = fs.readFileSync(path.resolve("layouts/partials/masthead.html"), "utf8");
const mastheadNavLink = fs.readFileSync(path.resolve("layouts/partials/masthead_nav_link.html"), "utf8");
const mastheadNavigationScript = fs.readFileSync(path.resolve("layouts/partials/masthead_navigation_script.html"), "utf8");
const homepage = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
const articleSingle = fs.readFileSync(path.resolve("layouts/_default/single.html"), "utf8");
const studioSampleExit = fs.readFileSync(path.resolve("layouts/partials/article/studio-sample-exit.html"), "utf8");
const newsletterSignup = fs.readFileSync(path.resolve("layouts/partials/newsletter_signup.html"), "utf8");
const newsletterPrompt = fs.readFileSync(path.resolve("layouts/partials/newsletter_prompt.html"), "utf8");
const hugoConfig = fs.readFileSync(path.resolve("hugo.toml"), "utf8");
const privacyPolicy = fs.readFileSync(path.resolve("content/privacy/index.md"), "utf8");
const studioTerms = fs.readFileSync(path.resolve("content/terms/index.md"), "utf8");
const contactContent = fs.readFileSync(path.resolve("content/contact/index.md"), "utf8");
const shopContent = fs.readFileSync(path.resolve("content/shop/_index.md"), "utf8");
const baseLayout = fs.readFileSync(path.resolve("layouts/_default/baseof.html"), "utf8");
const notFound = fs.readFileSync(path.resolve("layouts/404.html"), "utf8");
const themeBootstrap = fs.readFileSync(path.resolve("layouts/partials/theme_bootstrap.html"), "utf8");
const themeToggleScript = fs.readFileSync(path.resolve("layouts/partials/theme_toggle_script.html"), "utf8");
const homeFrontPage = fs.readFileSync(path.resolve("layouts/partials/home_front_page.html"), "utf8");
const homeV2FrontPage = fs.readFileSync(path.resolve("layouts/partials/home_v2_front_page.html"), "utf8");
const homeReaderBanner = fs.readFileSync(path.resolve("layouts/partials/home_reader_banner.html"), "utf8");
const homeReaderNewsletter = fs.readFileSync(path.resolve("layouts/partials/home_reader_newsletter.html"), "utf8");
const homeStudioOffer = fs.readFileSync(path.resolve("layouts/partials/home_studio_offer.html"), "utf8");
const studioData = fs.readFileSync(path.resolve("data/studio.yaml"), "utf8");
const studioTemplate = fs.readFileSync(path.resolve("layouts/studio/single.html"), "utf8");
const studioScript = fs.readFileSync(path.resolve("assets/js/studio-inquiry.js"), "utf8");
const jackStrattonEssay = fs.readFileSync(
  path.resolve("content/essays/jack-stratton-and-the-vulfpeck-model.md"),
  "utf8"
);
const campMysticEssay = fs.readFileSync(
  path.resolve("content/essays/what-happened-at-camp-mystic.md"),
  "utf8"
);
const peachesOrGreeceDialogue = fs.readFileSync(
  path.resolve("content/essays/dialogues/peaches-or-greece.md"),
  "utf8"
);
const directOffers = fs.readFileSync(path.resolve("layouts/partials/shop/direct-offers.html"), "utf8");
const kindleButton = fs.readFileSync(path.resolve("layouts/partials/shop/kindle-button.html"), "utf8");
const shopList = fs.readFileSync(path.resolve("layouts/shop/list.html"), "utf8");
const shopSingle = fs.readFileSync(path.resolve("layouts/shop/single.html"), "utf8");
const epubCheckoutScript = fs.readFileSync(path.resolve("assets/js/epub-checkout.js"), "utf8");
const bookstoreData = fs.readFileSync(path.resolve("data/bookstore.yaml"), "utf8");
const analyticsScript = fs.readFileSync(path.resolve("assets/js/analytics.js"), "utf8");
const analyticsDoc = fs.readFileSync(path.resolve("docs/analytics-system.md"), "utf8");
const footer = fs.readFileSync(path.resolve("layouts/partials/footer.html"), "utf8");
const randomTemplate = fs.readFileSync(path.resolve("layouts/random/single.html"), "utf8");
const galleryTemplate = fs.readFileSync(path.resolve("layouts/gallery/list.html"), "utf8");
const galleryContent = fs.readFileSync(path.resolve("content/gallery/_index.md"), "utf8");
const almanackIndex = fs.readFileSync(path.resolve("content/almanack/_index.md"), "utf8");
const almanackIndexTemplate = fs.readFileSync(path.resolve("layouts/almanack/list.html"), "utf8");
const almanackIssue = fs.readFileSync(path.resolve("layouts/almanack/single.html"), "utf8");
const almanackCollection = fs.readFileSync(path.resolve("layouts/collections/bobs-almanack.html"), "utf8");
const collectionsData = fs.readFileSync(path.resolve("data/collections.yaml"), "utf8");
const civicCollectionContent = fs.readFileSync(path.resolve("content/collections/civic-institutions-and-public-power.md"), "utf8");
const supportTerms = fs.readFileSync(path.resolve("content/support/cancellation-refunds.md"), "utf8");
const cartoonData = fs.readFileSync(path.resolve("data/editorial_cartoons.yaml"), "utf8");
const cartoonLookupPartial = fs.readFileSync(path.resolve("layouts/partials/editorial/cartoon-for-page.html"), "utf8");
const cartoonLinkPartial = fs.readFileSync(path.resolve("layouts/partials/editorial/cartoon-gallery-link.html"), "utf8");
const cartoonThumbnailLightbox = fs.readFileSync(path.resolve("layouts/partials/editorial/cartoon-thumbnail-lightbox.html"), "utf8");
const pageListItem = fs.readFileSync(path.resolve("layouts/partials/discovery/page-list-item.html"), "utf8");
const currentCartoonSlug = readCurrentCartoonSlug(cartoonData);
const dialoguesSection = fs.readFileSync(path.resolve("content/syd-and-oliver/_index.md"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");
const styleThemeWorkflow = fs.readFileSync(path.resolve("docs/style-theme-workflow.md"), "utf8");
const readerNoteCopy = "However you found this site—through a search, a shared link, or a single essay—you are welcome here. Outside In Print is for readers tired of being hurried from clip to clip and headline to headline. Step outside the feed, stay with an idea, ask for the evidence, and make up your own mind. Read whatever catches your eye. Follow a question farther than the algorithm would. Come back when you want something worth your attention.";

test("masthead defines the grouped desktop and mobile navigation from one destination model", () => {
  assert.doesNotMatch(masthead, />Welcome</);
  assert.doesNotMatch(masthead, />Essays</);
  assert.doesNotMatch(masthead, />Dialogues</);
  assert.doesNotMatch(masthead, />Shop</);
  assert.doesNotMatch(masthead, />Books</);
  assert.doesNotMatch(masthead, /href="\{\{ "start-here\/" \| absURL \}\}"/);
  assert.doesNotMatch(masthead, /\$isWelcome/);

  for (const [label, route, group, description] of [
    ["Latest", '"" | absURL', "read", "Front page"],
    ["Archive", '"archive/" | absURL', "read", "By date"],
    ["Collections", '"collections/" | absURL', "read", "By topic"],
    ["Library", '"library/" | absURL', "read", "Search all"],
    ["Feeling curious?", '"random/" | absURL', "read", "Surprise me"],
    ["Gallery", '"gallery/" | absURL', "explore", "Editorial art"],
  ]) {
    assert.equal((masthead.match(new RegExp(`"label" "${escapeRegex(label)}"`, "g")) || []).length, 1, `${label} should be defined once`);
    assert.match(masthead, new RegExp(`"label" "${escapeRegex(label)}"[\\s\\S]*?"href" \\(${escapeRegex(route)}\\)[\\s\\S]*?"description" "${escapeRegex(description)}"[\\s\\S]*?"group" "${group}"`));
  }
  const readOrder = ["Latest", "Archive", "Collections", "Library", "Feeling curious?"]
    .map((label) => masthead.indexOf(`"label" "${label}"`));
  assert.ok(readOrder.every((position) => position >= 0), "every Read destination should exist");
  assert.ok(readOrder.every((position, index) => index === 0 || readOrder[index - 1] < position), "Read destinations should keep the requested order");

  assert.match(masthead, /\$appsPage := site\.GetPage "\/apps"/);
  assert.match(masthead, /\$showApps := and \$appsPage \(not \$appsPage\.Draft\)/);
  assert.doesNotMatch(masthead, /\$showApps\s*:=[^\r\n]*hugo\.IsServer/);
  assert.match(masthead, /"label" "Apps & Tools"[\s\S]*?"href" \$appsPage\.RelPermalink[\s\S]*?"description" "Digital experiments"[\s\S]*?"group" "explore"/);
  assert.match(masthead, /\$isAppsPage := and \$appsPage \(eq \$currentPath \$appsPage\.RelPermalink\)/);
  assert.match(masthead, /\$inAppsSection := or \$isAppsPage \(eq \.Section "apps"\)/);
  assert.match(masthead, /\$gamesPage := site\.GetPage "\/games"/);
  assert.match(masthead, /\$showGames := and \$gamesPage \(or \(not \$gamesPage\.Draft\) hugo\.IsServer\)/);
  assert.match(masthead, /"label" "Games"[\s\S]*?"href" \$gamesPage\.RelPermalink[\s\S]*?"description" "Playable work"[\s\S]*?"group" "explore"/);
  assert.match(masthead, /\$isGamesPage := and \$gamesPage \(eq \$currentPath \$gamesPage\.RelPermalink\)/);
  assert.match(masthead, /\$inGamesSection := or \$isGamesPage \(eq \.Section "games"\)/);

  assert.match(masthead, /"label" "Bookstore"[\s\S]*?"group" "direct"[\s\S]*?"mobilePrimary" false[\s\S]*?"analyticsSourceSlot" "primary_nav_bookstore"/);
  assert.match(masthead, /range \$directKey := slice "about" "bookstore" "contribute"/);
  assert.match(masthead, /range \$mobileKey := slice "about"/);
  assert.match(masthead, /"label" "Archive"[\s\S]*?"group" "read"[\s\S]*?"mobilePrimary" false/);
  assert.match(masthead, /"label" "About"[\s\S]*?"group" "direct"[\s\S]*?"mobilePrimary" true/);
  assert.match(masthead, /"label" "Contribute"[\s\S]*?"href" \("contribute\/" \| absURL\)[\s\S]*?"group" "direct"[\s\S]*?"mobilePrimary" false/);
  assert.doesNotMatch(masthead, /"label" "(?:Studio|Support)"[\s\S]*?"group" "direct"/);
  assert.match(masthead, /\$currentPath := \.RelPermalink/);
  assert.match(masthead, /\$archivePageNumber := int \(\.Scratch\.Get "oip_archive_page_number" \| default 1\)/);
  assert.match(masthead, /\$isArchivePage := and \(eq \$currentPath "\/archive\/"\) \(eq \$archivePageNumber 1\)/);
  assert.match(masthead, /\$inArchiveSection := or \$isArchivePage \(eq \.Section "archive"\) \(eq \.Section "essays"\) \(eq \.Section "syd-and-oliver"\)/);
  assert.match(masthead, /\$isBookstorePage := eq \$currentPath "\/shop\/"/);
  assert.match(masthead, /\$inBookstoreSection := or \$isBookstorePage \(eq \.Section "shop"\)/);
  assert.match(masthead, /\$inAboutSection := or \$isAboutPage \(eq \.Section "about"\)/);
  assert.match(masthead, /\$inContributeSection := or \$isContributePage \(eq \.Section "contribute"\)/);
  assert.match(masthead, /\$inRandomSection := or \$isRandomPage \(eq \.Section "random"\)/);
  assert.equal((masthead.match(/"currentPage" \$[A-Za-z]/g) || []).length, 11);
  assert.equal((masthead.match(/"currentSection" \$[A-Za-z]/g) || []).length, 11);
  assert.doesNotMatch(masthead, /"current"/);
  assert.match(masthead, /<nav class="nav nav--section-rail" aria-label="Primary" data-primary-nav>/);
  assert.equal((masthead.match(/aria-label="Primary"/g) || []).length, 1);
  assert.match(masthead, /class="nav__desktop"[\s\S]*?>\s*<span>Read<\/span>[\s\S]*?>\s*<span>Explore<\/span>[\s\S]*?range \$directItems/);
  assert.match(masthead, /<span>EST\. 2023<\/span>/);
  assert.doesNotMatch(masthead, /<span>EST\. 2025<\/span>/);
  assert.match(masthead, /class="nav__mobile"[\s\S]*?<span>Read<\/span>[\s\S]*?<span>Explore<\/span>[\s\S]*?range \$mobilePrimaryItems/);
  assert.doesNotMatch(masthead, /<span>Menu<\/span>/);
  assert.match(masthead, /\$mobileReadItems := slice[\s\S]*?range \$readItems[\s\S]*?\$mobileReadItems = \$mobileReadItems \| append \.[\s\S]*?"key" "bookstore"[\s\S]*?\$mobileReadItems = \$mobileReadItems \| append \./);
  assert.match(masthead, /\$mobileExploreItems := slice[\s\S]*?range \$exploreItems[\s\S]*?\$mobileExploreItems = \$mobileExploreItems \| append \.[\s\S]*?"key" "contribute"[\s\S]*?\$mobileExploreItems = \$mobileExploreItems \| append \./);
  assert.match(masthead, /class="nav__mobile"[\s\S]*?range \$mobileReadItems[\s\S]*?range \$mobileExploreItems[\s\S]*?range \$mobilePrimaryItems/);
  assert.doesNotMatch(masthead, /range \$mobileKey := slice[^\n]*"bookstore"/);
  assert.match(masthead, /\$readCurrent := gt \(len \(where \$readItems "currentSection" true\)\) 0/);
  assert.match(masthead, /\$exploreCurrent := gt \(len \(where \$exploreItems "currentSection" true\)\) 0/);
  assert.match(masthead, /\$mobileReadCurrent := gt \(len \(where \$mobileReadItems "currentSection" true\)\) 0/);
  assert.match(masthead, /\$mobileExploreCurrent := gt \(len \(where \$mobileExploreItems "currentSection" true\)\) 0/);
  assert.match(masthead, /<span class="visually-hidden">, current section<\/span>/);
  assert.doesNotMatch(masthead, /contains current section/);

  assert.match(mastheadNavLink, /\$currentPage := \$item\.currentPage \| default false/);
  assert.match(mastheadNavLink, /\$currentSection := \$item\.currentSection \| default false/);
  assert.match(mastheadNavLink, /\$currentSectionOnly := and \$currentSection \(not \$currentPage\)/);
  assert.match(mastheadNavLink, /if \$currentPage[\s\S]*?aria-current="page"/);
  assert.match(mastheadNavLink, /if \$currentSectionOnly[\s\S]*?nav-link--current-section/);
  assert.match(mastheadNavLink, /if \$currentSectionOnly[\s\S]*?<span class="visually-hidden">, current section<\/span>/);
  assert.doesNotMatch(mastheadNavLink, /if \$item\.current/);
  assert.match(mastheadNavLink, /with \$item\.analyticsEvent[\s\S]*?data-analytics-event="\{\{ \. \}\}"/);
  assert.match(mastheadNavLink, /with \$item\.analyticsSourceSlot[\s\S]*?data-analytics-source-slot="\{\{ \. \}\}"/);
  assert.match(mastheadNavLink, /nav-link__description/);
});

test("shared masthead exposes the public light and dark theme selector", () => {
  assert.match(masthead, /class="theme-toggle masthead-theme-toggle"/);
  assert.match(masthead, /data-theme-toggle/);
  assert.match(masthead, /aria-pressed="true"/);
  assert.match(masthead, /theme-toggle__icon--sun/);
  assert.match(masthead, /theme-toggle__icon--moon/);
  assert.match(masthead, /<nav class="nav nav--section-rail"[\s\S]*nav-disclosure--read[\s\S]*nav-disclosure--explore[\s\S]*nav__mobile/);
  assert.match(masthead, /\$mastheadVariant := cond \$isHomeMasthead "masthead--full" "masthead--compressed"/);
  assert.match(masthead, /\{\{ if \$isHomeMasthead \}\}[\s\S]*masthead-side-deck--left/);
  const homeLeftDeck = masthead.match(/<div class="masthead-side-deck masthead-side-deck--left"[\s\S]*?<\/div>/)?.[0] || "";
  assert.deepEqual(
    Array.from(homeLeftDeck.matchAll(/<span>([^<]+)<\/span>/g), ([, label]) => label),
    ["ESSAYS", "REPORTS", "LITERATURE"]
  );
  assert.doesNotMatch(
    masthead.match(/<nav class="nav nav--section-rail"[\s\S]*?<\/nav>/)?.[0] || "",
    /data-theme-toggle/
  );
  assert.match(baseLayout, /partial "theme_bootstrap\.html"[\s\S]*resources\.Get "css\/main\.css"/);
  assert.match(baseLayout, /partial "theme_toggle_script\.html"/);
  assert.match(baseLayout, /partial "masthead_navigation_script\.html"/);
  assert.match(notFound, /partial "theme_bootstrap\.html"[\s\S]*resources\.Get "css\/main\.css"/);
  assert.match(notFound, /partial "theme_toggle_script\.html"/);
  assert.match(notFound, /partial "masthead_navigation_script\.html"/);
  assert.match(themeBootstrap, /localStorage\.getItem\(storageKey\)/);
  assert.match(themeBootstrap, /prefers-color-scheme:\s*dark/);
  assert.match(themeBootstrap, /document\.documentElement\.setAttribute\("data-theme", theme\)/);
  assert.match(themeToggleScript, /localStorage\.setItem\(storageKey, theme\)/);
  assert.match(themeToggleScript, /setTheme\(currentTheme\(\) === "dark" \? "light" : "dark"\)/);
  assert.match(mastheadNavigationScript, /data-primary-nav-disclosure/);
  assert.match(mastheadNavigationScript, /event\.key === "Escape" && disclosure\.open/);
  assert.match(mastheadNavigationScript, /disclosure\.querySelector\("summary"\)[\s\S]*?summary\.focus\(\)/);
  assert.match(mastheadNavigationScript, /document\.addEventListener\("pointerdown"/);
  assert.match(mastheadNavigationScript, /matchMedia\("\(max-width: 768px\)"\)/);
  assert.match(css, /html\[data-theme="light"\]\{[\s\S]*--bg-page:var\(--oip-paper\);[\s\S]*--accent:var\(--oip-link\);/);
  assert.match(css, /html\{\s*font-size:100%;\s*scroll-behavior:smooth;\s*\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*html\{\s*scroll-behavior:auto;\s*\}/);
  assert.match(css, /\.theme-toggle\{[\s\S]*display:none;[\s\S]*\}/);
  assert.match(cssRule(css, ".theme-toggle"), /width:44px;[\s\S]*height:44px;/);
  assert.match(cssRule(css, ".paper-route-toggle"), /width:44px;[\s\S]*min-width:44px;[\s\S]*min-height:44px;[\s\S]*height:44px;/);
  assert.match(masthead, /class="masthead-controls"[\s\S]*data-paper-route-launch[\s\S]*data-theme-toggle[\s\S]*class="title"/);
  assert.match(css, /@media \(max-width:768px\)[\s\S]*\.masthead--full \.masthead-controls > button\{[^}]*position:static;[^}]*width:44px;[^}]*height:44px;/);
  assert.match(css, /html\.theme-enabled \.theme-toggle\{[\s\S]*display:inline-flex;[\s\S]*\}/);
  assert.match(css, /\.masthead--compressed \.title\{[\s\S]*font-size:clamp\(1\.75rem, 3vw, 2\.35rem\)/);
  assert.match(css, /\.nav__direct-link,[\s\S]*?\.nav-mobile-disclosure__summary\{[\s\S]*?min-height:44px;/);
  assert.match(css, /\.nav-disclosure__panel\{[\s\S]*?position:absolute;/);
  assert.match(css, /\.nav a\[aria-current="page"\],[\s\S]*?\.nav a\.nav-link--current-section,/);
  assert.match(css, /\.nav-disclosure__link\[aria-current="page"\],[\s\S]*?\.nav-disclosure__link\.nav-link--current-section/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.masthead--editorial \.nav--section-rail\{[\s\S]*?font-size:\.75rem;[\s\S]*?letter-spacing:0;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav__mobile\{[\s\S]*?grid-template-columns:(?:repeat\(3,\s*minmax\(0,\s*1fr\)\)|(?:minmax\(0,\s*(?:\d*\.?\d+)fr\)\s*){3});/);
  assert.match(css, /--nav-mobile-gap:clamp\(2px, 1vw, 4px\);/);
  assert.match(css, /\.nav-mobile-disclosure--read > \.nav-mobile-disclosure__summary::after,[\s\S]*?\.nav-mobile-disclosure--explore > \.nav-mobile-disclosure__summary::after/);
  assert.doesNotMatch(css, /\.nav__mobile-link--bookstore(?:\{|::after)/);
  assert.doesNotMatch(css, /\.nav__mobile-link--archive(?:\{|::after)/);
  assert.doesNotMatch(css, /\.nav__mobile-link--collections(?:\{|::after)/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav__mobile-link\{[\s\S]*?min-height:44px;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav-mobile-disclosure__summary\{[\s\S]*?justify-self:stretch;[\s\S]*?gap:\.25rem;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav-mobile-disclosure--read\{\s*grid-column:1;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav-mobile-disclosure--explore\{\s*grid-column:2;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav__mobile-link--about\{\s*grid-column:3;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav-mobile-disclosure__panel\{[\s\S]*?position:absolute;[\s\S]*?top:44px;[\s\S]*?right:0;[\s\S]*?left:0;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.masthead-nameplate__top-ornament\{\s*display:none;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.masthead--full \.title\{[\s\S]*?font-size:clamp\(2\.55rem, 11vw, 3\.1rem\);[\s\S]*?line-height:\.96;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.masthead--full \.subtitle\{\s*display:none;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.masthead-theme-toggle\{[\s\S]*?right:max\(12px, env\(safe-area-inset-right\)\);/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.masthead-paper-route-toggle\{[\s\S]*?left:max\(12px, env\(safe-area-inset-left\)\);/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.masthead--full \.masthead-nameplate__divider\{[\s\S]*?height:10px;[\s\S]*?margin:10px 0 6px;/);
  assert.match(css, /@media \(max-width:360px\)\{[\s\S]*\.masthead--full \.title\{[\s\S]*font-size:clamp\(2rem, 10vw, 2\.25rem\)/);
  assert.doesNotMatch(css, /@media \(max-width:360px\)\{[\s\S]*?\.masthead--editorial \.nav--section-rail\{[\s\S]*?font-size:\.6rem;/);
  assert.doesNotMatch(css, /@media \(max-width:420px\)\{[\s\S]*?\.theme-toggle\{[\s\S]*?(?:width|height):1\.85rem;/);
  assert.doesNotMatch(css, /@media \(max-width:420px\)\{[\s\S]*?\.paper-route-toggle\{[\s\S]*?height:1\.85rem;/);
  assert.match(css, /html\[data-theme="light"\] \.masthead--compressed\{[\s\S]*background:transparent;/);
  assert.match(css, /\.bookstore-epub-checkout-disclosure > summary\{[\s\S]*min-height:3\.2rem;/);
  assert.match(css, /\.bookstore-epub-checkout-disclosure > summary:focus-visible\{[\s\S]*outline:2px solid var\(--focus-ring\);/);
  assert.match(css, /\/\* Light-mode paper edition \*\//);
  assert.match(css, /html\[data-theme="light"\] \.card,[\s\S]*background:var\(--paper-surface-wash\), var\(--bg-surface\)/);
  assert.doesNotMatch(cssRule(css, 'html[data-theme="light"] body'), /radial-gradient/);
});

test("Jack Stratton modern bio preserves the complete localized visual sequence", () => {
  assert.match(jackStrattonEssay, /^version: "1\.5"$/m);
  assert.match(jackStrattonEssay, /^edition: "Sixth web edition"$/m);
  assert.match(jackStrattonEssay, /^featured_image_caption: "Jack Stratton on stage \| Source: Michelle Shiers"$/m);
  assert.match(jackStrattonEssay, /^featured_image_alt: "Jack Stratton on stage"$/m);
  assert.doesNotMatch(jackStrattonEssay, /!\[[^\]\r\n]*\\\]\(/);
  assert.doesNotMatch(jackStrattonEssay, /cdn-images-1\.medium\.com|miro\.medium\.com/);

  const expectedBodyImages = [
    "/images/medium/jack-stratton-and-the-vulfpeck-model/2c3762584e6a4b03acaf71a5ca668741cc0c78e9cd714f4238aef65d56c37c7b.jpeg",
    "/images/medium/jack-stratton-and-the-vulfpeck-model/3a73bf5eef98b4652561ecd257f3a7a2a22726d60f3a5d8f6d30549cfe507aa2.jpeg",
    "/images/medium/jack-stratton-and-the-vulfpeck-model/552e548f82e4a9edd9b3ab53f9354751fecc3c03c5f74518fb15a8d45af58242.jpeg",
    "/images/medium/jack-stratton-and-the-vulfpeck-model/f36a6e470efd2fd38b93abfd2d8056a951f956e6f1f61d698ce43edc4f73d4f6.jpeg",
    "/images/medium/jack-stratton-and-the-vulfpeck-model/4e545f452e9f1601fc923051b9bcfa772947549b4592a059c8e598d3259d050c.jpeg",
    "/images/medium/jack-stratton-and-the-vulfpeck-model/e4ba5e54a975b44557c9a40bf259fa87c4bd6c5ee0f0ea2d99486d083acc3ea5.jpeg",
    "/images/article-media/jack-stratton-and-the-vulfpeck-model/97337aed41250cd4d04217fb2cb2485dea733d71fecbae5684362779c6bf1d12.jpg",
    "/images/article-media/jack-stratton-and-the-vulfpeck-model/3eebf467f71ac2479bf14032516dedf69768b753f762f4e0bc24cac9689b74ad.jpeg",
    "/images/article-media/jack-stratton-and-the-vulfpeck-model/9064a56cc18deb31888bcf508a36ea371b034c27c6c8e3b9cca7f63c46028d71.jpeg",
    "/images/article-media/jack-stratton-and-the-vulfpeck-model/950149cea33f580c4a00ce8a602f6b3248b1fc61121c0ea5940038a4d293ca69.jpeg",
    "/images/article-media/jack-stratton-and-the-vulfpeck-model/c120d4582d9ed24545009806966a4df4ec01d1dcc2d725d2fc1d19b4d847af50.jpeg",
    "/images/article-media/jack-stratton-and-the-vulfpeck-model/18ff47191c4b5d441d9ab279a7e997f5c6150c85143fc857194f40e9c858a14d.jpeg",
  ];
  const bodyImages = [...jackStrattonEssay.matchAll(/^!\[[^\]\r\n]+\]\((\/images\/[^)]+)\)$/gm)].map(
    (match) => match[1]
  );

  assert.deepEqual(bodyImages, expectedBodyImages);
  for (const imagePath of bodyImages) {
    assert.equal(
      fs.existsSync(path.resolve("static", imagePath.slice(1))),
      true,
      `expected localized Jack Stratton visual: ${imagePath}`
    );
  }
  assert.match(jackStrattonEssay, /\[Watch on YouTube\]\(https:\/\/www\.youtube\.com\/watch\?v=8bLinctYcno\)/);
  assert.match(jackStrattonEssay, /\[Source: Vulf on YouTube\]\(https:\/\/youtu\.be\/py-HPosf8s8/);
});

test("Studio samples retain reader-ready copy and public revision records", () => {
  assert.match(campMysticEssay, /^version: "2\.3"$/m);
  assert.match(campMysticEssay, /^edition: "Eighth web edition"$/m);
  assert.match(campMysticEssay, /^  - version: "2\.3"$/m);
  assert.match(campMysticEssay, /^### July 4: Warning, Rising Water, and Evacuation$/m);
  assert.match(campMysticEssay, /^### Further Reading$/m);
  assert.match(campMysticEssay, /or all\s*> of the above\?/);
  assert.doesNotMatch(
    campMysticEssay,
    /COA2|back-archive review|Medium import residue|Recovered and localized|Deep Dive Teaser|Combined Full Timeline|upcoming piece|Thanks for reading!/i
  );

  assert.match(jackStrattonEssay, /^#### What's Next for Jack Stratton and Vulfpeck$/m);
  assert.match(jackStrattonEssay, /^  - version: "1\.5"$/m);
  assert.match(jackStrattonEssay, /Source: Blue Funky Mamma/);
  assert.match(jackStrattonEssay, /\*\*\*Theo Katzman, Woody Goss, and Joe Dart\*\*\*\./);
  assert.match(jackStrattonEssay, /\*\*\*Sleepify\*\*\*,\s+a\s+silent Spotify album/);
  assert.doesNotMatch(
    jackStrattonEssay,
    /back-archive review|Recovered and localized|localized visual sequence|What's Next for Jack Stratton and Vulfpeck in 2025|At publication, the band had|more\s*> recently/i
  );

  assert.match(peachesOrGreeceDialogue, /^version: '1\.2'$/m);
  assert.match(peachesOrGreeceDialogue, /^edition: 'Third web edition'$/m);
  assert.match(peachesOrGreeceDialogue, /^  - version: '1\.2'$/m);
  assert.match(peachesOrGreeceDialogue, /Athens, Georgia, and Athens, Greece\./);
  assert.match(peachesOrGreeceDialogue, /Oliver repeated the word\./);
  assert.doesNotMatch(peachesOrGreeceDialogue, /intersting|citezenship|romaticizing|Perhaps, both/);
});

test("Studio sample metadata is structured, complete, and limited to the three approved examples", () => {
  const contentRoot = path.resolve("content");
  const markedContentPaths = markdownFilesUnder(contentRoot)
    .filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      return match ? /^studio_sample:\s*$/m.test(match[1]) : false;
    })
    .map((filePath) => path.relative(contentRoot, filePath).split(path.sep).join("/"))
    .sort();

  assert.deepEqual(markedContentPaths, [
    "essays/dialogues/peaches-or-greece.md",
    "essays/jack-stratton-and-the-vulfpeck-model.md",
    "essays/what-happened-at-camp-mystic.md",
  ]);

  const expectedSamples = [
    {
      label: "Camp Mystic",
      source: campMysticEssay,
      values: {
        input: "Public records, maps, and a complex warning timeline.",
        work: "Source review, fact-checking, timeline reconstruction, and visual explanation.",
        proof: "Dense evidence can become a clear explainer for general readers.",
      },
    },
    {
      label: "Jack Stratton",
      source: jackStrattonEssay,
      values: {
        input: "Interviews, public sources, and archival images.",
        work: "Research synthesis, narrative structure, source cleanup, and visual sequencing.",
        proof: "Scattered material can become a coherent, engaging profile.",
      },
    },
    {
      label: "Peaches or Greece",
      source: peachesOrGreeceDialogue,
      values: {
        input: "A recorded conversation.",
        work: "Dialogue shaping, pacing, voice preservation, and line editing.",
        proof: "Natural conversation can become a polished literary dialogue.",
      },
    },
  ];

  for (const sample of expectedSamples) {
    const sampleFrontMatter = frontMatter(sample.source, sample.label);
    assert.equal((sampleFrontMatter.match(/^studio_sample:\s*$/gm) || []).length, 1);
    assert.deepEqual(studioSampleValues(sample.source, sample.label), sample.values);
  }
});

test("Square-first bookstore requires delivery email and keeps marketing consent optional", () => {
  assert.equal(fs.existsSync(path.resolve("layouts/partials/shop/checkout-actions.html")), false);
  assert.match(directOffers, /direct_offers_heading" \| default "Outside In Print EPUB"/);
  assert.match(directOffers, /checkout_unavailable_label" \| default "EPUB coming soon"/);
  assert.match(directOffers, /data-analytics-event="checkout_start"/);
  assert.match(directOffers, /type="email"[\s\S]*name="email"[\s\S]*required/);
  assert.match(directOffers, /type="checkbox" name="weekly_email"/);
  assert.match(directOffers, /type="checkbox" name="publication_notifications"/);
  assert.match(directOffers, /\$newsletterCheckoutLabel/);
  assert.match(directOffers, /bookstore-epub-checkout__newsletter-details/);
  assert.match(directOffers, /\$collapseCheckout := \.collapseCheckout \| default false/);
  assert.match(directOffers, /\$headingLevel := \.headingLevel \| default 2/);
  assert.match(directOffers, /if eq \$headingLevel 3/);
  assert.equal((directOffers.match(/bookstore-direct-offer__gate/g) || []).length, 1);
  assert.match(directOffers, /<details class="bookstore-epub-checkout-disclosure" data-bookstore-checkout-disclosure>/);
  assert.match(directOffers, /<summary aria-label="\{\{ \$checkoutSummaryLabel \}\}: \{\{ \$productTitle \}\}">/);
  assert.match(directOffers, /Optional\. Not required to buy\./);
  assert.doesNotMatch(directOffers, /fallback_(?:url|label)|amazon/i);

  const checkoutField = directOffers.indexOf('class="bookstore-epub-checkout__field"');
  const checkoutSubmit = directOffers.indexOf('type="submit"', checkoutField);
  const checkoutStatus = directOffers.indexOf('data-epub-checkout-status', checkoutSubmit);
  const checkoutPreferences = directOffers.indexOf('class="bookstore-epub-checkout__preferences"', checkoutStatus);
  assert.ok(checkoutField >= 0);
  assert.ok(checkoutSubmit > checkoutField);
  assert.ok(checkoutStatus > checkoutSubmit);
  assert.ok(checkoutPreferences > checkoutStatus);

  assert.match(kindleButton, /\$promoteKindle := and \(gt \(len \$epubOffers\) 0\) \(eq \(len \$liveEpubOffers\) 0\)/);
  assert.match(kindleButton, /class="bookstore-kindle-button\{\{ if \$promoteKindle \}\} bookstore-kindle-button--available-primary/);
  assert.match(kindleButton, /bookstore-kindle-offer--available-primary/);
  assert.match(kindleButton, /data-bookstore-kindle-button/);
  assert.match(kindleButton, /data-bookstore-kindle-role="\{\{ cond \$promoteKindle "primary-available" "secondary" \}\}"/);
  assert.match(kindleButton, /data-analytics-source-slot="\{\{ \$sourceSlot \}\}"/);
  assert.doesNotMatch(kindleButton, /data-analytics-event|<img/i);

  assert.equal((shopList.match(/partial "shop\/kindle-button\.html"/g) || []).length, 1);
  assert.equal((shopSingle.match(/partial "shop\/kindle-button\.html"/g) || []).length, 1);
  assert.ok(shopList.indexOf('partial "shop/direct-offers.html"') < shopList.indexOf('partial "shop/kindle-button.html"'));
  assert.ok(shopSingle.indexOf('partial "shop/direct-offers.html"') < shopSingle.indexOf('partial "shop/kindle-button.html"'));
  assert.match(shopList, /bookstore_index_direct/);
  assert.match(shopList, /"collapseCheckout" true/);
  assert.match(shopList, /"headingLevel" 3/);
  assert.match(shopList, /bookstore_index_kindle/);
  assert.match(shopSingle, /bookstore_detail_direct/);
  assert.match(shopSingle, /bookstore_detail_kindle/);
  assert.doesNotMatch(shopSingle, /collapseCheckout/);
  assert.doesNotMatch(shopSingle, /headingLevel/);
  const purchaseTitle = shopSingle.indexOf('class="bookstore-product__purchase-title"');
  const checkoutRestrictionGate = shopSingle.indexOf('{{ if gt (len $liveEpubOffers) 0 }}', purchaseTitle);
  const checkoutRestriction = shopSingle.indexOf("Direct EPUB checkout is currently available to U.S. customers only.", purchaseTitle);
  const detailDirectOffers = shopSingle.indexOf('partial "shop/direct-offers.html"', purchaseTitle);
  assert.ok(purchaseTitle >= 0);
  assert.ok(purchaseTitle < checkoutRestrictionGate);
  assert.ok(checkoutRestrictionGate < checkoutRestriction);
  assert.ok(checkoutRestriction < detailDirectOffers);
  assert.match(shopSingle, /<p class="bookstore-product__checkout-restriction">Direct EPUB checkout is currently available to U\.S\. customers only\.<\/p>/);
  assert.match(cssRule(css, ".bookstore-product__checkout-restriction"), /font-size:\.88rem;[\s\S]*line-height:1\.55;/);
  assert.doesNotMatch(shopList, /bookstore-secondary-channel|checkout-actions/);
  assert.doesNotMatch(shopSingle, /bookstore-panel|Other formats and channels|checkout-actions/);

  assert.match(bookstoreData, /checkout_label: "Buy EPUB — \$9\.99"/);
  assert.match(bookstoreData, /checkout_note: "Secure checkout through Square\. EPUB delivered by email\."/);
  assert.equal((bookstoreData.match(/kindle_label: "Kindle on Amazon · \$9\.99"/g) || []).length, 3);
  assert.doesNotMatch(bookstoreData, /kindle_label: "Kindle on Amazon · \$4\.99"/);
  assert.doesNotMatch(bookstoreData, /^\s+(?:purchase_url|fallback_url|fallback_label):/m);
  assert.doesNotMatch(privacyPolicy, /This policy explains how Outside In Print handles information connected to this website/);

  assert.match(epubCheckoutScript, /"Idempotency-Key": idempotencyKey/);
  assert.match(epubCheckoutScript, /JSON\.stringify\(\{ sku: sku, country_code: "US", email: email \}\)/);
  assert.match(epubCheckoutScript, /emailInput\.checkValidity\(\)/);
  assert.match(epubCheckoutScript, /body\.append\("tag", tag\)/);
  assert.match(epubCheckoutScript, /keepalive: true/);
  assert.match(epubCheckoutScript, /payload\.checkout_url \|\| payload\.url/);
  assert.match(epubCheckoutScript, /parsed\.hostname !== "square\.link" && parsed\.hostname !== "checkout\.square\.site"/);
  assert.match(epubCheckoutScript, /button\.disabled = false;[\s\S]*button\.textContent = originalLabel;[\s\S]*support@outsideinprint\.org/);
  assert.doesNotMatch(epubCheckoutScript, /amazon/i);

  assert.match(analyticsScript, /if \(isExternalLink\(url\)\)/);
  assert.match(
    analyticsScript,
    /track\("external_link_click", mergeProps\(datasetProps\(anchor\), currentPageProps\(\)\)\)/
  );
});

test("newsletter proposition is plain-language across signup and checkout surfaces", () => {
  for (const expected of [
    'cadence = "Every Saturday"',
    'title = "The weekly newsletter"',
    'contents = "New essays, original visuals, and selected archive work from Outside In Print. One thoughtful email each week."',
    'price_promise = "Free. No spam ever. Unsubscribe anytime."',
    'button_label = "Join the newsletter"',
    'prompt_label = "Join the weekly Outside In Print newsletter."',
    'checkout_label = "Send me the weekly Outside In Print newsletter. Free. No spam ever."',
    'sample_url = "/almanack/2026-07-25/"',
    'sample_label = "Read a sample issue"',
    'privacy_promise = "Your email goes to Buttondown to deliver and manage the Outside In Print newsletter. Outside In Print does not sell or rent subscriber information. Unsubscribe anytime."',
    'privacy_url = "/privacy/"',
    'privacy_label = "Privacy details"'
  ]) {
    assert.match(hugoConfig, new RegExp(escapeRegex(expected)));
  }

  for (const expected of [
    'newsletter-signup__details',
    'newsletter-signup__price',
    'newsletter-signup__links',
    'newsletter-signup__privacy',
    '$newsletter.cadence',
    '$newsletter.contents',
    '$newsletter.price_promise',
    '$newsletter.sample_url',
    '$newsletter.privacy_promise',
    'data-analytics-event="internal_promo_click"',
    'data-analytics-source-slot="{{ $sampleSourceSlot }}"'
  ]) {
    assert.match(newsletterSignup, new RegExp(escapeRegex(expected)));
  }
  assert.match(newsletterSignup, /aria-describedby="\{\{ \$dekID \}\} \{\{ \$priceID \}\} \{\{ \$privacyID \}\}"/);
  assert.match(newsletterSignup, /\$anchorID := \.anchorID \| default ""/);
  assert.match(newsletterSignup, /\$isSamplePage := eq \$page\.RelPermalink \$samplePath/);
  assert.match(newsletterSignup, /You&rsquo;re reading the sample issue\./);
  assert.match(newsletterSignup, /if \$isSamplePage[\s\S]*?<span>You&rsquo;re reading the sample issue\.<\/span>[\s\S]*?else[\s\S]*?data-analytics-source-slot="\{\{ \$sampleSourceSlot \}\}"/);
  assert.match(newsletterPrompt, /href="#\{\{ \$targetID \}\}"/);
  assert.match(newsletterPrompt, /data-analytics-event="internal_promo_click"/);
  assert.match(newsletterPrompt, /data-analytics-source-slot="\{\{ \$sourceSlot \}\}"/);
  assert.match(newsletterPrompt, /data-analytics-slug="bobs-almanack-signup"/);
  assert.match(homeV2FrontPage, /partial "home_reader_newsletter\.html"/);
  assert.match(homeReaderNewsletter, /One thoughtful letter each week\./);
  assert.match(homeReaderNewsletter, /No spam ever\. Unsubscribe anytime\./);
  assert.match(homeReaderNewsletter, /data-analytics-source-slot="homepage_reader_banner"/);
  assert.doesNotMatch(homeV2FrontPage, /Bob(?:'|’)s Almanack|home-almanack/);
  assert.match(articleSingle, /"class" "newsletter-signup--article-exit"/);
  assert.match(articleSingle, /"sourceSlot" "article_exit_newsletter"/);
  assert.match(articleSingle, /if \$showCollectionContinuation[\s\S]*?partial "newsletter_prompt\.html"[\s\S]*?"sourceSlot" "article_exit_newsletter_prompt"/);
  assert.match(articleSingle, /"anchorID" "bobs-almanack-signup"/);
  assert.ok(articleSingle.indexOf('partial "newsletter_prompt.html"') < articleSingle.indexOf('partial "collections/reading-path.html"'));
  assert.match(cssRule(css, ".newsletter-prompt a"), /min-height:44px;/);
  assert.match(cssRule(css, ".newsletter-signup[id]"), /scroll-margin-top:6rem;/);
  assert.match(almanackIndex, /^noindex: true$/m);
  assert.match(almanackIndex, /^outputs:\s+  - HTML\s+  - RSS$/m);
  assert.match(almanackIndex, /^build:\s+  render: always\s+  list: never$/m);
  assert.match(almanackIndexTemplate, /<meta name="robots" content="noindex, follow" \/>/);
  assert.match(almanackIndexTemplate, /<link rel="canonical" href="\{\{ "collections\/bobs-almanack\/" \| absURL \}\}" \/>/);
  assert.match(almanackIndexTemplate, /window\.location\.replace\("\{\{ "collections\/bobs-almanack\/" \| relURL \}\}"\)/);
  assert.match(almanackIssue, /partial "newsletter_signup\.html"/);
  assert.match(almanackIssue, /"class" "newsletter-signup--article-exit page-shell page-shell--wide"/);
  assert.match(almanackIssue, /"sourceSlot" "almanack_issue_exit_newsletter"/);
  assert.equal((almanackIssue.match(/partial "newsletter_signup\.html"/g) || []).length, 1);
  assert.ok(almanackIssue.lastIndexOf("</article>") < almanackIssue.indexOf('partial "newsletter_signup.html"'));

  assert.match(privacyPolicy, /effective_date: "September 15, 2026"/);
  assert.match(privacyPolicy, /standalone Bob's Almanack signup form/);
  assert.match(privacyPolicy, /IP address, browser or device information, and referring page/);
  assert.match(privacyPolicy, /email-client, browser, device, IP-address, or referrer metadata/);
  assert.match(privacyPolicy, /Unsubscribing stops the selected emails but is not the same as deleting subscription records\./);

  const propositionSources = [hugoConfig, homepage, articleSingle, newsletterSignup, directOffers].join("\n");
  assert.doesNotMatch(propositionSources, /Limited time|launch window|Easy to leave/i);
  assert.match(propositionSources, /No spam ever/);
});

test("contact, bookstore, and Civic Institutions expose the repaired public copy", () => {
  assert.match(contactContent, /For factual corrections, editorial questions, rights inquiries, or reprint requests, email \[support@outsideinprint\.org\]/);
  assert.match(shopContent, /choose an Outside In Print EPUB through secure Square checkout\./);
  assert.doesNotMatch(shopContent, /Buy all three directly/);
  assert.match(collectionsData, /description: Essays on courts, federalism, public institutions, and the exercise of public power\./);
  assert.match(civicCollectionContent, /description: "Essays on courts, federalism, public institutions, and the exercise of public power\."/);
  assert.doesNotMatch(`${collectionsData}\n${civicCollectionContent}`, /A staged lane|once the body of work is coherent enough to publish/i);
});

test("filtered dialogue archive stays wired through the live discovery surfaces", () => {
  assert.match(dialoguesSection, /title: "Syd and Oliver Dialogues"/);
  assert.match(dialoguesSection, /description: "Dialogue pieces from the recurring world of Syd and Oliver/);
  assert.doesNotMatch(dialoguesSection, /^title: "Dialogues"$/m);
  assert.match(randomTemplate, /"label" "Home"/);
  assert.doesNotMatch(randomTemplate, /"label" "Welcome"/);
});

test("footer and random route now point readers home instead of Welcome", () => {
  assert.match(footer, /aria-label="Footer"/);
  assert.match(footer, /href="\{\{ "" \| absURL \}\}">Home</);
  assert.match(footer, /href="\{\{ "about\/" \| absURL \}\}">About</);
  assert.match(footer, /href="\{\{ "authors\/robert-v-ussley\/" \| absURL \}\}">Author</);
  assert.match(footer, /href="\{\{ "library\/" \| absURL \}\}">Library</);
  assert.match(footer, /\$appsPage := site\.GetPage "\/apps"/);
  assert.match(footer, /\$showApps := and \$appsPage \(not \$appsPage\.Draft\)/);
  assert.doesNotMatch(footer, /\$showApps\s*:=[^\r\n]*hugo\.IsServer/);
  assert.match(footer, /href="\{\{ \$appsPage\.RelPermalink \}\}"[\s\S]*?>Apps &amp; Tools</);
  assert.match(footer, /href="\{\{ \$appsPage\.RelPermalink \}\}"\{\{ if eq \.RelPermalink \$appsPage\.RelPermalink \}\} aria-current="page"\{\{ end \}\}>Apps &amp; Tools/);
  assert.match(footer, /\$gamesPage := site\.GetPage "\/games"/);
  assert.match(footer, /\$showGames := and \$gamesPage \(or \(not \$gamesPage\.Draft\) hugo\.IsServer\)/);
  assert.match(footer, /href="\{\{ \$gamesPage\.RelPermalink \}\}"[\s\S]*?>Games</);
  assert.match(footer, /href="\{\{ \$gamesPage\.RelPermalink \}\}"\{\{ if eq \.RelPermalink \$gamesPage\.RelPermalink \}\} aria-current="page"\{\{ end \}\}>Games/);
  assert.doesNotMatch(footer, /if eq \.Section "(?:apps|games)"/);
  assert.match(footer, />Library<[\s\S]*?>Apps &amp; Tools<[\s\S]*?>Games<[\s\S]*?>Studio<[\s\S]*?>Bookstore</);
  assert.match(footer, /href="\{\{ "studio\/" \| absURL \}\}"[\s\S]*?data-analytics-source-slot="footer_studio"[\s\S]*?>Studio</);
  assert.match(footer, /href="\{\{ "shop\/" \| absURL \}\}"[\s\S]*?data-analytics-source-slot="footer_bookstore"[\s\S]*?>Bookstore</);
  assert.doesNotMatch(footer, /href="\{\{ "start-here\/" \| absURL \}\}">Welcome</);

  assert.match(randomTemplate, /class="page-header page-shell page-shell--wide"/);
  assert.match(randomTemplate, /Feeling curious\? Let the archive choose the next piece\./);
  assert.match(randomTemplate, /partial "journey_links\.html"/);
  assert.match(randomTemplate, /"label" "Library"/);
  assert.match(randomTemplate, /"label" "Collections"/);
  assert.match(randomTemplate, /"label" "Home"/);
  assert.match(randomTemplate, /class="item random-route__status"/);
  assert.match(randomTemplate, /Finding a piece from the archive\.\.\./);
  assert.match(randomTemplate, /legacyHost = "lpeasy\.github\.io"/);
  assert.match(randomTemplate, /legacyPrefix = "\/outsideinprint"/);
  assert.match(randomTemplate, /canonicalHost = "https:\/\/outsideinprint\.org"/);
  assert.match(randomTemplate, /window\.location\.hostname === legacyHost/);
  assert.match(randomTemplate, /window\.location\.replace\(canonicalHost \+ canonicalPath \+ window\.location\.search \+ window\.location\.hash\)/);
  assert.match(randomTemplate, /window\.location\.replace\(randomUrl\)/);
  assert.match(randomTemplate, /window\.location\.replace\(fallback\)/);
  assert.match(randomTemplate, /\.RelPermalink/);
  assert.doesNotMatch(randomTemplate, /data-random-route-choices/);
  assert.doesNotMatch(randomTemplate, /data-random-route-refresh/);
  assert.doesNotMatch(randomTemplate, /data-analytics-source-slot", "random_choice"/);
  assert.match(randomTemplate, /Open the Library/);
});

test("commerce terms and Almanack templates keep their public copy and landmarks accurate", () => {
  assert.match(supportTerms, /^effective_date: "August 31, 2026"$/m);
  assert.match(supportTerms, /- one-time support in a whole-dollar amount from \$5 to \$500; and\s+- fixed support of \$5 per month\./);
  assert.doesNotMatch(supportTerms, /custom monthly support|recurring-price validation/i);

  assert.match(almanackIssue, /<div class="almanack-main">/);
  assert.doesNotMatch(almanackIssue, /<\/?main\b/);
  assert.match(almanackCollection, /<div class="almanack-collection__principal">/);
  assert.doesNotMatch(almanackCollection, /<\/?main\b|aria-label="Bob's Almanack lead sheet"/);

  assert.match(
    collectionsData,
    /description: Weekly Outside In Print issues from Robert V\. Ussley, gathering new essays, cartoons, compact notices, and one piece worth reprinting\./
  );
  assert.doesNotMatch(collectionsData, /compact notices, and worth reprinting/i);
});

test("homepage offers separate library navigation and a centered contributor button", () => {
  const libraryClasses = classTokensForElement(homeV2FrontPage, /<nav\b[^>]*aria-label="Keep reading"[^>]*>/, "homepage library navigation");
  for (const token of ["home-v2-library", "home-v2-next__links", "page-shell", "page-shell--wide"]) {
    assert.ok(libraryClasses.has(token), `expected homepage library class token: ${token}`);
  }
  const nextClasses = classTokensForElement(homeV2FrontPage, /<section\b[^>]*aria-label="Become a contributor"[^>]*>/, "homepage contribution");
  for (const token of ["home-v2-next", "page-shell", "page-shell--wide"]) {
    assert.ok(nextClasses.has(token), `expected homepage next-step class token: ${token}`);
  }
  assert.match(homeV2FrontPage, /Browse the library/);
  assert.match(homeV2FrontPage, /Surprise me/);
  assert.doesNotMatch(homeV2FrontPage, /Publish with us|Write for Outside In Print\.|Have an original article or essay/);
  assert.match(homeV2FrontPage, /Become a contributor/);
  assert.doesNotMatch(homeV2FrontPage, /Gallery|Collections|home-browse|home-v2-next__browse|The full imprint|Find your next question|Browse the archive|Search the library/);
  assert.match(cssRule(css, ".home-v2-next"), /display:flex;[\s\S]*justify-content:center;/);
  assert.doesNotMatch(cssRule(css, ".home-v2-next"), /border|background|grid-template-columns/);
  assert.doesNotMatch(css, /\.home-v2-next__contribute\{|\.home-v2-next > article\{/);
  assert.match(cssRule(css, ".home-v2-next__cta"), /min-height:44px;/);
});

test("homepage composition puts reading before newsletter and contribution", () => {
  assert.match(homepage, /partial "home_front_page\.html"/);
  assert.match(homeFrontPage, /partial "home_v2_front_page\.html"/);
  assert.match(homeV2FrontPage, /id="home-front-page-title"/);
  assert.equal((homeV2FrontPage.match(/<h1\b/g) || []).length, 1);
  assert.match(homeV2FrontPage, /partial "home_reader_banner\.html"/);
  assert.match(homeV2FrontPage, /A note to the reader/);
  const welcomeCopyParagraphs = Array.from(homeV2FrontPage.matchAll(/<p class="home-front-page__welcome-copy">([\s\S]*?)<\/p>/g));
  assert.equal(welcomeCopyParagraphs.length, 1);
  assert.equal(welcomeCopyParagraphs[0][1].replace(/<[^>]+>/g, "").trim(), readerNoteCopy);
  assert.match(
    homeV2FrontPage,
    /<p class="home-front-page__welcome-links"><a href="\{\{ "about\/" \| relURL \}\}">About the imprint<\/a><a href="\{\{ "authors\/robert-v-ussley\/" \| relURL \}\}">About the author<\/a><\/p>/,
  );
  assert.doesNotMatch(homeV2FrontPage, /<p class="home-front-page__welcome-links">[\s\S]*?Start reading[\s\S]*?<\/p>/);
  assert.match(homeV2FrontPage, /Featured Articles/);
  assert.match(homeV2FrontPage, /homepage_v2_featured_lead/);
  assert.match(homeV2FrontPage, /homepage_v2_featured_supporting/);
  assert.match(homeV2FrontPage, /Become a contributor/);
  assert.doesNotMatch(homeV2FrontPage, /home_bookstore|home-almanack|home-selected-collections|home_2045_launch|home_imprint_statement|home-manifesto/);
  assert.doesNotMatch(homepage, /home_bookstore_spotlight|home_selected_collections|home_2045_launch|newsletter_signup/);

  const compositionOrder = [
    'partial "home_reader_banner.html"',
    'class="home-front-page__orientation"',
    'class="home-v2-featured',
    'class="home-v2-library',
    'partial "home_reader_newsletter.html"',
    'class="home-v2-next',
  ].map((marker) => homeV2FrontPage.indexOf(marker));
  assert.ok(compositionOrder.every((index) => index >= 0));
  assert.deepEqual(compositionOrder, [...compositionOrder].sort((left, right) => left - right));

  assert.match(homeReaderNewsletter, /Join the newsletter/);
  assert.doesNotMatch(homeReaderBanner, /<form\b|home-reader-banner__signup/);
  assert.match(homeReaderBanner, /hugo\.Data\.homepage_metrics/);
  assert.match(homeV2FrontPage, /hugo\.Data\.homepage_metrics/);
  assert.doesNotMatch(homeV2FrontPage, /Medium reads/i);

  assert.match(galleryContent, /title: "Gallery"/);
  assert.match(galleryContent, /digital gallery/i);
  assert.match(galleryTemplate, /cartoon-gallery-spotlight/);
  assert.match(galleryTemplate, /cartoon-gallery__grid/);
  assert.match(galleryTemplate, /\$archiveCartoons := slice/);
  assert.match(galleryTemplate, /if ne \.slug \$currentSlug/);
  assert.match(galleryTemplate, /\$archiveCartoons = \$archiveCartoons \| append \./);
  assert.match(galleryTemplate, /range \$archiveCartoons/);
  assert.doesNotMatch(galleryTemplate, /cartoon-gallery__item--current/);
  assert.match(galleryTemplate, /data-cartoon-lightbox-trigger/);
  assert.match(galleryTemplate, /data-cartoon-slug/);
  assert.match(galleryTemplate, /data-cartoon-lightbox-essay/);
  assert.match(galleryTemplate, /<p id="cartoon-lightbox-title" class="cartoon-lightbox__title" data-cartoon-lightbox-title><\/p>/);
  assert.doesNotMatch(galleryTemplate, /<h2 id="cartoon-lightbox-title"/);
  assert.match(galleryTemplate, /aria-labelledby="cartoon-lightbox-title"/);
  assert.match(css, /\.article-plate-lightbox__caption \[data-article-plate-lightbox-caption\]\{/);
  assert.doesNotMatch(css, /\.article-plate-lightbox__caption p\{/);
  assert.match(galleryTemplate, /window\.location\.href = activeEssay/);
  assert.match(galleryTemplate, /getRequestedCartoonSlug/);
  assert.match(galleryTemplate, /openLightbox\(requestedTrigger\)/);
  assert.match(cartoonLookupPartial, /hugo\.Data\.editorial_cartoons/);
  assert.match(cartoonLinkPartial, /gallery\/\?cartoon=%s/);
  assert.match(cartoonLinkPartial, /essay-cartoon-thumb/);
  assert.match(cartoonLinkPartial, /<button/);
  assert.match(cartoonLinkPartial, /data-essay-cartoon-lightbox-trigger/);
  assert.match(cartoonLinkPartial, /data-gallery/);
  assert.doesNotMatch(cartoonLinkPartial, /<a class="essay-cartoon-thumb/);
  assert.match(baseLayout, /editorial\/cartoon-thumbnail-lightbox\.html/);
  assert.match(cartoonThumbnailLightbox, /data-essay-cartoon-lightbox/);
  assert.match(cartoonThumbnailLightbox, /<p id="essay-cartoon-lightbox-title" class="cartoon-lightbox__title" data-essay-cartoon-lightbox-title><\/p>/);
  assert.doesNotMatch(cartoonThumbnailLightbox, /<h2 id="essay-cartoon-lightbox-title"/);
  assert.match(cartoonThumbnailLightbox, /data-essay-cartoon-lightbox-gallery/);
  assert.match(cartoonThumbnailLightbox, /View in gallery/);
  assert.match(cartoonThumbnailLightbox, /imageButton\.addEventListener\("click", closeLightbox\)/);
  assert.doesNotMatch(cartoonThumbnailLightbox, /window\.location\.href/);
  assert.match(pageListItem, /editorial\/cartoon-gallery-link\.html/);
  assert.match(cartoonData, /slug: think-outside-the-box/);
  assert.match(cartoonData, /essay: "\/essays\/the-warning-label-in-the-weeds\/"/);
  const thinkOutsideEntry = cartoonData.match(/  - slug: think-outside-the-box[\s\S]*?(?=\n  - slug:|\n?$)/)?.[0] || "";
  assert.doesNotMatch(thinkOutsideEntry, /essay:/);
  assert.match(cartoonData, new RegExp(`current: ${escapeRegex(currentCartoonSlug)}`));
  assert.match(cartoonData, new RegExp(`slug: ${escapeRegex(currentCartoonSlug)}`));
});

test("Studio presents five focused sections with visible terms and native secondary details", () => {
  assert.deepEqual([...studioTemplate.matchAll(/data-studio-section="([^"]+)"/g)].map((match) => match[1]), ["offer", "scope", "proof", "details", "inquiry"]);
  const studioDisclosures = [...studioTemplate.matchAll(/<details\b([^>]*)>[\s\S]*?<summary[^>]*>([^<]+)<\/summary>[\s\S]*?<\/details>/g)];
  assert.deepEqual(studioDisclosures.map((match) => match[2]), ["Source limits and exclusions", "How the sprint works", "Common questions"]);
  for (const disclosure of studioDisclosures) {
    assert.doesNotMatch(disclosure[1], /\bopen(?:\s|=|$)/);
    assert.doesNotMatch(disclosure[0], /<form\b|<fieldset\b|name="(?:commercial|source_safety)_acknowledgement"/);
  }
  assert.doesNotMatch(studioTemplate, /studio-problem|studio-pricing__panel|studio-conversion|studio-proof__card|studio-cta--secondary|role="(?:menu|menuitem)"/);
  assert.match(studioTemplate, /I turn one recording, transcript, presentation, draft, or source packet into a clear, \{\{ lang\.FormatNumber 0 \$outputMinimum \}\}–\{\{ lang\.FormatNumber 0 \$outputMaximum \}\}-word essay in your voice, with your byline\./);
  const identityIndex = studioTemplate.indexOf('You’ll work directly with <a href="/authors/robert-v-ussley/">Robert V. Ussley</a>.');
  assert.ok(identityIndex > studioTemplate.indexOf('class="studio-hero__deck"'));
  assert.ok(identityIndex < studioTemplate.indexOf('class="studio-hero__trust"'));
  const hero = studioTemplate.slice(studioTemplate.indexOf('data-studio-section="offer"'), studioTemplate.indexOf('data-studio-section="scope"'));
  assert.match(hero, /data-analytics-source-slot="studio_hero_to_form"[\s\S]*?>Discuss your project<\/a>/);
  assert.equal((studioTemplate.match(/href="#studio-inquiry"/g) || []).length, 1);
  assert.match(hero, /href="#studio-scope">See what’s included<\/a>/);
  assert.match(hero, /\$foundingPrice[\s\S]*?\$foundingLimit[\s\S]*?\$standardPrice/);
  const scope = studioTemplate.slice(studioTemplate.indexOf('data-studio-section="scope"'), studioTemplate.indexOf('data-studio-section="proof"'));
  assert.doesNotMatch(scope, /<details\b/);
  for (const text of ["Choose one main source set.", "I review each project and agree on the written scope with you before you pay.", "After full payment, you receive the complete finished file set and own the finished work exclusively.", "Outside In Print retains no publication right unless you give written permission.", "publication is not guaranteed"]) {
    assert.ok(scope.includes(text), `essential Studio term must remain visible: ${text}`);
  }
  assert.match(scope, /\$depositPercent/);
  assert.match(scope, /\$finalPercent/);
  assert.deepEqual([...studioTemplate.matchAll(/<legend[^>]*>([^<]+)<\/legend>/g)].map((match) => match[1]), ["About you", "Source material", "Your essay"]);
  assert.match(studioTemplate, /Tell me about your project\. This form prepares an email draft; you review and send it yourself\./);
  assert.match(homeStudioOffer, /You have the material\. I make it publishable\./);
  assert.doesNotMatch(homepage, /partial "home_studio_offer\.html"/);
  assert.match(cssRule(css, ".studio-page"), /max-width:54rem;/);
  assert.match(cssRule(css, ".studio-hero h1"), /font-size:clamp\(2rem, 1\.7rem \+ 1\.5vw, 3rem\);/);
  assert.match(cssRule(css, ".studio-details__item > summary"), /min-height:44px;/);
  assert.match(cssRule(css, ".studio-details__item > summary:focus-visible"), /outline:3px solid var\(--focus-ring\);/);
  assert.match(cssRule(css, ".studio-form__grid"), /grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width:768px\)\{[^}]*?\.studio-form__grid\{\s*grid-template-columns:1fr;/);
  for (const [href, description] of [
    ["/essays/what-happened-at-camp-mystic/", "Public records and a hard-to-follow timeline became a clear account for general readers."],
    ["/essays/jack-stratton-and-the-vulfpeck-model/", "Interviews and public sources became one clear profile."],
    ["/syd-and-oliver/peaches-or-greece/", "A recorded conversation became a finished dialogue."],
  ]) {
    assert.equal(studioTemplate.split(`href="${href}"`).length - 1, 1);
    assert.ok(studioTemplate.includes(description));
  }
});

test("Studio funnel keeps pricing, scope, inquiry configuration, and mail composition data-driven", () => {
  for (const snippet of [
    'offer_code: "OIP-STUDIO-EXPERT-ESSAY"',
    'founding_price_display: "$1,250"',
    'standard_price_display: "$1,500"',
    'deposit_percent: 50',
    'turnaround_business_days: 7',
    'recording_limit_minutes: 90',
    'transcript_limit_words: 15000',
    'source_packet_limit_pages: 25',
    'output_word_minimum: 1500',
    'output_word_maximum: 2000',
    'email: "support@outsideinprint.org"',
    'subject_prefix: "Outside In Print Studio Inquiry"'
  ]) {
    assert.match(studioData, new RegExp(escapeRegex(snippet)));
  }
  assert.match(studioData, /^\s*founding_offer_active:\s*(?:true|false)\s*$/m);

  assert.match(studioTemplate, /errorf "Studio inquiry configuration requires inquiry\.email/);
  assert.match(studioTemplate, /errorf "Studio inquiry configuration requires inquiry\.subject_prefix/);
  assert.match(studioTemplate, /\$composerEnabled := and \$enabled \$inquiryEnabled/);
  assert.match(studioTemplate, /action="\/studio\/#studio-inquiry"[\s\S]*?method="post"/);
  assert.match(studioTemplate, /data-studio-email-form/);
  for (const attribute of [
    "data-inquiry-email",
    "data-inquiry-subject-prefix",
    "data-current-rate",
    "data-deposit-percent",
    "data-offer-code",
    "data-source-page",
    'data-analytics-event="studio_inquiry_email_prepare"',
    'data-analytics-source-slot="studio_inquiry_form"',
    'data-analytics-slug="studio"'
  ]) {
    assert.match(studioTemplate, new RegExp(escapeRegex(attribute)));
  }
  for (const [name, maxLength] of [
    ["name", 100],
    ["email", 254],
    ["website", 300],
    ["source_size", 80],
    ["intended_reader", 160],
    ["project_subject", 160],
    ["desired_outcome", 800]
  ]) {
    assert.match(studioTemplate, new RegExp(`name="${name}"[\\s\\S]*?maxlength="${maxLength}"`));
  }
  for (const name of ["role", "source_material", "timeline", "source_safety_acknowledgement", "commercial_acknowledgement"]) {
    assert.match(studioTemplate, new RegExp(`name="${name}"`));
  }
  assert.match(studioTemplate, /name="source_size" type="text" maxlength="80"[^>]* required>/);
  assert.match(studioTemplate, /name="intended_reader" type="text" maxlength="160" required>/);
  assert.match(studioTemplate, /name="source_safety_acknowledgement" type="checkbox" value="acknowledged" required>/);
  assert.match(studioTemplate, /How much source material do you have\?/);
  assert.match(studioTemplate, /Who should read the essay\?/);
  const studioFieldOrder = ["name", "email", "website", "role", "source_material", "source_size", "intended_reader", "project_subject", "desired_outcome", "timeline", "source_safety_acknowledgement", "commercial_acknowledgement"]
    .map((name) => studioTemplate.indexOf(`name="${name}"`));
  assert.ok(studioFieldOrder.every((index) => index >= 0), "expected all ordered Studio qualification fields");
  assert.deepEqual(studioFieldOrder, [...studioFieldOrder].sort((left, right) => left - right));
  assert.match(studioTemplate, /You have the material\. I make it ready to publish\./);
  assert.match(studioTemplate, /Fixed scope <span aria-hidden="true">&middot;<\/span> First draft in \{\{ \$turnaroundDays \}\} business days <span aria-hidden="true">&middot;<\/span> One revision/);
  assert.match(studioTemplate, /The \{\{ \$turnaroundDays \}\}-business-day clock starts after three things happen: you approve the written scope, pay the deposit, and send all agreed source material\./);
  assert.match(studioTemplate, /standard visual layout and image treatment tailored to your preferences/);
  assert.match(studioTemplate, /<p(?=[^>]*\bid="studio-operator-title")(?=[^>]*\bclass="[^"]*\bstudio-operator__eyebrow\b[^"]*")[^>]*>Your writer and editor<\/p>/);
  assert.match(studioTemplate, /I’m <a href="\/authors\/robert-v-ussley\/">Robert V\. Ussley<\/a>, the writer and editor behind Outside In Print\. I handle each Publication Sprint directly and produce reported essays and literary analysis on risk, institutions, technology, and public life\./);
  assert.match(studioTemplate, /These are examples of my own editorial work, not client testimonials\. Their visuals represent the standard deliverable and can be tailored to the client’s preferences\./);
  assert.match(studioTemplate, /Outside In Print may publish it at your request, with your written approval, but publication is not guaranteed\./);
  assert.match(studioTemplate, /After full payment, you receive the complete finished file set and own the finished work exclusively\. Outside In Print retains no publication right unless you give written permission\./);
  assert.doesNotMatch(studioTemplate, /Outside In Print reserves the right to publish the essay on outsideinprint\.org\./);
  assert.doesNotMatch(studioTemplate, /Outside In Print keeps the right to publish the finished essay on outsideinprint\.org\./);
  assert.doesNotMatch(studioTemplate, /Outside In Print publishes it only if you ask us to and approve publication\./);
  assert.doesNotMatch(studioTemplate, /publication is guaranteed|guarantee(?:d|s)? publication/i);
  assert.match(css, /@media print\{[\s\S]*?\.studio-operator\{[\s\S]*?border-color:#bbb;[\s\S]*?background:none;[\s\S]*?box-shadow:none;[\s\S]*?\.studio-operator__body,[\s\S]*?\.studio-operator__body a\{[\s\S]*?color:#111;/);
  assert.match(studioTemplate, /This form does not send your answers to Outside In Print or site analytics\. When you select “Prepare inquiry email,” your answers go to your email app or provider to make a draft\. That app or provider may save or sync the draft under its own privacy rules\. Outside In Print gets your answers only if you send the email and it reaches \{\{ \$email \}\}\./);
  assert.doesNotMatch(studioTemplate, /Your answers remain on your device until you open and send/);
  assert.match(studioTemplate, /type="submit" disabled>Prepare inquiry email/);
  assert.match(studioTemplate, /role="status" aria-live="polite"/);
  assert.match(studioTemplate, /data-analytics-event="studio_inquiry_direct_email"/);
  assert.match(studioTemplate, />Email \{\{ \$email \}\} directly<\/a>/);
  assert.match(studioTemplate, /href="\/privacy\/">Privacy Policy<\/a>/);
  assert.doesNotMatch(studioTemplate, /type="file"/);
  assert.match(studioTemplate, /\{\{-?\s*if \$composerEnabled\s*-?\}\}(?:(?!\{\{-?\s*end)[\s\S])*?<form[\s\S]*?data-studio-email-form[\s\S]*?<\/form>\s*\{\{-?\s*end\s*-?\}\}\s*<p id="studio-inquiry-direct-email" class="studio-form__fallback">/);
  assert.match(studioTemplate, /\{\{-?\s*if \$composerEnabled\s*-?\}\}(?:(?!\{\{-?\s*end)[\s\S])*?resources\.Get "js\/studio-inquiry\.js"[\s\S]*?<script defer[\s\S]*?<\/script>\s*\{\{-?\s*end\s*-?\}\}/);

  assert.match(studioScript, /new FormData\(form\)/);
  assert.match(studioScript, /"mailto:" \+ recipient/);
  assert.match(studioScript, /encodeURIComponent\(subject\)/);
  assert.match(studioScript, /encodeURIComponent\(body\)/);
  assert.match(studioScript, /event\.preventDefault\(\)/);
  assert.match(studioScript, /\.join\("\\n"\)\.replace\(\/\\n\/g, "\\r\\n"\)/);
  assert.match(studioScript, /\\u007F-\\u009F/);
  assert.match(studioScript, /"Source size: " \+ value\(data, "source_size"\)/);
  assert.match(studioScript, /"Intended reader: " \+ value\(data, "intended_reader"\)/);
  assert.match(studioScript, /clean\(form\.dataset\.depositPercent\)\.length > 0/);
  assert.match(studioScript, /"Price acknowledgment: I understand that the current rate is " \+ clean\(form\.dataset\.currentRate\) \+ "\. A " \+ clean\(form\.dataset\.depositPercent\) \+ "% deposit is required to book the project\."/);
  assert.match(studioScript, /"Safety acknowledgment: I have not attached or pasted confidential, classified, privileged, export-controlled, or restricted source material\. I will wait for Outside In Print to ask for source files and tell me what it can accept and how to send it\."/);
  const guidedBodyOrder = [
    '"Source material: " + value(data, "source_material")',
    '"Source size: " + value(data, "source_size")',
    '"Intended reader: " + value(data, "intended_reader")',
    '"Proposed essay: " + value(data, "project_subject")'
  ].map((snippet) => studioScript.indexOf(snippet));
  assert.ok(guidedBodyOrder.every((index) => index >= 0), "expected all ordered guided-email fields");
  assert.deepEqual(guidedBodyOrder, [...guidedBodyOrder].sort((left, right) => left - right));
  assert.doesNotMatch(studioScript, /"(?:Offer code|Source page): "/);
  assert.match(studioScript, /I will receive your inquiry only if you send the email and it reaches me\./);
  assert.ok(studioScript.indexOf('form.addEventListener("submit", prepareInquiry)') < studioScript.indexOf("submitButton.disabled = false"));
  assert.doesNotMatch(studioScript, /fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|document\.cookie|localStorage|sessionStorage|navigator\.clipboard/);
  assert.doesNotMatch(studioScript, /delivery confirmed|successfully sent|inquiry received/i);

  const fallbackBodyMatch = studioTemplate.match(/\$fallbackBody := printf "([^"]+)"/);
  assert.ok(fallbackBodyMatch, "expected the Studio template to define a direct-email fallback body");
  assert.match(fallbackBodyMatch[1], /Source size:\\r\\n/);
  assert.match(fallbackBodyMatch[1], /Intended reader:\\r\\n/);
  assert.match(fallbackBodyMatch[1], /Current base rate: %s\. A %d%% deposit is required to book the project\./);
  assert.match(fallbackBodyMatch[1], /Safety reminder: Do not attach or paste confidential, classified, privileged, export-controlled, or restricted source material\. Wait for Outside In Print to tell you what it can accept and how to send it\./);
  const fallbackBodyOrder = ["Source material:", "Source size:", "Intended reader:", "Proposed essay:"]
    .map((snippet) => fallbackBodyMatch[1].indexOf(snippet));
  assert.ok(fallbackBodyOrder.every((index) => index >= 0), "expected all ordered fallback-email prompts");
  assert.deepEqual(fallbackBodyOrder, [...fallbackBodyOrder].sort((left, right) => left - right));
  assert.doesNotMatch(fallbackBodyMatch[1], /I have not attached/);
  assert.doesNotMatch(fallbackBodyMatch[1], /acknowledged/i);
  assert.doesNotMatch(fallbackBodyMatch[1], /(?:Offer code|Source page):/);

  assert.match(privacyPolicy, /When you enter information in the Studio inquiry form, the form does not send the inquiry-field contents to Outside In Print, a hosted form provider, or site analytics\. Selecting “Prepare inquiry email” passes those contents to your configured email application or provider through a `mailto:` draft; that application or provider may store or sync the draft under its own privacy practices\. Outside In Print receives the information only if you send the message and it reaches `support@outsideinprint\.org`\./);
  assert.doesNotMatch(privacyPolicy, /remains in your browser/);
  assert.doesNotMatch(privacyPolicy, /preparing the draft does not transmit/);
  assert.doesNotMatch(privacyPolicy, /The information is transmitted only when you send/);

  assert.match(studioTerms, /^effective_date: "September 3, 2026"$/m);
  assert.match(studioTerms, /After full payment, the client owns the finished deliverable exclusively\. Pre-existing client materials and identified third-party materials are not included in that transfer\. Outside In Print may publish the finished work only with the client’s written permission\./);
  assert.doesNotMatch(studioTerms, /reserves the right to publish|keeps the right to publish/i);

  assert.match(studioSampleExit, /href="\/studio\/#studio-inquiry"/);
  assert.match(studioSampleExit, /data-analytics-event="internal_promo_click"/);
  assert.match(studioSampleExit, /data-analytics-source-slot="studio_sample_exit"/);
  assert.match(studioSampleExit, />Start a Publication Sprint<\/a>/);
  assert.match(analyticsDoc, /Existing discovery slots include `article_collection_context` for article collection links and `studio_sample_exit` for marked Studio links\./);
  assert.match(analyticsDoc, /Slot labels identify where a click occurred; they do not establish a later inquiry or sale\./);
});

function runStudioComposerMock({ missingField = "", datasetOverride = {} } = {}) {
  const values = {
    name: "Alex Reader",
    email: "alex@example.test",
    website: "",
    role: "Independent expert",
    source_material: "Transcript",
    source_size: "8,000 words",
    intended_reader: "General readers",
    project_subject: "Risk & choices?",
    desired_outcome: "Explain the tradeoffs.\r\nOffer a useful next step.",
    timeline: "Within 30 days",
    source_safety_acknowledgement: "acknowledged",
    commercial_acknowledgement: "acknowledged",
  };
  const button = { disabled: true };
  const status = { textContent: "" };
  let submit;
  const form = {
    dataset: {
      inquiryEmail: "support@outsideinprint.org",
      inquirySubjectPrefix: "Outside In Print Studio Inquiry",
      currentRate: "$1,250",
      depositPercent: "50",
      offerCode: "OIP-STUDIO-EXPERT-ESSAY",
      sourcePage: "https://outsideinprint.org/studio/",
      ...datasetOverride,
    },
    elements: { namedItem: (name) => name === missingField ? null : { name } },
    querySelector: (selector) => selector === 'button[type="submit"]' ? button : status,
    addEventListener: (event, listener) => {
      assert.equal(event, "submit");
      assert.equal(button.disabled, true, "attach the handler before enabling email preparation");
      submit = listener;
    },
  };
  const window = { location: { href: "" } };
  vm.runInNewContext(studioScript, {
    document: { querySelector: () => form },
    window,
    FormData: class { get(name) { return values[name] ?? null; } },
  });
  return { button, status, window, submit };
}

test("Studio email preparation creates a reviewable encoded draft without sending an inquiry", () => {
  const composer = runStudioComposerMock();
  assert.equal(composer.button.disabled, false);
  assert.equal(composer.window.location.href, "");
  let prevented = false;
  composer.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  const mailto = new URL(composer.window.location.href);
  assert.equal(mailto.protocol, "mailto:");
  assert.equal(mailto.pathname, "support@outsideinprint.org");
  assert.equal(mailto.searchParams.get("subject"), "Outside In Print Studio Inquiry — Risk & choices?");
  const body = mailto.searchParams.get("body");
  assert.match(body, /Website or profile: Not provided/);
  assert.match(body, /Source material: Transcript\r\nSource size: 8,000 words\r\nIntended reader: General readers\r\nProposed essay: Risk & choices\?/);
  assert.match(body, /Desired outcome: Explain the tradeoffs\.\r\nOffer a useful next step\./);
  assert.match(body, /current rate is \$1,250\. A 50% deposit is required/);
  assert.match(body, /Safety acknowledgment: I have not attached or pasted/);
  assert.doesNotMatch(body, /(?:Offer code|Source page):/);
  assert.match(composer.window.location.href, /%20|%0D%0A/);
  assert.match(composer.status.textContent, /Review it before you send it\./);
  assert.match(composer.status.textContent, /only if you send the email and it reaches me\./);
});

test("Studio keeps email preparation disabled when required fields or configuration are unavailable", () => {
  for (const options of [{ missingField: "commercial_acknowledgement" }, { datasetOverride: { inquiryEmail: "not-an-email" } }]) {
    const composer = runStudioComposerMock(options);
    assert.equal(composer.button.disabled, true);
    assert.equal(composer.submit, undefined);
    assert.equal(composer.window.location.href, "");
  }
});

test("homepage editorial layout keeps the reader note compact and drops retired hooks", () => {
  assert.match(css, /:root\{[\s\S]*--bg-page:#121212;[\s\S]*--font-display:"Source Serif 4", Georgia, serif;[\s\S]*--measure-reading:68ch;/);
  assert.match(css, /:root,\s*\.oip-theme-rules-print-20260429-161813\{[\s\S]*--oip-rule-hairline:rgba\(236,231,223,.06\);[\s\S]*--oip-rule-clear:rgba\(236,231,223,.17\);[\s\S]*--oip-rule-engraved:rgba\(213,190,150,.22\);[\s\S]*--oip-rule-engraved-strong:rgba\(213,190,150,.34\);[\s\S]*\}/);
  assert.match(css, /\.oip-theme-rules-clear-20260429-115754\{[\s\S]*--oip-rule-hairline:rgba\(236,231,223,.055\);[\s\S]*--oip-rule-clear:rgba\(236,231,223,.155\);[\s\S]*--oip-rule-engraved-strong:rgba\(213,190,150,.24\);[\s\S]*\}/);
  assert.match(css, /\.oip-theme-rules-classic-20260429-115754\{[\s\S]*--oip-rule-hairline:rgba\(236,231,223,.04\);[\s\S]*--oip-rule-clear:rgba\(236,231,223,.12\);[\s\S]*--oip-rule-engraved-strong:rgba\(213,190,150,.18\);[\s\S]*\}/);
  assert.match(css, /--oip-rule-engraved-gradient:linear-gradient\(90deg, rgba\(236,231,223,0\), var\(--oip-rule-engraved-strong\) 18%, var\(--oip-rule-engraved\) 52%, rgba\(236,231,223,0\)\);/);
  assert.match(css, /--oip-rule-engraved-rail:linear-gradient\(180deg, var\(--oip-rule-engraved-strong\), var\(--oip-rule-engraved\) 48%, rgba\(213,190,150,0\)\);/);
  const dividerTokens = new Set(Array.from(css.matchAll(/--oip-rule-[a-z-]+:/g), ([token]) => token.slice(0, -1)));
  assert.deepEqual(Array.from(dividerTokens).sort(), [
    "--oip-rule-clear",
    "--oip-rule-engraved",
    "--oip-rule-engraved-gradient",
    "--oip-rule-engraved-rail",
    "--oip-rule-engraved-strong",
    "--oip-rule-faint",
    "--oip-rule-hairline",
    "--oip-rule-list",
    "--oip-rule-standard",
  ]);
  assert.match(styleThemeWorkflow, /oip-theme-<area>-<descriptor>-YYYYMMDD-HHMMSS/);
  assert.match(styleThemeWorkflow, /oip-theme-rules-classic-20260429-115754/);
  assert.match(styleThemeWorkflow, /oip-theme-rules-clear-20260429-115754/);
  assert.match(styleThemeWorkflow, /oip-theme-rules-print-20260429-161813/);
  assert.match(styleThemeWorkflow, /--oip-rule-engraved/);
  assert.match(styleThemeWorkflow, /--oip-rule-engraved-gradient/);
  assert.match(styleThemeWorkflow, /--oip-rule-engraved-rail/);
  assert.match(styleThemeWorkflow, /semantic threshold tools, not general borders/);
  assert.match(styleThemeWorkflow, /signature thresholds only/);
  assert.match(styleThemeWorkflow, /approved public theme selector/);
  assert.match(styleThemeWorkflow, /html\[data-theme="light"\]/);
  assert.match(styleThemeWorkflow, /localStorage\["oip-theme"\]/);
  assert.match(css, /#main-content\{\s*scroll-margin-top:56px;\s*\}/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?#main-content\{\s*scroll-margin-top:0;\s*\}/);
  assert.doesNotMatch(cssRule(css, "body"), /repeating-linear-gradient/);
  assert.doesNotMatch(css, /\.home-manifesto(?:__[a-z-]+)?\s*\{/);
  assert.match(cssRule(css, ".home-reader-banner"), /border-top:4px double var\(--oip-rule-engraved-strong\);/);
  assert.match(cssRule(css, ".home-reader-banner.page-shell--wide"), /max-width:70rem;/);
  assert.match(css, /\.home-v2-featured\.page-shell--wide,\s*\.home-v2-library\.page-shell--wide,\s*\.home-v2-next\.page-shell--wide\{[^}]*max-width:70rem;/);
  assert.match(cssRule(css, ".home-reader-banner__proof"), /grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(cssRule(css, ".home-reader-banner__proof-item"), /padding:\.5rem \.75rem \.48rem;/);
  assert.match(cssRule(css, ".home-reader-banner__signup"), /gap:\.75rem 1\.4rem;[\s\S]*padding:\.72rem \.9rem \.78rem;/);
  assert.match(cssRule(css, ".home-reader-banner__form"), /grid-template-columns:minmax\(0, 1fr\) auto;/);
  assert.match(cssRule(css, ".home-reader-banner__controls button"), /min-height:2\.75rem;/);
  const orientationRule = cssRule(css, ".home-front-page__orientation");
  assert.match(orientationRule, /display:grid;/);
  assert.match(orientationRule, /grid-template-columns:minmax\(0, 1fr\);/);
  assert.match(orientationRule, /grid-template-areas:\s*"label"\s*"copy"\s*"links";/);
  assert.match(orientationRule, /gap:\.12rem 1\.5rem;/);
  assert.match(orientationRule, /max-width:70rem;/);
  assert.match(orientationRule, /margin:0 auto 1rem;/);
  assert.match(orientationRule, /padding:0 0 \.7rem;/);
  assert.doesNotMatch(orientationRule, /max-width:52rem;/);
  assert.match(cssRule(css, ".home-front-page__welcome-label"), /font-size:\.8125rem;[\s\S]*letter-spacing:\.1em;/);
  assert.match(cssRule(css, ".home-front-page__welcome-copy"), /margin:0;[\s\S]*font-size:\.94rem;[\s\S]*line-height:1\.42;/);
  cssRule(css, ".home-front-page__welcome-links");
  assert.match(cssRule(css, ".home-front-page__welcome-links a"), /min-height:44px;/);
  assert.match(cssRule(css, ".home-front-page__welcome-links a:focus-visible"), /outline:3px solid var\(--focus-ring\);/);
  assert.match(cssRule(css, ".home-v2-featured__grid"), /grid-template-columns:minmax\(0, 1\.45fr\) minmax\(18rem, \.8fr\);/);
  assert.match(cssRule(css, ".home-v2-featured__lead"), /border-right:1px solid var\(--oip-rule-standard\);/);
  assert.match(cssRule(css, ".home-v2-featured__lead-media img"), /aspect-ratio:16 \/ 9;/);
  assert.match(cssRule(css, ".home-v2-featured__supporting"), /padding:1\.25rem 0 1\.1rem 1\.5rem;/);
  assert.match(cssRule(css, ".home-v2-next"), /display:flex;[\s\S]*justify-content:center;/);
  assert.doesNotMatch(cssRule(css, ".home-v2-next"), /border|background/);
  assert.match(cssRule(css, ".home-v2-next__cta"), /min-height:44px;/);
  assert.match(css, /@media \(max-width:900px\)\{[\s\S]*\.home-v2-featured__grid\{[^}]*grid-template-columns:1fr;/);
  assert.match(css, /@media \(max-width:520px\)\{[\s\S]*\.home-v2-featured__supporting\{\s*display:block;/);
  assert.match(cssRule(css, ".essays-front__year-link"), /min-width:44px;/);
  assert.match(cssRule(css, ".essays-front__year-link"), /min-height:44px;/);

  assert.match(css, /\.item\{[\s\S]*border-bottom:1px solid var\(--oip-rule-list\);/);
  assert.match(css, /\.author-route__reading-map\{[\s\S]*border-top:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.about-route__reading-map::before,\s*\.author-route__reading-map::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.essays-front__masthead,\s*\.section-front__header\{[\s\S]*border-bottom:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.nav--section-rail\{[\s\S]*border-top-color:var\(--oip-rule-engraved\);[\s\S]*border-bottom-color:var\(--oip-rule-engraved\);/);
  assert.match(css, /\.nav--section-rail::before,\s*\.nav--section-rail::after\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.site-footer\{[\s\S]*border-top:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.site-footer::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.imprint-header,\s*\.article-publication-record,\s*\.article-record,\s*\.reading-path\{[\s\S]*border-color:var\(--oip-rule-standard\);/);
  assert.match(css, /\.imprint-header::before,\s*\.article-publication-record::before,\s*\.article-record::before,\s*\.reading-path::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.library-group::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.library-group \[data-library-item\],\s*\.library-results__list \[data-library-item\]\{[\s\S]*position:relative;[\s\S]*padding-top:\.55rem;/);
  assert.match(css, /\.library-group \[data-library-item\]:not\(\[hidden\]\) ~ \[data-library-item\]:not\(\[hidden\]\),\s*\.library-results__list \[data-library-item\]:not\(\[hidden\]\) ~ \[data-library-item\]:not\(\[hidden\]\)\{[\s\S]*border-top:1px solid var\(--oip-rule-standard\);/);
  assert.match(css, /\.library-group \[data-library-item\]:not\(\[hidden\]\) ~ \[data-library-item\]:not\(\[hidden\]\)::before,\s*\.library-results__list \[data-library-item\]:not\(\[hidden\]\) ~ \[data-library-item\]:not\(\[hidden\]\)::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.library-group \[data-library-item\] > \.item,\s*\.library-results__list \[data-library-item\] > \.item\{[\s\S]*border-bottom:none;/);
  assert.match(css, /\.library-group \[data-library-item\] > \.item::before,\s*\.library-results__list \[data-library-item\] > \.item::before\{[\s\S]*background:var\(--oip-rule-engraved-rail\);/);
  assert.match(css, /\.library-group \[data-library-item\]:focus-within > \.item::before,\s*\.library-results__list \[data-library-item\]:focus-within > \.item::before\{[\s\S]*opacity:\.82;/);
  assert.doesNotMatch(css, /\.library-group \.item,\s*\.library-results__list \.item\{/);
  assert.doesNotMatch(css, /\.library-group \.item::before,\s*\.library-results__list \.item::before\{/);
  assert.match(css, /\.essays-front__month::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.essays-front__month-list \.item\{[\s\S]*border-bottom-color:var\(--oip-rule-faint\);/);
  assert.match(css, /\.essays-front__month-list \.item::before\{[\s\S]*background:var\(--oip-rule-engraved-rail\);/);
  assert.match(cssRule(css, ".home-v2-featured__meta"), /font:700 \.8125rem\/1\.4 var\(--font-ui\);/);
  assert.match(cssRule(css, ".home-v2-featured__item + .home-v2-featured__item"), /border-top:1px solid var\(--oip-rule-standard\);/);
  assert.doesNotMatch(css, /\.home-v2-next__contribute\{/);

  assert.match(css, /\.cartoon-gallery-spotlight\{[\s\S]*grid-template-columns:minmax\(12rem, \.38fr\) minmax\(0, 1fr\);/);
  assert.match(css, /\.cartoon-gallery\{[\s\S]*border-top:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.cartoon-gallery::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.piece-body h2::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.piece-body figure\{[\s\S]*border-top:1px solid var\(--oip-rule-faint\);/);
  assert.match(css, /\.piece-body \.article-embed::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.collections-broadsheet__section::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.collection-section__header::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(cssRule(css, ".bookstore-index__header"), /border-top:1px solid var\(--oip-rule-engraved\);/);
  assert.match(cssRule(css, ".bookstore-record"), /border-top:1px solid var\(--oip-rule-standard\);/);
  assert.match(cssRule(css, ".bookstore-record::before"), /background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(cssRule(css, ".bookstore-direct-offer"), /border:1px solid rgba\(127,147,166,\.36\);/);
  assert.match(cssRule(css, ".bookstore-direct-offer__action"), /width:100%;[\s\S]*min-height:3\.2rem;/);
  assert.match(cssRule(css, ".bookstore-direct-offer__action:not(.shop-cta--disabled)"), /background:var\(--accent\);/);
  assert.match(cssRule(css, ".bookstore-kindle-button"), /display:inline-flex;[\s\S]*width:auto;[\s\S]*max-width:100%;[\s\S]*background:transparent;/);
  assert.match(cssRule(css, ".bookstore-kindle-button--available-primary"), /min-height:3\.2rem;[\s\S]*background:var\(--accent\);/);
  assert.match(cssRule(css, ".bookstore-direct-offers--unavailable"), /border:1px solid var\(--oip-rule-faint\);/);
  assert.match(cssRule(css, ".shop-cta"), /background:var\(--accent-soft\);/);
  assert.doesNotMatch(css, /bookstore-woodgrain-v1\.6|#7f1f1c|#9a2a24/);
  assert.match(css, /@media \(max-width:520px\)\{[\s\S]*?\.home-reader-banner\{[\s\S]*?width:calc\(100% - \.75rem\);[\s\S]*?margin-bottom:1\.15rem;/);
  assert.match(css, /@media \(max-width:520px\)\{[\s\S]*?\.home-reader-banner__signup\{[\s\S]*?gap:\.55rem;[\s\S]*?padding:\.65rem \.7rem \.72rem;/);
  assert.match(css, /@media \(max-width:520px\)\{[\s\S]*?\.home-reader-banner__controls\{[\s\S]*?grid-template-columns:minmax\(0, 1fr\) auto;/);
  assert.match(css, /@media \(max-width:520px\)\{[\s\S]*?\.home-reader-banner__controls input,[\s\S]*?\.home-reader-banner__controls button\{[\s\S]*?min-height:2\.75rem;/);
  assert.match(css, /@media \(max-width:360px\)\{[\s\S]*?\.home-reader-banner__controls\{\s*grid-template-columns:1fr;/);
  assert.doesNotMatch(css, /\.entry-thread__archive\{/);
  assert.doesNotMatch(css, /\.start-here-page\{/);
  assert.doesNotMatch(css, /\.newsletter-signup--start-here/);
});
