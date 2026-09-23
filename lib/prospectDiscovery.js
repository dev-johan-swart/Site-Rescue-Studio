const DEFAULT_DISCOVERY_QUERIES = [
  "auto repair shops in Pretoria, South Africa",
  "electricians in Pretoria, South Africa",
  "security companies in Pretoria, South Africa",
  "accountants in Pretoria, South Africa",
  "property management companies in Pretoria, South Africa",
  "guesthouses in Pretoria, South Africa",
  "salons in Pretoria, South Africa",
  "auto repair shops in Centurion, South Africa",
  "electricians in Centurion, South Africa",
  "security companies in Centurion, South Africa",
  "accountants in Centurion, South Africa",
  "property management companies in Centurion, South Africa",
  "guesthouses in Centurion, South Africa",
  "salons in Centurion, South Africa"
];

const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_FIELD_MASK = "places.websiteUri";

function daysSinceEpoch(date) {
  return Math.floor(date.getTime() / 86400000);
}

function configuredQueries() {
  const raw = String(process.env.AUTOMATION_DISCOVERY_QUERIES || "").trim();
  if (!raw) return DEFAULT_DISCOVERY_QUERIES;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const queries = parsed.map(value => String(value).trim()).filter(Boolean);
      if (queries.length) return queries;
    }
  } catch {
    // Allow a simple pipe-delimited override for local configuration.
  }

  const queries = raw.split("|").map(value => value.trim()).filter(Boolean);
  return queries.length ? queries : DEFAULT_DISCOVERY_QUERIES;
}

function getDiscoveryQueries(date = new Date()) {
  const queries = configuredQueries();
  const requestedCount = Number(process.env.AUTOMATION_DISCOVERY_QUERY_COUNT || 2);
  const count = Math.max(
    1,
    Math.min(Number.isFinite(requestedCount) ? Math.floor(requestedCount) : 2, 4, queries.length)
  );

  const start = daysSinceEpoch(date) % queries.length;
  return Array.from({ length: count }, (_, index) => queries[(start + index) % queries.length]);
}

function getDiscoveryPageSize() {
  const requested = Number(process.env.AUTOMATION_DISCOVERY_PAGE_SIZE || 10);
  return Math.max(1, Math.min(Number.isFinite(requested) ? Math.floor(requested) : 10, 20));
}

async function searchGooglePlaces(query, apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not configured.");

  const response = await fetchImpl(GOOGLE_PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": GOOGLE_FIELD_MASK
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: getDiscoveryPageSize()
    })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || `Google Places returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return Array.isArray(payload?.places) ? payload.places : [];
}

function uniqueWebsiteCandidates(places, maxCandidates) {
  const seen = new Set();
  const candidates = [];

  for (const place of places) {
    const website = String(place?.websiteUri || "").trim();
    if (!/^https?:\\/\\//i.test(website)) continue;

    let normalized;
    try {
      const parsed = new URL(website);
      normalized = parsed.hostname.toLowerCase().replace(/^www\\./, "");
    } catch {
      continue;
    }

    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push({ website, normalized });
    if (candidates.length >= maxCandidates) break;
  }

  return candidates;
}

async function discoverWebsites({
  apiKey = process.env.GOOGLE_PLACES_API_KEY,
  queries = getDiscoveryQueries(),
  maxCandidates = Number(process.env.AUTOMATION_DISCOVERY_MAX_CANDIDATES || 20),
  fetchImpl = fetch
} = {}) {
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not configured.");

  const limit = Math.max(
    1,
    Math.min(Number.isFinite(Number(maxCandidates)) ? Math.floor(Number(maxCandidates)) : 20, 40)
  );
  const candidates = [];
  const seen = new Set();
  const queryResults = [];

  for (const query of queries) {
    if (candidates.length >= limit) break;

    const places = await searchGooglePlaces(String(query).trim(), apiKey, fetchImpl);
    const found = uniqueWebsiteCandidates(places, limit);

    let added = 0;
    for (const candidate of found) {
      if (seen.has(candidate.normalized)) continue;
      seen.add(candidate.normalized);
      candidates.push({ ...candidate, query: String(query).trim() });
      added++;
      if (candidates.length >= limit) break;
    }

    queryResults.push({
      query: String(query).trim(),
      placesReturned: places.length,
      websiteCandidatesAdded: added
    });
  }

  return {
    candidates,
    queries: queryResults,
    candidateCount: candidates.length
  };
}

module.exports = {
  DEFAULT_DISCOVERY_QUERIES,
  GOOGLE_PLACES_URL,
  GOOGLE_FIELD_MASK,
  getDiscoveryQueries,
  searchGooglePlaces,
  uniqueWebsiteCandidates,
  discoverWebsites
};
