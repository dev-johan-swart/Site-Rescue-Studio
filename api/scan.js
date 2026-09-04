const { URL } = require("url");

const USER_AGENT =
  "Site Rescue Studio Website Health Scanner/3.0";

const FETCH_TIMEOUT = 15000;

const MAX_CRAWL_PAGES = 8;
const MAX_DISCOVERED_LINKS = 80;
const MAX_LINKS_TO_TEST = 30;

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(tag, attribute) {
  const regex = new RegExp(
    `${attribute}\\s*=\\s*["']([^"']*)["']`,
    "i"
  );

  const match = tag.match(regex);

  return match
    ? cleanText(match[1])
    : "";
}

/*
 * --------------------------------------------------------
 * ACCESSIBLE LINK NAME
 * --------------------------------------------------------
 */

function getAccessibleLinkName(link) {
  const ariaLabel =
    getAttribute(
      link,
      "aria-label"
    ) || "";

  const ariaLabelledby =
    getAttribute(
      link,
      "aria-labelledby"
    ) || "";

  const title =
    getAttribute(
      link,
      "title"
    ) || "";

  const role =
    getAttribute(
      link,
      "role"
    ) || "";

  /*
   * Visible text inside the complete link element.
   *
   * SVG content is removed so SVG <title>/<desc>
   * does not incorrectly become visible link text.
   */
  const visibleText =
    cleanText(
      link
        .replace(
          /<svg[\s\S]*?<\/svg>/gi,
          " "
        )
        .replace(
          /<[^>]+>/g,
          " "
        )
    );

  /*
   * Image alternative text.
   */
  const imageAltMatch =
    link.match(
      /<img\b[^>]*\balt\s*=\s*["']([^"']*)["']/i
    );

  const imageAlt =
    imageAltMatch
      ? cleanText(
          imageAltMatch[1]
        )
      : "";

  /*
   * SVG accessibility information.
   */
  const svgAriaLabelMatch =
    link.match(
      /<svg\b[^>]*\baria-label\s*=\s*["']([^"']+)["']/i
    );

  const svgAriaLabel =
    svgAriaLabelMatch
      ? cleanText(
          svgAriaLabelMatch[1]
        )
      : "";

  const svgTitleMatch =
    link.match(
      /<svg[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i
    );

  const svgTitle =
    svgTitleMatch
      ? cleanText(
          svgTitleMatch[1]
        )
      : "";

  const svgDescMatch =
    link.match(
      /<svg[\s\S]*?<desc[^>]*>([\s\S]*?)<\/desc>/i
    );

  const svgDescription =
    svgDescMatch
      ? cleanText(
          svgDescMatch[1]
        )
      : "";

  /*
   * JavaScript interaction.
   */
  const onclick =
    getAttribute(
      link,
      "onclick"
    ) || "";

  /*
   * href.
   */
  const href =
    getAttribute(
      link,
      "href"
    ) || "";

  const hasOnclick =
    Boolean(
      onclick.trim()
    );

  /*
   * SVG presence.
   */
  const hasSvg =
    /<svg\b/i.test(
      link
    );

  /*
   * Icon-only link.
   */
  const isIconLink =
    hasSvg &&
    !visibleText;

  /*
   * JavaScript navigation/control.
   */
  const isJavaScriptControl =
    hasOnclick &&
    (
      !href ||
      href === "#" ||
      /^javascript:/i.test(
        href
      )
    );

  /*
   * An accessible name can come from
   * several valid sources.
   */
  const hasAccessibleName =
    Boolean(
      ariaLabel ||
      ariaLabelledby ||
      visibleText ||
      title ||
      imageAlt ||
      svgAriaLabel ||
      svgTitle ||
      svgDescription
    );

  return {
    ariaLabel,
    ariaLabelledby,
    title,
    role,
    visibleText,
    imageAlt,
    svgAriaLabel,
    svgTitle,
    svgDescription,
    href,
    onclick,
    hasOnclick,
    hasSvg,
    isIconLink,
    isJavaScriptControl,
    hasAccessibleName
  };
}

function extractTags(html, tagName) {
  const regex = new RegExp(
    `<${tagName}\\b[^>]*>`,
    "gi"
  );

  return html.match(regex) || [];
}

function extractElements(html, tagName) {
  const regex = new RegExp(
    `<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`,
    "gi"
  );

  return html.match(regex) || [];
}

function extractTextBetween(html, tagName) {
  const regex = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "gi"
  );

  const results = [];

  let match;

  while ((match = regex.exec(html)) !== null) {
    const text = cleanText(
      match[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
    );

    if (text) {
      results.push(text);
    }
  }

  return results;
}

function getMetaContent(html, name) {
  const escapedName = name.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const regex = new RegExp(
    `<meta\\b[^>]*(?:name|property)\\s*=\\s*["']${escapedName}["'][^>]*>`,
    "i"
  );

  const match = html.match(regex);

  if (!match) {
    return "";
  }

  return getAttribute(match[0], "content");
}

function hasMeta(html, name) {
  return Boolean(
    getMetaContent(html, name)
  );
}

function finding(
  title,
  description,
  status,
  weight = 1,
  severity = "info"
) {
  return {
    title,
    description,
    status,
    weight,
    severity
  };
}

function calculateWeightedScore(checks) {
  if (!Array.isArray(checks) || !checks.length) {
    return 0;
  }

  let totalWeight = 0;
  let earnedWeight = 0;

  for (const check of checks) {
    const weight =
      typeof check.weight === "number" &&
      Number.isFinite(check.weight)
        ? check.weight
        : 0;

    totalWeight += weight;

    if (check.status === "pass") {
      earnedWeight += weight;
    } else if (check.status === "warning") {
      earnedWeight += weight * 0.5;
    }
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return Math.round(
    (earnedWeight / totalWeight) * 100
  );
}

function isBlockedHostname(hostname) {
  const host =
    String(hostname || "").toLowerCase();

  const blockedHosts = [
    "localhost",
    "localhost.localdomain",
    "0.0.0.0",
    "127.0.0.1",
    "::1",
    "[::1]"
  ];

  if (blockedHosts.includes(host)) {
    return true;
  }

  if (
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  return false;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);

    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function normalizeUrl(value, baseUrl = null) {
  try {
    const parsed = baseUrl
      ? new URL(value, baseUrl)
      : new URL(value);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return null;
    }

    /*
     * Remove fragments.
     *
     * #contact does not represent another
     * page and should not be crawled separately.
     */

    parsed.hash = "";

    /*
     * Remove common tracking parameters.
     */

    const trackingParameters = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid"
    ];

    for (const parameter of trackingParameters) {
      parsed.searchParams.delete(parameter);
    }

    /*
     * Normalize trailing slash except for root.
     */

    if (
      parsed.pathname.length > 1 &&
      parsed.pathname.endsWith("/")
    ) {
      parsed.pathname =
        parsed.pathname.slice(0, -1);
    }

    return parsed.href;
  } catch {
    return null;
  }
}

function isSameOrigin(urlA, urlB) {
  try {
    return (
      new URL(urlA).origin ===
      new URL(urlB).origin
    );
  } catch {
    return false;
  }
}

function getPathname(url) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

async function fetchWithTimeout(
  url,
  options = {},
  timeout = FETCH_TIMEOUT
) {
  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/*
 * --------------------------------------------------------
 * STRUCTURED DATA
 * --------------------------------------------------------
 */

function analyzeStructuredData(html) {
  const scripts =
    extractTextBetween(
      html,
      "script"
    );

  const schemaTypes =
    new Set();

  let jsonLdCount = 0;
  let validJsonLdCount = 0;

  for (const script of scripts) {
    const trimmed =
      script.trim();

    if (!trimmed) {
      continue;
    }

    const looksLikeJsonLd =
      /"@context"\s*:\s*"https?:\/\/schema\.org/i.test(
        trimmed
      ) ||
      /"@type"\s*:/i.test(
        trimmed
      );

    if (!looksLikeJsonLd) {
      continue;
    }

    jsonLdCount += 1;

    try {
      const data =
        JSON.parse(trimmed);

      validJsonLdCount += 1;

      const collectTypes = (
        value,
        visited = new Set()
      ) => {
        if (!value) {
          return;
        }

        if (
          typeof value === "object"
        ) {
          if (visited.has(value)) {
            return;
          }

          visited.add(value);
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            collectTypes(
              item,
              visited
            );
          }

          return;
        }

        if (
          typeof value !== "object"
        ) {
          return;
        }

        const type =
          value["@type"];

        if (
          typeof type === "string"
        ) {
          schemaTypes.add(
            type.trim()
          );
        }

        if (Array.isArray(type)) {
          for (const item of type) {
            if (
              typeof item === "string"
            ) {
              schemaTypes.add(
                item.trim()
              );
            }
          }
        }

        if (value["@graph"]) {
          collectTypes(
            value["@graph"],
            visited
          );
        }

        for (
          const key of Object.keys(value)
        ) {
          if (
            key !== "@graph" &&
            key !== "@type" &&
            typeof value[key] === "object"
          ) {
            collectTypes(
              value[key],
              visited
            );
          }
        }
      };

      collectTypes(data);
    } catch {
      /*
       * Invalid JSON-LD is ignored.
       */
    }
  }

  const supportedTypes = [
    "LocalBusiness",
    "Organization",
    "WebSite",
    "FAQPage",
    "BreadcrumbList",
    "Product",
    "Article",
    "WebPage",
    "ContactPage",
    "AboutPage",
    "Service",
    "Person",
    "Review",
    "AggregateRating",
    "ImageObject",
    "VideoObject",
    "Event",
    "Recipe",
    "JobPosting",
    "MedicalBusiness",
    "Dentist",
    "Restaurant",
    "Store"
  ];

  const detectedTypes =
    supportedTypes.filter(type =>
      [...schemaTypes].some(
        detected =>
          detected.toLowerCase() ===
          type.toLowerCase()
      )
    );

  const otherTypes =
    [...schemaTypes].filter(
      type =>
        !supportedTypes.some(
          supported =>
            supported.toLowerCase() ===
            type.toLowerCase()
        )
    );

  return {
    present:
      jsonLdCount > 0,

    jsonLdCount,

    validJsonLdCount,

    detectedTypes,

    otherTypes,

    valid:
      validJsonLdCount > 0
  };
}

/*
 * --------------------------------------------------------
 * PAGE CATEGORY / PRIORITY
 * --------------------------------------------------------
 */

function scorePageCandidate( url, anchorText = "" ) { const path = getPathname(url).toLowerCase(); const text = cleanText(anchorText).toLowerCase(); const combined = `${path} ${text}`; let score = 0; /* * -------------------------------------------------- * STRONG BUSINESS PAGE SIGNALS * -------------------------------------------------- */ const strongSignals = [ { pattern: /\bcontact(?:-us)?\b/, score: 100 }, { pattern: /\bquote\b|\bget-a-quote\b|\brequest-a-quote\b/, score: 95 }, { pattern: /\bbook(?:ing)?\b|\bappointment\b|\bschedule\b/, score: 90 }, { pattern: /\blocation\b|\bdirections\b/, score: 85 }, { pattern: /\bservices?\b/, score: 75 }, { pattern: /\babout\b|\bwho-we-are\b/, score: 70 }, { pattern: /\bpricing\b|\bprices\b/, score: 60 }, { pattern: /\bteam\b/, score: 45 }, { pattern: /\bfaq\b/, score: 35 } ]; for ( const signal of strongSignals ) { if ( signal.pattern.test(combined) ) { score = Math.max( score, signal.score ); } } /* * -------------------------------------------------- * NAVIGATION LABEL SIGNALS * -------------------------------------------------- * * These give additional weight when the * visible navigation text confirms the * purpose of the page. */ if ( /\bcontact\b|\bcontact us\b/.test(text) ) { score += 30; } if ( /\bservices?\b/.test(text) ) { score += 20; } if ( /\babout\b/.test(text) ) { score += 15; } if ( /\bquote\b|\bget a quote\b/.test(text) ) { score += 25; } if ( /\bbook\b|\bappointment\b|\bschedule\b/.test(text) ) { score += 20; } if ( /\blocation\b|\bdirections\b/.test(text) ) { score += 20; } /* * -------------------------------------------------- * LOW-PRIORITY / NON-BUSINESS PAGES * -------------------------------------------------- * * These pages should normally not consume * crawler capacity. */ const lowPrioritySignals = [ /\/privacy(?:\.html)?$/i, /\/terms(?:\.html)?$/i, /\/login(?:\.html)?$/i, /\/signin(?:\.html)?$/i, /\/register(?:\.html)?$/i, /\/checkout(?:\.html)?$/i, /\/cart(?:\.html)?$/i, /\/account(?:\.html)?$/i, /\/feed(?:\.html)?$/i, /\/tag\//i, /\/category\//i, /\/author\//i ]; for ( const pattern of lowPrioritySignals ) { if ( pattern.test(path) ) { score -= 100; } } /* * -------------------------------------------------- * GENERIC INTERNAL PAGE * -------------------------------------------------- * * A real internal HTML page that does not * match a strong business signal still gets * a small baseline score. * * This is important because the crawler should * be able to inspect legitimate pages that use * unusual URL names. */ if ( score === 0 && path !== "/" && !lowPrioritySignals.some( pattern => pattern.test(path) ) ) { score = 10; } return score; }

/*
 * --------------------------------------------------------
 * INTERNAL PAGE DISCOVERY
 * --------------------------------------------------------
 */

function extractAnchorElements(html) {
  const regex =
    /<a\b[^>]*>[\s\S]*?<\/a>/gi;

  return html.match(regex) || [];
}

function discoverInternalPages(
  html,
  baseUrl
) {
  
  const links =
    extractAnchorElements(
    html
  );

  const candidates =
    new Map();

  for (const link of links) {
    const href =
  getAttribute(
    link,
    "href"
  ) || "";

const onclick =
  getAttribute(
    link,
    "onclick"
  ) || "";

const trimmedHref =
  href.trim();

/*
 * Some websites use JavaScript navigation
 * instead of href attributes.
 *
 * Example:
 *
 * onclick="navigateTo('services')"
 *
 * Identify the destination, but do not assume
 * it is a real server-side page yet.
 */
let javascriptDestination = "";

const navigationMatch =
  onclick.match(
    /(?:navigateTo|goTo|openPage|showPage|loadPage)\s*\(\s*['"]([^'"]+)['"]\s*\)/i
  );

if (
  navigationMatch
) {
  javascriptDestination =
    navigationMatch[1].trim();
}

/*
 * If there is no href and no recognised
 * JavaScript destination, this is not a
 * crawlable internal page.
 */
if (
  !trimmedHref &&
  !javascriptDestination
) {
  continue;
}

/*
 * JavaScript navigation destinations may
 * represent SPA sections rather than actual
 * URLs.
 *
 * We record them separately rather than
 * blindly converting them into URLs.
 */
if (
  !trimmedHref &&
  javascriptDestination
) {
  
  continue;
}

    if (
      trimmedHref.startsWith("#") ||
      trimmedHref.startsWith("mailto:") ||
      trimmedHref.startsWith("tel:") ||
      trimmedHref.startsWith("javascript:")
    ) {
      continue;
    }

    const normalized =
      normalizeUrl(
        trimmedHref,
        baseUrl
      );

    if (!normalized) {
      continue;
    }

    if (
      !isSameOrigin(
        normalized,
        baseUrl
      )
    ) {
      continue;
    }

    const parsed =
      new URL(normalized);

    /*
     * Skip obvious files.
     */

    const extension =
      parsed.pathname
        .split(".")
        .pop()
        .toLowerCase();

    const ignoredExtensions = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "svg",
      "ico",
      "pdf",
      "zip",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "mp3",
      "mp4",
      "webm",
      "avi",
      "mov",
      "css",
      "js",
      "json",
      "xml"
    ];

    if (
      ignoredExtensions.includes(
        extension
      )
    ) {
      continue;
    }

    const anchorText =
      cleanText(
        link
          .replace(
            /<svg[\s\S]*?<\/svg>/gi,
            " "
          )
          .replace(
            /<[^>]+>/g,
            " "
          )
      );

    const score =
      scorePageCandidate(
        normalized,
        anchorText
      );

    const existing =
      candidates.get(
        normalized
      );

    if (
      !existing ||
      score > existing.score
    ) {
      candidates.set(
        normalized,
        {
          url: normalized,
          anchorText,
          score
        }
      );
    }
  }

  return [
    ...candidates.values()
  ]
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(
      0,
      MAX_DISCOVERED_LINKS
    );
}

/*
 * --------------------------------------------------------
 * BUSINESS SIGNAL ANALYSIS
 * --------------------------------------------------------
 */

function analyzeBusinessSignals(
  html,
  pageUrl
 ) {
  const pageText =
    cleanText(
      html
        .replace(
          /<script[\s\S]*?<\/script>/gi,
          " "
        )
        .replace(
          /<style[\s\S]*?<\/style>/gi,
          " "
        )
        .replace(
          /<[^>]+>/g,
          " "
        )
    );

  /*
   * PHONE
   */

  const phonePattern =
    /(?:\+27|0)\s?\d{2}[\s-]?\d{3}[\s-]?\d{4}/i;

  const hasPhone =
    phonePattern.test(
      pageText
    ) ||
    phonePattern.test(
      html
    );

  const hasClickablePhone =
    /<a\b[^>]*href\s*=\s*["']\s*tel:/i.test(
      html
    );

  /*
   * EMAIL
   */

  const emailPattern =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  const hasEmail =
    emailPattern.test(
      pageText
    ) ||
    emailPattern.test(
      html
    );

  const hasClickableEmail =
    /<a\b[^>]*href\s*=\s*["']\s*mailto:/i.test(
      html
    );

  /*
   * WHATSAPP
   */

  const hasWhatsApp =
    /wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(
      html
    ) ||
    /\bwhatsapp\b/i.test(
      pageText
    );

    const hasClickableWhatsApp =
    /<a\b[^>]*href\s*=\s*["'][^"']*(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp:\/\/)[^"']*["']/i.test(
      html
    );

  /*
   * ADDRESS / LOCATION
   *
   * Stronger evidence than the old broad
   * "Pretoria means address" test.
   */

  const hasAddressElement =
    /<address\b/i.test(
      html
    );

  const hasMapLink =
    /google\.[^"' ]*maps|maps\.google|goo\.gl\/maps|googleusercontent\.com\/maps/i.test(
      html
    );

  const hasMapEmbed =
    /<iframe\b[^>]*(?:google\.com\/maps|google\.co\.[^/]+\/maps|maps\.google)/i.test(
      html
    );

  const addressPattern =
    /\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:street|road|avenue|ave|drive|close|lane|boulevard|blvd|crescent|parkway|place|way)\b/i;

  const regionalLocationPattern =
    /\b(?:Pretoria|Centurion|Johannesburg|Cape Town|Durban|Gauteng|South Africa)\b/i;

  const hasAddress =
    hasAddressElement ||
    hasMapLink ||
    hasMapEmbed ||
    addressPattern.test(
      pageText
    );

  /*
   * We only use a regional name as supporting evidence
   * when it occurs on a likely contact/location page.
   */

  const likelyLocationPage =
    /\b(?:contact|location|directions|find us|where we are)\b/i.test(
      pageText
    ) ||
    /\b(?:contact|location|directions)\b/i.test(
      getPathname(pageUrl)
    );

  const hasRegionalLocation =
    likelyLocationPage &&
    regionalLocationPattern.test(
      pageText
    );

  /*
   * FORM
   */

  const formMatches =
    html.match(
      /<form\b[^>]*>[\s\S]*?<\/form>/gi
    ) || [];

  const forms =
    formMatches.map(
      form => {

        const fields =
          (
            form.match(
              /<(?:input|textarea|select)\b/gi
            ) || []
          ).length;

        const hasSubmit =
          /<button\b[^>]*type\s*=\s*["']?submit\b/i.test(
            form
          ) ||
          /<input\b[^>]*type\s*=\s*["']?submit\b/i.test(
            form
          ) ||
          /<button\b/i.test(
            form
          );

        const action =
          getAttribute(
            form,
            "action"
          );

        return {
          fields,
          hasSubmit,
          action
        };
      }
    );

  const hasForm =
    forms.length > 0;

  const hasUsableForm =
    forms.some(
      form =>
        form.fields > 0 &&
        form.hasSubmit
    );

  /*
   * CTA
   *
   * Avoid matching words buried inside scripts/styles.
   */

  const hasCTA =
    /\b(?:contact us|get in touch|request a quote|get a quote|request quote|book now|book an appointment|schedule|call us|enquire|enquiry|learn more|buy now|shop now|get started)\b/i.test(
      pageText
    );

  /*
   * Return evidence with source.
   */

  return {
    url: pageUrl,

    phone: {
      found: hasPhone,
      clickable: hasClickablePhone
    },

    email: {
      found: hasEmail,
      clickable: hasClickableEmail
    },

    whatsapp: {
      found: hasWhatsApp,
      clickable: hasClickableWhatsApp
    },

    location: {
      found:
        hasAddress ||
        hasRegionalLocation,
      addressElement:
        hasAddressElement,
      mapLink:
        hasMapLink,
      mapEmbed:
        hasMapEmbed
    },

    form: {
      found: hasForm,
      usable:
        hasUsableForm,
      count:
        forms.length
    },

    cta: {
      found: hasCTA
    }
  };
}

async function testLinks(
  linkResults,
  maxLinks = MAX_LINKS_TO_TEST
 ) {
  const linksToTest =
    linkResults.filter(
      link =>
        link.status === "pending"
    );

  for (
    const link of linksToTest.slice(
      0,
      maxLinks
    )
  ) {
    try {
      /*
       * FIRST ATTEMPT
       *
       * HEAD is lightweight and avoids
       * downloading the full destination.
       */

      let linkResponse =
        await fetchWithTimeout(
          link.url,
          {
            method: "HEAD",
            redirect: "follow",
            headers: {
              "User-Agent":
                USER_AGENT
            }
          },
          8000
        );

      /*
       * Some servers reject HEAD even though
       * the actual page works.
       *
       * Retry with GET.
       */

      if (
        linkResponse.status === 403 ||
        linkResponse.status === 405 ||
        linkResponse.status === 501
      ) {
        linkResponse =
          await fetchWithTimeout(
            link.url,
            {
              method: "GET",
              redirect: "follow",
              headers: {
                "User-Agent":
                  USER_AGENT
              }
            },
            8000
          );

        link.testMethod = "GET";
      } else {
        link.testMethod = "HEAD";
      }

      link.statusCode =
        linkResponse.status;

      link.finalUrl =
        linkResponse.url ||
        link.url;

      link.redirected =
        Boolean(
          linkResponse.url &&
          linkResponse.url !==
            link.url
        );

      /*
       * Successful destination.
       */

      if (linkResponse.ok) {
        link.status = "working";
      }

      /*
       * Automated verification blocked.
       *
       * This does NOT automatically mean
       * the customer's link is broken.
       */

      else if (
        linkResponse.status === 403 ||
        linkResponse.status === 405 ||
        linkResponse.status === 429
      ) {
        link.status = "blocked";

        link.note =
          "The destination did not allow automated verification. This does not necessarily mean the link is broken.";
      }

      /*
       * External services often return errors
       * that do not necessarily mean the destination
       * is genuinely broken.
       */

      else if (
        link.type === "external" &&
        (
          linkResponse.status === 400 ||
          linkResponse.status === 401 ||
          linkResponse.status === 406 ||
          linkResponse.status === 408 ||
          linkResponse.status >= 500
        )
      ) {
        link.status = "blocked";

        link.note =
          `The external service returned HTTP ${linkResponse.status} while automated verification was attempted.`;
      }

      /*
       * Genuine HTTP failure.
       */

      else {
        link.status = "broken";

        link.error =
          `HTTP ${linkResponse.status}`;
      }

    } catch (error) {
      link.status = "unreachable";

      link.error =
        error.message ||
        "Request failed.";
    }
  }
}

/*
 * --------------------------------------------------------
 * PAGE ANALYSIS
 * --------------------------------------------------------
 */

async function analyzePage(
  html,
  pageUrl,
  response,
  responseTime
 ) {
  const titleMatches =
    extractTextBetween(
      html,
      "title"
    );

  const title =
    titleMatches[0] || "";

  const description =
    getMetaContent(
      html,
      "description"
    );

  const viewport =
    getMetaContent(
      html,
      "viewport"
    );

  const h1s =
    extractTextBetween(
      html,
      "h1"
    );

  const h2s =
    extractTextBetween(
      html,
      "h2"
    );

  const images =
    extractTags(
      html,
      "img"
    );

  const links =
    extractElements(
      html,
      "a"
    );

  const scripts =
    extractTags(
      html,
      "script"
    );

  const stylesheets =
    (
      html.match(
        /<link\b[^>]*rel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*>/gi
      ) || []
    );

  const canonicalMatch =
    html.match(
      /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i
    );

  const canonical =
    canonicalMatch
      ? getAttribute(
          canonicalMatch[0],
          "href"
        )
      : "";

  const languageMatch =
    html.match(
      /<html\b[^>]*lang\s*=\s*["']([^"']+)["']/i
    );

  const language =
    languageMatch
      ? languageMatch[1]
      : "";

  const structuredData =
    analyzeStructuredData(
      html
    );

  const hasStructuredData =
    structuredData.present &&
    structuredData.valid;

  const hasFavicon =
    /<link\b[^>]*rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(
      html
    );

  const hasOpenGraph =
    hasMeta(
      html,
      "og:title"
    ) ||
    hasMeta(
      html,
      "og:description"
    );

  const mixedContent =
    response.url?.startsWith(
      "https://"
    ) &&
    /(?:src|href)\s*=\s*["']http:\/\//i.test(
      html
    );

  let imagesWithoutAlt = 0;

  for (
    const image of images
  ) {
    if (
      !getAttribute(
        image,
        "alt"
      )
    ) {
      imagesWithoutAlt++;
    }
  }

  let emptyLinks = 0;

for (const link of links) {
  const href =
    getAttribute(
      link,
      "href"
    ) || "";

  const accessibleName =
    getAccessibleLinkName(
      link
    );

  const trimmedHref =
    href.trim();

  const isSpecialLink =
    /^tel:|^mailto:|^javascript:/i.test(
      trimmedHref
    );

  const isPlaceholder =
    trimmedHref === "#" ||
    trimmedHref === "";

  /*
   * JavaScript controls are not traditional
   * href navigation links.
   *
   * They should not be counted as empty
   * hyperlinks simply because href is missing.
   */
  const isJavaScriptControl =
    accessibleName.isJavaScriptControl;

  /*
   * Only count genuine navigational links
   * that have a destination and no accessible
   * name.
   *
   * Do NOT count:
   * - tel:
   * - mailto:
   * - javascript:
   * - # placeholders
   * - onclick navigation controls
   */
  if (
    trimmedHref &&
    !isSpecialLink &&
    !isPlaceholder &&
    !isJavaScriptControl &&
    !accessibleName.hasAccessibleName
  ) {
    emptyLinks++;
  }

  console.log(
    "LINK DEBUG:",
    {
      href: trimmedHref,
      ...accessibleName,
      html: link
    }
  );
}

  /*
   * ------------------------------------------------------
   * SEO
   * ------------------------------------------------------
   */

  const seoChecks = [];

  seoChecks.push(
    title
      ? finding(
          "Page title",
          `Title found: "${title.slice(
            0,
            100
          )}"`,
          "pass",
          20
        )
      : finding(
          "Missing page title",
          "Add a unique and descriptive title element.",
          "fail",
          20,
          "high"
        )
  );

  seoChecks.push(
    title.length >= 30 &&
    title.length <= 65
      ? finding(
          "Title length",
          "The title length is within a useful range.",
          "pass",
          10
        )
      : finding(
          "Title length",
          `Current title length: ${title.length} characters.`,
          "warning",
          10,
          "medium"
        )
  );

  seoChecks.push(
    description
      ? finding(
          "Meta description",
          "A meta description was found.",
          "pass",
          15
        )
      : finding(
          "Missing meta description",
          "Add a useful description of the page.",
          "fail",
          15,
          "high"
        )
  );

  seoChecks.push(
    h1s.length === 1
      ? finding(
          "Single H1",
          "Exactly one H1 heading was found.",
          "pass",
          15
        )
      : h1s.length === 0
      ? finding(
          "Missing H1",
          "Add one clear primary H1 heading.",
          "fail",
          15,
          "high"
        )
      : finding(
          "Multiple H1 headings",
          `${h1s.length} H1 headings were found.`,
          "warning",
          15,
          "medium"
        )
  );

  seoChecks.push(
    canonical
      ? finding(
          "Canonical URL",
          "A canonical URL was found.",
          "pass",
          10
        )
      : finding(
          "Missing canonical URL",
          "Consider adding a canonical URL.",
          "warning",
          10,
          "low"
        )
  );

  seoChecks.push(
    hasOpenGraph
      ? finding(
          "Social sharing metadata",
          "Open Graph metadata was found.",
          "pass",
          5
        )
      : finding(
          "Missing Open Graph metadata",
          "Add Open Graph metadata for social sharing.",
          "warning",
          5,
          "low"
        )
  );

  seoChecks.push(
    hasStructuredData
      ? finding(
          "Structured data",
          `JSON-LD structured data was found${
            structuredData.detectedTypes.length
              ? `: ${structuredData.detectedTypes.join(
                  ", "
                )}`
              : "."
          }`,
          "pass",
          15
        )
      : finding(
          "Structured data",
          structuredData.present
            ? "JSON-LD was detected, but no valid structured data could be confirmed."
            : "No JSON-LD structured data was detected.",
          "warning",
          15,
          "medium"
        )
  );

  seoChecks.push(
    h2s.length > 0
      ? finding(
          "Heading structure",
          `${h2s.length} H2 heading(s) detected.`,
          "pass",
          10
        )
      : finding(
          "Heading structure",
          "No H2 headings were detected.",
          "warning",
          10,
          "low"
        )
  );

  /*
   * ------------------------------------------------------
   * ACCESSIBILITY
   * ------------------------------------------------------
   */

  const accessibilityChecks = [];

  accessibilityChecks.push(
    language
      ? finding(
          "Document language",
          `HTML language is set to "${language}".`,
          "pass",
          20
        )
      : finding(
          "Missing document language",
          "Add a lang attribute to the HTML element.",
          "warning",
          20,
          "medium"
        )
  );

  accessibilityChecks.push(
    imagesWithoutAlt === 0
      ? finding(
          "Image alternative text",
          "All detected images have alt attributes.",
          "pass",
          35
        )
      : finding(
          "Images missing alt text",
          `${imagesWithoutAlt} image(s) do not have alt text.`,
          "fail",
          35,
          "high"
        )
  );

  accessibilityChecks.push(
    emptyLinks === 0
      ? finding(
          "Link accessibility",
          "No obvious empty links were detected.",
          "pass",
          25
        )
      : finding(
          "Empty links",
          `${emptyLinks} link(s) appear to have no accessible text.`,
          "warning",
          25,
          "medium"
        )
  );

  accessibilityChecks.push(
    viewport
      ? finding(
          "Responsive viewport",
          "A responsive viewport was detected.",
          "pass",
          20
        )
      : finding(
          "Missing viewport",
          "Add a responsive viewport meta tag.",
          "fail",
          20,
          "high"
        )
  );

  /*
   * ------------------------------------------------------
   * TECHNICAL
   * ------------------------------------------------------
   */

  const technicalChecks = [];

  let pageProtocol = "https:";

  try {
    pageProtocol =
      new URL(pageUrl).protocol;
  } catch {}

  technicalChecks.push(
    pageProtocol === "https:"
      ? finding(
          "HTTPS",
          "The page uses HTTPS.",
          "pass",
          25
        )
      : finding(
          "HTTPS",
          "The page is not using HTTPS.",
          "fail",
          25,
          "high"
        )
  );

  technicalChecks.push(
    response.ok
      ? finding(
          "HTTP response",
          `The page returned HTTP ${response.status}.`,
          "pass",
          20
        )
      : finding(
          "HTTP response",
          `The page returned HTTP ${response.status}.`,
          "fail",
          20,
          "high"
        )
  );

  technicalChecks.push(
    responseTime < 1000
      ? finding(
          "Server response time",
          `Initial response took ${responseTime}ms.`,
          "pass",
          25
        )
      : responseTime < 2000
      ? finding(
          "Server response time",
          `Initial response took ${responseTime}ms.`,
          "warning",
          25,
          "medium"
        )
      : finding(
          "Server response time",
          `Initial response took ${responseTime}ms.`,
          "fail",
          25,
          "high"
        )
  );

  technicalChecks.push(
    !mixedContent
      ? finding(
          "Mixed content",
          "No obvious HTTP resources were detected.",
          "pass",
          15
        )
      : finding(
          "Mixed content",
          "HTTP resources were detected on an HTTPS page.",
          "fail",
          15,
          "high"
        )
  );

  technicalChecks.push(
    hasFavicon
      ? finding(
          "Favicon",
          "A favicon was detected.",
          "pass",
          5
        )
      : finding(
          "Favicon",
          "No favicon was detected.",
          "warning",
          5,
          "low"
        )
  );

  /*
   * ------------------------------------------------------
   * MOBILE
   * ------------------------------------------------------
   */

  const mobileChecks = [];

  const hasResponsiveViewport =
    /<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*content\s*=\s*["'][^"']*width\s*=\s*device-width/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Responsive viewport",
    passed:
      hasResponsiveViewport,
    status:
      hasResponsiveViewport
        ? "pass"
        : "fail",
    weight: 20,
    severity:
      hasResponsiveViewport
        ? "info"
        : "high",
    description:
      hasResponsiveViewport
        ? "A responsive viewport was detected."
        : "No responsive viewport was detected."
  });

  const fixedWidthRisk =
    /\b(?:width|min-width)\s*:\s*(?:[4-9]\d{2}|\d{4,})px\b/gi.test(
      html
    );

  mobileChecks.push({
    title:
      "Fixed-width layout risk",
    passed:
      !fixedWidthRisk,
    status:
      fixedWidthRisk
        ? "warning"
        : "pass",
    weight: 15,
    severity:
      fixedWidthRisk
        ? "medium"
        : "info",
    description:
      fixedWidthRisk
        ? "Large fixed-width CSS values may cause horizontal scrolling."
        : "No obvious large fixed-width layout values were detected."
  });

  const hasResponsiveCss =
    /@media\s*(?:screen\s*)?\(/i.test(
      html
    ) ||
    /@container\s*[^{]*\{/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Responsive CSS",
    passed:
      hasResponsiveCss,
    status:
      hasResponsiveCss
        ? "pass"
        : "warning",
    weight: 10,
    severity:
      hasResponsiveCss
        ? "info"
        : "low",
    description:
      hasResponsiveCss
        ? "Responsive CSS rules were detected."
        : "No media queries or container queries were detected."
  });

  const hasFlexibleLayout =
    /\bdisplay\s*:\s*(?:flex|grid)\b/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Flexible layout",
    passed:
      hasFlexibleLayout,
    status:
      hasFlexibleLayout
        ? "pass"
        : "warning",
    weight: 10,
    severity:
      hasFlexibleLayout
        ? "info"
        : "low",
    description:
      hasFlexibleLayout
        ? "Flexbox or CSS Grid layout was detected."
        : "No obvious Flexbox or Grid layout was detected."
  });

  const hasResponsiveUnits =
    /\b(?:width|max-width|min-width|padding|margin)\s*:\s*[^;]*(?:%|vw|vh|vmin|vmax|rem|em)\b/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Responsive sizing",
    passed:
      hasResponsiveUnits,
    status:
      hasResponsiveUnits
        ? "pass"
        : "warning",
    weight: 10,
    severity:
      hasResponsiveUnits
        ? "info"
        : "low",
    description:
      hasResponsiveUnits
        ? "Responsive or scalable CSS units were detected."
        : "No obvious responsive CSS units were detected."
  });

  const hasTinyTextRisk =
    /font-size\s*:\s*(?:[0-9]|1[0-1])px\b/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Text size",
    passed:
      !hasTinyTextRisk,
    status:
      hasTinyTextRisk
        ? "warning"
        : "pass",
    weight: 10,
    severity:
      hasTinyTextRisk
        ? "medium"
        : "info",
    description:
      hasTinyTextRisk
        ? "Very small font-size values may reduce mobile readability."
        : "No obviously tiny font-size values were detected."
  });

  const smallTouchTargetRisk =
    /(?:button|\.btn|\.button)[^{]*\{[^}]*?(?:width|height)\s*:\s*(?:[0-2]?\d)px/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Touch target sizing",
    passed:
      !smallTouchTargetRisk,
    status:
      smallTouchTargetRisk
        ? "warning"
        : "pass",
    weight: 10,
    severity:
      smallTouchTargetRisk
        ? "medium"
        : "info",
    description:
      smallTouchTargetRisk
        ? "Some buttons may be too small for comfortable touch interaction."
        : "No obviously undersized button dimensions were detected."
  });

  const imagesAreResponsive =
    !/<img\b[^>]*style\s*=\s*["'][^"']*\bwidth\s*:\s*(?:[4-9]\d{2}|\d{4,})px/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Responsive images",
    passed:
      imagesAreResponsive,
    status:
      imagesAreResponsive
        ? "pass"
        : "warning",
    weight: 5,
    severity:
      imagesAreResponsive
        ? "info"
        : "medium",
    description:
      imagesAreResponsive
        ? "No obvious large fixed-width image styles were detected."
        : "One or more images may use large fixed widths."
  });

  const imagesHaveDimensions =
    images.length === 0 ||
    images.every(
      image =>
        /(?:width|height)\s*=\s*["']\d+["']/i.test(
          image
        )
    );

  mobileChecks.push({
    title:
      "Image layout stability",
    passed:
      imagesHaveDimensions,
    status:
      imagesHaveDimensions
        ? "pass"
        : "warning",
    weight: 5,
    severity:
      imagesHaveDimensions
        ? "info"
        : "low",
    description:
      imagesHaveDimensions
        ? "Detected images include dimensions that can help reduce layout shifts."
        : "Some images may lack explicit dimensions."
  });

  const formControlsAreResponsive =
    !/<(?:input|select|textarea|button)\b[^>]*style\s*=\s*["'][^"']*(?:width\s*:\s*)(?:[4-9]\d{2}|\d{4,})px/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Form control sizing",
    passed:
      formControlsAreResponsive,
    status:
      formControlsAreResponsive
        ? "pass"
        : "warning",
    weight: 5,
    severity:
      formControlsAreResponsive
        ? "info"
        : "medium",
    description:
      formControlsAreResponsive
        ? "No obvious oversized fixed-width form controls were detected."
        : "Some form controls may use large fixed widths."
  });

  const hasTables =
    /<table\b/i.test(
      html
    );

  const tablesHaveResponsiveWrapper =
    !hasTables ||
    /(?:overflow-x\s*:\s*auto|overflow-x\s*:\s*scroll|table-responsive)/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Responsive tables",
    passed:
      tablesHaveResponsiveWrapper,
    status:
      tablesHaveResponsiveWrapper
        ? "pass"
        : "warning",
    weight: 5,
    severity:
      tablesHaveResponsiveWrapper
        ? "info"
        : "medium",
    description:
      !hasTables
        ? "No tables were detected."
        : tablesHaveResponsiveWrapper
        ? "Tables appear to have a responsive overflow strategy."
        : "A table was detected without an obvious responsive overflow strategy."
  });

  const hasEmbeds =
    /<(?:iframe|embed|object)\b/i.test(
      html
    );

  const embedsAreResponsive =
    !hasEmbeds ||
    /(?:width\s*=\s*["']100%["']|width\s*:\s*100%|max-width\s*:\s*100%)/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Responsive embedded content",
    passed:
      embedsAreResponsive,
    status:
      embedsAreResponsive
        ? "pass"
        : "warning",
    weight: 5,
    severity:
      embedsAreResponsive
        ? "info"
        : "medium",
    description:
      !hasEmbeds
        ? "No embedded iframe or external object content was detected."
        : embedsAreResponsive
        ? "Embedded content appears to use responsive sizing."
        : "Embedded content may use fixed dimensions."
  });

  const hasNavigation =
    /<nav\b/i.test(
      html
    );

  const hasResponsiveNavigation =
    !hasNavigation ||
    /(?:@media|mobile|hamburger|menu-toggle|nav-toggle|menu-btn|mobile-menu)/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Mobile navigation",
    passed:
      hasResponsiveNavigation,
    status:
      hasResponsiveNavigation
        ? "pass"
        : "warning",
    weight: 5,
    severity:
      hasResponsiveNavigation
        ? "info"
        : "medium",
    description:
      !hasNavigation
        ? "No navigation element was detected."
        : hasResponsiveNavigation
        ? "Navigation appears to include responsive behavior."
        : "Navigation was detected without obvious mobile-specific behavior."
  });

  const hasForms =
    /<form\b/i.test(
      html
    );

  const hasUsefulInputTypes =
    !hasForms ||
    /<input\b[^>]*type\s*=\s*["'](?:email|tel|number|url|search)["']/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Mobile-friendly input types",
    passed:
      hasUsefulInputTypes,
    status:
      hasUsefulInputTypes
        ? "pass"
        : "warning",
    weight: 5,
    severity:
      hasUsefulInputTypes
        ? "info"
        : "low",
    description:
      !hasForms
        ? "No forms were detected."
        : hasUsefulInputTypes
        ? "Mobile-friendly input types were detected."
        : "Form inputs may not be optimized for mobile keyboards."
  });

  const restrictsZoom =
    /<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*content\s*=\s*["'][^"']*(?:user-scalable\s*=\s*no|max(?:imum)?-scale\s*=\s*1(?:\.0)?)[^"']*/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Viewport zoom accessibility",
    passed:
      !restrictsZoom,
    status:
      restrictsZoom
        ? "warning"
        : "pass",
    weight: 5,
    severity:
      restrictsZoom
        ? "medium"
        : "info",
    description:
      restrictsZoom
        ? "The viewport appears to restrict user zooming."
        : "No obvious restriction on user zooming was detected."
  });

  const hasResponsiveFontSizing =
    /font-size\s*:\s*[^;]*(?:rem|em|vw|clamp\s*\()/i.test(
      html
    );

  mobileChecks.push({
    title:
      "Responsive typography",
    passed:
      hasResponsiveFontSizing,
    status:
      hasResponsiveFontSizing
        ? "pass"
        : "warning",
    weight: 5,
    severity:
      hasResponsiveFontSizing
        ? "info"
        : "low",
    description:
      hasResponsiveFontSizing
        ? "Responsive font sizing was detected."
        : "No obvious responsive font sizing was detected."
  });

  const mobileHtmlScore =
    calculateWeightedScore(
      mobileChecks
    );

  /*
   * ------------------------------------------------------
   * LINK HEALTH
   * ------------------------------------------------------
   */

  const linkResults = [];

  for (const link of links) {
    const href =
      getAttribute(
        link,
        "href"
      );

    if (!href) {
      continue;
    }

    const trimmedHref =
      href.trim();

    if (
      trimmedHref.startsWith("#") ||
      trimmedHref.startsWith("mailto:") ||
      trimmedHref.startsWith("tel:") ||
      trimmedHref.startsWith("javascript:")
    ) {
      linkResults.push({
        href:
          trimmedHref,
        type:
          trimmedHref.startsWith("#")
            ? "anchor"
            : trimmedHref.startsWith(
                "mailto:"
              )
            ? "email"
            : trimmedHref.startsWith(
                "tel:"
              )
            ? "phone"
            : "javascript",
        status:
          trimmedHref === "#"
            ? "placeholder"
            : "not_tested"
      });

      continue;
    }

    const absoluteUrl =
      normalizeUrl(
        trimmedHref,
        pageUrl
      );

    if (!absoluteUrl) {
      linkResults.push({
        href:
          trimmedHref,
        type:
          "invalid",
        status:
          "invalid"
      });

      continue;
    }

    const sourceUrl =
      new URL(
        pageUrl
      );

    const destinationUrl =
      new URL(
        absoluteUrl
      );

    const type =
      sourceUrl.origin ===
      destinationUrl.origin
        ? "internal"
        : "external";

    linkResults.push({
      href:
        trimmedHref,
      url:
        absoluteUrl,
      type,
      status:
        "pending"
    });
  }

  /*
   * Anchor validation.
   */

  const pageIds =
    new Set();

  const idMatches =
    html.match(
      /\bid\s*=\s*["']([^"']+)["']/gi
    ) || [];

  for (
    const match of idMatches
  ) {
    const idMatch =
      match.match(
        /\bid\s*=\s*["']([^"']+)["']/i
      );

    if (idMatch) {
      pageIds.add(
        idMatch[1]
      );
    }
  }

  for (
    const link of linkResults
  ) {
    if (
      link.type !==
      "anchor"
    ) {
      continue;
    }

    const href =
      link.href || "";

    if (
      href === "#" ||
      href.trim() === ""
    ) {
      link.status =
        "placeholder";

      link.reason =
        "This link has no destination URL and may be used for a UI control or JavaScript action.";

      continue;
    }

    const targetId =
      href.startsWith("#")
        ? href.slice(1)
        : "";

    if (
      pageIds.has(
        targetId
      )
    ) {
      link.status =
        "working";

      link.reason =
        "Internal anchor target exists.";
    } else {
      link.status =
        "broken";

      link.reason =
        `No element with id="${targetId}" was found.`;
    }
  }

  /*
   * HTTP link testing.
   */

  const linksToTest =
    linkResults.filter(
      link =>
        link.status ===
        "pending"
    );

  for (
    const link of linksToTest.slice(
      0,
      MAX_LINKS_TO_TEST
    )
  ) {
    try {
      let linkResponse =
        await fetchWithTimeout(
          link.url,
          {
            method:
              "HEAD",
            redirect:
              "follow",
            headers: {
              "User-Agent":
                USER_AGENT
            }
          },
          8000
        );

      if (
        linkResponse.status ===
          403 ||
        linkResponse.status ===
          405 ||
        linkResponse.status ===
          501
      ) {
        linkResponse =
          await fetchWithTimeout(
            link.url,
            {
              method:
                "GET",
              redirect:
                "follow",
              headers: {
                "User-Agent":
                  USER_AGENT
              }
            },
            8000
          );

        link.testMethod =
          "GET";
      } else {
        link.testMethod =
          "HEAD";
      }

      link.statusCode =
        linkResponse.status;

      link.finalUrl =
        linkResponse.url ||
        link.url;

      link.redirected =
        Boolean(
          linkResponse.url &&
          linkResponse.url !==
            link.url
        );

      if (
        linkResponse.ok
      ) {
        link.status =
          "working";
      } else if (
        linkResponse.status ===
          403 ||
        linkResponse.status ===
          405 ||
        linkResponse.status ===
          429
      ) {
        link.status =
          "blocked";

        link.note =
          "The destination did not allow automated verification. This does not necessarily mean the link is broken.";
      } else if (
        link.type ===
          "external" &&
        (
          linkResponse.status ===
            400 ||
          linkResponse.status ===
            401 ||
          linkResponse.status ===
            406 ||
          linkResponse.status ===
            408 ||
          linkResponse.status >=
            500
        )
      ) {
        link.status =
          "blocked";

        link.note =
          `The external service returned HTTP ${linkResponse.status} while automated verification was attempted.`;
      } else {
        link.status =
          "broken";
      }
    } catch (error) {
      link.status =
        "unreachable";

      link.error =
        error.message ||
        "Request failed.";
    }
  }

  const linkHealth = {
    total:
      links.length,

    tested:
      linkResults.filter(
        link =>
          link.status ===
            "working" ||
          link.status ===
            "broken" ||
          link.status ===
            "unreachable" ||
          link.status ===
            "blocked"
      ).length,

    working:
      linkResults.filter(
        link =>
          link.status ===
          "working"
      ).length,

    broken:
      linkResults.filter(
        link =>
          link.status ===
            "broken" &&
          link.type !==
            "anchor"
      ).length,

    placeholder:
      linkResults.filter(
        link =>
          link.status ===
          "placeholder"
      ).length,

    blocked:
      linkResults.filter(
        link =>
          link.status ===
          "blocked"
      ).length,

    unreachable:
      linkResults.filter(
        link =>
          link.status ===
          "unreachable"
      ).length,

    redirected:
      linkResults.filter(
        link =>
          link.redirected
      ).length,

    internal:
      linkResults.filter(
        link =>
          link.type ===
          "internal"
      ).length,

    external:
      linkResults.filter(
        link =>
          link.type ===
          "external"
      ).length,

    anchors:
      linkResults.filter(
        link =>
          link.type ===
          "anchor"
      ).length
  };

  return {
    url:
      pageUrl,

    title,

    description,

    viewport,

    canonical,

    language,

    h1s,

    h2s,

    structuredData,

    images:
      images.length,

    imagesWithoutAlt,

    links:
      links.length,

    scripts:
      scripts.length,

    stylesheets:
      stylesheets.length,

    seoChecks,

    accessibilityChecks,

    technicalChecks,

    mobileChecks,

    mobileHtmlScore,

    linkHealth,

    linkResults,

    business:
      analyzeBusinessSignals(
        html,
        pageUrl
      ),

    pageSize:
      Buffer.byteLength(
        html,
        "utf8"
      )
  };
}

/*
 * --------------------------------------------------------
 * PAGESPEED
 * --------------------------------------------------------
 */

async function runPageSpeed(url) {
  const endpoint =
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

  const params =
    new URLSearchParams();

  params.set(
    "url",
    url
  );

  params.set(
    "strategy",
    "mobile"
  );

  if (
    process.env.PAGESPEED_API_KEY
  ) {
    params.set(
      "key",
      process.env.PAGESPEED_API_KEY
    );
  }

  params.append(
    "category",
    "performance"
  );

  params.append(
    "category",
    "accessibility"
  );

  params.append(
    "category",
    "best-practices"
  );

  params.append(
    "category",
    "seo"
  );

  try {
    const response =
      await fetchWithTimeout(
        `${endpoint}?${params.toString()}`,
        {
          headers: {
            "User-Agent":
              USER_AGENT,
            "Accept":
              "application/json"
          }
        },
        30000
      );

    const responseText =
      await response.text();

    if (!response.ok) {
      let googleMessage =
        "";

      try {
        const errorData =
          JSON.parse(
            responseText
          );

        googleMessage =
          errorData.error?.message ||
          "";
      } catch {}

      return {
        success:
          false,

        error:
          googleMessage
            ? `PageSpeed returned HTTP ${response.status}: ${googleMessage}`
            : `PageSpeed returned HTTP ${response.status}.`
      };
    }

    let data;

    try {
      data =
        JSON.parse(
          responseText
        );
    } catch {
      return {
        success:
          false,

        error:
          "PageSpeed returned an invalid response."
      };
    }

    const lighthouse =
      data.lighthouseResult;

    if (!lighthouse) {
      return {
        success:
          false,

        error:
          "PageSpeed returned no Lighthouse results."
      };
    }

    const categories =
      lighthouse.categories ||
      {};

    const audits =
      lighthouse.audits ||
      {};

    const performance =
      categories.performance?.score;

    const accessibility =
      categories.accessibility?.score;

    const bestPractices =
      categories[
        "best-practices"
      ]?.score;

    const seo =
      categories.seo?.score;

    if (
      typeof performance !==
      "number"
    ) {
      return {
        success:
          false,

        error:
          "PageSpeed returned no performance score."
      };
    }

    const mobileAudits = {
      viewport:
        audits[
          "viewport"
        ] || null,

      fontSizes:
        audits[
          "font-size"
        ] || null,

      tapTargets:
        audits[
          "tap-targets"
        ] || null,

      contentWidth:
        audits[
          "content-width"
        ] || null,

      overflow:
        audits[
          "viewport"
        ] || null,

      responsiveImages:
        audits[
          "uses-responsive-images"
        ] || null,

      imageAspectRatio:
        audits[
          "image-size-responsive"
        ] || null
    };

    return {
      success:
        true,

      scores: {
        performance:
          Math.round(
            performance * 100
          ),

        accessibility:
          typeof accessibility ===
          "number"
            ? Math.round(
                accessibility * 100
              )
            : null,

        bestPractices:
          typeof bestPractices ===
          "number"
            ? Math.round(
                bestPractices * 100
              )
            : null,

        seo:
          typeof seo ===
          "number"
            ? Math.round(
                seo * 100
              )
            : null
      },

      vitals: {
        lcp:
          audits[
            "largest-contentful-paint"
          ]?.displayValue ||
          "Not available",

        cls:
          audits[
            "cumulative-layout-shift"
          ]?.displayValue ||
          "Not available",

        inp:
          audits[
            "interaction-to-next-paint"
          ]?.displayValue ||
          audits[
            "experimental-interaction-to-next-paint"
          ]?.displayValue ||
          "Not available",

        fcp:
          audits[
            "first-contentful-paint"
          ]?.displayValue ||
          "Not available",

        tbt:
          audits[
            "total-blocking-time"
          ]?.displayValue ||
          "Not available"
      },

      mobileAudits
    };
  } catch (error) {
    console.error(
      "PageSpeed error:",
      error
    );

    return {
      success:
        false,

      error:
        error.name ===
        "AbortError"
          ? "PageSpeed request timed out."
          : `PageSpeed could not be reached: ${
              error.message ||
              "Unknown error"
            }`
    };
  }
}

/*
 * --------------------------------------------------------
 * BUSINESS WEBSITE AGGREGATION
 * --------------------------------------------------------
 */

function aggregateBusinessEvidence(
  analyzedPages
 ) {
  const evidence = {
    phone: [],
    email: [],
    whatsapp: [],
    form: [],
    location: [],
    cta: []
  };

  for (
    const page of analyzedPages
  ) {
    if (
      page.business.phone.found
    ) {
      evidence.phone.push({
        url:
          page.url,
        clickable:
          page.business.phone.clickable
      });
    }

    if (
      page.business.email.found
    ) {
      evidence.email.push({
        url:
          page.url,
        clickable:
          page.business.email.clickable
      });
    }

    if (
      page.business.whatsapp.found
    ) {
      evidence.whatsapp.push({
        url:
          page.url,
        clickable:
          page.business.whatsapp.clickable
      });
    }

    if (
      page.business.form.found
    ) {
      evidence.form.push({
        url:
          page.url,
        usable:
          page.business.form.usable,
        count:
          page.business.form.count
      });
    }

    if (
      page.business.location.found
    ) {
      evidence.location.push({
        url:
          page.url,
        addressElement:
          page.business.location.addressElement,
        mapLink:
          page.business.location.mapLink,
        mapEmbed:
          page.business.location.mapEmbed
      });
    }

    if (
      page.business.cta.found
    ) {
      evidence.cta.push({
        url:
          page.url
      });
    }
  }

  return evidence;
}

/*
 * --------------------------------------------------------
 * BUSINESS CHECKS
 * --------------------------------------------------------
 */

function buildBusinessChecks(
  evidence
) {
  const businessChecks = [];

  /*
   * PHONE
   */

  if (
    evidence.phone.length === 0
  ) {
    businessChecks.push(
      finding(
        "Phone number",
        "No obvious phone number was detected across the pages scanned.",
        "warning",
        20,
        "medium"
      )
    );
  } else if (
    evidence.phone.some(
      item =>
        item.clickable
    )
  ) {
    const source =
      evidence.phone.find(
        item =>
          item.clickable
      );

    businessChecks.push(
      finding(
        "Phone number",
        `A phone number with a clickable call link was detected on ${getPathname(
          source.url
        )}.`,
        "pass",
        20
      )
    );
  } else {
    businessChecks.push(
      finding(
        "Phone number",
        `A phone number was detected on ${getPathname(
          evidence.phone[0].url
        )}, but no clickable call link was found.`,
        "warning",
        20,
        "medium"
      )
    );
  }

  /*
   * EMAIL
   */

  if (
    evidence.email.length === 0
  ) {
    businessChecks.push(
      finding(
        "Email address",
        "No obvious email address was detected across the pages scanned.",
        "warning",
        15,
        "medium"
      )
    );
  } else if (
    evidence.email.some(
      item =>
        item.clickable
    )
  ) {
    const source =
      evidence.email.find(
        item =>
          item.clickable
      );

    businessChecks.push(
      finding(
        "Email address",
        `An email address with a mailto link was detected on ${getPathname(
          source.url
        )}.`,
        "pass",
        15
      )
    );
  } else {
    businessChecks.push(
      finding(
        "Email address",
        `An email address was detected on ${getPathname(
          evidence.email[0].url
        )}, but no mailto link was found.`,
        "warning",
        15,
        "medium"
      )
    );
  }

  /*
   * WHATSAPP
   */

  if (
    evidence.whatsapp.length === 0
  ) {
    businessChecks.push(
      finding(
        "WhatsApp",
        "No WhatsApp reference was detected across the pages scanned.",
        "warning",
        10,
        "low"
      )
    );
  } else if (
    evidence.whatsapp.some(
      item =>
        item.clickable
    )
  ) {
    const source =
      evidence.whatsapp.find(
        item =>
          item.clickable
      );

    businessChecks.push(
      finding(
        "WhatsApp",
        `A WhatsApp contact link was detected on ${getPathname(
          source.url
        )}.`,
        "pass",
        10
      )
    );
  } else {
    businessChecks.push(
      finding(
        "WhatsApp",
        `A WhatsApp reference was detected on ${getPathname(
          evidence.whatsapp[0].url
        )}, but no direct link was found.`,
        "warning",
        10,
        "low"
      )
    );
  }

  /*
   * LOCATION
   */

  if (
    evidence.location.length > 0
  ) {
    const source =
      evidence.location.find(
        item =>
          item.mapLink ||
          item.mapEmbed ||
          item.addressElement
      ) ||
      evidence.location[0];

    let locationDescription =
      `Business location information was detected on ${getPathname(
        source.url
      )}.`;

    if (
      source.mapLink ||
      source.mapEmbed
    ) {
      locationDescription +=
        " A map reference was also detected.";
    }

    businessChecks.push(
      finding(
        "Business location",
        locationDescription,
        "pass",
        15
      )
    );
  } else {
    businessChecks.push(
      finding(
        "Business location",
        "No strong business location or map evidence was detected across the pages scanned.",
        "warning",
        15,
        "medium"
      )
    );
  }

  /*
   * CONTACT FORM
   */

  if (
    evidence.form.length === 0
  ) {
    businessChecks.push(
      finding(
        "Contact form",
        "No contact or enquiry form was detected across the pages scanned.",
        "warning",
        20,
        "medium"
      )
    );
  } else {
    const usableForm =
      evidence.form.find(
        item =>
          item.usable
      );

    if (usableForm) {
      businessChecks.push(
        finding(
          "Contact form",
          `A usable contact/enquiry form was detected on ${getPathname(
            usableForm.url
          )}.`,
          "pass",
          20
        )
      );
    } else {
      businessChecks.push(
        finding(
          "Contact form",
          `A form was detected on ${getPathname(
            evidence.form[0].url
          )}, but no clearly usable submit mechanism was confirmed.`,
          "warning",
          20,
          "medium"
        )
      );
    }
  }

  /*
   * CTA
   */

  if (
    evidence.cta.length > 0
  ) {
    businessChecks.push(
      finding(
        "Call to action",
        `Conversion-focused wording was detected on ${getPathname(
          evidence.cta[0].url
        )}.`,
        "pass",
        20
      )
    );
  } else {
    businessChecks.push(
      finding(
        "Call to action",
        "No clear conversion-focused call to action was detected across the pages scanned.",
        "warning",
        20,
        "medium"
      )
    );
  }

  return businessChecks;
}

/*
 * --------------------------------------------------------
 * RECOMMENDATIONS
 * --------------------------------------------------------
 */

function buildRecommendation(check) {
  const recommendations = {
    "Missing page title": {
      why:
        "The page does not have a clear title for search engines and visitors.",
      action:
        "Add a unique, descriptive title that explains the page and business.",
      service:
        "SEO optimisation"
    },

    "Title length": {
      why:
        "Very short or very long titles may be less effective in search results.",
      action:
        "Create a concise title that clearly describes the page and its main service.",
      service:
        "SEO optimisation"
    },

    "Missing meta description": {
      why:
        "Search engines may have less useful information when generating search-result snippets.",
      action:
        "Add a unique description summarising the page, service and location where relevant.",
      service:
        "SEO optimisation"
    },

    "Missing H1": {
      why:
        "The page lacks a clear primary heading describing its main purpose.",
      action:
        "Add one prominent H1 that clearly describes the page.",
      service:
        "Content and SEO optimisation"
    },

    "Multiple H1 headings": {
      why:
        "Multiple primary headings can make the page structure less clear.",
      action:
        "Review the heading hierarchy and use one clear primary H1.",
      service:
        "SEO and content optimisation"
    },

    "Missing canonical URL": {
      why:
        "Search engines may have less guidance about the preferred version of the page.",
      action:
        "Add a canonical link pointing to the preferred page URL.",
      service:
        "Technical SEO"
    },

    "Missing Open Graph metadata": {
      why:
        "Social platforms may generate less useful previews when the page is shared.",
      action:
        "Add Open Graph title, description and image metadata.",
      service:
        "Social and SEO optimisation"
    },

    "Structured data": {
      why:
        "Structured data can help search engines understand important information about a page or business.",
      action:
        "Add appropriate JSON-LD structured data such as LocalBusiness or Organization markup.",
      service:
        "Technical SEO"
    },

    "Heading structure": {
      why:
        "Clear heading structure helps visitors and search engines understand the content hierarchy.",
      action:
        "Use logical H1, H2 and H3 headings throughout the page.",
      service:
        "Content optimisation"
    },

    "Images missing alt text": {
      why:
        "Images without useful alternative text can reduce accessibility.",
      action:
        "Add meaningful alt text to informative images and mark decorative images appropriately.",
      service:
        "Accessibility optimisation"
    },

    "Empty links": {
      why:
        "Links without an accessible name can be difficult for assistive technologies to understand.",
      action:
        "Give icon and image links a clear accessible name.",
      service:
        "Accessibility optimisation"
    },

    "Missing document language": {
      why:
        "Assistive technologies use the document language to interpret page content correctly.",
      action:
        "Add the appropriate lang attribute to the HTML element.",
      service:
        "Accessibility optimisation"
    },

    "Missing viewport": {
      why:
        "Without a responsive viewport configuration, mobile browsers may not display the page correctly.",
      action:
        "Add a responsive viewport meta tag.",
      service:
        "Mobile optimisation"
    },

    "HTTPS": {
      why:
        "HTTPS protects visitors and is an important baseline for a modern website.",
      action:
        "Configure the website to use HTTPS across all pages.",
      service:
        "Website security"
    },

    "Server response time": {
      why:
        "Slow server responses can delay the beginning of page loading.",
      action:
        "Review hosting, caching, server configuration and backend requests.",
      service:
        "Performance optimisation"
    },

    "Mixed content": {
      why:
        "HTTP resources on an HTTPS page can create security and browser warnings.",
      action:
        "Update insecure HTTP resources to HTTPS.",
      service:
        "Website security"
    },

    "Favicon": {
      why:
        "A favicon helps identify the website in browser tabs and bookmarks.",
      action:
        "Add a properly configured favicon.",
      service:
        "Website polish"
    },

    "Phone number": {
      why:
        "Customers benefit from an obvious way to contact the business.",
      action:
        "Add a clearly visible click-to-call phone number, preferably on the contact page and key conversion areas.",
      service:
        "Conversion optimisation"
    },

    "Email address": {
      why:
        "A visible email option provides another direct way for customers to contact the business.",
      action:
        "Add a clearly visible business email address and consider making it clickable.",
      service:
        "Conversion optimisation"
    },

    "WhatsApp": {
      why:
        "WhatsApp can provide a convenient direct contact channel for customers.",
      action:
        "Consider adding a clearly labelled WhatsApp contact option where appropriate.",
      service:
        "Conversion optimisation"
    },

    "Business location": {
      why:
        "Location information helps local customers understand where the business operates.",
      action:
        "Display the service area or business location clearly and consider appropriate local structured data.",
      service:
        "Local SEO"
    },

    "Contact form": {
      why:
        "An easy enquiry method can reduce friction for potential customers.",
      action:
        "Add a simple contact, quote-request or booking form on an appropriate contact/conversion page.",
      service:
        "Conversion optimisation"
    },

    "Call to action": {
      why:
        "Visitors need a clear next step if the website is expected to generate enquiries.",
      action:
        "Add clear calls to action such as Request a Quote, Book Now or Contact Us.",
      service:
        "Conversion optimisation"
    },

    "Fixed-width layout risk": {
      why:
        "Fixed-width elements can force content beyond the screen on smaller devices.",
      action:
        "Replace rigid widths with responsive sizing such as max-width, percentages and flexible layouts.",
      service:
        "Mobile optimisation"
    },

    "Image layout stability": {
      why:
        "Images without reserved dimensions can shift page content while loading.",
      action:
        "Set appropriate width and height attributes or use CSS aspect-ratio.",
      service:
        "Performance optimisation"
    },

    "Text size": {
  why:
    "Very small text can make content harder to read, especially on mobile devices.",
  action:
    "Review small font sizes and use readable responsive typography that remains comfortable across screen sizes.",
  service:
    "Mobile optimisation"
},

"Touch target sizing": {
  why:
    "Small buttons and controls can be difficult to tap accurately on phones and other touch devices.",
  action:
    "Increase the size and spacing of interactive controls so they are easier to use on touch screens.",
  service:
    "Mobile optimisation"
},

"Responsive typography": {
  why:
    "Fixed or non-responsive font sizing can make text less comfortable to read across different screen sizes.",
  action:
    "Use responsive typography with scalable units such as rem, em, or clamp() where appropriate.",
  service:
    "Mobile optimisation"
},

"Responsive CSS": {
  why:
    "Without responsive CSS rules, layouts may not adapt well to different screen sizes.",
  action:
    "Add appropriate media queries or container queries to adapt the layout for smaller screens.",
  service:
    "Mobile optimisation"
},

"Flexible layout": {
  why:
    "Rigid layouts can make content harder to use on smaller screens.",
  action:
    "Use flexible layout techniques such as Flexbox or CSS Grid where appropriate.",
  service:
    "Mobile optimisation"
},

"Responsive sizing": {
  why:
    "Fixed sizing can cause content to become cramped or overflow on smaller screens.",
  action:
    "Use flexible units such as percentages, rem, em, vw, or max-width where appropriate.",
  service:
    "Mobile optimisation"
},

"Responsive images": {
  why:
    "Images that do not adapt to available space can contribute to horizontal scrolling or poor mobile presentation.",
  action:
    "Make images fluid and prevent them from exceeding their available container width.",
  service:
    "Mobile optimisation"
},

"Form control sizing": {
  why:
    "Oversized fixed-width form controls can force users to scroll horizontally on smaller screens.",
  action:
    "Use responsive widths for inputs, selects, textareas and buttons.",
  service:
    "Mobile optimisation"
},

"Responsive tables": {
  why:
    "Wide tables can overflow the screen and make information difficult to use on mobile devices.",
  action:
    "Place wide tables inside a responsive scrolling container or use an alternative mobile-friendly layout.",
  service:
    "Mobile optimisation"
},

"Responsive embedded content": {
  why:
    "Fixed-size embedded content can extend beyond the available screen width.",
  action:
    "Make maps, videos, iframes and other embedded content responsive.",
  service:
    "Mobile optimisation"
},

"Mobile navigation": {
  why:
    "Navigation that does not adapt to smaller screens can make important pages difficult to reach.",
  action:
    "Provide a responsive mobile navigation pattern that remains easy to use on smaller screens.",
  service:
    "Mobile optimisation"
},

"Mobile-friendly input types": {
  why:
    "Using appropriate input types can make forms easier to complete on mobile devices.",
  action:
    "Use suitable input types such as email, tel, number, URL and search where appropriate.",
  service:
    "Mobile optimisation"
},

"Viewport zoom accessibility": {
  why:
    "Restricting browser zoom can make content harder to read and reduce accessibility for users who need magnification.",
  action:
    "Avoid unnecessarily restricting user zooming in the viewport configuration.",
  service:
    "Accessibility optimisation"
},
  };

  const recommendation =
    recommendations[
      check.title
    ];

  if (!recommendation) {
    return null;
  }

  return {
    title:
      check.title,

    severity:
      check.severity,

    status:
      check.status,

    why:
      recommendation.why,

    action:
      recommendation.action,

    service:
      recommendation.service
  };
}

/*
 * --------------------------------------------------------
 * MAIN HANDLER
 * --------------------------------------------------------
 */

module.exports =
  async function handler(
    req,
    res
  ) {
    if (
      req.method !==
      "POST"
    ) {
      return res.status(
        405
      ).json({
        success:
          false,
        error:
          "Method not allowed."
      });
    }

    try {
      const {
        url
      } =
        req.body || {};

      if (
        !url ||
        typeof url !==
          "string"
      ) {
        return res.status(
          400
        ).json({
          success:
            false,
          error:
            "Please provide a website URL."
        });
      }

      let targetUrl;

      try {
        targetUrl =
          new URL(
            url.startsWith(
              "http://"
            ) ||
            url.startsWith(
              "https://"
            )
              ? url
              : `https://${url}`
          );
      } catch {
        return res.status(
          400
        ).json({
          success:
            false,
          error:
            "That does not appear to be a valid website URL."
        });
      }

      if (
        ![
          "http:",
          "https:"
        ].includes(
          targetUrl.protocol
        )
      ) {
        return res.status(
          400
        ).json({
          success:
            false,
          error:
            "Only HTTP and HTTPS websites can be scanned."
        });
      }

      if (
        isBlockedHostname(
          targetUrl.hostname
        )
      ) {
        return res.status(
          400
        ).json({
          success:
            false,
          error:
            "That website address cannot be scanned."
        });
      }

      const started =
        Date.now();

      /*
       * --------------------------------------------------
       * FETCH HOMEPAGE
       * --------------------------------------------------
       */

      const response =
        await fetchWithTimeout(
          targetUrl.href,
          {
            redirect:
              "follow",

            headers: {
              "User-Agent":
                USER_AGENT,

              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
          }
        );

      const responseTime =
        Date.now() -
        started;

      const html =
        await response.text();

      if (!html) {
        return res.status(
          422
        ).json({
          success:
            false,
          error:
            "The website returned an empty response."
        });
      }

      const finalUrl =
        response.url ||
        targetUrl.href;

      /*
       * Prevent redirected requests to
       * local/internal hosts.
       */

      try {
        const finalHostname =
          new URL(
            finalUrl
          ).hostname;

        if (
          isBlockedHostname(
            finalHostname
          )
        ) {
          return res.status(
            400
          ).json({
            success:
              false,
            error:
              "The website redirected to an address that cannot be scanned."
          });
        }
      } catch {}

      /*
       * --------------------------------------------------
       * ANALYSE HOMEPAGE
       * --------------------------------------------------
       */

      const homepage =
        await analyzePage(
          html,
          finalUrl,
          response,
          responseTime
        );

        await testLinks(
          homepage.linkResults
        );

      /*
       * --------------------------------------------------
       * DISCOVER INTERNAL PAGES
       * --------------------------------------------------
       */

      const candidates =
        discoverInternalPages(
          html,
          finalUrl
        );

        console.log(
          "CRAWL DEBUG — finalUrl:",
          finalUrl
        );

        const pages =
        [
          {
            url:
              finalUrl,
      
            path:
              getPathname(
                finalUrl
              ),
      
            type:
              "homepage",
      
            score:
              Infinity,
      
            scanned:
              true,
      
            ...homepage
          }
        ];

      const scannedUrls =
        new Set([
          normalizeUrl(
            finalUrl
          )
        ]);

      /*
       * --------------------------------------------------
       * CRAWL RELEVANT PAGES
       * --------------------------------------------------
       */

      for (
        const candidate of candidates
      ) {
        if (
          pages.length >=
          MAX_CRAWL_PAGES + 1
        ) {
          break;
        }

        const normalized =
          normalizeUrl(
            candidate.url
          );

        if (!normalized) {
          continue;
        }

        if (
          scannedUrls.has(
            normalized
          )
        ) {
          continue;
        }

        if (
          !isSameOrigin(
            normalized,
            finalUrl
          )
        ) {
          continue;
        }

        /*
         * Only crawl useful candidates.
         *
         * This keeps the scanner from wandering through
         * an entire website.
         */

        console.log(
          "CRAWL DEBUG — evaluating candidate:",
          candidate
        );
        
        
        if (
          candidate.score < 0
        ) {
          console.log(
            "CRAWL DEBUG — SKIPPED: low-priority page:",
            candidate
          );
          continue;
        }

        
        scannedUrls.add(
          normalized
        );
        
        try {
          const pageStarted =
            Date.now();
        
          console.log(
            "CRAWL DEBUG — FETCHING candidate:",
            normalized
          );
        
          const pageResponse =
            await fetchWithTimeout(
              normalized,
              {
                redirect:
                  "follow",
        
                headers: {
                  "User-Agent":
                    USER_AGENT,
        
                  Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
              },
              12000
            );
        
          console.log(
            "CRAWL DEBUG — response:",
            normalized,
            pageResponse.status,
            pageResponse.ok,
            pageResponse.headers.get("content-type")
          );
        
          const pageResponseTime =
            Date.now() -
            pageStarted;

          /*
           * We only analyse successful HTML pages.
           */

          if (
            !pageResponse.ok
          ) {
            continue;
          }

          const contentType =
            pageResponse.headers.get(
              "content-type"
            ) || "";

          if (
            contentType &&
            !contentType.includes(
              "text/html"
            ) &&
            !contentType.includes(
              "application/xhtml+xml"
            )
          ) {
            continue;
          }

          const pageHtml =
            await pageResponse.text();

          if (
            !pageHtml
          ) {
            continue;
          }

          const pageFinalUrl =
            pageResponse.url ||
            normalized;

          if (
            !isSameOrigin(
              pageFinalUrl,
              finalUrl
            )
          ) {
            continue;
          }

          const page =
            await analyzePage(
              pageHtml,
              pageFinalUrl,
              pageResponse,
              pageResponseTime
            );

          pages.push({
            url:
              pageFinalUrl,

            path:
              getPathname(
                pageFinalUrl
              ),

            type:
              candidate.score >=
              85
                ? "priority"
                : "internal",

            score:
              candidate.score,

            anchorText:
              candidate.anchorText,

            scanned:
              true,

            ...page
          });

          console.log(
            "CRAWL DEBUG — PAGE SCANNED SUCCESSFULLY:",
            pageFinalUrl,
            "pages.length:",
            pages.length
          );

          /*
           * Small delay keeps the crawler polite.
           */

          await sleep(100);
        } catch (error) {
          pages.push({
            url:
              normalized,

            path:
              getPathname(
                normalized
              ),

            type:
              "internal",

            score:
              candidate.score,

            scanned:
              false,

            error:
              error.message ||
              "Page could not be scanned."
          });
        }
      }

      /*
       * --------------------------------------------------
       * WEBSITE BUSINESS EVIDENCE
       * --------------------------------------------------
       */

      function drawBusinessEvidence(
        doc,
        businessEvidence
      ) {
      
        businessEvidence =
          businessEvidence || {};
      
      
        sectionTitle(
          doc,
          "Business Evidence",
          "Business contact and conversion signals detected across the website."
        );
      
      
        const categories = [
          {
            title: "Phone number",
            key: "phone",
            empty:
              "No phone number was detected."
          },
      
          {
            title: "Email address",
            key: "email",
            empty:
              "No email address was detected."
          },
      
          {
            title: "WhatsApp",
            key: "whatsapp",
            empty:
              "No WhatsApp contact link was detected."
          },
      
          {
            title: "Contact form",
            key: "form",
            empty:
              "No usable contact form was detected."
          },
      
          {
            title: "Business location",
            key: "location",
            empty:
              "No business location evidence was detected."
          },
      
          {
            title: "Call to action",
            key: "cta",
            empty:
              "No obvious call-to-action evidence was detected."
          }
        ];
      
      
        categories.forEach(
          category => {
      
            const entries =
              Array.isArray(
                businessEvidence[
                  category.key
                ]
              )
                ? businessEvidence[
                    category.key
                  ]
                : [];
      
      
            ensureSpace(
              doc,
              65
            );
      
      
            drawSubheading(
              doc,
              category.title
            );
      
      
            if (!entries.length) {
      
              drawEvidenceMessage(
                doc,
                category.empty,
                false
              );
      
              doc.moveDown(0.7);
      
              return;
      
            }
      
      
            entries.forEach(
              entry => {
      
                const evidence =
                  formatBusinessEvidence(
                    category.key,
                    entry
                  );
      
      
                const height =
                  getEvidenceHeight(
                    doc,
                    evidence
                  );
      
      
                ensureSpace(
                  doc,
                  height + 8
                );
      
      
                drawEvidenceCard(
                  doc,
                  evidence
                );
      
              }
            );
      
      
            doc.moveDown(0.7);
      
          }
        );
      
      }

      /*
 * ============================================================
 * BUSINESS EVIDENCE HELPERS
 * ============================================================
 */

function formatBusinessEvidence(
  key,
  entry
 ) {

  entry =
    entry || {};


  const url =
    entry.url ||
    "Unknown page";


  let details = [];


  if (
    key === "phone"
  ) {

    details.push(
      entry.clickable
        ? "Clickable phone link detected."
        : "Phone number detected."
    );

  }


  if (
    key === "email"
  ) {

    details.push(
      entry.clickable
        ? "Clickable email link detected."
        : "Email address detected."
    );

  }


  if (
    key === "whatsapp"
  ) {

    details.push(
      entry.clickable
        ? "Clickable WhatsApp link detected."
        : "WhatsApp reference detected."
    );

  }


  if (
    key === "form"
  ) {

    details.push(
      entry.usable
        ? "Usable contact form detected."
        : "Contact form detected."
    );


    if (
      Number.isFinite(
        Number(entry.count)
      )
    ) {

      details.push(
        `Forms detected: ${entry.count}`
      );

    }

  }


  if (
    key === "location"
  ) {

    if (
      entry.addressElement
    ) {

      details.push(
        "Address information detected."
      );

    }


    if (
      entry.mapLink
    ) {

      details.push(
        "Map link detected."
      );

    }


    if (
      entry.mapEmbed
    ) {

      details.push(
        "Embedded map detected."
      );

    }


    if (!details.length) {

      details.push(
        "Location evidence detected."
      );

    }

  }


  if (
    key === "cta"
  ) {

    details.push(
      "Conversion-focused call-to-action detected."
    );

  }


  return {
    url,
    details:
      details.join(" ")
  };

}


function getEvidenceHeight(
  doc,
  evidence
) {

  const details =
    evidence.details ||
    "";


  const detailsHeight =
    doc.heightOfString(
      details,
      {
        width: 450,
        font: "Helvetica",
        fontSize: 9.5,
        lineGap: 2
      }
    );


  const urlHeight =
    doc.heightOfString(
      evidence.url,
      {
        width: 450,
        font: "Helvetica",
        fontSize: 8.5
      }
    );


  return Math.max(
    55,
    28 +
      detailsHeight +
      urlHeight +
      12
  );

}


function drawEvidenceCard(
  doc,
  evidence
) {

  const startY =
    doc.y;


  const height =
    getEvidenceHeight(
      doc,
      evidence
    );


  doc
    .roundedRect(
      PAGE.left,
      startY,
      PAGE.width,
      height,
      7
    )
    .fillColor(BRAND.lighter)
    .fill();


  doc
    .roundedRect(
      PAGE.left,
      startY,
      PAGE.width,
      height,
      7
    )
    .lineWidth(1)
    .strokeColor(BRAND.border)
    .stroke();


  doc
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(
      evidence.details ||
        "Business evidence detected.",
      PAGE.left + 14,
      startY + 12,
      {
        width: PAGE.width - 28
      }
    );


  doc
    .fillColor(BRAND.muted)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      `Found on: ${evidence.url}`,
      PAGE.left + 14,
      startY + 31,
      {
        width: PAGE.width - 28,
        link: evidence.url
      }
    );


  doc.y =
    startY + height;

}


function drawEvidenceMessage(
  doc,
  message,
  positive
) {

  const startY =
    doc.y;


  const height =
    42;


  doc
    .roundedRect(
      PAGE.left,
      startY,
      PAGE.width,
      height,
      7
    )
    .fillColor(
      positive
        ? BRAND.greenLight
        : BRAND.lighter
    )
    .fill();


  doc
    .roundedRect(
      PAGE.left,
      startY,
      PAGE.width,
      height,
      7
    )
    .lineWidth(1)
    .strokeColor(BRAND.border)
    .stroke();


  doc
    .fillColor(
      positive
        ? BRAND.green
        : BRAND.muted
    )
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      message,
      PAGE.left + 14,
      startY + 14,
      {
        width: PAGE.width - 28
      }
    );


  doc.y =
    startY + height;

}

      const analyzedPages =
        pages.filter(
          page =>
            page.scanned &&
            page.business
        );

      const businessEvidence =
        aggregateBusinessEvidence(
          analyzedPages
        );

      const businessChecks =
        buildBusinessChecks(
          businessEvidence
        );

      /*
       * --------------------------------------------------
       * PAGE-LEVEL SCORES
       * --------------------------------------------------
       */

      const homepageSeoScore =
        calculateWeightedScore(
          homepage.seoChecks
        );

      const homepageAccessibilityScore =
        calculateWeightedScore(
          homepage.accessibilityChecks
        );

      const homepageTechnicalScore =
        calculateWeightedScore(
          homepage.technicalChecks
        );

      /*
       * --------------------------------------------------
       * PAGESPEED
       * --------------------------------------------------
       */

      const pageSpeed =
        await runPageSpeed(
          finalUrl
        );

      const seoScore =
        pageSpeed.success
          ? Math.round(
              homepageSeoScore *
                0.4 +
                pageSpeed.scores
                  .seo *
                0.6
            )
          : homepageSeoScore;

      const accessibilityScore =
        pageSpeed.success
          ? Math.round(
              homepageAccessibilityScore *
                0.4 +
                pageSpeed.scores
                  .accessibility *
                0.6
            )
          : homepageAccessibilityScore;

      const performanceScore =
        pageSpeed.success
          ? pageSpeed.scores
              .performance
          : null;

      /*
       * --------------------------------------------------
       * MOBILE
       * --------------------------------------------------
       */

      const mobileScore =
        homepage.mobileHtmlScore;

      /*
       * --------------------------------------------------
       * TECHNICAL SCORE
       * --------------------------------------------------
       */

      const technicalScore =
        homepageTechnicalScore;

      /*
       * --------------------------------------------------
       * BUSINESS SCORE
       * --------------------------------------------------
       */

      const businessScore =
        calculateWeightedScore(
          businessChecks
        );

      /*
       * --------------------------------------------------
       * OVERALL
       * --------------------------------------------------
       */

      let overall;

      if (
        performanceScore !==
        null
      ) {
        overall =
          Math.round(
            seoScore *
              0.25 +
              performanceScore *
              0.20 +
              accessibilityScore *
              0.10 +
              technicalScore *
              0.15 +
              businessScore *
              0.30
          );
      } else {
        overall =
          Math.round(
            seoScore *
              0.30 +
              accessibilityScore *
              0.10 +
              technicalScore *
              0.20 +
              businessScore *
              0.40
          );
      }

      /*
       * --------------------------------------------------
       * PRIORITY ISSUES
       * --------------------------------------------------
       *
       * IMPORTANT:
       *
       * We use homepage SEO/accessibility/technical
       * issues, but website-wide business checks.
       *
       * We do NOT blindly dump every warning from
       * every crawled page into the top-level report.
       *
       * This prevents the report from becoming enormous.
       */

      const topLevelChecks = [
        ...homepage.seoChecks,
        ...homepage.accessibilityChecks,
        ...homepage.mobileChecks,
        ...homepage.technicalChecks,
        ...businessChecks
      ];

      const issues =
        topLevelChecks
          .filter(
            check =>
              check.status ===
                "fail" ||
              check.status ===
                "warning"
          )
          .sort(
            (a, b) => {
              const priority = {
                high: 3,
                medium: 2,
                low: 1,
                info: 0
              };

              return (
                (
                  priority[
                    b.severity
                  ] || 0
                ) -
                (
                  priority[
                    a.severity
                  ] || 0
                )
              );
            }
          )
          .slice(
            0,
            12
          );

      const recommendations =
        issues
          .map(
            issue =>
              buildRecommendation(
                issue
              )
          )
          .filter(
            Boolean
          );

      /*
       * --------------------------------------------------
       * PAGE SUMMARY
       * --------------------------------------------------
       */

      const pageSummary =
        pages.map(
          page => ({
            url:
              page.url,

            path:
              page.path,

            type:
              page.type,

            score:
              page.score,

            scanned:
              page.scanned,

            title:
              page.title ||
              null,

            h1Count:
              page.h1s
                ? page.h1s.length
                : null,

            business:
              page.business
                ? {
                    phone:
                      page.business
                        .phone
                        .found,

                    email:
                      page.business
                        .email
                        .found,

                    whatsapp:
                      page.business
                        .whatsapp
                        .found,

                    form:
                      page.business
                        .form
                        .usable,

                    location:
                      page.business
                        .location
                        .found,

                    cta:
                      page.business
                        .cta
                        .found
                  }
                : null
          })
        );

      /*
       * --------------------------------------------------
       * RESPONSE
       * --------------------------------------------------
       */

      return res.status(
        200
      ).json({
        success:
          true,

        scannerVersion:
          "3.0",

        scannedAt:
          new Date().toISOString(),

        url:
          targetUrl.href,

        finalUrl,

        responseTime,

        statusCode:
          response.status,

        /*
         * CRAWL INFORMATION
         */

        crawl: {
          enabled:
            true,

          maxAdditionalPages:
            MAX_CRAWL_PAGES,

          pagesScanned:
            analyzedPages.length,

          totalPagesDiscovered:
            candidates.length,

          pages: pageSummary
        },

        /*
         * WEBSITE-WIDE BUSINESS EVIDENCE
         */

        businessEvidence,

        /*
         * LINK HEALTH
         *
         * Homepage links remain available in the
         * existing format for compatibility.
         */

        linkHealth:
          homepage.linkHealth,

        linkResults:
          homepage.linkResults,

        pageSize:
          Buffer.byteLength(
            html,
            "utf8"
          ),

        counts: {
          images:
            homepage.images,

          imagesWithoutAlt:
            homepage.imagesWithoutAlt,

          links:
            homepage.links,

          scripts:
            homepage.scripts,

          stylesheets:
            homepage.stylesheets,

          h1:
            homepage.h1s.length,

          h2:
            homepage.h2s.length
        },

        /*
         * SCORES
         */

        scores: {
          overall,

          seo:
            seoScore,

          performance:
            performanceScore,

          mobile:
            mobileScore,

          accessibility:
            accessibilityScore,

          technical:
            technicalScore,

          business:
            businessScore
        },

        /*
         * PAGESPEED
         */

        pageSpeed: {
          available:
            pageSpeed.success,

          error:
            pageSpeed.error ||
            null,

          scores:
            pageSpeed.success
              ? pageSpeed.scores
              : null,

          vitals:
            pageSpeed.success
              ? pageSpeed.vitals
              : null
        },

        /*
         * CHECKS
         *
         * Preserve existing structure.
         */

        checks: {
          seo:
            homepage.seoChecks,

          accessibility:
            homepage.accessibilityChecks,

          technical:
            homepage.technicalChecks,

          business:
            businessChecks,

          mobile:
            homepage.mobileChecks
        },

        /*
         * PAGE DETAILS
         *
         * New V3 data.
         */

        pages:
          analyzedPages.map(
            page => ({
              url:
                page.url,

              path:
                getPathname(
                  page.url
                ),

              title:
                page.title,

              description:
                page.description,

              canonical:
                page.canonical,

              h1s:
                page.h1s,

              h2s:
                page.h2s,

              business:
                page.business,

              scores: {
                seo:
                  calculateWeightedScore(
                    page.seoChecks
                  ),

                accessibility:
                  calculateWeightedScore(
                    page.accessibilityChecks
                  ),

                technical:
                  calculateWeightedScore(
                    page.technicalChecks
                  ),

                mobile:
                  page.mobileHtmlScore
              }
            })
          ),

        issues,

        recommendations,

        /*
         * HOMEPAGE METADATA
         *
         * Existing PDF/frontend compatibility.
         */

        metadata: {
          title:
            homepage.title,

          description:
            homepage.description,

          viewport:
            homepage.viewport,

          canonical:
            homepage.canonical,

          language:
            homepage.language,

          h1s:
            homepage.h1s,

          h2s:
            homepage.h2s,

          structuredData:
            homepage.structuredData
        }
      });
    } catch (error) {
      console.error(
        "Scanner V3 error:",
        error
      );

      return res.status(
        500
      ).json({
        success:
          false,

        error:
          error.name ===
          "AbortError"
            ? "The website took too long to respond."
            : "We could not scan this website. It may be unavailable or blocking automated requests."
      });
    }
  };