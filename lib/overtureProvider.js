const { gunzipSync } = require("node:zlib");
const { cleanWebsiteUrl, normalizeWebsite } = require("./discoveryUrl");

const DEFAULT_OVERTURE_FEED_URL =
  "https://raw.githubusercontent.com/dev-johan-swart/Site-Rescue-Studio/overture-data/gauteng-places.jsonl.gz";
const OVERTURE_FETCH_TIMEOUT_MS = 15000;
const MAX_COMPRESSED_FEED_BYTES = 25 * 1024 * 1024;
const ALLOWED_LICENSES = new Set(["cdla-permissive-2.0", "cc0-1.0"]);

function validateFeedCandidate(value) {
  if (!value || typeof value !== "object") return null;
  const website = cleanWebsiteUrl(value.website);
  const normalized = normalizeWebsite(website);
  const name = String(value.name || "").trim();
  const city = String(value.city || "").trim();
  const region = String(value.region || "").trim();
  const evidence = value.locationEvidence && typeof value.locationEvidence === "object"
    ? value.locationEvidence
    : null;
  const sources = Array.isArray(evidence?.sources) ? evidence.sources : [];
  const datasets = sources.map(source => String(source?.dataset || "").trim().toLowerCase());
  const licenses = sources.map(source => String(source?.license || "").trim().toLowerCase());

  if (!website || !normalized || !name || !city || region !== "Gauteng") return null;
  if (evidence?.provider !== "overture_maps" || evidence?.country !== "ZA" || evidence?.region_code !== "ZA-GP") return null;
  if (!Number.isFinite(Number(value.confidence)) || Number(value.confidence) < 0.7) return null;
  if (!sources.length || datasets.some(dataset => !dataset || dataset === "foursquare")) return null;
  if (licenses.some(license => !ALLOWED_LICENSES.has(license))) return null;

  return {
    ...value,
    website,
    normalized,
    name,
    city,
    region: "Gauteng",
    provider: "overture",
    locationEvidence: evidence
  };
}

async function discoverOverture({
  maxCandidates = 20,
  pageOffset = 0,
  fetchImpl = fetch,
  feedUrl = process.env.OVERTURE_GAUTENG_FEED_URL || DEFAULT_OVERTURE_FEED_URL
} = {}) {
  const limit = Math.max(1, Math.min(Math.floor(Number(maxCandidates) || 20), 20));
  const requestedOffset = Math.max(0, Math.floor(Number(pageOffset) || 0));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERTURE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(feedUrl, {
      headers: { accept: "application/gzip, application/octet-stream" },
      signal: controller.signal,
      redirect: "follow"
    });
    if (!response?.ok) {
      const error = new Error(`Overture feed returned HTTP ${Number(response?.status || 0)}.`);
      error.status = Number(response?.status || 0) || null;
      error.retryAfter = response?.headers?.get?.("retry-after") || null;
      throw error;
    }

    const compressed = Buffer.from(await response.arrayBuffer());
    if (!compressed.length || compressed.length > MAX_COMPRESSED_FEED_BYTES) {
      throw new Error("Overture feed size is empty or exceeds the 25 MB safety limit.");
    }

    const text = gunzipSync(compressed).toString("utf8");
    const rows = [];
    let invalidRows = 0;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const candidate = validateFeedCandidate(JSON.parse(line));
        if (candidate) rows.push(candidate);
        else invalidRows++;
      } catch {
        invalidRows++;
      }
    }

    if (!rows.length) {
      throw new Error("Overture feed contained no candidates that passed runtime provenance and identity checks.");
    }

    const offset = requestedOffset % rows.length;
    const candidates = rows.slice(offset, offset + limit);
    const nextOffset = (offset + candidates.length) % rows.length;

    return {
      source: "overture_maps",
      provider: "overture",
      candidates,
      candidateCount: candidates.length,
      totalCandidateCount: rows.length,
      page: offset,
      nextOffset,
      invalidRows,
      feedBytes: compressed.length
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_OVERTURE_FEED_URL,
  OVERTURE_FETCH_TIMEOUT_MS,
  validateFeedCandidate,
  discoverOverture
};
