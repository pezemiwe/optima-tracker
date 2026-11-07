'use strict';
const express = require('express');
const { HttpError, wrap, v, validate, slugify } = require('../util');
const { tx } = require('../db');
const {
  hashPassword, verifyPassword, checkPasswordStrength, sha256, newToken, createSession, requireAuth,
  clearSessionCookie, rateLimit,
} = require('../auth');
const { colorFor, logActivity, notify } = require('../services');
const { importLegacy } = require('../legacy');
const { resetEmail } = require('../emails');
const { baseUrl } = require('../emailWorker');

const RESET_MINUTES = 60;

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, color: u.color, theme: u.theme, emailNotifications: u.email_notifications !== false });

async function uniqueSlug(c, name) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    const { rows } = await c.query('SELECT 1 FROM workspaces WHERE slug = $1', [slug]);
    if (!rows.length) return slug;
    slug = `${base}-${i}`;
  }
}

async function loadInvite(db, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const { rows } = await db.query(
    `SELECT i.*, w.name AS workspace_name FROM invites i JOIN workspaces w ON w.id = i.workspace_id
      WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] || null;
}

/* Everything the app shell needs after sign-in. */
async function sessionPayload(db, user) {
  const { rows: ws } = await db.query(
    `SELECT w.id, w.name, w.slug, m.role FROM members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 ORDER BY w.created_at`,
    [user.id],
  );
  const { rows: inv } = await db.query(
    `SELECT i.id, i.role, w.name AS workspace_name FROM invites i JOIN workspaces w ON w.id = i.workspace_id
      WHERE lower(i.email) = lower($1) AND i.accepted_at IS NULL AND i.expires_at > now()`,
    [user.email || ''],
  );
  return { user: publicUser(user), workspaces: ws, pendingInvites: inv };
}

module.exports = function authRoutes(pool, { mailer }) {
  const router = express.Router();
  const loginLimiter = rateLimit({ max: 10, windowMs: 15 * 60 * 1000, key: (req) => `${req.ip}|${String((req.body && req.body.email) || '').toLowerCase()}` });
  const registerLimiter = rateLimit({ max: 20, windowMs: 60 * 60 * 1000, key: (req) => req.ip });

  router.get('/auth/status', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT 1 FROM users WHERE password_hash IS NOT NULL LIMIT 1');
    res.json({ needsSetup: rows.length === 0, emailEnabled: mailer.enabled });
  }));

  router.get('/invites/:token', wrap(async (req, res) => {
    const invite = await loadInvite(pool, req.params.token);
    if (!invite) throw new HttpError(404, 'This invitation is invalid or has expired.', 'invite_invalid');
    const { rows } = await pool.query('SELECT 1 FROM users WHERE lower(email) = lower($1) AND password_hash IS NOT NULL', [invite.email]);
    res.json({ email: invite.email, role: invite.role, workspaceName: invite.workspace_name, hasAccount: rows.length > 0 });
  }));

  router.post('/auth/register', registerLimiter, wrap(async (req, res) => {
    const body = validate(req.body, {
      name: v.str(1, 80), email: v.email, password: (x) => x,
      inviteToken: v.str(1, 100), workspaceName: v.str(1, 80),
    }, { required: ['name', 'email', 'password'] });
    checkPasswordStrength(body.password);
    const passwordHash = await hashPassword(body.password);

    const result = await tx(pool, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(727002)');
      const { rows: real } = await c.query('SELECT 1 FROM users WHERE password_hash IS NOT NULL LIMIT 1');
      const bootstrap = real.length === 0;
      let invite = null;
      let email = body.email;

      if (body.inviteToken) {
        invite = await loadInvite(c, body.inviteToken);
        if (!invite) throw new HttpError(400, 'This invitation is invalid or has expired.', 'invite_invalid');
        email = invite.email.toLowerCase();
      } else if (!bootstrap) {
        throw new HttpError(403, 'Sign-up is by invitation only. Ask a workspace admin for an invite link.', 'invite_required');
      }

      const { rows: existing } = await c.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
      if (existing.length) throw new HttpError(409, 'An account with this email already exists. Sign in instead.', 'email_taken');

      let user;
      if (invite && invite.placeholder_user_id) {
        // Claim the placeholder created by the legacy import so history stays attached.
        const { rows } = await c.query(
          `UPDATE users SET email = $2, name = $3, password_hash = $4, is_placeholder = false, last_login_at = now()
            WHERE id = $1 AND is_placeholder = true RETURNING *`,
          [invite.placeholder_user_id, email, body.name, passwordHash],
        );
        user = rows[0];
      }
      if (!user) {
        const { rows } = await c.query(
          'INSERT INTO users (email, name, password_hash, color, last_login_at) VALUES ($1,$2,$3,$4,now()) RETURNING *',
          [email, body.name, passwordHash, colorFor(email)],
        );
        user = rows[0];
      }

      let imported = 0;
      if (invite) {
        await c.query(
          `INSERT INTO members (workspace_id, user_id, role) VALUES ($1,$2,$3)
           ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
          [invite.workspace_id, user.id, invite.role],
        );
        await c.query('UPDATE invites SET accepted_at = now() WHERE id = $1', [invite.id]);
        await logActivity(c, { workspaceId: invite.workspace_id, actorId: user.id, action: 'member.joined', detail: { name: user.name, role: invite.role } });
      } else {
        const name = body.workspaceName || 'Zenith Optima';
        const { rows: w } = await c.query('INSERT INTO workspaces (name, slug, created_by) VALUES ($1,$2,$3) RETURNING id', [name, await uniqueSlug(c, name), user.id]);
        await c.query("INSERT INTO members (workspace_id, user_id, role) VALUES ($1,$2,'owner')", [w[0].id, user.id]);
        imported = await importLegacy(c, { workspaceId: w[0].id, ownerId: user.id });
        await logActivity(c, { workspaceId: w[0].id, actorId: user.id, action: 'workspace.created', detail: { name } });
      }
      return { user, imported };
    });

    await createSession(pool, req, res, result.user.id);
    res.status(201).json({ ...(await sessionPayload(pool, result.user)), imported: result.imported });
  }));

  router.post('/auth/login', loginLimiter, wrap(async (req, res) => {
    const body = validate(req.body, { email: v.email, password: (x) => x }, { required: ['email', 'password'] });
    const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [body.email]);
    const user = rows[0];
    // Always run a hash so response time does not reveal whether the email exists.
    const ok = await verifyPassword(String(body.password), user ? user.password_hash : 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
    if (!user || !ok) throw new HttpError(401, 'Incorrect email or password.', 'bad_credentials');
    loginLimiter.reset(req);
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    await createSession(pool, req, res, user.id);
    res.json(await sessionPayload(pool, user));
  }));

  router.post('/auth/logout', wrap(async (req, res) => {
    if (req.sessionId) await pool.query('DELETE FROM sessions WHERE id = $1', [req.sessionId]);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  }));

  router.get('/auth/me', requireAuth, wrap(async (req, res) => {
    res.json(await sessionPayload(pool, req.user));
  }));

  router.patch('/auth/me', requireAuth, wrap(async (req, res) => {
    const body = validate(req.body, { name: v.str(1, 80), theme: v.oneOf(['system', 'light', 'dark']), color: v.color, emailNotifications: v.bool });
    if (!Object.keys(body).length) throw new HttpError(400, 'Nothing to change.');
    const columns = { name: 'name', theme: 'theme', color: 'color', emailNotifications: 'email_notifications' };
    const sets = Object.keys(body).map((k, i) => `${columns[k]} = $${i + 2}`);
    const { rows } = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [req.user.id, ...Object.values(body)]);
    res.json({ user: publicUser(rows[0]) });
  }));

  router.post('/auth/password', requireAuth, wrap(async (req, res) => {
    const body = validate(req.body, { current: (x) => x, next: (x) => x }, { required: ['current', 'next'] });
    checkPasswordStrength(body.next);
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(String(body.current), rows[0].password_hash))) throw new HttpError(400, 'Your current password is incorrect.', 'bad_credentials');
    const hash = await hashPassword(body.next);
    await tx(pool, async (c) => {
      await c.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, hash]);
      // Sign out every other device.
      await c.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [req.user.id, req.sessionId]);
    });
    res.json({ ok: true });
  }));

  /* ---------- password reset ---------- */
  const forgotLimiter = rateLimit({ max: 5, windowMs: 60 * 60 * 1000, key: (req) => `${req.ip}|${String((req.body && req.body.email) || '').toLowerCase()}` });
  const resetLimiter = rateLimit({ max: 15, windowMs: 60 * 60 * 1000, key: (req) => req.ip });

  async function issueReset(db, userId, createdBy, minutes) {
    const token = newToken();
    await db.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
    await db.query(
      "INSERT INTO password_resets (user_id, token_hash, created_by, expires_at) VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)",
      [userId, sha256(token), createdBy, String(minutes)],
    );
    return token;
  }

  /* Always answers the same way, so it cannot be used to discover which emails have accounts. */
  router.post('/auth/forgot', forgotLimiter, wrap(async (req, res) => {
    const body = validate(req.body, { email: v.email }, { required: ['email'] });
    if (mailer.enabled) {
      const { rows } = await pool.query('SELECT id, email FROM users WHERE lower(email) = $1 AND password_hash IS NOT NULL', [body.email]);
      if (rows[0]) {
        const token = await issueReset(pool, rows[0].id, null, RESET_MINUTES);
        const link = `${baseUrl() || `${req.protocol}://${req.get('host')}`}/reset/${token}`;
        mailer.send({ to: rows[0].email, ...resetEmail(link) }).catch((e) => console.error('Reset email failed:', e.message));
      }
    }
    res.json({ ok: true, emailEnabled: mailer.enabled });
  }));

  async function loadReset(db, token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const { rows } = await db.query(
      'SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()',
      [sha256(token)],
    );
    return rows[0] || null;
  }

  router.get('/auth/reset/:token', resetLimiter, wrap(async (req, res) => {
    if (!(await loadReset(pool, req.params.token))) throw new HttpError(404, 'This reset link is invalid or has expired.', 'reset_invalid');
    res.json({ valid: true });
  }));

  router.post('/auth/reset', resetLimiter, wrap(async (req, res) => {
    const body = validate(req.body, { token: v.str(1, 100), password: (x) => x }, { required: ['token', 'password'] });
    checkPasswordStrength(body.password);
    const hash = await hashPassword(body.password);
    const user = await tx(pool, async (c) => {
      const reset = await loadReset(c, body.token);
      if (!reset) throw new HttpError(400, 'This reset link is invalid or has expired.', 'reset_invalid');
      await c.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
      const { rows } = await c.query('UPDATE users SET password_hash = $2, last_login_at = now() WHERE id = $1 RETURNING *', [reset.user_id, hash]);
      // Everyone signed in with the old password is signed out.
      await c.query('DELETE FROM sessions WHERE user_id = $1', [reset.user_id]);
      return rows[0];
    });
    await createSession(pool, req, res, user.id);
    res.json(await sessionPayload(pool, user));
  }));

  /* A signed-in user accepts an invitation addressed to their email. */
  router.post('/invites/:token/accept', requireAuth, wrap(async (req, res) => {
    const invite = await loadInvite(pool, req.params.token);
    if (!invite) throw new HttpError(404, 'This invitation is invalid or has expired.', 'invite_invalid');
    if (!req.user.email || invite.email.toLowerCase() !== req.user.email.toLowerCase()) {
      throw new HttpError(403, `This invitation was sent to ${invite.email}. Sign in with that account to accept it.`, 'invite_mismatch');
    }
    await tx(pool, async (c) => {
      await c.query(
        `INSERT INTO members (workspace_id, user_id, role) VALUES ($1,$2,$3)
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [invite.workspace_id, req.user.id, invite.role],
      );
      await c.query('UPDATE invites SET accepted_at = now() WHERE id = $1', [invite.id]);
      await logActivity(c, { workspaceId: invite.workspace_id, actorId: req.user.id, action: 'member.joined', detail: { name: req.user.name, role: invite.role } });
      await notify(c, { userIds: invite.invited_by ? [invite.invited_by] : [], workspaceId: invite.workspace_id, actorId: req.user.id, type: 'invite', body: `${req.user.name} accepted your invitation` });
    });
    res.json(await sessionPayload(pool, req.user));
  }));

  return router;
};
