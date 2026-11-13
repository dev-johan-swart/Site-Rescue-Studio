const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "invalid", "localhost", "test"
]);
const AUTOMATED_EMAIL_LOCAL_PARTS = /^(?:no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|unsubscribe)(?:[+._-].*)?$/i;
const PLACEHOLDER_EMAIL_LOCAL_PARTS = /^(?:name|yourname|your-email|email|test|example|user)(?:[+._-].*)?$/i;
const BUSINESS_NAME_PLACEHOLDERS = /^(?:home|homepage|welcome|welcome to our website|official website|contact us|about us|our services|services|website|domain for sale|this domain is for sale|buy this domain|parked domain|linktree|hugedomains|go88)$/i;

function websiteHostname(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanBusinessName(value) {
  const name = String(value || "").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  if (!name || name.length > 160 || BUSINESS_NAME_PLACEHOLDERS.test(name)) return null;
  if (/^(?:https?:\/\/|www\.)/i.test(name) || /\b(?:domain for sale|buy this domain|parked domain)\b/i.test(name)) return null;
  if (/^(?:head office|registered office|office address|main office|address)\s*[:\-]/i.test(name)) return null;
  const addressTerms = /\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|boulevard|blvd\.?|lane|ln\.?|crescent|close|parkway|suite|unit|po box|postal code)\b/i.test(name);
  if (/^\d{1,5}\s+\S+/.test(name) || (addressTerms && /\b\d{1,5}\b/.test(name))) return null;
  if (/^[^\s@]+@[^\s@]+$/.test(name)) return null;
  return name;
}

function emailCandidate(item) {
  const value = String(typeof item === "string" ? item : item?.value || "").trim();
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!match) return null;
  const address = match[0].toLowerCase();
  const [localPart, domain] = address.split("@");
  const domainParts = domain.split(".");
  if (!localPart || !domain || domainParts.length < 2) return null;
  if (PLACEHOLDER_EMAIL_DOMAINS.has(domain) || /\.(?:invalid|test|localhost|local)$/i.test(domain)) return null;
  if (AUTOMATED_EMAIL_LOCAL_PARTS.test(localPart) || PLACEHOLDER_EMAIL_LOCAL_PARTS.test(localPart)) return null;
  return { ...(typeof item === "object" && item ? item : {}), value: match[0], normalized: address, domain };
}

function isEmailPublishedOnWebsite(item, website) {
  const candidate = emailCandidate(item);
  const host = websiteHostname(website);
  if (!candidate || !host) return false;
  const sourceUrl = String(item?.url || "");
  const sourceHost = websiteHostname(sourceUrl);
  return Boolean(sourceHost && (sourceHost === host || sourceHost.endsWith("." + host)));
}

function emailMatchesWebsite(item, website) {
  const candidate = emailCandidate(item);
  const host = websiteHostname(website);
  return Boolean(candidate && host && (candidate.domain === host || candidate.domain.endsWith("." + host)));
}

function selectPrimaryEmail(items, website) {
  const candidates = (Array.isArray(items) ? items : []).map(emailCandidate).filter(Boolean);
  const unique = new Map();
  for (const candidate of candidates) {
    if (!unique.has(candidate.normalized)) unique.set(candidate.normalized, candidate);
  }
  return [...unique.values()].sort((a, b) => {
    const score = item => {
      let value = emailMatchesWebsite(item, website) ? 100 : 0;
      const source = String(item.source || "").toLowerCase();
      if (source === "mailto") value += 30;
      else if (source === "json-ld") value += 25;
      else if (source === "data-email") value += 20;
      else if (source === "visible-text") value += 10;
      if (String(item.confidence).toLowerCase() === "high") value += 5;
      if (/^(?:info|hello|contact|sales|support|office|admin)\b/i.test(item.value.split("@")[0])) value += 2;
      return value;
    };
    return score(b) - score(a);
  })[0] || null;
}

function phoneCandidate(item) {
  const value = String(typeof item === "string" ? item : item?.value || "").trim();
  const match = value.match(/(?:\+27|0)\s?(?:\(?\d{2}\)?)[\s-]?\d{3}[\s-]?\d{4}/);
  if (!match) return null;
  const normalized = match[0].replace(/[^\d+]/g, "");
  if (/^(?:\+270{9}|0{10})$/.test(normalized)) return null;
  return { ...(typeof item === "object" && item ? item : {}), value: match[0].trim(), normalized };
}

function selectPrimaryPhone(items) {
  const candidates = (Array.isArray(items) ? items : []).map(phoneCandidate).filter(Boolean);
  const unique = new Map();
  for (const candidate of candidates) if (!unique.has(candidate.normalized)) unique.set(candidate.normalized, candidate);
  return [...unique.values()].sort((a, b) => {
    const rank = item => {
      const source = String(item.source || "").toLowerCase();
      return (source === "tel" ? 30 : source === "json-ld" ? 25 : source === "data-phone" ? 20 : 10) +
        (String(item.confidence).toLowerCase() === "high" ? 5 : 0);
    };
    return rank(b) - rank(a);
  })[0] || null;
}

function normalizedNameTokens(value) {
  return String(value || "").toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:pty|ltd|limited|inc|incorporated|cc|corp|corporation|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().split(/\s+/).filter(token => token.length > 1);
}

function businessNamesMatch(first, second) {
  const a = new Set(normalizedNameTokens(first));
  const b = new Set(normalizedNameTokens(second));
  if (!a.size || !b.size) return false;
  const overlap = [...a].filter(token => b.has(token)).length;
  return overlap / Math.min(a.size, b.size) >= 0.6;
}

module.exports = {
  cleanBusinessName,
  emailCandidate,
  emailMatchesWebsite,
  isEmailPublishedOnWebsite,
  selectPrimaryEmail,
  phoneCandidate,
  selectPrimaryPhone,
  businessNamesMatch,
  websiteHostname
};
