const PDFDocument = require("pdfkit");
const path = require("path");

/*
 * ============================================================
 * SITE RESCUE STUDIO
 * WEBSITE RESCUE REPORT GENERATOR
 * ============================================================
 */

const SITE_RESCUE_URL = "https://site-rescue-studio.vercel.app/";

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
      pageSpeed = null,
      counts = {},
      linkHealth = {},
      responseTime,
      scannedAt
    } = data;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "The report requires a website URL."
      });
    }

    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: PAGE.top,
        bottom: PAGE.bottom,
        left: PAGE.left,
        right: PAGE.right
      },
      bufferPages: true,
      autoFirstPage: true
    });

    const chunks = [];

    doc.on("data", chunk => {
      chunks.push(chunk);
    });

    const pdfFinished = new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    /*
     * ----------------------------------------------------------
     * PAGE 1 — COVER
     * ----------------------------------------------------------
     */

    drawCover(
      doc,
      url,
      scores,
      scannedAt
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
     * PERFORMANCE
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
      recommendations
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
      responseTime
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
 * PAGE MANAGEMENT
 * ============================================================
 */

/*
 * Create a standard report page.
 */

function addReportPage(doc) {
  doc.addPage();

  drawHeader(doc);

  doc.x = PAGE.left;
  doc.y = PAGE.top;
}

/*
 * Bottom edge of the usable content area.
 */

function contentBottom(doc) {
  return doc.page.height - PAGE.bottom;
}

/*
 * Top edge of usable content.
 */

function contentTop() {
  return PAGE.top;
}

/*
 * ============================================================
 * ENSURE SPACE
 * ============================================================
 *
 * Keeps blocks together whenever possible.
 *
 * Important:
 * A block that is taller than a complete page cannot be kept
 * together. In that case we allow it to begin on a fresh page
 * rather than repeatedly creating blank pages.
 */

function ensureSpace(
  doc,
  requiredHeight
) {
  const safeHeight = Math.max(
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

  /*
   * If we're already near the top of a fresh page,
   * don't create another page unnecessarily.
   */

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
  scannedAt
) {
  /*
   * Full-page branded cover background.
   */
  doc
    .save()
    .rect(
      0,
      0,
      doc.page.width,
      doc.page.height
    )
    .fillColor("#1F2937")
    .fill()
    .restore();

  doc.fillColor(BRAND.white);

  const overall =
    numericScore(
      scores?.overall
    );

  const scoreColor =
    getScoreColor(overall);

  /*
   * Site Rescue Studio logo
   *
   * The logo is loaded from the project assets directory so
   * the same brand asset is used by the website and PDF.
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

    /*
     * Fallback keeps the report usable if the asset is
     * temporarily unavailable.
     */
    doc
      .fillColor(BRAND.white)
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(
        "SITE RESCUE STUDIO",
        {
          align: "center"
        }
      );
  }

  /*
   * ----------------------------------------------------------
   * REPORT TITLE
   * ----------------------------------------------------------
   *
   * Position the title explicitly below the logo so the
   * logo and title never overlap.
   */
  doc
    .fillColor(BRAND.white)
    .font("Helvetica-Bold")
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
    .fillColor(BRAND.light)
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
    .font("Helvetica-Bold")
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
    .fillColor(BRAND.white)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(
      getOverallLabel(overall),
      {
        align: "center"
      }
    );

  doc.moveDown(1);

  doc
    .fillColor(BRAND.light)
    .font("Helvetica")
    .fontSize(11)
    .text(
      getOverallDescription(overall),
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
    .fillColor(BRAND.muted)
    .font("Helvetica")
    .fontSize(10)
    .text(
      `Generated ${formatDate(scannedAt)}`,
      {
        align: "center"
      }
    );

  doc.moveDown(1);

  doc
    .fillColor(BRAND.text)
    .font("Helvetica-Bold")
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
    "Visit Site Rescue Studio →",
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
    .fillColor(BRAND.text)
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
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("Health Scores");

  doc.moveDown(0.8);

  const scoreRows = [
    ["Overall", scores?.overall],
    ["SEO", scores?.seo],
    ["Performance", scores?.performance],
    ["Mobile", scores?.mobile],
    ["Accessibility", scores?.accessibility],
    ["Business", scores?.business],
    ["Technical", scores?.technical]
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
    .fillColor(BRAND.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(
      "The assessment combines technical website checks with SEO, mobile, accessibility, business and performance indicators. Scores are intended to highlight practical improvement opportunities rather than replace a full professional audit.",
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

  const startX = PAGE.left;
  const startY = doc.y;

  rows.forEach(
    ([label, score], index) => {
      const column =
        index % 2;

      const row =
        Math.floor(index / 2);

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
    .fillColor(BRAND.lighter)
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
    .strokeColor(BRAND.border)
    .stroke();

  doc
    .fillColor(BRAND.muted)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      String(label).toUpperCase(),
      x + 13,
      y + 10,
      {
        width: width - 26,
        lineGap: 0
      }
    );

  doc
    .fillColor(color)
    .font("Helvetica-Bold")
    .fontSize(17)
    .text(
      formatScore(value),
      x + 13,
      y + 27,
      {
        width: width - 26,
        lineGap: 0
      }
    );

  const barX =
    x + 13;

  const barY =
    y + height - 9;

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
    .fillColor(BRAND.border)
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
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
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
        .fillColor(card.bg)
        .fill();

      doc
        .fillColor(card.color)
        .font("Helvetica-Bold")
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
        .fillColor(BRAND.dark)
        .font("Helvetica-Bold")
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
      pageSpeed?.scores?.performance
    ],
    [
      "Accessibility",
      pageSpeed?.scores?.accessibility
    ],
    [
      "Best Practices",
      pageSpeed?.scores?.bestPractices
    ],
    [
      "SEO",
      pageSpeed?.scores?.seo
    ]
  ];

  drawScoreDashboard(
    doc,
    performanceRows
  );

  doc.moveDown(1);

  doc
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(
      "Core Web Vitals"
    );

  doc.moveDown(0.8);

  const vitals =
    pageSpeed?.vitals || {};

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
      title || "Website issue"
    );

  const descriptionText =
    String(
      description || ""
    );

  /*
   * Title measurement.
   */

  doc.font("Helvetica-Bold")
    .fontSize(12);

  const titleHeight =
    doc.heightOfString(
      titleText,
      {
        width: 300,
        lineGap: 1
      }
    );

  /*
   * Description measurement.
   */

  let descriptionHeight = 0;

  if (descriptionText) {
    doc.font("Helvetica")
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

  /*
   * Background.
   */

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .fillColor(BRAND.lighter)
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
    .strokeColor(BRAND.border)
    .stroke();

  /*
   * Number badge.
   */

  doc
    .roundedRect(
      x + 12,
      y + 9,
      30,
      30,
      6
    )
    .fillColor(BRAND.dark)
    .fill();

  doc
    .fillColor(BRAND.white)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(
      String(number).padStart(2, "0"),
      x + 12,
      y + 18,
      {
        width: 30,
        align: "center",
        lineGap: 0
      }
    );

  /*
   * Title.
   */

  doc
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(
      String(
        title || "Website issue"
      ),
      x + 55,
      y + 9,
      {
        width: 300,
        lineGap: 1
      }
    );

  /*
   * Severity badge.
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
    .font("Helvetica-Bold")
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
   * Description.
   */

  if (description) {
    doc
      .font("Helvetica-Bold")
      .fontSize(12);

    const titleHeight =
      doc.heightOfString(
        String(
          title || "Website issue"
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
        12 + titleHeight
      );

    doc
      .fillColor(BRAND.muted)
      .font("Helvetica-Bold")
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
      .fillColor(BRAND.text)
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

  /*
   * Cursor below card.
   */

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
    !Array.isArray(recommendations) ||
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
      item.why || ""
    );

  const action =
    String(
      item.action || ""
    );

  const service =
    String(
      item.service || ""
    );

  const contentWidth = 455;

  /*
   * Measure using the same font settings as
   * the renderer.
   */

  doc
    .font("Helvetica-Bold")
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
      .font("Helvetica-Bold")
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

  /*
   * Header.
   */

  let height =
    Math.max(
      68,
      29 +
        titleHeight +
        14
    );

  /*
   * Why.
   */

  if (why) {
    height +=
      12 +
      whyHeight +
      12;
  }

  /*
   * Action.
   */

  if (action) {
    height +=
      12 +
      actionHeight +
      12;
  }

  /*
   * Service.
   */

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
      item.why || ""
    );

  const action =
    String(
      item.action || ""
    );

  const service =
    String(
      item.service || ""
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

  /*
   * Card background.
   */

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      9
    )
    .fillColor(BRAND.white)
    .fill();

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      9
    )
    .strokeColor(BRAND.border)
    .lineWidth(1)
    .stroke();

  /*
   * Left accent.
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
   * Number.
   */

  doc
    .fillColor(BRAND.muted)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      String(number).padStart(2, "0"),
      x + 18,
      y + 14,
      {
        width: 30,
        lineGap: 0
      }
    );

  /*
   * Title.
   */

  doc
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
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
   * Priority badge.
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
    .font("Helvetica-Bold")
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
   * Calculate title height using the exact
   * rendering settings.
   */

  doc
    .font("Helvetica-Bold")
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
      .fillColor(BRAND.muted)
      .font("Helvetica-Bold")
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
      .fillColor(BRAND.text)
      .font("Helvetica")
      .fontSize(9.5)
      .text(
        why,
        x + 18,
        currentY,
        {
          width: contentWidth,
          lineGap: 2
        }
      );

    currentY +=
      doc.heightOfString(
        why,
        {
          width: contentWidth,
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
      .fillColor(BRAND.muted)
      .font("Helvetica-Bold")
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
      .fillColor(BRAND.text)
      .font("Helvetica")
      .fontSize(9.5)
      .text(
        action,
        x + 18,
        currentY,
        {
          width: contentWidth,
          lineGap: 2
        }
      );

    currentY +=
      doc.heightOfString(
        action,
        {
          width: contentWidth,
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
      .fillColor(BRAND.muted)
      .font("Helvetica-Bold")
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
      .fillColor(BRAND.blue)
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(
        service,
        x + 18,
        currentY,
        {
          width: contentWidth,
          lineGap: 0
        }
      );
  }

  /*
   * Cursor below complete card.
   */

  doc.y =
    y +
    height +
    14;

  doc.x = PAGE.left;
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
  responseTime
) {
  metadata =
    metadata || {};

  counts =
    counts || {};

  linkHealth =
    linkHealth || {};

  sectionTitle(
    doc,
    "Website Information",
    "Technical and metadata information detected during the scan."
  );

  /*
   * ----------------------------------------------------------
   * WEBSITE METADATA
   * ----------------------------------------------------------
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
    ]
  ];

  drawKeyValueRows(
    doc,
    metadataRows
  );

  doc.moveDown(1);

  /*
   * ----------------------------------------------------------
   * TECHNICAL SNAPSHOT
   * ----------------------------------------------------------
   */

  drawSubheading(
    doc,
    "Technical Snapshot"
  );

  const technicalRows = [
    [
      "Initial response time",
      isFiniteNumber(responseTime)
        ? `${responseTime} ms`
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
   * ----------------------------------------------------------
   * LINK HEALTH
   * ----------------------------------------------------------
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

  /*
   * ----------------------------------------------------------
   * ABOUT THIS ASSESSMENT
   * ----------------------------------------------------------
   */

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
  const x = PAGE.left;
  const width = PAGE.width;
  const y = doc.y;

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

  /*
   * Background.
   */

  doc
    .roundedRect(
      x,
      y,
      width,
      rowHeight,
      5
    )
    .fillColor(BRAND.lighter)
    .fill();

  /*
   * Label.
   */

  doc
    .fillColor(BRAND.muted)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(
      String(label).toUpperCase(),
      x + 12,
      y + 7,
      {
        width: 135,
        lineGap: 0
      }
    );

  /*
   * Value.
   */

  doc
    .fillColor(BRAND.text)
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

  /*
   * Cursor below row.
   */

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
  const x = PAGE.left;
  const width = PAGE.width;

  const paddingX = 15;
  const innerWidth =
    width -
    paddingX * 2;

  const titleText =
    String(title || "");

  const bodyText =
    String(text || "");

  /*
   * Measure title using actual font.
   */

  doc
    .font("Helvetica-Bold")
    .fontSize(9);

  const titleHeight =
    doc.heightOfString(
      titleText,
      {
        width: innerWidth,
        lineGap: 0
      }
    );

  /*
   * Measure body using actual font.
   */

  doc
    .font("Helvetica")
    .fontSize(9.5);

  const bodyHeight =
    doc.heightOfString(
      bodyText,
      {
        width: innerWidth,
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

  const y = doc.y;

  /*
   * Background.
   */

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .fillColor(BRAND.blueLight)
    .fill();

  /*
   * Title.
   */

  doc
    .fillColor(BRAND.blue)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(
      titleText,
      x + paddingX,
      y + 12,
      {
        width: innerWidth,
        lineGap: 0
      }
    );

  /*
   * Body.
   */

  doc
    .fillColor(BRAND.text)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      bodyText,
      x + paddingX,
      y + textTop,
      {
        width: innerWidth,
        lineGap: 2
      }
    );

  /*
   * Cursor below box.
   */

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
    String(text || "");

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
  const x = PAGE.left;
  const y = doc.y;

  const textValue =
    String(text || "");

  const textWidth = 450;

  const rowHeight =
    getNumberedStepHeight(
      doc,
      textValue
    );

  /*
   * Number circle.
   */

  doc
    .circle(
      x + 12,
      y + 12,
      12
    )
    .fillColor(BRAND.blue)
    .fill();

  /*
   * Number.
   */

  doc
    .fillColor(BRAND.white)
    .font("Helvetica-Bold")
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

  /*
   * Text.
   */

  doc
    .fillColor(BRAND.text)
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

  /*
   * Cursor below step.
   */

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

  /*
   * Base opportunity from overall health.
   */

  let opportunity =
    "Low";

  if (
    !Number.isFinite(overall)
  ) {
    opportunity = "Review";
  } else if (
    overall < 60
  ) {
    opportunity = "Very High";
  } else if (
    overall < 70
  ) {
    opportunity = "High";
  } else if (
    overall < 80
  ) {
    opportunity = "Good";
  } else if (
    overall < 90
  ) {
    opportunity = "Moderate";
  }

  /*
   * Commercial opportunity can increase
   * when multiple issues are present.
   */

  if (
    Number.isFinite(overall) &&
    totalIssues >= 6 &&
    overall < 85
  ) {
    opportunity =
      overall < 70
        ? "Very High"
        : "High";
  }

  /*
   * Identify potential service areas.
   */

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

  /*
   * Provide sensible defaults.
   */

  if (
    services.length === 0
  ) {
    services.push(
      "Website optimisation"
    );
  }

  return {
    score: overall,
    opportunity,
    services: services.slice(0, 4)
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

  const x = PAGE.left;
  const width = PAGE.width;
  const y = doc.y;

  const height = 155;

  ensureSpace(
    doc,
    height + 15
  );

  /*
   * Card background.
   */

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      10
    )
    .fillColor(BRAND.lighter)
    .fill();

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      10
    )
    .strokeColor(BRAND.border)
    .lineWidth(1)
    .stroke();

  /*
   * Heading.
   */

  doc
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
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

  /*
   * Health score.
   */

  doc
    .fillColor(BRAND.muted)
    .font("Helvetica-Bold")
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
    .font("Helvetica-Bold")
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

  /*
   * Opportunity.
   */

  doc
    .fillColor(BRAND.muted)
    .font("Helvetica-Bold")
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
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(
      opportunity.opportunity,
      x + 160,
      y + 56,
      {
        lineGap: 0
      }
    );

  /*
   * Potential improvement areas.
   */

  doc
    .fillColor(BRAND.muted)
    .font("Helvetica-Bold")
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
    .fillColor(BRAND.text)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      opportunity.services
        .map(
          service => `• ${service}`
        )
        .join("\n"),
      x + 18,
      y + 104,
      {
        width: width - 36,
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

  /*
   * ----------------------------------------------------------
   * SUMMARY
   * ----------------------------------------------------------
   */

  doc
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(
      "What happens next?",
      PAGE.left,
      doc.y,
      {
        width: PAGE.width
      }
    );

  doc.moveDown(0.7);

  const overall =
    numericScore(
      scores?.overall
    );

  const summaryText =
    `Your website received an overall health score of ${formatScore(overall)}. The assessment identified practical opportunities to strengthen visibility, usability, performance and customer conversion.`;

  doc
    .fillColor(BRAND.text)
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      summaryText,
      PAGE.left,
      doc.y,
      {
        width: PAGE.width,
        lineGap: 3
      }
    );

  doc.moveDown(1.3);

    /*
   * ----------------------------------------------------------
   * PROSPECT OPPORTUNITY
   * ----------------------------------------------------------
   */

    drawProspectOpportunity(
      doc,
      scores,
      arguments[2] || []
    );
  
    doc.moveDown(0.5);

  /*
   * ----------------------------------------------------------
   * NEXT STEPS
   * ----------------------------------------------------------
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
   * ----------------------------------------------------------
   * CTA
   * ----------------------------------------------------------
   */

  const boxX = PAGE.left;
  const boxWidth = PAGE.width;
  const boxHeight = 145;

  ensureSpace(
    doc,
    boxHeight + 20
  );

  const boxY = doc.y;

  /*
   * CTA background.
   */

  doc
    .roundedRect(
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      12
    )
    .fillColor(BRAND.dark)
    .fill();

  /*
   * Heading.
   */

  doc
    .fillColor(BRAND.white)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(
      "Ready to improve your website?",
      boxX + 25,
      boxY + 22,
      {
        width: 445
      }
    );

  /*
   * Description.
   */

  doc
    .fillColor("#D1D5DB")
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

  /*
   * CTA button.
   */

  drawWebsiteButton(
    doc,
    "Visit Site Rescue Studio →",
    SITE_RESCUE_URL,
    boxX + 25,
    boxY + 105,
    220,
    32,
    true
  );

  /*
   * Website URL.
   */

  doc
    .fillColor("#9CA3AF")
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

  /*
   * Move below CTA.
   */

  doc.y =
    boxY +
    boxHeight +
    15;

  doc.x = PAGE.left;

  /*
   * ----------------------------------------------------------
   * CLOSING BRAND
   * ----------------------------------------------------------
   */

  ensureSpace(
    doc,
    45
  );

  doc
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(
      "SITE RESCUE STUDIO",
      PAGE.left,
      doc.y,
      {
        width: PAGE.width,
        align: "center"
      }
    );

  doc.moveDown(0.2);

  doc
    .fillColor(BRAND.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Fix. Improve. Grow.",
      PAGE.left,
      doc.y,
      {
        width: PAGE.width,
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
  /*
   * ----------------------------------------------------------
   * BUTTON COLORS
   * ----------------------------------------------------------
   *
   * Default:
   *   Dark background + white text
   *
   * Dark CTA:
   *   White background + dark text
   *
   * Accent CTA:
   *   Site Rescue blue background + white text
   */

  let background;
  let textColor;

  if (accent) {
    background = BRAND.blue;
    textColor = BRAND.white;
  } else if (dark) {
    background = BRAND.white;
    textColor = BRAND.dark;
  } else {
    background = BRAND.dark;
    textColor = BRAND.white;
  }

  /*
   * ----------------------------------------------------------
   * BUTTON SHADOW / BORDER
   * ----------------------------------------------------------
   */

  if (accent) {
    doc
      .roundedRect(
        x,
        y + 2,
        width,
        height,
        8
      )
      .fillColor("#1D4ED8")
      .fill();
  }

  /*
   * ----------------------------------------------------------
   * BACKGROUND
   * ----------------------------------------------------------
   */

  doc
    .roundedRect(
      x,
      y,
      width,
      height,
      8
    )
    .fillColor(background)
    .fill();

  /*
   * Subtle border makes the button feel more defined.
   */

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
      .strokeColor("#1D4ED8")
      .stroke();
  }

  /*
   * ----------------------------------------------------------
   * LABEL
   * ----------------------------------------------------------
   */

  doc
    .fillColor(textColor)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(
      String(text),
      x,
      y + 11,
      {
        width,
        height: height - 8,
        align: "center",
        lineGap: 0
      }
    );

  /*
   * ----------------------------------------------------------
   * CLICKABLE HYPERLINK
   * ----------------------------------------------------------
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
  const x = PAGE.left;
  const width = PAGE.width;

  /*
   * Estimate heading block before drawing.
   */

  doc
    .font("Helvetica-Bold")
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
      String(subtitle || ""),
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

  /*
   * Heading.
   */

  doc
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
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

  /*
   * Subtitle.
   */

  doc.moveDown(0.35);

  doc
    .fillColor(BRAND.muted)
    .font("Helvetica")
    .fontSize(10)
    .text(
      String(subtitle || ""),
      x,
      doc.y,
      {
        width,
        lineGap: 2
      }
    );

  /*
   * Space after section heading.
   */

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
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(
      String(text || ""),
      PAGE.left,
      doc.y,
      {
        width: PAGE.width,
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

  /*
   * Brand.
   */

  doc
    .fillColor(BRAND.dark)
    .font("Helvetica-Bold")
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

  /*
   * Tagline.
   */

  doc
    .fillColor(BRAND.muted)
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

  /*
   * Divider.
   */

  doc
    .strokeColor(BRAND.border)
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

  /*
   * Content starting position.
   */

  doc.y = PAGE.top;
  doc.x = PAGE.left;
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

    /*
     * --------------------------------------------------------
     * FOOTER AREA
     * --------------------------------------------------------
     *
     * The footer intentionally sits below the normal content
     * margin. PDFKit can treat that as page overflow and create
     * unwanted pages when doc.text() is used normally.
     *
     * Temporarily reduce the bottom margin while drawing the
     * footer so PDFKit knows this is an intentional footer area.
     */

    const originalBottomMargin =
      doc.page.margins.bottom;

    doc.page.margins.bottom = 20;

    const footerY =
      doc.page.height - 35;

    const left =
      PAGE.left;

    const right =
      PAGE.left +
      PAGE.width;

    doc.save();

    /*
     * --------------------------------------------------------
     * Divider
     * --------------------------------------------------------
     */

    doc
      .strokeColor(BRAND.border)
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

    /*
     * --------------------------------------------------------
     * Brand
     * --------------------------------------------------------
     */

    doc
      .fillColor(BRAND.muted)
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

    /*
     * --------------------------------------------------------
     * Website
     * --------------------------------------------------------
     */

    const footerUrl =
      "site-rescue-studio.vercel.app";

    doc
      .fillColor(BRAND.blue)
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
     * Clickable website.
     */

    doc.link(
      295,
      footerY,
      145,
      12,
      SITE_RESCUE_URL
    );

    /*
     * --------------------------------------------------------
     * Page number
     * --------------------------------------------------------
     */

    doc
      .fillColor(BRAND.muted)
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

    /*
     * Restore the normal content margin.
     */

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
  const y = doc.y;

  doc
    .strokeColor(BRAND.border)
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

  doc.x = PAGE.left;
}

/*
 * ============================================================
 * NORMALIZATION HELPERS
 * ============================================================
 */

function normalizeIssue(issue) {
  if (
    typeof issue === "string"
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
      "",

    severity:
      item.severity ||
      "info"
  };
}

function getDisplayValue(value) {
  /*
   * Do not use `value || ...`
   * because zero can be a valid result.
   */

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not available";
  }

  return String(value);
}

/*
 * ============================================================
 * SCORING HELPERS
 * ============================================================
 */

function cleanUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return String(url || "");
  }
}

function isFiniteNumber(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function numericScore(score) {
  /*
   * Accept both numeric values and numeric strings.
   */

  if (
    score === null ||
    score === undefined ||
    score === ""
  ) {
    return null;
  }

  const value =
    typeof score === "number"
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

function formatScore(score) {
  return Number.isFinite(score)
    ? `${score}/100`
    : "Not available";
}

function getOverallLabel(score) {
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

function getOverallDescription(score) {
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

function getOverviewDescription(score) {
  return getOverallDescription(
    numericScore(score)
  );
}

function getScoreColor(score) {
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
        ? new Date(scannedAt)
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