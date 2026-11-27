const test = require("node:test");
const assert = require("node:assert/strict");
const { gzipSync } = require("node:zlib");
const { discoverOverture, validateFeedCandidate } = require("./overtureProvider");

function candidate(name, host, source = "meta", license = "CDLA-Permissive-2.0") {
  return {
    source: "overture_maps",
    website: `https://${host}`,
    website_normalized: host,
    name,
    city: "Pretoria",
    region: "Gauteng",
    confidence: 0.9,
    locationEvidence: {
      provider: "overture_maps",
      country: "ZA",
      region_code: "ZA-GP",
      sources: [{ dataset: source, license }]
    }
  };
}

function responseFor(rows, status = 200) {
  const body = gzipSync(Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + "\n"));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async arrayBuffer() { return body; }
  };
}

test("Overture feed validates Gauteng identity, confidence, and licensed non-Foursquare provenance", () => {
  assert.ok(validateFeedCandidate(candidate("Example Business", "example.co.za")));
  assert.equal(validateFeedCandidate(candidate("Foursquare Business", "four.co.za", "foursquare", "Apache-2.0")), null);
  assert.equal(validateFeedCandidate(candidate("Unlicensed Business", "unlicensed.co.za", "unknown", "")), null);
  const outside = candidate("Outside", "outside.co.za");
  outside.locationEvidence.region_code = "ZA-NW";
  assert.equal(validateFeedCandidate(outside), null);
});

test("Overture provider returns bounded row-offset pages without skipping remainder candidates", async () => {
  const rows = [
    candidate("One", "one.co.za"),
    candidate("Two", "two.co.za"),
    candidate("Three", "three.co.za")
  ];
  const fetchImpl = async () => responseFor(rows);
  const first = await discoverOverture({ maxCandidates: 2, pageOffset: 0, fetchImpl });
  const second = await discoverOverture({ maxCandidates: 2, pageOffset: first.nextOffset, fetchImpl });
  assert.deepEqual(first.candidates.map(item => item.name), ["One", "Two"]);
  assert.deepEqual(second.candidates.map(item => item.name), ["Three"]);
  assert.equal(first.totalCandidateCount, 3);
  assert.equal(first.nextOffset, 2);
  assert.equal(second.nextOffset, 0);
});

test("Overture provider rejects unavailable feeds with the HTTP status attached", async () => {
  await assert.rejects(
    discoverOverture({ fetchImpl: async () => responseFor([], 503) }),
    error => error.status === 503
  );
});

test("Overture provider fails closed for malformed gzip data", async () => {
  await assert.rejects(
    discoverOverture({
      fetchImpl: async () => ({
        ok: true, status: 200, headers: { get: () => null },
        async arrayBuffer() { return Buffer.from("not-gzip"); }
      })
    })
  );
});
