const { cleanWebsiteUrl, normalizeWebsite } = require("./discoveryUrl");

const DIRECTORY_REQUEST_TIMEOUT_MS = 12000;
const DIRECTORY_MAX_DETAIL_PAGES = 20;
const DIRECTORY_USER_AGENT = "Site Rescue Studio Prospect Discovery/1.0 (+https://site-rescue-studio.vercel.app/)";

const PRETORIA_EAST_BASE = "https://www.pretoriaeast.co.za";
// Reserve a bounded cursor range for the two general pages plus all category
// pages. The actual category-page count is read from the live directory index.
const PRETORIA_EAST_PAGE_SIZE = 20;
const PRETORIA_EAST_MAX_CATEGORY_PAGES = 10;
const PRETORIA_EAST_MAX_CATEGORY_COUNT = 50;
const PRETORIA_EAST_PAGE_COUNT = 2 + PRETORIA_EAST_MAX_CATEGORY_PAGES * PRETORIA_EAST_MAX_CATEGORY_COUNT;

const CCBC_BASE = "https://www.ccbc.co.za";
const CCBC_CATEGORY_PATHS = [
  "automotive/all",
  "business-development/all",
  "property-infrastructure/all",
  "retail-and-wholesale/all",
  "human-resources/all",
  "insurance/all"
];
const CCBC_MAX_CATEGORY_PAGES = 10;
const CCBC_PAGE_SIZE = 20;
const CCBC_MAX_LIST_PAGES_PER_DISCOVERY = 3;

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
    links.push({ href, text: stripHtml(match[2]), index: match.index });
  }
  return links;
}

function cleanDirectoryBusinessName(value) {
  const name = stripHtml(value);
  const looksLikeWebsite = /^(?:(?:https?:)?\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(name);
  if (!name || looksLikeWebsite ||
      /^(website|website link|visit website|view website|click here|learn more|read more|more info|official website|home|profile|company profile)$/i.test(name)) {
    return null;
  }
  return name;
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
      name: cleanDirectoryBusinessName(row.name),
      city: row.city || null,
      region: row.region || null,
      locationEvidence: row.locationEvidence || null,
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
      const decoded = raw;
      const website = cleanWebsiteUrl(decoded);
      if (website && hostname(website) !== internalHost) return website;
      const nestedMatch = decoded.match(/https?:\/\/[^\s"'<>]+/i);
      if (nestedMatch) {
        const nestedWebsite = cleanWebsiteUrl(nestedMatch[0]);
        if (nestedWebsite && hostname(nestedWebsite) !== internalHost) return nestedWebsite;
      }
    }
  } catch {}

  const encodedMatch = text.match(/https?%3A%2F%2F[^&\s"'<>]+/i);
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

function extractPlainWebsiteCandidates(html, internalHost) {
  const source = stripHtml(html)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  const rows = [];
  const seen = new Set();
  const pattern = /(?:https?:\/\/|www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?(?:\/[^\s<>"\']*)?/gi;

  let match;
  while ((match = pattern.exec(source))) {
    const website = cleanWebsiteUrl(match[0]);
    const host = hostname(website);
    if (!website || !host || host === internalHost || seen.has(host)) continue;

    seen.add(host);
    rows.push({
      website,
      name: null,
      city: null,
      category: null
    });
  }

  return rows;
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

function isPretoriaEastProfileLink(link, internalHost) {
  if (hostname(link?.href) !== internalHost) return false;
  try {
    const path = new URL(link.href).pathname;
    return /^\/business-directory\/\d+-/i.test(path) || /\/component\/mtree\//i.test(path);
  } catch {
    return false;
  }
}

function pretoriaEastListingContext(html, links, websiteLink, internalHost) {
  const profileLinks = links.filter(link =>
    Number.isFinite(link.index) &&
    link.index < websiteLink.index &&
    isPretoriaEastProfileLink(link, internalHost)
  );
  const profileLink = profileLinks[profileLinks.length - 1];
  if (!profileLink) return null;

  const source = String(html || "");
  const nextProfile = links.find(link =>
    Number.isFinite(link.index) &&
    link.index > profileLink.index &&
    isPretoriaEastProfileLink(link, internalHost)
  );
  const pageMarkerPattern = /(?:Results?\s+\d[\d,]*\s*(?:-|–|to)\s*\d[\d,]*\s+of\s+[\d,]+|Page\s+\d+\s+of\s+\d+)/gi;
  const footerMarkerPattern = /(?:<footer\b|Advertisements|About Pretoria East|Contact Us|Quick Links)/gi;
  const pageMarker = [...source.matchAll(pageMarkerPattern)]
    .find(match => match.index > profileLink.index)?.index ?? -1;
  const footerMarker = [...source.matchAll(footerMarkerPattern)]
    .find(match => match.index > profileLink.index)?.index ?? -1;
  const boundaries = [
    nextProfile?.index,
    pageMarker >= profileLink.index ? pageMarker : null,
    footerMarker >= profileLink.index ? footerMarker : null,
    source.length
  ].filter(Number.isFinite);
  const nextBoundary = Math.min(...boundaries);
  if (websiteLink.index <= profileLink.index || websiteLink.index >= nextBoundary) return null;

  // A directory archive's footer and sponsor links follow its pagination.
  // Only accept an external URL inside the same listing card as a real profile.
  const segment = source.slice(profileLink.index, nextBoundary);
  const citySection = segment.match(/City[\s\S]{0,300}?(?=Postcode|Tags|Page\s+\d|$)/i)?.[0] || "";
  const cityText = stripHtml(citySection);
  // Preserve a specific suburb when the directory lists it before its parent city.
  const cityLabel = cityText.match(/City\s*([^,]+)/i)?.[1]?.trim() || "";
  const city = cityLabel
    ? (/^pretoria east$/i.test(cityLabel) ? "Pretoria East" : cityLabel.replace(/\s+/g, " "))
    : null;

  const name = cleanDirectoryBusinessName(profileLink.text);
  if (!name) return null;
  return {
    name,
    city,
    category: categoryForText(profileLink.text + " " + stripHtml(segment))?.label || null
  };
}

function extractPretoriaEastCandidates(html, maxCandidates) {
  const rows = [];
  const links = extractLinks(html, PRETORIA_EAST_BASE);
  const internalHost = hostname(PRETORIA_EAST_BASE);
  const plainWebsiteRows = extractPlainWebsiteCandidates(html, internalHost);
  let directExternalLinks = 0;
  let nestedWebsiteLinks = 0;
  let unlinkedExternalLinksExcluded = 0;

  for (const link of links) {
    const host = hostname(link.href);
    if (!host) continue;
    const nestedWebsite = host === internalHost
      ? extractNestedWebsiteUrl(link.href, internalHost)
      : "";
    const website = nestedWebsite || cleanWebsiteUrl(link.href);
    if (!website || hostname(website) === internalHost) continue;

    const context = pretoriaEastListingContext(html, links, link, internalHost);
    if (!context) {
      unlinkedExternalLinksExcluded++;
      continue;
    }
    if (!/^https?:/i.test(link.href) && !nestedWebsite) continue;

    if (nestedWebsite) nestedWebsiteLinks++;
    else directExternalLinks++;

    rows.push({
      website,
      name: context.name,
      city: context.city,
      category: context.category
    });
  }

  const linkedCandidates = uniqueCandidates(rows, maxCandidates);
  const plainTextCandidates = uniqueCandidates(plainWebsiteRows, maxCandidates);
  return {
    // Keep profile-linked candidates separate so plain text in page-wide
    // navigation/footer content cannot suppress detail-page extraction.
    linkedCandidates,
    plainTextCandidates,
    candidates: uniqueCandidates(
      [...linkedCandidates, ...plainTextCandidates],
      maxCandidates
    ),
    telemetry: {
      linksInspected: links.length,
      directExternalLinks,
      nestedWebsiteLinks,
      plainWebsiteCandidates: plainWebsiteRows.length,
      unlinkedExternalLinksExcluded,
      linkedCandidateCount: linkedCandidates.length,
      rawRows: rows.length,
      rawRowsIncludingPlainWebsites: rows.length + plainWebsiteRows.length
    }
  };
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


function extractPretoriaEastCategoryLinks(html) {
  const links = extractLinks(html, PRETORIA_EAST_BASE);
  const seen = new Set();
  return links.flatMap(link => {
    try {
      const url = new URL(link.href);
      const path = url.pathname.replace(/\/+$/, "");
      if (url.hostname !== "www.pretoriaeast.co.za") return [];
      if (!/^\/business-directory\/[a-z][a-z0-9-]*$/i.test(path) || /^\/business-directory\/page\d+$/i.test(path)) return [];
      if (seen.has(path)) return [];
      seen.add(path);
      const countMatch = String(link.text || "").match(/\(([\d,]+)\)\s*$/);
      const listingCount = countMatch ? Number(countMatch[1].replace(/,/g, "")) : null;
      const pageCount = listingCount
        ? Math.max(1, Math.min(PRETORIA_EAST_MAX_CATEGORY_PAGES, Math.ceil(listingCount / PRETORIA_EAST_PAGE_SIZE)))
        : 1;
      return [{ ...link, listingCount, pageCount }];
    } catch { return []; }
  });
}

function parsePretoriaEastPageCount(html, fallbackListingCount = null) {
  const text = stripHtml(html).replace(/\s+/g, " ");
  const pageMatch = text.match(/\bPage\s+\d+\s+of\s+(\d+)\b/i);
  if (pageMatch) return Math.max(1, Math.min(PRETORIA_EAST_MAX_CATEGORY_PAGES, Number(pageMatch[1]) || 1));
  const resultsMatch = text.match(/Results?\s+\d[\d,]*\s*(?:-|–|to)\s*\d[\d,]*\s+of\s+([\d,]+)/i);
  const total = resultsMatch
    ? Number(resultsMatch[1].replace(/,/g, ""))
    : Number(fallbackListingCount || 0);
  return total > 0
    ? Math.max(1, Math.min(PRETORIA_EAST_MAX_CATEGORY_PAGES, Math.ceil(total / PRETORIA_EAST_PAGE_SIZE)))
    : 1;
}

function extractPretoriaEastDetailLinks(html) {
  const links = extractLinks(html, PRETORIA_EAST_BASE);
  const seen = new Set();

  return links
    .filter(link => {
      try {
        const url = new URL(link.href);
        return url.hostname === "www.pretoriaeast.co.za" &&
          (/\/component\/mtree\//i.test(url.pathname) || /^\/business-directory\/\d+-/i.test(url.pathname)) &&
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
  let detailPagesFetched = 0;
  let detailWebsiteCandidates = 0;

  for (const detailLink of detailLinks) {
    if (rows.length >= maxCandidates) break;

    try {
      const detailHtml = await fetchHtml(fetchImpl, detailLink.href);
      detailPagesFetched++;
      const website = extractExternalWebsite(detailHtml, internalHost);
      if (!website) continue;
      detailWebsiteCandidates++;

      const text = stripHtml(detailHtml);
      const titleMatch = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const name = titleMatch ? stripHtml(titleMatch[1]) : detailLink.text || null;
      const category = categoryForText(text + " " + (name || ""));

      rows.push({
        website,
        name,
        city: /Centurion/i.test(text) ? "Centurion" : "Pretoria",
        category: category?.label || null
      });
    } catch {}
  }

  return {
    candidates: uniqueCandidates(rows, maxCandidates),
    telemetry: {
      detailLinksFound: detailLinks.length,
      detailPagesFetched,
      detailWebsiteCandidates
    }
  };
}

async function discoverPretoriaEastCandidates(html, maxCandidates, fetchImpl) {
  const directResult = extractPretoriaEastCandidates(html, maxCandidates);
  const linkedCandidates = directResult.linkedCandidates || directResult.candidates;
  const plainTextCandidates = directResult.plainTextCandidates || [];

  // Actual directory/profile links get priority. Page-wide plain-text matches
  // can include navigation/footer domains repeated on every page; they must
  // never fill the candidate limit before business profile pages are checked.
  if (linkedCandidates.length >= maxCandidates) {
    return {
      candidates: linkedCandidates,
      telemetry: {
        ...directResult.telemetry,
        plainTextCandidatesExcluded: plainTextCandidates.length,
        detailLinksFound: 0,
        detailPagesFetched: 0,
        detailWebsiteCandidates: 0
      }
    };
  }

  const remaining = maxCandidates - linkedCandidates.length;
  const detailResult = await extractPretoriaEastDetailCandidates(
    html,
    remaining,
    fetchImpl
  );

  return {
    // Page-wide plain-text domains are retained in telemetry only. They are
    // not tied to a business listing/profile and may be footer, navigation,
    // sponsor, or supplier references. Only listing-linked and profile-derived
    // websites are eligible to enter the production prospect backlog.
    candidates: uniqueCandidates(
      [...linkedCandidates, ...detailResult.candidates],
      maxCandidates
    ),
    telemetry: {
      ...directResult.telemetry,
      ...detailResult.telemetry,
      plainTextCandidatesExcluded: plainTextCandidates.length
    }
  };
}

async function discoverPretoriaEast({ maxCandidates = 20, fetchImpl = fetch, pageOffset = 0 } = {}) {
  const safeMax = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  const requestedPage = Math.abs(Number(pageOffset) || 0);
  let page = requestedPage % PRETORIA_EAST_PAGE_COUNT;
  let pageCount = PRETORIA_EAST_PAGE_COUNT;
  let url;
  let html;
  let indexFetched = false;
  let categoryRoutesFound = 0;

  if (page < 2) {
    url = PRETORIA_EAST_BASE + (page === 0 ? "/business-directory" : "/business-directory/page2");
    html = await fetchHtml(fetchImpl, url);
  } else {
    const indexHtml = await fetchHtml(fetchImpl, PRETORIA_EAST_BASE + "/business-directory");
    indexFetched = true;
    const categoryLinks = extractPretoriaEastCategoryLinks(indexHtml);
    categoryRoutesFound = categoryLinks.length;
    pageCount = Math.max(2, 2 + categoryLinks.reduce((sum, category) => sum + category.pageCount, 0));
    page = requestedPage % pageCount;
    if (page < 2) {
      url = PRETORIA_EAST_BASE + (page === 0 ? "/business-directory" : "/business-directory/page2");
      html = await fetchHtml(fetchImpl, url);
    } else {
      let routeOffset = page - 2;
      let categoryIndex = 0;
      while (categoryIndex < categoryLinks.length && routeOffset >= categoryLinks[categoryIndex].pageCount) {
        routeOffset -= categoryLinks[categoryIndex].pageCount;
        categoryIndex++;
      }
      let categoryPage = routeOffset + 1;
      let selected = false;
      let pageCountChecks = 0;

      // The index counts can be stale. Verify the selected category's real
      // pagination before requesting a page that may no longer exist. Skip a
      // stale final page safely instead of putting the whole provider on cooldown.
      while (categoryIndex < categoryLinks.length && pageCountChecks < 3) {
        const category = categoryLinks[categoryIndex];
        const firstPageHtml = await fetchHtml(fetchImpl, category.href);
        const actualPageCount = parsePretoriaEastPageCount(firstPageHtml, category.listingCount);
        if (categoryPage > actualPageCount) {
          categoryIndex++;
          categoryPage = 1;
          page = 2 + categoryLinks.slice(0, categoryIndex).reduce((sum, item) => sum + item.pageCount, 0);
          pageCountChecks++;
          continue;
        }

        if (categoryPage === 1) {
          url = category.href;
          html = firstPageHtml;
        } else {
          const categoryUrl = new URL(category.href);
          url = categoryUrl.origin + categoryUrl.pathname.replace(/\/+$/, "") + "/page" + categoryPage;
          html = await fetchHtml(fetchImpl, url);
        }
        page = 2 + categoryLinks.slice(0, categoryIndex).reduce((sum, item) => sum + item.pageCount, 0) + (categoryPage - 1);
        selected = true;
        break;
      }

      if (!selected) {
        // If the directory changed while this cursor was being processed,
        // wrap to a general listing page and let the next cycle retry cleanly.
        page = requestedPage % 2;
        url = PRETORIA_EAST_BASE + (page === 0 ? "/business-directory" : "/business-directory/page2");
        html = await fetchHtml(fetchImpl, url);
      }
    }
  }

  const discovery = await discoverPretoriaEastCandidates(html, safeMax, fetchImpl);
  // Pretoria East is a Pretoria-based directory. Attribute this source's
  // candidates to its verified city/province rather than leaving geography null.
  const candidates = discovery.candidates.map(candidate => {
    const rawCity = String(candidate.city || "").trim();
    const countryWide = /^country wide$/i.test(rawCity);
    const city = countryWide ? null : (rawCity || null);
    return {
      ...candidate,
      city,
      // This directory explicitly covers Pretoria East and nearby Pretoria
      // localities. Retain the actual listing locality and its source-backed
      // Gauteng attribution; a "Country Wide" listing is national, not Pretoria.
      region: candidate.region || (countryWide ? "south_africa" : city ? "gauteng" : null),
      locationEvidence: candidate.locationEvidence || (city ? "pretoria_east_directory_listing" : countryWide ? "directory_country_wide_listing" : null)
    };
  });
  return {
    source: "pretoria_east_directory",
    candidates,
    candidateCount: candidates.length,
    page,
    pageCount,
    pageSize: PRETORIA_EAST_PAGE_SIZE,
    url,
    telemetry: { ...discovery.telemetry, indexFetched, categoryRoutesFound }
  };
}

function parseCcbcPageCount(html) {
  const text = stripHtml(html).replace(/\s+/g, " ");
  const totalMatch =
    text.match(/(?:results?|showing)\s+\d[\d,]*\s*(?:-|–|to)\s*\d[\d,]*\s+(?:of|out of)\s+([\d,]+)/i) ||
    text.match(/\b([\d,]+)\s+results?\b/i);
  const totalRecords = totalMatch ? Number(String(totalMatch[1]).replace(/,/g, "")) : null;
  if (Number.isFinite(totalRecords) && totalRecords >= 0) {
    return {
      totalRecords,
      pageCount: Math.max(1, Math.min(CCBC_MAX_CATEGORY_PAGES, Math.ceil(totalRecords / CCBC_PAGE_SIZE)))
    };
  }

  const starts = [...String(html || "").matchAll(/[?&]start=(\d+)/gi)]
    .map(match => Number(match[1]))
    .filter(Number.isFinite);
  if (starts.length) {
    return {
      totalRecords: null,
      pageCount: Math.max(1, Math.min(CCBC_MAX_CATEGORY_PAGES, Math.floor(Math.max(...starts) / CCBC_PAGE_SIZE) + 1))
    };
  }
  return { totalRecords: null, pageCount: null };
}

async function discoverCcbc({ maxCandidates = 20, fetchImpl = fetch, pageOffset = 0 } = {}) {
  const safeMax = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  const pageSeed = Math.abs(Math.floor(Number(pageOffset) || 0));
  const categoryIndex = pageSeed % CCBC_CATEGORY_PATHS.length;
  const categoryPath = CCBC_CATEGORY_PATHS[categoryIndex];
  const requestedPage = Math.floor(pageSeed / CCBC_CATEGORY_PATHS.length) % CCBC_MAX_CATEGORY_PAGES;
  const baseUrl = CCBC_BASE + "/business-directory-2/" + categoryPath;
  const rows = [];
  const seenDetailLinks = new Set();
  const errors = [];
  const fetchedListPages = new Map();
  let listPagesFetched = 0;
  let detailPagesFetched = 0;
  let totalRecords = null;
  let pageCount = null;

  async function fetchListPage(page) {
    if (fetchedListPages.has(page)) return fetchedListPages.get(page);
    const url = baseUrl + "?start=" + (page * CCBC_PAGE_SIZE);
    try {
      const html = await fetchHtml(fetchImpl, url);
      listPagesFetched++;
      fetchedListPages.set(page, html);
      return html;
    } catch (error) {
      errors.push({ url, page, status: error?.status || null, message: String(error?.message || error) });
      fetchedListPages.set(page, null);
      return null;
    }
  }

  // Fetch the requested page first. If the category has fewer pages than the
  // durable cursor slot, fall back to page one to learn its real size.
  let firstHtml = await fetchListPage(requestedPage);
  let metadataHtml = firstHtml;
  if (!metadataHtml && requestedPage > 0) {
    metadataHtml = await fetchListPage(0);
  }
  if (!metadataHtml) {
    return {
      source: "ccbc_directory",
      candidates: [],
      candidateCount: 0,
      categoryPath,
      requestedPage,
      page: requestedPage,
      pageCount: null,
      totalRecords: null,
      listPagesFetched,
      detailPagesFetched,
      errors
    };
  }

  const pagination = parseCcbcPageCount(metadataHtml);
  totalRecords = pagination.totalRecords;
  pageCount = pagination.pageCount || CCBC_MAX_CATEGORY_PAGES;
  const startPage = requestedPage % pageCount;
  let startHtml = fetchedListPages.get(startPage) || null;
  if (!startHtml) startHtml = await fetchListPage(startPage);

  const visitedPages = new Set();
  for (let pageIndex = 0; pageIndex < CCBC_MAX_LIST_PAGES_PER_DISCOVERY && rows.length < safeMax; pageIndex++) {
    const page = (startPage + pageIndex) % pageCount;
    if (visitedPages.has(page)) break;
    visitedPages.add(page);
    const listHtml = page === startPage ? startHtml : await fetchListPage(page);
    if (!listHtml) continue;

    const detailLinks = extractCcbcDetailLinks(listHtml)
      .filter(link => {
        if (seenDetailLinks.has(link.href)) return false;
        seenDetailLinks.add(link.href);
        return true;
      });

    for (const detailLink of detailLinks) {
      if (rows.length >= safeMax || detailPagesFetched >= DIRECTORY_MAX_DETAIL_PAGES) break;
      try {
        const detailHtml = await fetchHtml(fetchImpl, detailLink.href);
        detailPagesFetched++;
        const website = extractCcbcWebsite(detailHtml, detailLink.href);
        if (!website) continue;

        const text = stripHtml(detailHtml);
        if (!/Pretoria|Centurion/i.test(text)) continue;

        const titleMatch = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const name = titleMatch ? stripHtml(titleMatch[1]) : detailLink.text || null;
        const category = categoryForText(text);
        rows.push({
          website,
          name,
          city: /Centurion/i.test(text) ? "Centurion" : "Pretoria",
          category: category?.label || null
        });
      } catch (error) {
        errors.push({ url: detailLink.href, status: error?.status || null, message: String(error?.message || error) });
      }
    }
  }

  const candidates = uniqueCandidates(rows, safeMax);
  return {
    source: "ccbc_directory",
    candidates,
    candidateCount: candidates.length,
    categoryPath,
    requestedPage,
    page: startPage,
    pageCount,
    totalRecords,
    listPagesFetched,
    detailPagesFetched,
    url: baseUrl + "?start=" + (startPage * CCBC_PAGE_SIZE),
    errors
  };
}

module.exports = {
  DIRECTORY_REQUEST_TIMEOUT_MS,
  DIRECTORY_MAX_DETAIL_PAGES,
  PRETORIA_EAST_PAGE_COUNT,
  extractPretoriaEastCategoryLinks,
  CCBC_CATEGORY_PATHS,
  CCBC_MAX_CATEGORY_PAGES,
  CCBC_MAX_LIST_PAGES_PER_DISCOVERY,
  parseCcbcPageCount,
  fetchHtml,
  extractPretoriaEastCandidates,
  extractPlainWebsiteCandidates,
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
