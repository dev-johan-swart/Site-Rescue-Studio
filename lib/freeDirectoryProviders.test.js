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
        return { ok: true, status: 200, async text() { return '<h1>Example Electrical</h1><a href="https://example.co.za">Official website</a><address>Pretoria, Gauteng</address>'; } };
      }
      return { ok: true, status: 200, async text() { return '<a href="/company/example">Example</a>'; } };
    }
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].normalized, "example.co.za");
  assert.ok(requested[0].includes("/search/pretoria/electricians"));
});

test("Hotfrog search route includes the current category and city instead of city-only browse", async () => {
  const requested = [];
  await discoverHotfrog({
    queries: [{ label: "medical practices", city: "Johannesburg" }],
    fetchImpl: async url => {
      requested.push(String(url));
      return { ok: true, status: 200, async text() { return ""; } };
    }
  });
  assert.equal(requested[0], "https://www.hotfrog.co.za/search/johannesburg/medical-practices");
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

test("PretoriaHub discovers category and suburb routes and carries listing identity into website candidates", async () => {
  const requested = [];
  const listingHtml = '<h3>Example Electrical Services</h3><p>Building &amp; Construction · Blue Valley · 1840, Blue Valley Golf Estate, Centurion, 1840</p><a href="/business/example/">View profile</a>';
  const result = await discoverPretoriaHub({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: async url => {
      const target = String(url);
      requested.push(target);
      if (target === "https://pretoriahub.com/") {
        return { ok: true, status: 200, async text() { return '<a href="/categories/">All categories</a>'; } };
      }
      if (target.endsWith("/categories/")) {
        return { ok: true, status: 200, async text() { return '<a href="/category/electricians/">Electricians</a>'; } };
      }
      if (target.endsWith("/suburbs/")) {
        return { ok: true, status: 200, async text() { return '<a href="/suburb/centurion/">Centurion</a>'; } };
      }
      if (target.includes("/category/electricians/") || target.includes("/suburb/centurion/")) {
        return { ok: true, status: 200, async text() { return listingHtml; } };
      }
      if (target.includes("/business/example/")) {
        return { ok: true, status: 200, async text() { return '<a href="https://example.co.za">Website</a>'; } };
      }
      return { ok: true, status: 200, async text() { return ""; } };
    }
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].name, "Example Electrical Services");
  assert.equal(result.candidates[0].city, "Centurion");
  assert.equal(result.homepageFetched, true);
  assert.equal(result.indexPagesFetched, 1);
  assert.ok(result.listingRoutesFound >= 1);
  assert.ok(requested.some(url => url.includes("/category/electricians/")));
});

test("MyCityInfo extracts business names from listing headings when website links are generic", async () => {
  const requested = [];
  const result = await discoverMyCityInfo({
    queries: [{ label: "electricians", city: "Pretoria" }, { label: "plumbers", city: "Pretoria" }],
    fetchImpl: async url => {
      requested.push(String(url));
      return {
        ok: true,
        status: 200,
        async text() {
          return '<h2>Example Electrical Services</h2><a href="https://example.co.za">Website</a>';
        }
      };
    }
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].normalized, "example.co.za");
  assert.equal(result.candidates[0].name, "Example Electrical Services");
  assert.equal(requested.length, 1);
});

test("MyCityInfo rotates a failed city archive to the national fallback, then continues to the next city", async () => {
  const requested = [];
  const queries = [
    { label: "electricians", city: "Johannesburg" },
    { label: "plumbers", city: "Pretoria" }
  ];
  const first = await discoverMyCityInfo({
    queries,
    pageOffset: 0,
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).includes("/johannesburg/")) {
        return { ok: false, status: 404, async text() { return "Not found"; } };
      }
      return { ok: true, status: 200, async text() { return '<a href="https://national-example.co.za">Website</a>'; } };
    }
  });
  const second = await discoverMyCityInfo({
    queries,
    pageOffset: 20,
    fetchImpl: async url => {
      requested.push(String(url));
      return { ok: true, status: 200, async text() { return '<a href="https://pretoria-example.co.za">Website</a>'; } };
    }
  });
  assert.equal(first.candidateCount, 1);
  assert.equal(first.errors.length, 1);
  assert.equal(first.errors[0].city, "Johannesburg");
  assert.equal(first.errors[0].status, 404);
  assert.equal(first.queries.length, 1);
  assert.equal(first.queries[0].fallbackUsed, true);
  assert.equal(first.queries[0].cityArchiveError.status, 404);
  assert.equal(second.candidateCount, 1);
  assert.equal(second.queries[0].city, "Pretoria");
  assert.ok(requested.some(url => url.includes("/places/")));
  assert.ok(requested.some(url => url.includes("/pretoria/")));
});

test("MyCityInfo visits one distinct city per durable cursor across provinces", async () => {
  const requested = [];
  const queries = [
    { label: "electricians", city: "Cape Town" },
    { label: "plumbers", city: "Pretoria" },
    { label: "accountants", city: "Unknown Town" }
  ];
  const results = [];
  for (const pageOffset of [0, 20, 40]) {
    results.push(await discoverMyCityInfo({
      queries,
      pageOffset,
      maxCandidates: 20,
      fetchImpl: async url => {
        requested.push(String(url));
        const host = String(url).includes("/cape-town/")
          ? "cape-example.co.za"
          : String(url).includes("/pretoria/")
            ? "pretoria-example.co.za"
            : "country-example.co.za";
        return { ok: true, status: 200, async text() { return '<a href="https://' + host + '">Website</a>'; } };
      }
    }));
  }
  const candidates = results.flatMap(result => result.candidates);
  assert.equal(candidates.length, 3);
  assert.ok(results.every(result => result.queries.length === 1));
  assert.match(requested[0], /\/western-cape\/cape-town\//);
  assert.match(requested[1], /\/gauteng\/pretoria\//);
  assert.match(requested[2], /\/places\/$/);
  assert.equal(candidates[2].city, null);
  assert.equal(candidates[2].region, "south_africa");
});

test("discovery URL validation rejects reserved IP literals and credentialed URLs but keeps public domains", () => {
  assert.equal(cleanWebsiteUrl("http://0.0.0.31/"), "");
  assert.equal(cleanWebsiteUrl("http://127.0.0.1/"), "");
  assert.equal(cleanWebsiteUrl("http://192.168.1.20/"), "");
  assert.equal(cleanWebsiteUrl("http://user@example.co.za/"), "");
  assert.equal(normalizeWebsite("https://www.real-business.co.za/about"), "real-business.co.za");
});


test("MyCityInfo advances one city-page cursor at a time and falls back to page one", async () => {
  const requested = [];
  const queries = [
    { label: "electricians", city: "Pretoria" },
    { label: "plumbers", city: "Pretoria" },
    { label: "accountants", city: "Centurion" },
    { label: "electricians", city: "Johannesburg" }
  ];
  const results = [];
  for (const pageOffset of [60, 80, 100]) {
    results.push(await discoverMyCityInfo({
      queries,
      pageOffset,
      maxCandidates: 5,
      fetchImpl: async url => {
        requested.push(String(url));
        const value = String(url);
        if (value.includes("/page/2/")) {
          return { ok: false, status: 404, async text() { return "Page unavailable"; } };
        }
        const host = value.includes("/centurion/")
          ? "centurionfresh.co.za"
          : value.includes("/johannesburg/")
            ? "joburgfresh.co.za"
            : "known.co.za";
        return {
          ok: true,
          status: 200,
          async text() { return '<a href="https://' + host + '">Website</a>'; }
        };
      },
      filterCandidates: async candidates => candidates.filter(candidate => candidate.normalized !== "known.co.za")
    }));
  }
  assert.ok(requested.some(url => url.includes("/gauteng/pretoria/page/2/")));
  assert.ok(requested.some(url => url.includes("/gauteng/pretoria/")));
  assert.ok(requested.some(url => url.includes("/gauteng/centurion/page/2/")));
  assert.ok(requested.some(url => url.includes("/gauteng/johannesburg/page/2/")));
  const queryResults = results.flatMap(result => result.queries);
  const candidates = results.flatMap(result => result.candidates);
  assert.equal(queryResults.length, 3);
  assert.equal(queryResults[0].fallbackUsed, true);
  assert.equal(queryResults[0].cityArchiveError.status, 404);
  assert.deepEqual(candidates.map(candidate => candidate.normalized), [
    "centurionfresh.co.za",
    "joburgfresh.co.za"
  ]);
  assert.equal(candidates[0].name, null);
  assert.equal(candidates[0].category, null);
});

test("MyCityInfo does not repeat the national archive when a city archive is valid but known-only", async () => {
  const requested = [];
  const queries = [
    { label: "electricians", city: "Pretoria" },
    { label: "plumbers", city: "Centurion" }
  ];
  const first = await discoverMyCityInfo({
    queries,
    pageOffset: 0,
    fetchImpl: async url => {
      requested.push(String(url));
      return {
        ok: true,
        status: 200,
        async text() { return '<a href="https://already-known.co.za">Website</a>'; }
      };
    },
    filterCandidates: async candidates =>
      candidates.filter(candidate => candidate.normalized !== "already-known.co.za")
  });
  const second = await discoverMyCityInfo({
    queries,
    pageOffset: 20,
    fetchImpl: async url => {
      requested.push(String(url));
      return {
        ok: true,
        status: 200,
        async text() { return '<a href="https://centurion-new-business.co.za">Website</a>'; }
      };
    }
  });
  assert.equal(first.candidateCount, 0);
  assert.equal(second.candidateCount, 1);
  assert.deepEqual(second.candidates.map(candidate => candidate.normalized), ["centurion-new-business.co.za"]);
  assert.equal(requested.filter(url => {
    const path = new URL(url).pathname;
    return path === "/places/" || path.startsWith("/places/page/");
  }).length, 0);
  assert.ok(requested.some(url => url.includes("/gauteng/pretoria/")));
  assert.ok(requested.some(url => url.includes("/gauteng/centurion/")));
});

test("directory profile extraction preserves the listing heading when the profile has no h1", () => {
  const { profileExternalLinks } = require("./freeDirectoryProviders");
  const result = profileExternalLinks(
    '<h2>Example Industrial Services</h2><a href="https://example-industrial.co.za">Website</a>',
    "hotfrog"
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Example Industrial Services");
});

test("directory profile extraction uses Open Graph title as business identity when h1 is absent", () => {
  const { profileExternalLinks } = require("./freeDirectoryProviders");
  const result = profileExternalLinks(
    '<meta property="og:title" content="Kind2Hearing - Nelspruit | Hotfrog South Africa"><a href="https://kind2hearing.co.za">Official website</a>',
    "hotfrog"
  );
  assert.equal(result[0].name, "Kind2Hearing - Nelspruit");
});

test("directory profile extraction prefers structured LocalBusiness identity over generic site metadata", () => {
  const { profileExternalLinks } = require("./freeDirectoryProviders");
  const result = profileExternalLinks(
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Lowveld Hearing Centre"}</script><meta property="og:title" content="Welcome to Hotfrog | Hotfrog South Africa"><a href="https://lowveld-hearing.co.za">Official website</a>',
    "hotfrog"
  );
  assert.equal(result[0].name, "Lowveld Hearing Centre");
});

test("generic Hotfrog site titles are not accepted as profile business identity", () => {
  const { profileExternalLinks } = require("./freeDirectoryProviders");
  const result = profileExternalLinks(
    '<meta property="og:title" content="Welcome to Hotfrog | Hotfrog South Africa"><title>Hotfrog</title><a href="https://example-business.co.za">Official website</a>',
    "hotfrog"
  );
  assert.equal(result[0].name, null);
});


test("Hotfrog uses its durable provider page cursor across preparation attempts", async () => {
  const { discoverWithProviders } = require("./discoveryProviders");
  const originalFetch = global.fetch;
  const requestedUrls = [];
  let recorded = null;
  global.fetch = async url => {
    requestedUrls.push(String(url));
    return {
      ok: true, status: 200,
      async text() {
        return String(url).includes("/company/example")
          ? '<h2>Example Electrical</h2><a href="https://example.co.za">Website</a>'
          : '<a href="/company/example">Example</a><a href="https://example.co.za">Example website</a>';
      }
    };
  };
  try {
    const query = { label: "electricians", city: "Pretoria" };
    const result = await discoverWithProviders({
      stage: { id: "gauteng", label: "Gauteng", queries: [query] },
      queries: [query],
      providerOrder: ["hotfrog"],
      isProviderAvailable: async () => true,
      getProviderPageState: async (provider, count) => {
        assert.equal(provider, "hotfrog");
        assert.equal(count, 100);
        return { page: 3 };
      },
      recordProviderPageResult: async (provider, page, count) => {
        recorded = { provider, page, count };
      },
      filterFreshCandidates: async candidates => candidates
    });
    assert.equal(result.attempts[0].page, 60);
    assert.ok(requestedUrls.some(url => url.endsWith("?page=4")));
    assert.deepEqual(recorded, { provider: "hotfrog", page: 3, count: 100 });
  } finally {
    global.fetch = originalFetch;
  }
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
  assert.equal(result.candidates[0].city, null);
  assert.equal(result.candidates[0].category, null);
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

test("Hotfrog never attributes search-page city to a business profile without address evidence", async () => {
  const result = await discoverHotfrog({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: async url => ({
      ok: true, status: 200,
      async text() {
        return String(url).includes("/company/example")
          ? '<h1>Example Electrical</h1><a href="https://example.co.za">Visit website</a>'
          : '<a href="/company/example">Example listing</a><a href="https://unrelated.co.za">Official website</a>';
      }
    })
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].name, "Example Electrical");
  assert.equal(result.candidates[0].city, null);
  assert.equal(result.candidates[0].locationEvidence, null);
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


test("directory candidates require official website context or a business-name domain match", () => {
  const { externalLinks } = require("./freeDirectoryProviders");
  const result = externalLinks(
    '<a href="https://unrelated.co.za">Read more</a><a href="https://example.co.za">Example</a><a href="https://other.co.za" title="Official website">Visit</a>',
    "hotfrog"
  );
  assert.deepEqual(result.map(item => item.normalized), ["example.co.za", "other.co.za"]);
});


test("candidate URL cleaning excludes Linktree profiles and domain parking pages", () => {
  assert.equal(cleanWebsiteUrl("https://linktr.ee/sitters4u"), "");
  assert.equal(cleanWebsiteUrl("https://www.hugedomains.com/domain_profile.cfm?d=example.com"), "");
  assert.equal(cleanWebsiteUrl("https://real-business.co.za/"), "https://real-business.co.za/");
});


test("Hotfrog country-navigation domains are never treated as business websites", () => {
  const html = [
    '<a href="https://www.hotfrog.dk/">Hotfrog Danmark</a>',
    '<a href="https://www.hotfrog.co.uk/">Hotfrog UK</a>',
    '<a href="https://www.hotfrogcz.cz/">Hotfrog Czech Republic</a>',
    '<a href="https://real-electrician.co.za/">Official website</a>'
  ].join("");
  const result = externalLinks(html, "hotfrog");
  assert.deepEqual(result.map(item => item.normalized), ["real-electrician.co.za"]);
});


test("generic Review placeholders never become business identity",()=>{
  const {externalLinks,profileExternalLinks}=require("./freeDirectoryProviders");
  const listing=externalLinks('<h2>Review.</h2><a href="https://cellc.co.za">Official website</a>',"hotfrog");
  assert.equal(listing.length,1);
  assert.equal(listing[0].name,null);
  assert.equal(listing[0].listingName,null);
  const profile=profileExternalLinks('<h1>Review.</h1><a href="https://example.co.za">Visit website</a>',"hotfrog");
  assert.equal(profile.length,1);
  assert.equal(profile[0].name,null);
});


test("website URL text is never accepted as a directory business identity", () => {
  const listing = externalLinks(
    '<h2>www.example.co.za</h2><a href="https://example.co.za">www.example.co.za</a>',
    "hotfrog"
  );
  assert.equal(listing.length, 1);
  assert.equal(listing[0].name, null);
  assert.equal(listing[0].listingName, null);
  const { profileExternalLinks } = require("./freeDirectoryProviders");
  const profile = profileExternalLinks(
    '<h1>https://www.example.co.za/</h1><a href="https://example.co.za">Official website</a>',
    "hotfrog"
  );
  assert.equal(profile.length, 1);
  assert.equal(profile[0].name, null);
});


test("MyCityInfo does not promote website-domain text as a business name", async () => {
  const result = await discoverMyCityInfo({
    queries: [{ label: "accountants", city: "Pretoria" }],
    maxCandidates: 5,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return '<h2>www.domain-as-name.co.za</h2><a href="https://domain-as-name.co.za">www.domain-as-name.co.za</a>';
      }
    })
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].name, null);
});


test("MyCityInfo rotates each city on the current page before advancing archive pages", async () => {
  const requested = [];
  const queries = [
    { label: "accountants", city: "Pretoria" },
    { label: "electricians", city: "Centurion" }
  ];
  const fetchImpl = async url => {
    requested.push(String(url));
    return {
      ok: true,
      status: 200,
      async text() { return ""; }
    };
  };
  const first = await discoverMyCityInfo({ queries, pageOffset: 0, fetchImpl });
  const second = await discoverMyCityInfo({ queries, pageOffset: 20, fetchImpl });
  const third = await discoverMyCityInfo({ queries, pageOffset: 40, fetchImpl });

  assert.deepEqual(requested, [
    "https://mycityinfo.co.za/places/south-africa/gauteng/pretoria/",
    "https://mycityinfo.co.za/places/south-africa/gauteng/centurion/",
    "https://mycityinfo.co.za/places/south-africa/gauteng/pretoria/page/2/"
  ]);
  assert.equal(first.queries[0].page, 1);
  assert.equal(first.queries[0].city, "Pretoria");
  assert.equal(second.queries[0].page, 1);
  assert.equal(second.queries[0].city, "Centurion");
  assert.equal(third.queries[0].page, 2);
  assert.equal(third.queries[0].city, "Pretoria");
});

test("Hotfrog uses the individual business profile heading instead of a website-domain anchor as its name", async () => {
  const result = await discoverHotfrog({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: async url => ({
      ok: true, status: 200,
      async text() {
        return String(url).includes("/company/example")
          ? '<h1>Acme Electrical Services</h1><a href="https://acme-electrical.co.za">www.acme-electrical.co.za</a><address>Pretoria, Gauteng</address>'
          : '<h2>Acme Electrical Services</h2><a href="/company/example">View profile</a><a href="https://unrelated-footer.co.za">Official website</a>';
      }
    })
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].name, "Acme Electrical Services");
  assert.equal(result.candidates[0].city, "Pretoria");
  assert.equal(result.candidates[0].locationEvidence, "business_profile_address");
});


test("Hotfrog ignores search-page external links and uses only profile address evidence", async () => {
  const requested = [];
  const result = await discoverHotfrog({
    queries: [{ label: "electricians", city: "Pretoria" }],
    fetchImpl: async url => {
      requested.push(String(url));
      return {
        ok: true, status: 200,
        async text() {
          return String(url).includes("/company/example")
            ? '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Acme Electrical","address":{"@type":"PostalAddress","addressLocality":"Centurion","addressRegion":"Gauteng"}}</script><h1>Acme Electrical</h1><a href="https://acme.co.za">Official website</a>'
            : '<a href="/company/example">Acme Electrical</a><a href="https://unrelated-advertiser.co.za">Official website</a>';
        }
      };
    }
  });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].name, "Acme Electrical");
  assert.equal(result.candidates[0].city, "Centurion");
  assert.equal(result.candidates[0].region, "gauteng");
  assert.equal(result.candidates[0].locationEvidence, "business_profile_address");
  assert.ok(requested.every(url => !url.includes("unrelated-advertiser")));
});

test("Hotfrog address parser leaves unsupported or absent locations unclassified", () => {
  const { profileBusinessLocation } = require("./freeDirectoryProviders");
  assert.deepEqual(profileBusinessLocation("<h1>Example</h1>"), {
    city: null, region: null, locationEvidence: null
  });
  assert.deepEqual(profileBusinessLocation("<address>Centurion, Gauteng</address>"), {
    city: "Centurion", region: "gauteng", locationEvidence: "business_profile_address"
  });
});
