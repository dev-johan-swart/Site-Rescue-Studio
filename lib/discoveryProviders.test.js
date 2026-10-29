const test=require("node:test");const assert=require("node:assert/strict");const{extractWebsDocsCandidates,discoverWebsDocs}=require("./discoveryProviders");
test("WebsDocs candidates extract and deduplicate public website hosts",()=>{const result=extractWebsDocsCandidates({results:[{name:"One",website:"https://www.one.co.za/"},{name:"One",website:"https://one.co.za/contact"},{name:"Two",websiteUrl:"https://two.co.za/"}]},{label:"electricians",city:"Pretoria"});assert.deepEqual(result.map(x=>x.normalized),["one.co.za","two.co.za"]);});
test("WebsDocs discovery uses the public no-key endpoint",async()=>{let request;const result=await discoverWebsDocs({queries:[{label:"electricians",city:"Pretoria"}],fetchImpl:async(url,options)=>{request={url,options};return{ok:true,status:200,async json(){return{results:[{name:"Example",website:"https://example.co.za"}]};}};}});assert.equal(result.candidateCount,1);assert.match(request.url,/country=ZA/);assert.match(request.url,/city=Pretoria/);assert.equal(request.options.headers.Accept,"application/json");});
test("discovery stages rotate from Pretoria/Centurion through Gauteng and South Africa",()=>{
  const {DISCOVERY_STAGES,getDiscoveryStage,providerQueries}=require("./discoveryProviders");
  assert.deepEqual(DISCOVERY_STAGES.map(stage=>stage.id),["pretoria_centurion","gauteng","south_africa","international"]);
  assert.equal(getDiscoveryStage("gauteng").label,"Gauteng");
  assert.equal(providerQueries(new Date("2026-09-23T00:00:00Z"),getDiscoveryStage("gauteng").queries).length,2);
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

test("directory provider order keeps proven OSM first",()=>{
  const {PROVIDER_ORDER}=require("./discoveryProviders");
  assert.deepEqual(PROVIDER_ORDER,["pretoriaeast","ccbc","openstreetmap","foursquare","websdocs"]);
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

test("Pretoria East covers the published paginated city directory",()=>{ const {PRETORIA_EAST_PAGE_COUNT}=require("./directoryDiscovery"); assert.equal(PRETORIA_EAST_PAGE_COUNT,29); });

test("provider rotation keeps WebsDocs last",()=>{
  const {PRIMARY_DISCOVERY_PROVIDERS}=require("./discoveryProviders");
  assert.deepEqual(PRIMARY_DISCOVERY_PROVIDERS,["pretoriaeast","ccbc","openstreetmap"]);
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
    "pretoriaeast","ccbc","openstreetmap","mycityinfo","pretoriahub","websdocs"
  ]);
});

test("legacy Pretoria East and CCBC directories are skipped outside the local stage",()=>{
  const {providerSupportsStage}=require("./discoveryProviders");
  assert.equal(providerSupportsStage("pretoriaeast",{id:"pretoria_centurion"}),true);
  assert.equal(providerSupportsStage("ccbc",{id:"pretoria_centurion"}),true);
  assert.equal(providerSupportsStage("pretoriaeast",{id:"gauteng"}),false);
  assert.equal(providerSupportsStage("ccbc",{id:"south_africa"}),false);
  assert.equal(providerSupportsStage("openstreetmap",{id:"gauteng"}),true);
});


test("production refill passes Neon freshness filter into provider failover",()=>{
  const fs=require("node:fs");
  const path=require("node:path");
  const source=fs.readFileSync(path.join(__dirname,"../api/automation/run.js"),"utf8");
  const start=source.indexOf("async function refillQueueToReserve()");
  const end=source.indexOf("The 02:00/02:20/02:40 preparation workflow",start);
  assert.ok(start>=0,"production refill function should exist");
  assert.ok(end>start,"production refill function boundary should exist");
  const refillSource=source.slice(start,end);
  assert.match(refillSource,/filterFreshCandidates:\s*async candidates\s*=>\s*filterFreshDiscoveryCandidates\(sql,\s*candidates\)/);
});


test("provider orchestration uses full stage city pool and preserves provider diagnostics",()=>{
  const fs=require("node:fs");
  const path=require("node:path");
  const source=fs.readFileSync(path.join(__dirname,"discoveryProviders.js"),"utf8");
  assert.ok(source.includes("queries:Array.isArray(stage.queries) && stage.queries.length ? stage.queries : queries"));
  assert.ok(source.includes("filterCandidates:async candidates=>filterFreshCandidates(candidates,provider)"));
  assert.ok(source.includes("providerDiagnostics:result?.errors||[]"));
});
