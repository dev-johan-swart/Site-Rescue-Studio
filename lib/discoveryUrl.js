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
    if (isExcludedHostname(parsed.hostname.toLowerCase())) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch { return ""; }
}

function normalizeWebsite(value) {
  const cleaned = cleanWebsiteUrl(value);
  return cleaned ? hostnameFromUrl(cleaned) : "";
}

module.exports = { EXCLUDED_HOSTS, cleanWebsiteUrl, normalizeWebsite, hostnameFromUrl, isExcludedHostname };
