export const METRICS = [
  { key: "pageviews", label: "Pageviews", kind: "number" },
  { key: "unique_visitors", label: "Unique visitors", kind: "number" },
  { key: "reads", label: "Read events", kind: "number" },
  { key: "read_rate", label: "Read rate", kind: "percent" },
  { key: "pdf_downloads", label: "PDF downloads", kind: "number" },
  { key: "newsletter_submits", label: "Newsletter submits", kind: "number" }
];

const MIN_CONFIDENT_WINDOW_VIEWS = 10;
const MIN_CONFIDENT_ESSAY_VIEWS = 10;
const MIN_CONFIDENT_PATH_VIEWS = 5;

const DEFAULT_STATE = {
  period: "30d",
  section: "all",
  sourceType: "all",
  metric: "pageviews",
  scale: "absolute",
  sort: "views",
  selectedSection: "",
  compareSections: [],
  compareEssays: [],
  selectedEssay: ""
};

const PUBLIC_SITE_HOST = "outsideinprint.org";
const SEARCH_ENGINE_HOSTS = ["google.com", "bing.com", "duckduckgo.com", "search.yahoo.com", "yahoo.com", "ecosia.org", "search.brave.com", "startpage.com", "kagi.com"];
const AI_ANSWER_ENGINE_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "perplexity.ai", "gemini.google.com", "copilot.microsoft.com"];
const NEWSLETTER_HOSTS = ["buttondown.email", "buttondown.com"];
const SOURCE_TYPE_LABELS = {
  organic_search: "Organic search",
  ai_answer_engine: "AI answer engine",
  direct: "Direct",
  internal: "Internal",
  legacy_domain: "Legacy domain",
  newsletter: "Newsletter",
  social_or_referral: "Social/referral"
};

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeText(value, fallback = "") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSectionLabel(value, fallback = "Unlabeled") {
  const text = safeText(value).trim();
  if (!text) {
    return fallback;
  }

  const normalized = text.toLowerCase();
  if (normalized === "essay" || normalized === "essays") {
    return "Essays";
  }
  if (normalized === "working paper" || normalized === "working papers" || normalized === "working-paper" || normalized === "working-papers") {
    return "Working Papers";
  }
  if (normalized === "dialogue" || normalized === "dialogues") {
    return "Dialogues";
  }
  if (normalized === "syd and oliver" || normalized === "syd & oliver" || normalized === "s and o" || normalized === "s & o") {
    return "Dialogues";
  }
  if (normalized === "collection" || normalized === "collections") {
    return "Collections";
  }

  return text;
}

function sortByDate(rows) {
  return [...rows].sort((left, right) => safeText(left.date).localeCompare(safeText(right.date)));
}

function sumMetric(rows, key) {
  return rows.reduce((total, row) => total + safeNumber(row[key]), 0);
}

function rateMetric(reads, views) {
  return views > 0 ? Math.round((reads / views) * 1000) / 10 : 0;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseListParam(value) {
  if (!value) {
    return [];
  }

  return uniqueValues(
    String(value)
      .split(",")
      .map((item) => item.trim())
  );
}

function normalizeList(values, validValues, limit = 4) {
  const valid = new Set(validValues);
  return uniqueValues(values).filter((item) => valid.has(item)).slice(0, limit);
}

function hostMatches(candidate, hosts) {
  const normalized = safeText(candidate).toLowerCase();
  if (!normalized) {
    return false;
  }

  return hosts.some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

function sourceDescriptor(source) {
  const text = safeText(source).trim();
  if (!text) {
    return { text: "", host: "", path: "" };
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(text)
      ? `https://${text}`
      : "";

  if (candidate) {
    try {
      const url = new URL(candidate);
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      return {
        text,
        host,
        path: safeText(url.pathname)
      };
    } catch {
      return { text, host: "", path: "" };
    }
  }

  return { text, host: "", path: "" };
}

function isLegacyDomainSource(source) {
  const descriptor = sourceDescriptor(source);
  return (
    (descriptor.host === "lpeasy.github.io" && (descriptor.path === "/outsideinprint" || descriptor.path.startsWith("/outsideinprint/"))) ||
    descriptor.text.toLowerCase().startsWith("lpeasy.github.io/outsideinprint")
  );
}

function isCurrentSiteSource(source) {
  const descriptor = sourceDescriptor(source);
  return hostMatches(descriptor.host, [PUBLIC_SITE_HOST]);
}

function isNewsletterSource(source, medium, campaign) {
  const descriptor = sourceDescriptor(source);
  const sourceText = descriptor.text.toLowerCase();
  const mediumText = safeText(medium).toLowerCase();
  const campaignText = safeText(campaign).toLowerCase();
  return (
    mediumText === "email" ||
    mediumText === "newsletter" ||
    hostMatches(descriptor.host, NEWSLETTER_HOSTS) ||
    /buttondown|newsletter/.test(sourceText) ||
    /buttondown|newsletter/.test(campaignText)
  );
}

function isAiAnswerEngineSource(source) {
  const descriptor = sourceDescriptor(source);
  return hostMatches(descriptor.host, AI_ANSWER_ENGINE_HOSTS) || /\b(chatgpt|openai|claude|perplexity|copilot|gemini)\b/i.test(descriptor.text);
}

function isSearchEngineSource(source) {
  const descriptor = sourceDescriptor(source);
  return hostMatches(descriptor.host, SEARCH_ENGINE_HOSTS) || /\b(google|bing|duckduckgo|yahoo|ecosia|brave search|startpage|kagi)\b/i.test(descriptor.text);
}

function inferSourceTypeFromFields(row) {
  const source = safeText(row.source || row.discovery_source).toLowerCase();
  const medium = safeText(row.medium).toLowerCase();
  const campaign = safeText(row.campaign).toLowerCase();

  if (source === "internal") {
    return "internal";
  }
  if (source === "direct" || (!source && !medium && !campaign)) {
    return "direct";
  }
  if (isLegacyDomainSource(source)) {
    return "legacy_domain";
  }
  if (isCurrentSiteSource(source)) {
    return "internal";
  }
  if (isNewsletterSource(source, medium, campaign)) {
    return "newsletter";
  }
  if (isAiAnswerEngineSource(source)) {
    return "ai_answer_engine";
  }
  if (isSearchEngineSource(source)) {
    return "organic_search";
  }

  return "social_or_referral";
}

function sourceTypeFromRow(row) {
  const explicit = safeText(row.acquisition_channel || row.discovery_type || row.source_type || row.type).toLowerCase();
  if (explicit) {
    if (explicit === "internal-module") {
      return "internal";
    }
    if (explicit === "campaign" || explicit === "external") {
      return inferSourceTypeFromFields(row);
    }
    if (explicit === "unknown") {
      return "direct";
    }
    return explicit;
  }

  return inferSourceTypeFromFields(row);
}

export function formatSourceTypeLabel(value) {
  const normalized = sourceTypeFromRow({ source_type: value });
  return SOURCE_TYPE_LABELS[normalized] || normalized.replace(/_/g, " ");
}

export function formatMetricValue(metric, value) {
  if (metric.kind === "percent") {
    return `${safeNumber(value).toFixed(1)}%`;
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(safeNumber(value));
}

export function formatDelta(value, previous, metric) {
  const current = safeNumber(value);
  const baseline = safeNumber(previous);
  const difference = current - baseline;

  if (baseline <= 0 && current <= 0) {
    return "Flat vs previous window";
  }

  if (baseline <= 0) {
    return `${formatMetricValue(metric, difference)} above a zero baseline`;
  }

  const direction = difference > 0 ? "up" : difference < 0 ? "down" : "flat";
  const percent = Math.abs((difference / baseline) * 100);
  if (direction === "flat") {
    return "Flat vs previous window";
  }

  return `${direction} ${percent.toFixed(1)}% vs previous window`;
}

export function filterSeriesByPeriod(rows, period) {
  if (period === "all") {
    return [...rows];
  }

  const days = Number.parseInt(period, 10);
  if (!Number.isFinite(days) || days <= 0) {
    return [...rows];
  }

  return rows.slice(Math.max(0, rows.length - days));
}

function previousComparableWindow(allRows, currentRows) {
  if (!currentRows.length) {
    return [];
  }

  const currentStart = currentRows[0].date;
  const currentIndex = allRows.findIndex((row) => row.date === currentStart);
  if (currentIndex <= 0) {
    return [];
  }

  return allRows.slice(Math.max(0, currentIndex - currentRows.length), currentIndex);
}

function metricDefinition(metricKey) {
  return METRICS.find((metric) => metric.key === metricKey) || METRICS[0];
}

function normalizeSeriesPoint(row) {
  return {
    date: safeText(row.date),
    pageviews: safeNumber(row.pageviews || row.views),
    unique_visitors: safeNumber(row.unique_visitors || row.visitors),
    reads: safeNumber(row.reads),
    read_rate: safeNumber(row.read_rate),
    pdf_downloads: safeNumber(row.pdf_downloads),
    newsletter_submits: safeNumber(row.newsletter_submits)
  };
}

function normalizeJourneyMetricRow(row, labelField) {
  return {
    label: safeText(row[labelField]),
    discovery_type: sourceTypeFromRow(row),
    discovery_mode: safeText(row.discovery_mode),
    module_slot: safeText(row.module_slot),
    collection: safeText(row.collection),
    section: normalizeSectionLabel(row.section),
    slug: safeText(row.slug),
    path: safeText(row.path),
    title: safeText(row.title, safeText(row[labelField], "Untitled")),
    views: safeNumber(row.views),
    reads: safeNumber(row.reads),
    read_rate: safeNumber(row.read_rate),
    pdf_downloads: safeNumber(row.pdf_downloads),
    pdf_rate: safeNumber(row.pdf_rate),
    newsletter_submits: safeNumber(row.newsletter_submits),
    newsletter_rate: safeNumber(row.newsletter_rate),
    approximate_downstream: Boolean(row.approximate_downstream),
    attribution_note: safeText(row.attribution_note)
  };
}

function normalizeEssay(row, essaySeriesMap) {
  const path = safeText(row.path);
  const views = safeNumber(row.views);
  const reads = safeNumber(row.reads);
  return {
    slug: safeText(row.slug),
    path,
    title: safeText(row.title, "Untitled"),
    section: normalizeSectionLabel(row.section),
    views,
    reads,
    read_rate: safeNumber(row.read_rate) || rateMetric(reads, views),
    pdf_downloads: safeNumber(row.pdf_downloads),
    primary_source: safeText(row.primary_source, "Unattributed"),
    series: essaySeriesMap.get(path) || []
  };
}

export function normalizeDashboardData(raw = {}) {
  const overview = {
    range_label: safeText(raw.overview?.range_label, "Snapshot"),
    updated_at: safeText(raw.overview?.updated_at),
    pageviews: safeNumber(raw.overview?.pageviews),
    unique_visitors: safeNumber(raw.overview?.unique_visitors),
    reads: safeNumber(raw.overview?.reads),
    read_rate: safeNumber(raw.overview?.read_rate),
    pdf_downloads: safeNumber(raw.overview?.pdf_downloads),
    newsletter_submits: safeNumber(raw.overview?.newsletter_submits)
  };

  const daily = sortByDate(asArray(raw.timeseries_daily).map(normalizeSeriesPoint));
  const essaySeriesMap = new Map(
    asArray(raw.essays_timeseries).map((essay) => [
      safeText(essay.path),
      sortByDate(asArray(essay.series).map(normalizeSeriesPoint))
    ])
  );

  const essays = asArray(raw.essays).map((row) => normalizeEssay(row, essaySeriesMap));
  const sectionMap = asArray(raw.sections).reduce((map, row) => {
    const section = normalizeSectionLabel(row.section);
    const existing = map.get(section) || {
      section,
      pageviews: 0,
      reads: 0,
      pdf_downloads: 0,
      newsletter_submits: 0,
      sparkline_pageviews: [],
      sparkline_reads: []
    };
    const nextViews = Array.isArray(row.sparkline_pageviews) ? row.sparkline_pageviews.map(safeNumber) : [];
    const nextReads = Array.isArray(row.sparkline_reads) ? row.sparkline_reads.map(safeNumber) : [];
    const sparklineLength = Math.max(existing.sparkline_pageviews.length, nextViews.length);

    existing.pageviews += safeNumber(row.pageviews || row.views);
    existing.reads += safeNumber(row.reads);
    existing.pdf_downloads += safeNumber(row.pdf_downloads);
    existing.newsletter_submits += safeNumber(row.newsletter_submits);
    existing.sparkline_pageviews = Array.from({ length: sparklineLength }, (_, index) => safeNumber(existing.sparkline_pageviews[index]) + safeNumber(nextViews[index]));
    existing.sparkline_reads = Array.from({ length: sparklineLength }, (_, index) => safeNumber(existing.sparkline_reads[index]) + safeNumber(nextReads[index]));
    map.set(section, existing);
    return map;
  }, new Map());
  const sections = [...sectionMap.values()]
    .map((row) => ({
      ...row,
      read_rate: safeNumber(row.pageviews) > 0 ? rateMetric(row.reads, row.pageviews) : 0
    }))
    .sort((left, right) => right.pageviews - left.pageviews || right.reads - left.reads);

  const journeys = asArray(raw.journeys).map((row) => ({
    discovery_source: safeText(row.discovery_source, "Direct"),
    discovery_type: sourceTypeFromRow(row),
    discovery_mode: safeText(row.discovery_mode, "article-discovery"),
    module_slot: safeText(row.module_slot),
    collection: safeText(row.collection),
    slug: safeText(row.slug),
    path: safeText(row.path),
    title: safeText(row.title, "Untitled"),
    section: normalizeSectionLabel(row.section),
    views: safeNumber(row.views),
    reads: safeNumber(row.reads),
    pdf_downloads: safeNumber(row.pdf_downloads),
    newsletter_submits: safeNumber(row.newsletter_submits),
    approximate_downstream: Boolean(row.approximate_downstream),
    attribution_note: safeText(row.attribution_note)
  }));
  const journeyBySource = asArray(raw.journey_by_source).map((row) => normalizeJourneyMetricRow(row, "discovery_source"));
  const journeyByCollection = asArray(raw.journey_by_collection).map((row) => normalizeJourneyMetricRow(row, "collection_label"));
  const journeyByEssay = asArray(raw.journey_by_essay).map((row) => normalizeJourneyMetricRow(row, "title"));

  const sources = asArray(raw.sources).map((row) => {
    const pageviews = safeNumber(row.pageviews || row.views);
    const reads = safeNumber(row.reads);
    return {
      source: safeText(row.source, "Direct"),
      medium: safeText(row.medium),
      campaign: safeText(row.campaign),
      content: safeText(row.content),
      visitors: safeNumber(row.visitors),
      pageviews,
      reads,
      read_rate: rateMetric(reads, pageviews)
    };
  });

  const sourceSeries = sortByDate(asArray(raw.sources_timeseries).map((row) => ({
    date: safeText(row.date),
    source_type: sourceTypeFromRow(row),
    source: safeText(row.source, "Direct"),
    pageviews: safeNumber(row.pageviews || row.views),
    reads: safeNumber(row.reads),
    read_rate: safeNumber(row.read_rate),
    pdf_downloads: safeNumber(row.pdf_downloads),
    newsletter_submits: safeNumber(row.newsletter_submits)
  })));

  return {
    overview,
    daily,
    sections,
    essays,
    journeys,
    journeyBySource,
    journeyByCollection,
    journeyByEssay,
    sources,
    sourceSeries,
    periods: asArray(raw.periods),
    sectionOptions: uniqueValues(sections.map((row) => row.section).concat(essays.map((row) => row.section))).sort(),
    sourceTypeOptions: uniqueValues(journeys.map(sourceTypeFromRow).concat(sourceSeries.map(sourceTypeFromRow))).sort()
  };
}

export function createState(data, query = "") {
  const params = new URLSearchParams(String(query).replace(/^\?/, ""));
  const state = { ...DEFAULT_STATE };

  Object.keys(DEFAULT_STATE).forEach((key) => {
    if (params.has(key)) {
      state[key] = Array.isArray(DEFAULT_STATE[key]) ? parseListParam(params.get(key)) : params.get(key) || DEFAULT_STATE[key];
    }
  });

  if (!data.sectionOptions.includes(state.section) && state.section !== "all") {
    state.section = normalizeSectionLabel(state.section, "");
  }

  if (!data.sectionOptions.includes(state.section) && state.section !== "all") {
    state.section = "all";
  }

  if (!data.sourceTypeOptions.includes(state.sourceType) && state.sourceType !== "all") {
    state.sourceType = "all";
  }

  if (!METRICS.some((metric) => metric.key === state.metric)) {
    state.metric = DEFAULT_STATE.metric;
  }

  state.selectedSection = normalizeSectionLabel(state.selectedSection, "");
  if (!data.sectionOptions.includes(state.selectedSection)) {
    state.selectedSection = "";
  }

  state.compareSections = normalizeList(state.compareSections.map((value) => normalizeSectionLabel(value, "")), data.sectionOptions);

  const essayPaths = data.essays.map((row) => row.path);
  if (!essayPaths.includes(state.selectedEssay)) {
    state.selectedEssay = "";
  }

  state.compareEssays = normalizeList(state.compareEssays, essayPaths);

  return state;
}

export function serializeState(state) {
  const params = new URLSearchParams();
  Object.entries(state).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length) {
        params.set(key, value.join(","));
      }
      return;
    }

    if (value && value !== DEFAULT_STATE[key]) {
      params.set(key, value);
    }
  });
  return params.toString();
}

function matchesSection(row, state) {
  return state.section === "all" || safeText(row.section) === state.section;
}

function matchesSourceType(row, state) {
  return state.sourceType === "all" || sourceTypeFromRow(row) === state.sourceType;
}

function annotateEssay(row, state) {
  const series = filterSeriesByPeriod(row.series || [], state.period);
  const previous = previousComparableWindow(row.series || [], series);
  return {
    ...row,
    trend: series.map((point) => point.pageviews),
    recent_views: sumMetric(series, "pageviews"),
    recent_reads: sumMetric(series, "reads"),
    recent_pdf_downloads: sumMetric(series, "pdf_downloads"),
    recent_newsletter_submits: sumMetric(series, "newsletter_submits"),
    recent_read_rate: rateMetric(sumMetric(series, "reads"), sumMetric(series, "pageviews")),
    previous_views: sumMetric(previous, "pageviews")
  };
}

function sumSeriesRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    (row.series || []).forEach((point) => {
      const existing = map.get(point.date) || {
        date: point.date,
        pageviews: 0,
        unique_visitors: 0,
        reads: 0,
        read_rate: 0,
        pdf_downloads: 0,
        newsletter_submits: 0
      };
      existing.pageviews += safeNumber(point.pageviews);
      existing.reads += safeNumber(point.reads);
      existing.pdf_downloads += safeNumber(point.pdf_downloads);
      existing.newsletter_submits += safeNumber(point.newsletter_submits);
      map.set(point.date, existing);
    });
  });

  return sortByDate([...map.values()]).map((point) => ({
    ...point,
    read_rate: rateMetric(point.reads, point.pageviews)
  }));
}

function sparklineDelta(values) {
  if (!values.length) {
    return 0;
  }

  return safeNumber(values[values.length - 1]) - safeNumber(values[0]);
}

function comparisonRows(rows, selectedValue, compareValues, labelKey) {
  return uniqueValues([selectedValue].concat(compareValues).filter(Boolean))
    .map((value) => rows.find((row) => row[labelKey] === value))
    .filter(Boolean)
    .slice(0, 4);
}

export function buildKpis(data, state) {
  const current = filterSeriesByPeriod(data.daily, state.period);
  const previous = previousComparableWindow(data.daily, current);
  const fallback = data.overview;

  return METRICS.map((metric) => {
    const total =
      metric.key === "read_rate"
        ? current.length
          ? rateMetric(sumMetric(current, "reads"), sumMetric(current, "pageviews"))
          : safeNumber(fallback[metric.key])
        : current.length
          ? sumMetric(current, metric.key)
          : safeNumber(fallback[metric.key]);
    const previousTotal =
      metric.key === "read_rate"
        ? previous.length
          ? rateMetric(sumMetric(previous, "reads"), sumMetric(previous, "pageviews"))
          : 0
        : previous.length
          ? sumMetric(previous, metric.key)
          : 0;
    return {
      ...metric,
      value: total,
      previous: previousTotal,
      deltaText: formatDelta(total, previousTotal, metric),
      sparkline: (current.length ? current : data.daily).map((point) => safeNumber(point[metric.key])),
      summary: `${metric.label}: ${formatMetricValue(metric, total)}. ${formatDelta(total, previousTotal, metric)}.`
    };
  });
}

export function buildTrend(data, state) {
  const metric = metricDefinition(state.metric);
  const series = filterSeriesByPeriod(data.daily, state.period);
  const points = series.map((row) => ({
    date: row.date,
    label: row.date,
    value: safeNumber(row[metric.key])
  }));
  const activePoint = points[points.length - 1] || null;
  return { metric, points, activePoint };
}

export function buildSmallMultiples(data, state) {
  const series = filterSeriesByPeriod(data.daily, state.period);
  return METRICS.map((metric) => ({
    ...metric,
    values: series.map((row) => safeNumber(row[metric.key])),
    total: metric.key === "read_rate" ? rateMetric(sumMetric(series, "reads"), sumMetric(series, "pageviews")) : sumMetric(series, metric.key)
  }));
}

export function buildScatter(data, state) {
  const essays = data.essays.filter((row) => matchesSection(row, state)).map((row) => annotateEssay(row, state));
  const candidates = essays.filter((row) => row.views > 0);
  const medianViews = candidates.length
    ? [...candidates].sort((left, right) => left.views - right.views)[Math.floor(candidates.length / 2)].views
    : 0;
  const medianRate = candidates.length
    ? [...candidates].sort((left, right) => left.read_rate - right.read_rate)[Math.floor(candidates.length / 2)].read_rate
    : 0;

  return {
    medianViews,
    medianRate,
    points: candidates.map((row) => ({
      ...row,
      size: Math.max(10, Math.sqrt(Math.max(row.pdf_downloads, 1)) * 8),
      quadrant:
        row.views >= medianViews && row.read_rate >= medianRate
          ? "High traffic / high completion"
          : row.views >= medianViews
            ? "High traffic / low completion"
            : row.read_rate >= medianRate
              ? "Low traffic / high completion"
              : "Developing"
    }))
  };
}

export function buildLeaderboard(data, state) {
  const rows = data.essays.filter((row) => matchesSection(row, state)).map((row) => annotateEssay(row, state));
  const sorters = {
    views: (row) => row.views,
    reads: (row) => row.reads,
    read_rate: (row) => row.read_rate,
    pdf_downloads: (row) => row.pdf_downloads,
    recent_views: (row) => row.recent_views
  };
  const sorter = sorters[state.sort] || sorters.views;

  return rows.sort((left, right) => sorter(right) - sorter(left)).slice(0, 12);
}

function aggregateJourneyRows(rows, labelKey) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row[labelKey];
    const existing = map.get(key) || {
      label: row[labelKey],
      views: 0,
      reads: 0,
      pdf_downloads: 0,
      newsletter_submits: 0
    };
    existing.views += safeNumber(row.views);
    existing.reads += safeNumber(row.reads);
    existing.pdf_downloads += safeNumber(row.pdf_downloads);
    existing.newsletter_submits += safeNumber(row.newsletter_submits);
    map.set(key, existing);
  });

  return [...map.values()].map((row) => ({
    ...row,
    read_rate: rateMetric(row.reads, row.views),
    pdf_rate: rateMetric(row.pdf_downloads, row.views),
    newsletter_rate: rateMetric(row.newsletter_submits, row.views)
  }));
}

export function buildFunnel(data, state) {
  const paths = data.journeys.filter((row) => matchesSection(row, state) && matchesSourceType(row, state));
  const sourceRows = data.journeyBySource.filter((row) => matchesSourceType(row, state));
  const collectionRows = data.journeyByCollection.filter((row) => matchesSection(row, state) && matchesSourceType(row, state));
  const essayRows = data.journeyByEssay.filter((row) => matchesSection(row, state));
  const byType = aggregateJourneyRows(sourceRows, "discovery_type")
    .sort((left, right) => right.views - left.views)
    .slice(0, 5);
  const byMode = aggregateJourneyRows(paths.map((row) => ({ ...row, mode_label: row.discovery_mode })), "mode_label")
    .sort((left, right) => right.reads - left.reads);

  return {
    steps: [
      { key: "views", label: "Discovery to pageview", value: sumMetric(paths, "views"), approximate: false },
      { key: "reads", label: "Read events", value: sumMetric(paths, "reads"), approximate: true },
      { key: "pdf_downloads", label: "PDF downloads", value: sumMetric(paths, "pdf_downloads"), approximate: true },
      { key: "newsletter_submits", label: "Newsletter submits", value: sumMetric(paths, "newsletter_submits"), approximate: true }
    ],
    paths: paths
      .sort((left, right) => safeNumber(right.reads) - safeNumber(left.reads) || safeNumber(right.views) - safeNumber(left.views))
      .slice(0, 8),
    sourceFunnel: byType,
    modeComparison: byMode,
    sourceLeaders: sourceRows
      .sort((left, right) => (state.scale === "rate" ? right.read_rate - left.read_rate : right.reads - left.reads || right.views - left.views))
      .slice(0, 6),
    collectionLeaders: collectionRows
      .sort((left, right) => (state.scale === "rate" ? right.read_rate - left.read_rate : right.reads - left.reads || right.views - left.views))
      .slice(0, 6),
    essayConversion: essayRows
      .filter((row) => row.views > 0)
      .sort((left, right) => (state.scale === "rate" ? right.read_rate - left.read_rate : right.views - left.views))
      .slice(0, 6)
  };
}

export function buildSources(data, state) {
  const normalizedRows = data.sources.map((row) => ({ ...row, source_type: sourceTypeFromRow(row) }));
  const rows = normalizedRows
    .filter((row) => matchesSourceType(row, state))
    .sort((left, right) =>
      state.scale === "rate" ? right.read_rate - left.read_rate : right.pageviews - left.pageviews
    )
    .slice(0, 10);

  const periodRows = filterSeriesByPeriod(data.sourceSeries, state.period).map((row) => ({
    ...row,
    source_type: sourceTypeFromRow(row)
  }));
  const mix = periodRows
    .filter((row) => matchesSourceType(row, state))
    .reduce((map, row) => {
      const key = `${row.date}:${row.source_type}`;
      const existing = map.get(key) || { date: row.date, source_type: row.source_type, pageviews: 0, reads: 0 };
      existing.pageviews += safeNumber(row.pageviews);
      existing.reads += safeNumber(row.reads);
      map.set(key, existing);
      return map;
    }, new Map());

  const externalChannels = new Set(["organic_search", "ai_answer_engine", "newsletter", "social_or_referral"]);
  const summary = {
    externalPageviews: sumMetric(periodRows.filter((row) => externalChannels.has(row.source_type)), "pageviews"),
    selfReferralPageviews: sumMetric(periodRows.filter((row) => row.source_type === "internal" || row.source_type === "legacy_domain"), "pageviews"),
    directPageviews: sumMetric(periodRows.filter((row) => row.source_type === "direct"), "pageviews"),
    searchPageviews: sumMetric(periodRows.filter((row) => row.source_type === "organic_search" || row.source_type === "ai_answer_engine"), "pageviews"),
    aiAnswerEnginePageviews: sumMetric(periodRows.filter((row) => row.source_type === "ai_answer_engine"), "pageviews")
  };

  return { rows, mix: [...mix.values()], summary };
}

export function buildSectionExplorer(data, state) {
  const sectionCards = (data.sections.length ? data.sections : data.sectionOptions.map((section) => ({ section }))).map((row) => ({
    section: row.section,
    pageviews: safeNumber(row.pageviews),
    reads: safeNumber(row.reads),
    read_rate: safeNumber(row.read_rate),
    pdf_downloads: safeNumber(row.pdf_downloads),
    newsletter_submits: safeNumber(row.newsletter_submits),
    sparkline: row.sparkline_pageviews || []
  }));

  const selectedSection =
    state.selectedSection ||
    (state.section !== "all" ? state.section : "") ||
    sectionCards[0]?.section ||
    "";
  const sectionEssays = data.essays.filter((row) => row.section === selectedSection).map((row) => annotateEssay(row, state));
  const sectionTrend = filterSeriesByPeriod(sumSeriesRows(sectionEssays), state.period);
  const fallbackSection = sectionCards.find((row) => row.section === selectedSection) || {
    section: selectedSection || "Overview",
    pageviews: 0,
    reads: 0,
    read_rate: 0,
    pdf_downloads: 0,
    newsletter_submits: 0,
    sparkline: []
  };
  const sourceMix = aggregateJourneyRows(
    data.journeys.filter((row) => row.section === selectedSection && matchesSourceType(row, state)),
    "discovery_source"
  )
    .sort((left, right) => right.views - left.views)
    .slice(0, 4);

  const compare = comparisonRows(sectionCards, selectedSection, state.compareSections, "section").map((row) => ({
    ...row,
    delta: sparklineDelta(row.sparkline)
  }));

  return {
    cards: sectionCards.map((row) => ({
      ...row,
      isSelected: row.section === selectedSection,
      isCompared: state.compareSections.includes(row.section)
    })),
    selected: {
      ...fallbackSection,
      trend: sectionTrend,
      topEssays: [...sectionEssays].sort((left, right) => right.views - left.views).slice(0, 4),
      completionLeaders: [...sectionEssays]
        .filter((row) => row.views > 0)
        .sort((left, right) => right.read_rate - left.read_rate || right.views - left.views)
        .slice(0, 4),
      sourceMix,
      note: sectionTrend.length
        ? "Section trend is aggregated from essay-level daily series inside the selected section."
        : "Section trend falls back to the committed section snapshot when no essay-level daily series is available."
    },
    compare
  };
}

export function buildEssayExplorer(data, state) {
  const scopedSection = state.selectedSection || (state.section !== "all" ? state.section : "");
  const essayPool = data.essays.filter((row) => !scopedSection || row.section === scopedSection);
  const sortedPool = essayPool.length ? buildLeaderboard(data, { ...state, section: scopedSection || state.section }) : [];
  const selectedEssayPath =
    sortedPool.find((row) => row.path === state.selectedEssay)?.path ||
    state.selectedEssay ||
    sortedPool[0]?.path ||
    "";
  const selectedEssay = (essayPool.length ? essayPool : data.essays)
    .map((row) => annotateEssay(row, state))
    .find((row) => row.path === selectedEssayPath) || null;

  const sourceMix = selectedEssay
    ? aggregateJourneyRows(
        data.journeys.filter((row) => row.path === selectedEssay.path && matchesSourceType(row, state)),
        "discovery_source"
      )
        .sort((left, right) => right.views - left.views)
        .slice(0, 4)
    : [];
  const journeyRecord = selectedEssay ? data.journeyByEssay.find((row) => row.path === selectedEssay.path) || null : null;
  const compare = comparisonRows(
    data.essays.map((row) => annotateEssay(row, state)),
    selectedEssay?.path || "",
    state.compareEssays,
    "path"
  );

  return {
    selected: selectedEssay
      ? {
          ...selectedEssay,
          trend: filterSeriesByPeriod(selectedEssay.series || [], state.period),
          sourceMix,
          journeyRecord,
          related: sortedPool.filter((row) => row.path !== selectedEssay.path).slice(0, 4)
        }
      : null,
    compare
  };
}

export function deriveInsights(data, state) {
  const leaderboard = buildLeaderboard(data, state);
  const funnel = buildFunnel(data, state);
  const sources = buildSources(data, state).rows;
  const currentWindow = filterSeriesByPeriod(data.daily, state.period);
  const windowViews = sumMetric(currentWindow, "pageviews");

  if (!data.daily.length && !leaderboard.length) {
    return [
      {
        title: "Awaiting the first trendable refresh",
        body: "The committed snapshot still renders, but daily trend, section, and journey files are empty until the next analytics refresh."
      }
    ];
  }

  if (windowViews > 0 && windowViews < MIN_CONFIDENT_WINDOW_VIEWS) {
    return [
      {
        title: "Sample still too small for strong claims",
        body: `The current window has ${windowViews} measured pageviews, so the dashboard keeps the signals conservative until the sample is less fragile.`
      }
    ];
  }

  const risingEssay = leaderboard
    .filter((essay) => essay.views >= MIN_CONFIDENT_ESSAY_VIEWS)
    .filter((essay) => essay.trend.length >= 4)
    .map((essay) => {
      const midpoint = Math.floor(essay.trend.length / 2);
      const previous = essay.trend.slice(0, midpoint).reduce((total, value) => total + value, 0);
      const current = essay.trend.slice(midpoint).reduce((total, value) => total + value, 0);
      return { essay, lift: current - previous };
    })
    .sort((left, right) => right.lift - left.lift)[0];

  const readRateLeader = leaderboard
    .filter((essay) => essay.views >= MIN_CONFIDENT_ESSAY_VIEWS)
    .sort((left, right) => right.read_rate - left.read_rate)[0];

  const pathwayLeader = funnel.paths
    .filter((path) => path.views >= MIN_CONFIDENT_PATH_VIEWS)
    .filter((path) => /internal/.test(path.discovery_type))
    .sort((left, right) => right.reads - left.reads)[0];
  const collectionLeader = funnel.collectionLeaders
    .filter((row) => row.views >= MIN_CONFIDENT_PATH_VIEWS)
    .sort((left, right) => right.reads - left.reads || right.read_rate - left.read_rate)[0];
  const weakCompletionSource = funnel.sourceLeaders
    .filter((row) => row.views >= MIN_CONFIDENT_PATH_VIEWS)
    .sort((left, right) => right.views - left.views || left.read_rate - right.read_rate)
    .find((row) => row.read_rate < 50);

  const sourceLeader = sources.find((row) => row.pageviews >= MIN_CONFIDENT_PATH_VIEWS);

  const pdfLeader = leaderboard
    .filter((essay) => essay.views >= MIN_CONFIDENT_ESSAY_VIEWS)
    .sort((left, right) => rateMetric(right.pdf_downloads, right.views) - rateMetric(left.pdf_downloads, left.views))[0];

  return [
    risingEssay && {
      title: "Biggest riser",
      body: `${risingEssay.essay.title} gained the strongest view lift inside the selected window.`
    },
    readRateLeader && {
      title: "Strongest completion",
      body: `${readRateLeader.title} leads on read rate above the minimum view threshold.`
    },
    pathwayLeader && {
      title: "Best internal pathway",
      body: `${pathwayLeader.discovery_source} produces the strongest read-through path into ${pathwayLeader.title}.`
    },
    collectionLeader && {
      title: "Strongest discovery engine",
      body: `${collectionLeader.label} is the strongest collection or module pathway for completed reads in the current view.`
    },
    weakCompletionSource && {
      title: "Traffic with weak completion",
      body: `${weakCompletionSource.label} brings volume, but its read-through rate is lagging in the current window.`
    },
    sourceLeader && {
      title: "Largest traffic source",
      body: `${sourceLeader.source} currently brings the most pageviews in the selected view.`
    },
    pdfLeader && {
      title: "PDF conversion leader",
      body: `${pdfLeader.title} is converting the highest share of readers into PDF downloads.`
    }
  ].filter(Boolean);
}

export function rowsToCsv(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
  ];

  return `${lines.join("\n")}\n`;
}

export function buildDashboardModel(raw, query = "") {
  const data = normalizeDashboardData(raw);
  const state = createState(data, query);
  return {
    data,
    state,
    kpis: buildKpis(data, state),
    trend: buildTrend(data, state),
    smallMultiples: buildSmallMultiples(data, state),
    scatter: buildScatter(data, state),
    leaderboard: buildLeaderboard(data, state),
    sectionExplorer: buildSectionExplorer(data, state),
    essayExplorer: buildEssayExplorer(data, state),
    funnel: buildFunnel(data, state),
    sources: buildSources(data, state),
    insights: deriveInsights(data, state)
  };
}
