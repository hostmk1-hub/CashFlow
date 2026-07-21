import * as repo from './repository.js';
import { sendAdminMail } from '../../services/mailer.js';

export const listOpen = () => repo.listOpen();
export const listAll = () => repo.listAll();
export const resolve = (id) => repo.resolve(id);

/**
 * Raise a platform-level alert: persist it (shows on the dashboard) and, for
 * warning/critical levels, also email the admin. Best-effort — never throws so
 * a failing notification can't break the job that raised it.
 */
export async function notify({ level = 'info', title, message, context = null, email }) {
  try {
    const row = await repo.create({ level, title, message, context });
    const shouldEmail = email || level === 'warning' || level === 'critical';
    if (shouldEmail && email) await sendAdminMail(email);
    return row;
  } catch (err) {
    console.error('[notify] failed to record notification:', err.message);
    return null;
  }
}
