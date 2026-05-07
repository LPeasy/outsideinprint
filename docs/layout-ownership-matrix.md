# Layout Ownership Matrix

This document maps layout ownership for each public route family in the repo.

It separates four concerns that are easy to conflate in this codebase:

1. Route and template selection: config, content path, and Hugo lookup rules decide which template runs.
2. Markup ownership: route templates and partials decide which wrappers, sections, and utility classes exist in the DOM.
3. Visual layout ownership: `assets/css/main.css` decides width, centering, spacing, grid behavior, and most geometry.
4. Dead or under-defined hooks: classes that remain in markup but still do not carry enough explicit layout responsibility.

Dashboard publishing is paused and the dashboard build surface has been removed from this repo.

## Ownership Vocabulary

- `global shell`: applies to most or all routes and constrains the outer page frame.
- `shared partial`: shared markup used by multiple route families; a route assembles it but does not fully own it.
- `route-owned`: the route family has a dedicated template and/or dedicated CSS namespace that materially defines layout.
- `dead/under-defined hook`: a class or wrapper exists in markup, but ownership is still too weak to count as explicit layout control.

## Core Layout Owners

| File | Responsibility | Ownership type |
| --- | --- | --- |
| `hugo.toml` | Main-site route family selection via section structure and permalinks. Does not define geometry. | `global shell` for selection only |
| `layouts/_default/baseof.html` | Global page frame: `<div class="wrap">`, masthead/footer inclusion, `<main id="main-content">`, shared CSS asset load, and analytics partial. | `global shell` |
| `layouts/partials/masthead.html` | Editorial site header and primary nav for most public routes. | `global shell` |
| `assets/css/main.css` | Nearly all actual width, spacing, alignment, grid, and panel geometry for the public site. | `global shell` plus most visual ownership |
| `layouts/partials/journey_links.html` | Shared next-step nav markup used by multiple route families. | `shared partial` |
| `layouts/partials/discovery/page-list-item.html` | Shared row markup for archive lists and collection detail entries. | `shared partial` |
| `layouts/partials/discovery/collection-card.html` | Shared item/card markup for collection listings. | `shared partial` |
| `layouts/partials/newsletter_signup.html` | Shared newsletter module markup used on the homepage and selected page routes. Article singles now exit through a quiet newsletter link instead of the full signup box. | `shared partial` |

## Findings

- Layout geometry is still centralized in `assets/css/main.css`, but the cleanup removed several misleading route hooks and promoted real owners in their place.
- Single-page article ownership is now intentionally centered on `piece*`, `piece-fleuron`, `piece-title-block`, `piece-media-plate*`, `piece-record-rail*`, `article-publication-record*`, `journey-links--article-exit`, and the expanded `reading-path*` namespace. The dead generic wrappers `single-page`, `single-page--imported`, `single-content`, and the article-level `running-header*` output were removed, and the separate mounted collection-membership block is no longer part of the active article flow.
- The article-exit continuation zone now owns `reading-path__header`, `reading-path__actions`, `reading-path__preview`, `reading-path__preview-item`, and `reading-path__archive-links` as explicit route-level hooks.
- `/archive/` now owns the canonical long-form archive shell through `layouts/archive/list.html` and the `essays-front*` namespace, while `/syd-and-oliver/` reuses that same shell as a filtered archive view.
- `/essays/` is now a legacy redirect-only alias rather than an archive shell.
- Collections, Gallery, and Library now share a shallow `section-front*` opening shell that borrows the Archive route's smoked-paper framing without inheriting archive-specific month/year structure.
- Collections now own their inner structure explicitly through the `collections-broadsheet*` directory, neutral `collection-record*` rows, and the collection-detail `collection-section*` namespace. The visible collection pages no longer mount the old `collection-progress*` panel, visited-row hooks, card-grid directory, or per-collection room skin.
- `/about/` now owns an imprint-first route shell through `section-front--about` and `about-route*`, while still reusing shared `journey_links` navigation and `piece-body` typography for the reading map and prose body.
- `/authors/robert-v-ussley/` now owns a portrait-led author shell through `section-front--author` and `author-route*`, while still reusing shared `journey_links` navigation for the route-based reading map.
- Remaining ambiguity is concentrated in older homepage secondary wrappers and `library-group`, which still rely more on shared flow and generic `.d` / `.m` text styles than on dedicated layout selectors.

## Route Matrix

| Route family | Routes | Route selection | Primary template | Major partials / markup contributors | CSS layout owners | Ownership classification | Notable gaps / ambiguity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Global shell | All public routes | `hugo.toml` plus Hugo lookup to `layouts/_default/baseof.html` | `layouts/_default/baseof.html` | `layouts/partials/masthead.html`, `layouts/partials/footer.html`, `layouts/partials/analytics.html` | `.wrap`, `.masthead`, `.masthead--editorial`, `.masthead--sticky`, `.nav`, `.nav--section-rail`, responsive nav rules in `assets/css/main.css` | `global shell` | Outer shell ownership is strong, but route shells can only narrow content inside `.wrap`; they do not own the page frame. |
| Homepage | `/` | Hugo home route resolves to `layouts/index.html` | `layouts/index.html` | `layouts/partials/home_front_page.html`, `layouts/partials/home_imprint_statement.html`, `layouts/partials/home_selected_collections.html`, `layouts/partials/newsletter_signup.html`, `layouts/partials/discovery/page-list-item.html`, `layouts/partials/discovery/collection-card.html` | `.home-manifesto`, `.home-manifesto__inner`, `.home-manifesto__copy`, `.home-manifesto__line`, `.home-almanack`, `.home-almanack-divider`, `.home-almanack__ledger`, `.home-front-page__stories`, `.home-front-page__lead`, `.home-front-page__secondary-kicker`, `.home-front-page__secondary-title a`, `.home-front-page__secondary-meta`, `.entry-threads`, `.entry-threads__grid`, `.home-browse__list`, `.newsletter-signup--home-ribbon`, shared `.item`, shared `.page-shell--wide`, shared `.page-shell--feature`, shared `.page-shell--grid` | Route composition is `route-owned`; most actual geometry is shared CSS and shared partial markup | `home-front-page__secondary`, `home-front-page__secondary-item`, `home-front-page__secondary-dek`, and `home-front-page__secondary-action` still rely on container flow and shared text utilities rather than dedicated selectors. |
| About route | `/about/` | `content/about/index.md` resolves to `layouts/about/single.html` | `layouts/about/single.html` | `layouts/partials/journey_links.html` | `.section-front`, `.section-front--about`, `.section-front__header`, `.section-front__body`, `.about-route`, `.about-route__eyebrow`, `.about-route__artifact`, `.about-route__artifact-panel`, `.about-route__artifact-kicker`, `.about-route__artifact-title`, `.about-route__artifact-dek`, `.about-route__record`, `.about-route__record-title`, `.about-route__record-rows`, `.about-route__record-row`, `.about-route__record-label`, `.about-route__record-value`, `.about-route__body`, `.about-route__reading-map`, `.about-route__reading-map-header`, `.about-route__reading-map-copy`, `.about-route__journey`, shared `.page-header`, shared `.piece-body`, shared `.journey-links--page`, shared `.page-shell--wide`, shared `.page-shell--reading` | Route-owned imprint page layered on the shared top-zone shell and journey-links partial | The prose column intentionally inherits shared `piece-body` typography rather than introducing a second body-text system for this route. |
| Author route | `/authors/robert-v-ussley/` | `content/authors/robert-v-ussley/index.md` keeps `layout: "dossier"` so Hugo resolves to `layouts/authors/dossier.html` | `layouts/authors/dossier.html` | `layouts/partials/journey_links.html` | `.section-front`, `.section-front--author`, `.section-front__header`, `.section-front__body`, `.author-route`, `.author-route__profile`, `.author-route__portrait`, `.author-route__intro`, `.author-route__summary`, `.author-route__bio`, `.author-route__reading-map`, `.author-route__reading-map-header`, `.author-route__reading-map-copy`, `.author-route__journey`, shared `.page-header`, shared `.journey-links--page`, shared `.page-shell--wide` | Route-owned portrait-led author shell layered on the shared top-zone shell and journey-links partial | The route keeps `ProfilePage` metadata and portrait-backed social imagery while dropping the retired dossier sub-sections and inline style variant. |
| Archive shell | `/archive/`, `/syd-and-oliver/` | Section `_index.md` files plus section-specific template lookup before `_default` | `layouts/archive/list.html`, `layouts/syd-and-oliver/list.html` | `layouts/partials/archive/render-list.html`, `layouts/partials/archive/resolve-pages.html`, `layouts/partials/discovery/page-list-item.html` | `.essays-front`, `.essays-front__masthead`, `.essays-front__stats`, `.essays-front__year-nav`, `.essays-front__year-jumps`, `.essays-front__year-link`, `.essays-front__archive`, `.essays-front__month`, `.essays-front__month-title`, `.essays-front__month-list`, shared `.item-kicker`, shared `.item-kicker--collection`, shared `.page-header`, shared `.page-intro`, shared `.page-shell--reading` | Route-owned archive shell layered on shared row partials and global page shells | Archive rows still reuse the shared `.item` structure by design, so row-level title/meta/summary behavior remains partly shared even though collection taxonomy moves into a route-specific kicker treatment. |
| Essays redirect alias | `/essays/` | Section `_index.md` plus section-specific template lookup before `_default` | `layouts/essays/list.html` | none; standalone redirect document | none; redirect-only HTML with no route-owned CSS namespace | Redirect alias only | Intentionally not part of the live archive-shell geometry. |
| Section landing family | `/working-papers/` | Section `_index.md` files plus `hugo.toml` permalinks; Hugo uses `layouts/_default/list.html` | `layouts/_default/list.html` | `layouts/partials/journey_links.html`, `layouts/partials/discovery/page-list-item.html` | `.page-header`, `.page-intro`, `.journey-links`, `.journey-links--page`, `.item`, `.page-shell--wide`, `.page-shell--reading` | Shared route family template plus shared partials and shared CSS; no per-section layout namespace | No section-specific CSS namespace exists for these list routes. They differ mostly by content and route data, not by route-owned layout rules. |
| Single article family | `/essays/:slug/`, `/syd-and-oliver/:slug/`, future `/working-papers/:slug/` | Regular content pages plus `hugo.toml` permalinks; Hugo uses `layouts/_default/single.html` | `layouts/_default/single.html` | `layouts/partials/journey_links.html`, `layouts/partials/render_article_body.html`, `layouts/_default/_markup/render-image.html`, `layouts/partials/article/plate-lightbox.html`, `layouts/partials/collections/reading-path.html`, `layouts/partials/collections/reading-progress-script.html` | `.piece`, `.piece-header`, `.piece-header-composition`, `.piece-fleuron`, `.piece-title-block`, `.piece-media-plate`, `.piece-media-plate--side`, `.piece-media-plate__trigger`, `.piece-hero`, `.piece-portrait-plate`, `.piece-record-rail`, `.piece-record-rail__item`, `.piece-record-rail__item--collection`, `.article-plate-lightbox`, `.piece-body`, `.piece-aftermatter`, `.journey-links--article-exit`, `.imprint-header`, `.article-publication-record`, `.article-publication-record__section`, `.article-publication-record__label`, `.reading-path`, `.reading-path__header`, `.reading-path__eyebrow`, `.reading-path__title`, `.reading-path__meta`, `.reading-path__status`, `.reading-path__actions`, `.reading-path__preview`, `.reading-path__preview-item`, `.reading-path__archive-links`, `.dialogue-turn`, `.dialogue-turn__speaker`, `.dialogue-turn__text`, article-body selectors such as `.article-embed`, `.article-source`, `.article-aftermatter-heading`, `.piece-body figure`, `.piece-body img`, `.article-lightbox-image` | Strong route-owned article shell layered on shared partials | The route intentionally relies on editorial-form variants, a compact collection boundary inside the article record rail, the article-exit continuation zone, and shared article components rather than collection-wide skins or a generic single-page wrapper namespace. |
| Collections index | `/collections/` | `content/collections/_index.md` plus section-specific template lookup | `layouts/collections/list.html` | `layouts/partials/discovery/collection-card.html` | `.section-front`, `.section-front--collections`, `.section-front__header`, `.page-header`, `.page-intro`, `.collections-broadsheet__summary`, `.collections-broadsheet`, `.collections-broadsheet__section`, `.collections-broadsheet__section-header`, `.collections-broadsheet__section-title`, `.collections-broadsheet__section-meta`, `.collections-broadsheet__section-intro`, `.collections-broadsheet__records`, `.collection-record`, `.collection-record__meta`, `.collection-record__title`, `.collection-record__description`, `.collection-record__scope`, `.collection-record__start`, `.page-shell--wide`, `.page-shell--grid` | Route-owned broadsheet directory sitting on a shared top-zone shell and neutral collection-row partial | The route no longer renders the guide-card pair, a card grid, room-echo card skins, or top-level journey links. |
| Gallery | `/gallery/` | `content/gallery/_index.md` plus section-specific template lookup | `layouts/gallery/list.html` | none beyond inline spotlight/archive markup in the route template | `.section-front`, `.section-front--gallery`, `.section-front__header`, `.section-front__body`, `.cartoon-gallery-spotlight`, `.cartoon-gallery-spotlight__meta`, `.cartoon-gallery-spotlight__figure`, `.cartoon-gallery`, `.cartoon-gallery__grid`, `.cartoon-gallery__item`, `.page-shell--wide` | Route-owned gallery shell with a shared top-zone wrapper around the current-cartoon spotlight | The spotlight and archive grid intentionally remain one route template rather than separate partial owners. |
| Collection detail | `/collections/:slug/` | Collection content pages plus `hugo.toml` collection permalinks | `layouts/collections/single.html` | `layouts/partials/discovery/page-list-item.html`, `layouts/partials/discovery/collection-card.html`, `layouts/partials/journey_links.html` | `.collection-section`, `.collection-section__header`, `.collection-section__ledger`, `.collection-section__lead`, `.collection-section__contents`, `.collection-section__related`, `.collection-section__heading`, `.collection-section__items`, `.collection-section__item`, `.collection-section__record`, `.collection-section__lead-record`, `.collection-section__related-list`, `.collection-section__next`, shared `.item`, `.page-shell--grid`, `.journey-links--page` | Route-owned newspaper section front layered on shared discovery partials | The promoted Start Here entry is omitted from the contents list, related collections render as neutral broadsheet rows, and the page no longer mounts visible Reading Progress UI. |
| Library | `/library/` | `content/library/_index.md` plus section-specific template lookup | `layouts/library/list.html` | `layouts/partials/discovery/page-list-item.html` | `.section-front`, `.section-front--library`, `.section-front__header`, `.section-front__body`, `.page-header`, `.page-intro`, `.library-search`, `.library-search-input`, `.library-empty`, `.library-group > .m`, shared `.item`, `.page-shell--wide`, `.page-shell--feature`, `.page-shell--reading` | Route-owned template with a shared top-zone shell and shared search/list primitives | `library-group` itself still has very little explicit CSS ownership; most grouped-results spacing comes from the page shells, document flow, and the route-level top-zone wrapper. |
| Random | `/random/` | `content/random/index.md` resolves to `layouts/random/single.html` | `layouts/random/single.html` | None | shared `.item`, `.page-shell--reading` | Minimal route-owned template using generic shared layout primitives | No dedicated route CSS. Visual behavior is still a generic fallback row wrapped around a redirect script. |
## Removed Layout Hooks

These hooks were removed rather than left behind as decorative aliases:

- `single-page`
- `single-content`
- `single-page--imported`
## Remaining Dead Or Under-Defined Hooks

These hooks still exist in live markup but do not yet carry strong explicit layout ownership:

- `home-front-page__secondary`
- `home-front-page__secondary-item`
- `home-front-page__secondary-dek`
- `home-front-page__secondary-action`
- `library-group`

## Verification Checklist

- Confirm route selection:
  - Read `hugo.toml` for main-site permalinks.
- Confirm generic single-hook cleanup:
  - Open `layouts/_default/single.html` and verify `single-page`, `single-page--imported`, and `single-content` are gone.
- Confirm homepage manifesto ownership:
  - Open `layouts/partials/home_imprint_statement.html` and verify it emits `home-manifesto`, `home-manifesto__inner`, `home-manifesto__copy`, and `home-manifesto__line` around the single typeset motto line.
  - Open `layouts/partials/home_front_page.html` and verify the Bob's Almanack teaser emits `home-almanack`, `home-almanack__ledger`, and the cartoon-to-Almanack divider.
  - Open `layouts/index.html` and verify the homepage signup uses `newsletter-signup--home-ribbon`.
  - Compare those selectors against `assets/css/main.css`.
- Confirm About route ownership:
  - Compare `layouts/about/single.html` against `assets/css/main.css`.
  - Verify `section-front--about`, `about-route`, `about-route__artifact`, `about-route__record`, and `about-route__journey` all have explicit CSS owners.
- Confirm author route ownership:
  - Compare `layouts/authors/dossier.html` against `assets/css/main.css`.
  - Verify `section-front--author`, `author-route`, `author-route__profile`, `author-route__portrait`, `author-route__summary`, `author-route__bio`, `author-route__reading-map`, and `author-route__journey` all have explicit CSS owners.
- Confirm collection ownership:
  - Compare `layouts/collections/list.html` against `assets/css/main.css`.
  - Verify `collections-broadsheet`, `collections-broadsheet__summary`, `collections-broadsheet__section`, `collections-broadsheet__section-title`, `collections-broadsheet__section-meta`, `collections-broadsheet__section-intro`, `collections-broadsheet__records`, `collection-record`, `collection-record__meta`, `collection-record__title`, `collection-record__description`, `collection-record__scope`, and `collection-record__start` all have explicit CSS owners.
  - Compare `layouts/collections/single.html` and `layouts/partials/collections/page-membership-block.html` against `assets/css/main.css`.
  - Verify `collection-section`, `collection-section__header`, `collection-section__ledger`, `collection-section__lead`, `collection-section__contents`, `collection-section__related`, `collection-section__heading`, `collection-section__items`, `collection-section__item`, `collection-section__record`, `collection-section__lead-record`, `collection-section__related-list`, and `collection-section__next` all have explicit CSS owners.
- Confirm archive-shell ownership:
  - Compare `layouts/archive/list.html` against `assets/css/main.css`.
  - Verify `essays-front`, `essays-front__masthead`, `essays-front__stats`, `essays-front__year-nav`, `essays-front__year-jumps`, `essays-front__year-link`, `essays-front__archive`, `essays-front__month`, `essays-front__month-title`, and `essays-front__month-list` all have explicit CSS owners.
- Confirm shared section-opening shell ownership:
  - Compare `layouts/collections/list.html`, `layouts/gallery/list.html`, and `layouts/library/list.html` against `assets/css/main.css`.
  - Verify `section-front`, `section-front__header`, and `section-front__body` all have explicit CSS owners, and that Collections, Gallery, and Library each attach the correct route modifier.
- Confirm reading-path ownership:
  - Compare `layouts/_default/single.html` and `layouts/partials/collections/reading-path.html` against `assets/css/main.css`.
  - Verify `reading-path`, `reading-path__eyebrow`, `reading-path__title`, `reading-path__meta`, `reading-path__status`, `reading-path__actions`, `reading-path__preview`, and `reading-path__archive-links` all have explicit CSS owners.
- Confirm article record-rail ownership:
  - Compare `layouts/_default/single.html` against `assets/css/main.css`.
  - Verify `piece-fleuron`, `piece-title-block`, `piece-media-plate`, `piece-media-plate__trigger`, `piece-record-rail`, and `piece-record-rail__item--collection` all have explicit CSS owners.
- Confirm matrix accuracy:
  - Search `assets/css/main.css` for every selector named in the matrix rows.
  - Search `layouts/**` for every hook listed under `Remaining Dead Or Under-Defined Hooks`.
- Run contract tests when Node is available:
  - `.\tools\bin\generated\node.cmd --test tests/layout_ownership_contract.test.mjs`
- Optional render check when Hugo is available:
  - `.\tools\bin\generated\hugo.cmd --gc --minify`
  - Spot-check `/`, `/start-here/`, `/archive/`, `/syd-and-oliver/`, one essay single, `/collections/`, one collection detail, `/library/`, and `/random/`.
