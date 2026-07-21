import nodemailer from 'nodemailer';
import { config, smtpEnabled } from '../shared/config.js';

let transporter = null;
function getTransport() {
  if (!transporter && smtpEnabled()) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/**
 * Send an admin email. Degrades gracefully: if SMTP isn't configured it logs
 * the message instead of failing, so notifications never break the caller.
 */
export async function sendAdminMail({ subject, html }) {
  if (!smtpEnabled()) {
    console.log(`[mail] SMTP not configured — would send to admin: "${subject}"`);
    return { sent: false, reason: 'smtp-not-configured' };
  }
  try {
    await getTransport().sendMail({ from: config.smtp.from, to: config.adminEmail, subject, html });
    console.log(`[mail] sent to ${config.adminEmail}: "${subject}"`);
    return { sent: true };
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}
