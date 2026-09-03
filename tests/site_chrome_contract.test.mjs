import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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

const masthead = fs.readFileSync(path.resolve("layouts/partials/masthead.html"), "utf8");
const mastheadNavLink = fs.readFileSync(path.resolve("layouts/partials/masthead_nav_link.html"), "utf8");
const mastheadNavigationScript = fs.readFileSync(path.resolve("layouts/partials/masthead_navigation_script.html"), "utf8");
const homepage = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
const articleSingle = fs.readFileSync(path.resolve("layouts/_default/single.html"), "utf8");
const newsletterSignup = fs.readFileSync(path.resolve("layouts/partials/newsletter_signup.html"), "utf8");
const newsletterPrompt = fs.readFileSync(path.resolve("layouts/partials/newsletter_prompt.html"), "utf8");
const hugoConfig = fs.readFileSync(path.resolve("hugo.toml"), "utf8");
const privacyPolicy = fs.readFileSync(path.resolve("content/privacy/index.md"), "utf8");
const contactContent = fs.readFileSync(path.resolve("content/contact/index.md"), "utf8");
const shopContent = fs.readFileSync(path.resolve("content/shop/_index.md"), "utf8");
const baseLayout = fs.readFileSync(path.resolve("layouts/_default/baseof.html"), "utf8");
const notFound = fs.readFileSync(path.resolve("layouts/404.html"), "utf8");
const themeBootstrap = fs.readFileSync(path.resolve("layouts/partials/theme_bootstrap.html"), "utf8");
const themeToggleScript = fs.readFileSync(path.resolve("layouts/partials/theme_toggle_script.html"), "utf8");
const homeFrontPage = fs.readFileSync(path.resolve("layouts/partials/home_front_page.html"), "utf8");
const homeFrontPageCopy = fs.readFileSync(path.resolve("layouts/partials/home_front_page_copy.html"), "utf8");
const homeStudioOffer = fs.readFileSync(path.resolve("layouts/partials/home_studio_offer.html"), "utf8");
const homeBookstore = fs.readFileSync(path.resolve("layouts/partials/home_bookstore_spotlight.html"), "utf8");
const studioData = fs.readFileSync(path.resolve("data/studio.yaml"), "utf8");
const studioTemplate = fs.readFileSync(path.resolve("layouts/studio/single.html"), "utf8");
const studioScript = fs.readFileSync(path.resolve("assets/js/studio-inquiry.js"), "utf8");
const jackStrattonEssay = fs.readFileSync(
  path.resolve("content/essays/jack-stratton-and-the-vulfpeck-model.md"),
  "utf8"
);
const directOffers = fs.readFileSync(path.resolve("layouts/partials/shop/direct-offers.html"), "utf8");
const kindleButton = fs.readFileSync(path.resolve("layouts/partials/shop/kindle-button.html"), "utf8");
const shopList = fs.readFileSync(path.resolve("layouts/shop/list.html"), "utf8");
const shopSingle = fs.readFileSync(path.resolve("layouts/shop/single.html"), "utf8");
const epubCheckoutScript = fs.readFileSync(path.resolve("assets/js/epub-checkout.js"), "utf8");
const bookstoreData = fs.readFileSync(path.resolve("data/bookstore.yaml"), "utf8");
const analyticsScript = fs.readFileSync(path.resolve("assets/js/analytics.js"), "utf8");
const homeImprintStatement = fs.readFileSync(path.resolve("layouts/partials/home_imprint_statement.html"), "utf8");
const homeSelectedCollections = fs.readFileSync(path.resolve("layouts/partials/home_selected_collections.html"), "utf8");
const entryThreads = fs.readFileSync(path.resolve("layouts/partials/entry_threads.html"), "utf8");
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

  assert.match(masthead, /"label" "Studio"[\s\S]*?"group" "direct"[\s\S]*?"mobilePrimary" true[\s\S]*?"analyticsSourceSlot" "primary_nav_studio"/);
  assert.match(masthead, /"label" "Bookstore"[\s\S]*?"group" "direct"[\s\S]*?"mobilePrimary" false[\s\S]*?"analyticsSourceSlot" "primary_nav_bookstore"/);
  assert.ok(masthead.indexOf('"label" "Studio"') < masthead.indexOf('"label" "Bookstore"'));
  assert.match(masthead, /"label" "About"[\s\S]*?"group" "direct"[\s\S]*?"mobilePrimary" false/);
  assert.match(masthead, /"label" "Support"[\s\S]*?"group" "direct"[\s\S]*?"analyticsSourceSlot" "primary_nav_support"/);
  assert.match(masthead, /\$currentPath := \.RelPermalink/);
  assert.match(masthead, /\$isArchivePage := eq \$currentPath "\/archive\/"/);
  assert.match(masthead, /\$inArchiveSection := or \$isArchivePage \(eq \.Section "archive"\) \(eq \.Section "essays"\) \(eq \.Section "syd-and-oliver"\)/);
  assert.match(masthead, /\$isStudioPage := eq \$currentPath "\/studio\/"/);
  assert.match(masthead, /\$inStudioSection := or \$isStudioPage \(eq \.Section "studio"\)/);
  assert.match(masthead, /\$isBookstorePage := eq \$currentPath "\/shop\/"/);
  assert.match(masthead, /\$inBookstoreSection := or \$isBookstorePage \(eq \.Section "shop"\)/);
  assert.match(masthead, /\$inAboutSection := or \$isAboutPage \(eq \.Section "about"\)/);
  assert.match(masthead, /\$inRandomSection := or \$isRandomPage \(eq \.Section "random"\)/);
  assert.equal((masthead.match(/"currentPage" \$[A-Za-z]/g) || []).length, 12);
  assert.equal((masthead.match(/"currentSection" \$[A-Za-z]/g) || []).length, 12);
  assert.doesNotMatch(masthead, /"current"/);
  assert.match(masthead, /<nav class="nav nav--section-rail" aria-label="Primary" data-primary-nav>/);
  assert.equal((masthead.match(/aria-label="Primary"/g) || []).length, 1);
  assert.match(masthead, /class="nav__desktop"[\s\S]*?>\s*<span>Read<\/span>[\s\S]*?>\s*<span>Explore<\/span>[\s\S]*?range \$directItems/);
  assert.match(masthead, /class="nav__mobile"[\s\S]*?range \$mobilePrimaryItems[\s\S]*?<span>Menu<\/span>/);
  assert.match(masthead, /mobile-nav-read-heading[\s\S]*?mobile-nav-explore-heading[\s\S]*?mobile-nav-imprint-heading/);
  assert.match(masthead, /\$mobileMenuItems := where \$navItems "mobilePrimary" false/);
  assert.match(masthead, /\$readCurrent := gt \(len \(where \$readItems "currentSection" true\)\) 0/);
  assert.match(masthead, /\$exploreCurrent := gt \(len \(where \$exploreItems "currentSection" true\)\) 0/);
  assert.match(masthead, /\$mobileMenuCurrent := gt \(len \(where \$mobileMenuItems "currentSection" true\)\) 0/);
  assert.match(masthead, /<span class="visually-hidden">, current section<\/span>/);
  assert.match(masthead, /<span class="visually-hidden">, contains current section<\/span>/);

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
  assert.match(masthead, /<nav class="nav nav--section-rail"[\s\S]*nav-disclosure--read[\s\S]*nav-disclosure--explore[\s\S]*nav-mobile-menu/);
  assert.match(masthead, /\$mastheadVariant := cond \$isHomeMasthead "masthead--full" "masthead--compressed"/);
  assert.match(masthead, /\{\{ if \$isHomeMasthead \}\}[\s\S]*masthead-side-deck--left/);
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
  assert.match(cssRule(css, ".paper-route-toggle"), /min-height:44px;[\s\S]*height:44px;/);
  assert.match(css, /html\.theme-enabled \.theme-toggle\{[\s\S]*display:inline-flex;[\s\S]*\}/);
  assert.match(css, /\.masthead--compressed \.title\{[\s\S]*font-size:clamp\(1\.75rem, 3vw, 2\.35rem\)/);
  assert.match(css, /\.nav__direct-link,[\s\S]*?\.nav-mobile-menu__summary\{[\s\S]*?min-height:44px;/);
  assert.match(css, /\.nav-disclosure__panel\{[\s\S]*?position:absolute;/);
  assert.match(css, /\.nav a\[aria-current="page"\],[\s\S]*?\.nav a\.nav-link--current-section,/);
  assert.match(css, /\.nav-disclosure__link\[aria-current="page"\],[\s\S]*?\.nav-disclosure__link\.nav-link--current-section/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.masthead--editorial \.nav--section-rail\{[\s\S]*?font-size:\.75rem;[\s\S]*?letter-spacing:0;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav__mobile\{[\s\S]*?grid-template-columns:(?:repeat\(4,\s*minmax\(0,\s*1fr\)\)|(?:minmax\(0,\s*(?:\d*\.?\d+)fr\)\s*){4});/);
  assert.match(css, /--nav-mobile-gap:clamp\(2px, 1vw, 4px\);/);
  assert.match(css, /\.nav__mobile-link--archive::after,[\s\S]*?\.nav__mobile-link--collections::after,[\s\S]*?\.nav__mobile-link--studio::after/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav__mobile-link\{[\s\S]*?min-height:44px;/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav-mobile-menu__summary\{[\s\S]*?justify-self:end;[\s\S]*?gap:\.25rem;/);
  assert.doesNotMatch(css, /\.nav-mobile-menu\{(?:(?!\n\s*\}).)*grid-template-columns/s);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.nav-mobile-menu__panel\{[\s\S]*?grid-row:2;/);
  assert.match(css, /@media \(max-width:360px\)\{[\s\S]*\.masthead--full \.title\{[\s\S]*font-size:clamp\(2\.5rem, 12vw, 2\.75rem\)/);
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
  assert.match(jackStrattonEssay, /^version: "1\.3"$/m);
  assert.match(jackStrattonEssay, /^edition: "Fourth web edition"$/m);
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

test("Bob's Almanack proposition is canonical across signup and checkout surfaces", () => {
  for (const expected of [
    'cadence = "Every Saturday"',
    'title = "Bob\'s Almanack"',
    'contents = "Each Saturday\'s issue usually brings four new essays or notes with cartoons, a weekly virtue, one number, one public document, results, records, final bows, obituaries, and one piece worth reprinting."',
    'price_promise = "Bob\'s Almanack will remain free. No ads, ever."',
    'button_label = "Subscribe free"',
    'prompt_label = "Get Bob\'s Almanack every Saturday — free, no ads."',
    'checkout_label = "Send me Bob\'s Almanack every Saturday. It will remain free. No ads, ever."',
    'sample_url = "/almanack/2026-07-25/"',
    'sample_label = "Read a sample issue"',
    'privacy_promise = "Your email goes to Buttondown to deliver and manage Bob\'s Almanack. Outside In Print does not sell or rent subscriber information. Unsubscribe anytime."',
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
  assert.match(homeFrontPage, /home-front-page__lead-action[\s\S]*?partial "newsletter_prompt\.html"[\s\S]*?with \$currentCartoon/);
  assert.match(homeFrontPage, /"sourceSlot" "homepage_bobs_almanack_prompt"/);
  assert.match(homepage, /newsletter-signup--home-ribbon/);
  assert.match(homepage, /"sourceSlot" "homepage_bobs_almanack_offer"/);
  assert.match(homepage, /"anchorID" "bobs-almanack-signup"/);
  assert.match(articleSingle, /"class" "newsletter-signup--article-exit"/);
  assert.match(articleSingle, /"sourceSlot" "article_exit_newsletter"/);
  assert.match(articleSingle, /if \$showCollectionContinuation[\s\S]*?partial "newsletter_prompt\.html"[\s\S]*?"sourceSlot" "article_exit_newsletter_prompt"/);
  assert.match(articleSingle, /"anchorID" "bobs-almanack-signup"/);
  assert.ok(articleSingle.indexOf('partial "newsletter_prompt.html"') < articleSingle.indexOf('partial "collections/reading-path.html"'));
  assert.match(cssRule(css, ".newsletter-prompt a"), /min-height:44px;/);
  assert.match(cssRule(css, ".newsletter-signup[id]"), /scroll-margin-top:6rem;/);
  assert.match(almanackIndex, /noindex: true\s+build:\s+render: always\s+list: never/);
  assert.match(almanackIndexTemplate, /<meta name="robots" content="noindex, follow" \/>/);
  assert.match(almanackIndexTemplate, /<link rel="canonical" href="\{\{ "collections\/bobs-almanack\/" \| absURL \}\}" \/>/);
  assert.match(almanackIndexTemplate, /window\.location\.replace\("\{\{ "collections\/bobs-almanack\/" \| relURL \}\}"\)/);
  assert.match(almanackIssue, /partial "newsletter_signup\.html"/);
  assert.match(almanackIssue, /"class" "newsletter-signup--article-exit page-shell page-shell--wide"/);
  assert.match(almanackIssue, /"sourceSlot" "almanack_issue_exit_newsletter"/);
  assert.equal((almanackIssue.match(/partial "newsletter_signup\.html"/g) || []).length, 1);
  assert.ok(almanackIssue.lastIndexOf("</article>") < almanackIssue.indexOf('partial "newsletter_signup.html"'));

  assert.match(privacyPolicy, /effective_date: "September 1, 2026"/);
  assert.match(privacyPolicy, /standalone Bob's Almanack signup form/);
  assert.match(privacyPolicy, /IP address, browser or device information, and referring page/);
  assert.match(privacyPolicy, /email-client, browser, device, IP-address, or referrer metadata/);
  assert.match(privacyPolicy, /Unsubscribing stops the selected emails but is not the same as deleting subscription records\./);

  const propositionSources = [hugoConfig, homepage, articleSingle, newsletterSignup, directOffers].join("\n");
  assert.doesNotMatch(propositionSources, /Limited time|launch window|No spam|Easy to leave/i);
});

test("contact, bookstore, and Civic Institutions expose the repaired public copy", () => {
  assert.match(contactContent, /For factual corrections, editorial questions, rights inquiries, or reprint requests, email \[support@outsideinprint\.org\]/);
  assert.match(shopContent, /Each is available directly as an Outside In Print EPUB through secure Square checkout\./);
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

test("homepage browse band stays curated and replaces Welcome with Library", () => {
  assert.doesNotMatch(homepage, /<div class="k">(Start|Section|Index|Explore)<\/div>/);
  assert.doesNotMatch(homepage, /card-center/);
  const homeBrowseClasses = classTokensForElement(homepage, /<section\b[^>]*aria-label="Archive navigation"[^>]*>/, "homepage browse");
  for (const token of ["home-browse", "home-browse--utility", "home-browse--home-curated", "page-shell", "page-shell--wide"]) {
    assert.ok(homeBrowseClasses.has(token), `expected homepage browse class token: ${token}`);
  }
  assert.match(homepage, /"page" \(site\.GetPage "\/library"\) "label" "Library"/);
  assert.match(homepage, /"page" \(site\.GetPage "\/gallery"\) "label" "Gallery"/);
  assert.doesNotMatch(homepage, /"label" "Welcome"/);
  assert.doesNotMatch(homepage, /"label" "Feeling curious\?"/);
  assert.match(homepage, /class="home-browse__list"/);
  assert.match(homepage, /home-browse__item-title">\{\{ \$title \}\}<\/div>/);
  assert.doesNotMatch(homepage, /Browse the Archive/);
  assert.doesNotMatch(homepage, /Use Archive, Gallery, Collections, or Library when you want to move beyond the front page\./);
  assert.match(css, /\.home-browse__list\{[\s\S]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /\.card-center\{/);
  assert.match(css, /\.home-browse__item-title\{[\s\S]*font-size:14px;[\s\S]*line-height:1\.45;/);
});

test("homepage composition keeps Studio, the bookstore, motto, collections, signup ribbon, and archive navigation in order", () => {
  assert.match(homeFrontPage, /id="home-front-page-title"/);
  assert.match(homeFrontPage, /partial "home_selected\.html"/);
  assert.match(homeFrontPage, /home_front_page_copy\.html/);
  assert.match(homeFrontPage, /hugo\.Data\.editorial_cartoons/);
  assert.match(homeFrontPage, /\$orderedCartoons := sort \(sort \$cartoons "slug" "asc"\) "date" "desc"/);
  assert.match(homeFrontPage, /\$recentCartoons := slice/);
  assert.match(homeFrontPage, /lt \(len \$recentCartoons\) 2/);
  assert.match(homeFrontPage, /View gallery/);
  assert.match(homeFrontPage, /data-home-cartoon-recent/);
  assert.match(homeFrontPage, /data-home-cartoon-recent-card/);
  assert.match(homeFrontPage, /data-home-cartoon-recent-trigger/);
  assert.match(homeFrontPage, /data-home-cartoon-lightbox-trigger/);
  assert.match(homeFrontPage, /data-home-cartoon-lightbox/);
  assert.match(homeFrontPage, /data-home-cartoon-lightbox-essay/);
  assert.match(homeFrontPage, /querySelectorAll\("\[data-home-cartoon-lightbox-trigger\]"\)/);
  assert.match(homeFrontPage, /triggers\.forEach\(function \(trigger\)/);
  assert.match(homeFrontPage, /editorial\/cartoon-for-page\.html/);
  assert.match(homeFrontPage, /editorial\/cartoon-gallery-link\.html/);
  assert.doesNotMatch(homeFrontPage, /var trigger = document\.querySelector\("\[data-home-cartoon-lightbox-trigger\]"\)/);
  assert.match(homeFrontPage, /imageButton\.addEventListener\("click", closeLightbox\)/);
  assert.doesNotMatch(homeFrontPage, /window\.location\.href/);
  assert.doesNotMatch(homeFrontPage, /cartoon-think-outside-the-box\.png/);
  assert.equal((homeFrontPage.match(/data-home-front-page-region="lead"/g) || []).length, 1);
  assert.equal((homeFrontPage.match(/data-home-front-page-region="secondary"/g) || []).length, 1);
  assert.match(homeFrontPage, /home-front-page__secondary-item/);
  assert.match(homeFrontPage, /home-almanack-divider/);
  assert.match(homeFrontPage, /class="home-almanack home-almanack--lead"/);
  assert.match(homeFrontPage, /home-almanack__ledger/);
  assert.match(homeFrontPage, /home-almanack__ledger-row--number/);
  assert.match(homeFrontPage, /home-almanack__ledger-row--virtue/);
  assert.ok(homeFrontPage.indexOf('data-home-cartoon-recent') < homeFrontPage.indexOf('home-almanack-divider'));
  assert.ok(homeFrontPage.indexOf('home-almanack--lead') < homeFrontPage.indexOf('data-home-front-page-region="secondary"'));
  assert.match(homeFrontPage, /<h1 id="home-front-page-title" class="title visually-hidden">\{\{ site\.Title \}\}<\/h1>/);
  assert.match(homeFrontPage, /<p class="home-front-page__orientation">Independent essays, selected writings, and original books by Robert V\. Ussley<\/p>/);
  assert.match(homeFrontPage, /<section class="home-front-page__stories" aria-labelledby="home-front-page-stories-title">\s*<h2 id="home-front-page-stories-title" class="visually-hidden">Front page stories<\/h2>/);
  assert.ok(homeFrontPage.indexOf('>Front page stories</h2>') < homeFrontPage.indexOf('<h3 class="home-front-page__lead-title">'));
  assert.match(homeFrontPage, /<p id="home-cartoon-lightbox-title" class="cartoon-lightbox__title" data-home-cartoon-lightbox-title><\/p>/);
  assert.doesNotMatch(homeFrontPage, /<h2 id="home-cartoon-lightbox-title"/);
  assert.doesNotMatch(homeFrontPage, />Front Page</);
  assert.doesNotMatch(homeFrontPage, /A curated front page from Outside In Print/);
  assert.doesNotMatch(homeFrontPage, /class="home-manifesto"/);
  assert.doesNotMatch(homeFrontPage, /A digital imprint of essays, reports, dialogues, and literature\./);
  assert.doesNotMatch(homeFrontPage, /Color over the lines\. Read beyond the feed\. Think for yourself\./);
  assert.match(homeFrontPage, /\{\{ \$leadReadLabel \}\} &rarr;/);
  assert.match(homeFrontPage, /\{\{ \$readLabel \}\} &rarr;/);
  assert.match(homeFrontPageCopy, /Latest Essay/);
  assert.match(homeFrontPageCopy, /Latest Affirmation/);
  assert.match(homeFrontPageCopy, /Latest Dialogue/);
  assert.match(homeFrontPageCopy, /Read essay/);
  assert.match(homeFrontPageCopy, /Read affirmation/);
  assert.match(homeFrontPageCopy, /Read dialogue/);

  assert.match(homeBookstore, /site\.GetPage "\/shop"/);
  assert.match(homeBookstore, /first 3 \(sort \.RegularPages "Weight" "asc"\)/);
  assert.match(homeBookstore, /if gt \(len \$books\) 0/);
  assert.match(homeBookstore, /partial "shop\/product-data\.html"/);
  assert.match(homeBookstore, /Books from Outside In Print/);
  assert.match(homeBookstore, /Three Outside In Print EPUB editions at \$9\.99 each, prepared for secure digital delivery\./);
  assert.match(homeBookstore, /Browse the bookstore/);
  assert.match(homeBookstore, /data-analytics-source-slot="homepage_bookstore_promo"/);
  assert.doesNotMatch(homeBookstore, /amazon|kindle|purchase_url|kindle_url|kindle-button|checkout-actions|carousel|autoplay/i);

  assert.match(homeImprintStatement, /class="home-manifesto"/);
  assert.match(homeImprintStatement, /home-manifesto__inner/);
  assert.match(homeImprintStatement, /class="home-manifesto__line"/);
  assert.match(homeImprintStatement, /Ask for the evidence\. Read past the headlines\. Think for yourself\./);
  assert.doesNotMatch(homeImprintStatement, /home-manifesto__line--primary/);
  assert.doesNotMatch(homeImprintStatement, /home-manifesto__line--secondary/);
  assert.doesNotMatch(homeImprintStatement, /A digital imprint of essays, reports, dialogues, and literature\./);
  assert.doesNotMatch(homeImprintStatement, /Color over the lines\. Read beyond the feed\. Think for yourself\./);

  assert.match(homeSelectedCollections, /partial "entry_threads\.html" \./);
  assert.doesNotMatch(homeSelectedCollections, /showArchiveLink/);
  assert.doesNotMatch(homeSelectedCollections, /"source" "homepage"/);

  assert.doesNotMatch(entryThreads, /Start Reading/);
  assert.doesNotMatch(entryThreads, /Check out the collections below\./);
  assert.match(entryThreads, /aria-label="Selected collections"/);
  assert.match(entryThreads, /floods-water-built-environment/);
  assert.match(entryThreads, /modern-bios/);
  assert.match(entryThreads, /moral-religious-philosophical-essays/);
  assert.match(entryThreads, /homepage_entry_thread_start/);
  assert.match(entryThreads, /homepage_entry_thread_collection/);
  assert.doesNotMatch(entryThreads, /start_here_entry_thread_/);
  assert.doesNotMatch(entryThreads, /Browse all collections/);
  assert.doesNotMatch(entryThreads, /showArchiveLink/);

  assert.match(homeStudioOffer, /hugo\.Data\.studio/);
  assert.match(homeStudioOffer, /You have the material\. We make it publishable\./);
  assert.match(homeStudioOffer, /data-analytics-source-slot="homepage_studio_offer"/);
  assert.ok(homepage.indexOf('partial "home_front_page.html"') < homepage.indexOf('partial "home_studio_offer.html"'));
  assert.ok(homepage.indexOf('partial "home_studio_offer.html"') < homepage.indexOf('partial "home_bookstore_spotlight.html"'));
  assert.ok(homepage.indexOf('partial "home_bookstore_spotlight.html"') < homepage.indexOf('partial "home_imprint_statement.html"'));
  assert.ok(homepage.indexOf('partial "home_imprint_statement.html"') < homepage.indexOf('partial "home_selected_collections.html"'));
  assert.ok(homepage.indexOf('partial "home_selected_collections.html"') < homepage.indexOf('partial "newsletter_signup.html"'));
  assert.ok(homepage.indexOf('partial "newsletter_signup.html"') < homepage.indexOf('class="home-browse'));
  assert.match(homepage, /newsletter-signup--home-ribbon/);
  assert.match(homepage, /"sourceSlot" "homepage_bobs_almanack_offer"/);
  assert.doesNotMatch(homepage, /"(?:eyebrow|title|dek|buttonLabel|note)"/);
  assert.match(css, /\.home-bookstore__grid\{[^}]*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);[^}]*\}/);
  assert.match(css, /@media \(max-width:900px\)\{\s*\.home-bookstore__grid\{[^}]*grid-template-columns:1fr;[^}]*\}\s*\.home-bookstore__card\{[^}]*grid-template-columns:8rem minmax\(0, 1fr\);[^}]*\}\s*\}/);
  assert.match(css, /@media \(max-width:420px\)\{\s*\.home-bookstore__card\{[^}]*grid-template-columns:5\.75rem minmax\(0, 1fr\);[^}]*\}\s*\.home-bookstore__cta\{[^}]*width:100%;[^}]*\}\s*\}/);

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
  const studioFieldOrder = ["source_material", "source_size", "intended_reader", "project_subject"]
    .map((name) => studioTemplate.indexOf(`name="${name}"`));
  assert.ok(studioFieldOrder.every((index) => index >= 0), "expected all ordered Studio qualification fields");
  assert.deepEqual(studioFieldOrder, [...studioFieldOrder].sort((left, right) => left - right));
  assert.match(studioTemplate, /You have the material\. We make it ready to publish\./);
  assert.match(studioTemplate, /Fixed scope <span aria-hidden="true">&middot;<\/span> First draft in \{\{ \$turnaroundDays \}\} business days <span aria-hidden="true">&middot;<\/span> One revision/);
  assert.match(studioTemplate, /The \{\{ \$turnaroundDays \}\}-business-day clock starts after three things happen: you approve the written scope, pay the deposit, and send all agreed source material\./);
  assert.match(studioTemplate, /We give you a complete finished file set\. Outside In Print reserves the right to publish the essay on outsideinprint\.org\./);
  assert.match(studioTemplate, /Outside In Print keeps the right to publish the finished essay on outsideinprint\.org\./);
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
  assert.match(studioScript, /Outside In Print will receive your inquiry only if you send the email and it reaches us\./);
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
});

test("homepage editorial layout uses the new manifesto namespace and drops dead start-here hooks", () => {
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
  for (const selector of ["body", ".home-manifesto", ".home-manifesto__inner"]) {
    assert.doesNotMatch(cssRule(css, selector), /repeating-linear-gradient/);
  }
  assert.match(css, /\.home-manifesto\{\s*margin-top:2\.35rem;\s*\}/);
  assert.match(css, /\.home-manifesto__inner\{[\s\S]*padding:1\.08rem 0 1\.02rem;[\s\S]*border-top:1px solid var\(--oip-rule-engraved\);[\s\S]*border-bottom:1px solid var\(--oip-rule-engraved\);/);
  assert.match(css, /\.home-manifesto__inner::before,\s*\.home-manifesto__inner::after\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.home-manifesto__copy\{[\s\S]*max-width:54rem;[\s\S]*text-align:center;/);
  assert.match(css, /\.home-manifesto__line\{[\s\S]*font-size:1\.48rem;[\s\S]*letter-spacing:0;/);
  assert.doesNotMatch(css, /\.home-manifesto__line--primary\{/);
  assert.doesNotMatch(css, /\.home-manifesto__line--secondary\{/);
  assert.match(css, /\.entry-threads__grid\{\s*display:grid;/);
  assert.match(css, /\.entry-threads--home \.entry-threads__grid\{\s*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.newsletter-signup--home-ribbon\{[\s\S]*margin-top:2\.15rem;[\s\S]*border-top:0;/);
  assert.match(css, /\.newsletter-signup--home-ribbon \.newsletter-signup__inner\{[\s\S]*grid-template-columns:minmax\(0, 1fr\) minmax\(18rem, \.86fr\);[\s\S]*background:/);
  assert.match(css, /\.home-browse__list\{[\s\S]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.home-front-page__stories\{\s*display:grid;\s*grid-template-columns:minmax\(0, 1\.65fr\) minmax\(0, 1fr\);/);
  assert.match(cssRule(css, ".home-front-page__orientation"), /max-width:52rem;/);
  assert.match(cssRule(css, ".essays-front__year-link"), /min-width:44px;/);
  assert.match(cssRule(css, ".essays-front__year-link"), /min-height:44px;/);
  assert.match(css, /\.home-front-page__lead\{[\s\S]*border-right:1px solid var\(--oip-rule-standard\);/);
  assert.match(css, /\.home-front-page__secondary-item\{[\s\S]*border-top:1px solid var\(--oip-rule-faint\);/);
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
  assert.match(css, /\.home-almanack-divider\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.home-almanack__ledger\{[\s\S]*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.home-almanack__ledger-row\{[\s\S]*grid-template-columns:1fr;[\s\S]*border-left:1px solid rgba\(32,26,21,\.16\);/);
  assert.match(css, /\.editorial-cartoon-recent\{[\s\S]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.editorial-cartoon-recent__item:nth-child\(odd\):not\(:last-child\)::after\{[\s\S]*background:var\(--oip-rule-engraved-rail\);/);
  assert.match(css, /\.editorial-cartoon::before\{[\s\S]*background:var\(--oip-rule-engraved-gradient\);/);
  assert.match(css, /\.editorial-cartoon-recent__trigger\{[\s\S]*aspect-ratio:16 \/ 9;/);
  assert.match(css, /\.essay-cartoon-thumb img\{[\s\S]*aspect-ratio:16 \/ 9;/);
  assert.match(css, /\.home-front-page__secondary-title-row\{[\s\S]*justify-content:space-between;/);
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
  assert.match(css, /@media \(max-width:420px\)\{[\s\S]*\.editorial-cartoon-recent\{\s*grid-template-columns:1fr;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.home-almanack__ledger\{\s*grid-template-columns:1fr;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.home-manifesto__inner\{\s*padding:\.9rem 0 \.85rem;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.newsletter-signup--home-ribbon \.newsletter-signup__inner\{\s*grid-template-columns:1fr;/);
  assert.doesNotMatch(css, /\.entry-thread__archive\{/);
  assert.doesNotMatch(css, /\.start-here-page\{/);
  assert.doesNotMatch(css, /\.newsletter-signup--start-here/);
});
