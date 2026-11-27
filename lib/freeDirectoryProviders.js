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
  if (!host) return true;
  // Hotfrog operates many country-specific domains (hotfrog.dk,
  // hotfrog.fr, hotfrog.co.uk, etc.). They are directory navigation hosts,
  // not independent business websites, even though they differ from
  // hotfrog.co.za. Never promote those links as prospects.
  if (source === "hotfrog" && /hotfrog/i.test(host)) return true;
  return host === sourceHost || host.endsWith("." + sourceHost);
}

function cleanBusinessName(value) {
  const name = String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const looksLikeWebsite = /^(?:(?:https?:)?\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(name);
  if (!name || looksLikeWebsite ||
      /^(website|website link|visit website|view website|click here|learn more|read more|more info|official website|home|profile|company profile|review|reviews|review\.|reviews\.)$/i.test(name)) {
    return null;
  }
  return name;
}

function listingBusinessName(html, anchorIndex) {
  const beforeAnchor = String(html || "").slice(0, Math.max(0, Number(anchorIndex) || 0));
  const headings = [...beforeAnchor.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  const heading = headings[headings.length - 1];
  return heading ? cleanBusinessName(heading[1]) : null;
}

function profileBusinessName(html) {
  const source = String(html || "");
  const cleanProfileTitle = value => {
    const name = cleanBusinessName(
      String(value || "")
        .replace(/\s*[|–—-]\s*Hotfrog(?:\s+South Africa)?\s*$/i, "")
        .replace(/\s*[|–—-]\s*South Africa\s*$/i, "")
    );
    return name && !/^(?:welcome to )?hotfrog(?:\s+south africa)?$/i.test(name) ? name : null;
  };

  const heading = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const headingName = heading ? cleanProfileTitle(heading[1]) : null;
  if (headingName) return headingName;

  const structuredNames = [];
  const scripts = source.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const types = Array.isArray(value["@type"]) ? value["@type"].join(" ") : String(value["@type"] || "");
    if (/organization|localbusiness|professionalservice|medicalbusiness|store|corporation|business/i.test(types)) {
      const name = cleanProfileTitle(value.name);
      if (name) structuredNames.push(name);
    }
    for (const child of Object.values(value)) if (child && typeof child === "object") visit(child);
  };
  for (const script of scripts) {
    const match = script.match(/>([\s\S]*?)<\/script>/i);
    if (!match) continue;
    try { visit(JSON.parse(match[1])); } catch {}
  }
  if (structuredNames.length) return structuredNames[0];

  const metaTags = source.match(/<meta\b[^>]*>/gi) || [];
  const readAttribute = (tag, name) => {
    const match = String(tag || "").match(new RegExp("\\b" + name + "\\s*=\\s*(['\"])(.*?)\\1", "i"));
    return match ? match[2] : "";
  };
  for (const preferred of ["og:title", "twitter:title", "title", "name"]) {
    const tag = metaTags.find(item => {
      const key = readAttribute(item, "property") || readAttribute(item, "name") || readAttribute(item, "itemprop");
      return key.toLowerCase() === preferred;
    });
    const name = tag ? cleanProfileTitle(readAttribute(tag, "content")) : null;
    if (name) return name;
  }

  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? cleanProfileTitle(title[1]) : null;
}

function profileExternalLinks(html, source) {
  const profileName = profileBusinessName(html);
  return externalLinks(html, source).map(candidate => ({
    ...candidate,
    name: profileName || cleanBusinessName(candidate.listingName) || cleanBusinessName(candidate.name)
  }));
}

function profileBusinessLocation(html) {
  const source = String(html || "");
  const provinceMap = {
    gauteng: "gauteng", "western cape": "western_cape", "kwazulu-natal": "kwazulu_natal",
    "eastern cape": "eastern_cape", "free state": "free_state", limpopo: "limpopo",
    mpumalanga: "mpumalanga", "north west": "north_west", "northern cape": "northern_cape"
  };
  const cleanText = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  const candidates = [];
  const scripts = source.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const address = value.address;
    if (address && typeof address === "object") {
      candidates.push({
        city: cleanText(address.addressLocality || address.locality),
        region: cleanText(address.addressRegion || address.region)
      });
    }
    for (const child of Object.values(value)) if (child && typeof child === "object") visit(child);
  };
  for (const script of scripts) {
    const match = script.match(/>([\s\S]*?)<\/script>/i);
    if (!match) continue;
    try { visit(JSON.parse(match[1])); } catch {}
  }
  const locality = source.match(/<[^>]*itemprop=["']addressLocality["'][^>]*>([\s\S]*?)<\//i);
  const localityContent = source.match(/<[^>]*itemprop=["']addressLocality["'][^>]*content=["']([^"']+)["']/i);
  const region = source.match(/<[^>]*itemprop=["']addressRegion["'][^>]*>([\s\S]*?)<\//i);
  const regionContent = source.match(/<[^>]*itemprop=["']addressRegion["'][^>]*content=["']([^"']+)["']/i);
  if (locality || localityContent || region || regionContent) {
    candidates.push({
      city: cleanText(localityContent?.[1] || locality?.[1]),
      region: cleanText(regionContent?.[1] || region?.[1])
    });
  }
  const addressTag = source.match(/<address\b[^>]*>([\s\S]*?)<\/address>/i);
  if (addressTag) {
    const text = cleanText(addressTag[1]);
    const cityMatch = text.match(/\b(Pretoria|Centurion|Johannesburg|Midrand|Sandton|Randburg|Roodepoort|Krugersdorp|Kempton Park|Benoni|Boksburg|Germiston|Springs|Vanderbijlpark|Vereeniging)\b/i);
    const provinceMatch = text.match(/\b(Gauteng|Western Cape|KwaZulu-Natal|Eastern Cape|Free State|Limpopo|Mpumalanga|North West|Northern Cape)\b/i);
    if (cityMatch || provinceMatch) candidates.push({ city: cityMatch?.[1] || "", region: provinceMatch?.[1] || "" });
  }
  const found = candidates.find(item => item.city || item.region);
  if (!found) return { city: null, region: null, locationEvidence: null };
  const city = found.city || null;
  const province = String(found.region || "").toLowerCase().replace(/\s+/g, " ").trim();
  return {
    city,
    region: provinceMap[province] || (/^(pretoria|centurion|johannesburg|midrand|sandton|randburg|roodepoort|krugersdorp|kempton park|benoni|boksburg|germiston|springs|vanderbijlpark|vereeniging)$/i.test(city || "") ? "gauteng" : null),
    locationEvidence: "business_profile_address"
  };
}

function isOfficialWebsiteLink(anchorText, attributes, hostname) {
  const context = String([
    anchorText,
    attributes?.title,
    attributes?.["aria-label"]
  ].filter(Boolean).join(" ")).toLowerCase().replace(/\s+/g, " ").trim();
  if (/\b(website|web site|official site|official website|visit site|visit website|homepage|home page|company site)\b/.test(context)) return true;
  const words = context.split(/[^a-z0-9]+/).filter(word => word.length >= 4);
  const hostLabels = String(hostname || "").toLowerCase().split(".");
  return words.some(word => hostLabels.some(label => label.includes(word)));
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
    const anchorText = String(match[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    let hostname = "";
    try { hostname = new URL(website).hostname.replace(/^www\./i, ""); } catch {}
    const attributes = String(match[0] || "").slice(0, String(match[0] || "").indexOf(">") + 1);
    if (!isOfficialWebsiteLink(anchorText, {
      title: (attributes.match(/\btitle\s*=\s*["']([^"']*)["']/i) || [])[1],
      "aria-label": (attributes.match(/\baria-label\s*=\s*["']([^"']*)["']/i) || [])[1]
    }, hostname)) continue;
    const normalized = normalizeWebsite(website);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    links.push({
      website,
      normalized,
      name: cleanBusinessName(anchorText),
      listingName: listingBusinessName(text, match.index)
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
      error.responseDiagnostics = {
        retryAfter: response.headers?.get?.("retry-after") || null
      };
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
    let added = 0;
    let profilePagesFetched = 0;
    let unverifiedProfilesSkipped = 0;

    // Search-page external links are deliberately not candidates: they may be
    // advertisers, footer links or unrelated references. Only an individual
    // business profile can establish the association between business and site.
    for (const detailUrl of detailLinks) {
      if (candidates.length >= limit) break;
      try {
        const profileHtml = await fetchHtml(fetchImpl, detailUrl);
        profilePagesFetched++;
        const profileCandidates = profileExternalLinks(profileHtml, "hotfrog");
        const location = profileBusinessLocation(profileHtml);
        if (!profileCandidates.length) {
          unverifiedProfilesSkipped++;
          continue;
        }
        for (const candidate of profileCandidates) {
          if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
          seen.add(candidate.normalized);
          candidates.push({
            ...candidate,
            name: cleanBusinessName(candidate.name) || cleanBusinessName(candidate.listingName),
            city: location.city,
            region: location.region,
            locationEvidence: location.locationEvidence,
            category: null
          });
          added++;
        }
      } catch {
        unverifiedProfilesSkipped++;
      }
    }
    queryResults.push({
      query: query.label,
      city: query.city,
      page,
      detailPagesFound: detailLinks.length,
      profilePagesFetched,
      unverifiedProfilesSkipped,
      directSearchLinksIgnored: externalLinks(html, "hotfrog").length,
      websiteCandidatesAdded: added
    });
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
        const links = profileExternalLinks(await fetchHtml(fetchImpl, detailUrl), "opendi");
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

function pretoriaHubListingMetadata(html, profileUrl) {
  const source = String(html || "");
  let targetPath = "";
  try {
    targetPath = new URL(profileUrl).pathname.replace(/\/+$/, "/");
  } catch {
    return { name: null, city: null };
  }

  const anchorPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  let anchor;
  while ((anchor = anchorPattern.exec(source))) {
    let anchorPath = "";
    try {
      anchorPath = new URL(anchor[2], "https://pretoriahub.com").pathname.replace(/\/+$/, "/");
    } catch {
      continue;
    }
    if (anchorPath !== targetPath) continue;

    const beforeAnchor = source.slice(0, anchor.index);
    const headingStarts = [...beforeAnchor.matchAll(/<h([23])\b[^>]*>/gi)];
    const headingStart = headingStarts[headingStarts.length - 1];
    if (!headingStart) return { name: null, city: null };

    const headingTag = headingStart[1];
    const headingClose = source.toLowerCase().indexOf("</h" + headingTag + ">", headingStart.index);
    if (headingClose < 0) return { name: null, city: null };
    const afterHeadingStart = headingClose + headingTag.length + 4;
    const headingHtml = source.slice(headingStart.index, afterHeadingStart);
    const nextHeading = source.slice(afterHeadingStart).search(/<h[23]\b/i);
    const cardEnd = nextHeading >= 0 ? afterHeadingStart + nextHeading : source.length;
    const cardText = source
      .slice(afterHeadingStart, cardEnd)
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const postalCity = cardText.match(/\b(Centurion|Pretoria)\s*,\s*\d{4}\b/i);
    const city = postalCity
      ? (postalCity[1].toLowerCase() === "centurion" ? "Centurion" : "Pretoria")
      : /\bCenturion\b/i.test(cardText)
        ? "Centurion"
        : /\bPretoria\b/i.test(cardText)
          ? "Pretoria"
          : null;

    return {
      name: cleanBusinessName(headingHtml),
      city
    };
  }
  return { name: null, city: null };
}

async function discoverPretoriaHub({ queries = [], maxCandidates = 20, pageOffset = 0, fetchImpl = fetch } = {}) {
  const candidates = [];
  const seen = new Set();
  const seenProfileLinks = new Set();
  const limit = Math.max(1, Math.min(Number(maxCandidates) || 20, 20));
  const fallbackListingUrls = [
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
  const cursor = Math.max(0, Math.floor(Number(pageOffset) || 0) / 20);
  const profileWindow = Math.floor(cursor);
  const errors = [];
  let pagesFetched = 0;
  let profilesFetched = 0;
  let profileLinksFound = 0;
  let duplicateProfilesSkipped = 0;
  let profilesWithWebsiteLinks = 0;
  let websiteLinksFound = 0;
  let homepageFetched = false;

  let homepageHtml = "";
  try {
    homepageHtml = await fetchHtml(fetchImpl, "https://pretoriahub.com/");
    pagesFetched++;
    homepageFetched = true;
  } catch (error) {
    errors.push({
      url: "https://pretoriahub.com/",
      status: error?.status || null,
      message: String(error?.message || error)
    });
  }

  const discoveredRoutes = homepageHtml
    ? internalLinks(homepageHtml, "pretoriahub", /\/(?:section|category|suburb)\//i)
    : [];
  const indexUrls = homepageHtml
    ? internalLinks(homepageHtml, "pretoriahub", /\/(?:categories|suburbs)(?:\/|$)/i).slice(0, 2)
    : [];
  const selectedIndexUrls = indexUrls.length ? [indexUrls[Math.floor(cursor) % indexUrls.length]] : [];
  let indexPagesFetched = 0;
  for (const indexUrl of selectedIndexUrls) {
    try {
      const indexHtml = await fetchHtml(fetchImpl, indexUrl);
      pagesFetched++;
      indexPagesFetched++;
      discoveredRoutes.push(...internalLinks(indexHtml, "pretoriahub", /\/(?:section|category|suburb)\//i));
    } catch (error) {
      errors.push({ url: indexUrl, status: error?.status || null, message: String(error?.message || error) });
    }
  }
  const uniqueDiscoveredRoutes = [...new Set(discoveredRoutes)];
  const categoryRoutes = uniqueDiscoveredRoutes.filter(url => /\/(?:section|category)\//i.test(url));
  const suburbRoutes = uniqueDiscoveredRoutes.filter(url => /\/suburb\//i.test(url));
  const listingUrls = [...new Set([...categoryRoutes, ...suburbRoutes, ...fallbackListingUrls])];
  const routeWindowSize = Math.min(9, listingUrls.length);
  const startIndex = listingUrls.length ? (Math.floor(cursor) * routeWindowSize) % listingUrls.length : 0;
  const selectedListingUrls = Array.from(
    { length: routeWindowSize },
    (_, index) => listingUrls[(startIndex + index) % listingUrls.length]
  );

  let profileOffsetUsed = 0;
  let profileOffsetRecorded = false;
  for (const url of selectedListingUrls) {
    if (candidates.length >= limit) break;
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
    const profileStart = allProfileLinks.length
      ? (profileWindow * MAX_DETAIL_PAGES) % allProfileLinks.length
      : 0;
    if (!profileOffsetRecorded && allProfileLinks.length) {
      profileOffsetUsed = profileStart;
      profileOffsetRecorded = true;
    }

    const profileLinks = [];
    for (const profileUrl of allProfileLinks.slice(profileStart, profileStart + windowSize)) {
      if (seenProfileLinks.has(profileUrl)) {
        duplicateProfilesSkipped++;
        continue;
      }
      seenProfileLinks.add(profileUrl);
      profileLinks.push(profileUrl);
    }

    for (const profileUrl of profileLinks) {
      if (candidates.length >= limit) break;
      try {
        const profileHtml = await fetchHtml(fetchImpl, profileUrl);
        profilesFetched++;
        const listingMetadata = pretoriaHubListingMetadata(html, profileUrl);
        const profileCandidates = profileExternalLinks(profileHtml, "pretoriahub");
        if (profileCandidates.length) profilesWithWebsiteLinks++;
        websiteLinksFound += profileCandidates.length;
        for (const candidate of profileCandidates) {
          if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
          seen.add(candidate.normalized);
          candidates.push({
            ...candidate,
            name: candidate.name || listingMetadata.name || null,
            city: listingMetadata.city,
            category: null
          });
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
    listingRoutesFound: uniqueDiscoveredRoutes.length,
    listingRoutesFetched: selectedListingUrls.length,
    indexPagesFetched,
    homepageFetched,
    profileLinksFound,
    duplicateProfilesSkipped,
    pagesFetched,
    profilesFetched,
    profilesWithWebsiteLinks,
    websiteLinksFound,
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
  const errors = [];
  const allCityQueries = [...new Map(
    queries.filter(query => query?.city).map(query => [citySlug(query.city), query])
  ).values()];
  // Treat the durable provider cursor as a city/page pair: visit every city
  // on page 1 before moving to page 2. Advancing both the city window and page
  // on every call skipped most archive pages for each city.
  const cursor = Math.max(0, Math.floor(Math.abs(Number(pageOffset) || 0) / 20));
  const cityCount = Math.max(1, allCityQueries.length);
  const page = Math.floor(cursor / cityCount) + 1;
  const cityIndex = cursor % cityCount;
  const requestedCityQueries = allCityQueries.length
    ? [allCityQueries[cityIndex]]
    : [];
  let successfulArchives = 0;
  let countryFallbackAttempted = false;

  function cleanedBusinessName(value) {
    return cleanBusinessName(value);
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
    const cityUrls = [...new Set([
      cityPageUrl,
      page > 1 ? cityBaseUrl : null
    ].filter(Boolean))];
    const countryUrls = [...new Set([
      nationalPageUrl,
      page > 1 ? nationalBaseUrl : null
    ].filter(Boolean))];
    const cityErrors = [];
    let lastSuccessfulUrl = null;
    let added = 0;
    let attemptedUrls = 0;
    let cityArchiveResolved = false;

    async function inspectArchive(url, isCityArchive) {
      attemptedUrls++;
      const html = await fetchHtml(fetchImpl, url);
      successfulArchives++;
      lastSuccessfulUrl = url;
      const extracted = externalLinks(html, "mycityinfo").map(candidate => {
        const { listingName, ...websiteCandidate } = candidate;
        return {
          ...websiteCandidate,
          name: cleanedBusinessName(listingName) || cleanedBusinessName(candidate.name),
          // Archive pages are not category-specific search results. Never
          // attach the query label as if it verified the business.
          city: isCityArchive ? query.city : null,
          region: isCityArchive ? null : "south_africa",
          category: null
        };
      });
      const freshCandidates = await filterCandidates(extracted, "mycityinfo");
      for (const candidate of freshCandidates || []) {
        if (candidates.length >= limit || seen.has(candidate.normalized)) continue;
        seen.add(candidate.normalized);
        candidates.push(candidate);
        added++;
      }
    }

    // Prefer the requested city archive. A successful archive containing only
    // known sites is still a valid city result: do not then fetch the same
    // national archive for every city in this provider attempt.
    for (const url of cityUrls) {
      if (candidates.length >= limit || added > 0) break;
      try {
        await inspectArchive(url, true);
        cityArchiveResolved = true;
        break;
      } catch (error) {
        const diagnostic = {
          city: query.city,
          page,
          url,
          scope: "city",
          status: error?.status || null,
          message: String(error?.message || error)
        };
        errors.push(diagnostic);
        cityErrors.push(diagnostic);
      }
    }

    // Use the country archive only when the city route is unavailable (or the
    // city is not mapped), and at most once per provider attempt.
    if (!cityArchiveResolved && !countryFallbackAttempted && candidates.length < limit && added === 0) {
      countryFallbackAttempted = true;
      for (const url of countryUrls) {
        if (candidates.length >= limit || added > 0) break;
        try {
          await inspectArchive(url, false);
          break;
        } catch (error) {
          errors.push({
            city: query.city,
            page,
            url,
            scope: "country",
            status: error?.status || null,
            message: String(error?.message || error)
          });
        }
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
  externalLinks,
  profileExternalLinks,
  profileBusinessLocation,
  isOfficialWebsiteLink
};
