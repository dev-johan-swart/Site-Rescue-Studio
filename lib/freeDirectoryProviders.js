const { cleanWebsiteUrl, normalizeWebsite, hostnameFromUrl } = require("./discoveryUrl");

const SOURCE_HOSTS = {
  hotfrog: "www.hotfrog.co.za",
  opendi: "www.opendi.co.za",
  pretoriahub: "pretoriahub.com",
  mycityinfo: "mycityinfo.co.za"
};

const MAX_DETAIL_PAGES = 6;
const REQUEST_TIMEOUT_MS = 12000;

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

  for (const query of queries) {
    if (candidates.length >= limit) break;
    const location = citySlug(query.city) + ",gt";
    const url = "https://www.hotfrog.co.za/find/" + slugify(query.label) + "/gt/" + citySlug(query.city);
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

async function discoverPretoriaHub({ queries = [], maxCandidates = 20, fetchImpl = fetch } = {}) {
  const candidates = [];
  const seen = new Set();
  const limit = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));

  for (const query of queries) {
    if (candidates.length >= limit) break;
    const url = "https://pretoriahub.com/?s=" + encodeURIComponent(query.label);
    const html = await fetchHtml(fetchImpl, url);
    const profileLinks = internalLinks(html, "pretoriahub", /\\/business\\//i).slice(0, MAX_DETAIL_PAGES);
    const pool = [...externalLinks(html, "pretoriahub")];
    for (const profileUrl of profileLinks) {
      if (pool.length >= limit) break;
      try { pool.push(...externalLinks(await fetchHtml(fetchImpl, profileUrl), "pretoriahub")); } catch {}
    }
    for (const candidate of pool) {
      if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
      seen.add(candidate.normalized);
      candidates.push({ ...candidate, city: query.city || "Pretoria", category: query.label });
    }
  }

  return { source: "pretoriahub", candidates, candidateCount: candidates.length };
}

async function discoverMyCityInfo({ queries = [], maxCandidates = 20, pageOffset = 0, fetchImpl = fetch } = {}) {
  const candidates = [];
  const seen = new Set();
  const queryResults = [];
  const limit = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  const page = Math.max(1, Math.floor(Math.abs(Number(pageOffset) || 0) / 20) + 1);

  for (const query of queries) {
    if (candidates.length >= limit) break;
    const city = citySlug(query.city);
    const base = "https://mycityinfo.co.za/places/south-africa/gauteng/" + city + "/";
    const url = base + (page > 1 ? "page/" + page + "/" : "");
    const html = await fetchHtml(fetchImpl, url);
    let added = 0;
    for (const candidate of externalLinks(html, "mycityinfo")) {
      if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
      seen.add(candidate.normalized);
      candidates.push({ ...candidate, city: query.city, category: query.label });
      added++;
    }
    queryResults.push({ query: query.label, city: query.city, page, websiteCandidatesAdded: added });
  }

  return { source: "mycityinfo", candidates, candidateCount: candidates.length, queries: queryResults };
}

module.exports = {
  SOURCE_HOSTS,
  MAX_DETAIL_PAGES,
  discoverHotfrog,
  discoverOpendi,
  discoverPretoriaHub,
  discoverMyCityInfo,
  externalLinks
};
