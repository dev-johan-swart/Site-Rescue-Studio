const DEFAULT_DISCOVERY_QUERIES = [
  { id: "auto-repair-pretoria", label: "auto repair shops in Pretoria", city: "Pretoria", bbox: "-25.95,28.00,-25.55,28.45", filters: [["shop", "car_repair"]] },
  { id: "electricians-pretoria", label: "electricians in Pretoria", city: "Pretoria", bbox: "-25.95,28.00,-25.55,28.45", filters: [["craft", "electrician"]] },
  { id: "security-pretoria", label: "security companies in Pretoria", city: "Pretoria", bbox: "-25.95,28.00,-25.55,28.45", filters: [["office", "security"]] },
  { id: "accountants-pretoria", label: "accountants in Pretoria", city: "Pretoria", bbox: "-25.95,28.00,-25.55,28.45", filters: [["office", "accountant"]] },
  { id: "property-pretoria", label: "property businesses in Pretoria", city: "Pretoria", bbox: "-25.95,28.00,-25.55,28.45", filters: [["office", "estate_agent"]] },
  { id: "guesthouses-pretoria", label: "guesthouses in Pretoria", city: "Pretoria", bbox: "-25.95,28.00,-25.55,28.45", filters: [["tourism", "guest_house"]] },
  { id: "salons-pretoria", label: "salons in Pretoria", city: "Pretoria", bbox: "-25.95,28.00,-25.55,28.45", filters: [["shop", "hairdresser"]] },
  { id: "auto-repair-centurion", label: "auto repair shops in Centurion", city: "Centurion", bbox: "-26.05,27.95,-25.72,28.35", filters: [["shop", "car_repair"]] },
  { id: "electricians-centurion", label: "electricians in Centurion", city: "Centurion", bbox: "-26.05,27.95,-25.72,28.35", filters: [["craft", "electrician"]] },
  { id: "security-centurion", label: "security companies in Centurion", city: "Centurion", bbox: "-26.05,27.95,-25.72,28.35", filters: [["office", "security"]] },
  { id: "accountants-centurion", label: "accountants in Centurion", city: "Centurion", bbox: "-26.05,27.95,-25.72,28.35", filters: [["office", "accountant"]] },
  { id: "property-centurion", label: "property businesses in Centurion", city: "Centurion", bbox: "-26.05,27.95,-25.72,28.35", filters: [["office", "estate_agent"]] },
  { id: "guesthouses-centurion", label: "guesthouses in Centurion", city: "Centurion", bbox: "-26.05,27.95,-25.72,28.35", filters: [["tourism", "guest_house"]] },
  { id: "salons-centurion", label: "salons in Centurion", city: "Centurion", bbox: "-26.05,27.95,-25.72,28.35", filters: [["shop", "hairdresser"]] }
];

const OVERPASS_URL = process.env.AUTOMATION_DISCOVERY_URL ||
  "https://overpass.private.coffee/api/interpreter";

const USER_AGENT = "Site Rescue Studio Prospect Discovery/1.0 (+https://site-rescue-studio.vercel.app/)";

const EXCLUDED_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "google.com",
  "maps.google.com",
  "goo.gl",
  "youtube.com",
  "yelp.com"
]);

function daysSinceEpoch(date) {
  return Math.floor(date.getTime() / 86400000);
}

function configuredQueries() {
  const raw = String(process.env.AUTOMATION_DISCOVERY_QUERIES || "").trim();
  if (!raw) return DEFAULT_DISCOVERY_QUERIES;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const ids = parsed.map(value => String(value).trim()).filter(Boolean);
      const selected = ids
        .map(id => DEFAULT_DISCOVERY_QUERIES.find(query => query.id === id))
        .filter(Boolean);
      if (selected.length) return selected;
    }
  } catch {
    // Allow a simple pipe-delimited list of known discovery query IDs.
  }

  const ids = raw.split("|").map(value => value.trim()).filter(Boolean);
  const selected = ids
    .map(id => DEFAULT_DISCOVERY_QUERIES.find(query => query.id === id))
    .filter(Boolean);

  return selected.length ? selected : DEFAULT_DISCOVERY_QUERIES;
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
  const requested = Number(process.env.AUTOMATION_DISCOVERY_PAGE_SIZE || 20);
  return Math.max(1, Math.min(Number.isFinite(requested) ? Math.floor(requested) : 20, 50));
}

function buildOverpassQuery(query) {
  const statements = [];

  for (const [key, value] of query.filters) {
    statements.push(
      `nwr["${key}"="${value}"]["website"](${query.bbox});`,
      `nwr["${key}"="${value}"]["contact:website"](${query.bbox});`
    );
  }

  return `[out:json][timeout:25];\n(\n  ${statements.join("\n  ")}\n);\nout tags;`;
}

async function searchOpenStreetMap(query, fetchImpl = fetch) {
  const response = await fetchImpl(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": USER_AGENT
    },
    body: `data=${encodeURIComponent(buildOverpassQuery(query))}`
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.remark || `OpenStreetMap discovery returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return Array.isArray(payload?.elements) ? payload.elements : [];
}

function hostnameFromUrl(website) {
  try {
    const parsed = new URL(website);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isUsableWebsite(website) {
  if (!/^https?:\/\//i.test(website)) return false;
  const hostname = hostnameFromUrl(website);
  if (!hostname || EXCLUDED_HOSTS.has(hostname)) return false;
  return !Array.from(EXCLUDED_HOSTS).some(host => hostname.endsWith(`.${host}`));
}

function uniqueWebsiteCandidates(elements, maxCandidates, query) {
  const seen = new Set();
  const candidates = [];
  const limit = Math.max(1, Number(maxCandidates) || getDiscoveryPageSize());

  for (const element of elements) {
    const tags = element?.tags || {};
    const rawWebsites = [tags.website, tags["contact:website"], tags["website:1"]]
      .filter(Boolean)
      .flatMap(value => String(value).split(";"))
      .map(value => value.trim());

    for (const website of rawWebsites) {
      if (!isUsableWebsite(website)) continue;

      const normalized = hostnameFromUrl(website);
      if (!normalized || seen.has(normalized)) continue;

      seen.add(normalized);
      candidates.push({
        website,
        normalized,
        name: String(tags.name || tags.operator || "").trim() || null,
        city: query.city,
        category: query.id
      });

      if (candidates.length >= limit) return candidates;
    }
  }

  return candidates;
}

async function discoverWebsites({
  queries = getDiscoveryQueries(),
  maxCandidates = Number(process.env.AUTOMATION_DISCOVERY_MAX_CANDIDATES || 20),
  fetchImpl = fetch
} = {}) {
  const limit = Math.max(
    1,
    Math.min(Number.isFinite(Number(maxCandidates)) ? Math.floor(Number(maxCandidates)) : 20, 40)
  );

  const candidates = [];
  const seen = new Set();
  const queryResults = [];

  for (const query of queries) {
    if (candidates.length >= limit) break;

    const elements = await searchOpenStreetMap(query, fetchImpl);
    const found = uniqueWebsiteCandidates(elements, limit, query);

    let added = 0;
    for (const candidate of found) {
      if (seen.has(candidate.normalized)) continue;
      seen.add(candidate.normalized);
      candidates.push(candidate);
      added++;
      if (candidates.length >= limit) break;
    }

    queryResults.push({
      query: query.label,
      queryId: query.id,
      city: query.city,
      elementsReturned: elements.length,
      websiteCandidatesAdded: added
    });
  }

  return {
    source: "openstreetmap",
    candidates,
    queries: queryResults,
    candidateCount: candidates.length
  };
}

module.exports = {
  DEFAULT_DISCOVERY_QUERIES,
  OVERPASS_URL,
  USER_AGENT,
  buildOverpassQuery,
  getDiscoveryQueries,
  searchOpenStreetMap,
  uniqueWebsiteCandidates,
  discoverWebsites
};
