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
      candidates.push({ ...candidate, city: query.city, category: null });
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
          candidates.push({ ...candidate, city: query.city, category: null });
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
  // The durable provider cursor advances once per 20-unit slot. Cycle
  // through all listing routes first, then advance the profile window by six.
  const cursor = Math.max(0, Math.floor(Number(pageOffset) || 0) / 20);
  const startIndex = Math.floor(cursor) % listingUrls.length;
  // Each discovery call already visits all listing routes. Advance the
  // profile window on every durable cursor step, not once per nine calls.
  const profileWindow = Math.floor(cursor);
  const errors = [];
  let pagesFetched = 0;
  let profilesFetched = 0;
  let profileLinksFound = 0;
  let profileOffsetUsed = 0;
  for (let index = 0; index < listingUrls.length && candidates.length < limit; index++) {
    const url = listingUrls[(startIndex + index) % listingUrls.length];
    const query = queries[index % Math.max(queries.length, 1)] || { label: "local businesses", city: "Pretoria" };
    let html;
    try {
      html = await fetchHtml(fetchImpl, url);
      pagesFetched++;
    } catch (error) {
      errors.push({ url, status: error?.status || null, message: String(error?.message || error) });
      continue;
    }
    const allProfileLinks = internalLinks(html, "pretoriahub", /\/(?:business|listing|profile|company)\//i);
    profileLinksFound += allProfileLinks.length;
    const windowSize = Math.min(MAX_DETAIL_PAGES, limit - candidates.length);
    // If the selected window is beyond a shorter listing, wrap to its first
    // window rather than silently returning no profiles forever.
    const profileStart = allProfileLinks.length
      ? (profileWindow * MAX_DETAIL_PAGES) % allProfileLinks.length
      : 0;
    if (index === 0) profileOffsetUsed = profileStart;
    const profileLinks = allProfileLinks.slice(profileStart, profileStart + windowSize);
    for (const profileUrl of profileLinks) {
      if (candidates.length >= limit) break;
      try {
        const profileHtml = await fetchHtml(fetchImpl, profileUrl);
        profilesFetched++;
        for (const candidate of externalLinks(profileHtml, "pretoriahub")) {
          if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
          seen.add(candidate.normalized);
          candidates.push({ ...candidate, city: "Pretoria", category: null });
        }
      } catch (error) {
        errors.push({ url: profileUrl, status: error?.status || null, message: String(error?.message || error) });
      }
    }
  }
  return {
    source: "pretoriahub",
    candidates,
    candidateCount: candidates.length,
    page: startIndex,
    profileWindow,
    profileOffset: profileOffsetUsed,
    profileLinksFound,
    pagesFetched,
    profilesFetched,
    errors
  };
}
async function discoverMyCityInfo({
  queries = [],
  maxCandidates = 20,
  pageOffset = 0,
  fetchImpl = fetch,
  filterCandidates = async candidates => candidates,
  maxCitiesPerAttempt = 3
} = {}) {
  const candidates = [];
  const seen = new Set();
  const queryResults = [];
  const limit = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  const page = Math.max(1, Math.floor(Math.abs(Number(pageOffset) || 0) / 20) + 1);
  const errors = [];
  const allCityQueries = [...new Map(
    queries.filter(query => query?.city).map(query => [citySlug(query.city), query])
  ).values()];
  const cityWindowSize = Math.max(1, Math.min(Math.floor(Number(maxCitiesPerAttempt) || 3), 4, allCityQueries.length || 1));
  const cityStart = allCityQueries.length ? ((page - 1) * cityWindowSize) % allCityQueries.length : 0;
  const rotatedCityQueries = [
    ...allCityQueries.slice(cityStart),
    ...allCityQueries.slice(0, cityStart)
  ];
  const requestedCityQueries = rotatedCityQueries.slice(0, cityWindowSize);
  let successfulArchives = 0;

  function cleanedBusinessName(value) {
    const name = String(value || "").replace(/\s+/g, " ").trim();
    if (!name || /^(website|website link|visit website|view website|click here|learn more|read more|more info|official website|www\.?)$/i.test(name)) {
      return null;
    }
    return name;
  }

  for (const query of requestedCityQueries) {
    if (candidates.length >= limit) break;
    const city = citySlug(query.city);
    const province = MYCITYINFO_CITY_PROVINCES[city];
    const cityBaseUrl = province
      ? "https://mycityinfo.co.za/places/south-africa/" + province + "/" + city + "/"
      : null;
    const nationalBaseUrl = "https://mycityinfo.co.za/places/";
    const cityPageUrl = cityBaseUrl && page > 1 ? cityBaseUrl + "page/" + page + "/" : cityBaseUrl;
    const nationalPageUrl = page > 1 ? nationalBaseUrl + "page/" + page + "/" : nationalBaseUrl;
    const urls = [...new Set([
      cityPageUrl,
      page > 1 ? cityBaseUrl : null,
      nationalPageUrl,
      page > 1 ? nationalBaseUrl : null
    ].filter(Boolean))];
    const cityErrors = [];
    let lastSuccessfulUrl = null;
    let added = 0;
    let attemptedUrls = 0;

    for (const url of urls) {
      if (candidates.length >= limit || added > 0) break;
      attemptedUrls++;
      try {
        const html = await fetchHtml(fetchImpl, url);
        successfulArchives++;
        lastSuccessfulUrl = url;
        const isCityArchive = Boolean(cityBaseUrl && url.startsWith(cityBaseUrl));
        const extracted = externalLinks(html, "mycityinfo").map(candidate => ({
          ...candidate,
          name: cleanedBusinessName(candidate.name),
          // These are general directory archives, not category-specific search
          // results. Do not attach the query label as if it verified the business.
          city: isCityArchive ? query.city : "South Africa",
          category: null
        }));
        const freshCandidates = await filterCandidates(extracted, "mycityinfo");
        for (const candidate of freshCandidates || []) {
          if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
          seen.add(candidate.normalized);
          candidates.push(candidate);
          added++;
        }
        // If a valid page contains only known or unusable websites, try the
        // safe first-page/country fallback instead of letting it block supply.
      } catch (error) {
        const diagnostic = {
          city: query.city,
          page,
          url,
          scope: cityBaseUrl && url.startsWith(cityBaseUrl) ? "city" : "country",
          status: error?.status || null,
          message: String(error?.message || error)
        };
        errors.push(diagnostic);
        if (diagnostic.scope === "city") cityErrors.push(diagnostic);
      }
    }

    const archiveScope = successfulUrlScope(lastSuccessfulUrl, cityBaseUrl);
    const cityArchiveError = cityErrors.find(error => error.url === cityPageUrl) || cityErrors[0] || null;
    queryResults.push({
      query: query.label || null,
      city: query.city,
      page,
      websiteCandidatesAdded: added,
      attemptedUrls,
      status: added ? "success" : lastSuccessfulUrl ? "empty_or_known_only" : "failed",
      ...(lastSuccessfulUrl ? {
        url: lastSuccessfulUrl,
        archiveScope,
        fallbackUsed: Boolean(cityArchiveError && lastSuccessfulUrl !== cityPageUrl)
      } : {}),
      ...(cityArchiveError ? { cityArchiveError } : {})
    });
  }

  if (requestedCityQueries.length && successfulArchives === 0) {
    const error = new Error("All MyCityInfo archive requests failed.");
    error.providerErrors = errors;
    error.status = errors[0]?.status || null;
    throw error;
  }
  return {
    source: "mycityinfo",
    candidates,
    candidateCount: candidates.length,
    queries: queryResults,
    errors,
    skippedCities: allCityQueries.filter(query => !requestedCityQueries.includes(query)).map(query => query.city)
  };
}

function successfulUrlScope(url, cityBaseUrl) {
  return url && cityBaseUrl && url.startsWith(cityBaseUrl) ? "city" : "country";
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
