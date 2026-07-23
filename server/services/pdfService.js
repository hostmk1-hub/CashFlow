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

    // ── Header: logo left, company block right ──
    const logo = logoBuffer(s.logoUrl);
    if (logo) {
      try { doc.image(logo, L, 40, { fit: [150, 70] }); } catch { /* ignore bad image */ }
    }
    let hy = 40;
    const hx = 320;
    doc.fillColor('#111').font(F.bold).fontSize(11).text(s.name || '', hx, hy, { width: R - hx });
    hy = doc.y + 1;
    doc.font(F.regular).fontSize(8.5).fillColor('#333');
    const headerLine = (label, val) => {
      if (val == null || val === '') return;
      doc.text(`${label}${label ? '  ' : ''}${val}`, hx, hy, { width: R - hx });
      hy = doc.y + 0.5;
    };
    if (s.address) headerLine('', s.address);
    headerLine('Тел:', s.phone);
    headerLine('Е-маил:', s.email);
    headerLine('Веб:', s.website);
    headerLine('Даночен бр:', s.taxNumber);
    for (const b of s.bankAccounts || []) {
      if (b?.accountNo) headerLine('Жиро Сметка:', `${b.accountNo}${b.bankName ? ' - ' + b.bankName : ''}`);
    }

    // ── Title + number/date (left), Купувач box (right) ──
    const titleY = Math.max(hy + 24, 150);
    doc.font(F.bold).fontSize(24).fillColor('#111').text('ФАКТУРА', L, titleY);
    let ly = doc.y + 8;
    doc.fontSize(11);
    doc.font(F.bold).text('Број на Фактура:', L, ly, { continued: false });
    doc.font(F.bold).fontSize(13).text(invoice.invoice_number || '', L + 130, ly - 1);
    ly += 26;
    doc.font(F.bold).fontSize(11).text('Датум:', L, ly);
    doc.font(F.regular).text(fmtDate(invoice.issue_date), L + 130, ly);

    // Купувач box
    const bx = 320;
    const bw = R - bx;
    doc.rect(bx, titleY, bw, 18).lineWidth(0.8).strokeColor('#111').stroke();
    doc.font(F.bold).fontSize(10).fillColor('#111').text('Купувач', bx, titleY + 5, { width: bw, align: 'center' });
    doc.font(F.regular).fontSize(10).fillColor('#111');
    let cy = titleY + 26;
    doc.text(invoice.company_name || '', bx + 4, cy, { width: bw - 8 });
    cy = doc.y;
    doc.fontSize(8.5).fillColor('#444');
    if (invoice.company_tax_number) { doc.text(`ЕДБ: ${invoice.company_tax_number}`, bx + 4, cy + 1, { width: bw - 8 }); cy = doc.y; }
    if (invoice.company_address) doc.text(invoice.company_address, bx + 4, cy + 1, { width: bw - 8 });

    // ── Items table ──
    const cols = [
      { key: 'rb', label: 'Р.б', x: L, w: 28, align: 'center' },
      { key: 'desc', label: 'Назив на производот', x: 68, w: 190, align: 'left' },
      { key: 'qty', label: 'Количина', x: 258, w: 55, align: 'right' },
      { key: 'price', label: 'Цена', x: 313, w: 62, align: 'right' },
      { key: 'vat', label: 'Пресметан ДДВ', x: 375, w: 78, align: 'right' },
      { key: 'vatp', label: 'ДДВ%', x: 453, w: 37, align: 'right' },
      { key: 'total', label: 'Вкупно', x: 490, w: 65, align: 'right' },
    ];
    let ty = Math.max(cy + 40, titleY + 120);
    const headH = 26;
    // header
    doc.rect(L, ty, R - L, headH).fill('#f0f0f0');
    doc.fillColor('#111').font(F.bold).fontSize(8.5);
    for (const c of cols) doc.text(c.label, c.x + 3, ty + 8, { width: c.w - 6, align: c.align });
    let ry = ty + headH;
    doc.font(F.regular).fontSize(9).fillColor('#111');
    const rowGap = 6;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const descH = doc.heightOfString(it.description || '', { width: cols[1].w - 6 });
      const rowH = Math.max(20, descH + rowGap);
      const cells = {
        rb: String(it.position ?? i + 1),
        desc: it.description || '',
        qty: fmtNum(it.quantity),
        price: fmtNum(it.unit_price),
        vat: fmtNum(it.vat_amount),
        vatp: `${Number(it.vat_rate) || 0}`,
        total: fmtNum(it.total),
      };
      for (const c of cols) doc.text(cells[c.key], c.x + 3, ry + 4, { width: c.w - 6, align: c.align });
      ry += rowH;
    }
    // extend the grid to a comfortable minimum so it reads like the sample
    const tableBottom = Math.max(ry, ty + headH + 240, 560);
    // outer border + column verticals + header underline
    doc.lineWidth(0.8).strokeColor('#111');
    doc.rect(L, ty, R - L, tableBottom - ty).stroke();
    doc.moveTo(L, ty + headH).lineTo(R, ty + headH).stroke();
    doc.lineWidth(0.5).strokeColor('#333');
    for (const c of cols) if (c.x !== L) doc.moveTo(c.x, ty).lineTo(c.x, tableBottom).stroke();

    // ── Words box (left) + totals (right) ──
    const sumY = tableBottom + 16;
    // Износ со букви
    const wbW = 260;
    doc.lineWidth(0.8).strokeColor('#111').rect(L, sumY, wbW, 18).stroke();
    doc.font(F.bold).fontSize(9.5).fillColor('#111').text('Износ со букви', L, sumY + 5, { width: wbW, align: 'center' });
    doc.lineWidth(0.6).rect(L, sumY + 18, wbW, 54).stroke();
    doc.font(F.regular).fontSize(9.5).fillColor('#111').text(invoice.amount_in_words || '', L + 6, sumY + 26, { width: wbW - 12 });

    // Totals (right)
    const tlx = 330;
    const tvx = R;
    doc.fontSize(10).fillColor('#111');
    doc.font(F.bold).text('НЕТО ИЗНОС', tlx, sumY + 2, { width: 130 });
    doc.font(F.bold).text(fmtCur(invoice.net_amount ?? invoice.original_amount ?? invoice.amount, cur), tlx, sumY + 2, { width: tvx - tlx, align: 'right' });
    doc.moveTo(tlx, sumY + 20).lineTo(tvx, sumY + 20).lineWidth(0.5).strokeColor('#ccc').stroke();
    const vatRate = invoice.vat_enabled ? Number(invoice.vat_rate) || 0 : 0;
    doc.font(F.regular).text(`Пресметан ДДВ ${vatRate}%`, tlx, sumY + 26, { width: 150 });
    doc.text(fmtCur(invoice.vat_amount || 0, cur), tlx, sumY + 26, { width: tvx - tlx, align: 'right' });
    doc.moveTo(tlx, sumY + 44).lineTo(tvx, sumY + 44).stroke();
    doc.font(F.bold).fontSize(14).text('Вкупно', tlx, sumY + 52, { width: 100 });
    doc.font(F.bold).fontSize(14).text(fmtCur(invoice.original_amount ?? invoice.amount, cur), tlx, sumY + 52, { width: tvx - tlx, align: 'right' });

    // ── Disclaimer ──
    let fy = sumY + 90;
    doc.font(F.regular).fontSize(8.5).fillColor('#333');
    if (s.footerNote1) { doc.text(s.footerNote1, L, fy); fy = doc.y; }
    if (s.footerNote2) { doc.text(s.footerNote2, L, fy + 1); fy = doc.y; }

    // ── Signatures ── (pinned above the footer; lineBreak:false so a long label
    // can't push the cursor onto a second page)
    const sigY = Math.min(Math.max(fy + 45, 700), 726);
    const labels = [s.signatureLabels?.received || 'Примил', s.signatureLabels?.invoicedBy || 'Фактурирал', s.signatureLabels?.director || 'Директор'];
    const segW = (R - L) / 3;
    doc.font(F.bold).fontSize(10).fillColor('#111');
    labels.forEach((lab, i) => {
      const cxc = L + segW * i;
      doc.text(lab, cxc, sigY, { width: segW, align: 'center', lineBreak: false });
      const lineY = sigY + 24;
      doc.lineWidth(0.8).strokeColor('#111').moveTo(cxc + 20, lineY).lineTo(cxc + segW - 20, lineY).stroke();
    });

    // ── Footer strip ── (kept inside the bottom margin: A4 height 841.89 − 40)
    const footParts = [s.name, s.website, s.email, s.phone].filter(Boolean);
    doc.moveTo(L, 784).lineTo(R, 784).lineWidth(0.5).strokeColor('#bbb').stroke();
    doc.font(F.regular).fontSize(8).fillColor('#555')
      .text(footParts.join('  ●  '), L, 789, { width: R - L, align: 'center', height: 11, lineBreak: false });

    doc.end();
  });
}
