const browserInspection =
  require("../lib/browserInspection");

const runBrowserInspection =
  browserInspection;

const buildBrowserInspectionFindings =
  browserInspection.buildBrowserInspectionFindings;

module.exports = async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const url =
      req.body?.url;

    if (
      !url ||
      typeof url !== "string"
    ) {
      return res.status(400).json({
        error: "A valid website URL is required."
      });
    }

    const result =
      await runBrowserInspection(
        url
      );

    const findings =
      buildBrowserInspectionFindings(
        result
      );

    return res.status(200).json({
      inspection:
        result,
      findings
    });

  } catch (error) {
    console.error("Browser inspection endpoint error:", error);

    /*
     * Browser inspection is supplemental. A browser/runtime failure
     * must never invalidate an otherwise successful server-side scan.
     * Return a valid partial response so the frontend can continue
     * with the server evidence and report the inspection as unavailable.
     */
    return res.status(200).json({
      inspection: {
        attempted: true,
        available: false,
        unavailableReason:
          error.message ||
          "Browser inspection failed."
      },
      findings: []
    });
  }
};