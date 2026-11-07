'use strict';
/*
 * Sends unsent notifications as one digest per person. A short delay lets bursts
 * (several comments in a row) batch into one email.
 */
const { digestEmail } = require('./emails');

function baseUrl() {
  return process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || null;
}

async function runOnce(pool, mailer, { delaySeconds = 120, limit = 500 } = {}) {
  if (!mailer.enabled) return 0;
  const c = await pool.connect();
  let sent = 0;
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(
      `SELECT n.id, n.user_id, n.body, n.task_id, w.slug, p.key AS project_key, t.number AS task_number,
              u.email, u.email_notifications
         FROM notifications n
         JOIN users u ON u.id = n.user_id
         JOIN workspaces w ON w.id = n.workspace_id
         LEFT JOIN tasks t ON t.id = n.task_id
         LEFT JOIN projects p ON p.id = t.project_id
        WHERE n.emailed_at IS NULL AND n.created_at < now() - ($1 || ' seconds')::interval
        ORDER BY n.id LIMIT $2 FOR UPDATE OF n SKIP LOCKED`,
      [String(delaySeconds), limit],
    );
    const byUser = new Map();
    for (const r of rows) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      byUser.get(r.user_id).push(r);
    }
    const app = baseUrl();
    const done = [];
    for (const [, list] of byUser) {
      const { email, email_notifications: wants } = list[0];
      done.push(...list.map((r) => r.id));
      if (!email || !wants) continue; // placeholders and opted-out people: mark handled, send nothing
      const items = list.map((r) => ({
        body: r.body,
        link: app && r.project_key && r.task_number ? `${app}/w/${r.slug}/p/${r.project_key}/list?task=${r.task_number}` : null,
      }));
      try {
        await mailer.send({ to: email, ...digestEmail(items, app) });
        sent += 1;
      } catch (e) {
        // Leave these unsent so the next run retries them.
        console.error('Notification email failed:', e.message);
        for (const r of list) done.splice(done.indexOf(r.id), 1);
      }
    }
    if (done.length) await c.query('UPDATE notifications SET emailed_at = now() WHERE id = ANY($1::bigint[])', [done]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return sent;
}

function startEmailWorker(pool, mailer, { intervalMs = 60000 } = {}) {
  if (!mailer.enabled) return null;
  const timer = setInterval(() => runOnce(pool, mailer).catch((e) => console.error('Email worker:', e.message)), intervalMs);
  timer.unref();
  return timer;
}

module.exports = { runOnce, startEmailWorker, baseUrl };
