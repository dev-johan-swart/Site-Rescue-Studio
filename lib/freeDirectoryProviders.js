const { cleanWebsiteUrl, normalizeWebsite, hostnameFromUrl } = require("./discoveryUrl");

const SOURCE_HOSTS = {
  hotfrog: "hotfrog.co.za",
  opendi: "opendi.co.za",
  pretoriahub: "pretoriahub.com",
  mycityinfo: "mycityinfo.co.za"
};

const MAX_DETAIL_PAGES = 6;
const REQUEST_TIMEOUT_MS = 12000;
// MyCityInfo publishes city archives beneath province/city paths. Keep
// this map aligned with cities configured in discoveryProviders.js. A city
// absent from the map uses the country-wide archive rather than being rejected.
const MYCITYINFO_CITY_PROVINCES = {
  pretoria: "gauteng", centurion: "gauteng", johannesburg: "gauteng",
  midrand: "gauteng", sandton: "gauteng", randburg: "gauteng",
  roodepoort: "gauteng", krugersdorp: "gauteng", "kempton-park": "gauteng",
  benoni: "gauteng", boksburg: "gauteng", germiston: "gauteng", springs: "gauteng",
  vanderbijlpark: "gauteng", vereeniging: "gauteng", rustenburg: "north-west",
  "cape-town": "western-cape", george: "western-cape",
  durban: "kwazulu-natal", "pietermaritzburg": "kwazulu-natal",
  "east-london": "eastern-cape", gqeberha: "eastern-cape",
  bloemfontein: "free-state", kimberley: "northern-cape",
  mbombela: "mpumalanga", nelspruit: "mpumalanga", polokwane: "limpopo"
};

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function citySlug(value) {
  return slugify(value).replace(/-za$/, "");
}

function isSourceHost(value, source) {
  const host = hostnameFromUrl(value);
  const sourceHost = SOURCE_HOSTS[source];
  return !host || host === sourceHost || host.endsWith("." + sourceHost);
}

function externalLinks(html, source) {
  const links = [];
  const seen = new Set();
  const text = String(html || "");
  const regex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(text))) {
    const website = cleanWebsiteUrl(match[1]);
    if (!website || isSourceHost(website, source)) continue;
    const normalized = normalizeWebsite(website);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    links.push({
      website,
      normalized,
      name: String(match[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null
    });
  }
  return links;
}

function internalLinks(html, source, pattern) {
  const sourceHost = SOURCE_HOSTS[source];
  const links = [];
  const seen = new Set();
  const text = String(html || "");
  const regex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(text))) {
    const href = String(match[1] || "").trim();
    let absolute;
    try { absolute = new URL(href, "https://" + sourceHost).toString(); } catch { continue; }
    const host = hostnameFromUrl(absolute);
    if (host !== sourceHost || !pattern.test(new URL(absolute).pathname)) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    links.push(absolute);
  }
  return links;
}

async function fetchHtml(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Site Rescue Studio Prospect Discovery/1.0"
      },
      signal: controller.signal
    });
    const html = await response.text();
    if (!response.ok) {
      const error = new Error("Directory returned HTTP " + response.status + ".");
      error.status = response.status;
      throw error;
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverHotfrog({ queries = [], maxCandidates = 20, pageOffset = 0, fetchImpl = fetch } = {}) {
  const candidates = [];
  const seen = new Set();
  const queryResults = [];
  const page = Math.max(1, Math.floor(Math.abs(Number(pageOffset) || 0) / 20) + 1);
  const limit = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  const cityQueries = [...new Map(queries.filter(query => query?.city).map(query => [citySlug(query.city), query])).values()];

  for (const query of cityQueries) {
    if (candidates.length >= limit) break;
    // Use Hotfrog's verified public city-search route. The previous
    // category-specific URL was returning HTTP 403 in production; do not
    // invent category paths or attempt to bypass the source's access controls.
    const city = citySlug(query.city);
    const url = "https://www.hotfrog.co.za/search/" + city + (page > 1 ? "?page=" + page : "");
    const html = await fetchHtml(fetchImpl, url);
    const detailLinks = internalLinks(html, "hotfrog", /\/company\//i).slice(0, MAX_DETAIL_PAGES);
    const direct = externalLinks(html, "hotfrog");
    const pool = [...direct];

    for (const detailUrl of detailLinks) {
      if (pool.length >= limit) break;
      try {
        pool.push(...externalLinks(await fetchHtml(fetchImpl, detailUrl), "hotfrog"));
      } catch {}
    }

    let added = 0;
    for (const candidate of pool) {
      if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
      seen.add(candidate.normalized);
      candidates.push({ ...candidate, city: query.city, category: query.label });
      added++;
    }
    queryResults.push({ query: query.label, city: query.city, page, detailPagesFetched: detailLinks.length, websiteCandidatesAdded: added });
  }

  return { source: "hotfrog", candidates, candidateCount: candidates.length, queries: queryResults };
}

async function discoverOpendi({ queries = [], maxCandidates = 20, pageOffset = 0, fetchImpl = fetch } = {}) {
  const candidates = [];
  const seen = new Set();
  const queryResults = [];
  const limit = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  const page = Math.max(1, Math.floor(Math.abs(Number(pageOffset) || 0) / 20) + 1);

  for (const query of queries) {
    if (candidates.length >= limit) break;
    const city = citySlug(query.city);
    const url = "https://www.opendi.co.za/" + city + "/" + (page > 1 ? "?page=" + page : "");
    const html = await fetchHtml(fetchImpl, url);
    const detailLinks = internalLinks(html, "opendi", /\.html$/i).slice(0, MAX_DETAIL_PAGES);
    let added = 0;

    for (const detailUrl of detailLinks) {
      if (candidates.length >= limit) break;
      try {
        const links = externalLinks(await fetchHtml(fetchImpl, detailUrl), "opendi");
        for (const candidate of links) {
          if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
          seen.add(candidate.normalized);
          candidates.push({ ...candidate, city: query.city, category: query.label });
          added++;
        }
      } catch {}
    }
    queryResults.push({ query: query.label, city: query.city, page, detailPagesFetched: detailLinks.length, websiteCandidatesAdded: added });
  }

  return { source: "opendi", candidates, candidateCount: candidates.length, queries: queryResults };
}

async function discoverPretoriaHub({ queries = [], maxCandidates = 20, pageOffset = 0, fetchImpl = fetch } = {}) {
  const candidates = [];
  const seen = new Set();
  const limit = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  // These routes are currently indexed on PretoriaHub's public site and span
  // its large local directory. Keep the request budget bounded and rotate the
  // starting route between preparation runs.
  const listingUrls = [
    "https://pretoriahub.com/section/home-trade/",
    "https://pretoriahub.com/category/restaurants-takeaways/",
    "https://pretoriahub.com/suburb/southdowns/",
    "https://pretoriahub.com/suburb/boardwalk-manor/",
    "https://pretoriahub.com/suburb/kloofsig/",
    "https://pretoriahub.com/suburb/hennopspark/",
    "https://pretoriahub.com/suburb/bronberrik/",
    "https://pretoriahub.com/suburb/doringkloof/",
    "https://pretoriahub.com/suburb/montana-park/"
  ];
  const startIndex = Math.abs(Math.floor(Number(pageOffset) || 0)) % listingUrls.length;
  const orderedUrls = [...listingUrls.slice(startIndex), ...listingUrls.slice(0, startIndex)];
  const errors = [];
  let pagesFetched = 0;
  let profilesFetched = 0;
  for (let index = 0; index < orderedUrls.length && candidates.length < limit; index++) {
    const url = orderedUrls[index];
    const query = queries[index % Math.max(queries.length, 1)] || { label: "local businesses", city: "Pretoria" };
    let html;
    try {
      html = await fetchHtml(fetchImpl, url);
      pagesFetched++;
    } catch (error) {
      errors.push({ url, status: error?.status || null, message: String(error?.message || error) });
      continue;
    }
    const profileLinks = internalLinks(html, "pretoriahub", /\/(?:business|listing|profile|company)\//i)
      .slice(0, Math.min(MAX_DETAIL_PAGES, limit - candidates.length));
    for (const profileUrl of profileLinks) {
      if (candidates.length >= limit) break;
      try {
        const profileHtml = await fetchHtml(fetchImpl, profileUrl);
        profilesFetched++;
        for (const candidate of externalLinks(profileHtml, "pretoriahub")) {
          if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
          seen.add(candidate.normalized);
          candidates.push({ ...candidate, city: query.city || "Pretoria", category: query.label });
        }
      } catch (error) {
        errors.push({ url: profileUrl, status: error?.status || null, message: String(error?.message || error) });
      }
    }
  }
  return { source: "pretoriahub", candidates, candidateCount: candidates.length, page: startIndex, pagesFetched, profilesFetched, errors };
}
async function discoverMyCityInfo({ queries = [], maxCandidates = 20, pageOffset = 0, fetchImpl = fetch } = {}) {
  const candidates = [];
  const seen = new Set();
  const queryResults = [];
  const limit = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  const page = Math.max(1, Math.floor(Math.abs(Number(pageOffset) || 0) / 20) + 1);
  const errors = [];
  const requestedCityQueries = [...new Map(queries.filter(query => query?.city).map(query => [citySlug(query.city), query])).values()];

  for (const query of requestedCityQueries) {
    if (candidates.length >= limit) break;
    const city = citySlug(query.city);
    const province = MYCITYINFO_CITY_PROVINCES[city];
    const cityUrl = province
      ? "https://mycityinfo.co.za/places/south-africa/" + province + "/" + city + "/" + (page > 1 ? "page/" + page + "/" : "")
      : null;
    const nationalUrl = "https://mycityinfo.co.za/places/" + (page > 1 ? "page/" + page + "/" : "");
    const urls = [...new Set([cityUrl, nationalUrl].filter(Boolean))];
    let successfulUrl = null;
    let added = 0;
    let lastError = null;
    for (const url of urls) {
      try {
        const html = await fetchHtml(fetchImpl, url);
        successfulUrl = url;
        for (const candidate of externalLinks(html, "mycityinfo")) {
          if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
          seen.add(candidate.normalized);
          candidates.push({
            ...candidate,
            // Never label a country-wide fallback as if it were verified for
            // the requested city.
            city: url === cityUrl ? query.city : "South Africa",
            category: query.label
          });
          added++;
        }
        break;
      } catch (error) {
        lastError = { city: query.city, page, url, status: error?.status || null, message: String(error?.message || error) };
      }
    }
    if (!successfulUrl) {
      errors.push(lastError || { city: query.city, page, status: null, message: "No usable archive route." });
      queryResults.push({ query: query.label, city: query.city, page, websiteCandidatesAdded: 0, status: "failed", error: lastError?.message || "No usable archive route." });
    } else {
      const cityArchiveError = lastError && successfulUrl !== cityUrl ? lastError : null;
      // Keep a failed city archive visible even when the national fallback works.
      // A fallback must preserve supply, not erase the city-level diagnostic.
      if (cityArchiveError) errors.push(cityArchiveError);
      queryResults.push({
        query: query.label, city: query.city, page, websiteCandidatesAdded: added,
        url: successfulUrl, archiveScope: successfulUrl === cityUrl ? "city" : "country",
        fallbackUsed: Boolean(cityArchiveError),
        ...(cityArchiveError ? { cityArchiveError } : {})
      });
    }
  }

  if (requestedCityQueries.length && errors.length === requestedCityQueries.length) {
    const error = new Error("All MyCityInfo archive requests failed.");
    error.providerErrors = errors;
    error.status = errors[0]?.status || null;
    throw error;
  }
  return { source: "mycityinfo", candidates, candidateCount: candidates.length, queries: queryResults, errors, skippedCities: [] };
}

module.exports = {
  SOURCE_HOSTS,
  MYCITYINFO_CITY_PROVINCES,
  MAX_DETAIL_PAGES,
  discoverHotfrog,
  discoverOpendi,
  discoverPretoriaHub,
  discoverMyCityInfo,
  externalLinks
};
