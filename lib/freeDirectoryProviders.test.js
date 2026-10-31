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


test("MyCityInfo rotates distinct cities, falls back to page one, and filters known sites early", async () => {
  const requested = [];
  const result = await discoverMyCityInfo({
    queries: [
      { label: "electricians", city: "Pretoria" },
      { label: "plumbers", city: "Pretoria" },
      { label: "accountants", city: "Centurion" },
      { label: "electricians", city: "Johannesburg" }
    ],
    pageOffset: 20,
    maxCandidates: 5,
    fetchImpl: async url => {
      requested.push(String(url));
      const isPretoriaPageTwo = String(url).includes("/gauteng/pretoria/page/2/");
      const host = String(url).includes("/centurion/")
        ? "centurionfresh.co.za"
        : String(url).includes("/johannesburg/")
          ? "joburgfresh.co.za"
          : "known.co.za";
      return {
        ok: !isPretoriaPageTwo,
        status: isPretoriaPageTwo ? 404 : 200,
        async text() { return '<a href="https://' + host + '">Website</a>'; }
      };
    },
    filterCandidates: async candidates => candidates.filter(candidate => candidate.normalized !== "known.co.za")
  });

  assert.ok(requested.some(url => url.includes("/gauteng/pretoria/page/2/")));
  assert.ok(requested.some(url => url.includes("/gauteng/pretoria/")));
  assert.ok(requested.some(url => url.includes("/gauteng/centurion/page/2/")));
  assert.ok(requested.some(url => url.includes("/gauteng/johannesburg/page/2/")));
  assert.equal(result.queries.length, 3);
  assert.equal(result.queries[0].fallbackUsed, true);
  assert.equal(result.queries[0].cityArchiveError.status, 404);
  assert.deepEqual(result.candidates.map(candidate => candidate.normalized), [
    "centurionfresh.co.za",
    "joburgfresh.co.za"
  ]);
  assert.equal(result.candidates[0].name, null);
  assert.equal(result.candidates[0].category, null);
});

test("PretoriaHub advances to later profile windows and wraps shorter listings safely", async () => {
  const requested = [];
  const profileLinks = Array.from({ length: 14 }, (_, index) =>
    '<a href="/business/profile-' + index + '/">Profile ' + index + '</a>'
  ).join("");
  const result = await discoverPretoriaHub({
    queries: [{ label: "local businesses", city: "Pretoria" }],
    pageOffset: 180,
    maxCandidates: 20,
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).includes("/section/home-trade/")) {
        return { ok: true, status: 200, async text() { return profileLinks; } };
      }
      return { ok: true, status: 200, async text() {
        const match = String(url).match(/profile-(\d+)/);
        return match
          ? '<a href="https://profile' + match[1] + '.co.za">Website</a>'
          : "";
      } };
    }
  });
  assert.equal(result.profileWindow, 9);
  assert.equal(result.profileOffset, 12);
  assert.equal(result.profilesFetched, 2);
  assert.ok(requested.some(url => url.includes("/business/profile-12/")));
  assert.ok(!requested.some(url => url.includes("/business/profile-0/")));
});

test("PretoriaHub advances profile windows for each production cursor 28, 29 and 30", async () => {
  const profileLinks = Array.from({ length: 14 }, (_, index) =>
    '<a href="/business/profile-' + index + '/">Profile ' + index + '</a>'
  ).join("");
  const expected = [
    { cursor: 28, offset: 0, first: 0 },
    { cursor: 29, offset: 6, first: 6 },
    { cursor: 30, offset: 12, first: 12 }
  ];
  for (const item of expected) {
    const requested = [];
    const result = await discoverPretoriaHub({
      queries: [{ label: "local businesses", city: "Pretoria" }],
      pageOffset: item.cursor * 20,
      maxCandidates: 20,
      fetchImpl: async url => {
        requested.push(String(url));
        if (String(url).includes("/section/home-trade/")) {
          return { ok: true, status: 200, async text() { return profileLinks; } };
        }
        return { ok: true, status: 200, async text() {
          const match = String(url).match(/profile-(\d+)/);
          return match ? '<a href="https://profile' + match[1] + '.co.za">Website</a>' : "";
        } };
      }
    });
    assert.equal(result.profileWindow, item.cursor);
    assert.equal(result.profileOffset, item.offset);
    assert.ok(requested.some(url => url.includes("/business/profile-" + item.first + "/")));
  }
});

test("directory candidate metadata is not inferred from a generic category search label", async () => {
  const result = await discoverHotfrog({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: async url => ({
      ok: true, status: 200,
      async text() {
        return String(url).includes("/company/example")
          ? '<a href="https://example.co.za">Visit website</a>'
          : '<a href="/company/example">Example listing</a>';
      }
    })
  });
  assert.equal(result.candidates[0].city, "Pretoria");
  assert.equal(result.candidates[0].category, null);
});

test("directory profile heading supplies a verified business name instead of generic website link text", () => {
  const { profileExternalLinks } = require("./freeDirectoryProviders");
  const result = profileExternalLinks(
    '<h1>Example Electrical Services</h1><a href="https://example.co.za">Visit website</a>',
    "pretoriahub"
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Example Electrical Services");
});
