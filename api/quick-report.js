const PDFDocument =
  require("pdfkit");

const path =
  require("path");

const LOGO_PATH =
  path.join(
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
  blue: "#2563EB",
  green: "#16A34A",
  orange: "#D97706",
  red: "#DC2626"
};

const PAGE = {
  left: 50,
  right: 50,
  top: 58,
  bottom: 65,
  width: 495
};

module.exports =
  async function handler(
    req,
    res
  ) {

    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed."
      });
    }

    try {

      const data =
        req.body;

      if (
        !data ||
        typeof data !== "object"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "No scan data was provided."
        });
      }

      const url =
        data.finalUrl ||
        data.url;

      if (!url) {
        return res.status(400).json({
          success: false,
          error:
            "The report requires a website URL."
        });
      }

      const scores =
        data.scores || {};

      const issues =
        Array.isArray(data.issues)
          ? data.issues
          : [];

      const recommendations =
        Array.isArray(
          data.recommendations
        )
          ? data.recommendations
          : [];

      const scannedAt =
        data.scannedAt ||
        new Date().toISOString();

      const doc =
        new PDFDocument({
          size: "A4",
          margins: {
            top: PAGE.top,
            bottom: PAGE.bottom,
            left: PAGE.left,
            right: PAGE.right
          },
          info: {
            Title:
              "Site Rescue Studio — Website Quick Check Report",
            Author:
              "Site Rescue Studio",
            Subject:
              "Website Quick Check"
          }
        });

      const chunks = [];

      doc.on(
        "data",
        chunk => chunks.push(chunk)
      );

      const finished =
        new Promise(
          (resolve, reject) => {
            doc.on(
              "end",
              resolve
            );

            doc.on(
              "error",
              reject
            );
          }
        );

      /*
       * ========================================================
       * PAGE 1 — COVER
       * ========================================================
       */

      drawCover(
        doc,
        url,
        scores,
        scannedAt,
        data._sampleReport
      );

      /*
       * ========================================================
       * PAGE 2 — SCORECARD
       * ========================================================
       */

      addPage(doc);

      sectionTitle(
        doc,
        "Website Health Scorecard",
        "A quick overview of the main website health areas."
      );

      const scoreRows = [
        ["Overall", scores.overall],
        ["SEO", scores.seo],
        ["Performance", scores.performance],
        ["Mobile", scores.mobile],
        ["Accessibility", scores.accessibility],
        ["Technical", scores.technical],
        ["Business", scores.business],
        ["Security & Trust", scores.security]
      ];

      drawScoreGrid(
        doc,
        scoreRows
      );

      /*
       * ========================================================
       * PAGE 3 — TOP FINDINGS
       * ========================================================
       */

      addPage(doc);

      sectionTitle(
        doc,
        "Key Findings",
        "The most important issues identified by the free scan."
      );

      const topIssues =
        [...issues]
          .sort(
            (a, b) =>
              severityRank(b?.severity) -
              severityRank(a?.severity)
          )
          .slice(0, 5);

      if (
        topIssues.length === 0
      ) {

        drawInfoBox(
          doc,
          "No major findings were returned by the scan.",
          "The detailed Website Health Report can provide a deeper assessment."
        );

      } else {

        topIssues.forEach(
          (issue, index) => {

            ensureSpace(
              doc,
              105
            );

            drawFinding(
              doc,
              index + 1,
              issue
            );

          }
        );
      }

      /*
       * ========================================================
       * PAGE 4 — NEXT STEPS
       * ========================================================
       */

      addPage(doc);

      sectionTitle(
        doc,
        "Recommended Next Steps",
        "Practical improvements based on the scan."
      );

      const topRecommendations =
        recommendations
          .slice(0, 6);

      if (
        topRecommendations.length
      ) {

        topRecommendations.forEach(
          (item, index) => {

            ensureSpace(
              doc,
              100
            );

            drawRecommendation(
              doc,
              index + 1,
              item
            );

          }
        );

      } else {

        const issueRecommendations =
          topIssues
            .slice(0, 5);

        issueRecommendations.forEach(
          (issue, index) => {

            ensureSpace(
              doc,
              100
            );

            drawRecommendation(
              doc,
              index + 1,
              {
                title:
                  issue?.title ||
                  "Website improvement",
                action:
                  "Review this finding and prioritise the appropriate improvement."
              }
            );

          }
        );
      }

      /*
       * ========================================================
       * PAGE 5 — CTA
       * ========================================================
       */

      addPage(doc);

      drawCallToAction(
        doc,
        url
      );

      addFooters(
        doc
      );

      doc.end();

      await finished;

      const pdf =
        Buffer.concat(chunks);

      const filename =
        buildFilename(
          url
        );

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

      return res.end(
        pdf
      );

    } catch (error) {

      console.error(
        "Quick report error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "We could not generate the free Website Quick Check Report."
      });
    }
  };


function drawCover(
  doc,
  url,
  scores,
  scannedAt
) {

  doc
    .rect(
      0,
      0,
      doc.page.width,
      doc.page.height
    )
    .fill(
      BRAND.dark2
    );

  try {

    doc.image(
      LOGO_PATH,
      PAGE.left + 145,
      65,
      {
        fit: [205, 90],
        align: "center",
        valign: "center"
      }
    );

  } catch {

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
        0,
        85,
        {
          width:
            doc.page.width,
          align:
            "center"
        }
      );
  }

  doc
    .fillColor(
      BRAND.white
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(28)
    .text(
      "Website Quick Check Report",
      PAGE.left,
      205,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );

  doc
    .fillColor(
      "#D1D5DB"
    )
    .font(
      "Helvetica"
    )
    .fontSize(11)
    .text(
      cleanUrl(url),
      PAGE.left,
      255,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );

  const overall =
    numericScore(
      scores.overall
    );

  doc
    .fillColor(
      scoreColor(overall)
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(58)
    .text(
      Number.isFinite(overall)
        ? `${overall}/100`
        : "—",
      PAGE.left,
      330,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );

  doc
    .fillColor(
      BRAND.white
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(18)
    .text(
      overallLabel(
        overall
      ),
      PAGE.left,
      405,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );

  doc
    .fillColor(
      "#D1D5DB"
    )
    .font(
      "Helvetica"
    )
    .fontSize(10)
    .text(
      `Scanned ${formatDate(scannedAt)}`,
      PAGE.left,
      455,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );

  doc
    .fillColor(
      "#9CA3AF"
    )
    .fontSize(10)
    .text(
      "Fix. Improve. Grow.",
      PAGE.left,
      730,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );
}


function drawScoreGrid(
  doc,
  rows
) {

  const boxWidth = 238;
  const boxHeight = 54;
  const gapX = 19;
  const gapY = 10;

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

      const value =
        numericScore(score);

      doc
        .roundedRect(
          x,
          y,
          boxWidth,
          boxHeight,
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
          boxWidth,
          boxHeight,
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
          label.toUpperCase(),
          x + 13,
          y + 10
        );

      doc
        .fillColor(
          scoreColor(value)
        )
        .font(
          "Helvetica-Bold"
        )
        .fontSize(18)
        .text(
          Number.isFinite(value)
            ? `${value}/100`
            : "—",
          x + 13,
          y + 27
        );
    }
  );

  doc.y =
    startY +
    Math.ceil(
      rows.length / 2
    ) *
      (boxHeight + gapY) +
    10;

  doc.x =
    PAGE.left;
}


function drawFinding(
  doc,
  number,
  issue
) {

  const title =
    issue?.title ||
    issue?.name ||
    "Website finding";

  const severity =
    String(
      issue?.severity ||
      "medium"
    ).toUpperCase();

  const description =
    issue?.description ||
    issue?.details ||
    issue?.message ||
    "The scan identified an area that may benefit from improvement.";

  const y =
    doc.y;

  doc
    .roundedRect(
      PAGE.left,
      y,
      PAGE.width,
      82,
      10
    )
    .fillColor(
      BRAND.lighter
    )
    .fill();

  doc
    .roundedRect(
      PAGE.left,
      y,
      PAGE.width,
      82,
      10
    )
    .lineWidth(1)
    .strokeColor(
      BRAND.border
    )
    .stroke();

  doc
    .fillColor(
      scoreColorForSeverity(
        issue?.severity
      )
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(9)
    .text(
      `FINDING ${number} • ${severity}`,
      PAGE.left + 14,
      y + 12
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
      String(title),
      PAGE.left + 14,
      y + 30,
      {
        width:
          PAGE.width - 28
      }
    );

  doc
    .fillColor(
      BRAND.text
    )
    .font(
      "Helvetica"
    )
    .fontSize(9)
    .text(
      String(description),
      PAGE.left + 14,
      y + 50,
      {
        width:
          PAGE.width - 28,
        height: 24,
        ellipsis: true
      }
    );

  doc.y =
    y + 96;
}


function drawRecommendation(
  doc,
  number,
  recommendation
) {

  const title =
    recommendation?.title ||
    "Website improvement";

  const action =
    recommendation?.action ||
    recommendation?.description ||
    "Review this recommendation and prioritise the appropriate improvement.";

  const y =
    doc.y;

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(11)
    .text(
      `${number}. ${title}`,
      PAGE.left,
      y,
      {
        width:
          PAGE.width
      }
    );

  doc
    .fillColor(
      BRAND.text
    )
    .font(
      "Helvetica"
    )
    .fontSize(9.5)
    .text(
      action,
      PAGE.left + 18,
      y + 22,
      {
        width:
          PAGE.width - 18,
        lineGap: 2
      }
    );

  doc.y +=
    58;
}


function drawCallToAction(
  doc,
  url
) {

  doc
    .fillColor(
      BRAND.dark2
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(25)
    .text(
      "Need the complete assessment?",
      PAGE.left,
      130,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );

  doc
    .fillColor(
      BRAND.text
    )
    .font(
      "Helvetica"
    )
    .fontSize(11)
    .text(
      "The free Website Quick Check gives you a practical overview. The R200 Website Health Report goes deeper into the evidence, detailed checks, prioritised recommendations and action plan.",
      PAGE.left + 30,
      205,
      {
        width:
          PAGE.width - 60,
        align:
          "center",
        lineGap: 4
      }
    );

  doc
    .fillColor(
      BRAND.blue
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(19)
    .text(
      "Website Health Report — R200",
      PAGE.left,
      330,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );

  doc
    .fillColor(
      BRAND.muted
    )
    .font(
      "Helvetica"
    )
    .fontSize(10)
    .text(
      "Request the detailed report through Site Rescue Studio.",
      PAGE.left,
      365,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );

    doc
    .fillColor(
      BRAND.border
    )
    .rect(
      PAGE.left + 80,
      660,
      PAGE.width - 160,
      1
    )
    .fill();

  doc
    .fillColor(
      BRAND.text
    )
    .font(
      "Helvetica"
    )
    .fontSize(9)
    .text(
      `Website assessed: ${cleanUrl(url)}`,
      PAGE.left,
      680,
      {
        width:
          PAGE.width,
        align:
          "center"
      }
    );
}


function drawInfoBox(
  doc,
  title,
  text
) {

  doc
    .roundedRect(
      PAGE.left,
      doc.y,
      PAGE.width,
      80,
      10
    )
    .fillColor(
      BRAND.lighter
    )
    .fill();

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(12)
    .text(
      title,
      PAGE.left + 15,
      doc.y + 15
    );

  doc
    .fillColor(
      BRAND.text
    )
    .font(
      "Helvetica"
    )
    .fontSize(9.5)
    .text(
      text,
      PAGE.left + 15,
      doc.y + 38,
      {
        width:
          PAGE.width - 30
      }
    );

  doc.y +=
    100;
}


function sectionTitle(
  doc,
  title,
  subtitle
) {

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(22)
    .text(
      title
    );

  doc.moveDown(0.5);

  doc
    .fillColor(
      BRAND.muted
    )
    .font(
      "Helvetica"
    )
    .fontSize(10)
    .text(
      subtitle,
      {
        width:
          PAGE.width,
        lineGap: 2
      }
    );

  doc.moveDown(1.4);
}


function addPage(
  doc
) {

  doc.addPage();

  doc
    .fillColor(
      BRAND.dark
    )
    .font(
      "Helvetica-Bold"
    )
    .fontSize(9)
    .text(
      "SITE RESCUE STUDIO",
      PAGE.left,
      25
    );

  doc.x =
    PAGE.left;

  doc.y =
    PAGE.top;
}


function addFooters(
  doc
) {

  const range =
    doc.bufferedPageRange();

  for (
    let i = 0;
    i < range.count;
    i++
  ) {

    doc.switchToPage(
      range.start + i
    );

    doc
      .fillColor(
        BRAND.muted
      )
      .font(
        "Helvetica"
      )
      .fontSize(8)
      .text(
        `Site Rescue Studio • Fix. Improve. Grow. • Page ${i + 1} of ${range.count}`,
        PAGE.left,
        doc.page.height - 38,
        {
          width:
            PAGE.width,
          align:
            "center"
        }
      );
  }
}


function ensureSpace(
  doc,
  height
) {

  if (
    doc.y + height >
    doc.page.height -
      PAGE.bottom
  ) {

    addPage(
      doc
    );
  }
}


function numericScore(
  value
) {

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? Math.round(number)
    : NaN;
}


function scoreColor(
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

  if (score >= 70) {
    return BRAND.blue;
  }

  if (score >= 50) {
    return BRAND.orange;
  }

  return BRAND.red;
}


function scoreColorForSeverity(
  severity
) {

  const value =
    String(
      severity || ""
    ).toLowerCase();

  if (
    value === "high" ||
    value === "critical"
  ) {
    return BRAND.red;
  }

  if (
    value === "low"
  ) {
    return BRAND.blue;
  }

  return BRAND.orange;
}


function severityRank(
  severity
) {

  const value =
    String(
      severity || ""
    ).toLowerCase();

  if (
    value === "critical"
  ) {
    return 4;
  }

  if (
    value === "high"
  ) {
    return 3;
  }

  if (
    value === "medium"
  ) {
    return 2;
  }

  return 1;
}


function overallLabel(
  score
) {

  if (
    !Number.isFinite(score)
  ) {
    return "Assessment available";
  }

  if (score >= 90) {
    return "Excellent foundation";
  }

  if (score >= 75) {
    return "Good foundation";
  }

  if (score >= 60) {
    return "Improvement opportunities";
  }

  return "Needs attention";
}


function cleanUrl(
  url
) {

  try {

    const parsed =
      new URL(url);

    return (
      parsed.hostname +
      parsed.pathname
    );

  } catch {

    return String(url);
  }
}


function formatDate(
  value
) {

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Unknown date";
  }

  return date.toLocaleDateString(
    "en-ZA",
    {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }
  );
}


function buildFilename(
  url
) {

  let hostname =
    "website";

  try {

    hostname =
      new URL(url)
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

  return (
    `site-rescue-studio-${slug}-website-check.pdf`
  );
}