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
| `layouts/partials/newsletter_signup.html` | Shared newsletter module markup used on singles, the homepage, and other page routes. | `shared partial` |

## Findings

- Layout geometry is still centralized in `assets/css/main.css`, but the cleanup removed several misleading route hooks and promoted real owners in their place.
- Single-page article ownership is now intentionally centered on `piece*`, `piece--collection-accent*`, `piece-collection-context*`, `running-header*`, `journey-links--article`, the expanded `reading-path*` namespace, and newsletter modifiers. The dead generic wrappers `single-page`, `single-page--imported`, and `single-content` were removed, and the separate mounted collection-membership block is no longer part of the active article flow.
- The article-exit continuation zone now owns `reading-path__header`, `reading-path__actions`, `reading-path__preview`, `reading-path__preview-item`, and `reading-path__archive-links` as explicit route-level hooks.
- `/archive/` now owns the canonical long-form archive shell through `layouts/archive/list.html` and the `essays-front*` namespace, while `/syd-and-oliver/` reuses that same shell as a filtered archive view.
- `/essays/` is now a legacy redirect-only alias rather than an archive shell.
- Collections, Gallery, and Library now share a shallow `section-front*` opening shell that borrows the Archive route's smoked-paper framing without inheriting archive-specific month/year structure.
- Collections now own their inner structure explicitly through `collections-directory*`, the index-only `collections-directory__guide*` lane-guide surface, `collection-grid`, `collection-card`, `collection-card__eyebrow`, `collection-card__description`, `collection-card__meta-line`, `collection-card__start-here`, `collection-meta`, `collection-progress*`, `collection-items`, `collection-item-note`, `collection-item-state`, `collection-pill`, `collection-pill--visited`, `collection-start-here`, `collection-membership__*`, and the collection-detail `collection-room*` namespace, including `collection-room__eyebrow`, `collection-room__summary`, and `collection-room__section-intro`.
- `/about/` now owns an imprint-first route shell through `section-front--about` and `about-route*`, while still reusing shared `journey_links` navigation and `piece-body` typography for the reading map and prose body.
- `/authors/robert-v-ussley/` now owns a portrait-led author shell through `section-front--author` and `author-route*`, while still reusing shared `journey_links` navigation for the route-based reading map.
- Remaining ambiguity is concentrated in older homepage secondary wrappers and `library-group`, which still rely more on shared flow and generic `.d` / `.m` text styles than on dedicated layout selectors.

## Route Matrix

| Route family | Routes | Route selection | Primary template | Major partials / markup contributors | CSS layout owners | Ownership classification | Notable gaps / ambiguity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Global shell | All public routes | `hugo.toml` plus Hugo lookup to `layouts/_default/baseof.html` | `layouts/_default/baseof.html` | `layouts/partials/masthead.html`, `layouts/partials/footer.html`, `layouts/partials/analytics.html` | `.wrap`, `.masthead`, `.masthead--editorial`, `.masthead--sticky`, `.nav`, `.nav--section-rail`, responsive nav rules in `assets/css/main.css` | `global shell` | Outer shell ownership is strong, but route shells can only narrow content inside `.wrap`; they do not own the page frame. |
| Homepage | `/` | Hugo home route resolves to `layouts/index.html` | `layouts/index.html` | `layouts/partials/home_front_page.html`, `layouts/partials/home_imprint_statement.html`, `layouts/partials/home_selected_collections.html`, `layouts/partials/newsletter_signup.html`, `layouts/partials/discovery/page-list-item.html`, `layouts/partials/discovery/collection-card.html` | `.home-manifesto`, `.home-manifesto__inner`, `.home-manifesto__copy`, `.home-manifesto__line`, `.home-manifesto__line--primary`, `.home-manifesto__line--secondary`, `.home-front-page__stories`, `.home-front-page__lead`, `.home-front-page__secondary-label`, `.home-front-page__secondary-kicker`, `.home-front-page__secondary-title a`, `.home-front-page__secondary-meta`, `.entry-threads`, `.entry-threads__header`, `.entry-threads__grid`, `.home-browse__list`, `.newsletter-signup--home-signoff`, shared `.item`, shared `.page-shell--wide`, shared `.page-shell--feature`, shared `.page-shell--grid` | Route composition is `route-owned`; most actual geometry is shared CSS and shared partial markup | `home-front-page__secondary`, `home-front-page__secondary-item`, `home-front-page__secondary-dek`, and `home-front-page__secondary-action` still rely on container flow and shared text utilities rather than dedicated selectors. |
| About route | `/about/` | `content/about/index.md` resolves to `layouts/about/single.html` | `layouts/about/single.html` | `layouts/partials/journey_links.html` | `.section-front`, `.section-front--about`, `.section-front__header`, `.section-front__body`, `.about-route`, `.about-route__eyebrow`, `.about-route__artifact`, `.about-route__artifact-panel`, `.about-route__artifact-kicker`, `.about-route__artifact-title`, `.about-route__artifact-dek`, `.about-route__record`, `.about-route__record-title`, `.about-route__record-rows`, `.about-route__record-row`, `.about-route__record-label`, `.about-route__record-value`, `.about-route__body`, `.about-route__reading-map`, `.about-route__reading-map-header`, `.about-route__reading-map-copy`, `.about-route__journey`, shared `.page-header`, shared `.piece-body`, shared `.journey-links--page`, shared `.page-shell--wide`, shared `.page-shell--reading` | Route-owned imprint page layered on the shared top-zone shell and journey-links partial | The prose column intentionally inherits shared `piece-body` typography rather than introducing a second body-text system for this route. |
| Author route | `/authors/robert-v-ussley/` | `content/authors/robert-v-ussley/index.md` keeps `layout: "dossier"` so Hugo resolves to `layouts/authors/dossier.html` | `layouts/authors/dossier.html` | `layouts/partials/journey_links.html` | `.section-front`, `.section-front--author`, `.section-front__header`, `.section-front__body`, `.author-route`, `.author-route__profile`, `.author-route__portrait`, `.author-route__intro`, `.author-route__summary`, `.author-route__bio`, `.author-route__reading-map`, `.author-route__reading-map-header`, `.author-route__reading-map-copy`, `.author-route__journey`, shared `.page-header`, shared `.journey-links--page`, shared `.page-shell--wide` | Route-owned portrait-led author shell layered on the shared top-zone shell and journey-links partial | The route keeps `ProfilePage` metadata and portrait-backed social imagery while dropping the retired dossier sub-sections and inline style variant. |
| Archive shell | `/archive/`, `/syd-and-oliver/` | Section `_index.md` files plus section-specific template lookup before `_default` | `layouts/archive/list.html`, `layouts/syd-and-oliver/list.html` | `layouts/partials/archive/render-list.html`, `layouts/partials/archive/resolve-pages.html`, `layouts/partials/discovery/page-list-item.html` | `.essays-front`, `.essays-front__masthead`, `.essays-front__stats`, `.essays-front__year-nav`, `.essays-front__year-jumps`, `.essays-front__year-link`, `.essays-front__archive`, `.essays-front__month`, `.essays-front__month-title`, `.essays-front__month-list`, shared `.item-kicker`, shared `.item-kicker--collection`, shared `.page-header`, shared `.page-intro`, shared `.page-shell--reading` | Route-owned archive shell layered on shared row partials and global page shells | Archive rows still reuse the shared `.item` structure by design, so row-level title/meta/summary behavior remains partly shared even though collection taxonomy moves into a route-specific kicker treatment. |
| Essays redirect alias | `/essays/` | Section `_index.md` plus section-specific template lookup before `_default` | `layouts/essays/list.html` | none; standalone redirect document | none; redirect-only HTML with no route-owned CSS namespace | Redirect alias only | Intentionally not part of the live archive-shell geometry. |
| Section landing family | `/working-papers/` | Section `_index.md` files plus `hugo.toml` permalinks; Hugo uses `layouts/_default/list.html` | `layouts/_default/list.html` | `layouts/partials/journey_links.html`, `layouts/partials/discovery/page-list-item.html` | `.page-header`, `.page-intro`, `.journey-links`, `.journey-links--page`, `.item`, `.page-shell--wide`, `.page-shell--reading` | Shared route family template plus shared partials and shared CSS; no per-section layout namespace | No section-specific CSS namespace exists for these list routes. They differ mostly by content and route data, not by route-owned layout rules. |
| Single article family | `/essays/:slug/`, `/syd-and-oliver/:slug/`, future `/working-papers/:slug/` | Regular content pages plus `hugo.toml` permalinks; Hugo uses `layouts/_default/single.html` | `layouts/_default/single.html` | `layouts/partials/running_header.html`, `layouts/partials/journey_links.html`, `layouts/partials/render_article_body.html`, `layouts/_default/_markup/render-image.html`, `layouts/partials/collections/reading-path.html`, `layouts/partials/read_next.html`, `layouts/partials/newsletter_signup.html`, `layouts/partials/collections/reading-progress-script.html` | `.piece`, `.piece--collection-accent`, `.piece-header`, `.piece-collection-context`, `.piece-collection-context__eyebrow`, `.piece-collection-context__title`, `.piece-collection-context__meta`, `.piece-body`, `.piece-aftermatter`, `.running-header`, `.running-header__inner`, `.journey-links--article`, `.imprint-header`, `.citation`, `.reading-path`, `.reading-path__header`, `.reading-path__eyebrow`, `.reading-path__title`, `.reading-path__meta`, `.reading-path__status`, `.reading-path__actions`, `.reading-path__preview`, `.reading-path__preview-item`, `.reading-path__archive-links`, `.newsletter-signup--page`, `.newsletter-signup__inner`, `.read-next`, `.read-next__inner`, article-body selectors such as `.article-embed`, `.article-source`, `.article-aftermatter-heading`, `.piece-body figure`, `.piece-body img` | Strong route-owned article shell layered on shared partials | The route intentionally relies on `piece*`, the light primary-collection accent layer, the article-exit continuation zone, and shared article components rather than a generic single-page wrapper namespace. |
| Collections index | `/collections/` | `content/collections/_index.md` plus section-specific template lookup | `layouts/collections/list.html` | `layouts/partials/discovery/collection-card.html` | `.section-front`, `.section-front--collections`, `.section-front__header`, `.page-header`, `.page-intro`, `.collections-directory__summary`, `.collections-directory__guide`, `.collections-directory__guide-card`, `.collections-directory__guide-kicker`, `.collections-directory__guide-title`, `.collections-directory__guide-copy`, `.collections-directory__guide-meta`, generic `.grid`, generic `.card`, `.collections-directory`, `.collections-directory__group`, `.collections-directory__group-header`, `.collections-directory__group-title`, `.collections-directory__group-meta`, `.collections-directory__group-intro`, `.collections-directory__grid`, `.collection-grid`, `.collection-card`, `.collection-card__eyebrow`, `.collection-card__description`, `.collection-card__meta-line`, `.collection-card__start-here`, `.collection-meta`, `.page-shell--wide`, `.page-shell--grid` | Route-owned unified card directory sitting on a shared top-zone shell plus a route-owned lane guide, shared grid/card primitives, and collection-specific card modifiers | Card framing still inherits from shared `.card`, by design; the route no longer splits featured cards from a neutral row index and no longer exposes a top-level journey-links block. |
| Gallery | `/gallery/` | `content/gallery/_index.md` plus section-specific template lookup | `layouts/gallery/list.html` | none beyond inline spotlight/archive markup in the route template | `.section-front`, `.section-front--gallery`, `.section-front__header`, `.section-front__body`, `.cartoon-gallery-spotlight`, `.cartoon-gallery-spotlight__meta`, `.cartoon-gallery-spotlight__figure`, `.cartoon-gallery`, `.cartoon-gallery__grid`, `.cartoon-gallery__item`, `.page-shell--wide` | Route-owned gallery shell with a shared top-zone wrapper around the current-cartoon spotlight | The spotlight and archive grid intentionally remain one route template rather than separate partial owners. |
| Collection detail | `/collections/:slug/` | Collection content pages plus `hugo.toml` collection permalinks | `layouts/collections/single.html` | `layouts/partials/discovery/page-list-item.html`, `layouts/partials/discovery/collection-card.html`, `layouts/partials/journey_links.html`, `layouts/partials/collections/collection-progress.html`, `layouts/partials/collections/reading-progress-script.html` | `.collection-room`, `.collection-room__header`, `.collection-room__eyebrow`, `.collection-room__summary`, `.collection-room__section`, `.collection-room__section--entry`, `.collection-room__section--progress`, `.collection-room__section--items`, `.collection-room__section--related`, `.collection-room__section-intro`, `.page-header`, `.page-intro`, `.collection-progress`, `.collection-progress__summary`, `.collection-progress__actions`, `.collection-progress__note`, `.collection-start-here`, `.collection-items`, `.collection-item`, `.collection-item-note`, `.collection-item-state`, `.collection-item--start-here`, `.collection-pill`, `.collection-pill--visited`, `.collection-membership`, `.collection-membership__*`, shared `.item`, `.page-shell--wide`, `.page-shell--reading`, `.journey-links--page` | Route-owned detail structure layered on shared discovery partials | Related collections still render through the shared collection-card partial, and the room-theme layer is scoped to collection detail pages only. |
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
  - Open `layouts/partials/home_imprint_statement.html` and verify it emits `home-manifesto`, `home-manifesto__inner`, and the two manifesto lines.
  - Compare those selectors against `assets/css/main.css`.
- Confirm About route ownership:
  - Compare `layouts/about/single.html` against `assets/css/main.css`.
  - Verify `section-front--about`, `about-route`, `about-route__artifact`, `about-route__record`, and `about-route__journey` all have explicit CSS owners.
- Confirm author route ownership:
  - Compare `layouts/authors/dossier.html` against `assets/css/main.css`.
  - Verify `section-front--author`, `author-route`, `author-route__profile`, `author-route__portrait`, `author-route__summary`, `author-route__bio`, `author-route__reading-map`, and `author-route__journey` all have explicit CSS owners.
- Confirm collection ownership:
  - Compare `layouts/collections/list.html` against `assets/css/main.css`.
  - Verify `collections-directory`, `collections-directory__summary`, `collections-directory__guide`, `collections-directory__guide-card`, `collections-directory__guide-kicker`, `collections-directory__guide-title`, `collections-directory__guide-copy`, `collections-directory__guide-meta`, `collections-directory__group`, `collections-directory__group-header`, `collections-directory__group-title`, `collections-directory__group-meta`, `collections-directory__group-intro`, `collections-directory__grid`, `collection-grid`, `collection-card`, `collection-card__eyebrow`, `collection-card__description`, `collection-card__meta-line`, `collection-card__start-here`, and `collection-meta` all have explicit CSS owners.
  - Compare `layouts/collections/single.html` and `layouts/partials/collections/page-membership-block.html` against `assets/css/main.css`.
  - Verify `collection-room`, `collection-room__header`, `collection-room__eyebrow`, `collection-room__summary`, `collection-room__section`, `collection-room__section--entry`, `collection-room__section--progress`, `collection-room__section--items`, `collection-room__section--related`, `collection-room__section-intro`, `collection-progress`, `collection-progress__summary`, `collection-progress__actions`, `collection-progress__note`, `collection-items`, `collection-item-note`, `collection-item-state`, `collection-pill`, `collection-pill--visited`, `collection-start-here`, `collection-item--start-here`, and `collection-membership__*` all have explicit CSS owners.
- Confirm archive-shell ownership:
  - Compare `layouts/archive/list.html` against `assets/css/main.css`.
  - Verify `essays-front`, `essays-front__masthead`, `essays-front__stats`, `essays-front__year-nav`, `essays-front__year-jumps`, `essays-front__year-link`, `essays-front__archive`, `essays-front__month`, `essays-front__month-title`, and `essays-front__month-list` all have explicit CSS owners.
- Confirm shared section-opening shell ownership:
  - Compare `layouts/collections/list.html`, `layouts/gallery/list.html`, and `layouts/library/list.html` against `assets/css/main.css`.
  - Verify `section-front`, `section-front__header`, and `section-front__body` all have explicit CSS owners, and that Collections, Gallery, and Library each attach the correct route modifier.
- Confirm reading-path ownership:
  - Compare `layouts/_default/single.html` and `layouts/partials/collections/reading-path.html` against `assets/css/main.css`.
  - Verify `reading-path`, `reading-path__eyebrow`, `reading-path__title`, `reading-path__meta`, `reading-path__status`, `reading-path__actions`, `reading-path__preview`, and `reading-path__archive-links` all have explicit CSS owners.
- Confirm article collection-accent ownership:
  - Compare `layouts/_default/single.html` against `assets/css/main.css`.
  - Verify `piece--collection-accent`, `piece-collection-context`, `piece-collection-context__eyebrow`, `piece-collection-context__title`, and `piece-collection-context__meta` all have explicit CSS owners.
- Confirm matrix accuracy:
  - Search `assets/css/main.css` for every selector named in the matrix rows.
  - Search `layouts/**` for every hook listed under `Remaining Dead Or Under-Defined Hooks`.
- Run contract tests when Node is available:
  - `.\tools\bin\generated\node.cmd --test tests/layout_ownership_contract.test.mjs`
- Optional render check when Hugo is available:
  - `.\tools\bin\generated\hugo.cmd --gc --minify`
  - Spot-check `/`, `/start-here/`, `/archive/`, `/syd-and-oliver/`, one essay single, `/collections/`, one collection detail, `/library/`, and `/random/`.
