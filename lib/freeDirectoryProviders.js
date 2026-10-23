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
    // Hotfrog's indexed public search route is /search/{city}%2Cgt/{category}.
    // Keep the category in the URL so each rotating query discovers a different result set.
    const city = citySlug(query.city);
    const category = slugify(query.label);
    const baseUrl = "https://www.hotfrog.co.za/search/" + encodeURIComponent(city + ",gt") + "/" + category;
    const url = baseUrl + (page > 1 ? "/" + page : "");
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
  const page = Math.max(1, Math.floor(Math.abs(Number(pageOffset) || 0) / 20) + 1);
  // Verified PretoriaHub public taxonomy uses /category/ paths. One failed
  // category must not abort the remaining categories or suppress good results.
  const sectionUrls = [
    "https://pretoriahub.com/category/restaurants-takeaways/",
    "https://pretoriahub.com/category/beauty-hair-salons/lynnwood-ridge/",
    "https://pretoriahub.com/category/professional-services/",
    "https://pretoriahub.com/category/home-services/",
    "https://pretoriahub.com/category/health-wellness/",
    "https://pretoriahub.com/category/shopping-retail/",
    "https://pretoriahub.com/category/automotive/"
  ];
  const visitedProfiles = new Set();
  const errors = [];
  for (let sectionIndex = 0; sectionIndex < sectionUrls.length && candidates.length < limit; sectionIndex++) {
    const query = queries[sectionIndex % Math.max(queries.length, 1)] || { label: "local businesses", city: "Pretoria" };
    const remaining = limit - candidates.length;
    const base = sectionUrls[sectionIndex];
    const sectionUrl = page > 1
      ? base.replace(/\/$/, "") + "/page/" + page + "/"
      : base;
    let html;
    try {
      html = await fetchHtml(fetchImpl, sectionUrl);
    } catch (error) {
      errors.push({ url: sectionUrl, status: error?.status || null, message: String(error?.message || error) });
      continue;
    }
    const profileLinks = internalLinks(html, "pretoriahub", /\/business\//i)
      .filter(url => !visitedProfiles.has(url))
      .slice(0, Math.min(MAX_DETAIL_PAGES, remaining));
    for (const profileUrl of profileLinks) {
      if (candidates.length >= limit) break;
      visitedProfiles.add(profileUrl);
      try {
        const profileHtml = await fetchHtml(fetchImpl, profileUrl);
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
  return { source: "pretoriahub", candidates, candidateCount: candidates.length, page, errors };
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
    // Use the city archive where its route is known. For a new/unsupported
    // city, fall back to the country-wide archive instead of rejecting it.
    const base = province
      ? "https://mycityinfo.co.za/places/south-africa/" + province + "/" + city + "/"
      : "https://mycityinfo.co.za/places/";
    const url = page > 1
      ? (province
          ? base + "page/" + page + "/"
          : "https://mycityinfo.co.za/places/page/" + page + "/")
      : base;
    try {
      const html = await fetchHtml(fetchImpl, url);
      let added = 0;
      for (const candidate of externalLinks(html, "mycityinfo")) {
        if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
        seen.add(candidate.normalized);
        candidates.push({
          ...candidate,
          city: province ? query.city : "South Africa",
          category: query.label
        });
        added++;
      }
      queryResults.push({ query: query.label, city: query.city, page, websiteCandidatesAdded: added, url, archiveScope: province ? "city" : "country" });
    } catch (error) {
      errors.push({ city: query.city, page, url, status: error?.status || null, message: String(error?.message || error) });
      queryResults.push({ query: query.label, city: query.city, page, websiteCandidatesAdded: 0, status: "failed", error: String(error?.message || error) });
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
