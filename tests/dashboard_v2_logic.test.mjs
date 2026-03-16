import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDashboardModel,
  createState,
  normalizeDashboardData,
  rowsToCsv,
  serializeState
} from "../assets/js/dashboard-core.mjs";

const fixtureRoot = path.resolve("tests/fixtures/analytics");
const SCALABLE_METRICS = new Set([
  "pageviews",
  "views",
  "unique_visitors",
  "visitors",
  "reads",
  "pdf_downloads",
  "newsletter_submits"
]);

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

function amplifyFixture(value, factor) {
  if (Array.isArray(value)) {
    return value.map((item) => amplifyFixture(item, factor));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (typeof entryValue === "number" && SCALABLE_METRICS.has(key)) {
        return [key, entryValue * factor];
      }

      return [key, amplifyFixture(entryValue, factor)];
    })
  );
}

test("empty analytics data yields stable zero-state cards and signals", () => {
  const model = buildDashboardModel(loadFixture("empty"), "");

  assert.equal(model.kpis[0].value, 0);
  assert.equal(model.leaderboard.length, 0);
  assert.match(model.insights[0].title, /Awaiting/);
  assert.equal(model.funnel.steps[0].value, 0);
  assert.equal(model.funnel.sourceLeaders.length, 0);
});

test("sparse analytics data stays filterable and exportable", () => {
  const raw = loadFixture("sparse");
  const model = buildDashboardModel(raw, "?period=all&section=Essays&sort=views");

  assert.equal(model.state.section, "Essays");
  assert.equal(model.leaderboard.length, 1);
  assert.equal(model.leaderboard[0].title, "Signal Garden");
  assert.equal(model.funnel.steps[0].value, 1);
  assert.equal(model.funnel.collectionLeaders.length, 0);

  const csv = rowsToCsv([{ title: model.leaderboard[0].title, views: model.leaderboard[0].views }]);
  assert.match(csv, /Signal Garden/);
});

test("rich analytics data derives trends, insights, and shareable filter state", () => {
  const raw = amplifyFixture(loadFixture("rich"), 4);
  const normalized = normalizeDashboardData(raw);
  const model = buildDashboardModel(raw, "?period=all&section=Essays&metric=reads&scale=rate&sort=read_rate");

  assert.equal(normalized.daily.length, 4);
  assert.equal(model.state.metric, "reads");
  assert.ok(model.kpis.find((metric) => metric.key === "reads").value >= 5);
  assert.ok(model.scatter.points.some((point) => point.quadrant.includes("completion")));
  assert.ok(model.insights.length >= 4);
  assert.ok(model.insights.every((insight) => !/Sample still too small/.test(insight.title)));
  assert.ok(model.sources.rows.length >= 1);
  assert.ok(model.funnel.sourceFunnel.some((row) => row.label === "external"));
  assert.ok(model.funnel.collectionLeaders.some((row) => row.label === "risk-uncertainty"));
  assert.match(serializeState(model.state), /metric=reads/);
});

test("journey rollups preserve approximate attribution but expose useful conversion splits", () => {
  const model = buildDashboardModel(loadFixture("rich"), "?period=all&sourceType=internal-module");

  assert.ok(model.data.journeyBySource.length >= 1);
  assert.ok(model.data.journeyByCollection.every((row) => row.approximate_downstream === true));
  assert.ok(model.funnel.sourceLeaders.every((row) => row.discovery_type === "internal-module"));
  assert.ok(model.funnel.collectionLeaders[0].read_rate >= 0);
});

test("drill-down state deep-links section and essay context", () => {
  const model = buildDashboardModel(
    loadFixture("rich"),
    "?selectedSection=Essays&selectedEssay=%2Fessays%2Fsignal-garden%2F&compareSections=Working%20Papers&compareEssays=%2Fessays%2Fpaper-radio%2F"
  );

  assert.equal(model.state.selectedSection, "Essays");
  assert.equal(model.essayExplorer.selected.title, "Signal Garden");
  assert.equal(model.sectionExplorer.selected.section, "Essays");
  assert.ok(model.sectionExplorer.compare.some((row) => row.section === "Working Papers"));
  assert.ok(model.essayExplorer.compare.some((row) => row.path === "/essays/paper-radio/"));
  assert.match(serializeState(model.state), /selectedEssay=/);
});

test("invalid drill-down query state collapses safely to valid options", () => {
  const data = normalizeDashboardData(loadFixture("rich"));
  const state = createState(
    data,
    "?selectedSection=Unknown&selectedEssay=%2Fmissing%2F&compareSections=Unknown,Essays&compareEssays=%2Fmissing%2F,%2Fessays%2Fpaper-radio%2F"
  );

  assert.equal(state.selectedSection, "");
  assert.equal(state.selectedEssay, "");
  assert.deepEqual(state.compareSections, ["Essays"]);
  assert.deepEqual(state.compareEssays, ["/essays/paper-radio/"]);
});

test("malformed-but-recoverable snapshot values fail soft", () => {
  const model = buildDashboardModel(
    {
      overview: { pageviews: "oops", reads: "3", read_rate: null },
      essays: [{ path: "/broken/", title: "Broken", section: "Essays", views: "6", reads: "2", pdf_downloads: "1" }],
      sections: { section: "Essays" },
      timeseries_daily: "invalid",
      essays_timeseries: [{ path: "/broken/", series: [{ date: "2026-03-01", pageviews: "6", reads: "2", pdf_downloads: "1" }] }],
      journeys: [{ discovery_source: "direct", section: "Essays", path: "/broken/", title: "Broken", views: "6", reads: "2", approximate_downstream: true }],
      journey_by_source: null,
      journey_by_collection: "invalid",
      journey_by_essay: [{ title: "Broken", path: "/broken/", views: "6", reads: "2", read_rate: "33.3", approximate_downstream: true }],
      sources: [{ source: "direct", visitors: "4", pageviews: "6", reads: "2" }],
      sources_timeseries: [{ date: "2026-03-01", source: "direct", pageviews: "6", reads: "2" }],
      periods: null
    },
    "?selectedEssay=%2Fbroken%2F"
  );

  assert.equal(model.kpis[0].value, 0);
  assert.equal(model.leaderboard[0].title, "Broken");
  assert.equal(model.essayExplorer.selected.title, "Broken");
  assert.equal(model.sectionExplorer.cards[0].section, "Essays");
});

test("tiny windows produce conservative insight copy", () => {
  const model = buildDashboardModel(loadFixture("sparse"), "?period=all");

  assert.equal(model.insights.length, 1);
  assert.match(model.insights[0].title, /Sample still too small/);
});
