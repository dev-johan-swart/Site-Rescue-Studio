const { getSql, ensureAutomationSchema, addDiscoveryBacklogCandidates } = require("../../lib/automationStore");
const { uniqueImportedWebsites } = require("../../lib/discoveryImport");
function authorised(req){const expected=process.env.AUTOMATION_IMPORT_SECRET||process.env.CRON_SECRET;const supplied=req.headers?.authorization||"";return Boolean(expected&&supplied===`Bearer ${expected}`);}
module.exports=async function handler(req,res){
  if(!authorised(req)) return res.status(401).json({success:false,error:"Unauthorized."});
  if(req.method!=="POST") return res.status(405).json({success:false,error:"POST required."});
  try{
    const body=req.body||{}; const input=Array.isArray(body)?body:(body.websites??body.content??body.csv??"");
    const websites=uniqueImportedWebsites(input,5000);
    if(!websites.length) return res.status(400).json({success:false,error:"No valid website addresses were supplied."});
    const sql=getSql(); await ensureAutomationSchema(sql);
    const added=await addDiscoveryBacklogCandidates(sql,websites.map(website=>({website,category:"manual_import",name:null,city:null})),"manual_import","manual_import");
    return res.status(200).json({success:true,received:websites.length,addedToDiscoveryBacklog:added,duplicatesOrExisting:websites.length-added,source:"manual_import"});
  }catch(error){return res.status(500).json({success:false,error:String(error?.message||error)});}
};