const test = require("node:test");
const assert = require("node:assert/strict");
const {
  externalLinks,
  discoverHotfrog,
  discoverOpendi,
  discoverPretoriaHub,
  discoverMyCityInfo
} = require("./freeDirectoryProviders");

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

test("Hotfrog follows bounded business detail links", async () => {
  const result = await discoverHotfrog({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: mockFetch([
      {
        match: "/search/pretoria",
        body: '<a href="/company/example">Example</a>'
      },
      {
        match: "/company/example",
        body: '<a href="https://example.co.za">Example website</a>'
      }
    ])
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].normalized, "example.co.za");
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

test("PretoriaHub uses public section archives and follows bounded business profiles", async () => {
  const requested = [];
  const result = await discoverPretoriaHub({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).includes("/section/professional-financial-services/")) {
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
  assert.ok(requested.some(url => url.includes("/section/professional-financial-services/")));
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

test("MyCityInfo continues after one city returns 404", async () => {
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
  assert.equal(requested.length, 2);
});

test("MyCityInfo skips cities outside its Gauteng archive routes", async () => {
  const requested = [];
  const result = await discoverMyCityInfo({
    queries: [{ label: "electricians", city: "Cape Town" }, { label: "plumbers", city: "Pretoria" }],
    fetchImpl: async url => {
      requested.push(String(url));
      return { ok: true, status: 200, async text() { return '<a href="https://example.co.za">Example</a>'; } };
    }
  });
  assert.equal(result.candidateCount, 1);
  assert.deepEqual(result.skippedCities, ["Cape Town"]);
  assert.equal(requested.length, 1);
  assert.match(requested[0], /\/gauteng\/pretoria\//);
});
