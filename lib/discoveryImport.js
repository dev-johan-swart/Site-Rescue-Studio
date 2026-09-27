const { cleanWebsiteUrl, normalizeWebsite } = require("./discoveryUrl");

function parseCsvLine(line) {
  const values=[]; let current=""; let quoted=false;
  for(let i=0;i<line.length;i++){
    const char=line[i];
    if(char==="""){ if(quoted&&line[i+1]==="""){current+=""";i++;} else quoted=!quoted; }
    else if(char===","&&!quoted){values.push(current.trim());current="";} else current+=char;
  }
  values.push(current.trim()); return values;
}
function parseDiscoveryInput(input){
  if(Array.isArray(input)) return input.map(cleanWebsiteUrl).filter(Boolean);
  const text=String(input||"").trim(); if(!text) return [];
  try{const parsed=JSON.parse(text); if(Array.isArray(parsed)) return parsed.map(cleanWebsiteUrl).filter(Boolean); if(Array.isArray(parsed?.websites)) return parsed.websites.map(cleanWebsiteUrl).filter(Boolean);}catch{}
  return text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map((line,index)=>{const first=parseCsvLine(line)[0]; if(index===0&&/^(website|url|domain|website address)$/i.test(first)) return ""; return cleanWebsiteUrl(first);}).filter(Boolean);
}
function uniqueImportedWebsites(input,max=5000){
  const seen=new Set(),websites=[];
  for(const website of parseDiscoveryInput(input)){const normalized=normalizeWebsite(website);if(!normalized||seen.has(normalized))continue;seen.add(normalized);websites.push(website);if(websites.length>=max)break;}
  return websites;
}
module.exports={parseCsvLine,parseDiscoveryInput,uniqueImportedWebsites};