const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getDiscoveryQueries,
  searchGooglePlaces,
  uniqueWebsiteCandidates,
  discoverWebsites
} = require("./prospectDiscovery");

test("discovery query rotation is bounded and deterministic", () => {
  const queries = getDiscoveryQueries(new Date("2026-09-23T00:00:00Z"));
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => /Pretoria|Centurion/.test(query)));
});

test("website candidates ignore missing and non-http websites and deduplicate hosts", () => {
  const result = uniqueWebsiteCandidates([
    { websiteUri: "https://www.example.co.za/" },
    { websiteUri: "https://example.co.za/contact" },
    { websiteUri: "http://other.example.co.za" },
    { websiteUri: "https://maps.google.com/example" },
    { websiteUri: "" }
  ], 10);

  assert.deepEqual(
    result.map(item => item.normalized),
    ["example.co.za", "other.example.co.za", "maps.google.com"]
  );
});

test("Google Places request uses a narrow website field mask", async () => {
  let request;
  const places = await searchGooglePlaces(
    "electricians in Pretoria, South Africa",
    "test-key",
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { places: [{ websiteUri: "https://example.co.za" }] };
        }
      };
    }
  );

  assert.equal(places.length, 1);
  assert.equal(request.url, "https://places.googleapis.com/v1/places:searchText");
  assert.equal(request.options.headers["X-Goog-Api-Key"], "test-key");
  assert.equal(request.options.headers["X-Goog-FieldMask"], "places.websiteUri");
  assert.equal(JSON.parse(request.options.body).textQuery, "electricians in Pretoria, South Africa");
});

test("discovery returns unique website candidates across queries", async () => {
  const calls = [];
  const result = await discoverWebsites({
    apiKey: "test-key",
    queries: ["one", "two"],
    maxCandidates: 3,
    fetchImpl: async (_url, options) => {
      const query = JSON.parse(options.body).textQuery;
      calls.push(query);
      return {
        ok: true,
        status: 200,
        async json() {
          return query === "one"
            ? { places: [
                { websiteUri: "https://www.first.co.za" },
                { websiteUri: "https://second.co.za" }
              ] }
            : { places: [
                { websiteUri: "https://www.first.co.za" },
                { websiteUri: "https://third.co.za" }
              ] };
        }
      };
    }
  });

  assert.deepEqual(calls, ["one", "two"]);
  assert.equal(result.candidateCount, 3);
  assert.deepEqual(
    result.candidates.map(item => item.normalized),
    ["first.co.za", "second.co.za", "third.co.za"]
  );
});
