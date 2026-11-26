const { normalizeWebsite } = require("./discoveryUrl");
const { cleanBusinessName } = require("./prospectIdentity");

function qualifyDiscoveryCandidate(candidate, provider = "unknown") {
  const website = String(candidate?.website || "").trim();
  const normalized = normalizeWebsite(website);
  if (!normalized) return { eligible: false, reason: "website_missing_or_invalid" };
  const name = cleanBusinessName(String(candidate?.name || "").replace(/<[^>]+>/g, " "));
  const city = String(candidate?.city || "").trim();
  const region = String(candidate?.region || "").trim();
  if (!name) return { eligible: false, reason: "business_identity_missing" };
  if (!city && !region) return { eligible: false, reason: "geography_evidence_missing" };
  return { eligible: true, candidate: {
    ...candidate, website, normalized, name,
    provider: candidate?.provider || provider,
    locationEvidence: candidate?.locationEvidence || (city ? "source_city_metadata" : "source_region_metadata")
  } };
}

module.exports = { qualifyDiscoveryCandidate };
