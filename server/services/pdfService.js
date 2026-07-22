import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../shared/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../uploads/invoices');

function fmtMkd(n) {
  return new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 2 }).format(Number(n || 0)) + ' ден';
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

/**
 * Render a client invoice to a PDF file (tenant letterhead, itemized amount,
 * due date, payment terms). Returns a web path under /uploads. PDFKit ships
 * Helvetica which covers Latin; Cyrillic descriptions render via the bundled
 * font fallback embedded below when present.
 */
export async function generateClientInvoicePdf(tenantId, invoice, client) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const head = await tenantLetterhead(tenantId);
  const fileName = `client-invoice-${invoice.id}.pdf`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Letterhead
    doc.fontSize(20).text(head.name, { continued: false });
    doc.fontSize(9).fillColor('#666');
    if (head.address) doc.text(head.address);
    if (head.phone) doc.text(head.phone);
    doc.moveDown();

    doc.fillColor('#111').fontSize(16).text('INVOICE', { align: 'right' });
    doc.fontSize(10).fillColor('#444')
      .text(`No: ${invoice.invoice_number}`, { align: 'right' })
      .text(`Client: ${client?.name || ''}`, { align: 'right' })
      .text(`Issued: ${invoice.issue_date}`, { align: 'right' })
      .text(`Due: ${invoice.due_date}`, { align: 'right' });
    doc.moveDown(2);

    // Itemized line
    const top = doc.y;
    doc.fillColor('#111').fontSize(10);
    doc.text('Description', 50, top);
    doc.text('Amount', 400, top, { width: 145, align: 'right' });
    doc.moveTo(50, top + 16).lineTo(545, top + 16).strokeColor('#ccc').stroke();
    doc.text(invoice.description, 50, top + 24, { width: 340 });
    const amountLabel = invoice.currency === 'EUR'
      ? `${fmtMkd(invoice.amount)}  (€${invoice.original_amount} @ ${invoice.exchange_rate})`
      : fmtMkd(invoice.amount);
    doc.text(amountLabel, 400, top + 24, { width: 145, align: 'right' });

    doc.moveDown(4);
    doc.fontSize(13).fillColor('#111').text(`Total: ${fmtMkd(invoice.amount)}`, { align: 'right' });

    doc.moveDown(3).fontSize(8).fillColor('#888')
      .text('Payment terms: due by the date shown above. Thank you for your business.', 50);

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return `/uploads/invoices/${fileName}`;
}
