import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../shared/db.js';
import { getInvoiceSettings } from './invoiceSettings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../uploads/invoices');
const FONT_DIR = path.resolve(__dirname, '../assets/fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

function fmtMkd(n) {
  return new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 2 }).format(Number(n || 0)) + ' ден';
}

// Amount in the invoice's currency (ден for MKD, € for EUR), grouped thousands.
function fmtCur(n, currency) {
  const s = new Intl.NumberFormat('mk-MK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
  return currency === 'EUR' ? `${s} €` : `${s} ден`;
}
function fmtNum(n) {
  return new Intl.NumberFormat('mk-MK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
}
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10);
  return `${dt.getDate()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
}
// Register the bundled DejaVu (full Cyrillic) so Macedonian text renders.
function useCyrillicFonts(doc) {
  try {
    if (fs.existsSync(FONT_REGULAR)) doc.registerFont('body', FONT_REGULAR);
    if (fs.existsSync(FONT_BOLD)) doc.registerFont('bodyBold', FONT_BOLD);
    doc.font(fs.existsSync(FONT_REGULAR) ? 'body' : 'Helvetica');
    return { regular: fs.existsSync(FONT_REGULAR) ? 'body' : 'Helvetica', bold: fs.existsSync(FONT_BOLD) ? 'bodyBold' : 'Helvetica-Bold' };
  } catch {
    return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  }
}

async function tenantLetterhead(tenantId) {
  const { rows } = await query(
    `SELECT key, value FROM settings WHERE tenant_id = $1 AND key IN
       ('company_name','company_address','company_phone')`,
    [tenantId],
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const tenant = (await query(`SELECT name FROM tenants WHERE id = $1`, [tenantId])).rows[0];
  return {
    name: map.company_name || tenant?.name || 'Company',
    address: map.company_address || '',
    phone: map.company_phone || '',
  };
}

/**
 * Render a payables invoice to a PDF Buffer — used by the download button for
 * invoices that don't have an attached scan.
 */
export async function generateInvoicePdfBuffer(tenantId, invoice) {
  const head = await tenantLetterhead(tenantId);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#111').text(head.name);
    doc.fontSize(9).fillColor('#666');
    if (head.address) doc.text(head.address);
    if (head.phone) doc.text(head.phone);
    doc.moveDown();

    doc.fillColor('#111').fontSize(16).text('EXPENSE INVOICE', { align: 'right' });
    doc.fontSize(10).fillColor('#444')
      .text(`No: ${invoice.invoice_number || '#' + invoice.id}`, { align: 'right' })
      .text(`Vendor: ${invoice.company_name || invoice.worker_name || ''}`, { align: 'right' })
      .text(`Due: ${String(invoice.due_date).slice(0, 10)}`, { align: 'right' })
      .text(`Status: ${invoice.status}`, { align: 'right' });
    doc.moveDown(2);

    const top = doc.y;
    doc.fillColor('#111').fontSize(10);
    doc.text('Description', 50, top);
    doc.text('Amount', 400, top, { width: 145, align: 'right' });
    doc.moveTo(50, top + 16).lineTo(545, top + 16).strokeColor('#ccc').stroke();
    doc.text(invoice.description, 50, top + 24, { width: 340 });
    const amt = invoice.currency === 'EUR'
      ? `${fmtMkd(invoice.amount)}  (€${invoice.original_amount} @ ${invoice.exchange_rate})`
      : fmtMkd(invoice.amount);
    doc.text(amt, 400, top + 24, { width: 145, align: 'right' });

    doc.moveDown(4).fontSize(11).fillColor('#111')
      .text(`Total: ${fmtMkd(invoice.amount)}`, { align: 'right' })
      .text(`Paid: ${fmtMkd(invoice.paid_amount)}`, { align: 'right' })
      .text(`Remaining: ${fmtMkd(Number(invoice.amount) - Number(invoice.paid_amount))}`, { align: 'right' });
    if (invoice.category) doc.moveDown().fontSize(9).fillColor('#888').text(`Category: ${invoice.category}`, 50);
    doc.end();
  });
}

function logoBuffer(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  try { return Buffer.from(dataUrl.slice(comma + 1), 'base64'); } catch { return null; }
}

// Modern 2026 palette — slate ink + warm accent, soft hairlines.
const INK = '#0F172A';
const MUT = '#64748B';
const LINE = '#E2E8F0';
const ZEBRA = '#F8FAFC';
const ACCENT = '#E4572E';
const PAGE_W = 595.28;

const STATUS_MK = {
  paid: 'ПЛАТЕНО', sent: 'НЕПЛАТЕНО', partial: 'ДЕЛУМНО', overdue: 'ЗАДОЦНЕТО',
  draft: 'НАЦРТ', cancelled: 'ОТКАЖАНО',
};
const STATUS_COLORS = {
  paid: ['#DCFCE7', '#166534'], sent: ['#FEF9C3', '#854D0E'], partial: ['#DBEAFE', '#1E40AF'],
  overdue: ['#FEE2E2', '#991B1B'], draft: ['#F1F5F9', '#475569'], cancelled: ['#F1F5F9', '#475569'],
};

function pill(doc, x, y, text, F) {
  const [bg, fg] = STATUS_COLORS[text] ? STATUS_COLORS[text] : ['#F1F5F9', '#475569'];
  const label = STATUS_MK[text] || String(text).toUpperCase();
  doc.font(F.bold).fontSize(8.5);
  const w = doc.widthOfString(label) + 18;
  doc.roundedRect(x, y, w, 16, 8).fill(bg);
  doc.fillColor(fg).text(label, x + 9, y + 4.5, { lineBreak: false });
  return w;
}

/**
 * Render a formal client invoice (ФАКТУРА) to a PDF Buffer, laid out to match
 * the МОМО reference: logo + company block header, invoice number/date, boxed
 * Купувач, an itemized table (Р.б / Назив / Количина / Цена / Пресметан ДДВ /
 * ДДВ% / Вкупно), amount-in-words box, net/VAT/total, disclaimer, three
 * signature lines and a footer strip. Macedonian Cyrillic via embedded DejaVu.
 */
export async function generateClientInvoicePdfBuffer(tenantId, invoice) {
  const s = await getInvoiceSettings(tenantId);
  const items = invoice.items || [];
  const cur = invoice.currency || 'MKD';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const F = useCyrillicFonts(doc);
    const L = 40;
    const R = 555;

    // Slim accent band across the very top — the modern signature touch.
    doc.rect(0, 0, PAGE_W, 5).fill(ACCENT);

    // ── Header: logo left, company block right ──
    const logo = logoBuffer(s.logoUrl);
    if (logo) {
      try { doc.image(logo, L, 34, { fit: [150, 66] }); } catch { /* ignore bad image */ }
    }
    let hy = 36;
    const hx = 322;
    doc.fillColor(INK).font(F.bold).fontSize(13).text(s.name || '', hx, hy, { width: R - hx });
    hy = doc.y + 3;
    doc.fontSize(8.5);
    const headerLine = (label, val) => {
      if (val == null || val === '') return;
      if (label) {
        doc.font(F.regular).fillColor(MUT).text(`${label} `, hx, hy, { continued: true, width: R - hx });
        doc.fillColor(INK).text(val, { continued: false });
      } else {
        doc.font(F.regular).fillColor(INK).text(val, hx, hy, { width: R - hx });
      }
      hy = doc.y + 1.5;
    };
    if (s.address) headerLine('', s.address);
    headerLine('Тел:', s.phone);
    headerLine('Е-маил:', s.email);
    headerLine('Веб:', s.website);
    headerLine('Даночен бр:', s.taxNumber);
    for (const b of s.bankAccounts || []) {
      if (b?.accountNo) headerLine('Жиро Сметка:', `${b.accountNo}${b.bankName ? ' - ' + b.bankName : ''}`);
    }

    // ── Title + number/date (left), Купувач card (right) ──
    const titleY = Math.max(hy + 26, 150);
    doc.font(F.bold).fontSize(26).fillColor(INK).text('ФАКТУРА', L, titleY, { characterSpacing: 1 });
    // status pill next to the title
    pill(doc, L + doc.widthOfString('ФАКТУРА') + 14, titleY + 8, invoice.status || 'sent', F);

    let ly = titleY + 40;
    const lblVal = (label, val, big) => {
      doc.font(F.regular).fontSize(9).fillColor(MUT).text(label, L, ly);
      doc.font(F.bold).fontSize(big ? 14 : 11).fillColor(INK).text(val, L + 118, ly - (big ? 3 : 0));
      ly += 22;
    };
    lblVal('Број на Фактура', invoice.invoice_number || '', true);
    lblVal('Датум', fmtDate(invoice.issue_date), false);
    if (invoice.status === 'paid' && invoice.paid_at) lblVal('Платено на', fmtDate(invoice.paid_at), false);

    // Купувач card
    const bx = 322;
    const bw = R - bx;
    const bh = 74;
    doc.roundedRect(bx, titleY, bw, bh, 8).fillAndStroke('#FCFCFD', LINE);
    doc.font(F.bold).fontSize(8).fillColor(MUT).text('КУПУВАЧ', bx + 12, titleY + 10, { characterSpacing: 1 });
    doc.font(F.bold).fontSize(12).fillColor(INK).text(invoice.company_name || '', bx + 12, titleY + 24, { width: bw - 24 });
    let cy = doc.y + 1;
    doc.font(F.regular).fontSize(8.5).fillColor(MUT);
    if (invoice.company_tax_number) { doc.text(`ЕДБ: ${invoice.company_tax_number}`, bx + 12, cy, { width: bw - 24 }); cy = doc.y; }
    if (invoice.company_address) doc.text(invoice.company_address, bx + 12, cy, { width: bw - 24 });

    // ── Items table (modern: dark header band, zebra rows, hairline separators) ──
    const cols = [
      { key: 'rb', label: 'Р.б', x: L, w: 28, align: 'center' },
      { key: 'desc', label: 'Назив на производот', x: 68, w: 190, align: 'left' },
      { key: 'qty', label: 'Количина', x: 258, w: 55, align: 'right' },
      { key: 'price', label: 'Цена', x: 313, w: 62, align: 'right' },
      { key: 'vat', label: 'Пресметан ДДВ', x: 375, w: 78, align: 'right' },
      { key: 'vatp', label: 'ДДВ%', x: 453, w: 37, align: 'right' },
      { key: 'total', label: 'Вкупно', x: 490, w: 65, align: 'right' },
    ];
    const ty = Math.max(titleY + bh + 28, 260);
    const headH = 24;
    doc.roundedRect(L, ty, R - L, headH, 4).fill(INK);
    doc.fillColor('#fff').font(F.bold).fontSize(8);
    for (const c of cols) doc.text(c.label, c.x + 4, ty + 8, { width: c.w - 8, align: c.align });

    // rows (measure heights, draw zebra behind text)
    let ry = ty + headH;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      doc.font(F.regular).fontSize(9);
      const descH = doc.heightOfString(it.description || '', { width: cols[1].w - 8 });
      const rowH = Math.max(22, descH + 10);
      if (i % 2 === 1) doc.rect(L, ry, R - L, rowH).fill(ZEBRA);
      const cells = {
        rb: String(it.position ?? i + 1),
        desc: it.description || '',
        qty: fmtNum(it.quantity),
        price: fmtNum(it.unit_price),
        vat: fmtNum(it.vat_amount),
        vatp: `${Number(it.vat_rate) || 0}`,
        total: fmtNum(it.total),
      };
      doc.fillColor(INK).font(F.regular).fontSize(9);
      for (const c of cols) {
        if (c.key === 'total') doc.font(F.bold);
        doc.text(cells[c.key], c.x + 4, ry + 5, { width: c.w - 8, align: c.align });
        doc.font(F.regular);
      }
      doc.moveTo(L, ry + rowH).lineTo(R, ry + rowH).lineWidth(0.4).strokeColor(LINE).stroke();
      ry += rowH;
    }
    const tableBottom = Math.max(ry, ty + headH + 150, 470);
    // soft outer frame (rounded) around the whole table
    doc.roundedRect(L, ty, R - L, tableBottom - ty, 4).lineWidth(0.6).strokeColor(LINE).stroke();

    // ── Words card (left) + totals (right) ──
    const sumY = tableBottom + 20;
    const wbW = 250;
    doc.roundedRect(L, sumY, wbW, 74, 8).fillAndStroke('#FCFCFD', LINE);
    doc.font(F.bold).fontSize(8).fillColor(MUT).text('ИЗНОС СО БУКВИ', L + 12, sumY + 10, { characterSpacing: 1 });
    doc.font(F.regular).fontSize(9.5).fillColor(INK).text(invoice.amount_in_words || '', L + 12, sumY + 26, { width: wbW - 24 });

    // Totals block (right)
    const tlx = 322;
    const tvx = R;
    const netVal = invoice.net_amount ?? invoice.original_amount ?? invoice.amount;
    const vatRate = invoice.vat_enabled ? Number(invoice.vat_rate) || 0 : 0;
    doc.font(F.regular).fontSize(10).fillColor(MUT).text('НЕТО ИЗНОС', tlx, sumY + 2, { width: 150 });
    doc.font(F.bold).fillColor(INK).text(fmtCur(netVal, cur), tlx, sumY + 2, { width: tvx - tlx, align: 'right' });
    doc.font(F.regular).fillColor(MUT).text(`Пресметан ДДВ ${vatRate}%`, tlx, sumY + 22, { width: 160 });
    doc.font(F.bold).fillColor(INK).text(fmtCur(invoice.vat_amount || 0, cur), tlx, sumY + 22, { width: tvx - tlx, align: 'right' });
    // Вкупно highlighted bar
    const barY = sumY + 44;
    doc.roundedRect(tlx, barY, tvx - tlx, 30, 6).fill(INK);
    doc.font(F.bold).fontSize(12).fillColor('#fff').text('Вкупно', tlx + 12, barY + 9, { lineBreak: false });
    doc.font(F.bold).fontSize(13).fillColor('#fff').text(fmtCur(invoice.original_amount ?? invoice.amount, cur), tlx, barY + 8, { width: tvx - tlx - 12, align: 'right' });

    // ── Disclaimer ──
    let fy = Math.max(sumY + 92, barY + 44);
    doc.font(F.regular).fontSize(8.5).fillColor(MUT);
    if (s.footerNote1) { doc.text(s.footerNote1, L, fy); fy = doc.y; }
    if (s.footerNote2) { doc.text(s.footerNote2, L, fy + 1); fy = doc.y; }

    // ── Signatures ── (pinned above the footer; lineBreak:false guards page breaks)
    const sigY = Math.min(Math.max(fy + 48, 700), 726);
    const labels = [s.signatureLabels?.received || 'Примил', s.signatureLabels?.invoicedBy || 'Фактурирал', s.signatureLabels?.director || 'Директор'];
    const segW = (R - L) / 3;
    labels.forEach((lab, i) => {
      const cxc = L + segW * i;
      doc.lineWidth(0.8).strokeColor('#CBD5E1').moveTo(cxc + 24, sigY).lineTo(cxc + segW - 24, sigY).stroke();
      doc.font(F.regular).fontSize(9).fillColor(MUT).text(lab, cxc, sigY + 6, { width: segW, align: 'center', lineBreak: false });
    });

    // ── Footer strip ── (kept inside the bottom margin: A4 height 841.89 − 40)
    const footParts = [s.name, s.website, s.email, s.phone].filter(Boolean);
    doc.moveTo(L, 786).lineTo(R, 786).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.font(F.regular).fontSize(8).fillColor(MUT)
      .text(footParts.join('   ·   '), L, 791, { width: R - L, align: 'center', height: 11, lineBreak: false });

    doc.end();
  });
}
