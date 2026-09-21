const {
  authenticateAdmin
} = require(
  "../lib/adminAuth"
);

const {
    neon
  } =
    require(
      "@neondatabase/serverless"
    );
  
  const {
    normalizeWebsite
  } =
    require(
      "../lib/prospectStore"
    );
  
  module.exports =
    async function handler(
      req,
      res
    ) {
  
      if (
        req.method !== "POST"
      ) {
  
        return res.status(405).json({
          success: false,
          error:
            "Method not allowed."
        });
  
      }
  
      try {
  
        const body =
          req.body || {};
  
        const action =
          String(
            body.action ||
            "list"
          ).trim()
          .toLowerCase();

        if (action !== "archive") {
          const suppliedPassword =
            String(
              body.password || ""
            );

          const authentication =
            await authenticateAdmin(
              req,
              suppliedPassword
            );

          if (!authentication.ok) {
            return res.status(
              authentication.status
            ).json({
              success: false,
              error:
                authentication.error
            });
          }
        }

      const website =
          String(
            body.website ||
            ""
          ).trim();

        const websiteNormalized =
          website
            ? normalizeWebsite(
                website
              )
            : null;

        if (
          !process.env.DATABASE_URL
        ) {

          return res.status(500).json({
            success: false,
            error:
              "The prospect database is not configured."
          });

        }

        const sql =
          neon(
            process.env.DATABASE_URL
          );

        if (action === "archive") {
          const archiveToken =
            String(body.archiveToken || "").trim();

          const scanData =
            body.scanData &&
            typeof body.scanData === "object"
              ? body.scanData
              : null;

          if (!archiveToken || !scanData) {
            return res.status(400).json({
              success: false,
              error: "A complete scan archive is required."
            });
          }

          const crypto = require("crypto");
          const archiveTokenHash =
            crypto.createHash("sha256")
              .update(archiveToken)
              .digest("hex");

          const scores = scanData.scores || {};

          const updated =
            await sql`
              UPDATE scan_history
              SET
                scan_data = ${JSON.stringify(scanData)},
                overall_score = ${scores.overall ?? null},
                seo_score = ${scores.seo ?? null},
                mobile_score = ${scores.mobile ?? null},
                accessibility_score = ${scores.accessibility ?? null},
                technical_score = ${scores.technical ?? null},
                business_score = ${scores.business ?? null},
                performance_score = ${scores.performance ?? null},
                security_score = ${scores.security ?? null},
                key_problems = ${scanData.keyProblems ?? null},
                potential_services = ${scanData.potentialServices ?? null}
              WHERE archive_token_hash = ${archiveTokenHash}
              RETURNING id;
            `;

          if (!updated.length) {
            return res.status(404).json({
              success: false,
              error: "The scan archive could not be found."
            });
          }

          return res.status(200).json({
            success: true,
            historyId: updated[0].id
          });
        }

        if (action === "get") {
          const historyId =
            Number(body.historyId);

          if (!Number.isInteger(historyId) || historyId <= 0) {
            return res.status(400).json({
              success: false,
              error: "A valid scan history ID is required."
            });
          }

          const rows =
            await sql`
              SELECT
                id,
                website,
                scanned_at,
                scanner_version,
                scan_data
              FROM scan_history
              WHERE id = ${historyId}
              LIMIT 1;
            `;

          if (!rows.length) {
            return res.status(404).json({
              success: false,
              error: "The requested scan archive was not found."
            });
          }

          return res.status(200).json({
            success: true,
            history: rows[0]
          });
        }

        let history = [];

        if (websiteNormalized) {

          history =
            await sql`

              SELECT
                id,
                website,
                scanned_at,
                scanner_version,
                overall_score,
                seo_score,
                mobile_score,
                accessibility_score,
                technical_score,
                business_score,
                performance_score,
                security_score,
                key_problems,
                potential_services,
                scan_data

              FROM scan_history

              WHERE website_normalized =
                ${websiteNormalized}

              ORDER BY
                scanned_at ASC,
                id ASC;

            `;

        } else {

          history =
            await sql`

              SELECT
                id,
                website,
                scanned_at,
                scanner_version,
                overall_score,
                seo_score,
                mobile_score,
                accessibility_score,
                technical_score,
                business_score,
                performance_score,
                security_score,
                key_problems,
                potential_services,
                scan_data

              FROM scan_history

              ORDER BY
                scanned_at ASC,
                id ASC;

            `;

        }

        return res.status(200).json({

          success:
            true,

          website:
            website || null,

          websiteNormalized:
            websiteNormalized,

          scope:
            websiteNormalized
              ? "website"
              : "all",

          scanCount:
            history.length,

          history

        });

      } catch (error) {
  
        console.error(
          "Scan history error:",
          error
        );
  
        return res.status(500).json({
          success: false,
          error:
            "We could not load the scan history."
        });
  
      }
  
    };