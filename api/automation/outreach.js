const { getSql, ensureAutomationSchema } = require("../../lib/automationStore");
const { isOutreachChannelVerified } = require("../../lib/prospectQualification");

function authorised(req) {
  const expected = process.env.AUTOMATION_SECRET;
  const supplied = req.headers?.["x-automation-secret"];
  return Boolean(expected && supplied && supplied === expected);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success:false,error:"Method not allowed." });
  if (!authorised(req)) return res.status(401).json({ success:false,error:"Unauthorized." });
  try {
    const body=req.body||{};
    const websiteNormalized=String(body.websiteNormalized||"").trim().toLowerCase().replace(/^www\./,"");
    if (!websiteNormalized) return res.status(400).json({success:false,error:"websiteNormalized is required."});
    const sql=getSql();
    await ensureAutomationSchema(sql);
    const shortlist=await sql`SELECT id, prospect_id, evidence FROM automation_shortlist WHERE website_normalized=${websiteNormalized} ORDER BY created_at DESC LIMIT 1`;
    if (!shortlist.length) return res.status(404).json({success:false,error:"Website is not on the automation shortlist."});
    if (shortlist[0].evidence?.outreachReady !== true) {
      return res.status(409).json({
        success: false,
        error: "This shortlist item is not ready for outreach.",
        reason: shortlist[0].evidence?.outreachReadinessReason || "Business identity and contact ownership have not been sufficiently verified."
      });
    }
    if (!shortlist[0].prospect_id) {
      return res.status(409).json({success:false,error:"This shortlist item is not linked to a saved prospect record."});
    }
    const channel=String(body.channel||"").trim().toLowerCase();
    if (!channel) return res.status(400).json({success:false,error:"channel is required."});
    if (!isOutreachChannelVerified(shortlist[0].evidence || {}, channel)) {
      return res.status(409).json({
        success: false,
        error: "The selected outreach channel is not supported by verified website evidence.",
        channel
      });
    }
    const kind=String(body.outreachKind||"initial").toLowerCase();
    if (!["initial","follow_up"].includes(kind)) return res.status(400).json({success:false,error:"outreachKind must be initial or follow_up."});
    if (kind==="initial") {
      const existing=await sql`SELECT id FROM automation_outreach WHERE website_normalized=${websiteNormalized} AND outreach_kind='initial' LIMIT 1`;
      if (existing.length) return res.status(409).json({success:false,error:"Initial outreach has already been recorded for this website.",outreachId:existing[0].id});
    }
    const rows=await sql`INSERT INTO automation_outreach
      (website_normalized, prospect_id, outreach_kind, contacted_at, contact_date, channel, status, follow_up_at, notes)
      VALUES (${websiteNormalized}, ${shortlist[0].prospect_id||null}, ${kind}, NOW(), CURRENT_DATE,
        ${body.channel?String(body.channel).slice(0,50):null},
        ${body.status?String(body.status).slice(0,50):"recorded"},
        ${body.followUpAt?new Date(body.followUpAt):null},
        ${body.notes?String(body.notes).slice(0,2000):null})
      RETURNING id, website_normalized, outreach_kind, contacted_at, follow_up_at`;
    return res.status(200).json({success:true,outreach:rows[0]});
  } catch(error) {
    console.error("Automation outreach recording failed:",error);
    return res.status(500).json({success:false,error:"Outreach record could not be saved."});
  }
};