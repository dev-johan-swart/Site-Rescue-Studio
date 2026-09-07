const ExcelJS = require("exceljs");

const workbookPath =
  "C:\\Users\\Administrator\\OneDrive\\Desktop\\SRS Prospect Management\\Site_Rescue_Studio_Prospect_List.xlsx";

async function checkExcelStructure() {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.readFile(workbookPath);

  console.log("\n=== WORKSHEETS ===");

  workbook.worksheets.forEach((worksheet, index) => {
    console.log(`${index + 1}. ${worksheet.name}`);
  });

  console.log("\n=== HEADER ROWS ===");

  workbook.worksheets.forEach((worksheet) => {
    console.log(`\nWorksheet: ${worksheet.name}`);

    const headerRow = worksheet.getRow(1);
    const headers = [];

    headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      headers.push({
        column: columnNumber,
        value: cell.value
      });
    });

    console.log(headers);
  });

  console.log("\nStructure check complete. Workbook was NOT modified.");
}

checkExcelStructure().catch((error) => {
  console.error("\nCould not read workbook:");
  console.error(error.message);
  process.exit(1);
});
