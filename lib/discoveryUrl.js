const net = require("node:net");
const EXCLUDED_HOSTS = new Set([
  "facebook.com","instagram.com","linkedin.com","google.com","maps.google.com",
  "goo.gl","youtube.com","yelp.com","x.com","twitter.com"
]);

function hostnameFromUrl(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function isExcludedHostname(hostname) {
  return Array.from(EXCLUDED_HOSTS).some(host => hostname === host || hostname.endsWith("." + host));
}

function isNonPublicIpAddress(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  const version = net.isIP(host);
  if (version === 4) {
    const octets = host.split(".").map(Number);
    const [a, b, c] = octets;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && b === 18) || (a === 198 && b === 19) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 255 && b === 255 && c === 255);
  }
  if (version === 6) {
    return host === "::" || host === "::1" ||
      /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host) ||
      /^2001:db8:/i.test(host);
  }
  return false;
}

function cleanWebsiteUrl(value) {
  if (value === null || value === undefined) return "";
  let text = String(value).trim().replace(/^["']|["']$/g, "").trim();
  const markdown = text.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdown) text = markdown[1];
  const angle = text.match(/^<\s*(https?:\/\/[^\s>]+)\s*>$/i);
  if (angle) text = angle[1];
  const urlMatch = text.match(/https?:\/\/[^\s<>"'\]\)]+/i);
  if (urlMatch) text = urlMatch[0];
  text = text.replace(/[),.;:!?]+$/g, "").trim();
  if (/^www\./i.test(text)) text = "https://" + text;
  else if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/.*)?$/i.test(text)) text = "https://" + text;
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const parsed = new URL(text);
    if (!["http:","https:"].includes(parsed.protocol) || !parsed.hostname) return "";
    if (parsed.username || parsed.password) return "";
    if (isExcludedHostname(parsed.hostname.toLowerCase())) return "";
    if (isNonPublicIpAddress(parsed.hostname)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch { return ""; }
}

function normalizeWebsite(value) {
  const cleaned = cleanWebsiteUrl(value);
  return cleaned ? hostnameFromUrl(cleaned) : "";
}

module.exports = { EXCLUDED_HOSTS, cleanWebsiteUrl, normalizeWebsite, hostnameFromUrl, isExcludedHostname, isNonPublicIpAddress };
