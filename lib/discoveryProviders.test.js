const test=require("node:test");const assert=require("node:assert/strict");const{extractWebsDocsCandidates,discoverWebsDocs}=require("./discoveryProviders");
test("WebsDocs candidates extract and deduplicate public website hosts",()=>{const result=extractWebsDocsCandidates({results:[{name:"One",website:"https://www.one.co.za/"},{name:"One",website:"https://one.co.za/contact"},{name:"Two",websiteUrl:"https://two.co.za/"}]},{label:"electricians",city:"Pretoria"});assert.deepEqual(result.map(x=>x.normalized),["one.co.za","two.co.za"]);});
test("WebsDocs discovery uses the public no-key endpoint",async()=>{let request;const result=await discoverWebsDocs({queries:[{label:"electricians",city:"Pretoria"}],fetchImpl:async(url,options)=>{request={url,options};return{ok:true,status:200,async json(){return{results:[{name:"Example",website:"https://example.co.za"}]};}};}});assert.equal(result.candidateCount,1);assert.match(request.url,/country=ZA/);assert.match(request.url,/city=Pretoria/);assert.equal(request.options.headers.Accept,"application/json");});
test("discovery stages rotate from Pretoria/Centurion through Gauteng and South Africa",()=>{
  const {DISCOVERY_STAGES,getDiscoveryStage,providerQueries}=require("./discoveryProviders");
  assert.deepEqual(DISCOVERY_STAGES.map(stage=>stage.id),["pretoria_centurion","gauteng","south_africa","international"]);
  assert.equal(getDiscoveryStage("gauteng").label,"Gauteng");
  assert.equal(providerQueries(new Date("2026-09-23T00:00:00Z"),getDiscoveryStage("gauteng").queries).length,2);
});
