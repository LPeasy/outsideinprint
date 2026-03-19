import {
  METRICS,
  buildDashboardModel,
  createState,
  formatMetricValue,
  rowsToCsv,
  serializeState
} from "./dashboard-core.mjs";

const DOT = "&middot;";
const MAX_COMPARE = 4;
const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function readJsonScript(id) {
  const node = document.getElementById(id);
  if (!node) {
    return {};
  }

  try {
    const parsed = JSON.parse(node.textContent || "{}");
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch (error) {
    return {};
  }
}

function linePath(values, width, height) {
  if (!values.length) {
    return "";
  }

  const max = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function areaPath(values, width, height) {
  if (!values.length) {
    return "";
  }

  const line = linePath(values, width, height);
  return `${line} L ${width} ${height} L 0 ${height} Z`;
}

function sparkline(values, className = "dashboard-sparkline") {
  if (!values.length) {
    return `<div class="${className} ${className}--empty">No trend data yet</div>`;
  }

  return `
    <svg class="${className}" viewBox="0 0 100 28" role="img" aria-hidden="true">
      <path class="${className}__area" d="${areaPath(values, 100, 28)}"></path>
      <path class="${className}__line" d="${linePath(values, 100, 28)}"></path>
    </svg>
  `;
}

function deltaTone(deltaText) {
  if (/^up /.test(deltaText)) {
    return "is-up";
  }
  if (/^down /.test(deltaText)) {
    return "is-down";
  }

  return "is-flat";
}

function toggleList(values, value, limit = MAX_COMPARE) {
  if (!value) {
    return values;
  }

  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }

  return values.concat(value).slice(-limit);
}

function metricSummary(items) {
  return items.filter(Boolean).join(` ${DOT} `);
}

function comparisonStrip(rows, type) {
  if (!rows.length) {
    return `<p class="dashboard-empty">Select up to four ${type === "essay" ? "essays" : "sections"} to compare pace, scale, and efficiency.</p>`;
  }

  return `
    <div class="dashboard-compare-strip">
      ${rows
        .map((row) => {
          const title = type === "essay" ? row.title : row.section;
          const sparklineValues = type === "essay" ? (row.trend || []).map((point) => point.pageviews ?? point) : row.sparkline || [];
          const summary = type === "essay"
            ? metricSummary([`${row.views} views`, `${row.read_rate.toFixed(1)}% read rate`, `${row.pdf_downloads} PDFs`])
            : metricSummary([`${row.pageviews} views`, `${row.read_rate.toFixed(1)}% read rate`, `${row.reads} reads`]);
          return `
            <article class="dashboard-compare-card">
              <p class="dashboard-compare-card__eyebrow">${escapeHtml(type === "essay" ? row.section : "Section comparison")}</p>
              <h4>${escapeHtml(title)}</h4>
              <p class="dashboard-compare-card__meta">${escapeHtml(summary)}</p>
              ${sparkline(sparklineValues, "dashboard-inline-sparkline")}
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function metricSwitcherHtml(state) {
  return METRICS.map(
    (metric) => `
      <button type="button" class="dashboard-pill${state.metric === metric.key ? " is-active" : ""}" data-metric="${metric.key}" aria-pressed="${state.metric === metric.key ? "true" : "false"}">
        ${metric.label}
      </button>
    `
  ).join("");
}

function renderKpis(root, model) {
  if (!root) {
    return;
  }
  root.innerHTML = model.kpis
    .map(
      (metric) => `
        <article class="dashboard-kpi" aria-label="${metric.summary}">
          <div class="dashboard-kpi__header">
            <p class="dashboard-kpi__label">${escapeHtml(metric.label)}</p>
            <p class="dashboard-kpi__delta ${deltaTone(metric.deltaText)}">${escapeHtml(metric.deltaText)}</p>
          </div>
          <p class="dashboard-kpi__value">${formatMetricValue(metric, metric.value)}</p>
          <p class="dashboard-kpi__subtext">Selected window summary</p>
          ${sparkline(metric.sparkline)}
        </article>
      `
    )
    .join("");
}

function renderTrend(root, state, trend) {
  if (!root) {
    return;
  }
  if (!trend.points.length) {
    root.innerHTML = `<p class="dashboard-empty">No daily trend data yet. The committed snapshot totals still appear above.</p>`;
    return;
  }

  const values = trend.points.map((point) => point.value);
  const latest = trend.activePoint;

  root.innerHTML = `
    <div class="dashboard-panel__header">
      <div>
        <p class="list-title">Trend</p>
        <h3>${trend.metric.label}</h3>
        <p class="dashboard-panel__caption">Latest annotation is pinned by default so the chart still reads clearly without hover.</p>
      </div>
      <div class="dashboard-pill-row">${metricSwitcherHtml(state)}</div>
    </div>
    <div class="dashboard-trend-card">
      <div class="dashboard-trend-card__summary">
        <p class="dashboard-trend-card__value">${formatMetricValue(trend.metric, latest.value)}</p>
        <p class="dashboard-trend-card__note">Latest point ${DOT} ${latest.label}</p>
      </div>
      <div class="dashboard-trend-frame">
        <svg class="dashboard-trend-chart" viewBox="0 0 100 42" role="img" aria-label="${trend.metric.label} over time">
          <path class="dashboard-trend-chart__area" d="${areaPath(values, 100, 42)}"></path>
          <path class="dashboard-trend-chart__line" d="${linePath(values, 100, 42)}"></path>
        </svg>
        <div class="dashboard-trend-annotation">
          <span class="dashboard-trend-annotation__label">Visible annotation</span>
          <span class="dashboard-trend-annotation__text">${trend.metric.label} closes the current window at ${formatMetricValue(trend.metric, latest.value)}.</span>
        </div>
      </div>
    </div>
  `;
}

function renderSmallMultiples(root, multiples) {
  if (!root) {
    return;
  }
  root.innerHTML = multiples
    .map(
      (metric) => `
        <article class="dashboard-mini">
          <p class="dashboard-mini__label">${escapeHtml(metric.label)}</p>
          <p class="dashboard-mini__value">${formatMetricValue(metric, metric.total)}</p>
          ${sparkline(metric.values, "dashboard-mini-sparkline")}
        </article>
      `
    )
    .join("");
}

function renderInsights(root, insights) {
  if (!root) {
    return;
  }
  root.innerHTML = insights
    .map(
      (insight) => `
        <article class="dashboard-signal">
          <p class="dashboard-signal__kicker">Signal</p>
          <h3>${escapeHtml(insight.title)}</h3>
          <p>${escapeHtml(insight.body)}</p>
        </article>
      `
    )
    .join("");
}

function scatterDetails(point) {
  if (!point) {
    return `<p class="dashboard-empty">Select an essay point to inspect traffic, completion, and PDF pull.</p>`;
  }

  return `
    <p class="dashboard-detail-card__eyebrow">Selected essay</p>
    <h3>${escapeHtml(point.title)}</h3>
    <p class="dashboard-detail-card__summary">${escapeHtml(point.quadrant)}</p>
    <dl class="dashboard-detail-list">
      <div><dt>Views</dt><dd>${point.views}</dd></div>
      <div><dt>Read rate</dt><dd>${point.read_rate.toFixed(1)}%</dd></div>
      <div><dt>PDF downloads</dt><dd>${point.pdf_downloads}</dd></div>
      <div><dt>Section</dt><dd>${escapeHtml(point.section)}</dd></div>
    </dl>
    <div class="dashboard-inline-actions">
      <button type="button" class="dashboard-text-button" data-select-section="${escapeHtml(point.section)}">Open section</button>
      <button type="button" class="dashboard-text-button" data-compare-essay="${escapeHtml(point.path)}">Compare essay</button>
    </div>
  `;
}

function renderScatter(root, detailsRoot, state, data) {
  if (!root || !detailsRoot) {
    return;
  }
  const scatter = data.scatter;
  if (!scatter.points.length) {
    root.innerHTML = `<p class="dashboard-empty">No content-performance points are available for this filter.</p>`;
    detailsRoot.innerHTML = scatterDetails(null);
    return;
  }

  const maxViews = Math.max(...scatter.points.map((point) => point.views), 1);
  const maxRate = Math.max(...scatter.points.map((point) => point.read_rate), 1);
  const selected = scatter.points.find((point) => point.path === state.selectedEssay) || scatter.points[0];

  root.innerHTML = `
    <div class="dashboard-scatter" role="img" aria-label="Content performance scatter plot">
      <div class="dashboard-scatter__mid dashboard-scatter__mid--x" style="left:${(scatter.medianViews / maxViews) * 100}%"></div>
      <div class="dashboard-scatter__mid dashboard-scatter__mid--y" style="top:${100 - (scatter.medianRate / maxRate) * 100}%"></div>
      ${scatter.points
        .map((point) => {
          const left = (point.views / maxViews) * 100;
          const top = 100 - (point.read_rate / maxRate) * 100;
          return `
            <button
              type="button"
              class="dashboard-scatter__point${selected.path === point.path ? " is-active" : ""}"
              style="left:${left}%;top:${top}%;width:${point.size}px;height:${point.size}px"
              data-select-essay="${escapeHtml(point.path)}"
              aria-pressed="${selected.path === point.path ? "true" : "false"}"
              aria-label="${escapeHtml(`${point.title}: ${point.views} views, ${point.read_rate.toFixed(1)} percent read rate`)}">
            </button>
          `;
        })
        .join("")}
    </div>
    <div class="dashboard-scatter__legend">
      <span>Left to right: traffic</span>
      <span>Bottom to top: completion</span>
    </div>
  `;

  detailsRoot.innerHTML = scatterDetails(selected);
}

function leaderboardRows(model) {
  return model.leaderboard.map((essay) => ({
    title: essay.title,
    section: essay.section,
    views: essay.views,
    reads: essay.reads,
    read_rate: essay.read_rate.toFixed(1),
    pdf_downloads: essay.pdf_downloads,
    primary_source: essay.primary_source
  }));
}

function renderLeaderboard(root, model) {
  if (!root) {
    return;
  }
  if (!model.leaderboard.length) {
    root.innerHTML = `<p class="dashboard-empty">No essays match this filter yet.</p>`;
    return;
  }

  const maxViews = Math.max(...model.leaderboard.map((essay) => essay.views), 1);
  root.innerHTML = `
    <table class="dashboard-table dashboard-table--wide">
      <thead>
        <tr>
          <th>Essay</th>
          <th>Section</th>
          <th>Views</th>
          <th>Reads</th>
          <th>Read rate</th>
          <th>PDF</th>
          <th>Primary source</th>
        </tr>
      </thead>
      <tbody>
        ${model.leaderboard
          .map(
            (essay) => `
              <tr>
                <td>
                  <button type="button" class="dashboard-table__button" data-select-essay="${escapeHtml(essay.path)}">${escapeHtml(essay.title)}</button>
                  <span class="dashboard-table__subtext">${escapeHtml(essay.primary_source)}</span>
                  ${sparkline(essay.trend, "dashboard-inline-sparkline")}
                </td>
                <td>
                  <button type="button" class="dashboard-table__button dashboard-table__button--muted" data-select-section="${escapeHtml(essay.section)}">${escapeHtml(essay.section)}</button>
                </td>
                <td>
                  <span>${essay.views}</span>
                  <span class="dashboard-inline-bar"><span style="width:${(essay.views / maxViews) * 100}%"></span></span>
                </td>
                <td>${essay.reads}</td>
                <td>${essay.read_rate.toFixed(1)}%</td>
                <td>${essay.pdf_downloads}</td>
                <td>
                  <span class="dashboard-table__muted">${escapeHtml(essay.primary_source)}</span>
                  <button type="button" class="dashboard-table__button dashboard-table__button--tiny" data-compare-essay="${escapeHtml(essay.path)}">Compare</button>
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSectionExplorer(root, model) {
  if (!root) {
    return;
  }
  const explorer = model.sectionExplorer;
  if (!explorer.cards.length) {
    root.innerHTML = `<p class="dashboard-empty">Section drill-down appears when section snapshots are committed.</p>`;
    return;
  }

  const selected = explorer.selected;
  root.innerHTML = `
    <div class="dashboard-panel__header">
      <div class="dashboard-chip-row">
        ${explorer.cards
          .map(
            (row) => `
              <button
                type="button"
                class="dashboard-chip${row.isSelected ? " is-active" : ""}"
                data-select-section="${escapeHtml(row.section)}"
                aria-pressed="${row.isSelected ? "true" : "false"}">
                ${escapeHtml(row.section)}
              </button>
            `
          )
          .join("")}
      </div>
      <div class="dashboard-inline-actions">
        <button type="button" class="dashboard-text-button" data-reset-drilldown>Reset to overview</button>
        <button type="button" class="dashboard-text-button" data-compare-section="${escapeHtml(selected.section)}" aria-pressed="${model.state.compareSections.includes(selected.section) ? "true" : "false"}">${model.state.compareSections.includes(selected.section) ? "Remove from compare" : "Compare section"}</button>
      </div>
    </div>
    <div class="dashboard-drilldown-layout">
      <article class="dashboard-drilldown-card">
        <p class="dashboard-detail-card__eyebrow">Selected section</p>
        <h3>${escapeHtml(selected.section)}</h3>
        <p class="dashboard-detail-card__summary">${escapeHtml(metricSummary([`${selected.pageviews} views`, `${selected.reads} reads`, `${selected.read_rate.toFixed(1)}% read rate`]))}</p>
        ${sparkline((selected.trend || []).map((point) => point.pageviews), "dashboard-sparkline dashboard-sparkline--framed")}
        <p class="dashboard-drilldown-card__note">${escapeHtml(selected.note)}</p>
      </article>
      <div class="dashboard-drilldown-stack">
        <section class="dashboard-drilldown-subpanel">
          <div class="dashboard-drilldown-subpanel__header">
            <h3>Top essays</h3>
            <p>Section leaders by views in the selected window.</p>
          </div>
          ${selected.topEssays.length
            ? selected.topEssays
                .map(
                  (essay) => `
                    <button type="button" class="dashboard-ranked-row" data-select-essay="${escapeHtml(essay.path)}">
                      <span>
                        <strong>${escapeHtml(essay.title)}</strong>
                        <small>${essay.views} views ${DOT} ${essay.reads} reads</small>
                      </span>
                      <span>${essay.read_rate.toFixed(1)}%</span>
                    </button>
                  `
                )
                .join("")
            : `<p class="dashboard-empty">No essays in this section yet.</p>`}
        </section>
        <section class="dashboard-drilldown-subpanel">
          <div class="dashboard-drilldown-subpanel__header">
            <h3>Best read-rate performers</h3>
            <p>Useful for spotting quieter sections or pieces that convert attention efficiently.</p>
          </div>
          ${selected.completionLeaders.length
            ? selected.completionLeaders
                .map(
                  (essay) => `
                    <button type="button" class="dashboard-ranked-row" data-select-essay="${escapeHtml(essay.path)}">
                      <span>
                        <strong>${escapeHtml(essay.title)}</strong>
                        <small>${essay.views} views ${DOT} ${essay.pdf_downloads} PDFs</small>
                      </span>
                      <span>${essay.read_rate.toFixed(1)}%</span>
                    </button>
                  `
                )
                .join("")
            : `<p class="dashboard-empty">No qualifying essays for this section yet.</p>`}
        </section>
        <section class="dashboard-drilldown-subpanel">
          <div class="dashboard-drilldown-subpanel__header">
            <h3>Strongest source mix</h3>
            <p>Measured pageviews grouped with approximate downstream outcomes for this section.</p>
          </div>
          ${selected.sourceMix.length
            ? selected.sourceMix
                .map(
                  (source) => `
                    <article class="dashboard-ranked-row dashboard-ranked-row--static">
                      <span>
                        <strong>${escapeHtml(source.label)}</strong>
                        <small>${source.views} views ${DOT} ${source.reads} reads</small>
                      </span>
                      <span>${source.read_rate.toFixed(1)}%</span>
                    </article>
                  `
                )
                .join("")
            : `<p class="dashboard-empty">No source mix is available for this section under the current filter.</p>`}
        </section>
      </div>
    </div>
    <section class="dashboard-drilldown-compare">
      <div class="dashboard-drilldown-subpanel__header">
        <h3>Section compare</h3>
        <p>Keep a few sections side by side while you move through the rest of the dashboard.</p>
      </div>
      ${comparisonStrip(explorer.compare, "section")}
    </section>
  `;
}

function renderEssayExplorer(root, model) {
  if (!root) {
    return;
  }
  const explorer = model.essayExplorer;
  if (!explorer.selected) {
    root.innerHTML = `<p class="dashboard-empty">Select an essay from the scatter plot, leaderboard, or section explorer.</p>`;
    return;
  }

  const selected = explorer.selected;
  const journeyNote = selected.journeyRecord?.attribution_note || "Journey rates remain approximate when they rely on same-session downstream sequences.";
  root.innerHTML = `
    <div class="dashboard-panel__header">
      <div>
        <p class="dashboard-detail-card__eyebrow">Selected essay</p>
        <h3>${escapeHtml(selected.title)}</h3>
        <p class="dashboard-detail-card__summary">${escapeHtml(metricSummary([selected.section, `${selected.views} views`, `${selected.read_rate.toFixed(1)}% read rate`, `${selected.pdf_downloads} PDFs`]))}</p>
      </div>
      <div class="dashboard-inline-actions">
        <button type="button" class="dashboard-text-button" data-reset-drilldown>Reset to overview</button>
        <button type="button" class="dashboard-text-button" data-select-section="${escapeHtml(selected.section)}">Open section</button>
        <button type="button" class="dashboard-text-button" data-compare-essay="${escapeHtml(selected.path)}" aria-pressed="${model.state.compareEssays.includes(selected.path) ? "true" : "false"}">${model.state.compareEssays.includes(selected.path) ? "Remove from compare" : "Compare essay"}</button>
      </div>
    </div>
    <div class="dashboard-drilldown-layout">
      <article class="dashboard-drilldown-card">
        ${sparkline((selected.trend || []).map((point) => point.pageviews), "dashboard-sparkline dashboard-sparkline--framed")}
        <dl class="dashboard-detail-list">
          <div><dt>Primary source</dt><dd>${escapeHtml(selected.primary_source)}</dd></div>
          <div><dt>Reads</dt><dd>${selected.reads}</dd></div>
          <div><dt>PDF rate</dt><dd>${selected.views ? ((selected.pdf_downloads / selected.views) * 100).toFixed(1) : "0.0"}%</dd></div>
          <div><dt>Recent views</dt><dd>${selected.recent_views}</dd></div>
        </dl>
        <p class="dashboard-callout${selected.journeyRecord?.approximate_downstream ? " is-approximate" : ""}">${escapeHtml(journeyNote)}</p>
      </article>
      <div class="dashboard-drilldown-stack">
        <section class="dashboard-drilldown-subpanel">
          <div class="dashboard-drilldown-subpanel__header">
            <h3>Source mix</h3>
            <p>Discovery sources leading into this piece under the current filter.</p>
          </div>
          ${selected.sourceMix.length
            ? selected.sourceMix
                .map(
                  (source) => `
                    <article class="dashboard-ranked-row dashboard-ranked-row--static">
                      <span>
                        <strong>${escapeHtml(source.label)}</strong>
                        <small>${source.views} views ${DOT} ${source.reads} reads</small>
                      </span>
                      <span>${source.read_rate.toFixed(1)}%</span>
                    </article>
                  `
                )
                .join("")
            : `<p class="dashboard-empty">No source mix is available for this essay under the current filter.</p>`}
        </section>
        <section class="dashboard-drilldown-subpanel">
          <div class="dashboard-drilldown-subpanel__header">
            <h3>Related essays</h3>
            <p>Nearby pieces in the same section so you can keep comparing without leaving context.</p>
          </div>
          ${selected.related.length
            ? selected.related
                .map(
                  (essay) => `
                    <button type="button" class="dashboard-ranked-row" data-select-essay="${escapeHtml(essay.path)}">
                      <span>
                        <strong>${escapeHtml(essay.title)}</strong>
                        <small>${essay.views} views ${DOT} ${essay.read_rate.toFixed(1)}% read rate</small>
                      </span>
                      <span>${essay.pdf_downloads} PDFs</span>
                    </button>
                  `
                )
                .join("")
            : `<p class="dashboard-empty">No related essays are available for this section yet.</p>`}
        </section>
      </div>
    </div>
    <section class="dashboard-drilldown-compare">
      <div class="dashboard-drilldown-subpanel__header">
        <h3>Essay compare</h3>
        <p>Hold a handful of pieces side by side as you move between sections and journeys.</p>
      </div>
      ${comparisonStrip(explorer.compare, "essay")}
    </section>
  `;
}

function renderFunnel(root, model) {
  const maxValue = Math.max(...model.funnel.steps.map((step) => step.value), 1);
  root.innerHTML = `
    <div class="dashboard-funnel">
      ${model.funnel.steps
        .map(
          (step) => `
            <article class="dashboard-funnel__step">
              <p class="dashboard-funnel__label">${step.label}${step.approximate ? " (approx.)" : ""}</p>
              <p class="dashboard-funnel__value">${step.value}</p>
              <div class="dashboard-funnel__bar"><span style="width:${(step.value / maxValue) * 100}%"></span></div>
            </article>
          `
        )
        .join("")}
    </div>
    <div class="dashboard-journeys">
      ${model.funnel.paths.length
        ? model.funnel.paths
            .map(
              (path) => `
                <article class="dashboard-journey">
                  <h3>${path.discovery_source}</h3>
                  <p>${path.title}</p>
                  <p class="dashboard-journey__meta">${path.views} views · ${path.reads} reads · ${path.pdf_downloads} PDFs</p>
                </article>
              `
            )
            .join("")
        : `<p class="dashboard-empty">No journey paths match this filter.</p>`}
    </div>
  `;
}

function renderSources(root, model, state) {
  root.innerHTML = `
    <div class="dashboard-source-list">
      ${model.sources.rows.length
        ? model.sources.rows
            .map((source) => {
              const score = state.scale === "rate" ? source.read_rate : source.pageviews;
              const label = state.scale === "rate" ? `${source.read_rate.toFixed(1)}% read rate` : `${source.pageviews} views`;
              return `
                <article class="dashboard-source">
                  <div>
                    <h3>${source.source}</h3>
                    <p>${label}</p>
                  </div>
                  <div class="dashboard-source__meta">${source.reads} reads · ${source.visitors} visitors</div>
                </article>
              `;
            })
            .join("")
        : `<p class="dashboard-empty">No source data matches this filter.</p>`}
    </div>
  `;
}

function renderFunnelRefined(root, model) {
  if (!root) {
    return;
  }
  const maxValue = Math.max(...model.funnel.steps.map((step) => step.value), 1);
  const maxSourceViews = Math.max(...model.funnel.sourceFunnel.map((row) => row.views), 1);
  const rankedRows = (rows, metricLabel) =>
    rows.length
      ? `
        <div class="dashboard-journey-table">
          ${rows
            .map(
              (row) => `
                <article class="dashboard-journey-table__row">
                  <div>
                    <h4>${escapeHtml(row.label || row.title)}</h4>
                    <p>${row.views} views ${DOT} ${row.reads} reads ${DOT} ${row.read_rate.toFixed(1)}% read rate</p>
                  </div>
                  <div class="dashboard-journey-table__metric">${metricLabel === "rate" ? `${row.read_rate.toFixed(1)}%` : row.reads}</div>
                </article>
              `
            )
            .join("")}
        </div>
      `
      : `<p class="dashboard-empty">No qualifying rows for this comparison yet.</p>`;

  root.innerHTML = `
    <div class="dashboard-funnel">
      ${model.funnel.steps
        .map(
          (step) => `
            <article class="dashboard-funnel__step${step.approximate ? " is-approximate" : ""}">
              <div class="dashboard-funnel__topline">
                <p class="dashboard-funnel__label">${step.label}</p>
                ${step.approximate ? `<span class="dashboard-funnel__badge">Approx.</span>` : `<span class="dashboard-funnel__badge is-measured">Measured</span>`}
              </div>
              <p class="dashboard-funnel__value">${step.value}</p>
              <div class="dashboard-funnel__bar"><span style="width:${(step.value / maxValue) * 100}%"></span></div>
            </article>
          `
        )
        .join("")}
    </div>
    <div class="dashboard-journey-comparison">
      <div class="dashboard-journey-comparison__header">
        <h3>Source-type conversion</h3>
        <p>Compare internal, external, campaign, and direct discovery without pretending the downstream steps are directly observed attribution chains.</p>
      </div>
      <div class="dashboard-journey-bars">
        ${model.funnel.sourceFunnel.length
          ? model.funnel.sourceFunnel
              .map(
                (row) => `
                  <article class="dashboard-journey-bar">
                    <div class="dashboard-journey-bar__topline">
                      <span>${escapeHtml(row.label)}</span>
                      <span>${row.read_rate.toFixed(1)}%</span>
                    </div>
                    <div class="dashboard-journey-bar__track"><span style="width:${(row.views / maxSourceViews) * 100}%"></span></div>
                    <p class="dashboard-journey-bar__meta">${row.views} views ${DOT} ${row.reads} reads ${DOT} ${row.pdf_downloads} PDFs</p>
                  </article>
                `
              )
              .join("")
          : `<p class="dashboard-empty">No source-type journey comparison is available yet.</p>`}
      </div>
    </div>
    <div class="dashboard-journey-split">
      <section class="dashboard-journey-pane">
        <div class="dashboard-journey-pane__header">
          <h3>Discovery engines</h3>
          <p>Sources ranked by ${model.state.scale === "rate" ? "read-through rate" : "downstream reads"}.</p>
        </div>
        ${rankedRows(model.funnel.sourceLeaders, model.state.scale)}
      </section>
      <section class="dashboard-journey-pane">
        <div class="dashboard-journey-pane__header">
          <h3>Collections and modules</h3>
          <p>Internal pathways doing useful editorial work beyond raw click count.</p>
        </div>
        ${rankedRows(model.funnel.collectionLeaders, model.state.scale)}
      </section>
    </div>
    <div class="dashboard-journey-split">
      <section class="dashboard-journey-pane">
        <div class="dashboard-journey-pane__header">
          <h3>Essay conversion leaders</h3>
          <p>Compare high-view essays with quieter pages that convert more efficiently.</p>
        </div>
        ${rankedRows(model.funnel.essayConversion, model.state.scale)}
      </section>
      <section class="dashboard-journey-pane">
        <div class="dashboard-journey-pane__header">
          <h3>Observed pathways</h3>
          <p>Measured pageviews paired with approximate same-session downstream steps.</p>
        </div>
        <div class="dashboard-journeys">
          ${model.funnel.paths.length
            ? model.funnel.paths
                .map(
                  (path) => `
                    <article class="dashboard-journey">
                      <div>
                        <p class="dashboard-journey__kicker">${escapeHtml(path.discovery_type.replace(/-/g, " "))}</p>
                        <h3>${escapeHtml(path.discovery_source)}</h3>
                        <p>${escapeHtml(path.title)}</p>
                      </div>
                      <p class="dashboard-journey__meta">${path.views} views ${DOT} ${path.reads} reads ${DOT} ${path.pdf_downloads} PDFs</p>
                    </article>
                  `
                )
                .join("")
            : `<p class="dashboard-empty">No journey paths match this filter.</p>`}
        </div>
      </section>
    </div>
  `;
}

function renderSourcesRefined(root, model, state) {
  if (!root) {
    return;
  }
  root.innerHTML = `
    <div class="dashboard-source-list">
      ${model.sources.rows.length
        ? model.sources.rows
            .map((source) => {
              const label = state.scale === "rate" ? `${source.read_rate.toFixed(1)}% read rate` : `${source.pageviews} views`;
              return `
                <article class="dashboard-source">
                  <div>
                    <p class="dashboard-source__kicker">${state.scale === "rate" ? "Efficiency" : "Scale"}</p>
                    <h3>${escapeHtml(source.source)}</h3>
                    <p>${label}</p>
                  </div>
                  <div class="dashboard-source__meta">${source.reads} reads ${DOT} ${source.visitors} visitors</div>
                </article>
              `;
            })
            .join("")
        : `<p class="dashboard-empty">No source data matches this filter.</p>`}
    </div>
  `;
}

function onceWhenVisible(node, renderFn) {
  if (!node) {
    return;
  }

  const nearViewport = node.getBoundingClientRect().top <= window.innerHeight + 180;
  if (node.dataset.dashboardVisible === "true" || nearViewport) {
    node.dataset.dashboardVisible = "true";
    renderFn();
    return;
  }

  if (!("IntersectionObserver" in window)) {
    node.dataset.dashboardVisible = "true";
    renderFn();
    return;
  }

  if (node._dashboardObserver) {
    node._dashboardObserver.disconnect();
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      node.dataset.dashboardVisible = "true";
      renderFn();
    }
  }, { rootMargin: "180px 0px" });

  node._dashboardObserver = observer;
  observer.observe(node);
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function syncDashboardHistory(query, historyMode, lastQuery) {
  const nextUrl = new URL(window.location.href);
  nextUrl.search = query ? `?${query}` : "";
  nextUrl.hash = window.location.hash;

  try {
    if (historyMode === "push" && query !== lastQuery) {
      window.history.pushState({ query }, "", nextUrl.toString());
    } else if (historyMode !== "skip") {
      window.history.replaceState({ query }, "", nextUrl.toString());
    }
  } catch (error) {
    // Chromium restricts session-history rewrites on file:// URLs, which is how the CI smoke build is opened.
    if (window.location.protocol !== "file:") {
      throw error;
    }
  }
}

function initDashboard() {
  const shell = document.querySelector("[data-dashboard-shell]");
  if (!shell) {
    return;
  }

  const rawData = readJsonScript("dashboard-data");
  const data = buildDashboardModel(rawData, window.location.search).data;
  const roots = {
    kpis: document.querySelector("[data-dashboard-kpis]"),
    trend: document.querySelector("[data-dashboard-trend]"),
    multiples: document.querySelector("[data-dashboard-multiples]"),
    signals: document.querySelector("[data-dashboard-signals]"),
    sectionExplorer: document.querySelector("[data-dashboard-section-explorer]"),
    essayExplorer: document.querySelector("[data-dashboard-essay-explorer]"),
    scatter: document.querySelector("[data-dashboard-scatter]"),
    scatterDetails: document.querySelector("[data-dashboard-scatter-details]"),
    leaderboard: document.querySelector("[data-dashboard-leaderboard]"),
    funnel: document.querySelector("[data-dashboard-funnel]"),
    sources: document.querySelector("[data-dashboard-sources]")
  };
  const controls = {
    period: document.querySelector("[data-dashboard-period]"),
    section: document.querySelector("[data-dashboard-section]"),
    sourceType: document.querySelector("[data-dashboard-source-type]"),
    scale: document.querySelector("[data-dashboard-scale]"),
    sort: document.querySelector("[data-dashboard-sort]"),
    exportCsv: document.querySelector("[data-dashboard-export]")
  };

  controls.section.innerHTML = `<option value="all">All sections</option>${data.sectionOptions
    .map((section) => `<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`)
    .join("")}`;
  controls.sourceType.innerHTML = `<option value="all">All source types</option>${data.sourceTypeOptions
    .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
    .join("")}`;

  let state = createState(data, window.location.search);
  let lastQuery = serializeState(state);

  function applyState(nextState, historyMode = "push") {
    state = createState(data, `?${serializeState(nextState)}`);
    render(historyMode);
  }

  function render(historyMode = "replace") {
    const query = serializeState(state);
    syncDashboardHistory(query, historyMode, lastQuery);
    lastQuery = query;

    [controls.period.value, controls.section.value, controls.sourceType.value, controls.scale.value, controls.sort.value] = [
      state.period,
      state.section,
      state.sourceType,
      state.scale,
      state.sort
    ];

    const model = buildDashboardModel(rawData, `?${query}`);
    state = model.state;

    renderKpis(roots.kpis, model);
    renderTrend(roots.trend, state, model.trend);
    renderSmallMultiples(roots.multiples, model.smallMultiples);
    renderInsights(roots.signals, model.insights);
    renderSectionExplorer(roots.sectionExplorer, model);
    renderEssayExplorer(roots.essayExplorer, model);
    renderScatter(roots.scatter, roots.scatterDetails, state, model);
    renderLeaderboard(roots.leaderboard, model);
    onceWhenVisible(roots.funnel, () => renderFunnelRefined(roots.funnel, model));
    onceWhenVisible(roots.sources, () => renderSourcesRefined(roots.sources, model, state));

    document.querySelectorAll("[data-metric]").forEach((button) => {
      button.addEventListener("click", () => {
        applyState({ ...state, metric: button.getAttribute("data-metric") || state.metric }, "push");
      });
    });

    document.querySelectorAll("[data-select-essay]").forEach((button) => {
      button.addEventListener("click", () => {
        const selectedPath = button.getAttribute("data-select-essay") || "";
        const essay = model.data.essays.find((row) => row.path === selectedPath);
        applyState(
          {
            ...state,
            selectedEssay: selectedPath,
            selectedSection: essay?.section || state.selectedSection
          },
          "push"
        );
      });
    });

    document.querySelectorAll("[data-select-section]").forEach((button) => {
      button.addEventListener("click", () => {
        const selectedSection = button.getAttribute("data-select-section") || "";
        const leadEssay = [...model.data.essays]
          .filter((row) => row.section === selectedSection)
          .sort((left, right) => right.views - left.views)[0];
        applyState(
          {
            ...state,
            selectedSection,
            selectedEssay: leadEssay?.path || ""
          },
          "push"
        );
      });
    });

    document.querySelectorAll("[data-compare-section]").forEach((button) => {
      button.addEventListener("click", () => {
        applyState(
          {
            ...state,
            compareSections: toggleList(state.compareSections, button.getAttribute("data-compare-section") || "")
          },
          "push"
        );
      });
    });

    document.querySelectorAll("[data-compare-essay]").forEach((button) => {
      button.addEventListener("click", () => {
        applyState(
          {
            ...state,
            compareEssays: toggleList(state.compareEssays, button.getAttribute("data-compare-essay") || "")
          },
          "push"
        );
      });
    });

    document.querySelectorAll("[data-reset-drilldown]").forEach((button) => {
      button.addEventListener("click", () => {
        applyState(
          {
            ...state,
            selectedSection: "",
            selectedEssay: "",
            compareSections: [],
            compareEssays: []
          },
          "push"
        );
      });
    });

    controls.exportCsv.onclick = () => {
      downloadCsv("outside-in-print-dashboard.csv", rowsToCsv(leaderboardRows(model)));
    };
  }

  [
    [controls.period, "period"],
    [controls.section, "section"],
    [controls.sourceType, "sourceType"],
    [controls.scale, "scale"],
    [controls.sort, "sort"]
  ].forEach(([node, key]) => {
    node.addEventListener("change", () => {
      applyState({ ...state, [key]: node.value }, "push");
    });
  });

  window.addEventListener("popstate", () => {
    state = createState(data, window.location.search);
    render("skip");
  });

  render("replace");
}

initDashboard();
