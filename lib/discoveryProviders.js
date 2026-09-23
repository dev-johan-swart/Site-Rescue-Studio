const { discoverWebsites: discoverOpenStreetMap } = require("./prospectDiscovery");

const WEBS_DOCS_URL = "https://directory.websdocs.com/api/directory";
const PROVIDER_ORDER = ["openstreetmap", "websdocs"];

const LOCAL_QUERIES = [
  ["auto repair shops","Pretoria"],["electricians","Pretoria"],["security companies","Pretoria"],["accountants","Pretoria"],["property businesses","Pretoria"],["guesthouses","Pretoria"],["salons","Pretoria"],
  ["auto repair shops","Centurion"],["electricians","Centurion"],["security companies","Centurion"],["accountants","Centurion"],["property businesses","Centurion"],["guesthouses","Centurion"],["salons","Centurion"]
].map(([label,city])=>({label,city}));

const GAUTENG_QUERIES = [
  "Johannesburg","Midrand","Sandton","Randburg","Roodepoort","Krugersdorp","Kempton Park","Benoni","Boksburg","Germiston","Springs","Vanderbijlpark","Vereeniging"
].flatMap(city => [
  ["auto repair shops",city],["electricians",city],["security companies",city],["accountants",city],
  ["property businesses",city],["guesthouses",city],["salons",city]
]).map(([label,city])=>({label,city}));

const SOUTH_AFRICA_QUERIES = [
  "Bloemfontein","Cape Town","Durban","East London","Gqeberha","Mbombela","Polokwane","Kimberley","Pietermaritzburg","Rustenburg","George","Nelspruit"
].flatMap(city => [
  ["auto repair shops",city],["electricians",city],["security companies",city],["accountants",city],
  ["property businesses",city],["guesthouses",city],["salons",city]
]).map(([label,city])=>({label,city}));

const DISCOVERY_STAGES = [
  { id:"pretoria_centurion", label:"Pretoria & Centurion", queries:LOCAL_QUERIES },
  { id:"gauteng", label:"Gauteng", queries:GAUTENG_QUERIES },
  { id:"south_africa", label:"South Africa", queries:SOUTH_AFRICA_QUERIES },
  { id:"international", label:"International", queries:[] }
];

function getDiscoveryStage(stageId = process.env.AUTOMATION_DISCOVERY_STAGE || "pretoria_centurion") {
  return DISCOVERY_STAGES.find(stage => stage.id === stageId) || DISCOVERY_STAGES[0];
}

function providerQueries(date=new Date(), queries=getDiscoveryStage().queries){
  const source = Array.isArray(queries) && queries.length ? queries : LOCAL_QUERIES;
  const requested = Number(process.env.AUTOMATION_DISCOVERY_QUERY_COUNT||2);
  const count = Math.max(1,Math.min(Number.isFinite(requested)?Math.floor(requested):2,4,source.length));
  const start = Math.floor(date.getTime()/86400000)%source.length;
  return Array.from({length:count},(_,i)=>source[(start+i)%source.length]);
}

function hostOf(value){
  try{return new URL(value).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}
}

function extractWebsDocsCandidates(payload,query){
  const rows=Array.isArray(payload?.results)?payload.results:Array.isArray(payload?.listings)?payload.listings:Array.isArray(payload?.items)?payload.items:[];
  const seen=new Set();
  return rows.map(row=>{
    const website=row?.website||row?.websiteUrl||row?.url||row?.domain||"";
    const normalized=hostOf(website);
    if(!normalized||seen.has(normalized))return null;
    seen.add(normalized);
    return {
      website,normalized,
      name:String(row?.name||row?.businessName||"").trim()||null,
      city:query.city,category:query.label
    };
  }).filter(Boolean);
}

async function discoverWebsDocs({queries=providerQueries(),maxCandidates=20,fetchImpl=fetch}={}){
  const candidates=[],seen=new Set(),queryResults=[];
  const limit=Math.max(1,Math.min(Number(maxCandidates)||20,40));
  for(const query of queries){
    if(candidates.length>=limit)break;
    const params=new URLSearchParams({q:query.label,country:"ZA",city:query.city,limit:String(Math.min(20,limit-candidates.length))});
    const response=await fetchImpl(WEBS_DOCS_URL+"?"+params.toString(),{
      method:"GET",headers:{Accept:"application/json","User-Agent":"Site Rescue Studio Prospect Discovery/1.0"}
    });
    let payload=null; try{payload=await response.json();}catch{}
    if(!response.ok){const error=new Error(payload?.message||`WebsDocs discovery returned HTTP ${response.status}.`);error.status=response.status;throw error;}
    const found=extractWebsDocsCandidates(payload,query);
    let added=0;
    for(const candidate of found){
      if(seen.has(candidate.normalized))continue;
      seen.add(candidate.normalized);candidates.push(candidate);added++;
      if(candidates.length>=limit)break;
    }
    queryResults.push({query:query.label,city:query.city,websiteCandidatesAdded:added});
  }
  return {source:"websdocs",candidates,queries:queryResults,candidateCount:candidates.length};
}

async function discoverWithProviders({
  maxCandidates=20,
  queries=providerQueries(),
  stage=getDiscoveryStage(),
  isProviderAvailable=async()=>true,
  recordSuccess=async()=>{},
  recordFailure=async()=>{}
}={}){
  const errors=[];
  const allowInternational=String(process.env.AUTOMATION_ENABLE_INTERNATIONAL_DISCOVERY||"").toLowerCase()==="true";
  if(stage.id==="international"&&!allowInternational){
    const error=new Error("International discovery is staged but disabled. Business and pricing review is required before activation.");
    error.code="INTERNATIONAL_DISCOVERY_DISABLED";
    throw error;
  }

  for(const provider of PROVIDER_ORDER){
    if(!(await isProviderAvailable(provider)))continue;
    try{
      const result=provider==="openstreetmap"
        ? await discoverOpenStreetMap({maxCandidates,queries})
        : await discoverWebsDocs({maxCandidates,queries});
      await recordSuccess(provider);
      return {...result,provider,failoverUsed:provider!==PROVIDER_ORDER[0],errors,stage:stage.id,stageLabel:stage.label};
    }catch(error){
      errors.push({provider,message:String(error?.message||error),status:error?.status||null});
      await recordFailure(provider,error);
    }
  }
  const error=new Error("All configured discovery providers are unavailable.");
  error.providerErrors=errors;
  throw error;
}

module.exports={
  WEBS_DOCS_URL,PROVIDER_ORDER,LOCAL_QUERIES,GAUTENG_QUERIES,SOUTH_AFRICA_QUERIES,DISCOVERY_STAGES,
  getDiscoveryStage,providerQueries,extractWebsDocsCandidates,discoverWebsDocs,discoverWithProviders
};
