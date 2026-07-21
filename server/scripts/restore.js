import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { config, r2Enabled } from '../shared/config.js';
import { BACKUP_DIR, listR2Backups, fetchFromR2, lastBackup } from '../services/backupService.js';

const execAsync = promisify(exec);

// Usage:
//   npm run restore -- list            # list available backups (local + R2)
//   npm run restore -- latest          # restore newest backup (R2 if configured, else local)
//   npm run restore -- <filename>      # restore a specific dump (local or R2)
const arg = process.argv[2] || 'latest';

async function localList() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.sql.gz')).sort().reverse();
}

async function resolveFile(which) {
  // Prefer R2 when configured (off-site is the disaster-recovery source of truth).
  if (r2Enabled()) {
    const remote = await listR2Backups();
    if (which === 'latest') {
      if (!remote.length) throw new Error('No backups found in R2');
      return fetchFromR2(remote[0].file);
    }
    const hit = remote.find((r) => r.file === which || r.key === which);
    if (hit) return fetchFromR2(hit.file);
  }
  // Fall back to local backups volume.
  const local = await localList();
  if (which === 'latest') {
    const last = lastBackup();
    if (!last) throw new Error('No local backups found');
    return path.join(BACKUP_DIR, last.file);
  }
  if (local.includes(which)) return path.join(BACKUP_DIR, which);
  throw new Error(`Backup not found: ${which}`);
}

async function main() {
  if (arg === 'list') {
    console.log('Local backups:');
    (await localList()).forEach((f) => console.log('  ' + f));
    if (r2Enabled()) {
      console.log('R2 backups:');
      (await listR2Backups()).forEach((r) => console.log(`  ${r.file}  (${Math.round((r.size || 0) / 1024)} KB, ${r.at})`));
    } else {
      console.log('R2: not configured');
    }
    return;
  }

  const file = await resolveFile(arg);
  console.log(`[restore] restoring from ${path.basename(file)} …`);
  // Dumps are made with --clean --if-exists, so piping through psql drops and
  // recreates objects cleanly over the existing database.
  await execAsync(`gunzip -c "${file}" | psql "${config.databaseUrl}"`, { maxBuffer: 1024 * 1024 * 256 });
  console.log('[restore] done ✓');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[restore] FAILED:', err.message);
    process.exit(1);
  });
