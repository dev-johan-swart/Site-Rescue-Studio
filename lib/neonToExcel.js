const ExcelJS = require("exceljs");
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const workbookPath =
  "C:\\Users\\Administrator\\OneDrive\\Desktop\\SRS Prospect Management\\Site_Rescue_Studio_Prospect_List.xlsx";

const SHEET_NAME = "Prospects";

/*
 * --------------------------------------------------------
 * WEBSITE NORMALIZATION
 * --------------------------------------------------------
 */

function normalizeWebsite(url) {
  if (!url) return "";

  try {
    const parsed = new URL(String(url).trim());

    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    let pathname = parsed.pathname || "/";

    pathname = pathname
      .replace(/\/+$/, "")
      .toLowerCase();

    if (!pathname) pathname = "/";

    return `${hostname}${pathname}`;
  } catch {
    return String(url)
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  }
}

/*
 * --------------------------------------------------------
 * DATABASE
 * --------------------------------------------------------
 */

async function getProspectsFromNeon() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured in .env.local."
    );
  }

  const sql = neon(process.env.DATABASE_URL);

  return await sql`
    SELECT
      id,
      website,
      website_normalized,
      company_name,
      contact_name,
      email,
      phone,
      overall_score,
      seo_score,
      mobile_score,
      accessibility_score,
      technical_score,
      business_score,
      performance_score,
      opportunity,
      priority,
      key_problems,
      potential_services,
      scan_count,
      last_scanned
    FROM prospects
    ORDER BY id ASC;
  `;
}

/*
 * --------------------------------------------------------
 * EXCEL HELPERS
 * --------------------------------------------------------
 */

function getHeaderMap(worksheet) {
  const headerMap = {};

  const headerRow = worksheet.getRow(1);

  headerRow.eachCell(
    { includeEmpty: false },
    (cell, columnNumber) => {
      const header = String(cell.value || "").trim();

      if (header) {
        headerMap[header] = columnNumber;
      }
    }
  );

  return headerMap;
}

function getCellValue(row, columnNumber) {
  if (!columnNumber) return "";

  const value = row.getCell(columnNumber).value;

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    if (value.text) return value.text;
    if (value.result !== undefined) return value.result;
  }

  return String(value);
}

function setCellValue(row, headerMap, header, value) {
  const columnNumber = headerMap[header];

  if (!columnNumber) return;

  row.getCell(columnNumber).value =
    value === undefined || value === null
      ? ""
      : value;
}

function copyRowFormatting(sourceRow, targetRow, columnCount) {
  for (let column = 1; column <= columnCount; column++) {
    const sourceCell = sourceRow.getCell(column);
    const targetCell = targetRow.getCell(column);

    if (sourceCell.hasOwnProperty("style")) {
      targetCell.style = { ...sourceCell.style };
    }

    if (sourceCell.numFmt) {
      targetCell.numFmt = sourceCell.numFmt;
    }

    if (sourceCell.alignment) {
      targetCell.alignment = {
        ...sourceCell.alignment
      };
    }

    if (sourceCell.protection) {
      targetCell.protection = {
        ...sourceCell.protection
      };
    }
  }
}

/*
 * --------------------------------------------------------
 * BACKUP
 * --------------------------------------------------------
 */

async function createBackup(workbook) {
  const timestamp =
    new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

  const backupPath =
    workbookPath.replace(
      /\.xlsx$/i,
      `_backup_${timestamp}.xlsx`
    );

  await workbook.xlsx.writeFile(backupPath);

  return backupPath;
}

/*
 * --------------------------------------------------------
 * MAIN SYNC
 * --------------------------------------------------------
 */

async function syncNeonToExcel() {
  console.log("\n========================================");
  console.log(" SITE RESCUE STUDIO");
  console.log(" NEON → EXCEL SYNC");
  console.log("========================================\n");

  console.log("Reading prospects from Neon...");

  const prospects =
    await getProspectsFromNeon();

  console.log(
    `Found ${prospects.length} prospect(s) in Neon.`
  );

  const workbook =
    new ExcelJS.Workbook();

  console.log("Opening Excel workbook...");

  await workbook.xlsx.readFile(
    workbookPath
  );

  const worksheet =
    workbook.getWorksheet(SHEET_NAME);

  if (!worksheet) {
    throw new Error(
      `Worksheet "${SHEET_NAME}" was not found.`
    );
  }

  console.log(
    `Found worksheet: ${SHEET_NAME}`
  );

  const headerMap =
    getHeaderMap(worksheet);

  const requiredHeaders = [
    "Prospect ID",
    "Website",
    "Overall Score",
    "SEO Score",
    "Mobile Score",
    "Accessibility Score",
    "Technical Score",
    "Business Score",
    "Performance Score",
    "Opportunity",
    "Priority",
    "Key Problems",
    "Potential Services"
  ];

  const missingHeaders =
    requiredHeaders.filter(
      header => !headerMap[header]
    );

  if (missingHeaders.length > 0) {
    throw new Error(
      `Missing required Excel columns: ${missingHeaders.join(", ")}`
    );
  }

  console.log("Excel column structure verified.");

  /*
   * Create a backup before making ANY changes.
   */

  console.log(
    "\nCreating safety backup..."
  );

  const backupPath =
    await createBackup(workbook);

  console.log(
    `Backup created:\n${backupPath}`
  );

  /*
 * ------------------------------------------------------
 * FIND EXISTING PROSPECTS
 * ------------------------------------------------------
 *
 * Existing prospects are matched by normalized website.
 *
 * New prospects use the first available pre-created
 * SR-xxxx row whose Website cell is blank.
 *
 * We NEVER append new rows to the bottom of the sheet.
 * We NEVER replace the SR-xxxx Prospect ID with the
 * Neon database ID.
 * ------------------------------------------------------
 */

const existingRows = new Map();
const availableRows = [];

/*
 * First pass:
 * - Find existing prospects by website.
 * - Find unused pre-created SR-xxxx rows.
 */

for (
  let rowNumber = 2;
  rowNumber <= worksheet.rowCount;
  rowNumber++
) {
  const row =
    worksheet.getRow(rowNumber);

  const website =
    getCellValue(
      row,
      headerMap["Website"]
    );

  const prospectId =
    getCellValue(
      row,
      headerMap["Prospect ID"]
    );

  const normalized =
    normalizeWebsite(website);

  /*
   * Existing prospect with a website.
   */

  if (normalized) {
    existingRows.set(
      normalized,
      rowNumber
    );

    continue;
  }

  /*
   * Unused prepared prospect slot.
   *
   * Only rows with an SR-xxxx Prospect ID
   * are considered available.
   */

  if (
    /^SR-\d{4}$/i.test(
      prospectId.trim()
    )
  ) {
    availableRows.push({
      rowNumber,
      prospectId: prospectId.trim()
    });
  }
}

/*
 * Keep the prepared rows in their original order.
 */

availableRows.sort(
  (a, b) =>
    a.rowNumber - b.rowNumber
);

/*
 * ------------------------------------------------------
 * SYNC EACH NEON PROSPECT
 * ------------------------------------------------------
 */

let added = 0;
let updated = 0;

for (const prospect of prospects) {
  const website =
    prospect.website ||
    prospect.final_url;

  const normalized =
    normalizeWebsite(
      website
    );

  if (!normalized) {
    console.warn(
      "Skipping prospect without website:",
      prospect.id
    );

    continue;
  }

  let rowNumber =
    existingRows.get(
      normalized
    );

  let row;

  /*
   * ----------------------------------------------------
   * EXISTING PROSPECT
   * ----------------------------------------------------
   */

  if (rowNumber) {
    row =
      worksheet.getRow(
        rowNumber
      );

    updated++;

    console.log(
      `↻ Updated: ${website} → ${getCellValue(
        row,
        headerMap["Prospect ID"]
      )}`
    );
  }

  /*
   * ----------------------------------------------------
   * NEW PROSPECT
   * ----------------------------------------------------
   */

  else {
    if (availableRows.length === 0) {
      throw new Error(
        `No unused SR-xxxx prospect rows are available for ${website}.`
      );
    }

    /*
     * Take the FIRST unused prepared row.
     */

    const available =
      availableRows.shift();

    rowNumber =
      available.rowNumber;

    row =
      worksheet.getRow(
        rowNumber
      );

    /*
     * IMPORTANT:
     *
     * We intentionally DO NOT write prospect.id
     * into "Prospect ID".
     *
     * The existing SR-xxxx ID belongs to Excel.
     */

    existingRows.set(
      normalized,
      rowNumber
    );

    added++;

    console.log(
      `+ Added: ${website} → ${available.prospectId}`
    );
  }

  /*
   * ----------------------------------------------------
   * SCANNER-OWNED FIELDS
   * ----------------------------------------------------
   */

  /*
   * DO NOT update "Prospect ID" here.
   *
   * Excel owns the SR-xxxx identifier.
   */

  setCellValue(
    row,
    headerMap,
    "Website",
    website
  );

  setCellValue(
    row,
    headerMap,
    "Overall Score",
    prospect.overall_score
  );

  setCellValue(
    row,
    headerMap,
    "SEO Score",
    prospect.seo_score
  );

  setCellValue(
    row,
    headerMap,
    "Mobile Score",
    prospect.mobile_score
  );

  setCellValue(
    row,
    headerMap,
    "Accessibility Score",
    prospect.accessibility_score
  );

  setCellValue(
    row,
    headerMap,
    "Technical Score",
    prospect.technical_score
  );

  setCellValue(
    row,
    headerMap,
    "Business Score",
    prospect.business_score
  );

  setCellValue(
    row,
    headerMap,
    "Performance Score",
    prospect.performance_score
  );

  /*
  * IMPORTANT:
  * Opportunity and Priority are calculated by existing
  * Excel formulas in the prepared workbook.
  * Do NOT write to either column.
  */

  setCellValue(
    row,
    headerMap,
    "Key Problems",
    prospect.key_problems
  );

  setCellValue(
    row,
    headerMap,
    "Potential Services",
    prospect.potential_services
  );

  setCellValue(
    row,
    headerMap,
    "Scan Count",
    prospect.scan_count
  );

  /*
   * ----------------------------------------------------
   * OPTIONAL CONTACT DATA
   * ----------------------------------------------------
   *
   * Only fill these if Excel is currently blank.
   * Existing manually entered information is preserved.
   */

  const existingEmail =
    getCellValue(
      row,
      headerMap["Email"]
    );

  if (
    !existingEmail &&
    prospect.email
  ) {
    setCellValue(
      row,
      headerMap,
      "Email",
      prospect.email
    );
  }

  const existingPhone =
    getCellValue(
      row,
      headerMap["Phone"]
    );

  if (
    !existingPhone &&
    prospect.phone
  ) {
    setCellValue(
      row,
      headerMap,
      "Phone",
      prospect.phone
    );
  }

  const existingContactName =
    getCellValue(
      row,
      headerMap["Contact Name"]
    );

  if (
    !existingContactName &&
    prospect.contact_name
  ) {
    setCellValue(
      row,
      headerMap,
      "Contact Name",
      prospect.contact_name
    );
  }
}

  /*
   * ------------------------------------------------------
   * SAVE WORKBOOK
   * ------------------------------------------------------
   */

  console.log(
    "\nSaving Excel workbook..."
  );

  await workbook.xlsx.writeFile(
    workbookPath
  );

  console.log(
    "\n========================================"
  );
  console.log(
    " SYNC COMPLETE"
  );
  console.log(
    "========================================"
  );

  console.log(
    `Neon prospects: ${prospects.length}`
  );

  console.log(
    `New rows added: ${added}`
  );

  console.log(
    `Existing rows updated: ${updated}`
  );

  console.log(
    `Backup: ${backupPath}`
  );

  console.log(
    `\nWorkbook:\n${workbookPath}\n`
  );
}

/*
 * --------------------------------------------------------
 * RUN
 * --------------------------------------------------------
 */

syncNeonToExcel().catch(error => {
  console.error(
    "\nSYNC FAILED:"
  );

  console.error(
    error.message
  );

  process.exit(1);
});
