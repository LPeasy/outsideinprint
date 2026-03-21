export const DASHBOARD_CATEGORIES = [
  {
    key: "overview",
    label: "Overview",
    description: "Key totals, the high-level trend, and a compact metric-shape summary for the current window.",
    controls: ["period"],
    exportKind: null
  },
  {
    key: "performance",
    label: "Content performance",
    description: "Traffic versus completion, with the selected essay and leaderboard kept in one focused view.",
    controls: ["period", "section", "sort"],
    exportKind: "leaderboard"
  },
  {
    key: "sections",
    label: "Sections",
    description: "Section-specific totals, top essays, and source mix without the rest of the dashboard competing for attention.",
    controls: ["period", "sourceType"],
    exportKind: "sections"
  },
  {
    key: "essays",
    label: "Essays",
    description: "A single essay detail view with comparison context and source mix for the selected piece.",
    controls: ["period", "section", "sourceType"],
    exportKind: "essay"
  },
  {
    key: "journey",
    label: "Reader journey",
    description: "Discovery, reading, PDF, and newsletter pathways with measured and approximate steps kept clearly labeled.",
    controls: ["period", "section", "sourceType", "scale"],
    exportKind: "journey"
  },
  {
    key: "sources",
    label: "Traffic sources",
    description: "Referrers and campaigns ranked by scale or efficiency without unrelated editorial drill-downs on the page.",
    controls: ["period", "sourceType", "scale"],
    exportKind: "sources"
  },
  {
    key: "insights",
    label: "Key insights",
    description: "Deterministic editorial signals only, scoped to the active filters and stripped of secondary charts.",
    controls: ["period", "section", "sourceType"],
    exportKind: null
  }
];

export const DEFAULT_CATEGORY = DASHBOARD_CATEGORIES[0].key;

const CATEGORY_MAP = new Map(DASHBOARD_CATEGORIES.map((category) => [category.key, category]));

function normalizeClassName(className) {
  return String(className || "")
    .split(/\s+/)
    .filter(Boolean);
}

function toggleClass(node, className, enabled) {
  if (!node) {
    return;
  }

  if (node.classList && typeof node.classList.toggle === "function") {
    node.classList.toggle(className, enabled);
    return;
  }

  const classes = new Set(normalizeClassName(node.className));
  if (enabled) {
    classes.add(className);
  } else {
    classes.delete(className);
  }
  node.className = [...classes].join(" ");
}

function setNodeAttribute(node, name, value) {
  if (!node) {
    return;
  }

  if (value === null || value === undefined || value === false) {
    if (typeof node.removeAttribute === "function") {
      node.removeAttribute(name);
    } else if (node.attributes) {
      delete node.attributes[name];
    }
    return;
  }

  if (typeof node.setAttribute === "function") {
    node.setAttribute(name, String(value));
    return;
  }

  node.attributes = node.attributes || {};
  node.attributes[name] = String(value);
}

export function resolveDashboardCategory(hash = "") {
  const normalized = String(hash || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();

  return CATEGORY_MAP.has(normalized) ? normalized : DEFAULT_CATEGORY;
}

export function getDashboardCategory(categoryKey) {
  return CATEGORY_MAP.get(resolveDashboardCategory(categoryKey)) || CATEGORY_MAP.get(DEFAULT_CATEGORY);
}

export function buildDashboardCategoryView(activeCategory) {
  const category = getDashboardCategory(activeCategory);
  return {
    activeCategory: category.key,
    category,
    visibleControls: new Set(category.controls),
    visiblePanels: Object.fromEntries(
      DASHBOARD_CATEGORIES.map((entry) => [entry.key, entry.key === category.key])
    )
  };
}

export function applyDashboardCategoryView(activeCategory, nodes = {}) {
  const view = buildDashboardCategoryView(activeCategory);

  if (nodes.shell?.dataset) {
    nodes.shell.dataset.dashboardCategory = view.activeCategory;
  }

  if (nodes.activeTitle) {
    nodes.activeTitle.textContent = view.category.label;
  }

  if (nodes.activeDescription) {
    nodes.activeDescription.textContent = view.category.description;
  }

  (nodes.links || []).forEach((link) => {
    const isActive = link?.dataset?.dashboardCategoryLink === view.activeCategory;
    toggleClass(link, "is-active", isActive);
    setNodeAttribute(link, "aria-current", isActive ? "page" : null);
  });

  (nodes.panels || []).forEach((panel) => {
    const isActive = panel?.dataset?.dashboardCategoryPanel === view.activeCategory;
    if (typeof panel.hidden === "boolean") {
      panel.hidden = !isActive;
    } else if ("hidden" in panel) {
      panel.hidden = !isActive;
    }
    toggleClass(panel, "is-active", isActive);
    setNodeAttribute(panel, "aria-hidden", isActive ? "false" : "true");
  });

  Object.entries(nodes.controls || {}).forEach(([key, node]) => {
    const isVisible = view.visibleControls.has(key);
    if (!node) {
      return;
    }
    if (typeof node.hidden === "boolean") {
      node.hidden = !isVisible;
    } else if ("hidden" in node) {
      node.hidden = !isVisible;
    }
    toggleClass(node, "is-hidden", !isVisible);
  });

  if (nodes.exportControl) {
    const isVisible = Boolean(view.category.exportKind);
    if (typeof nodes.exportControl.hidden === "boolean") {
      nodes.exportControl.hidden = !isVisible;
    } else if ("hidden" in nodes.exportControl) {
      nodes.exportControl.hidden = !isVisible;
    }
  }

  return view;
}
