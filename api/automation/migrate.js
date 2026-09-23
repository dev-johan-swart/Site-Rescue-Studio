const { getSql, ensureAutomationSchema } = require("../../lib/automationStore");

function authorised(req) {
  const expected = process.env.AUTOMATION_SECRET;
  const supplied = req.headers?.["x-automation-secret"];
  return Boolean(expected && supplied && supplied === expected);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }
  if (!authorised(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized." });
  }

  try {
    const sql = getSql();
    await ensureAutomationSchema(sql);

    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'automation_runs',
          'automation_queue',
          'automation_outreach',
          'automation_shortlist'
        )
      ORDER BY table_name
    `;

    return res.status(200).json({
      success: true,
      schemaApplied: true,
      tables: tables.map((row) => row.table_name),
      expectedTables: [
        "automation_runs",
        "automation_queue",
        "automation_outreach",
        "automation_shortlist"
      ]
    });
  } catch (error) {
    console.error("Automation schema migration failed:", error);
    return res.status(500).json({
      success: false,
      error: "Automation schema could not be applied or verified."
    });
  }
};
