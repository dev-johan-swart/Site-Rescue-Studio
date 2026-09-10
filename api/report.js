const PDFDocument = require("pdfkit");
const path = require("path");

/*
 * ============================================================
 * SITE RESCUE STUDIO
 * WEBSITE RESCUE REPORT GENERATOR
 * ============================================================
 */

const SITE_RESCUE_URL =
  "https://site-rescue-studio.vercel.app/";

const LOGO_PATH = path.join(
  process.cwd(),
  "assets",
  "logo-prime.png"
);

const BRAND = {
  dark: "#111827",
  dark2: "#1F2937",
  text: "#374151",
  muted: "#6B7280",
  light: "#F3F4F6",
  lighter: "#F9FAFB",
  border: "#E5E7EB",
  white: "#FFFFFF",

  green: "#16A34A",
  greenLight: "#DCFCE7",

  blue: "#2563EB",
  blueLight: "#DBEAFE",

  orange: "#D97706",
  orangeLight: "#FEF3C7",

  red: "#DC2626",
  redLight: "#FEE2E2"
};

/*
 * ============================================================
 * PAGE LAYOUT
 * ============================================================
 *
 * A4 = 595 x 842 points.
 *
 * Header:
 *   y = 28 -> 43
 *
 * Content:
 *   y = 58 -> 777
 *
 * Footer:
 *   y = 799 -> 807
 *
 * Keeping these areas independent prevents content from
 * colliding with headers and footers.
 */

const PAGE = {
  left: 50,
  right: 50,
  top: 58,
  bottom: 65,
  width: 495
};

/*
 * ============================================================
 * REPORT RECOMMENDATION MAPPINGS
 * ============================================================
 *
 * These provide useful report recommendations when the scanner
 * identifies an issue but does not supply a separate
 * recommendation object.
 *
 * IMPORTANT:
 * These are generic mappings. They do not replace scanner
 * findings; they supplement missing recommendation content.
 */

const REPORT_RECOMMENDATION_MAPPINGS = {
  "Text size": {
    why:
      "Very small text can make content harder to read, especially on mobile devices.",
    action:
      "Review small font sizes and use readable responsive typography that remains comfortable across screen sizes.",
    service:
      "Mobile optimisation"
  },

  "Touch target sizing": {
    why:
      "Small buttons and controls can be difficult to tap accurately on phones and other touch devices.",
    action:
      "Increase the size and spacing of interactive controls so they are easier to use on touch screens.",
    service:
      "Mobile optimisation"
  },

  "Responsive typography": {
    why:
      "Fixed or non-responsive font sizing can make text less comfortable to read across different screen sizes.",
    action:
      "Use responsive typography with scalable units such as rem, em, or clamp() where appropriate.",
    service:
      "Mobile optimisation"
  },

  "Responsive CSS": {
    why:
      "Without responsive CSS rules, layouts may not adapt well to different screen sizes.",
    action:
      "Add appropriate responsive rules so the layout adapts cleanly to smaller screens.",
    service:
      "Mobile optimisation"
  },

  "Flexible layout": {
    why:
      "Rigid layouts can make content harder to use on smaller screens.",
    action:
      "Use flexible layout techniques such as Flexbox or CSS Grid where appropriate.",
    service:
      "Mobile optimisation"
  },

  "Responsive sizing": {
    why:
      "Fixed sizing can cause content to become cramped or overflow on smaller screens.",
    action:
      "Use flexible sizing units and max-width constraints where appropriate.",
    service:
      "Mobile optimisation"
  },

  "Responsive images": {
    why:
      "Images that do not adapt to available space can contribute to horizontal scrolling or poor mobile presentation.",
    action:
      "Make images fluid and prevent them from exceeding their available container width.",
    service:
      "Mobile optimisation"
  },

  "Form control sizing": {
    why:
      "Oversized fixed-width form controls can force users to scroll horizontally on smaller screens.",
    action:
      "Use responsive widths for inputs, selects, textareas and buttons.",
    service:
      "Mobile optimisation"
  },

  "Responsive tables": {
    why:
      "Wide tables can overflow the screen and make information difficult to use on mobile devices.",
    action:
      "Place wide tables inside a responsive scrolling container or use an alternative mobile-friendly layout.",
    service:
      "Mobile optimisation"
  },

  "Responsive embedded content": {
    why:
      "Fixed-size embedded content can extend beyond the available screen width.",
    action:
      "Make maps, videos, iframes and other embedded content responsive.",
    service:
      "Mobile optimisation"
  },

  "Mobile navigation": {
    why:
      "Navigation that does not adapt to smaller screens can make important pages difficult to reach.",
    action:
      "Provide a responsive mobile navigation pattern that remains easy to use on smaller screens.",
    service:
      "Mobile optimisation"
  },

  "Mobile-friendly input types": {
    why:
      "Using appropriate input types can make forms easier to complete on mobile devices.",
    action:
      "Use suitable input types such as email, tel, number, URL and search where appropriate.",
    service:
      "Mobile optimisation"
  },

  "Viewport zoom accessibility": {
    why:
      "Restricting browser zoom can make content harder to read and reduce accessibility for users who need magnification.",
    action:
      "Avoid unnecessarily restricting user zooming in the viewport configuration.",
    service:
      "Accessibility optimisation"
  },

  "Fixed-width layout risk": {
    why:
      "Large fixed-width CSS values can cause content to extend beyond the available screen width.",
    action:
      "Replace rigid widths with responsive sizing, max-width constraints and flexible layout rules where appropriate.",
    service:
      "Mobile optimisation"
  },

  "Server response time": {
    why:
      "A slow initial server response can delay the beginning of the page loading process.",
    action:
      "Review hosting, server configuration, caching, redirects and backend processing to reduce initial response time.",
    service:
      "Performance optimisation"
  },

  "HTTP to HTTPS redirect": {
    why:
      "A consistent redirect from HTTP to HTTPS helps ensure visitors and search engines reach the secure version of the website.",

    action:
      "Configure the HTTP version of the website to redirect to the HTTPS version using a permanent redirect where appropriate.",

    service:
      "Website security"
  },

  "HSTS": {
    why:
      "HSTS tells compatible browsers to use HTTPS for future visits, strengthening HTTPS enforcement.",

    action:
      "Review the website's HTTPS configuration and consider adding a suitable Strict-Transport-Security header.",

    service:
      "Website security"
  },

  "Content Security Policy": {
    why:
      "A Content-Security-Policy can help control which resources a browser is allowed to load and reduce certain classes of browser-side attacks.",

    action:
      "Review the site's scripts, styles, images and third-party resources, then introduce a suitable Content-Security-Policy.",

    service:
      "Website security"
  },

  "X-Content-Type-Options": {
    why:
      "The nosniff response header helps prevent browsers from incorrectly interpreting certain resources as a different content type.",

    action:
      "Add the X-Content-Type-Options: nosniff response header.",

    service:
      "Website security"
  },

  "Referrer Policy": {
    why:
      "A Referrer-Policy controls how much referring-page information browsers send with requests.",

    action:
      "Add a suitable Referrer-Policy header based on the website's privacy and analytics requirements.",

    service:
      "Website security"
  },

  "Permissions Policy": {
    why:
      "A Permissions-Policy can restrict access to browser features such as camera, microphone and geolocation.",

    action:
      "Review the browser features the website actually needs and configure an appropriate Permissions-Policy.",

    service:
      "Website security"
  },

  "Clickjacking protection": {
    why:
      "Frame protection can help prevent a website from being embedded in an unexpected frame.",

    action:
      "Review whether the site should allow framing and configure X-Frame-Options or an appropriate CSP frame-ancestors policy.",

    service:
      "Website security"
  },

  "Cross-Origin Opener Policy": {
    why:
      "Cross-Origin-Opener-Policy can provide additional isolation between a website and other browsing contexts.",

    action:
      "Review the site's cross-origin requirements and consider an appropriate Cross-Origin-Opener-Policy header.",

    service:
      "Website security"
  },

  "Insecure resources": {
    why:
      "HTTP resources referenced by an HTTPS page can create security and browser compatibility concerns.",

    action:
      "Update HTTP resource references such as scripts, stylesheets, images and other assets to HTTPS.",

    service:
      "Website security"
  },

  "Insecure form submission": {
    why:
      "Submitting form data to an HTTP endpoint can expose information while it is being transmitted.",

    action:
      "Ensure forms submit to HTTPS endpoints and review any external form-processing services.",

    service:
      "Website security"
  },

  "Insecure redirect reference": {
    why:
      "HTTP redirect references can send visitors toward an insecure destination.",

    action:
      "Review the redirect reference and update the destination to HTTPS where appropriate.",

    service:
      "Website security"
  },

  "Server information disclosure": {
    why:
      "Detailed server technology information in response headers can unnecessarily reveal implementation details.",

    action:
      "Review response headers and minimise unnecessary Server or X-Powered-By technology disclosure.",

    service:
      "Website security"
  },

  "Missing meta description": {
    why:
      "A missing or weak meta description can reduce the clarity of a page's search-result snippet.",
    action:
      "Add a concise, relevant meta description that accurately explains the page and supports search intent.",
    service:
      "Technical SEO"
  },

  "Structured data": {
    why:
      "Structured data helps search engines better understand important information about the website.",
    action:
      "Add valid, relevant Schema.org structured data where appropriate and keep it aligned with the visible page content.",
    service:
      "Technical SEO"
  },

  "Open Graph": {
    why:
      "Missing social sharing metadata can reduce control over how pages appear when shared on social platforms.",
    action:
      "Add appropriate Open Graph and Twitter/X metadata for important pages.",
    service:
      "Technical SEO"
  },

  "Empty links": {
    why:
      "Empty or placeholder links can create confusing interactions and reduce usability.",
    action:
      "Give every interactive link a meaningful destination or remove unused placeholder links.",
    service:
      "Website improvement"
  },

  "Missing contact information": {
    why:
      "Missing or difficult-to-find contact information can make it harder for visitors to become enquiries.",
    action:
      "Make phone, email, location and other relevant contact methods easy to find and use.",
    service:
      "Conversion optimisation"
  }
};

/*
 * ============================================================
 * MAIN HANDLER
 * ============================================================
 */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    const data = req.body;

    if (!data || typeof data !== "object") {
      return res.status(400).json({
        success: false,
        error: "No report data was provided."
      });
    }

    const {
      url,
      scores = {},
      recommendations = [],
      metadata = {},
      issues = [],
      checks = {},
      businessEvidence = {},
      pageSpeed = null,
      counts = {},
      linkHealth = {},
      responseTime,
      scannedAt,
      _pdfPassword = ""
    } = data;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "The report requires a website URL."
      });
    }

    const pdfOptions = {
      size: "A4",
      margins: {
        top: PAGE.top,
        bottom: PAGE.bottom,
        left: PAGE.left,
        right: PAGE.right
      },
      bufferPages: true,
      autoFirstPage: true
    };

    const doc =
      new PDFDocument(
        pdfOptions
      );

    const chunks = [];

    doc.on("data", chunk => {
      chunks.push(chunk);
    });

    const pdfFinished = new Promise(
      (resolve, reject) => {
        doc.on("end", resolve);
        doc.on("error", reject);
      }
    );

    /*
     * ----------------------------------------------------------
     * BUILD FINAL RECOMMENDATIONS
     * ----------------------------------------------------------
     *
     * Scanner recommendations are preserved.
     * Missing recommendations are supplemented from the
     * issue-to-recommendation mappings above.
     */

    const reportRecommendations =
      buildReportRecommendations(
        recommendations,
        issues
      );

    /*
     * ----------------------------------------------------------
     * PAGE 1 — COVER
     * ----------------------------------------------------------
     */

    drawCover(
      doc,
      url,
      scores,
      scannedAt,
      data._sampleReport
    );

    /*
     * ----------------------------------------------------------
     * PAGE 2 — OVERVIEW
     * ----------------------------------------------------------
     */

    addReportPage(doc);

    drawOverviewPage(
      doc,
      scores,
      issues
    );

    /*
     * ----------------------------------------------------------
     * PERFORMANCE SNAPSHOT
     * ----------------------------------------------------------
     *
     * Only create this page when PageSpeed data actually
     * exists.
     */

    if (
      pageSpeed &&
      pageSpeed.available
    ) {
      addReportPage(doc);

      drawPerformancePage(
        doc,
        pageSpeed
      );
    }

    /*
     * ----------------------------------------------------------
     * PRIORITY FINDINGS
     * ----------------------------------------------------------
     */

    addReportPage(doc);

    drawPriorityFindings(
      doc,
      issues
    );

    /*
     * ----------------------------------------------------------
     * RECOMMENDATIONS
     * ----------------------------------------------------------
     */

    addReportPage(doc);

    drawRecommendations(
      doc,
      reportRecommendations
    );

    /*
     * ----------------------------------------------------------
     * DETAILED HEALTH CHECKS
     * ----------------------------------------------------------
     */

    addReportPage(doc);

    drawDetailedHealthChecks(
      doc,
      checks,
      pageSpeed
    );

    /*
     * ----------------------------------------------------------
     * BUSINESS EVIDENCE
     * ----------------------------------------------------------
     */

    addReportPage(doc);

    drawBusinessEvidence(
      doc,
      businessEvidence
    );

    /*
     * ----------------------------------------------------------
     * WEBSITE INFORMATION
     * ----------------------------------------------------------
     */

    addReportPage(doc);

    drawWebsiteInformation(
      doc,
      metadata,
      counts,
      linkHealth,
      responseTime,
      checks,
      url
    );

    /*
     * ----------------------------------------------------------
     * FINAL RESCUE PLAN
     * ----------------------------------------------------------
     */

    addReportPage(doc);

    drawFinalPage(
      doc,
      scores,
      issues
    );

    /*
     * ----------------------------------------------------------
     * FOOTERS
     * ----------------------------------------------------------
     */

    addFooters(doc);

    /*
     * ----------------------------------------------------------
     * FINISH PDF
     * ----------------------------------------------------------
     */

    doc.end();

    await pdfFinished;

    const pdf = Buffer.concat(chunks);

    res.statusCode = 200;

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="website-rescue-report.pdf"'
    );

    res.setHeader(
      "Content-Length",
      pdf.length
    );

    return res.end(pdf);

  } catch (error) {
    console.error(
      "PDF report error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "We could not generate the Website Rescue Report."
    });
  }
};

/*
 * ============================================================
 * REPORT RECOMMENDATION BUILDER
 * ============================================================
 */

function buildReportRecommendations(
  recommendations,
  issues
 ) {
  const output = [];

  /*
   * Preserve all scanner-generated recommendations first.
   */

  if (Array.isArray(recommendations)) {
    recommendations.forEach(item => {
      if (!item) {
        return;
      }

      if (typeof item === "string") {
        output.push({
          title: item,
          severity: "info"
        });

        return;
      }

      output.push({
        title:
          item.title ||
          item.name ||
          "Recommendation",

        why:
          item.why ||
          item.reason ||
          "",

        action:
          item.action ||
          item.recommendation ||
          item.description ||
          "",

        service:
          item.service ||
          item.category ||
          "",

        severity:
          item.severity ||
          "info"
      });
    });
  }

  /*
   * Supplement recommendations from issue mappings.
   */

  if (Array.isArray(issues)) {
    issues.forEach(issue => {
      const normalized =
        normalizeIssue(issue);

      const issueTitle =
        String(
          normalized.title || ""
        ).trim();

      const mapping =
        findRecommendationMapping(
          issueTitle
        );

      if (!mapping) {
        return;
      }

      const alreadyExists =
        output.some(item => {
          const existingTitle =
            String(
              item?.title ||
              ""
            ).trim()
            .toLowerCase();

          return (
            existingTitle ===
            issueTitle.toLowerCase()
          );
        });

      if (alreadyExists) {
        return;
      }

      output.push({
        title: issueTitle,
        why: mapping.why,
        action: mapping.action,
        service: mapping.service,
        severity:
          normalized.severity ||
          "info"
      });
    });
  }

  return output;
}

function findRecommendationMapping(
  issueTitle
 ) {
  const title =
    String(
      issueTitle || ""
    )
      .trim()
      .toLowerCase();

  if (!title) {
    return null;
  }

  const exactKey =
    Object.keys(
      REPORT_RECOMMENDATION_MAPPINGS
    ).find(
      key =>
        key.toLowerCase() === title
    );

  if (exactKey) {
    return REPORT_RECOMMENDATION_MAPPINGS[
      exactKey
    ];
  }

  const partialKey =
    Object.keys(
      REPORT_RECOMMENDATION_MAPPINGS
    ).find(
      key => {
        const normalizedKey =
          key.toLowerCase();

        return (
          title.includes(
            normalizedKey
          ) ||
          normalizedKey.includes(
            title
          )
        );
      }
    );

  return partialKey
    ? REPORT_RECOMMENDATION_MAPPINGS[
        partialKey
      ]
    : null;
}

/*
 * ============================================================
 * PAGE MANAGEMENT
 * ============================================================
 */

function addReportPage(doc) {
  doc.addPage();

  drawHeader(doc);

  doc.x = PAGE.left;
  doc.y = PAGE.top;
}

function contentBottom(doc) {
  return (
    doc.page.height -
    PAGE.bottom
  );
}

function contentTop() {
  return PAGE.top;
}

/*
 * ============================================================
 * ENSURE SPACE
 * ============================================================
 */

function ensureSpace(
  doc,
  requiredHeight
) {
  const safeHeight =
    Math.max(
      0,
      Number(requiredHeight) || 0
    );

  const available =
    contentBottom(doc) -
    doc.y;

  if (
    safeHeight <= available
  ) {
    return false;
  }

  if (
    doc.y <=
    contentTop() + 2
  ) {
    return false;
  }

  addReportPage(doc);

  return true;
}

/*
 * ============================================================
 * COVER PAGE
 * ============================================================
 */

function drawCover(
  doc,
  url,
  scores,
  scannedAt,
  isSample = false
) {
  doc
    .save()
    .rect(
      0,
      0,
      doc.page.width,
      doc.page.height
    )
    .fillColor(
      BRAND.dark2
    )
    .fill()
    .restore();

  doc.fillColor(
    BRAND.white
  );

  const overall =
    numericScore(
      scores?.overall
    );

  const scoreColor =
    getScoreColor(
      overall
    );

  /*
   * Logo
   */

  try {
    doc.image(
      LOGO_PATH,
      PAGE.left + 145,
      55,
      {
        fit: [205, 90],
        align: "center",
        valign: "center"
      }
    );
  } catch (logoError) {
    console.warn(
      "Site Rescue Studio logo could not be loaded:",
      logoError.message
    );

    doc
      .fillColor(
        BRAND.white
      )
      .font(
        "Helvetica-Bold"
      )
      .fontSize(20)
      .text(
        "SITE RESCUE STUDIO",
        {
          align: "center"
        }
      );
  }

  if (isSample) {
    doc
      .fillColor(
        BRAND.orange
      )
      .font(
        "Helvetica-Bold"
      )
      .fontSize(12)
      .text(
        "SAMPLE WEBSITE HEALTH REPORT",
        PAGE.left,
        145,
        {
          width:
            PAGE.width,
          align:
            "center"
        }
      );

    doc
      .fillColor(
        BRAND.light
      )
      .font(
        "Helvetica"
      )
      .fontSize(9)
      .text(
        "Example / Demonstration Only",
        PAGE.left,
        160,
        {
          width:
            PAGE.width,
          align:
            "center"
        }
      );
  }

  /*
   * Report title
   */

  doc
    .fillColor(
      BRAND.white
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(30)
    .text(
      "Website Health Report",
      PAGE.left,
      175,
      {
        width: PAGE.width,
        align: "center"
      }
    );

  doc.moveDown(0.8);

  doc
    .fillColor(
      BRAND.light
    )
    .font("Helvetica")
    .fontSize(12)
    .text(
      cleanUrl(url),
      {
        align: "center"
      }
    );

  doc.moveDown(3);

  doc
    .fillColor(scoreColor)
    .font(
      "Helvetica-Bold"
    )
    .fontSize(58)
    .text(
      Number.isFinite(overall)
        ? `${overall}/100`
        : "—",
      {
        align: "center"
      }
    );

  doc.moveDown(0.3);

  doc
    .fillColor(
      BRAND.white
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(18)
    .text(
      getOverallLabel(
        overall
      ),
      {
        align: "center"
      }
    );

  doc.moveDown(1);

  doc
    .fillColor(
      BRAND.light
    )
    .font("Helvetica")
    .fontSize(11)
    .text(
      getOverallDescription(
        overall
      ),
      PAGE.left,
      doc.y,
      {
        align: "center",
        width: PAGE.width,
        lineGap: 2
      }
    );

  doc.moveDown(4);

  drawDivider(doc);

  doc.moveDown(1);

  doc
    .fillColor(
      BRAND.muted
    )
    .font("Helvetica")
    .fontSize(10)
    .text(
      `Generated ${formatDate(
        scannedAt
      )}`,
      {
        align: "center"
      }
    );

  doc.moveDown(1);

  doc
    .fillColor(
      BRAND.text
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(11)
    .text(
      "Website optimisation • SEO • Performance • Accessibility • Conversion",
      {
        align: "center"
      }
    );

  doc.moveDown(4);

  drawWebsiteButton(
    doc,
    "Visit Site Rescue Studio",
    SITE_RESCUE_URL,
    190,
    doc.y,
    215,
    38,
    false,
    true
  );
}

/*
 * ============================================================
 * OVERVIEW PAGE
 * ============================================================
 */

function drawOverviewPage(
  doc,
  scores,
  issues
 ) {
  sectionTitle(
    doc,
    "Website Health Overview",
    "A clear summary of the website's current health."
  );

  doc
    .fillColor(
      BRAND.text
    )
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      getOverviewDescription(
        scores?.overall
      ),
      {
        width: PAGE.width,
        lineGap: 3
      }
    );

  doc.moveDown(1.5);

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(15)
    .text(
      "Health Scores"
    );

  doc.moveDown(0.8);

  const scoreRows = [
    ["Overall", scores?.overall],
    ["SEO", scores?.seo],
    [
      "Performance",
      scores?.performance
    ],
    ["Mobile", scores?.mobile],
    [
      "Accessibility",
      scores?.accessibility
    ],
    ["Business", scores?.business],
    [
      "Technical",
      scores?.technical
    ],
    [
      "Security & Trust",
      scores?.security
    ]
  ];

  drawScoreDashboard(
    doc,
    scoreRows
  );

  doc.moveDown(1.5);

  drawAssessmentSummary(
    doc,
    issues
  );

  doc.moveDown(0.6);

  doc
    .fillColor(
      BRAND.muted
    )
    .font("Helvetica")
    .fontSize(9)
    .text(
      "The assessment combines technical website checks with SEO, mobile, accessibility, business, performance and security & trust indicators. Scores are intended to highlight practical improvement opportunities rather than replace a full professional audit.",
      {
        width: PAGE.width,
        lineGap: 2
      }
    );

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * SCORE DASHBOARD
 * ============================================================
 */

function drawScoreDashboard(
  doc,
  rows
 ) {
  const boxWidth = 238;
  const boxHeight = 52;
  const gapX = 19;
  const gapY = 8;

  const startX =
    PAGE.left;

  const startY =
    doc.y;

  rows.forEach(
    ([label, score], index) => {
      const column =
        index % 2;

      const row =
        Math.floor(
          index / 2
        );

      const x =
        startX +
        column *
          (boxWidth + gapX);

      const y =
        startY +
        row *
          (boxHeight + gapY);

      drawScoreCard(
        doc,
        label,
        score,
        x,
        y,
        boxWidth,
        boxHeight
      );
    }
  );

  const rowCount =
    Math.ceil(
      rows.length / 2
    );

  doc.y =
    startY +
    rowCount *
      (boxHeight + gapY);

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * SCORE CARD
 * ============================================================
 */

function drawScoreCard(
  doc,
  label,
  score,
  x,
  y,
  width,
  height
) {
  const value =
    numericScore(score);

  const color =
    getScoreColor(value);

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .fillColor(
      BRAND.lighter
    )
    .fill();

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .lineWidth(1)
    .strokeColor(
      BRAND.border
    )
    .stroke();

  doc
    .fillColor(
      BRAND.muted
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(8)
    .text(
      String(
        label
      ).toUpperCase(),
      x + 13,
      y + 10,
      {
        width:
          width - 26,
        lineGap: 0
      }
    );

  doc
    .fillColor(color)
    .font(
      "Helvetica-Bold"
    )
    .fontSize(17)
    .text(
      formatScore(value),
      x + 13,
      y + 27,
      {
        width:
          width - 26,
        lineGap: 0
      }
    );

  const barX =
    x + 13;

  const barY =
    y +
    height -
    9;

  const barWidth =
    width - 26;

  const barHeight = 4;

  doc
    .roundedRect(
      barX,
      barY,
      barWidth,
      barHeight,
      2
    )
    .fillColor(
      BRAND.border
    )
    .fill();

  if (
    Number.isFinite(value)
  ) {
    const percentage =
      Math.max(
        0,
        Math.min(
          value,
          100
        )
      ) / 100;

    doc
      .roundedRect(
        barX,
        barY,
        barWidth *
          percentage,
        barHeight,
        2
      )
      .fillColor(color)
      .fill();
  }
}

/*
 * ============================================================
 * ASSESSMENT SUMMARY
 * ============================================================
 */

function drawAssessmentSummary(
  doc,
  issues
 ) {
  const high =
    countSeverity(
      issues,
      "high"
    );

  const medium =
    countSeverity(
      issues,
      "medium"
    );

  const low =
    countSeverity(
      issues,
      "low"
    );

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(15)
    .text(
      "Assessment Summary"
    );

  doc.moveDown(0.7);

  const cards = [
    {
      label: "HIGH",
      value: high,
      color: BRAND.red,
      bg: BRAND.redLight
    },
    {
      label: "MEDIUM",
      value: medium,
      color: BRAND.orange,
      bg: BRAND.orangeLight
    },
    {
      label: "LOW",
      value: low,
      color: BRAND.blue,
      bg: BRAND.blueLight
    }
  ];

  const width = 150;
  const height = 58;
  const gap = 22;

  const y = doc.y;

  cards.forEach(
    (card, index) => {
      const x =
        PAGE.left +
        index *
          (width + gap);

      doc
        .roundedRect(
          x,
          y,
          width,
          height,
          8
        )
        .fillColor(
          card.bg
        )
        .fill();

      doc
        .fillColor(
          card.color
        )
        .font(
          "Helvetica-Bold"
        )
        .fontSize(8)
        .text(
          card.label,
          x + 12,
          y + 10,
          {
            lineGap: 0
          }
        );

      doc
        .fillColor(
          BRAND.dark
        )
        .font(
          "Helvetica-Bold"
        )
        .fontSize(22)
        .text(
          String(card.value),
          x + 12,
          y + 25,
          {
            lineGap: 0
          }
        );
    }
  );

  doc.y =
    y +
    height +
    15;

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * PERFORMANCE PAGE
 * ============================================================
 */

function drawPerformancePage(
  doc,
  pageSpeed
 ) {
  sectionTitle(
    doc,
    "Google Performance Snapshot",
    "Performance data collected from Google PageSpeed Insights."
  );

  const performanceRows = [
    [
      "Performance",
      pageSpeed?.performance
    ],
    [
      "Accessibility",
      pageSpeed?.accessibility
    ],
    [
      "Best Practices",
      pageSpeed?.bestPractices
    ],
    [
      "SEO",
      pageSpeed?.seo
    ]
  ];

  drawScoreDashboard(
    doc,
    performanceRows
  );

  doc.moveDown(1);

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(15)
    .text(
      "Core Web Vitals"
    );

  doc.moveDown(0.8);

  const vitals =
    pageSpeed?.vitals ||
    {};

  const vitalRows = [
    [
      "Largest Contentful Paint",
      getDisplayValue(
        vitals.lcp
      )
    ],
    [
      "Cumulative Layout Shift",
      getDisplayValue(
        vitals.cls
      )
    ],
    [
      "Interaction to Next Paint",
      getDisplayValue(
        vitals.inp
      )
    ],
    [
      "First Contentful Paint",
      getDisplayValue(
        vitals.fcp
      )
    ],
    [
      "Total Blocking Time",
      getDisplayValue(
        vitals.tbt
      )
    ]
  ];

  vitalRows.forEach(
    ([name, value]) => {
      const rowHeight =
        getKeyValueRowHeight(
          doc,
          value
        );

      ensureSpace(
        doc,
        rowHeight + 4
      );

      drawKeyValueRow(
        doc,
        name,
        value
      );
    }
  );

  doc.moveDown(1);

  drawInfoBox(
    doc,
    "Performance note",
    "Performance results can vary depending on device, network conditions, server location and testing conditions. The results shown here should be used as a practical indication of areas that may benefit from optimisation."
  );
}

/*
 * ============================================================
 * PRIORITY FINDINGS
 * ============================================================
 */

function drawPriorityFindings(
  doc,
  issues
) {
  sectionTitle(
    doc,
    "Priority Findings",
    "The main issues identified during this website assessment."
  );

  if (
    !Array.isArray(issues) ||
    issues.length === 0
  ) {
    drawInfoBox(
      doc,
      "No priority findings",
      "No priority findings were supplied for this scan."
    );

    return;
  }

  issues.forEach(
    (issue, index) => {
      const normalized =
        normalizeIssue(issue);

      const cardHeight =
        getFindingCardHeight(
          doc,
          normalized.title,
          normalized.description
        );

      ensureSpace(
        doc,
        cardHeight + 7
      );

      drawFindingCard(
        doc,
        index + 1,
        normalized.title,
        normalized.description,
        normalized.severity
      );
    }
  );
}

/*
 * ============================================================
 * FINDING CARD HEIGHT
 * ============================================================
 */

function getFindingCardHeight(
  doc,
  title,
  description
) {
  const titleText =
    String(
      title ||
      "Website issue"
    );

  const descriptionText =
    String(
      description ||
      ""
    );

  doc
    .font(
      "Helvetica-Bold"
    )
    .fontSize(12);

  const titleHeight =
    doc.heightOfString(
      titleText,
      {
        width: 300,
        lineGap: 1
      }
    );

  let descriptionHeight = 0;

  if (
    descriptionText
  ) {
    doc
      .font("Helvetica")
      .fontSize(9.5);

    descriptionHeight =
      doc.heightOfString(
        descriptionText,
        {
          width: 420,
          lineGap: 2
        }
      );
  }

  const headerHeight =
    Math.max(
      42,
      18 +
        titleHeight +
        10
    );

  const bodyHeight =
    descriptionText
      ? 12 +
        descriptionHeight +
        14
      : 0;

  return Math.max(
    72,
    headerHeight +
      bodyHeight
  );
}

/*
 * ============================================================
 * FINDING CARD
 * ============================================================
 */

function drawFindingCard(
  doc,
  number,
  title,
  description,
  severity
) {
  const x = PAGE.left;
  const width = PAGE.width;
  const y = doc.y;

  const severityInfo =
    getSeverityInfo(
      severity
    );

  const height =
    getFindingCardHeight(
      doc,
      title,
      description
    );

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .fillColor(
      BRAND.lighter
    )
    .fill();

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .lineWidth(1)
    .strokeColor(
      BRAND.border
    )
    .stroke();

  /*
   * Number badge
   */

  doc
    .roundedRect(
      x + 12,
      y + 9,
      30,
      30,
      6
    )
    .fillColor(
      BRAND.dark
    )
    .fill();

  doc
    .fillColor(
      BRAND.white
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(10)
    .text(
      String(number).padStart(
        2,
        "0"
      ),
      x + 12,
      y + 18,
      {
        width: 30,
        align: "center",
        lineGap: 0
      }
    );

  /*
   * Title
   */

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(12)
    .text(
      String(
        title ||
        "Website issue"
      ),
      x + 55,
      y + 9,
      {
        width: 300,
        lineGap: 1
      }
    );

  /*
   * Severity badge
   */

  doc
    .roundedRect(
      x + 385,
      y + 12,
      92,
      24,
      6
    )
    .fillColor(
      severityInfo.bg
    )
    .fill();

  doc
    .fillColor(
      severityInfo.color
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(7)
    .text(
      `${severityInfo.label} PRIORITY`,
      x + 385,
      y + 20,
      {
        width: 92,
        align: "center",
        lineGap: 0
      }
    );

  /*
   * Description
   */

  if (description) {
    doc
      .font(
        "Helvetica-Bold"
      )
      .fontSize(12);

    const titleHeight =
      doc.heightOfString(
        String(
          title ||
          "Website issue"
        ),
        {
          width: 300,
          lineGap: 1
        }
      );

    const descriptionY =
      y +
      Math.max(
        39,
        12 +
          titleHeight
      );

    doc
      .fillColor(
        BRAND.muted
      )
      .font(
        "Helvetica-Bold"
      )
      .fontSize(7.5)
      .text(
        "WHAT WE FOUND",
        x + 55,
        descriptionY,
        {
          lineGap: 0
        }
      );

    doc
      .fillColor(
        BRAND.text
      )
      .font("Helvetica")
      .fontSize(9.5)
      .text(
        String(description),
        x + 55,
        descriptionY + 12,
        {
          width: 420,
          lineGap: 2
        }
      );
  }

  doc.y =
    y +
    height +
    7;

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * RECOMMENDATIONS
 * ============================================================
 */

function drawRecommendations(
  doc,
  recommendations
) {
  sectionTitle(
    doc,
    "Site Rescue Recommendations",
    "Practical actions that can improve the website's health."
  );

  if (
    !Array.isArray(
      recommendations
    ) ||
    recommendations.length === 0
  ) {
    drawInfoBox(
      doc,
      "No recommendations",
      "No recommendations were generated for this scan."
    );

    return;
  }

  recommendations.forEach(
    (recommendation, index) => {
      const cardHeight =
        getRecommendationCardHeight(
          doc,
          recommendation
        );

      ensureSpace(
        doc,
        cardHeight + 14
      );

      drawRecommendationCard(
        doc,
        recommendation,
        index + 1
      );
    }
  );
}

/*
 * ============================================================
 * RECOMMENDATION CARD HEIGHT
 * ============================================================
 */

function getRecommendationCardHeight(
  doc,
  recommendation
) {
  const item =
    recommendation || {};

  const title =
    String(
      item.title ||
      "Recommendation"
    );

  const why =
    String(
      item.why ||
      ""
    );

  const action =
    String(
      item.action ||
      ""
    );

  const service =
    String(
      item.service ||
      ""
    );

  const contentWidth = 455;

  doc
    .font(
      "Helvetica-Bold"
    )
    .fontSize(14);

  const titleHeight =
    doc.heightOfString(
      title,
      {
        width: 330,
        lineGap: 1
      }
    );

  let whyHeight = 0;

  if (why) {
    doc
      .font("Helvetica")
      .fontSize(9.5);

    whyHeight =
      doc.heightOfString(
        why,
        {
          width: contentWidth,
          lineGap: 2
        }
      );
  }

  let actionHeight = 0;

  if (action) {
    doc
      .font("Helvetica")
      .fontSize(9.5);

    actionHeight =
      doc.heightOfString(
        action,
        {
          width: contentWidth,
          lineGap: 2
        }
      );
  }

  let serviceHeight = 0;

  if (service) {
    doc
      .font(
        "Helvetica-Bold"
      )
      .fontSize(9.5);

    serviceHeight =
      doc.heightOfString(
        service,
        {
          width: contentWidth,
          lineGap: 0
        }
      );
  }

  let height =
    Math.max(
      68,
      29 +
        titleHeight +
        14
    );

  if (why) {
    height +=
      12 +
      whyHeight +
      12;
  }

  if (action) {
    height +=
      12 +
      actionHeight +
      12;
  }

  if (service) {
    height +=
      12 +
      serviceHeight +
      12;
  }

  return Math.max(
    135,
    height
  );
}

/*
 * ============================================================
 * RECOMMENDATION CARD
 * ============================================================
 */

function drawRecommendationCard(
  doc,
  recommendation,
  number
 ) {
  const item =
    recommendation || {};

  const title =
    String(
      item.title ||
      "Recommendation"
    );

  const severity =
    item.severity ||
    "info";

  const why =
    String(
      item.why ||
      ""
    );

  const action =
    String(
      item.action ||
      ""
    );

  const service =
    String(
      item.service ||
      ""
    );

  const severityInfo =
    getSeverityInfo(
      severity
    );

  const x = PAGE.left;
  const width = PAGE.width;
  const y = doc.y;

  const contentWidth = 455;

  const height =
    getRecommendationCardHeight(
      doc,
      item
    );

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      9
    )
    .fillColor(
      BRAND.white
    )
    .fill();

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      9
    )
    .strokeColor(
      BRAND.border
    )
    .lineWidth(1)
    .stroke();

  /*
   * Left accent
   */

  doc
    .roundedRect(
      x,
      y,
      6,
      height,
      3
    )
    .fillColor(
      severityInfo.color
    )
    .fill();

  /*
   * Number
   */

  doc
    .fillColor(
      BRAND.muted
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(8)
    .text(
      String(number).padStart(
        2,
        "0"
      ),
      x + 18,
      y + 14,
      {
        width: 30,
        lineGap: 0
      }
    );

  /*
   * Title
   */

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(14)
    .text(
      title,
      x + 18,
      y + 29,
      {
        width: 330,
        lineGap: 1
      }
    );

  /*
   * Priority badge
   */

  doc
    .roundedRect(
      x + 385,
      y + 18,
      92,
      24,
      6
    )
    .fillColor(
      severityInfo.bg
    )
    .fill();

  doc
    .fillColor(
      severityInfo.color
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(7)
    .text(
      `${severityInfo.label} PRIORITY`,
      x + 385,
      y + 26,
      {
        width: 92,
        align: "center",
        lineGap: 0
      }
    );

  /*
   * Calculate title height using the exact rendering settings.
   */

  doc
    .font(
      "Helvetica-Bold"
    )
    .fontSize(14);

  const titleHeight =
    doc.heightOfString(
      title,
      {
        width: 330,
        lineGap: 1
      }
    );

  let currentY =
    y +
    Math.max(
      58,
      29 +
        titleHeight +
        8
    );

  /*
   * WHY IT MATTERS
   */

  if (why) {
    doc
      .fillColor(
        BRAND.muted
      )
      .font(
        "Helvetica-Bold"
      )
      .fontSize(7.5)
      .text(
        "WHY IT MATTERS",
        x + 18,
        currentY,
        {
          lineGap: 0
        }
      );

    currentY += 12;

    doc
      .fillColor(
        BRAND.text
      )
      .font("Helvetica")
      .fontSize(9.5)
      .text(
        why,
        x + 18,
        currentY,
        {
          width:
            contentWidth,
          lineGap: 2
        }
      );

    currentY +=
      doc.heightOfString(
        why,
        {
          width:
            contentWidth,
          lineGap: 2
        }
      ) +
      12;
  }

  /*
   * RECOMMENDED ACTION
   */

  if (action) {
    doc
      .fillColor(
        BRAND.muted
      )
      .font(
        "Helvetica-Bold"
      )
      .fontSize(7.5)
      .text(
        "RECOMMENDED ACTION",
        x + 18,
        currentY,
        {
          lineGap: 0
        }
      );

    currentY += 12;

    doc
      .fillColor(
        BRAND.text
      )
      .font("Helvetica")
      .fontSize(9.5)
      .text(
        action,
        x + 18,
        currentY,
        {
          width:
            contentWidth,
          lineGap: 2
        }
      );

    currentY +=
      doc.heightOfString(
        action,
        {
          width:
            contentWidth,
          lineGap: 2
        }
      ) +
      12;
  }

  /*
   * RECOMMENDED SERVICE
   */

  if (service) {
    doc
      .fillColor(
        BRAND.muted
      )
      .font(
        "Helvetica-Bold"
      )
      .fontSize(7.5)
      .text(
        "RECOMMENDED SERVICE",
        x + 18,
        currentY,
        {
          lineGap: 0
        }
      );

    currentY += 12;

    doc
      .fillColor(
        BRAND.blue
      )
      .font(
        "Helvetica-Bold"
      )
      .fontSize(9.5)
      .text(
        service,
        x + 18,
        currentY,
        {
          width:
            contentWidth,
          lineGap: 0
        }
      );
  }

  doc.y =
    y +
    height +
    14;

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * DETAILED HEALTH CHECKS
 * ============================================================
 */

function drawDetailedHealthChecks(
  doc,
  checks,
  pageSpeed
) {
  checks =
    checks || {};

  sectionTitle(
    doc,
    "Detailed Health Checks",
    "The individual checks performed during the website assessment."
  );

  const sections = [
    {
      title: "SEO",
      checks:
        Array.isArray(
          checks.seo
        )
          ? checks.seo
          : []
    },
    {
      title: "Accessibility",
      checks:
        Array.isArray(
          checks.accessibility
        )
          ? checks.accessibility
          : []
    },
    {
      title: "Mobile",
      checks:
        Array.isArray(
          checks.mobile
        )
          ? checks.mobile
          : []
    },
    {
      title: "Technical",
      checks:
        Array.isArray(
          checks.technical
        )
          ? checks.technical
          : []
    },
    {
      title: "Security & Trust",
      checks:
        Array.isArray(
          checks.security
        )
          ? checks.security
          : []
    }
  ];

  sections.forEach(
    section => {
      if (
        !section.checks.length
      ) {
        return;
      }

      ensureSpace(
        doc,
        65
      );

      drawSubheading(
        doc,
        section.title
      );

      section.checks.forEach(
        check => {
          const item =
            normalizeHealthCheck(
              check
            );

          const height =
            getHealthCheckHeight(
              doc,
              item
            );

          ensureSpace(
            doc,
            height + 8
          );

          drawHealthCheck(
            doc,
            item
          );
        }
      );

      doc.moveDown(0.8);
    }
  );

  /*
   * Performance
   */

  ensureSpace(
    doc,
    75
  );

  drawSubheading(
    doc,
    "Performance"
  );

  if (
    pageSpeed &&
    pageSpeed.available
  ) {
    const performanceChecks =
      [];

    const vitals =
      pageSpeed.vitals ||
      {};

    if (
      vitals.lcp !==
        undefined &&
      vitals.lcp !==
        null &&
      vitals.lcp !== ""
    ) {
      performanceChecks.push({
        title:
          "Largest Contentful Paint",
        description:
          `LCP: ${vitals.lcp}`,
        status: "info"
      });
    }

    if (
      vitals.cls !==
        undefined &&
      vitals.cls !==
        null &&
      vitals.cls !== ""
    ) {
      performanceChecks.push({
        title:
          "Cumulative Layout Shift",
        description:
          `CLS: ${vitals.cls}`,
        status: "info"
      });
    }

    if (
      vitals.inp !==
        undefined &&
      vitals.inp !==
        null &&
      vitals.inp !== ""
    ) {
      performanceChecks.push({
        title:
          "Interaction to Next Paint",
        description:
          `INP: ${vitals.inp}`,
        status: "info"
      });
    }

    if (
      vitals.fcp !==
        undefined &&
      vitals.fcp !==
        null &&
      vitals.fcp !== ""
    ) {
      performanceChecks.push({
        title:
          "First Contentful Paint",
        description:
          `FCP: ${vitals.fcp}`,
        status: "info"
      });
    }

    if (
      vitals.tbt !==
        undefined &&
      vitals.tbt !==
        null &&
      vitals.tbt !== ""
    ) {
      performanceChecks.push({
        title:
          "Total Blocking Time",
        description:
          `TBT: ${vitals.tbt}`,
        status: "info"
      });
    }

    performanceChecks.forEach(
      check => {
        const item =
          normalizeHealthCheck(
            check
          );

        ensureSpace(
          doc,
          getHealthCheckHeight(
            doc,
            item
          ) + 8
        );

        drawHealthCheck(
          doc,
          item
        );
      }
    );

    if (
      !performanceChecks.length
    ) {
      drawHealthCheck(
        doc,
        {
          title:
            "Performance data",
          description:
            "Performance data was available, but no individual metrics were returned.",
          status: "info"
        }
      );
    }
  } else {
    drawHealthCheck(
      doc,
      {
        title:
          "Performance analysis",
        description:
          "PageSpeed performance data was not available for this scan.",
        status: "info"
      }
    );
  }
}

/*
 * ============================================================
 * HEALTH CHECK HELPERS
 * ============================================================
 */

function normalizeHealthCheck(
  check
) {
  if (
    typeof check ===
    "string"
  ) {
    return {
      title: check,
      description: "",
      status: "info",
      severity: ""
    };
  }

  const item =
    check || {};

  return {
    title:
      item.title ||
      item.name ||
      "Health check",

    description:
      item.description ||
      item.detail ||
      item.message ||
      "",

    status:
      item.status ||
      item.result ||
      "info",

    severity:
      item.severity ||
      ""
  };
}

function getHealthCheckStatusColor(
  status
) {
  const value =
    String(
      status ||
      "info"
    ).toLowerCase();

  if (
    value === "pass" ||
    value === "passed" ||
    value === "ok" ||
    value === "success"
  ) {
    return BRAND.green;
  }

  if (
    value === "fail" ||
    value === "failed" ||
    value === "error"
  ) {
    return BRAND.red;
  }

  if (
    value === "warning" ||
    value === "warn"
  ) {
    return BRAND.orange;
  }

  return BRAND.blue;
}

function getHealthCheckStatusLabel(
  status
) {
  const value =
    String(
      status ||
      "info"
    ).toLowerCase();

  if (
    value === "pass" ||
    value === "passed" ||
    value === "ok" ||
    value === "success"
  ) {
    return "PASS";
  }

  if (
    value === "fail" ||
    value === "failed" ||
    value === "error"
  ) {
    return "FAIL";
  }

  if (
    value === "warning" ||
    value === "warn"
  ) {
    return "WARNING";
  }

  return "INFO";
}

function getHealthCheckHeight(
  doc,
  item
) {
  const description =
    item.description ||
    "No additional details were returned.";

  doc
    .font("Helvetica")
    .fontSize(9.5);

  const descriptionHeight =
    doc.heightOfString(
      description,
      {
        width: 395,
        lineGap: 2
      }
    );

  return Math.max(
    50,
    34 +
      descriptionHeight +
      12
  );
}

function drawHealthCheck(
  doc,
  item
) {
  const startY =
    doc.y;

  const width =
    PAGE.width;

  const height =
    getHealthCheckHeight(
      doc,
      item
    );

  const statusColor =
    getHealthCheckStatusColor(
      item.status
    );

  doc
    .roundedRect(
      PAGE.left,
      startY,
      width,
      height,
      7
    )
    .fillColor(
      BRAND.lighter
    )
    .fill();

  doc
    .roundedRect(
      PAGE.left,
      startY,
      width,
      height,
      7
    )
    .lineWidth(1)
    .strokeColor(
      BRAND.border
    )
    .stroke();

  /*
   * Status indicator
   */

  doc
    .roundedRect(
      PAGE.left + 12,
      startY + 12,
      70,
      20,
      5
    )
    .fillColor(
      statusColor
    )
    .fill();

  doc
    .fillColor(
      BRAND.white
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(7.5)
    .text(
      getHealthCheckStatusLabel(
        item.status
      ),
      PAGE.left + 12,
      startY + 18,
      {
        width: 70,
        align: "center"
      }
    );

  /*
   * Title
   */

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(10)
    .text(
      item.title,
      PAGE.left + 94,
      startY + 14,
      {
        width:
          width - 108
      }
    );

  /*
   * Description
   */

  doc
    .fillColor(
      BRAND.text
    )
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      item.description ||
        "No additional details were returned.",
      PAGE.left + 94,
      startY + 34,
      {
        width:
          width - 108,
        lineGap: 2
      }
    );

  doc.y =
    startY +
    height;

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * BUSINESS EVIDENCE
 * ============================================================
 */

function drawBusinessEvidence(
  doc,
  businessEvidence
) {
  businessEvidence =
    businessEvidence || {};

  sectionTitle(
    doc,
    "Business Readiness",
    "Evidence showing how easily visitors can contact or engage with the business."
  );

  const evidenceItems = [
    {
      key: "phone",
      title: "Phone number"
    },
    {
      key: "email",
      title: "Email address"
    },
    {
      key: "whatsapp",
      title: "WhatsApp"
    },
    {
      key: "contactForm",
      title: "Contact form"
    },
    {
      key: "location",
      title: "Business location"
    },
    {
      key: "cta",
      title: "Call to action"
    }
  ];

  let rendered = 0;

  evidenceItems.forEach(
    evidence => {
      const raw =
        businessEvidence[
          evidence.key
        ];

      if (
        raw === undefined ||
        raw === null
      ) {
        return;
      }

      const normalized =
        normalizeBusinessEvidence(
          evidence.key,
          raw
        );

      const height =
        getEvidenceHeight(
          doc,
          normalized
        );

      ensureSpace(
        doc,
        height + 8
      );

      drawEvidenceCard(
        doc,
        normalized
      );

      rendered++;
    }
  );

  if (!rendered) {
    drawEvidenceMessage(
      doc,
      "No business evidence was supplied for this scan.",
      false
    );

    return;
  }

  doc.moveDown(0.5);

  drawInfoBox(
    doc,
    "Business readiness note",
    "Business evidence is based on information detected by the scanner across the pages it was able to inspect. Presence of an item indicates detected evidence; it does not guarantee that every visitor will experience the same result in every browser or device."
  );
}

function normalizeBusinessEvidence(
  key,
  value
) {
  const entries =
    Array.isArray(value)
      ? value
      : [value];

  const usableEntries =
    entries
      .filter(
        entry =>
          entry !==
            null &&
          entry !==
            undefined &&
          entry !==
            ""
      )
      .map(
        entry =>
          typeof entry ===
          "object"
            ? entry
            : {
                value:
                  String(entry)
              }
      );

  return {
    key,
    title:
      getBusinessEvidenceTitle(
        key
      ),
    entries:
      usableEntries
  };
}

function getBusinessEvidenceTitle(
  key
) {
  const labels = {
    phone:
      "Phone number",
    email:
      "Email address",
    whatsapp:
      "WhatsApp",
    contactForm:
      "Contact form",
    location:
      "Business location",
    cta:
      "Call to action"
  };

  return (
    labels[key] ||
    "Business evidence"
  );
}

function getEvidenceStatus(
  evidence
) {
  return evidence.entries.length
    ? "Detected"
    : "Not detected";
}

function formatBusinessEvidence(
  key,
  entry
) {
  if (
    entry ===
      null ||
    entry ===
      undefined
  ) {
    return "Evidence detected.";
  }

  if (
    typeof entry ===
    "string"
  ) {
    return entry;
  }

  const parts = [];

  if (
    entry.url
  ) {
    parts.push(
      `Page: ${cleanDisplayUrl(
        entry.url
      )}`
    );
  } else if (
    entry.page
  ) {
    parts.push(
      `Page: ${cleanDisplayUrl(
        entry.page
      )}`
    );
  }

  if (
    entry.value
  ) {
    parts.push(
      `Value: ${entry.value}`
    );
  }

  if (
    entry.text
  ) {
    parts.push(
      `Text: ${entry.text}`
    );
  }

  if (
    entry.href
  ) {
    parts.push(
      `Link: ${entry.href}`
    );
  }

  if (
    entry.clickable !==
      undefined
  ) {
    parts.push(
      entry.clickable
        ? "Clickable"
        : "Not clickable"
    );
  }

  if (
    entry.usable !==
      undefined
  ) {
    parts.push(
      entry.usable
        ? "Usable"
        : "Not confirmed usable"
    );
  }

  if (
    entry.formCount !==
      undefined
  ) {
    parts.push(
      `Forms detected: ${entry.formCount}`
    );
  }

  if (
    entry.forms !==
      undefined
  ) {
    const count =
      Array.isArray(
        entry.forms
      )
        ? entry.forms.length
        : entry.forms;

    parts.push(
      `Forms detected: ${count}`
    );
  }

  if (
    entry.address
  ) {
    parts.push(
      `Address: ${entry.address}`
    );
  }

  if (
    entry.mapLink
  ) {
    parts.push(
      "Map link detected"
    );
  }

  if (
    entry.mapEmbed
  ) {
    parts.push(
      "Map embed detected"
    );
  }

  if (
    entry.cta
  ) {
    parts.push(
      `CTA: ${entry.cta}`
    );
  }

  if (
    !parts.length
  ) {
    parts.push(
      "Evidence detected."
    );
  }

  return parts.join(
    " • "
  );
}

function getEvidenceHeight(
  doc,
  evidence
) {
  const entries =
    evidence.entries.length
      ? evidence.entries
      : [
          {
            value:
              "No evidence detected."
          }
        ];

  let bodyHeight = 0;

  entries.forEach(
    entry => {
      const text =
        formatBusinessEvidence(
          evidence.key,
          entry
        );

      doc
        .font("Helvetica")
        .fontSize(9.5);

      bodyHeight +=
        doc.heightOfString(
          text,
          {
            width: 350,
            lineGap: 2
          }
        ) +
        5;
    }
  );

  return Math.max(
    72,
    45 +
      bodyHeight +
      12
  );
}

function drawEvidenceCard(
  doc,
  evidence
) {
  const x =
    PAGE.left;

  const width =
    PAGE.width;

  const y =
    doc.y;

  const height =
    getEvidenceHeight(
      doc,
      evidence
    );

  const detected =
    evidence.entries.length >
    0;

  const statusColor =
    detected
      ? BRAND.green
      : BRAND.orange;

  const statusBg =
    detected
      ? BRAND.greenLight
      : BRAND.orangeLight;

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .fillColor(
      BRAND.lighter
    )
    .fill();

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .lineWidth(1)
    .strokeColor(
      BRAND.border
    )
    .stroke();

  /*
   * Title
   */

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(11)
    .text(
      evidence.title,
      x + 16,
      y + 14,
      {
        width: 270,
        lineGap: 0
      }
    );

  /*
   * Status badge
   */

  doc
    .roundedRect(
      x + 385,
      y + 11,
      110 - 20,
      22,
      5
    )
    .fillColor(
      statusBg
    )
    .fill();

  doc
    .fillColor(
      statusColor
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(7)
    .text(
      getEvidenceStatus(
        evidence
      ).toUpperCase(),
      x + 385,
      y + 18,
      {
        width: 90,
        align: "center",
        lineGap: 0
      }
    );

  /*
   * Evidence details
   */

  let currentY =
    y + 42;

  if (
    evidence.entries.length
  ) {
    evidence.entries.forEach(
      entry => {
        const text =
          formatBusinessEvidence(
            evidence.key,
            entry
          );

        doc
          .fillColor(
            BRAND.text
          )
          .font("Helvetica")
          .fontSize(9.5)
          .text(
            `• ${text}`,
            x + 16,
            currentY,
            {
              width: 455,
              lineGap: 2
            }
          );

        currentY +=
          doc.heightOfString(
            `• ${text}`,
            {
              width: 455,
              lineGap: 2
            }
          ) +
          5;
      }
    );
  } else {
    doc
      .fillColor(
        BRAND.muted
      )
      .font("Helvetica")
      .fontSize(9.5)
      .text(
        "No evidence detected.",
        x + 16,
        currentY,
        {
          width: 455
        }
      );
  }

  doc.y =
    y +
    height +
    8;

  doc.x = PAGE.left;
}

function drawEvidenceMessage(
  doc,
  message,
  positive = false
) {
  drawInfoBox(
    doc,
    positive
      ? "Business evidence detected"
      : "Business evidence unavailable",
    message
  );
}

/*
 * ============================================================
 * WEBSITE INFORMATION
 * ============================================================
 */

function drawWebsiteInformation(
  doc,
  metadata,
  counts,
  linkHealth,
  responseTime,
  checks,
  url
) {
  metadata =
    metadata || {};

  counts =
    counts || {};

  linkHealth =
    linkHealth || {};

  checks =
    checks || {};

  /*
   * --------------------------------------------------------
   * NORMALISE WEBSITE METADATA
   * --------------------------------------------------------
   */

  function formatMetadataValue(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "Not detected";
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number" ||
        typeof value === "boolean") {
      return String(value);
    }

    /*
     * Prevent JavaScript's "[object Object]"
     * from ever appearing in the PDF.
     */

    if (Array.isArray(value)) {
      return value
        .map(item => formatMetadataValue(item))
        .filter(Boolean)
        .join(", ") || "Detected";
    }

    if (typeof value === "object") {
      /*
       * Common structured-data representations.
       */

      if (Array.isArray(value.types)) {
        return value.types.join(", ");
      }

      if (Array.isArray(value.schemaTypes)) {
        return value.schemaTypes.join(", ");
      }

      if (Array.isArray(value.schemas)) {
        return value.schemas.join(", ");
      }

      if (value.type) {
        return String(value.type);
      }

      if (value.status) {
        return String(value.status);
      }

      /*
       * Open Graph metadata may arrive as an object.
       * We only need to confirm its presence here.
       */

      return "Detected";
    }

    return String(value);
  }

  /*
   * --------------------------------------------------------
   * OPEN GRAPH
   * --------------------------------------------------------
   */

  let openGraphValue = 
  metadata.openGraph ?? 
  metadata.og; 
  
  /* 
  * The scanner's SEO checks are the authoritative fallback 
  * when Open Graph data is not stored directly in metadata. 
  */ 
 
  if ( 
    openGraphValue === null || 
    openGraphValue === undefined || 
    openGraphValue === "" 
  ) { 
    const seoChecks = 
    Array.isArray(checks.seo) 
    ? checks.seo 
    : []; 
    
    const socialCheck = 
    seoChecks.find(check => { 
      const title = 
      String( 
        check?.title ?? 
        check?.name ?? 
        check?.label ?? 
        "" 
      ).toLowerCase(); 
      
      return ( 
        title.includes("social sharing") || 
        title.includes("open graph") 
      ); 
    }); 
    
    if (socialCheck) { 
      const status = 
      String( 
        socialCheck.status ?? 
        "" 
      ).toLowerCase(); 
      
      const description = 
      String( 
        socialCheck.description ?? 
        socialCheck.details ?? 
        "" 
      ).toLowerCase(); 
      
      if ( status === "pass" || 
        description.includes("found") 
      ) { 
        openGraphValue = "Detected"; 
      } 
    } 
  } 
  
  if ( 
    openGraphValue === null || 
    openGraphValue === undefined || 
    openGraphValue === "" 
  ) { 
    openGraphValue = 
    "Not detected"; 
  } else if ( 
    typeof openGraphValue === "object" 
  ) { 
    openGraphValue = "Detected"; 
  } else { 
    openGraphValue = 
    String(openGraphValue); 
  }

  /*
   * --------------------------------------------------------
   * STRUCTURED DATA
   * --------------------------------------------------------
   */

  let structuredDataValue =
    metadata.structuredData ??
    metadata.schema;

  if (
    structuredDataValue &&
    typeof structuredDataValue === "object"
  ) {
    /*
     * Support common scanner formats.
     */

    if (
      Array.isArray(
        structuredDataValue.types
      )
    ) {
      structuredDataValue =
        structuredDataValue.types.join(", ");
    } else if (
      Array.isArray(
        structuredDataValue.schemaTypes
      )
    ) {
      structuredDataValue =
        structuredDataValue.schemaTypes.join(", ");
    } else if (
      Array.isArray(
        structuredDataValue.schemas
      )
    ) {
      structuredDataValue =
        structuredDataValue.schemas.join(", ");
    } else if (
      structuredDataValue.type
    ) {
      structuredDataValue =
        String(
          structuredDataValue.type
        );
      } else { 

        /* 
        * Try to extract schema types from the scanner's 
        * detailed SEO health check before falling back 
        * to a generic "Detected" label. 
        * */ 
       
        const seoChecks = 
        Array.isArray(checks.seo) 
        ? checks.seo 
        : []; 
        
        const structuredCheck = 
        seoChecks.find(check => { 
          const title = 
          String( check?.title ?? 
            check?.name ?? 
            check?.label ?? 
            "" 
          ).toLowerCase(); 
          
          return ( title.includes("structured data") || 
          title.includes("schema") 
        ); 
      }); 
      
      if (structuredCheck) { 
        const text = 
        String( structuredCheck.description ?? 
          structuredCheck.details ?? 
          structuredCheck.value ?? 
          "" 
        ); 
        
        const match = 
        text.match( 
          /found:\s*(.+)$/i 
        ); 
        
        if (match) { 
          structuredDataValue =
           match[1].trim(); 
          } else { 
            structuredDataValue = 
            "Detected"; 
          } 
        } else { 
          structuredDataValue = 
          "Detected"; 
        } 
      }

  } else {
    structuredDataValue =
      formatMetadataValue(
        structuredDataValue
      );
  }

  /*
   * --------------------------------------------------------
   * HTTP STATUS
   * --------------------------------------------------------
   */

  let httpStatus =
    metadata.statusCode ??
    metadata.httpStatus ??
    metadata.status;

  /*
   * If the scanner successfully returned a response,
   * the detailed technical check may contain the status.
   */

  if (
    httpStatus === undefined ||
    httpStatus === null ||
    httpStatus === ""
  ) {
    const technicalChecks =
      Array.isArray(checks.technical)
        ? checks.technical
        : [];

    const statusCheck =
      technicalChecks.find(check => {
        const title =
          String(
            check?.title ??
            check?.name ??
            check?.label ??
            ""
          ).toLowerCase();

        return (
          title.includes("http response") ||
          title.includes("http status") ||
          title.includes("response status")
        );
      });

      if (statusCheck) {

         /* 
         * Prefer an actual numeric HTTP status. 
         */ 
        
         httpStatus = 
         statusCheck.statusCode ?? 
         statusCheck.httpStatus; 
         /* 
         * Some scanner versions store the status inside 
         * the check value. 
         */ 
        
         if ( 
          httpStatus === undefined || 
          httpStatus === null || httpStatus === "" 
        ) { 
          const value = 
          statusCheck.value; 
          
          if ( 
            typeof value === "number" 
          ) { 
            httpStatus = value; 
          } else if ( 
            typeof value === "string" 
          ) { 
            const match = 
            value.match(/\b([1-5]\d{2})\b/); 
            
            if (match) { 
              httpStatus = 
              match[1]; 
            } 
          } 
        } 

        /* 
        * Last fallback: extract the HTTP status from the 
        * human-readable check description. 
        * 
        * Example: 
        * "The page returned HTTP 200." 
        */ 
       
        if ( 
          httpStatus === undefined || 
          httpStatus === null || 
          httpStatus === "" 
        ) { 
          const text = 
          String( 
            statusCheck.details ?? 
            statusCheck.description ?? 
            "" 
          ); 
          
          const match = 
          text.match(/\bHTTP\s+([1-5]\d{2})\b/i); 
          
          if (match) { 
            httpStatus = 
            match[1]; 
          } 
        } 
      }
  }

  /*
   * --------------------------------------------------------
   * HTTPS
   * --------------------------------------------------------
   */

  let httpsValue =
    metadata.https ??
    metadata.isHttps;

  /*
   * If HTTPS was not explicitly supplied by the scanner,
   * derive it safely from the scanned URL.
   */

  if (
    httpsValue === undefined ||
    httpsValue === null ||
    httpsValue === ""
  ) {
    httpsValue =
      typeof url === "string" &&
      url.toLowerCase().startsWith(
        "https://"
      );
  }

  if (
    typeof httpsValue === "boolean"
  ) {
    httpsValue =
      httpsValue
        ? "Yes"
        : "No";
  }

  /*
   * --------------------------------------------------------
   * WEBSITE INFORMATION
   * --------------------------------------------------------
   */

  sectionTitle(
    doc,
    "Website Information",
    "Technical and metadata information detected during the scan."
  );

  /*
   * WEBSITE METADATA
   */

  drawSubheading(
    doc,
    "Website Metadata"
  );

  const metadataRows = [
    [
      "Page title",
      metadata.title ||
        "Not detected"
    ],
    [
      "Meta description",
      metadata.description ||
        "Not detected"
    ],
    [
      "Canonical URL",
      metadata.canonical ||
        "Not detected"
    ],
    [
      "Language",
      metadata.language ||
        "Not detected"
    ],
    [
      "Viewport",
      metadata.viewport ||
        "Not detected"
    ],
    [
      "Open Graph",
      openGraphValue
    ],
    [
      "Structured data",
      structuredDataValue
    ]
  ];

  drawKeyValueRows(
    doc,
    metadataRows
  );

  doc.moveDown(1);

  /*
   * TECHNICAL SNAPSHOT
   */

  drawSubheading(
    doc,
    "Technical Snapshot"
  );

  const technicalRows = [
    [
      "Initial response time",
      isFiniteNumber(
        responseTime
      )
        ? `${responseTime} ms`
        : "Not available"
    ],
    [
      "HTTP status",
      httpStatus !== undefined &&
      httpStatus !== null &&
      httpStatus !== ""
        ? String(httpStatus)
        : "Not available"
    ],
    [
      "HTTPS",
      httpsValue !== undefined &&
      httpsValue !== null &&
      httpsValue !== ""
        ? String(httpsValue)
        : "Not available"
    ],
    [
      "H1 headings",
      counts.h1 ??
        "Not available"
    ],
    [
      "H2 headings",
      counts.h2 ??
        "Not available"
    ],
    [
      "Images",
      counts.images ??
        "Not available"
    ],
    [
      "Images without alt text",
      counts.imagesWithoutAlt ??
        "Not available"
    ],
    [
      "Links",
      counts.links ??
        "Not available"
    ]
  ];

  drawKeyValueRows(
    doc,
    technicalRows
  );

  doc.moveDown(1);

  /*
   * LINK HEALTH
   */

  drawSubheading(
    doc,
    "Link Health"
  );

  const linkRows = [
    [
      "Links tested",
      linkHealth.tested ??
        "Not available"
    ],
    [
      "Working links",
      linkHealth.working ??
        "Not available"
    ],
    [
      "Broken links",
      linkHealth.broken ??
        "Not available"
    ],
    [
      "Redirected links",
      linkHealth.redirected ??
        "Not available"
    ],
    [
      "Placeholder links",
      linkHealth.placeholder ??
        "Not available"
    ]
  ];

  drawKeyValueRows(
    doc,
    linkRows
  );

  doc.moveDown(1);

  drawInfoBox(
    doc,
    "About this assessment",
    "This report was generated automatically using the Site Rescue Studio website health scanner. Automated checks are designed to identify practical improvement opportunities and should be considered alongside professional review and testing."
  );
}

/*
 * ============================================================
 * KEY / VALUE ROWS
 * ============================================================
 */

function drawKeyValueRows(
  doc,
  rows
) {
  rows.forEach(
    ([label, value]) => {
      const rowHeight =
        getKeyValueRowHeight(
          doc,
          value
        );

      ensureSpace(
        doc,
        rowHeight + 4
      );

      drawKeyValueRow(
        doc,
        label,
        value
      );
    }
  );
}

/*
 * ============================================================
 * KEY / VALUE ROW HEIGHT
 * ============================================================
 */

function getKeyValueRowHeight(
  doc,
  value
) {
  const valueText =
    String(
      value ??
        "Not available"
    );

  doc
    .font("Helvetica")
    .fontSize(9.5);

  const valueHeight =
    doc.heightOfString(
      valueText,
      {
        width: 325,
        lineGap: 2
      }
    );

  return Math.max(
    28,
    valueHeight + 14
  );
}

/*
 * ============================================================
 * KEY / VALUE ROW
 * ============================================================
 */

function drawKeyValueRow(
  doc,
  label,
  value
) {
  const x =
    PAGE.left;

  const width =
    PAGE.width;

  const y =
    doc.y;

  const valueText =
    String(
      value ??
        "Not available"
    );

  const rowHeight =
    getKeyValueRowHeight(
      doc,
      valueText
    );

  doc
    .roundedRect(
      x,
      y,
      width,
      rowHeight,
      5
    )
    .fillColor(
      BRAND.lighter
    )
    .fill();

  doc
    .fillColor(
      BRAND.muted
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(8.5)
    .text(
      String(
        label
      ).toUpperCase(),
      x + 12,
      y + 7,
      {
        width: 135,
        lineGap: 0
      }
    );

  doc
    .fillColor(
      BRAND.text
    )
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      valueText,
      x + 155,
      y + 7,
      {
        width: 325,
        lineGap: 2
      }
    );

  doc.y =
    y +
    rowHeight +
    3;

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * INFO BOX
 * ============================================================
 */

function drawInfoBox(
  doc,
  title,
  text
) {
  const x =
    PAGE.left;

  const width =
    PAGE.width;

  const paddingX = 15;

  const innerWidth =
    width -
    paddingX * 2;

  const titleText =
    String(
      title || ""
    );

  const bodyText =
    String(
      text || ""
    );

  doc
    .font(
      "Helvetica-Bold"
    )
    .fontSize(9);

  const titleHeight =
    doc.heightOfString(
      titleText,
      {
        width:
          innerWidth,
        lineGap: 0
      }
    );

  doc
    .font("Helvetica")
    .fontSize(9.5);

  const bodyHeight =
    doc.heightOfString(
      bodyText,
      {
        width:
          innerWidth,
        lineGap: 2
      }
    );

  const textTop =
    12 +
    titleHeight +
    7;

  const height =
    textTop +
    bodyHeight +
    16;

  ensureSpace(
    doc,
    height + 8
  );

  const y =
    doc.y;

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .fillColor(
      BRAND.blueLight
    )
    .fill();

  doc
    .fillColor(
      BRAND.blue
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(9)
    .text(
      titleText,
      x + paddingX,
      y + 12,
      {
        width:
          innerWidth,
        lineGap: 0
      }
    );

  doc
    .fillColor(
      BRAND.text
    )
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      bodyText,
      x + paddingX,
      y + textTop,
      {
        width:
          innerWidth,
        lineGap: 2
      }
    );

  doc.y =
    y +
    height +
    14;

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * NUMBERED STEP HEIGHT
 * ============================================================
 */

function getNumberedStepHeight(
  doc,
  text
) {
  const textValue =
    String(
      text || ""
    );

  doc
    .font("Helvetica")
    .fontSize(10.5);

  const textHeight =
    doc.heightOfString(
      textValue,
      {
        width: 450,
        lineGap: 2
      }
    );

  return Math.max(
    30,
    textHeight + 8
  );
}

/*
 * ============================================================
 * NUMBERED STEP
 * ============================================================
 */

function drawNumberedStep(
  doc,
  number,
  text
) {
  const x =
    PAGE.left;

  const y =
    doc.y;

  const textValue =
    String(
      text || ""
    );

  const textWidth = 450;

  const rowHeight =
    getNumberedStepHeight(
      doc,
      textValue
    );

  doc
    .circle(
      x + 12,
      y + 12,
      12
    )
    .fillColor(
      BRAND.blue
    )
    .fill();

  doc
    .fillColor(
      BRAND.white
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(8)
    .text(
      String(number),
      x + 5,
      y + 8,
      {
        width: 14,
        align: "center",
        lineGap: 0
      }
    );

  doc
    .fillColor(
      BRAND.text
    )
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      textValue,
      x + 35,
      y + 3,
      {
        width: textWidth,
        lineGap: 2
      }
    );

  doc.y =
    y +
    rowHeight +
    6;

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * PROSPECT OPPORTUNITY
 * ============================================================
 */

function getProspectOpportunity(
  scores,
  issues
) {
  const overall =
    numericScore(
      scores?.overall
    );

  const issueList =
    Array.isArray(issues)
      ? issues
      : [];

  const high =
    countSeverity(
      issueList,
      "high"
    );

  const medium =
    countSeverity(
      issueList,
      "medium"
    );

  const low =
    countSeverity(
      issueList,
      "low"
    );

  const totalIssues =
    high +
    medium +
    low;

  let opportunity =
    "Low";

  if (
    !Number.isFinite(
      overall
    )
  ) {
    opportunity =
      "Review";
  } else if (
    overall < 60
  ) {
    opportunity =
      "Very High";
  } else if (
    overall < 70
  ) {
    opportunity =
      "High";
  } else if (
    overall < 80
  ) {
    opportunity =
      "Good";
  } else if (
    overall < 90
  ) {
    opportunity =
      "Moderate";
  }

  if (
    Number.isFinite(
      overall
    ) &&
    totalIssues >= 6 &&
    overall < 85
  ) {
    opportunity =
      overall < 70
        ? "Very High"
        : "High";
  }

  const services = [];

  issueList.forEach(
    issue => {
      const title =
        String(
          issue?.title ||
          issue?.name ||
          ""
        ).toLowerCase();

      if (
        /mobile|fixed.width|horizontal|viewport/.test(
          title
        )
      ) {
        if (
          !services.includes(
            "Mobile optimisation"
          )
        ) {
          services.push(
            "Mobile optimisation"
          );
        }
      }

      if (
        /seo|canonical|structured|open graph|heading|meta/.test(
          title
        )
      ) {
        if (
          !services.includes(
            "Technical SEO"
          )
        ) {
          services.push(
            "Technical SEO"
          );
        }
      }

      if (
        /phone|email|contact|conversion|call|whatsapp|link/.test(
          title
        )
      ) {
        if (
          !services.includes(
            "Conversion optimisation"
          )
        ) {
          services.push(
            "Conversion optimisation"
          );
        }
      }

      if (
        /design|layout|accessibility|performance/.test(
          title
        )
      ) {
        if (
          !services.includes(
            "Website improvement"
          )
        ) {
          services.push(
            "Website improvement"
          );
        }
      }
    }
  );

  if (
    services.length ===
    0
  ) {
    services.push(
      "Website optimisation"
    );
  }

  return {
    score: overall,
    opportunity,
    services:
      services.slice(0, 4)
  };
}

function drawProspectOpportunity(
  doc,
  scores,
  issues
) {
  const opportunity =
    getProspectOpportunity(
      scores,
      issues
    );

  const x =
    PAGE.left;

  const width =
    PAGE.width;

  const y =
    doc.y;

  const height = 155;

  ensureSpace(
    doc,
    height + 15
  );

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      10
    )
    .fillColor(
      BRAND.lighter
    )
    .fill();

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      10
    )
    .strokeColor(
      BRAND.border
    )
    .lineWidth(1)
    .stroke();

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(13)
    .text(
      "PROSPECT OPPORTUNITY",
      x + 18,
      y + 16,
      {
        width: 250,
        lineGap: 0
      }
    );

  doc
    .fillColor(
      BRAND.muted
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(7.5)
    .text(
      "WEBSITE HEALTH",
      x + 18,
      y + 45,
      {
        lineGap: 0
      }
    );

  doc
    .fillColor(
      getScoreColor(
        opportunity.score
      )
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(20)
    .text(
      formatScore(
        opportunity.score
      ),
      x + 18,
      y + 56,
      {
        lineGap: 0
      }
    );

  doc
    .fillColor(
      BRAND.muted
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(7.5)
    .text(
      "OPPORTUNITY",
      x + 160,
      y + 45,
      {
        lineGap: 0
      }
    );

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(15)
    .text(
      opportunity.opportunity,
      x + 160,
      y + 56,
      {
        lineGap: 0
      }
    );

  doc
    .fillColor(
      BRAND.muted
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(7.5)
    .text(
      "POTENTIAL AREAS FOR IMPROVEMENT",
      x + 18,
      y + 91,
      {
        lineGap: 0
      }
    );

  doc
    .fillColor(
      BRAND.text
    )
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      opportunity.services
        .map(
          service =>
            `• ${service}`
        )
        .join("\n"),
      x + 18,
      y + 104,
      {
        width:
          width - 36,
        lineGap: 2
      }
    );

  doc.y =
    y +
    height +
    14;

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * FINAL WEBSITE RESCUE PLAN
 * ============================================================
 */

function drawFinalPage(
  doc,
  scores,
  issues
) {
  sectionTitle(
    doc,
    "Your Website Rescue Plan",
    "Practical next steps based on this website assessment."
  );

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(16)
    .text(
      "What happens next?",
      PAGE.left,
      doc.y,
      {
        width:
          PAGE.width
      }
    );

  doc.moveDown(0.7);

  const overall =
    numericScore(
      scores?.overall
    );

  const summaryText =
    `Your website received an overall health score of ${formatScore(
      overall
    )}. The assessment identified practical opportunities to strengthen visibility, usability, performance and customer conversion.`;

  doc
    .fillColor(
      BRAND.text
    )
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      summaryText,
      PAGE.left,
      doc.y,
      {
        width:
          PAGE.width,
        lineGap: 3
      }
    );

  doc.moveDown(1.3);

  /*
   * PROSPECT OPPORTUNITY
   */

  drawProspectOpportunity(
    doc,
    scores,
    issues
  );

  doc.moveDown(0.5);

  /*
   * NEXT STEPS
   */

  const nextSteps = [
    "Address the highest-priority issues identified in this assessment.",
    "Improve search visibility and technical SEO.",
    "Strengthen accessibility and mobile usability.",
    "Improve customer contact and conversion opportunities.",
    "Monitor website health regularly."
  ];

  nextSteps.forEach(
    (step, index) => {
      const stepHeight =
        getNumberedStepHeight(
          doc,
          step
        );

      ensureSpace(
        doc,
        stepHeight + 6
      );

      drawNumberedStep(
        doc,
        index + 1,
        step
      );
    }
  );

  doc.moveDown(1.5);

  /*
   * CTA
   */

  const boxX =
    PAGE.left;

  const boxWidth =
    PAGE.width;

  const boxHeight =
    145;

  ensureSpace(
    doc,
    boxHeight + 20
  );

  const boxY =
    doc.y;

  doc
    .roundedRect(
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      12
    )
    .fillColor(
      BRAND.dark
    )
    .fill();

  doc
    .fillColor(
      BRAND.white
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(18)
    .text(
      "Ready to improve your website?",
      boxX + 25,
      boxY + 22,
      {
        width: 445
      }
    );

  doc
    .fillColor(
      "#D1D5DB"
    )
    .font("Helvetica")
    .fontSize(10)
    .text(
      "Site Rescue Studio can help turn the findings in this report into practical improvements that make your website easier to find, easier to use and better equipped to generate enquiries.",
      boxX + 25,
      boxY + 54,
      {
        width: 445,
        lineGap: 2
      }
    );

  drawWebsiteButton(
    doc,
    "Visit Site Rescue Studio",
    SITE_RESCUE_URL,
    boxX + 25,
    boxY + 105,
    220,
    32,
    true
  );

  doc
    .fillColor(
      "#9CA3AF"
    )
    .font("Helvetica")
    .fontSize(8)
    .text(
      SITE_RESCUE_URL
        .replace(
          /^https?:\/\//,
          ""
        )
        .replace(
          /\/$/,
          ""
        ),
      boxX + 265,
      boxY + 116,
      {
        width: 200
      }
    );

  doc.y =
    boxY +
    boxHeight +
    15;

  doc.x = PAGE.left;

  /*
   * CLOSING BRAND
   */

  ensureSpace(
    doc,
    45
  );

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(14)
    .text(
      "SITE RESCUE STUDIO",
      PAGE.left,
      doc.y,
      {
        width:
          PAGE.width,
        align: "center"
      }
    );

  doc.moveDown(0.2);

  doc
    .fillColor(
      BRAND.muted
    )
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Fix. Improve. Grow.",
      PAGE.left,
      doc.y,
      {
        width:
          PAGE.width,
        align: "center"
      }
    );

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * WEBSITE BUTTON
 * ============================================================
 */

function drawWebsiteButton(
  doc,
  text,
  url,
  x,
  y,
  width,
  height,
  dark = false,
  accent = false
) {
  let background;
  let textColor;

  if (accent) {
    background =
      BRAND.blue;
    textColor =
      BRAND.white;
  } else if (dark) {
    background =
      BRAND.white;
    textColor =
      BRAND.dark;
  } else {
    background =
      BRAND.dark;
    textColor =
      BRAND.white;
  }

  if (accent) {
    doc
      .roundedRect(
        x,
        y + 2,
        width,
        height,
        8
      )
      .fillColor(
        "#1D4ED8"
      )
      .fill();
  }

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .fillColor(
      background
    )
    .fill();

  if (accent) {
    doc
      .roundedRect(
        x,
        y,
        width,
        height,
        8
      )
      .lineWidth(0.8)
      .strokeColor(
        "#1D4ED8"
      )
      .stroke();
  }

  doc
    .fillColor(
      textColor
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(10)
    .text(
      String(text),
      x,
      y + 11,
      {
        width,
        height:
          height - 8,
        align: "center",
        lineGap: 0
      }
    );

  /*
   * IMPORTANT:
   * Keep this hyperlink. It is intentional.
   */

  doc.link(
    x,
    y,
    width,
    height,
    url
  );
}

/*
 * ============================================================
 * SECTION TITLE
 * ============================================================
 */

function sectionTitle(
  doc,
  title,
  subtitle
) {
  const x =
    PAGE.left;

  const width =
    PAGE.width;

  doc
    .font(
      "Helvetica-Bold"
    )
    .fontSize(23);

  const titleHeight =
    doc.heightOfString(
      String(title || ""),
      {
        width,
        lineGap: 0
      }
    );

  doc
    .font("Helvetica")
    .fontSize(10);

  const subtitleHeight =
    doc.heightOfString(
      String(
        subtitle || ""
      ),
      {
        width,
        lineGap: 2
      }
    );

  const requiredHeight =
    titleHeight +
    8 +
    subtitleHeight +
    18;

  ensureSpace(
    doc,
    requiredHeight
  );

  doc.x = x;

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(23)
    .text(
      String(title || ""),
      x,
      doc.y,
      {
        width,
        lineGap: 0
      }
    );

  doc.moveDown(0.35);

  doc
    .fillColor(
      BRAND.muted
    )
    .font("Helvetica")
    .fontSize(10)
    .text(
      String(
        subtitle || ""
      ),
      x,
      doc.y,
      {
        width,
        lineGap: 2
      }
    );

  doc.moveDown(1);

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * SUBHEADING
 * ============================================================
 */

function drawSubheading(
  doc,
  text
) {
  ensureSpace(
    doc,
    35
  );

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(12)
    .text(
      String(text || ""),
      PAGE.left,
      doc.y,
      {
        width:
          PAGE.width,
        lineGap: 0
      }
    );

  doc.moveDown(0.35);

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * HEADER
 * ============================================================
 */

function drawHeader(doc) {
  const y = 28;

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(7.5)
    .text(
      "SITE RESCUE STUDIO",
      PAGE.left,
      y,
      {
        width: 150,
        lineGap: 0
      }
    );

  doc
    .fillColor(
      BRAND.muted
    )
    .font("Helvetica")
    .fontSize(6.5)
    .text(
      "FIX. IMPROVE. GROW.",
      PAGE.left + 350,
      y,
      {
        width: 145,
        align: "right",
        lineGap: 0
      }
    );

  doc
    .strokeColor(
      BRAND.border
    )
    .lineWidth(0.5)
    .moveTo(
      PAGE.left,
      43
    )
    .lineTo(
      PAGE.left +
        PAGE.width,
      43
    )
    .stroke();

  doc.y =
    PAGE.top;

  doc.x =
    PAGE.left;
}

/*
 * ============================================================
 * FOOTERS
 * ============================================================
 */

function addFooters(doc) {
  const range =
    doc.bufferedPageRange();

  for (
    let i = range.start;
    i <
      range.start +
        range.count;
    i++
  ) {
    doc.switchToPage(i);

    const originalBottomMargin =
      doc.page.margins.bottom;

    doc.page.margins.bottom =
      20;

    const footerY =
      doc.page.height -
      35;

    const left =
      PAGE.left;

    const right =
      PAGE.left +
      PAGE.width;

    doc.save();

    doc
      .strokeColor(
        BRAND.border
      )
      .lineWidth(0.5)
      .moveTo(
        left,
        footerY - 8
      )
      .lineTo(
        right,
        footerY - 8
      )
      .stroke();

    doc
      .fillColor(
        BRAND.muted
      )
      .font("Helvetica")
      .fontSize(7)
      .text(
        "SITE RESCUE STUDIO • Fix. Improve. Grow.",
        left,
        footerY,
        {
          width: 240,
          lineGap: 0,
          lineBreak: false
        }
      );

    const footerUrl =
      "site-rescue-studio.vercel.app";

    doc
      .fillColor(
        BRAND.blue
      )
      .font("Helvetica")
      .fontSize(7)
      .text(
        footerUrl,
        295,
        footerY,
        {
          width: 145,
          align: "right",
          lineGap: 0,
          lineBreak: false
        }
      );

    /*
     * IMPORTANT:
     * Keep the footer hyperlink.
     */

    doc.link(
      295,
      footerY,
      145,
      12,
      SITE_RESCUE_URL
    );

    doc
      .fillColor(
        BRAND.muted
      )
      .font("Helvetica")
      .fontSize(7)
      .text(
        `Page ${
          i -
          range.start +
          1
        } of ${
          range.count
        }`,
        460,
        footerY,
        {
          width: 75,
          align: "right",
          lineGap: 0,
          lineBreak: false
        }
      );

    doc.restore();

    doc.page.margins.bottom =
      originalBottomMargin;
  }
}

/*
 * ============================================================
 * DIVIDER
 * ============================================================
 */

function drawDivider(doc) {
  const y =
    doc.y;

  doc
    .strokeColor(
      BRAND.border
    )
    .lineWidth(0.7)
    .moveTo(
      PAGE.left,
      y
    )
    .lineTo(
      PAGE.left +
        PAGE.width,
      y
    )
    .stroke();

  doc.y =
    y + 10;

  doc.x =
    PAGE.left;
}

/*
 * ============================================================
 * NORMALIZATION HELPERS
 * ============================================================
 */

function normalizeIssue(
  issue
) {
  if (
    typeof issue ===
    "string"
  ) {
    return {
      title: issue,
      description: "",
      severity: "info"
    };
  }

  const item =
    issue || {};

  return {
    title:
      item.title ||
      item.name ||
      "Website issue",

    description:
      item.description ||
      item.detail ||
      item.message ||
      "",

    severity:
      item.severity ||
      "info"
  };
}

function getDisplayValue(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not available";
  }

  return String(value);
}

function cleanDisplayUrl(
  value
) {
  try {
    return new URL(
      value
    ).pathname || "/";
  } catch {
    return String(
      value || ""
    );
  }
}

/*
 * ============================================================
 * SCORING HELPERS
 * ============================================================
 */

function cleanUrl(url) {
  try {
    return new URL(
      url
    ).hostname;
  } catch {
    return String(
      url || ""
    );
  }
}

function isFiniteNumber(
  value
) {
  return (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  );
}

function numericScore(
  score
) {
  if (
    score === null ||
    score === undefined ||
    score === ""
  ) {
    return null;
  }

  const value =
    typeof score ===
    "number"
      ? score
      : Number(score);

  if (
    !Number.isFinite(value)
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      100,
      value
    )
  );
}

function formatScore(
  score
) {
  return Number.isFinite(
    score
  )
    ? `${score}/100`
    : "Not available";
}

function getOverallLabel(
  score
) {
  if (
    !Number.isFinite(score)
  ) {
    return "Assessment completed";
  }

  if (score >= 90) {
    return "Excellent";
  }

  if (score >= 75) {
    return "Good";
  }

  if (score >= 60) {
    return "Needs Improvement";
  }

  return "Poor";
}

function getOverallDescription(
  score
) {
  if (
    !Number.isFinite(score)
  ) {
    return "The website assessment has been completed.";
  }

  if (score >= 90) {
    return "The website is performing strongly across the main areas assessed.";
  }

  if (score >= 75) {
    return "The website is in generally good shape, with several practical opportunities for improvement.";
  }

  if (score >= 60) {
    return "The website has a solid foundation, but several areas could be improved to strengthen visibility, usability and conversion.";
  }

  return "The assessment identified several important areas that may benefit from attention.";
}

function getOverviewDescription(
  score
) {
  return getOverallDescription(
    numericScore(score)
  );
}

function getScoreColor(
  score
) {
  if (
    !Number.isFinite(score)
  ) {
    return BRAND.muted;
  }

  if (score >= 90) {
    return BRAND.green;
  }

  if (score >= 75) {
    return BRAND.blue;
  }

  if (score >= 60) {
    return BRAND.orange;
  }

  return BRAND.red;
}

/*
 * ============================================================
 * SEVERITY HELPERS
 * ============================================================
 */

function getSeverityInfo(
  severity
) {
  const value =
    String(
      severity ||
      "info"
    ).toLowerCase();

  if (
    value === "high"
  ) {
    return {
      label: "HIGH",
      color: BRAND.red,
      bg: BRAND.redLight
    };
  }

  if (
    value === "medium"
  ) {
    return {
      label: "MEDIUM",
      color: BRAND.orange,
      bg: BRAND.orangeLight
    };
  }

  if (
    value === "low"
  ) {
    return {
      label: "LOW",
      color: BRAND.blue,
      bg: BRAND.blueLight
    };
  }

  return {
    label: "INFO",
    color: BRAND.green,
    bg: BRAND.greenLight
  };
}

function countSeverity(
  issues,
  severity
) {
  if (
    !Array.isArray(issues)
  ) {
    return 0;
  }

  return issues.filter(
    issue => {
      if (
        !issue ||
        typeof issue !==
          "object"
      ) {
        return false;
      }

      return (
        String(
          issue.severity ||
            ""
        ).toLowerCase() ===
        severity
      );
    }
  ).length;
}

/*
 * ============================================================
 * DATE
 * ============================================================
 */

function formatDate(
  scannedAt
) {
  try {
    const date =
      scannedAt
        ? new Date(
            scannedAt
          )
        : new Date();

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      throw new Error(
        "Invalid date"
      );
    }

    return date.toLocaleDateString(
      "en-ZA",
      {
        year: "numeric",
        month: "long",
        day: "numeric"
      }
    );

  } catch {
    return new Date().toLocaleDateString(
      "en-ZA",
      {
        year: "numeric",
        month: "long",
        day: "numeric"
      }
    );
  }
}