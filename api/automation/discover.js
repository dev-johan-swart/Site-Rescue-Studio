const { discoverWithProviders, getDiscoveryStage, providerQueries } = require("../../lib/discoveryProviders");
const {
  getSql, ensureAutomationSchema, reserveDiscoveryProvider,
  recordDiscoveryProviderSuccess, recordDiscoveryProviderFailure, enqueueWebsites
} = require("../../lib/automationStore");

function authorised(req) {
  const expected = process.env.AUTOMATION_SECRET;
  const supplied = req.headers?.["x-automation-secret"];
  return Boolean(expected && supplied && supplied === expected);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success:false,error:"Method not allowed." });
  if (!authorised(req)) return res.status(401).json({ success:false,error:"Unauthorized." });

  try {
    const sql=getSql();
    await ensureAutomationSchema(sql);
    const body=req.body||{};
    const stage=getDiscoveryStage(body.stage);
    const queries=Array.isArray(body.queries)
      ? body.queries.map(value=>String(value).trim()).filter(Boolean).slice(0,4).map(label=>({label,city:"Pretoria"}))
      : providerQueries(new Date(),stage.queries);

    const dailyLimit=Math.max(1,Math.min(Number(process.env.AUTOMATION_DISCOVERY_DAILY_LIMIT||2),4));
    const discovery=await discoverWithProviders({
      queries,
      stage,
      maxCandidates:body.maxCandidates,
      isProviderAvailable:provider=>reserveDiscoveryProvider(sql,provider,dailyLimit),
      recordSuccess:provider=>recordDiscoveryProviderSuccess(sql,provider),
      recordFailure:(provider,error)=>recordDiscoveryProviderFailure(sql,provider,error)
    });
    const enqueueResults=await enqueueWebsites(discovery.candidates.map(candidate=>candidate.website),discovery.provider);

    return res.status(200).json({
      success:true,source:discovery.provider,stage:discovery.stage,stageLabel:discovery.stageLabel,
      failoverUsed:discovery.failoverUsed,candidateCount:discovery.candidateCount,
      queries:discovery.queries,enqueueResults,
      warning:discovery.stage==="international"
        ? "International discovery is active. Review pricing, currency, service area, site copy, contact formats and prospect workflow."
        : null
    });
  } catch(error) {
    console.error("Automation discovery failed:",error);
    return res.status(error?.code==="INTERNATIONAL_DISCOVERY_DISABLED"?409:502).json({
      success:false,
      error:error?.message||"Automated discovery could not be completed."
    });
  }
};
