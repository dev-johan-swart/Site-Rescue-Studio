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
        match: "/find/electricians/gt/pretoria",
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

test("PretoriaHub extracts external websites without accepting its own host", async () => {
  const result = await discoverPretoriaHub({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: mockFetch([
      {
        match: "pretoriahub.com/?s=",
        body: '<a href="/business/example">Example profile</a>'
      },
      {
        match: "pretoriahub.com/business/example",
        body: '<a href="https://example.co.za">Example website</a>'
      }
    ])
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].normalized, "example.co.za");
});

test("MyCityInfo extracts external websites", async () => {
  const result = await discoverMyCityInfo({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: mockFetch([
      {
        match: "/places/south-africa/gauteng/pretoria/",
        body: '<a href="https://example.co.za">Example</a>'
      }
    ])
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].normalized, "example.co.za");
});
