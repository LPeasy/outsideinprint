import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildDashboardModel } from "../assets/js/dashboard-core.mjs";
import {
  DEFAULT_CATEGORY,
  DASHBOARD_CATEGORIES,
  applyDashboardCategoryView,
  buildDashboardCategoryView,
  resolveDashboardCategory
} from "../assets/js/dashboard-categories.mjs";

const fixtureRoot = path.resolve("tests/fixtures/analytics");

function loadFixture(name) {
  const analyticsDir = path.join(fixtureRoot, name, "data", "analytics");
  return {
    overview: JSON.parse(fs.readFileSync(path.join(analyticsDir, "overview.json"), "utf8")),
    essays: JSON.parse(fs.readFileSync(path.join(analyticsDir, "essays.json"), "utf8")),
    sources: JSON.parse(fs.readFileSync(path.join(analyticsDir, "sources.json"), "utf8")),
    periods: JSON.parse(fs.readFileSync(path.join(analyticsDir, "periods.json"), "utf8")),
    sections: JSON.parse(fs.readFileSync(path.join(analyticsDir, "sections.json"), "utf8")),
    timeseries_daily: JSON.parse(fs.readFileSync(path.join(analyticsDir, "timeseries_daily.json"), "utf8")),
    essays_timeseries: JSON.parse(fs.readFileSync(path.join(analyticsDir, "essays_timeseries.json"), "utf8")),
    journeys: JSON.parse(fs.readFileSync(path.join(analyticsDir, "journeys.json"), "utf8")),
    journey_by_source: JSON.parse(fs.readFileSync(path.join(analyticsDir, "journey_by_source.json"), "utf8")),
    journey_by_collection: JSON.parse(fs.readFileSync(path.join(analyticsDir, "journey_by_collection.json"), "utf8")),
    journey_by_essay: JSON.parse(fs.readFileSync(path.join(analyticsDir, "journey_by_essay.json"), "utf8")),
    sources_timeseries: JSON.parse(fs.readFileSync(path.join(analyticsDir, "sources_timeseries.json"), "utf8"))
  };
}

function fakeNode(dataset = {}) {
  const node = {
    dataset,
    hidden: false,
    textContent: "",
    className: "",
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    }
  };

  node.classList = {
    toggle(name, enabled) {
      const next = new Set(String(node.className || "").split(/\s+/).filter(Boolean));
      if (enabled) {
        next.add(name);
      } else {
        next.delete(name);
      }
      node.className = [...next].join(" ");
    }
  };

  return node;
}

test("default category falls back to overview for missing or invalid hashes", () => {
  assert.equal(DEFAULT_CATEGORY, "overview");
  assert.equal(resolveDashboardCategory(""), "overview");
  assert.equal(resolveDashboardCategory("#sources"), "sources");
  assert.equal(resolveDashboardCategory("#not-a-category"), "overview");
  assert.equal(DASHBOARD_CATEGORIES.length, 7);
});

test("category view exposes one visible panel and a scoped control set", () => {
  const sourcesView = buildDashboardCategoryView("sources");
  const visiblePanels = Object.entries(sourcesView.visiblePanels).filter(([, isVisible]) => isVisible);

  assert.deepEqual(visiblePanels, [["sources", true]]);
  assert.deepEqual([...sourcesView.visibleControls].sort(), ["period", "scale", "sourceType"]);
  assert.equal(sourcesView.category.label, "Traffic sources");
});

test("applying a category updates active content and hides unrelated panels", () => {
  const links = DASHBOARD_CATEGORIES.map((category) =>
    fakeNode({ dashboardCategoryLink: category.key })
  );
  const panels = DASHBOARD_CATEGORIES.map((category) =>
    fakeNode({ dashboardCategoryPanel: category.key })
  );
  const controls = {
    period: fakeNode(),
    section: fakeNode(),
    sourceType: fakeNode(),
    scale: fakeNode(),
    sort: fakeNode()
  };
  const activeTitle = fakeNode();
  const activeDescription = fakeNode();
  const exportControl = fakeNode();
  const shell = fakeNode();

  applyDashboardCategoryView("journey", {
    shell,
    activeTitle,
    activeDescription,
    links,
    panels,
    controls,
    exportControl
  });

  assert.equal(shell.dataset.dashboardCategory, "journey");
  assert.equal(activeTitle.textContent, "Reader journey");
  assert.match(activeDescription.textContent, /Discovery, reading, PDF, and newsletter pathways/i);
  assert.equal(panels.find((panel) => panel.dataset.dashboardCategoryPanel === "journey").hidden, false);
  assert.equal(panels.find((panel) => panel.dataset.dashboardCategoryPanel === "overview").hidden, true);
  assert.equal(controls.period.hidden, false);
  assert.equal(controls.section.hidden, false);
  assert.equal(controls.sourceType.hidden, false);
  assert.equal(controls.scale.hidden, false);
  assert.equal(controls.sort.hidden, true);
  assert.equal(exportControl.hidden, false);
  assert.equal(
    links.find((link) => link.dataset.dashboardCategoryLink === "journey").attributes["aria-current"],
    "page"
  );
  assert.equal(
    links.find((link) => link.dataset.dashboardCategoryLink === "overview").attributes["aria-current"],
    undefined
  );
});

test("rich fixture still populates the modules mapped into each category", () => {
  const model = buildDashboardModel(
    loadFixture("rich"),
    "?period=all&selectedSection=Essays&selectedEssay=%2Fessays%2Fsignal-garden%2F"
  );

  assert.ok(model.kpis.length > 0);
  assert.ok(model.trend.points.length > 0);
  assert.ok(model.scatter.points.length > 0);
  assert.ok(model.leaderboard.length > 0);
  assert.ok(model.sectionExplorer.cards.length > 0);
  assert.equal(model.essayExplorer.selected?.title, "Signal Garden");
  assert.ok(model.funnel.steps.length > 0);
  assert.ok(model.sources.rows.length > 0);
  assert.ok(model.insights.length > 0);
});
