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
  assert.deepEqual(PROVIDER_ORDER,["openstreetmap","pretoriaeast","ccbc","foursquare","websdocs"]);
});
test("Pretoria East extracts only external website links",()=>{
  const {extractPretoriaEastCandidates}=require("./directoryDiscovery");
  const result=extractPretoriaEastCandidates('<a href="/company/foo">Foo</a><a href="https://example.co.za">example.co.za</a><a href="https://www.example.co.za/about">duplicate</a>',20);
  assert.deepEqual(result.map(x=>x.normalized),["example.co.za"]);
});
test("CCBC extracts an external Website Link",()=>{
  const {extractCcbcWebsite}=require("./directoryDiscovery");
  const result=extractCcbcWebsite('<div>Website Link <a href="https://example.co.za/">example.co.za</a></div>','https://www.ccbc.co.za/business-directory-2/foo');
  assert.equal(result,"https://example.co.za/");
});
