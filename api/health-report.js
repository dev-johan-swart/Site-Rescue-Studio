const {
    generateFullReport
  } = require(
    "../lib/reportGenerator"
  );
  
  /*
   * ============================================================
   * SITE RESCUE STUDIO
   * ADMIN HEALTH REPORT
   * ============================================================
   *
   * This endpoint is NOT for prospects.
   *
   * It requires:
   *
   * HEALTH_REPORT_ADMIN_PASSWORD
   *
   * The same password is also embedded into the generated PDF
   * as the PDF user password.
   * ============================================================
   */
  
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
            "The admin report service is not configured."
        });
      }
  
      try {
  
        const body =
          req.body;
  
        if (
          !body ||
          typeof body !== "object"
        ) {
          return res.status(400).json({
            success: false,
            error:
              "No report request was provided."
          });
        }
  
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
  
        const reportData = {
          ...body
        };
  
        delete reportData.password;
  
        const pdf =
          await generateFullReport(
            reportData
          );
  
        let hostname =
          "website";
  
        try {
  
          hostname =
            new URL(
              reportData.finalUrl ||
              reportData.url
            )
              .hostname
              .replace(
                /^www\./,
                ""
              );
  
        } catch {}
  
        const slug =
          hostname
            .toLowerCase()
            .replace(
              /[^a-z0-9]+/g,
              "-"
            )
            .replace(
              /^-+|-+$/g,
              ""
            );
  
        const filename =
          `site-rescue-studio-${slug}-health-report.pdf`;
  
        res.status(200);
  
        res.setHeader(
          "Content-Type",
          "application/pdf"
        );
  
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
  
        res.setHeader(
          "Content-Length",
          pdf.length
        );
  
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, private"
        );
  
        return res.end(
          pdf
        );
  
      } catch (error) {
  
        console.error(
          "Admin health report error:",
          error
        );
  
        return res.status(500).json({
          success: false,
          error:
            "We could not generate the protected Website Health Report."
        });
      }
    };