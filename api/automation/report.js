const { getSql, ensureAutomationSchema } = require("../../lib/automationStore");
const { generateFullReport } = require("../../lib/reportGenerator");

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
    const websiteNormalized=String(body.websiteNormalized||"").trim().toLowerCase().replace(/^www\./,"");
    if (!websiteNormalized) return res.status(400).json({success:false,error:"websiteNormalized is required."});
    const shortlist=await sql`SELECT id FROM automation_shortlist WHERE website_normalized=${websiteNormalized} ORDER BY created_at DESC LIMIT 1`;
    if (!shortlist.length) return res.status(404).json({success:false,error:"Website is not on the automation shortlist."});
    const queue=await sql`SELECT scan_history_id FROM automation_queue WHERE website_normalized=${websiteNormalized} AND scan_history_id IS NOT NULL ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1`;
    if (!queue.length) return res.status(404).json({success:false,error:"No completed scan history is linked to this shortlist item."});
    const history=await sql`SELECT scan_data FROM scan_history WHERE id=${queue[0].scan_history_id} LIMIT 1`;
    if (!history.length || !history[0].scan_data) return res.status(404).json({success:false,error:"The linked scan history does not contain report data."});
    const pdf=await generateFullReport(history[0].scan_data);
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="website-health-report-${websiteNormalized.replace(/[^a-z0-9.-]/g,"-")}.pdf"`);
    res.setHeader("Content-Length",String(pdf.length));
    await sql`UPDATE automation_shortlist SET report_generated=TRUE WHERE id=${shortlist[0].id}`;
    return res.status(200).send(pdf);
  } catch(error) {
    console.error("Automation report generation failed:",error);
    return res.status(500).json({success:false,error:"The shortlist report could not be generated."});
  }
};