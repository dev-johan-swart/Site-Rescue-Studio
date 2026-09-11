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
  
      const adminPassword =
        String(
          process.env
            .HEALTH_REPORT_ADMIN_PASSWORD ||
          ""
        );
  
      if (!adminPassword) {
  
        console.error(
          "HEALTH_REPORT_ADMIN_PASSWORD is not configured."
        );
  
        return res.status(500).json({
          success: false,
          error:
            "The scan history service is not configured."
        });
      }
  
      try {
  
        const body =
          req.body || {};
  
        const suppliedPassword =
          String(
            body.password || ""
          );
  
        if (
          suppliedPassword !==
          adminPassword
        ) {
  
          return res.status(401).json({
            success: false,
            error:
              "Incorrect admin password."
          });
  
        }
  
        const website =
          String(
            body.website ||
            ""
          ).trim();
  
        if (!website) {
  
          return res.status(400).json({
            success: false,
            error:
              "No website was provided."
          });
  
        }
  
        const websiteNormalized =
          normalizeWebsite(
            website
          );
  
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
  
        const history =
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
  
            WHERE website_normalized =
              ${websiteNormalized}
  
            ORDER BY
              scanned_at ASC,
              id ASC;
  
          `;
  
        return res.status(200).json({
  
          success:
            true,
  
          website:
            website,
  
          websiteNormalized:
            websiteNormalized,
  
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