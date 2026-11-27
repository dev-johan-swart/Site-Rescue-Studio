const test=require("node:test");const assert=require("node:assert/strict");const{extractWebsDocsCandidates,discoverWebsDocs}=require("./discoveryProviders");
test("WebsDocs candidates extract and deduplicate public website hosts",()=>{const result=extractWebsDocsCandidates({results:[{name:"One",website:"https://www.one.co.za/"},{name:"One",website:"https://one.co.za/contact"},{name:"Two",websiteUrl:"https://two.co.za/"}]},{label:"electricians",city:"Pretoria"});assert.deepEqual(result.map(x=>x.normalized),["one.co.za","two.co.za"]);});
test("WebsDocs discovery uses the public no-key endpoint",async()=>{let request;const result=await discoverWebsDocs({queries:[{label:"electricians",city:"Pretoria"}],fetchImpl:async(url,options)=>{request={url,options};return{ok:true,status:200,async json(){return{results:[{name:"Example",website:"https://example.co.za"}]};}};}});assert.equal(result.candidateCount,1);assert.match(request.url,/country=ZA/);assert.match(request.url,/city=Pretoria/);assert.equal(request.options.headers.Accept,"application/json");});
test("discovery stages rotate from Pretoria/Centurion through Gauteng and South Africa",()=>{
  const {DISCOVERY_STAGES,getDiscoveryStage,providerQueries}=require("./discoveryProviders");
  assert.deepEqual(DISCOVERY_STAGES.map(stage=>stage.id),["pretoria_centurion","gauteng","south_africa","international"]);
  assert.equal(getDiscoveryStage("gauteng").label,"Gauteng");
  assert.equal(providerQueries(new Date("2026-09-23T00:00:00Z"),getDiscoveryStage("gauteng").queries).length,2);
});

test("WebsDocs searches city results without category text narrowing and preserves returned metadata", async () => {
  let requestUrl = "";
  const result = await discoverWebsDocs({
    queries: [{ label: "electricians", city: "Pretoria", categorySlug: "electrical-contractors" }],
    fetchImpl: async url => {
      requestUrl = String(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return { items: [{ name: "Example Electric", website: "https://example.co.za", city: "Pretoria", category: "Electrical contractors" }] };
        }
      };
    }
  });
  assert.match(requestUrl, /category=electrical-contractors/);
  assert.match(requestUrl, /q=electricians/);
  assert.equal(result.candidates[0].city, "Pretoria");
  assert.equal(result.candidates[0].category, "Electrical contractors");
});


test("WebsDocs sends the selected service label as a real search query", async () => {
  let requestedUrl = "";
  await discoverWebsDocs({
    queries: [{ label: "marketing agencies", city: "Pretoria" }],
    fetchImpl: async url => {
      requestedUrl = String(url);
      return { ok: true, status: 200, async json() { return { results: [] }; } };
    }
  });
  const parsed = new URL(requestedUrl);
  assert.equal(parsed.searchParams.get("q"), "marketing agencies");
  assert.equal(parsed.searchParams.get("city"), "Pretoria");
});

test("WebsDocs extracts Markdown-wrapped websites",()=>{const result=extractWebsDocsCandidates({results:[{name:"Brinant",website:"[https://www.brinant.co.za/](https://www.brinant.co.za/)"}]},{label:"security companies",city:"Pretoria"});assert.equal(result[0].website,"https://www.brinant.co.za/");assert.equal(result[0].normalized,"brinant.co.za");});

test("discovery stage rotation skips disabled international stage",()=>{const {getDiscoveryStage,nextEnabledDiscoveryStageId}=require("./discoveryProviders");assert.equal(nextEnabledDiscoveryStageId("pretoria_centurion"),"gauteng");assert.equal(nextEnabledDiscoveryStageId("gauteng"),"south_africa");assert.equal(nextEnabledDiscoveryStageId("south_africa"),"pretoria_centurion");assert.equal(getDiscoveryStage("pretoria_centurion").label,"Pretoria & Centurion");});


test("Foursquare extracts only independent website candidates",()=>{
  const {extractFoursquareCandidates}=require("./discoveryProviders");
  const result=extractFoursquareCandidates({
    results:[
      {name:"Example",website:"https://example.co.za",location:{locality:"Pretoria"}},
      {name:"No Website",location:{locality:"Pretoria"}},
      {name:"Duplicate",website:"https://www.example.co.za/"}
    ]
  },{label:"electricians",city:"Pretoria"});
  assert.deepEqual(result.map(x=>x.normalized),["example.co.za"]);
});

test("Foursquare discovery sends the API key and requested website fields",async()=>{
  const {discoverFoursquare}=require("./discoveryProviders");
  const oldKey=process.env.FOURSQUARE_API_KEY;
  process.env.FOURSQUARE_API_KEY="test-key";
  let request;
  try {
    const result=await discoverFoursquare({
      queries:[{label:"electricians",city:"Pretoria"}],
      fetchImpl:async(url,options)=>{
        request={url,options};
        return {ok:true,status:200,async json(){return {results:[{name:"Example",website:"https://example.co.za"}]};}};
      }
    });
    assert.equal(result.candidateCount,1);
    assert.match(request.url,/near=Pretoria/);
    assert.match(request.url,/fields=name%2Cwebsite/);
    assert.equal(request.options.headers.Authorization,"test-key");
  } finally {
    if(oldKey===undefined) delete process.env.FOURSQUARE_API_KEY;
    else process.env.FOURSQUARE_API_KEY=oldKey;
  }
});

test("directory provider order includes the licensed Overture feed before local fallbacks",()=>{
  const {PROVIDER_ORDER}=require("./discoveryProviders");
  assert.deepEqual(PROVIDER_ORDER,["overture","pretoriaeast","ccbc","openstreetmap","websdocs"]);
});
test("Pretoria East associates direct website links with nested category profile identity",()=>{
  const {extractPretoriaEastCandidates}=require("./directoryDiscovery");
  const result=extractPretoriaEastCandidates(
    '<a href="/business-directory/restaurants/98-casa-bourguesa">Casa Bourguesa</a>'+
    '<a href="https://casabourguesa.co.za">Official website</a>'+
    '<div>City Pretoria</div>',
    5
  );
  assert.equal(result.linkedCandidates.length,1);
  assert.equal(result.linkedCandidates[0].name,"Casa Bourguesa");
  assert.equal(result.linkedCandidates[0].city,"Pretoria");
  assert.equal(result.linkedCandidates[0].normalized,"casabourguesa.co.za");
});

test("Pretoria East extracts nested category business profiles and their linked website",async()=>{
  const {discoverPretoriaEastCandidates}=require("./directoryDiscovery");
  const requested=[];
  const result=await discoverPretoriaEastCandidates(
    '<a href="/business-directory/restaurants/98-casa-bourguesa">Casa Bourguesa</a>',
    5,
    async url=>{
      requested.push(String(url));
      return{
        ok:true,status:200,
        async text(){
          return '<h1>Casa Bourguesa</h1><div>Listing Details</div><div>City Pretoria</div><div>Website</div><a href="/business-directory/restaurants/98-casa-bourguesa/visit">www.casabourguesa.co.za</a>';
        }
      };
    }
  );
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].normalized,"casabourguesa.co.za");
  assert.equal(result.candidates[0].name,"Casa Bourguesa");
  assert.equal(result.candidates[0].city,"Pretoria");
  assert.equal(requested.length,1);
  assert.equal(new URL(requested[0]).pathname,"/business-directory/restaurants/98-casa-bourguesa");
});

test("Pretoria East prioritizes business detail pages over page-wide plain-text domains",async()=>{
  const {discoverPretoriaEastCandidates}=require("./directoryDiscovery");
  const html=[
    '<a href="https://social.example.com">Social</a>',
    '<a href="https://directory-ad.example.com">Directory sponsor</a>',
    '<a href="https://footer.example.com">Footer</a>',
    '<a href="/component/mtree/company/fresh-business">Fresh Business profile</a>',
    ...Array.from({length:24},(_,i)=>'<div>repeated'+i+'.co.za</div>')
  ].join("");
  const result=await discoverPretoriaEastCandidates(html,20,async url=>({
    ok:true,status:200,
    async text(){return '<h1>Fresh Business</h1><a href="https://fresh-business.co.za">Website</a>';}
  }));
  assert.ok(result.candidates.some(candidate=>candidate.normalized==="fresh-business.co.za"));
  assert.ok(result.telemetry.detailPagesFetched>0);
});

test("Pretoria East extracts website domains rendered as plain listing text",()=>{
  const {extractPretoriaEastCandidates}=require("./directoryDiscovery");
  const result=extractPretoriaEastCandidates('<div>Core Digital</div><div>www.coredigital.co.za</div><div>Another business</div><div>another.co.za</div>',20);
  assert.deepEqual(result.candidates.map(x=>x.normalized),["coredigital.co.za","another.co.za"]);
});

test("Pretoria East extracts only external website links",()=>{
  const {extractPretoriaEastCandidates}=require("./directoryDiscovery");
  const result=extractPretoriaEastCandidates('<a href="/company/foo">Foo</a><a href="https://example.co.za">example.co.za</a><a href="https://www.example.co.za/about">duplicate</a>',20);
  assert.deepEqual(result.candidates.map(x=>x.normalized),["example.co.za"]);
});
test("CCBC extracts an external Website Link",()=>{
  const {extractCcbcWebsite}=require("./directoryDiscovery");
  const result=extractCcbcWebsite('<div>Website Link <a href="https://example.co.za/">example.co.za</a></div>','https://www.ccbc.co.za/business-directory-2/foo');
  assert.equal(result,"https://example.co.za/");
});

test("Pretoria East follows the current two-page public directory and profile routes",()=>{
  const {PRETORIA_EAST_PAGE_COUNT,extractPretoriaEastDetailLinks,discoverPretoriaEast}=require("./directoryDiscovery");
  assert.equal(PRETORIA_EAST_PAGE_COUNT,502);
  const links=extractPretoriaEastDetailLinks(
    '<a href="/business-directory/731-aluminium-flanges">Aluminium Flanges</a>'+
    '<a href="/business-directory/restaurants/98-casa-bourguesa">Casa Bourguesa</a>'+
    '<a href="/business-directory/page2">Next</a>'
  );
  assert.deepEqual(links.map(link=>new URL(link.href).pathname),[
    "/business-directory/731-aluminium-flanges",
    "/business-directory/restaurants/98-casa-bourguesa"
  ]);
  const requested=[];
  return discoverPretoriaEast({
    pageOffset:1,
    fetchImpl:async url=>{requested.push(String(url));return{ok:true,status:200,async text(){return "";}};}
  }).then(result=>{
    assert.equal(result.page,1);
    assert.equal(result.url,"https://www.pretoriaeast.co.za/business-directory/page2");
    assert.deepEqual(requested,[result.url]);
  });
});


test("Pretoria East category routes are discoverable independently from profile links",()=>{
  const {extractPretoriaEastCategoryLinks,PRETORIA_EAST_PAGE_COUNT}=require("./directoryDiscovery");
  const links=extractPretoriaEastCategoryLinks(
    '<a href="/business-directory">All listings</a>'+
    '<a href="/business-directory/building-and-decor">Building</a>'+
    '<a href="/business-directory/computers">Computers</a>'+
    '<a href="/business-directory/731-aluminium-flanges">Business profile</a>'+
    '<a href="/business-directory/page2">Page two</a>'
  );
  assert.equal(PRETORIA_EAST_PAGE_COUNT,502);
  assert.deepEqual(links.map(link=>new URL(link.href).pathname),[
    "/business-directory/building-and-decor",
    "/business-directory/computers"
  ]);
});
test("Pretoria East durable cursor follows its two live pages",async()=>{
  const {discoverWithProviders}=require("./discoveryProviders");
  const originalFetch=global.fetch;
  const requestedUrls=[];
  let recorded=null;
  global.fetch=async url=>{
    requestedUrls.push(String(url));
    return{ok:true,status:200,async text(){return '<h3><a href="/business-directory/731-fresh-pretoria-east">Fresh Pretoria East</a></h3><a href="https://fresh-pretoria-east.co.za">Official website</a><div>City <a>Pretoria</a></div><div>Page 2 of 2</div>';}};
  };
  try{
    const query={label:"electricians",city:"Pretoria"};
    const result=await discoverWithProviders({
      stage:{id:"pretoria_centurion",label:"Pretoria & Centurion",queries:[query]},
      queries:[query],
      providerOrder:["pretoriaeast"],
      isProviderAvailable:async()=>true,
      getProviderPageState:async(provider,count)=>{assert.equal(provider,"pretoriaeast");assert.equal(count,502);return{page:1};},
      recordProviderPageResult:async(provider,page,count)=>{recorded={provider,page,count};},
      filterFreshCandidates:async candidates=>candidates
    });
    assert.equal(result.candidateCount,1);
    assert.ok(requestedUrls.includes("https://www.pretoriaeast.co.za/business-directory/page2"));
    assert.ok(requestedUrls.includes("https://www.pretoriaeast.co.za/business-directory/731-fresh-pretoria-east"));
    assert.deepEqual(recorded,{provider:"pretoriaeast",page:1,count:502});
  }finally{
    global.fetch=originalFetch;
  }
});

test("WebsDocs uses its durable provider page cursor",async()=>{
  const {discoverWithProviders}=require("./discoveryProviders");
  const originalFetch=global.fetch;
  let requestedUrl="";
  let recorded=null;
  global.fetch=async url=>{
    requestedUrl=String(url);
    return{ok:true,status:200,async json(){return{results:[{name:"Fresh Example",website:"https://fresh-example.co.za"}],pagination:{hasNext:true}};}};
  };
  try{
    const query={label:"electricians",city:"Pretoria"};
    const result=await discoverWithProviders({
      stage:{id:"gauteng",label:"Gauteng",queries:[query]},
      queries:[query],
      providerOrder:["websdocs"],
      isProviderAvailable:async()=>true,
      getProviderPageState:async(provider,count)=>{assert.equal(provider,"websdocs");assert.equal(count,100);return{page:3};},
      recordProviderPageResult:async(provider,page,count)=>{recorded={provider,page,count};},
      filterFreshCandidates:async candidates=>candidates
    });
    assert.equal(result.candidateCount,1);
    assert.match(requestedUrl,/page=4/);
    assert.deepEqual(recorded,{provider:"websdocs",page:3,count:100});
  }finally{
    global.fetch=originalFetch;
  }
});

test("provider rotation keeps WebsDocs last",()=>{
  const {PRIMARY_DISCOVERY_PROVIDERS}=require("./discoveryProviders");
  assert.deepEqual(PRIMARY_DISCOVERY_PROVIDERS,["overture","pretoriaeast","ccbc","openstreetmap"]);
});

test("WebsDocs accepts nested data containers and official website fields",()=>{
  const result=extractWebsDocsCandidates({
    data:{businesses:[
      {name:"Nested",slug:"nested-business",officialWebsite:"https://nested.co.za"}
    ]}
  },{label:"electricians",city:"Pretoria"});
  assert.equal(result[0].normalized,"nested.co.za");
  assert.equal(result[0].slug,"nested-business");
});


test("free-directory provider page offsets stay bounded and advance by one page",()=>{
  const {providerPageOffsetForAttempt}=require("./discoveryProviders");
  assert.equal(providerPageOffsetForAttempt(0),0);
  assert.equal(providerPageOffsetForAttempt(1),20);
  assert.equal(providerPageOffsetForAttempt(2),40);
  assert.equal(providerPageOffsetForAttempt("3"),60);
  assert.equal(providerPageOffsetForAttempt(-5),0);
});

test("preparation rotation includes bounded free directory providers after proven sources",()=>{
  const {PREPARATION_PROVIDER_ORDER}=require("./discoveryProviders");
  assert.deepEqual(PREPARATION_PROVIDER_ORDER,[
    "overture","openstreetmap","mycityinfo","websdocs","pretoriahub","hotfrog","opendi","pretoriaeast","ccbc"
  ]);
  const {preparationProviderOrderForStage}=require("./discoveryProviders");
  assert.deepEqual(preparationProviderOrderForStage("pretoria_centurion").slice(0,3),
    ["overture","openstreetmap","mycityinfo"]);
  assert.deepEqual(preparationProviderOrderForStage("gauteng").slice(0,3),
    ["overture","mycityinfo","openstreetmap"]);
  assert.deepEqual(preparationProviderOrderForStage("south_africa").slice(0,3),
    ["mycityinfo","openstreetmap","websdocs"]);
});

test("legacy Pretoria East and CCBC directories are skipped outside the local stage",()=>{
  const {providerSupportsStage}=require("./discoveryProviders");
  assert.equal(providerSupportsStage("pretoriaeast",{id:"pretoria_centurion"}),true);
  assert.equal(providerSupportsStage("ccbc",{id:"pretoria_centurion"}),true);
  assert.equal(providerSupportsStage("pretoriaeast",{id:"gauteng"}),false);
  assert.equal(providerSupportsStage("ccbc",{id:"south_africa"}),false);
  assert.equal(providerSupportsStage("openstreetmap",{id:"gauteng"}),true);
});


test("production worker delegates reserve refill to scheduled preparation",()=>{
  const fs=require("node:fs");
  const path=require("node:path");
  const source=fs.readFileSync(path.join(__dirname,"../api/automation/run.js"),"utf8");
  assert.doesNotMatch(source,/refillQueueToReserve/);
  assert.match(source,/deferredToScheduledPreparation/);
});



test("provider orchestration uses full stage city pool and preserves provider diagnostics",()=>{
  const fs=require("node:fs");
  const path=require("node:path");
  const source=fs.readFileSync(path.join(__dirname,"discoveryProviders.js"),"utf8");
  assert.ok(source.includes("queries:Array.isArray(stage.queries) && stage.queries.length ? stage.queries : queries"));
  assert.ok(source.includes("filterCandidates:async candidates=>filterFreshCandidates(candidates,provider)"));
  assert.ok(source.includes("providerDiagnostics:result?.errors||[]"));
});

test("WebsDocs resets its durable cursor when the API explicitly reports no next page", async () => {
  const { discoverWithProviders } = require("./discoveryProviders");
  const originalFetch = global.fetch;
  let recorded = null;
  global.fetch = async () => ({
    ok: true, status: 200,
    async json() { return { results: [{ name: "Fresh End Page", website: "https://fresh-end-page.co.za" }], pagination: { hasNext: false } }; }
  });
  try {
    const query = { label: "electricians", city: "Pretoria" };
    const result = await discoverWithProviders({
      stage: { id: "gauteng", label: "Gauteng", queries: [query] },
      queries: [query], providerOrder: ["websdocs"],
      isProviderAvailable: async () => true,
      getProviderPageState: async () => ({ page: 3 }),
      recordProviderPageResult: async (provider, page, count) => { recorded = { provider, page, count }; },
      filterFreshCandidates: async candidates => candidates
    });
    assert.deepEqual(recorded, { provider: "websdocs", page: 3, count: 1 });
    assert.equal(result.attempts[0].queries[0].hasNext, false);
    assert.deepEqual(result.attempts[0].queries[0].responseKeys, ["results", "pagination"]);
  } finally { global.fetch = originalFetch; }
});

test("CCBC parses real category totals and reaches the tenth property page", async () => {
  const { discoverCcbc, parseCcbcPageCount } = require("./directoryDiscovery");
  assert.deepEqual(parseCcbcPageCount("<div>Results 1 - 20 of 193</div>"), { totalRecords: 193, pageCount: 10 });
  const requested = [];
  const result = await discoverCcbc({
    pageOffset: 56,
    fetchImpl: async url => {
      requested.push(String(url));
      return {
        ok: true, status: 200,
        async text() {
          return '<div>Results 181 - 193 of 193</div><a href="/business-directory-2/property-infrastructure/all/example">Example</a>';
        }
      };
    }
  });
  assert.equal(result.categoryPath, "property-infrastructure/all");
  assert.equal(result.page, 9);
  assert.equal(result.pageCount, 10);
  assert.ok(requested[0].includes("start=180"));
});

test("CCBC falls back to page one to learn the true page count when a stale cursor is out of range", async () => {
  const { discoverCcbc } = require("./directoryDiscovery");
  const requested = [];
  const result = await discoverCcbc({
    pageOffset: 54,
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).includes("start=180")) {
        return { ok: false, status: 404, async text() { return "Not found"; } };
      }
      return {
        ok: true, status: 200,
        async text() { return '<div>Results 1 - 20 of 30</div>'; }
      };
    }
  });
  assert.ok(requested.includes("https://www.ccbc.co.za/business-directory-2/automotive/all?start=180"));
  assert.ok(requested.includes("https://www.ccbc.co.za/business-directory-2/automotive/all?start=0"));
  assert.equal(result.pageCount, 2);
  assert.equal(result.page, 1);
});

test("WebsDocs does not infer business city or category from search parameters", () => {
  const result = extractWebsDocsCandidates({
    results: [
      { name: "Unverified result", website: "https://unverified.co.za" },
      { name: "Verified result", website: "https://verified.co.za", city: "Pretoria", category: "Electrical contractor" }
    ]
  }, { label: "electricians", city: "Centurion" });
  assert.equal(result[0].city, null);
  assert.equal(result[0].category, null);
  assert.equal(result[1].city, "Pretoria");
  assert.equal(result[1].category, "Electrical contractor");
});



test("candidate geographic region requires evidence-backed city metadata", () => {
  const { getCandidateRegion } = require("./discoveryProviders");
  assert.equal(getCandidateRegion({ city: "Pretoria" }), "gauteng");
  assert.equal(getCandidateRegion({ city: "South Africa" }, "gauteng"), "south_africa");
  assert.equal(getCandidateRegion({ city: null }, "pretoria_centurion"), null);
  assert.equal(getCandidateRegion({ region: "western_cape", city: null }, "pretoria_centurion"), "western_cape");
});

test("provider availability reports exhausted daily budgets instead of generic unavailable", async () => {
  const { discoverWithProviders, getDiscoveryStage } = require("./discoveryProviders");
  await assert.rejects(
    discoverWithProviders({
      maxCandidates: 1,
      stage: getDiscoveryStage("gauteng"),
      providerOrder: ["mycityinfo"],
      isProviderAvailable: async () => ({
        available: false,
        reason: "daily_budget_exhausted",
        details: { requestCount: 4, dailyLimit: 4 }
      })
    }),
    error => {
      assert.equal(error.attempts[0].status, "daily_budget_exhausted");
      assert.equal(error.attempts[0].requestCount, 4);
      assert.equal(error.attempts[0].dailyLimit, 4);
      return true;
    }
  );
});


test("preparation provider rotation includes Hotfrog and Opendi after core sources", () => {
  const { PREPARATION_PROVIDER_ORDER, preparationProviderOrderForStage } = require("./discoveryProviders");
  assert.ok(PREPARATION_PROVIDER_ORDER.includes("hotfrog"));
  assert.ok(PREPARATION_PROVIDER_ORDER.includes("opendi"));
  assert.deepEqual(preparationProviderOrderForStage("pretoria_centurion").slice(0, 4),
    ["overture", "openstreetmap", "mycityinfo", "pretoriaeast"]);
  assert.deepEqual(preparationProviderOrderForStage("gauteng").slice(0, 4),
    ["overture", "mycityinfo", "openstreetmap", "websdocs"]);
});


test("preparation provider start offset rotates every twenty minutes", () => {
  const { preparationProviderStartOffset } = require("./discoveryProviders");
  const first = preparationProviderStartOffset(0, 0);
  const next = preparationProviderStartOffset(0, 20 * 60 * 1000);
  const later = preparationProviderStartOffset(2, 20 * 60 * 1000);
  assert.equal(next, first + 1);
  assert.equal(later, next + 2);
});


test("provider rotation never skips the stage-specific core providers", async () => {
  const { discoverWithProviders, preparationProviderOrderForStage, coreProviderCountForStage } = require("./discoveryProviders");
  const stages = ["pretoria_centurion", "gauteng", "south_africa"];
  for (const stageId of stages) {
    const order = preparationProviderOrderForStage(stageId);
    const coreCount = coreProviderCountForStage(stageId);
    await assert.rejects(discoverWithProviders({
      stage: { id: stageId, label: stageId, queries: [] },
      queries: [],
      providerOrder: order,
      providerStartOffset: 3,
      isProviderAvailable: async () => ({ available: false, reason: "cooldown" })
    }), error => {
      const attempted = error.attempts.map(item => item.provider);
      assert.deepEqual(attempted.slice(0, coreCount), order.slice(0, coreCount));
      const fallback = order.slice(coreCount);
      const offset = 3 % fallback.length;
      assert.deepEqual(attempted.slice(coreCount), [...fallback.slice(offset), ...fallback.slice(0, offset)]);
      return true;
    });
  }
});


test("local provider candidate quotas preserve room for the rotating Pretoria East and CCBC slot", () => {
  const { providerCandidateLimitForStage, preparationProviderOrderForStage } = require("./discoveryProviders");
  const local = preparationProviderOrderForStage("pretoria_centurion");
  assert.equal(providerCandidateLimitForStage("pretoria_centurion", 0, local.length, 20), 7);
  assert.equal(providerCandidateLimitForStage("pretoria_centurion", 1, local.length, 20), 7);
  assert.equal(providerCandidateLimitForStage("pretoria_centurion", 2, local.length, 20), 7);
  assert.equal(providerCandidateLimitForStage("pretoria_centurion", 0, 2, 20), 10);
  assert.equal(providerCandidateLimitForStage("gauteng", 0, 8, 20), 7);
  assert.equal(providerCandidateLimitForStage("pretoria_centurion", 0, local.length, 45), 15);
  assert.equal(providerCandidateLimitForStage("gauteng", 0, 8, 45), 15);
});

test("local discovery pins OSM and MyCityInfo while rotating Pretoria sources",()=>{
  const {preparationProviderOrderForStage,rotateFallbackProviders,coreProviderCountForStage}=require("./discoveryProviders");
  const local=preparationProviderOrderForStage("pretoria_centurion");
  assert.equal(coreProviderCountForStage("pretoria_centurion"),2);
  for(let offset=0;offset<local.length;offset++){
    const ordered=rotateFallbackProviders(local,{id:"pretoria_centurion"},offset);
    assert.deepEqual(ordered.slice(0,2),["overture","openstreetmap"]);
    assert.ok(local.slice(2).includes(ordered[2]));
    assert.equal(new Set(ordered).size,local.length);
    assert.deepEqual([...ordered].sort(),[...local].sort());
  }
  const fallbacks=Array.from({length:local.length},(_,offset)=>
    rotateFallbackProviders(local,{id:"pretoria_centurion"},offset)[2]
  );
  for(const provider of ["pretoriaeast","ccbc","websdocs","pretoriahub","hotfrog","opendi"]){
    assert.ok(fallbacks.includes(provider),provider+" must receive a rotating slot");
  }
});

test("regional and national discovery pin MyCityInfo and OSM while rotating fallbacks",()=>{
  const {preparationProviderOrderForStage,rotateFallbackProviders,coreProviderCountForStage}=require("./discoveryProviders");
  for(const stageId of ["gauteng","south_africa"]){
    const order=preparationProviderOrderForStage(stageId);
    assert.equal(coreProviderCountForStage(stageId),2);
    assert.deepEqual(order.slice(0,2),stageId === "gauteng" ? ["overture","mycityinfo"] : ["mycityinfo","openstreetmap"]);
    for(let offset=0;offset<order.length;offset++){
      const rotated=rotateFallbackProviders(order,{id:stageId},offset);
      assert.deepEqual(rotated.slice(0,2),stageId === "gauteng" ? ["overture","mycityinfo"] : ["mycityinfo","openstreetmap"]);
      assert.equal(new Set(rotated).size,order.length);
      assert.deepEqual([...rotated].sort(),[...order].sort());
    }
  }
});


test("discovery preparation retains the pre-production and daytime schedule without worker-trigger duplication",()=>{
  const fs=require("node:fs");
  const path=require("node:path");
  const workflow=fs.readFileSync(path.join(__dirname,"../.github/workflows/discovery-preparation.yml"),"utf8");
  for (const cron of [
    "40 5 * * *",
    "15,35,55 6-21 * * *",
    "15,35,55 22-23 * * *",
    "15,35 0 * * *",
    "55 0 * * *",
    "15,35,55 1-3 * * *",
    "15 4 * * *",
    "35 4 * * *"
  ]) assert.ok(workflow.includes('cron: "' + cron + '"'), "missing schedule: " + cron);
  assert.match(workflow, /STRICT_READINESS:.*35 4/);
  assert.doesNotMatch(workflow,/workflow_run:/);
  assert.ok(!workflow.includes('cron: "*/20 * * * *"'));
});


test("discovery preparation cron covers preproduction and the full SAST scan window",()=>{
  const fs=require("node:fs");
  const path=require("node:path");
  const workflow=fs.readFileSync(path.join(__dirname,"../.github/workflows/discovery-preparation.yml"),"utf8");
  const schedules=workflow.split(String.fromCharCode(10)).filter(line=>line.includes("cron:")).map(line=>line.slice(line.indexOf("cron:")+5).trim().replaceAll('"',""));
  assert.ok(schedules.includes("15,35,55 22-23 * * *"),"preparation must cover the early SAST reserve window");
  assert.ok(schedules.includes("15,35 0 * * *"),"the early SAST preparation cadence must remain at :15 and :35");
  assert.ok(schedules.includes("55 0 * * *"),"strict reserve readiness must run at 02:55 SAST before batch 1");
  assert.ok(schedules.includes("15,35,55 1-3 * * *"),"preparation must continue every 20 minutes through 05:55 SAST");
  assert.ok(schedules.includes("15 4 * * *"),"the 06:15 SAST preparation slot must remain");
  assert.ok(schedules.includes("35 4 * * *"),"strict reserve readiness must run at 06:35 SAST before batch 12");
  assert.ok(schedules.includes("15,35,55 6-21 * * *"),"daytime discovery cadence must be preserved");
  assert.ok(schedules.includes("40 5 * * *"),"existing 07:40 SAST recovery trigger must be preserved");
  assert.ok(!workflow.includes("workflow_run:"),"preparation must not trigger on every worker completion");
  // UTC 00:55 is 02:55 SAST, ahead of batch 1 at 03:05.
  // UTC 04:35 is 06:35 SAST, ahead of batch 12 at 06:45.
  const firstLocalMinute=55+120;
  const lastLocalMinute=4*60+35+120;
  assert.ok(firstLocalMinute<3*60+5,"preproduction begins before batch 1");
  assert.ok(lastLocalMinute<6*60+45,"last scheduled preparation slot precedes batch 12");
});

test("Pretoria East candidates carry source-backed Pretoria and Gauteng attribution", async () => {
  const { discoverPretoriaEast } = require("./directoryDiscovery");
  const result = await discoverPretoriaEast({
    maxCandidates: 5,
    pageOffset: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return '<div>Results 1 - 20 of 25</div><h3><a href="/business-directory/731-fresh-business">Fresh Business</a></h3><a href="https://fresh-business.co.za">Official website</a><p>Established local company</p><div>City <a href="/city/pretoria">Pretoria</a></div><div>Page 1 of 2</div><footer><a href="https://footer-vendor.co.za">Supplier network</a></footer>';
      }
    })
  });
  assert.ok(result.candidates.length > 0);
  assert.equal(result.candidates[0].city, "Pretoria");
  assert.equal(result.candidates[0].region, "gauteng");
  const footerCandidate = result.candidates.find(candidate => candidate.website.includes("footer-vendor.co.za"));
  assert.equal(footerCandidate, undefined);
  assert.equal(result.telemetry.plainTextCandidatesExcluded, 0);
  assert.equal(result.telemetry.unlinkedExternalLinksExcluded, 1);
});


test("Overpass 406 advances the durable endpoint cursor without endpoint fan-out", async () => {
  const { discoverWithProviders } = require("./discoveryProviders");
  const { OVERPASS_URLS } = require("./prospectDiscovery");
  const originalFetch = global.fetch;
  const calls = [];
  const recorded = [];
  global.fetch = async url => {
    calls.push(String(url));
    return {
      ok: false,
      status: 406,
      headers: { get: () => null },
      async json() { return { remark: "rate limited" }; }
    };
  };
  try {
    await assert.rejects(discoverWithProviders({
      stage: {
        id: "pretoria_centurion",
        label: "Pretoria & Centurion",
        queries: [{ label: "accountants", city: "Pretoria" }]
      },
      queries: [{ label: "accountants", city: "Pretoria" }],
      providerOrder: ["openstreetmap"],
      isProviderAvailable: async () => true,
      getProviderPageState: async (provider, count) => {
        assert.equal(provider, "openstreetmap");
        assert.equal(count, OVERPASS_URLS.length);
        return { page: 1 };
      },
      recordProviderPageResult: async (provider, page, count) => {
        recorded.push({ provider, page, count });
      }
    }), /No configured discovery provider returned usable website candidates/);
    assert.deepEqual(calls, [OVERPASS_URLS[1]]);
    assert.deepEqual(recorded, [{
      provider: "openstreetmap",
      page: 1,
      count: OVERPASS_URLS.length
    }]);
  } finally {
    global.fetch = originalFetch;
  }
});


test("Pretoria East page-wide text-only domains never become prospect candidates", async () => {
  const { discoverPretoriaEastCandidates } = require("./directoryDiscovery");
  const result = await discoverPretoriaEastCandidates(
    '<p>Supplier website: https://footer-supplier.co.za</p><p>Navigation: www.navigation-domain.co.za</p>',
    10,
    async () => { throw new Error("No profile pages should be requested without listing links."); }
  );
  assert.deepEqual(result.candidates, []);
  assert.equal(result.telemetry.plainTextCandidatesExcluded, 2);
});


test("discovery preparation reports real supply counts and fails on critical reserve", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/discovery-preparation.yml"), "utf8");
  assert.match(workflow, /jq -e '\.success == true/);
  assert.match(workflow, /New backlog records: \$discovered/);
  assert.match(workflow, /Newly promoted queue items: \$promoted/);
  assert.match(workflow, /queue_depth.*-lt 60/);
  assert.match(workflow, /expected 110/);
  assert.match(workflow, /DISCOVERY_RESERVE:/);
});


test("Pretoria East rotates through category pagination using live listing totals", async () => {
  const { discoverPretoriaEast } = require("./directoryDiscovery");
  const requested = [];
  const result = await discoverPretoriaEast({
    maxCandidates: 5,
    pageOffset: 3,
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).endsWith("/business-directory")) {
        return {
          ok: true, status: 200,
          async text() {
            return [
              '<a href="/business-directory/business-and-finance">Business and Finance (54)</a>',
              '<a href="/business-directory/building-and-decor">Building and Decor (161)</a>'
            ].join("");
          }
        };
      }
      if (String(url).endsWith("/business-and-finance")) {
        return {
          ok: true, status: 200,
          async text() { return "<div>Page 1 of 3</div>"; }
        };
      }
      return {
        ok: true, status: 200,
        async text() {
          return '<h3><a href="/business-directory/732-category-page-two">Category Page Two Business</a></h3><a href="https://category-page-two.co.za">Official website</a><div>City <a>Pretoria</a></div><div>Page 2 of 3</div>';
        }
      };
    }
  });
  assert.deepEqual(requested, [
    "https://www.pretoriaeast.co.za/business-directory",
    "https://www.pretoriaeast.co.za/business-directory/business-and-finance",
    "https://www.pretoriaeast.co.za/business-directory/business-and-finance/page2",
    "https://www.pretoriaeast.co.za/business-directory/732-category-page-two"
  ]);
  assert.equal(result.page, 3);
  assert.equal(result.pageCount, 14);
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].city, "Pretoria");
  assert.equal(result.candidates[0].region, "gauteng");
});


test("Pretoria East does not treat a website domain as the business name", () => {
  const { extractPretoriaEastCandidates } = require("./directoryDiscovery");
  const result = extractPretoriaEastCandidates(
    '<a href="https://www.domain-as-name.co.za">www.domain-as-name.co.za</a>',
    5
  );
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].name, null);
});


test("worker summaries expose fresh reserve depth and critical queue health", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/automation-worker.yml"), "utf8");
  assert.match(workflow, /pipelineReport\.freshBeforeRun/);
  assert.match(workflow, /pipelineReport\.queueHealth/);
  assert.match(workflow, /Fresh reserve: \$fresh_before before \/ \$fresh_after after/);
  assert.match(workflow, /critical fresh reserve/);
  assert.match(workflow, /Successful scans: \$scanned/);
});


test("provider discovery enforces an HTTP request cap rather than only an invocation cap", async () => {
  const { discoverWithProviders } = require("./discoveryProviders");
  let calls = 0;
  await assert.rejects(discoverWithProviders({
    stage: { id: "gauteng", label: "Gauteng", queries: [
      { label: "electricians", city: "Pretoria" },
      { label: "plumbers", city: "Centurion" },
      { label: "accountants", city: "Johannesburg" }
    ] },
    queries: [
      { label: "electricians", city: "Pretoria" },
      { label: "plumbers", city: "Centurion" },
      { label: "accountants", city: "Johannesburg" }
    ],
    providerOrder: ["websdocs"],
    maxHttpRequests: 5,
    maxHttpRequestsPerProvider: 1,
    isProviderAvailable: async () => true,
    fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200, async json() { return { results: [] }; } };
    }
  }), error => {
    assert.equal(error.httpRequests.length, 1);
    assert.equal(error.httpRequests[0].status, 200);
    return true;
  });
  assert.equal(calls, 1);
});


test("HTTP request budgets are clamped and reject excess provider requests before fetch", async () => {
  const { discoverWithProviders } = require("./discoveryProviders");
  let calls = 0;
  await assert.rejects(discoverWithProviders({
    stage: { id: "gauteng", label: "Gauteng", queries: [
      { label: "one", city: "Pretoria" },
      { label: "two", city: "Centurion" }
    ] },
    queries: [
      { label: "one", city: "Pretoria" },
      { label: "two", city: "Centurion" }
    ],
    providerOrder: ["websdocs"],
    maxHttpRequests: 1,
    maxHttpRequestsPerProvider: 1,
    isProviderAvailable: async () => true,
    fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200, async json() { return { results: [] }; } };
    }
  }), error => error.httpRequests.length === 1);
  assert.equal(calls, 1);
});


test("Pretoria East current listing-card layout extracts business name, website and locality", async () => {
  const { discoverPretoriaEastCandidates, discoverPretoriaEast } = require("./directoryDiscovery");
  const html = [
    '<h3><a href="/business-directory/731-aluminium-flanges">Aluminium Flanges</a></h3>',
    '<a href="https://aluminiumflanges.co.za">aluminiumflanges.co.za</a>',
    '<p>Aluminium Flanges: local supplier.</p>',
    '<div>City<a href="/city/derdepoort">Derdepoort</a>, <a href="/city/pretoria">Pretoria</a></div>',
    '<p>Postcode 0186</p>',
    '<h3><a href="/business-directory/732-air-service-centre">Air Service Centre</a></h3>',
    '<a href="https://www.airservicecentre.co.za">www.airservicecentre.co.za</a>',
    '<div>City<a href="/city/pretoria">Pretoria</a></div>'
  ].join("");
  const extracted = await discoverPretoriaEastCandidates(html, 5, async () => ({
    ok: true, status: 200, async text() { return ""; }
  }));
  assert.equal(extracted.candidates.length, 2);
  assert.equal(extracted.candidates[0].name, "Aluminium Flanges");
  assert.equal(extracted.candidates[0].city, "Derdepoort");
  const result = await discoverPretoriaEast({
    maxCandidates: 5,
    fetchImpl: async () => ({ ok: true, status: 200, async text() { return html; } })
  });
  assert.equal(result.candidates[0].region, "gauteng");
  assert.equal(result.candidates[0].locationEvidence, "pretoria_east_directory_listing");
});


test("daily HTTP budget exhaustion prevents outbound fetch and does not create provider cooldown", async () => {
  const { discoverWithProviders } = require("./discoveryProviders");
  let calls = 0;
  await assert.rejects(discoverWithProviders({
    stage: { id: "gauteng", label: "Gauteng", queries: [{ label: "electricians", city: "Pretoria" }] },
    queries: [{ label: "electricians", city: "Pretoria" }],
    providerOrder: ["websdocs"],
    isProviderAvailable: async () => true,
    reserveHttpRequest: async () => false,
    recordFailure: async () => { throw new Error("budget exhaustion must not create cooldown"); },
    fetchImpl: async () => { calls++; throw new Error("must not fetch"); }
  }), error => {
    assert.equal(error.attempts[0].status, "daily_http_budget_exhausted");
    return true;
  });
  assert.equal(calls, 0);
});


test("provider reports swallowed nested HTTP budget exhaustion without applying upstream cooldown", async () => {
  const { discoverWithProviders } = require("./discoveryProviders");
  let calls = 0;
  let failureRecorded = false;
  await assert.rejects(discoverWithProviders({
    stage: { id: "pretoria_centurion", label: "Pretoria/Centurion", queries: [{ label: "electricians", city: "Pretoria" }] },
    queries: [{ label: "electricians", city: "Pretoria" }],
    providerOrder: ["hotfrog"],
    maxHttpRequests: 5,
    maxHttpRequestsPerProvider: 1,
    isProviderAvailable: async () => true,
    recordFailure: async () => { failureRecorded = true; },
    fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200, async text() { return '<a href="/company/example-electricians">Example Electricians</a>'; } };
    }
  }), error => {
    assert.equal(error.attempts[0].httpRequestBudgetExhausted, true);
    assert.equal(error.attempts[0].httpRequestBudgetReason, "per_attempt_or_provider_cap");
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(failureRecorded, false);
});


test("Overture is a core Gauteng source and is not used for national stages", () => {
  const {
    providerSupportsStage,
    preparationProviderOrderForStage
  } = require("./discoveryProviders");
  assert.equal(providerSupportsStage("overture", "pretoria_centurion"), true);
  assert.equal(providerSupportsStage("overture", "gauteng"), true);
  assert.equal(providerSupportsStage("overture", "south_africa"), false);
  assert.deepEqual(preparationProviderOrderForStage("pretoria_centurion").slice(0, 2), ["overture", "openstreetmap"]);
  assert.deepEqual(preparationProviderOrderForStage("gauteng").slice(0, 2), ["overture", "mycityinfo"]);
});

test("discovery pipeline consumes bounded Overture rows and persists the exact next row cursor", async () => {
  const { gzipSync } = require("node:zlib");
  const { discoverWithProviders } = require("./discoveryProviders");
  const rows = [
    { source: "overture_maps", website: "https://one.co.za", name: "One", city: "Pretoria", region: "Gauteng", stage_group: "gauteng", confidence: 0.9, locationEvidence: { provider: "overture_maps", country: "ZA", region_code: "ZA-GP", sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }] } },
    { source: "overture_maps", website: "https://two.co.za", name: "Two", city: "Centurion", region: "Gauteng", stage_group: "gauteng", confidence: 0.9, locationEvidence: { provider: "overture_maps", country: "ZA", region_code: "ZA-GP", sources: [{ dataset: "alltheplaces", license: "CC0-1.0" }] } },
    { source: "overture_maps", website: "https://three.co.za", name: "Three", city: "Johannesburg", region: "Gauteng", stage_group: "gauteng", confidence: 0.9, locationEvidence: { provider: "overture_maps", country: "ZA", region_code: "ZA-GP", sources: [{ dataset: "microsoft", license: "CDLA-Permissive-2.0" }] } }
  ];
  const body = gzipSync(Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + "\n"));
  let recorded = null;
  const result = await discoverWithProviders({
    stage: { id: "gauteng", label: "Gauteng", queries: [] },
    queries: [],
    maxCandidates: 2,
    providerOrder: ["overture"],
    isProviderAvailable: async () => true,
    reserveHttpRequest: async () => true,
    getProviderPageState: async (provider, pageCount) => {
      assert.equal(provider, "overture");
      assert.equal(pageCount, 1000000);
      return { page: 0 };
    },
    recordProviderPageResult: async (provider, page, pageCount) => {
      recorded = { provider, page, pageCount };
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      async arrayBuffer() { return body; }
    })
  });
  assert.deepEqual(result.candidates.map(item => item.name), ["One", "Two"]);
  assert.equal(recorded.provider, "overture");
  assert.equal(recorded.page, 1);
  assert.equal(recorded.pageCount, 3);
});
