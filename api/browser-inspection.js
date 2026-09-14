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
    return res.status(500).json({
      error:
        error.message ||
        "Browser inspection failed."
    });
  }
};