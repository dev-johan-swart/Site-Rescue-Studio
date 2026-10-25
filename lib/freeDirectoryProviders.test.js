const test = require("node:test");
const assert = require("node:assert/strict");
const {
  externalLinks,
  discoverHotfrog,
  discoverOpendi,
  discoverPretoriaHub,
  discoverMyCityInfo
} = require("./freeDirectoryProviders");
const { cleanWebsiteUrl, normalizeWebsite } = require("./discoveryUrl");

const mockFetch = pages => async url => {
  const key = String(url);
  const html = pages.findLast(item => key.includes(item.match));
  return {
    ok: true,
    status: 200,
    async text() { return html ? html.body : ""; }
  };
};

test("free directory extractor keeps external websites and excludes directory links", () => {
  const result = externalLinks(
    '<a href="/company/foo">Foo</a><a href="https://example.co.za">Example</a><a href="https://www.example.co.za/about">Duplicate</a>',
    "hotfrog"
  );
  assert.deepEqual(result.map(item => item.normalized), ["example.co.za"]);
});

test("Hotfrog uses category-specific public search routes and follows bounded detail links", async () => {
  const requested = [];
  const result = await discoverHotfrog({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).includes("/company/example")) {
        return { ok: true, status: 200, async text() { return '<a href="https://example.co.za">Example website</a>'; } };
      }
      return { ok: true, status: 200, async text() { return '<a href="/company/example">Example</a>'; } };
    }
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].normalized, "example.co.za");
  assert.ok(requested[0].includes("/search/pretoria"));
});

test("Opendi follows bounded business detail links", async () => {
  const result = await discoverOpendi({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: mockFetch([
      {
        match: "/pretoria/",
        body: '<a href="/pretoria/example.html">Example</a>'
      },
      {
        match: "/pretoria/example.html",
        body: '<a href="https://example.co.za">Example website</a>'
      }
    ])
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].normalized, "example.co.za");
});

test("PretoriaHub uses verified public directory routes and follows bounded business profiles", async () => {
  const requested = [];
  const result = await discoverPretoriaHub({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).includes("/section/home-trade/")) {
        return { ok: true, status: 200, async text() { return '<a href="/business/example/">Example profile</a>'; } };
      }
      if (String(url).includes("/business/example/")) {
        return { ok: true, status: 200, async text() { return '<a href="https://example.co.za">Example website</a>'; } };
      }
      return { ok: true, status: 200, async text() { return ""; } };
    }
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].normalized, "example.co.za");
  assert.ok(requested.some(url => url.includes("/section/home-trade/")));
  assert.ok(!requested.some(url => url.includes("?s=")));
});

test("MyCityInfo extracts external websites and deduplicates city queries", async () => {
  const requested = [];
  const result = await discoverMyCityInfo({
    queries: [{ label: "electricians", city: "Pretoria" }, { label: "plumbers", city: "Pretoria" }],
    fetchImpl: async url => {
      requested.push(String(url));
      return { ok: true, status: 200, async text() { return '<a href="https://example.co.za">Example</a>'; } };
    }
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].normalized, "example.co.za");
  assert.equal(requested.length, 1);
});

test("MyCityInfo falls back from a missing city archive and continues with other cities", async () => {
  const requested = [];
  const result = await discoverMyCityInfo({
    queries: [{ label: "electricians", city: "Johannesburg" }, { label: "plumbers", city: "Pretoria" }],
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).includes("/johannesburg/")) return { ok: false, status: 404, async text() { return "Not found"; } };
      return { ok: true, status: 200, async text() { return '<a href="https://example.co.za">Example</a>'; } };
    }
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].city, "Johannesburg");
  assert.equal(result.errors[0].status, 404);
  assert.equal(result.queries.length, 2);
  assert.equal(result.queries[0].fallbackUsed, true);
  assert.equal(result.queries[0].cityArchiveError.status, 404);
  assert.ok(requested.some(url => url.includes("/places/")));
  assert.ok(requested.some(url => url.includes("/pretoria/")));
});

test("MyCityInfo accepts cities across provinces and uses the matching archive", async () => {
  const requested = [];
  const result = await discoverMyCityInfo({
    queries: [
      { label: "electricians", city: "Cape Town" },
      { label: "plumbers", city: "Pretoria" },
      { label: "accountants", city: "Unknown Town" }
    ],
    maxCandidates: 20,
    fetchImpl: async url => {
      requested.push(String(url));
      const host = requested.length === 1 ? "cape-example.co.za" : requested.length === 2 ? "pretoria-example.co.za" : "country-example.co.za";
      return { ok: true, status: 200, async text() { return '<a href="https://' + host + '">Example</a>'; } };
    }
  });
  assert.equal(result.candidateCount, 3);
  assert.deepEqual(result.skippedCities, []);
  assert.equal(requested.length, 3);
  assert.match(requested[0], /\/western-cape\/cape-town\//);
  assert.match(requested[1], /\/gauteng\/pretoria\//);
  assert.match(requested[2], /\/places\//);
  assert.equal(result.candidates[2].city, "South Africa");
});

test("discovery URL validation rejects reserved IP literals and credentialed URLs but keeps public domains", () => {
  assert.equal(cleanWebsiteUrl("http://0.0.0.31/"), "");
  assert.equal(cleanWebsiteUrl("http://127.0.0.1/"), "");
  assert.equal(cleanWebsiteUrl("http://192.168.1.20/"), "");
  assert.equal(cleanWebsiteUrl("http://user@example.co.za/"), "");
  assert.equal(normalizeWebsite("https://www.real-business.co.za/about"), "real-business.co.za");
});
