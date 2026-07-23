import ExcelJS from 'exceljs';

// Header keywords (EN + Macedonian) to find the date/period and amount columns.
const DATE_KEYS = ['date', 'datum', 'датум', 'month', 'месец', 'period', 'период', 'due', 'доспева', 'падеж'];
const AMOUNT_KEYS = ['amount', 'payment', 'installment', 'rata', 'рата', 'износ', 'плаќање', 'плакање', 'вноска', 'sum', 'total', 'месечна'];

const cleanNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Parse many date/period shapes → YYYY-MM-DD (month-only → first of month), or null.
function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})$/))) return `${m[1]}-${String(m[2]).padStart(2, '0')}-01`;         // YYYY-MM
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return `${m[2]}-${String(m[1]).padStart(2, '0')}-01`;         // MM.YYYY
  if ((m = s.match(/([a-zA-Zа-шА-Ш]{3,})\.?\s*(\d{4})/))) {
    const mm = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mm) return `${m[2]}-${String(mm).padStart(2, '0')}-01`;
  }
  return null;
}

function matchCol(headers, keys) {
  return headers.findIndex((h) => { const hl = String(h || '').toLowerCase(); return keys.some((k) => hl.includes(k)); });
}

function rowsToSchedule(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h ?? ''));
  let di = matchCol(headers, DATE_KEYS);
  let ai = matchCol(headers, AMOUNT_KEYS);
  let body = rows.slice(1);
  if (ai === -1) {
    // No header row recognised: assume col0 = date/period, last numeric col = amount.
    di = 0; ai = -1; body = rows;
  }
  return body
    .map((r) => {
      // amount: named column, else the right-most numeric cell.
      let amount = ai >= 0 ? cleanNum(r[ai]) : null;
      if (amount == null) { for (let c = r.length - 1; c >= 0; c--) { const n = cleanNum(r[c]); if (n != null && c !== di) { amount = n; break; } } }
      const due_date = di >= 0 ? parseDate(r[di]) : null;
      return { due_date, amount };
    })
    .filter((r) => Number.isFinite(r.amount) && r.amount > 0);
}

function parseCsv(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = text.split(/\r?\n/).filter((l) => l.trim() !== '').map((line) => line.split(delim).map((c) => c.replace(/^"|"$/g, '').trim()));
  return rowsToSchedule(rows);
}

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow((row) => rows.push(row.values.slice(1).map((v) => (v && v.text ? v.text : v))));
  return rowsToSchedule(rows);
}

/** Parse an uploaded CSV/XLSX payment schedule into [{ due_date, amount }]. */
export async function parseSchedule(file) {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.xlsx') || (file.mimetype || '').includes('sheet')) return parseXlsx(file.buffer);
  return parseCsv(file.buffer.toString('utf8'));
}
