const { discoverWebsites: discoverOpenStreetMap } = require("./prospectDiscovery");
const { cleanWebsiteUrl, normalizeWebsite } = require("./discoveryUrl");
const { discoverPretoriaEast, discoverCcbc } = require("./directoryDiscovery");

const WEBS_DOCS_URL = "https://directory.websdocs.com/api/directory";
const PROVIDER_ORDER = ["pretoriaeast", "ccbc", "openstreetmap", "foursquare", "websdocs"];
const PRIMARY_DISCOVERY_PROVIDERS = ["pretoriaeast", "ccbc", "openstreetmap"];

const DISCOVERY_CATEGORY_QUERIES = [
  "auto repair shops",
  "electricians",
  "security companies",
  "accountants",
  "property businesses",
  "guesthouses",
  "salons",
  "plumbers",
  "builders and contractors",
  "cleaning companies",
  "IT companies",
  "marketing agencies",
  "law firms",
  "medical practices",
  "dental practices",
  "veterinarians",
  "gyms and fitness",
  "photographers",
  "restaurants",
  "takeaways",
  "cafes",
  "bakeries",
  "catering companies",
  "food delivery",
  "online ordering",
  "ecommerce",
  "online shops",
  "retail stores",
  "clothing stores",
  "furniture stores",
  "electronics stores",
  "florists",
  "gift shops",
  "beauty and wellness"
];

const LOCAL_QUERIES = [
  ...DISCOVERY_CATEGORY_QUERIES.flatMap(label => [[label,"Pretoria"],[label,"Centurion"]])
].map(([label,city])=>({label,city}));

const GAUTENG_QUERIES = [
  "Johannesburg","Midrand","Sandton","Randburg","Roodepoort","Krugersdorp","Kempton Park","Benoni","Boksburg","Germiston","Springs","Vanderbijlpark","Vereeniging"
].flatMap(city => DISCOVERY_CATEGORY_QUERIES.map(label => [label,city]))
  .map(([label,city])=>({label,city}));

const FOURSQUARE_URL = "https://places-api.foursquare.com/places/search";
const FOURSQUARE_API_VERSION = "2025-06-17";
const FOURSQUARE_MONTHLY_LIMIT = 500;

const DISCOVERY_REQUEST_TIMEOUT_MS = 35000;

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_REQUEST_TIMEOUT_MS);
  try { return await fetchImpl(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function extractFoursquareCandidates(payload, query) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  const seen = new Set();
  return rows.map(row => {
    const website = cleanWebsiteUrl(row?.website || row?.websiteUrl || "");
    const normalized = normalizeWebsite(website);
    if (!normalized || seen.has(normalized)) return null;
    seen.add(normalized);
    return {
      website,
      normalized,
      name: String(row?.name || "").trim() || null,
      city: query.city,
      category: query.label
    };
  }).filter(Boolean);
}

async function discoverFoursquare({ queries = providerQueries(), maxCandidates = 20, fetchImpl = fetch } = {}) {
  const apiKey = String(process.env.FOURSQUARE_API_KEY || "").trim();
  if (!apiKey) throw new Error("Foursquare discovery is not configured (FOURSQUARE_API_KEY missing).");
  const candidates = [];
  const seen = new Set();
  const limit = Math.max(1, Math.min(Number(maxCandidates) || 20, 40));

  for (const query of queries) {
    if (candidates.length >= limit) break;
    const params = new URLSearchParams({
      query: query.label,
      near: query.city,
      limit: String(Math.min(50, limit - candidates.length)),
      fields: "name,website,location,categories"
    });
    const response = await fetchWithTimeout(fetchImpl, FOURSQUARE_URL + "?" + params.toString(), {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, "X-Places-Api-Version": FOURSQUARE_API_VERSION, "User-Agent": "Site Rescue Studio Prospect Discovery/1.0" }
    });
    let payload = null; try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload?.message || `Foursquare discovery returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    const found = extractFoursquareCandidates(payload, query);
    for (const candidate of found) {
      if (seen.has(candidate.normalized)) continue;
      seen.add(candidate.normalized);
      candidates.push(candidate);
      if (candidates.length >= limit) break;
    }
  }
  return { source: "foursquare", candidates, candidateCount: candidates.length };
}

const SOUTH_AFRICA_QUERIES = [
  "Bloemfontein","Cape Town","Durban","East London","Gqeberha","Mbombela","Polokwane","Kimberley","Pietermaritzburg","Rustenburg","George","Nelspruit"
].flatMap(city => DISCOVERY_CATEGORY_QUERIES.map(label => [label,city]))
  .map(([label,city])=>({label,city}));

const DISCOVERY_STAGES = [
  { id:"pretoria_centurion", label:"Pretoria & Centurion", queries:LOCAL_QUERIES },
  { id:"gauteng", label:"Gauteng", queries:GAUTENG_QUERIES },
  { id:"south_africa", label:"South Africa", queries:SOUTH_AFRICA_QUERIES },
  { id:"international", label:"International", queries:[] }
];

function getDiscoveryStage(stageId = process.env.AUTOMATION_DISCOVERY_STAGE || "pretoria_centurion") {
  return DISCOVERY_STAGES.find(stage => stage.id === stageId) || DISCOVERY_STAGES[0];
}

function nextEnabledDiscoveryStageId(stageId) {
  const allowInternational=String(process.env.AUTOMATION_ENABLE_INTERNATIONAL_DISCOVERY||"").toLowerCase()==="true";
  const stages=DISCOVERY_STAGES.filter(stage=>stage.id!=="international"||allowInternational);
  const index=Math.max(0,stages.findIndex(stage=>stage.id===stageId));
  return stages[(index+1)%stages.length]?.id||stages[0].id;
}

function providerQueries(date=new Date(), queries=getDiscoveryStage().queries, offset=0){
  if (!Array.isArray(queries) || !queries.length) return [];
  const source = queries;
  const requested = Number(process.env.AUTOMATION_DISCOVERY_QUERY_COUNT||2);
  const count = Math.max(1,Math.min(Number.isFinite(requested)?Math.floor(requested):2,4,source.length));
  const start = (Math.floor(date.getTime()/86400000) + Math.max(0, Number(offset)||0))%source.length;
  return Array.from({length:count},(_,i)=>source[(start+i)%source.length]);
}

function hostOf(value){
  try{return new URL(value).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}
}

function extractWebsDocsCandidates(payload,query){
  const rows=Array.isArray(payload?.results)?payload.results:Array.isArray(payload?.listings)?payload.listings:Array.isArray(payload?.items)?payload.items:[];
  const seen=new Set();
  return rows.map(row=>{
    const website=cleanWebsiteUrl(row?.website||row?.websiteUrl||row?.url||row?.domain||"");
    const normalized=normalizeWebsite(website);
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
    const response=await fetchWithTimeout(fetchImpl, WEBS_DOCS_URL+"?"+params.toString(),{
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


function openStreetMapQueriesForStage(stage, queries) {
  const { DEFAULT_DISCOVERY_QUERIES } = require("./prospectDiscovery");
  const requested = Array.isArray(queries) ? queries : [];
  const mapped = requested.map(query => {
    const label = String(query?.label || "").toLowerCase();
    const city = String(query?.city || "").trim();
    const existing = DEFAULT_DISCOVERY_QUERIES.find(item =>
      item.city.toLowerCase() === city.toLowerCase() &&
      item.label.toLowerCase().startsWith(label)
    );
    if (existing) return existing;

    const filterMap = [
      [/auto repair/i, [["shop", "car_repair"]]],
      [/electrician/i, [["craft", "electrician"]]],
      [/security/i, [["office", "security"]]],
      [/accountant/i, [["office", "accountant"]]],
      [/property/i, [["office", "estate_agent"]]],
      [/guesthouse/i, [["tourism", "guest_house"]]],
      [/salon|beauty|wellness/i, [["shop", "hairdresser"],["shop", "beauty"]]],
      [/plumber/i, [["craft", "plumber"]]],
      [/builder|contractor/i, [["craft", "builder"]]],
      [/cleaning/i, [["office", "cleaning"]]],
      [/it companies|marketing agencies/i, [["office", "company"]]],
      [/law firm/i, [["office", "lawyer"]]],
      [/medical practice/i, [["amenity", "doctors"]]],
      [/dental practice/i, [["amenity", "dentist"]]],
      [/veterinarian/i, [["amenity", "veterinary"]]],
      [/gym|fitness/i, [["leisure", "fitness_centre"]]],
      [/photographer/i, [["craft", "photographer"]]],
      [/restaurant/i, [["amenity", "restaurant"]]],
      [/takeaway|food delivery/i, [["amenity", "fast_food"]]],
      [/cafe/i, [["amenity", "cafe"]]],
      [/bakery/i, [["shop", "bakery"]]],
      [/catering/i, [["office", "caterer"]]],
      [/online ordering|ecommerce|online shop/i, [["shop", "department_store"],["shop", "supermarket"]]],
      [/retail store/i, [["shop", "general"]]],
      [/clothing/i, [["shop", "clothes"]]],
      [/furniture/i, [["shop", "furniture"]]],
      [/electronics/i, [["shop", "electronics"]]],
      [/florist/i, [["shop", "florist"]]],
      [/gift/i, [["shop", "gift"]]]
    ];
    const filters = filterMap.find(([pattern]) => pattern.test(label))?.[1];
    if (!filters || !city) return null;
    return {
      id: `${stage.id}-${city}-${label.replace(/\\s+/g, "-")}`,
      label: query.label,
      city,
      areaName: city,
      filters
    };
  }).filter(Boolean);
  return mapped;
}

async function discoverWithProviders({
  maxCandidates=20,
  queries=providerQueries(),
  stage=getDiscoveryStage(),
  isProviderAvailable=async()=>true,
  recordSuccess=async()=>{},
  providerStartOffset=0,
  recordFailure=async()=>{}
}={}){
  const errors=[];
  const attempts=[];
  const allowInternational=String(process.env.AUTOMATION_ENABLE_INTERNATIONAL_DISCOVERY||"").toLowerCase()==="true";
  if(stage.id==="international"&&!allowInternational){
    const error=new Error("International discovery is staged but disabled. Business and pricing review is required before activation.");
    error.code="INTERNATIONAL_DISCOVERY_DISABLED";
    throw error;
  }

  const primaryOffset = Math.abs(Number(providerStartOffset) || 0) % PRIMARY_DISCOVERY_PROVIDERS.length;
  const orderedProviders = [
    ...PRIMARY_DISCOVERY_PROVIDERS.slice(primaryOffset),
    ...PRIMARY_DISCOVERY_PROVIDERS.slice(0, primaryOffset),
    "foursquare",
    "websdocs"
  ];
  for(const provider of orderedProviders){
    const available=await isProviderAvailable(provider);
    if(!available){ attempts.push({provider,status:"unavailable"}); continue; }
    try{
      const result=provider==="pretoriaeast"
        ? await discoverPretoriaEast({ maxCandidates, pageOffset: Math.floor(Date.now() / 1200000) })
        : provider==="ccbc"
          ? await discoverCcbc({ maxCandidates, pageOffset: Math.floor(Date.now() / 1200000) })
          : provider==="openstreetmap"
        ? await (async () => {
            const osmQueries = openStreetMapQueriesForStage(stage, queries);
            if (!osmQueries.length) throw new Error("OpenStreetMap has no query geometry for this discovery stage.");
            return discoverOpenStreetMap({ maxCandidates, queries: osmQueries });
          })()
        : provider==="foursquare"
          ? await discoverFoursquare({maxCandidates,queries})
          : await discoverWebsDocs({maxCandidates,queries});
      const candidateCount=Number(result?.candidateCount||0);
      if(!candidateCount){
        await recordSuccess(provider);
        attempts.push({provider,status:"empty",candidateCount:0});
        continue;
      }
      await recordSuccess(provider);
      attempts.push({provider,status:"success",candidateCount});
      return {...result,provider,failoverUsed:provider!==orderedProviders[0],errors,attempts,stage:stage.id,stageLabel:stage.label};
    }catch(error){
      const message=String(error?.message||error);
      errors.push({provider,message,status:error?.status||null});
      attempts.push({provider,status:"failed",message,httpStatus:error?.status||null});
      await recordFailure(provider,error);
    }
  }
  const error=new Error("No configured discovery provider returned usable website candidates.");
  error.providerErrors=errors;
  error.attempts=attempts;
  throw error;
}

module.exports={
  WEBS_DOCS_URL,FOURSQUARE_URL,FOURSQUARE_MONTHLY_LIMIT,PROVIDER_ORDER,PRIMARY_DISCOVERY_PROVIDERS,LOCAL_QUERIES,GAUTENG_QUERIES,SOUTH_AFRICA_QUERIES,DISCOVERY_STAGES,
  getDiscoveryStage,nextEnabledDiscoveryStageId,providerQueries,extractWebsDocsCandidates,discoverWebsDocs,extractFoursquareCandidates,discoverFoursquare,openStreetMapQueriesForStage,discoverWithProviders
};
