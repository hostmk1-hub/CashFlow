import { pool } from '../shared/db.js';
import { runBackup } from '../services/backupService.js';
import { r2Enabled } from '../shared/config.js';

// Manual backup: `npm run backup`. Same routine the nightly cron runs.
const res = await runBackup();
console.log(res.ok ? `[backup] done: ${res.file}${res.r2 ? ' (uploaded to R2)' : r2Enabled() ? '' : ' (R2 not configured — local only)'}` : `[backup] FAILED: ${res.error}`);
await pool.end();
process.exit(res.ok ? 0 : 1);
