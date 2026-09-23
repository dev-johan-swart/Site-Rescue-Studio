const { discoverWebsites } = require("../../lib/prospectDiscovery");
const { enqueueWebsites } = require("../../lib/automationStore");

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
    const body = req.body || {};
    const queries = Array.isArray(body.queries)
      ? body.queries.map(value => String(value).trim()).filter(Boolean).slice(0, 4)
      : undefined;

    const discovery = await discoverWebsites({
      queries,
      maxCandidates: body.maxCandidates
    });
    const enqueueResults = await enqueueWebsites(
      discovery.candidates.map(candidate => candidate.website),
      "openstreetmap"
    );

    return res.status(200).json({
      success: true,
      source: discovery.source,
      candidateCount: discovery.candidateCount,
      queries: discovery.queries,
      enqueueResults
    });
  } catch (error) {
    console.error("Automation discovery failed:", error);
    return res.status(502).json({
      success: false,
      error: "Automated discovery could not be completed."
    });
  }
};
