import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const template = fs.readFileSync(path.resolve("layouts/partials/dashboard/render.html"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");
const js = fs.readFileSync(path.resolve("assets/js/dashboard.mjs"), "utf8");
const categories = fs.readFileSync(path.resolve("assets/js/dashboard-categories.mjs"), "utf8");

test("dashboard template keeps editorial shell structure", () => {
  for (const marker of [
    "dashboard-hero__note",
    "dashboard-category-nav",
    "data-dashboard-category-link",
    "data-dashboard-category-panel",
    "data-dashboard-active-title",
    'data-dashboard-control-wrap="period"',
    "dashboard-section__deck",
    "data-dashboard-toolbar",
    "data-dashboard-scatter-details",
    "data-dashboard-section-explorer",
    "data-dashboard-essay-explorer",
    "dashboard-drilldown-fallback"
  ]) {
    assert.match(template, new RegExp(marker));
  }
});

test("dashboard CSS defines the editorial token and annotation system", () => {
  for (const marker of [
    "--dashboard-accent-strong",
    "--dashboard-shadow",
    ".dashboard-category-card",
    ".dashboard-category-stage",
    ".dashboard-v2.is-enhanced .dashboard-category-panel[hidden]",
    ".dashboard-trend-annotation",
    ".dashboard-funnel__badge",
    ".dashboard-signal__kicker",
    ".dashboard-drilldown-layout",
    ".dashboard-chip",
    ".dashboard-compare-strip",
    "@media (prefers-reduced-motion: reduce)"
  ]) {
    assert.match(css, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("dashboard JS renders refined hero-card and annotation classes", () => {
  for (const marker of [
    "resolveDashboardCategory",
    "applyDashboardCategoryView",
    "exportPayloadForCategory",
    "dashboard-kpi__header",
    "dashboard-trend-annotation",
    "dashboard-detail-card__eyebrow",
    "renderFunnelRefined",
    "renderSourcesRefined",
    "renderSectionExplorer",
    "renderEssayExplorer",
    "data-reset-drilldown",
    "aria-pressed",
    "escapeHtml"
  ]) {
    assert.match(js, new RegExp(marker));
  }
});

test("dashboard category config defines focused destinations", () => {
  for (const marker of [
    'key: "overview"',
    'key: "performance"',
    'key: "sections"',
    'key: "essays"',
    'key: "journey"',
    'key: "sources"',
    'key: "insights"',
    "buildDashboardCategoryView"
  ]) {
    assert.match(categories, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
