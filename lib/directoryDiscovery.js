const { cleanWebsiteUrl, normalizeWebsite } = require("./discoveryUrl");

const DIRECTORY_REQUEST_TIMEOUT_MS = 12000;
const DIRECTORY_MAX_DETAIL_PAGES = 4;
const DIRECTORY_USER_AGENT = "Site Rescue Studio Prospect Discovery/1.0 (+https://site-rescue-studio.vercel.app/)";

const PRETORIA_EAST_BASE = "https://www.pretoriaeast.co.za";
const PRETORIA_EAST_PAGE_COUNT = 29;

const CCBC_BASE = "https://www.ccbc.co.za";
const CCBC_CATEGORY_PATHS = [
  "automotive/all",
  "business-development/all",
  "property-infrastructure/all",
  "retail-and-wholesale/all",
  "human-resources/all",
  "insurance/all"
];
const CCBC_MAX_CATEGORY_PAGES = 8;

const CATEGORIES = [
  { label: "auto repair shops", match: /auto|motor|vehicle|garage|mechanic/i },
  { label: "electricians", match: /electric|solar|power|engineering/i },
  { label: "security companies", match: /security|alarm|cctv/i },
  { label: "accountants", match: /account|finance|tax|audit/i },
  { label: "property businesses", match: /property|estate|construction|building/i },
  { label: "guesthouses", match: /guest|accommodation|hotel|lodge/i },
  { label: "salons", match: /beauty|salon|spa|hair/i },
  { label: "plumbers", match: /plumb/i },
  { label: "builders and contractors", match: /builder|contractor|construction/i },
  { label: "cleaning companies", match: /clean|janitor|hygiene/i },
  { label: "IT companies", match: /\bit\b|information technology|software|computer|technology/i },
  { label: "marketing agencies", match: /marketing|advertis|digital agency|branding/i },
  { label: "law firms", match: /law|legal|attorney|advocate/i },
  { label: "medical practices", match: /medical|doctor|physician|clinic|health/i },
  { label: "dental practices", match: /dental|dentist/i },
  { label: "veterinarians", match: /veterinar|vet clinic|animal hospital/i },
  { label: "gyms and fitness", match: /gym|fitness|crossfit|pilates/i },
  { label: "photographers", match: /photograph/i },
  { label: "restaurants", match: /restaurant|bistro|dining/i },
  { label: "takeaways", match: /takeaway|take-out|fast food/i },
  { label: "cafes", match: /cafe|coffee shop|coffeehouse/i },
  { label: "bakeries", match: /bakery|baker|patisserie/i },
  { label: "catering companies", match: /cater/i },
  { label: "food delivery", match: /food delivery|delivery service/i },
  { label: "online ordering", match: /online order|order online/i },
  { label: "ecommerce", match: /e-commerce|ecommerce/i },
  { label: "online shops", match: /online shop|webshop/i },
  { label: "retail stores", match: /retail|store|shop/i },
  { label: "clothing stores", match: /clothing|fashion|apparel|boutique/i },
  { label: "furniture stores", match: /furniture|interior/i },
  { label: "electronics stores", match: /electronic|computer shop|cellphone|mobile phone/i },
  { label: "florists", match: /florist|flower/i },
  { label: "gift shops", match: /gift shop|gifts|souvenir/i },
  { label: "beauty and wellness", match: /beauty|wellness|spa|massage/i }
];

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/");
}

function absoluteUrl(href, base) {
  try { return new URL(decodeHtmlAttribute(href), base).toString(); }
  catch { return ""; }
}

function hostname(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function extractLinks(html, base) {
  const links = [];
  const regex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html || "")))) {
    const href = absoluteUrl(match[1], base);
    if (!href) continue;
    links.push({ href, text: stripHtml(match[2]) });
  }
  return links;
}

function uniqueCandidates(rows, maxCandidates) {
  const seen = new Set();
  const candidates = [];
  for (const row of rows) {
    const website = cleanWebsiteUrl(row.website || "");
    const normalized = normalizeWebsite(website);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push({
      website,
      normalized,
      name: row.name || null,
      city: row.city || "Pretoria",
      category: row.category || null
    });
    if (candidates.length >= maxCandidates) break;
  }
  return candidates;
}


function extractNestedWebsiteUrl(value, internalHost) {
  const text = decodeHtmlAttribute(String(value || ""));
  const direct = cleanWebsiteUrl(text);
  if (direct && hostname(direct) !== internalHost) return direct;

  try {
    const parsed = new URL(text, PRETORIA_EAST_BASE);
    const parameterNames = [
      "url", "uri", "link", "website", "web", "target", "redirect",
      "redirect_url", "redirectUrl", "destination", "dest", "href"
    ];
    for (const name of parameterNames) {
      const raw = parsed.searchParams.get(name);
      if (!raw) continue;
      const decoded = decodeURIComponent(raw);
      const website = cleanWebsiteUrl(decoded);
      if (website && hostname(website) !== internalHost) return website;
      const nestedMatch = decoded.match(/https?:\\/\\/[^\\s"'<>]+/i);
      if (nestedMatch) {
        const nestedWebsite = cleanWebsiteUrl(nestedMatch[0]);
        if (nestedWebsite && hostname(nestedWebsite) !== internalHost) return nestedWebsite;
      }
    }
  } catch {}

  const encodedMatch = text.match(/https?%3A%2F%2F[^&\\s"'<>]+/i);
  if (encodedMatch) {
    try {
      const website = cleanWebsiteUrl(decodeURIComponent(encodedMatch[0]));
      if (website && hostname(website) !== internalHost) return website;
    } catch {}
  }

  return "";
}

function categoryForText(text) {
  return CATEGORIES.find(category => category.match.test(String(text || ""))) || null;
}

async function fetchHtml(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECTORY_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": DIRECTORY_USER_AGENT
      },
      signal: controller.signal
    });
    const html = await response.text();
    if (!response.ok) {
      const error = new Error(`Directory returned HTTP ${response.status} for ${url}`);
      error.status = response.status;
      throw error;
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

function extractPretoriaEastCandidates(html, maxCandidates) {
  const rows = [];
  const links = extractLinks(html, PRETORIA_EAST_BASE);
  const internalHost = hostname(PRETORIA_EAST_BASE);
  for (const link of links) {
    const host = hostname(link.href);
    if (!host) continue;
    if (host === internalHost) {
      const nestedWebsite = extractNestedWebsiteUrl(link.href, internalHost);
      if (!nestedWebsite) continue;
      const category = categoryForText(link.text);
      rows.push({
        website: nestedWebsite,
        name: link.text || null,
        city: "Pretoria",
        category: category?.label || "pretoria_east_directory"
      });
      continue;
    }
    if (!/^https?:/i.test(link.href)) continue;
    const website = cleanWebsiteUrl(link.href);
    if (!website || hostname(website) === internalHost) continue;
    const category = categoryForText(link.text);
    rows.push({
      website,
      name: link.text || null,
      city: "Pretoria",
      category: category?.label || "pretoria_east_directory"
    });
  }
  return uniqueCandidates(rows, maxCandidates);
}

function extractCcbcDetailLinks(html) {
  const links = extractLinks(html, CCBC_BASE);
  const seen = new Set();
  return links
    .filter(link => {
      try {
        const url = new URL(link.href);
        return url.hostname === "www.ccbc.co.za" &&
          /\/business-directory-2\//i.test(url.pathname) &&
          !/\/(all|browse-by|list-alpha)\/?$/i.test(url.pathname) &&
          !/\/(privacy|terms|contact)/i.test(url.pathname);
      } catch { return false; }
    })
    .filter(link => {
      if (seen.has(link.href)) return false;
      seen.add(link.href);
      return true;
    })
    .slice(0, DIRECTORY_MAX_DETAIL_PAGES);
}

function extractCcbcWebsite(html, detailUrl) {
  const links = extractLinks(html, CCBC_BASE);
  const ccbcHost = hostname(CCBC_BASE);
  for (const link of links) {
    const host = hostname(link.href);
    if (!host || host === ccbcHost) continue;
    const text = String(link.text || "").toLowerCase();
    if (text.includes("website") || /^https?:/i.test(link.href)) {
      const website = cleanWebsiteUrl(link.href);
      if (website && hostname(website) !== ccbcHost) return website;
    }
  }

  const websiteText = String(html || "").match(/Website\s+Link[\s\S]{0,500}?((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^<\s]*)?)/i);
  if (websiteText?.[1]) {
    const candidate = websiteText[1].startsWith("http") ? websiteText[1] : "https://" + websiteText[1];
    const website = cleanWebsiteUrl(candidate);
    if (website && hostname(website) !== ccbcHost) return website;
  }
  return "";
}

function extractPretoriaEastDetailLinks(html) {
  const links = extractLinks(html, PRETORIA_EAST_BASE);
  const seen = new Set();

  return links
    .filter(link => {
      try {
        const url = new URL(link.href);
        return url.hostname === "www.pretoriaeast.co.za" &&
          /\/component\/mtree\//i.test(url.pathname) &&
          !/\/browse-by\//i.test(url.pathname);
      } catch {
        return false;
      }
    })
    .filter(link => {
      if (seen.has(link.href)) return false;
      seen.add(link.href);
      return true;
    })
    .slice(0, DIRECTORY_MAX_DETAIL_PAGES);
}

function extractExternalWebsite(html, internalHost) {
  const links = extractLinks(html, PRETORIA_EAST_BASE);

  for (const link of links) {
    const host = hostname(link.href);
    if (!host) continue;

    const nestedWebsite = extractNestedWebsiteUrl(link.href, internalHost);
    if (nestedWebsite) return nestedWebsite;

    if (host === internalHost) continue;

    const text = String(link.text || "").toLowerCase();

    if (text.includes("website") || text.includes("web site") || text.includes("url") || /^https?:/i.test(link.href)) {
      const website = cleanWebsiteUrl(link.href);
      if (website && hostname(website) !== internalHost) return website;
    }
  }

  const websiteText = String(html || "").match(
    /(?:website|web site|url)[\s:]*((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^<\s]*)?)/i
  );

  if (websiteText?.[1]) {
    const candidate = websiteText[1].startsWith("http")
      ? websiteText[1]
      : "https://" + websiteText[1];

    const website = cleanWebsiteUrl(candidate);

    if (website && hostname(website) !== internalHost) return website;
  }

  return "";
}

async function extractPretoriaEastDetailCandidates(html, maxCandidates, fetchImpl) {
  const detailLinks = extractPretoriaEastDetailLinks(html);
  const internalHost = hostname(PRETORIA_EAST_BASE);
  const rows = [];

  for (const detailLink of detailLinks) {
    if (rows.length >= maxCandidates) break;

    try {
      const detailHtml = await fetchHtml(fetchImpl, detailLink.href);
      const website = extractExternalWebsite(detailHtml, internalHost);
      if (!website) continue;

      const text = stripHtml(detailHtml);
      const titleMatch = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const name = titleMatch ? stripHtml(titleMatch[1]) : detailLink.text || null;
      const category = categoryForText(text + " " + (name || ""));

      rows.push({
        website,
        name,
        city: /Centurion/i.test(text) ? "Centurion" : "Pretoria",
        category: category?.label || "pretoria_east_directory"
      });
    } catch {}
  }

  return uniqueCandidates(rows, maxCandidates);
}

async function discoverPretoriaEastCandidates(html, maxCandidates, fetchImpl) {
  const directCandidates = extractPretoriaEastCandidates(html, maxCandidates);

  if (directCandidates.length >= maxCandidates) {
    return directCandidates;
  }

  const remaining = maxCandidates - directCandidates.length;

  const detailCandidates = await extractPretoriaEastDetailCandidates(
    html,
    remaining,
    fetchImpl
  );

  return uniqueCandidates(
    [...directCandidates, ...detailCandidates],
    maxCandidates
  );
}

async function discoverPretoriaEast({ maxCandidates = 20, fetchImpl = fetch, pageOffset = 0 } = {}) {
  const safeMax = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  const page = Math.abs(Number(pageOffset) || 0) % PRETORIA_EAST_PAGE_COUNT;
  const url = PRETORIA_EAST_BASE + "/component/mtree/browse-by/city?value=Pretoria&limitstart=" + (page * 20);
  const html = await fetchHtml(fetchImpl, url);
  const candidates = await discoverPretoriaEastCandidates(html, safeMax, fetchImpl);
  return {
    source: "pretoria_east_directory",
    candidates,
    candidateCount: candidates.length,
    page,
    pageSize: 20,
    url
  };
}

async function discoverCcbc({ maxCandidates = 20, fetchImpl = fetch, pageOffset = 0 } = {}) {
  const safeMax = Math.max(1, Math.min(Number(maxCandidates) || 20, 12));
  const pageSeed = Math.abs(Number(pageOffset) || 0);
  const categoryPath = CCBC_CATEGORY_PATHS[pageSeed % CCBC_CATEGORY_PATHS.length];
  const pageCount = Math.min(CCBC_MAX_CATEGORY_PAGES, categoryPath === "automotive/all" ? 6 : 8);
  const page = Math.floor(pageSeed / CCBC_CATEGORY_PATHS.length) % pageCount;
  const listUrl = CCBC_BASE + "/business-directory-2/" + categoryPath + "?start=" + (page * 20);
  const listHtml = await fetchHtml(fetchImpl, listUrl);
  const detailLinks = extractCcbcDetailLinks(listHtml);
  const rows = [];
  for (const detailUrl of detailLinks) {
    if (rows.length >= safeMax) break;
    try {
      const detailHtml = await fetchHtml(fetchImpl, detailUrl);
      const website = extractCcbcWebsite(detailHtml, detailUrl);
      if (!website) continue;
      const text = stripHtml(detailHtml);
      if (!/Pretoria|Centurion/i.test(text)) continue;
      const titleMatch = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const name = titleMatch ? stripHtml(titleMatch[1]) : null;
      const category = categoryForText(text);
      rows.push({ website, name, city: /Centurion/i.test(text) ? "Centurion" : "Pretoria", category: category?.label || "ccbc_directory" });
    } catch {}
  }
  const candidates = uniqueCandidates(rows, safeMax);
  return { source: "ccbc_directory", candidates, candidateCount: candidates.length, categoryPath, page, detailPagesFetched: detailLinks.length, url: listUrl };
}

module.exports = {
  DIRECTORY_REQUEST_TIMEOUT_MS,
  DIRECTORY_MAX_DETAIL_PAGES,
  PRETORIA_EAST_PAGE_COUNT,
  CCBC_CATEGORY_PATHS,
  fetchHtml,
  extractPretoriaEastCandidates,
  extractNestedWebsiteUrl,
  extractPretoriaEastDetailLinks,
  extractExternalWebsite,
  extractPretoriaEastDetailCandidates,
  discoverPretoriaEastCandidates,
  extractCcbcDetailLinks,
  extractCcbcWebsite,
  discoverPretoriaEast,
  discoverCcbc
};
