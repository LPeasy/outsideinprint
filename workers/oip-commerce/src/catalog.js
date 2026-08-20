import { HttpError } from "./http.js";

export const EPUB_PRODUCTS = Object.freeze({
  "OIP-AN-EPUB": Object.freeze({
    sku: "OIP-AN-EPUB",
    title: "The American Nightmare: Keep Dreaming, Kid",
    priceCents: 999,
    r2Key: "epubs/oip-an.epub",
    downloadFilename: "the-american-nightmare.epub",
  }),
  "OIP-PS-EPUB": Object.freeze({
    sku: "OIP-PS-EPUB",
    title: "The Parable of the Sheep",
    priceCents: 999,
    r2Key: "epubs/oip-ps.epub",
    downloadFilename: "the-parable-of-the-sheep.epub",
  }),
  "OIP-WC-EPUB": Object.freeze({
    sku: "OIP-WC-EPUB",
    title: "The Water Cycle: Risk, Infrastructure, and Public Memory",
    priceCents: 999,
    r2Key: "epubs/oip-wc.epub",
    downloadFilename: "the-water-cycle.epub",
  }),
});

export const PAPERBACK_PRODUCTS = Object.freeze({
  "OIP-AN-PB": Object.freeze({
    sku: "OIP-AN-PB",
    title: "The American Nightmare: Keep Dreaming, Kid",
  }),
  "OIP-PS-PB": Object.freeze({
    sku: "OIP-PS-PB",
    title: "The Parable of the Sheep",
  }),
  "OIP-WC-PB": Object.freeze({
    sku: "OIP-WC-PB",
    title: "The Water Cycle: Risk, Infrastructure, and Public Memory",
  }),
});

export function enabledEpubSkus(env) {
  const configured = String(env.EPUB_ENABLED_SKUS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.filter((sku) => Object.hasOwn(EPUB_PRODUCTS, sku)));
}

export function productForSku(sku) {
  return EPUB_PRODUCTS[sku] || null;
}

export function configuredEpubCatalogVariationId(env, sku) {
  const raw = env.SQUARE_EPUB_CATALOG_VARIATION_IDS;
  if (!raw || raw === "SET_DURING_PROVISIONING") {
    throw new HttpError(503, "EPUB_CATALOG_NOT_CONFIGURED", "This EPUB is not available yet.");
  }
  let mapping;
  try {
    mapping = JSON.parse(String(raw));
  } catch {
    throw new HttpError(503, "EPUB_CATALOG_CONFIG_INVALID", "This EPUB is not available yet.");
  }
  if (!mapping || Array.isArray(mapping) || typeof mapping !== "object") {
    throw new HttpError(503, "EPUB_CATALOG_CONFIG_INVALID", "This EPUB is not available yet.");
  }
  const entries = Object.entries(mapping);
  const ids = new Set();
  for (const [configuredSku, variationId] of entries) {
    if (
      !Object.hasOwn(EPUB_PRODUCTS, configuredSku) ||
      typeof variationId !== "string" ||
      !/^[A-Za-z0-9_-]{1,192}$/u.test(variationId) ||
      ids.has(variationId)
    ) {
      throw new HttpError(503, "EPUB_CATALOG_CONFIG_INVALID", "This EPUB is not available yet.");
    }
    ids.add(variationId);
  }
  const variationId = mapping[sku];
  if (!variationId) {
    throw new HttpError(503, "EPUB_CATALOG_NOT_CONFIGURED", "This EPUB is not available yet.");
  }
  return variationId;
}

export function enabledPaperbackSkus(env) {
  const configured = String(env.PAPERBACK_ENABLED_SKUS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.filter((sku) => Object.hasOwn(PAPERBACK_PRODUCTS, sku)));
}

export function paperbackProductForSku(sku) {
  return PAPERBACK_PRODUCTS[sku] || null;
}

export function configuredPaperbackCatalog(env) {
  const raw = env.SQUARE_PAPERBACK_CATALOG;
  if (!raw || raw === "SET_DURING_PROVISIONING") {
    throw new HttpError(503, "PAPERBACK_CATALOG_NOT_CONFIGURED", "Paperback checkout is not available yet.");
  }
  let mapping;
  try {
    mapping = JSON.parse(String(raw));
  } catch {
    throw new HttpError(503, "PAPERBACK_CATALOG_CONFIG_INVALID", "Paperback checkout is not available yet.");
  }
  if (!mapping || Array.isArray(mapping) || typeof mapping !== "object") {
    throw new HttpError(503, "PAPERBACK_CATALOG_CONFIG_INVALID", "Paperback checkout is not available yet.");
  }
  const normalized = new Map();
  const variationIds = new Set();
  for (const [sku, value] of Object.entries(mapping)) {
    const variationId = value?.variation_id;
    const priceCents = value?.price_cents;
    if (
      !Object.hasOwn(PAPERBACK_PRODUCTS, sku) ||
      !value || Array.isArray(value) || typeof value !== "object" ||
      Object.keys(value).some((key) => !["variation_id", "price_cents"].includes(key)) ||
      typeof variationId !== "string" || !/^[A-Za-z0-9_-]{1,192}$/u.test(variationId) ||
      variationIds.has(variationId) ||
      !Number.isSafeInteger(priceCents) || priceCents < 100 || priceCents > 50000
    ) {
      throw new HttpError(503, "PAPERBACK_CATALOG_CONFIG_INVALID", "Paperback checkout is not available yet.");
    }
    variationIds.add(variationId);
    normalized.set(sku, Object.freeze({
      product: PAPERBACK_PRODUCTS[sku],
      catalogObjectId: variationId,
      priceCents,
    }));
  }
  return normalized;
}
