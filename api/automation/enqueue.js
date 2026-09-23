const { enqueueWebsites } = require("../../lib/automationStore");

function authorised(req) {
  const expected = process.env.AUTOMATION_SECRET;
  const supplied = req.headers?.["x-automation-secret"];
  return Boolean(expected && supplied && supplied === expected);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });
  if (!authorised(req)) return res.status(401).json({ success: false, error: "Unauthorized." });

  const body = req.body || {};
  const websites = Array.isArray(body.websites) ? body.websites : [];
  if (!websites.length) return res.status(400).json({ success: false, error: "Provide at least one website." });

  try {
    const results = await enqueueWebsites(websites, body.source || "manual");
    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error("Automation enqueue failed:", error);
    return res.status(500).json({ success: false, error: "Automation queue could not be updated." });
  }
};
