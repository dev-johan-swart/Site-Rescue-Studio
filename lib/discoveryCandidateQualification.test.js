const test = require("node:test");
const assert = require("node:assert/strict");
const { qualifyDiscoveryCandidate } = require("./discoveryCandidateQualification");

test("candidate qualification rejects missing or invalid business websites", () => {
  assert.equal(qualifyDiscoveryCandidate({ name: "Acme Electrical", city: "Pretoria" }).reason, "website_missing_or_invalid");
  assert.equal(qualifyDiscoveryCandidate({ website: "https://facebook.com/acme", name: "Acme Electrical", city: "Pretoria" }).reason, "website_missing_or_invalid");
});

test("candidate qualification requires business identity and geographic evidence", () => {
  assert.equal(qualifyDiscoveryCandidate({ website: "https://acme.co.za", city: "Pretoria" }).reason, "business_identity_missing");
  assert.equal(qualifyDiscoveryCandidate({ website: "https://acme.co.za", name: "Acme Electrical" }).reason, "geography_evidence_missing");
});

test("candidate qualification preserves source evidence and normalized website", () => {
  const result = qualifyDiscoveryCandidate({ website: "https://www.acme.co.za/contact", name: "  Acme   Electrical Services ", city: "Pretoria", provider: "hotfrog", locationEvidence: "business_profile_address" });
  assert.equal(result.eligible, true);
  assert.equal(result.candidate.name, "Acme Electrical Services");
  assert.equal(result.candidate.normalized, "acme.co.za");
  assert.equal(result.candidate.provider, "hotfrog");
  assert.equal(result.candidate.locationEvidence, "business_profile_address");
});
