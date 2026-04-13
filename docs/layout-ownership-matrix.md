# Layout Ownership Matrix

This document maps layout ownership for each public route family in the repo.

It separates four concerns that are easy to conflate in this codebase:

1. Route and template selection: config, content path, and Hugo lookup rules decide which template runs.
2. Markup ownership: route templates and partials decide which wrappers, sections, and utility classes exist in the DOM.
3. Visual layout ownership: `assets/css/main.css` decides width, centering, spacing, grid behavior, and most geometry.
4. Dead or under-defined hooks: classes that remain in markup but still do not carry enough explicit layout responsibility.

## Ownership Vocabulary

- `global shell`: applies to most or all routes and constrains the outer page frame.
- `shared partial`: shared markup used by multiple route families; a route assembles it but does not fully own it.
- `route-owned`: the route family has a dedicated template and/or dedicated CSS namespace that materially defines layout.
- `dead/under-defined hook`: a class or wrapper exists in markup, but ownership is still too weak to count as explicit layout control.

## Core Layout Owners

| File | Responsibility | Ownership type |
| --- | --- | --- |
| `hugo.toml` | Main-site route family selection via section structure and permalinks. Does not define geometry. | `global shell` for selection only |
| `hugo-dashboard.toml` | Alternate dashboard build, `contentDir = "content-dashboard"`, dashboard site params, and dashboard root route. Does not define geometry. | `global shell` for selection only |
| `layouts/_default/baseof.html` | Global page frame: `<div class="wrap">`, masthead/footer inclusion, `<main id="main-content">`, shared CSS asset load. | `global shell` |
| `layouts/partials/masthead.html` | Editorial site header and primary nav for most public routes. | `global shell` |
| `layouts/partials/masthead_dashboard.html` | Dashboard-specific header/nav in the alternate dashboard build. | `global shell` |
| `assets/css/main.css` | Nearly all actual width, spacing, alignment, grid, and panel geometry for the site and dashboard. | `global shell` plus most visual ownership |
| `layouts/partials/journey_links.html` | Shared next-step nav markup used by multiple route families. | `shared partial` |
| `layouts/partials/discovery/page-list-item.html` | Shared row markup for archive lists and collection detail entries. | `shared partial` |
| `layouts/partials/discovery/collection-card.html` | Shared item/card markup for collection listings. | `shared partial` |
| `layouts/partials/newsletter_signup.html` | Shared newsletter module markup used on singles, homepage, and Start Here content. | `shared partial` |

## Findings

- Layout geometry is still centralized in `assets/css/main.css`, but the cleanup removed several misleading route hooks and promoted real owners in their place.
- Single-page article ownership is now intentionally centered on `piece*`, `running-header*`, `journey-links--article`, `collection-membership__*`, and newsletter modifiers. The dead generic wrappers `single-page`, `single-page--imported`, and `single-content` were removed.
- `Start Here` now has an explicit route shell: `start-here-page`, `start-here-journey-links`, `start-here-content`, and the content-authored `start-here-*` blocks all map to real CSS in `main.css`.
- Collections now own their inner structure explicitly through `collection-grid`, `collection-card`, `collection-meta`, `collection-meta-*`, `collection-items`, `collection-item-note`, `collection-pill`, `collection-start-here`, and `collection-membership__*`.
- Remaining ambiguity is concentrated in older homepage secondary wrappers and `library-group`, which still rely more on shared flow and generic `.d` / `.m` text styles than on dedicated layout selectors.

## Route Matrix

| Route family | Routes | Route selection | Primary template | Major partials / markup contributors | CSS layout owners | Ownership classification | Notable gaps / ambiguity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Global shell | All main-site routes; dashboard build routes | `hugo.toml` or `hugo-dashboard.toml` plus Hugo lookup to `layouts/_default/baseof.html` | `layouts/_default/baseof.html` | `layouts/partials/masthead.html`, `layouts/partials/masthead_dashboard.html`, `layouts/partials/footer.html`, `layouts/partials/footer_dashboard.html` | `.wrap`, `.masthead`, `.masthead--editorial`, `.masthead--sticky`, `.nav`, `.nav--section-rail`, responsive nav rules in `assets/css/main.css` | `global shell` | Outer shell ownership is strong, but route shells can only narrow content inside `.wrap`; they do not own the page frame. |
| Homepage | `/` | Hugo home route resolves to `layouts/index.html` | `layouts/index.html` | `layouts/partials/home_front_page.html`, `layouts/partials/home_imprint_statement.html`, `layouts/partials/home_selected_collections.html`, `layouts/partials/home_recent_work.html`, `layouts/partials/newsletter_signup.html`, `layouts/partials/discovery/page-list-item.html`, `layouts/partials/discovery/collection-card.html` | `.home-manifesto__inner`, `.home-front-page__stories`, `.home-front-page__lead`, `.home-front-page__secondary-label`, `.home-front-page__secondary-kicker`, `.home-front-page__secondary-title a`, `.home-front-page__secondary-meta`, `.home-imprint-statement__inner`, `.home-selected-collections__list`, `.home-recent-work__list`, `.home-browse__grid`, `.collection-card`, `.collection-meta`, shared `.item`, shared `.card`, shared `.page-shell--wide`, `.page-shell--feature`, `.page-shell--grid` | Route composition is `route-owned`; most actual geometry is shared CSS and shared partial markup | `home-front-page__secondary`, `home-front-page__secondary-item`, `home-front-page__secondary-dek`, and `home-front-page__secondary-action` still rely on container flow and shared text utilities rather than dedicated selectors. |
| Section landing family | `/essays/`, `/syd-and-oliver/`, `/working-papers/` | Section `_index.md` files plus `hugo.toml` permalinks; Hugo uses `layouts/_default/list.html` | `layouts/_default/list.html` | `layouts/partials/journey_links.html`, `layouts/partials/discovery/page-list-item.html` | `.page-header`, `.page-intro`, `.journey-links`, `.journey-links--page`, `.item`, `.page-shell--wide`, `.page-shell--reading` | Shared route family template plus shared partials and shared CSS; no per-section layout namespace | No section-specific CSS namespace exists. Section landings differ mostly by content and route data, not by route-owned layout rules. |
| Single article family | `/essays/:slug/`, `/syd-and-oliver/:slug/`, future `/working-papers/:slug/` | Regular content pages plus `hugo.toml` permalinks; Hugo uses `layouts/_default/single.html` | `layouts/_default/single.html` | `layouts/partials/running_header.html`, `layouts/partials/journey_links.html`, `layouts/partials/render_article_body.html`, `layouts/_default/_markup/render-image.html`, `layouts/partials/collections/page-membership-block.html`, `layouts/partials/read_next.html`, `layouts/partials/newsletter_signup.html` | `.piece`, `.piece-header`, `.piece-body`, `.piece-aftermatter`, `.running-header`, `.running-header__inner`, `.journey-links--article`, `.imprint-header`, `.citation`, `.collection-membership`, `.collection-membership__*`, `.newsletter-signup--page`, `.newsletter-signup__inner`, `.read-next`, `.read-next__inner`, article-body selectors such as `.article-embed`, `.article-source`, `.article-aftermatter-heading`, `.piece-body figure`, `.piece-body img` | Strong route-owned article shell layered on shared partials | The route intentionally relies on `piece*` and shared article components rather than a generic single-page wrapper namespace. |
| Collections index | `/collections/` | `content/collections/_index.md` plus section-specific template lookup | `layouts/collections/list.html` | `layouts/partials/journey_links.html`, `layouts/partials/discovery/collection-card.html` | `.page-header`, `.page-intro`, `.journey-links`, `.journey-links--page`, generic `.grid`, generic `.card`, `.collection-grid`, `.collection-card`, `.collection-meta`, `.page-shell--wide`, `.page-shell--grid`, `.page-shell--reading` | Route-owned template composition sitting on shared grid/card primitives plus collection-specific card modifiers | Card framing still inherits from shared `.card`, by design. |
| Collection detail | `/collections/:slug/` | Collection content pages plus `hugo.toml` collection permalinks | `layouts/collections/single.html` | `layouts/partials/discovery/page-list-item.html`, `layouts/partials/discovery/collection-card.html`, `layouts/partials/journey_links.html` | `.page-header`, `.page-intro`, `.collection-meta-block`, `.collection-meta-row`, `.collection-meta-label`, `.collection-meta-value`, `.collection-start-here`, `.collection-items`, `.collection-item`, `.collection-item-note`, `.collection-item--start-here`, `.collection-pill`, `.collection-membership`, `.collection-membership__*`, shared `.item`, `.page-shell--wide`, `.page-shell--reading`, `.journey-links--page` | Route-owned detail structure layered on shared discovery partials | Related collections still render through the shared collection-card partial, so some card chrome remains shared by design. |
| Library | `/library/` | `content/library/_index.md` plus section-specific template lookup | `layouts/library/list.html` | `layouts/partials/journey_links.html`, `layouts/partials/discovery/page-list-item.html` | `.page-header`, `.page-intro`, `.library-search`, `.library-search-input`, `.library-empty`, `.library-group > .m`, shared `.item`, `.page-shell--wide`, `.page-shell--feature`, `.page-shell--reading` | Route-owned template with shared search/list primitives | `library-group` itself still has very little explicit CSS ownership; most section spacing comes from the page shells and document flow. |
| Start Here | `/start-here/` | `content/start-here/index.md` resolves to `layouts/start-here/single.html` | `layouts/start-here/single.html` | `layouts/partials/journey_links.html`, `layouts/partials/newsletter_signup.html` via shortcode, raw HTML structure inside `content/start-here/index.md` | `.start-here-page`, `.start-here-header`, `.start-here-journey-links`, `.start-here-content`, `.start-here-section`, `.start-here-intro`, `.start-here-map`, `.start-here-map-row`, `.start-here-section-intro`, `.start-here-feature-list`, `.start-here-feature`, `.start-here-feature-kicker`, `.start-here-meta`, `.start-here-threads`, `.start-here-thread`, `.start-here-thread__title`, `.start-here-thread__description`, `.start-here-thread-note`, `.start-here-edition-list`, `.newsletter-signup--page`, `.newsletter-signup--start-here`, `.start-here-closing`, shared `.page-shell--wide`, `.page-shell--reading`, shared `.subtitle`, shared `.page-intro` | Route-owned shell layered on shared page-shell widths and the shared newsletter component | The route still intentionally inherits width primitives from `.page-shell*`; it now owns the route modifiers rather than relying on accidental generic defaults. |
| Random | `/random/` | `content/random/index.md` resolves to `layouts/random/single.html` | `layouts/random/single.html` | None | shared `.item`, `.page-shell--reading` | Minimal route-owned template using generic shared layout primitives | No dedicated route CSS. Visual behavior is still a generic fallback row wrapped around a redirect script. |
| Dashboard build | Dashboard build root `/` under `hugo-dashboard.toml` | `hugo-dashboard.toml` sets `contentDir = "content-dashboard"`; `content-dashboard/dashboard/_index.md` sets `url: "/"`; Hugo uses `layouts/dashboard/list.html` | `layouts/dashboard/list.html` and `layouts/partials/dashboard/render.html` | `layouts/partials/masthead_dashboard.html`, `layouts/partials/footer_dashboard.html` via `baseof.html` | Dedicated `dashboard-*` namespace including `.dashboard`, `.dashboard-v2`, `.dashboard-hero`, `.dashboard-category-chooser`, `.dashboard-toolbar`, `.dashboard-grid`, `.dashboard-panel`, and related dashboard selectors in `assets/css/main.css` | Most route-owned layout system in the repo; dedicated namespace and alternate build config | Still inherits the global `baseof.html` outer shell and `.wrap`, but fragmentation is much lower here than on the public editorial site. |

## Removed Layout Hooks

These hooks were removed rather than left behind as decorative aliases:

- `single-page`
- `single-content`
- `single-page--imported`
- `start-here-map-section`
- `start-here-featured`
- `start-here-featured-intro`
- `start-here-collections`
- `start-here-editions`
- `start-here-archive`

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
  - Read `hugo-dashboard.toml` for the dashboard build and alternate `contentDir`.
- Confirm generic single-hook cleanup:
  - Open `layouts/_default/single.html` and verify `single-page`, `single-page--imported`, and `single-content` are gone.
  - Open `layouts/start-here/single.html` and verify the route uses `start-here-page`, `start-here-journey-links`, and `start-here-content`.
- Confirm Start Here ownership:
  - Compare `content/start-here/index.md` against `assets/css/main.css`.
  - Verify each remaining `start-here-*` class has a matching selector in `main.css`.
- Confirm collection ownership:
  - Compare `layouts/collections/single.html` and `layouts/partials/collections/page-membership-block.html` against `assets/css/main.css`.
  - Verify `collection-meta-*`, `collection-items`, `collection-item-note`, `collection-pill`, `collection-start-here`, `collection-item--start-here`, and `collection-membership__*` all have explicit CSS owners.
- Confirm matrix accuracy:
  - Search `assets/css/main.css` for every selector named in the matrix rows.
  - Search `layouts/**` for every hook listed under `Remaining Dead Or Under-Defined Hooks`.
- Run contract tests when Node is available:
  - `.\tools\bin\generated\node.cmd --test tests/layout_ownership_contract.test.mjs`
- Optional render check when Hugo is available:
  - `.\tools\bin\generated\hugo.cmd --gc --minify`
  - `.\tools\bin\generated\hugo.cmd --config hugo-dashboard.toml --gc --minify`
  - Spot-check `/`, `/start-here/`, `/essays/`, one essay single, `/collections/`, one collection detail, `/library/`, and `/random/`.
