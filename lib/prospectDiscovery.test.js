const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getDiscoveryQueries,
  buildOverpassQuery,
  searchOpenStreetMap,
  uniqueWebsiteCandidates,
  discoverWebsites
} = require("./prospectDiscovery");

test("discovery query rotation is bounded and deterministic", () => {
  const queries = getDiscoveryQueries(new Date("2026-09-23T00:00:00Z"));
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => /Pretoria|Centurion/.test(query.label)));
});

test("Overpass query requests websites for the selected business category", () => {
  const query = getDiscoveryQueries(new Date("2026-09-23T00:00:00Z"))[0];
  const overpass = buildOverpassQuery(query);
  assert.match(overpass, /\[out:json\]/);
  assert.match(overpass, /\[website\]/);
  assert.match(overpass, /\[contact:website\]/);
  assert.match(overpass, new RegExp(query.bbox.replaceAll(".", "\\.")));
});

test("website candidates ignore missing, social, and invalid websites and deduplicate hosts", () => {
  const query = getDiscoveryQueries(new Date("2026-09-23T00:00:00Z"))[0];
  const result = uniqueWebsiteCandidates([
    { tags: { name: "First", website: "https://www.first.co.za/" } },
    { tags: { name: "First", "contact:website": "https://first.co.za/contact" } },
    { tags: { name: "Social", website: "https://facebook.com/example" } },
    { tags: { name: "Second", website: "http://second.co.za" } },
    { tags: { name: "Bad", website: "not-a-url" } }
  ], 10, query);

  assert.deepEqual(result.map(item => item.normalized), ["first.co.za", "second.co.za"]);
  assert.equal(result[0].name, "First");
  assert.equal(result[0].city, query.city);
});

test("OpenStreetMap request uses the configured query", async () => {
  let request;
  const query = getDiscoveryQueries(new Date("2026-09-23T00:00:00Z"))[0];
  const elements = await searchOpenStreetMap(query, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return { elements: [{ tags: { website: "https://example.co.za" } }] };
      }
    };
  });

  assert.equal(elements.length, 1);
  assert.equal(request.url, "https://overpass.private.coffee/api/interpreter");
  assert.equal(request.options.headers["User-Agent"].startsWith("Site Rescue Studio"), true);
  assert.match(decodeURIComponent(request.options.body), /website/);
  assert.match(decodeURIComponent(request.options.body), /contact:website/);
});

test("discovery returns unique website candidates across queries", async () => {
  const queryOne = getDiscoveryQueries(new Date("2026-09-23T00:00:00Z"))[0];
  const queryTwo = getDiscoveryQueries(new Date("2026-09-24T00:00:00Z"))[0];
  const calls = [];
  const result = await discoverWebsites({
    queries: [queryOne, queryTwo],
    maxCandidates: 3,
    fetchImpl: async (_url, options) => {
      calls.push(decodeURIComponent(options.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            elements: [
              { tags: { website: "https://www.first.co.za" } },
              { tags: { website: "https://second.co.za" } },
              { tags: { website: "https://third.co.za" } }
            ]
          };
        }
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(result.source, "openstreetmap");
  assert.equal(result.candidateCount, 3);
  assert.deepEqual(result.candidates.map(item => item.normalized), [
    "first.co.za", "second.co.za", "third.co.za"
  ]);
});
