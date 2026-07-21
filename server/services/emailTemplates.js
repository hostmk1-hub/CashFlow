// Simple, self-contained HTML email templates (inline styles for mail clients).
const shell = (title, bodyHtml, accent = '#2563eb') => `
<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1a1d23">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e6e8ec;border-radius:12px;overflow:hidden">
    <div style="background:${accent};color:#fff;padding:16px 22px;font-size:18px;font-weight:bold">Finance · Rentonic</div>
    <div style="padding:22px">
      <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
      ${bodyHtml}
    </div>
    <div style="padding:14px 22px;border-top:1px solid #e6e8ec;color:#6b7280;font-size:12px">
      Automated message from finance.rentonic.app
    </div>
  </div>
</body></html>`;

export function backupSuccess({ file, verified, r2 }) {
  return {
    subject: `✅ Backup OK${verified ? ' & verified' : ''} — ${file}`,
    html: shell(
      'Nightly backup completed',
      `<p>The database backup ran successfully.</p>
       <ul>
         <li><b>File:</b> ${file}</li>
         <li><b>Off-site (R2):</b> ${r2 ? 'uploaded ✓' : 'not configured'}</li>
         <li><b>Verified restore:</b> ${verified ? 'passed ✓' : 'not run'}</li>
       </ul>`,
      '#16a34a',
    ),
  };
}

export function backupFailed({ stage, error, file }) {
  return {
    subject: `🚨 Backup ${stage} FAILED`,
    html: shell(
      `Backup ${stage} failed`,
      `<p style="color:#b91c1c"><b>The database backup needs attention.</b></p>
       <ul>
         ${file ? `<li><b>File:</b> ${file}</li>` : ''}
         <li><b>Stage:</b> ${stage}</li>
         <li><b>Error:</b> <code>${(error || '').slice(0, 500)}</code></li>
       </ul>
       <p>Check <code>docker compose logs api</code> and the Backups panel in Settings.</p>`,
      '#dc2626',
    ),
  };
}

export function testEmail() {
  return {
    subject: '✅ Finance · Rentonic test email',
    html: shell('SMTP is working', '<p>This is a test notification. If you received it, admin alerts are configured correctly.</p>'),
  };
}
