import ExcelJS from 'exceljs';

// exceljs writes native UTF-8, so Macedonian Cyrillic exports cleanly with no
// font/encoding config needed (unlike naive CSV in some spreadsheet apps).
export async function buildWorkbook(sheetName, rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Finance · Rentonic';
  const ws = wb.addWorksheet(sheetName.slice(0, 31) || 'Report');

  if (!rows.length) {
    ws.addRow(['No data']);
    return wb;
  }
  const cols = Object.keys(rows[0]);
  ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.max(14, c.length + 2) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  return wb;
}
