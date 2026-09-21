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
  
        const action =
        String(
          body.action ||
          "list"
        ).trim()
        .toLowerCase();

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
                potential_services

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