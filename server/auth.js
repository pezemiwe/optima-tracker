'use strict';
const crypto = require('crypto');
const { HttpError, ROLE_RANK } = require('./util');

const COOKIE = 'optima_session';
const SESSION_DAYS = 30;

/* ---------- passwords (scrypt) ---------- */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, n, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || Number(n) !== SCRYPT.N) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function checkPasswordStrength(password) {
  if (typeof password !== 'string') throw new HttpError(400, 'Password is required.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (password.length > 200) throw new HttpError(400, 'Password is too long.');
}

/* ---------- tokens ---------- */
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

/* ---------- cookies ---------- */
function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed cookie */ }
  }
  return out;
}

function cookieFlags(req) {
  const secure = req.secure || process.env.NODE_ENV === 'production';
  return `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function setSessionCookie(req, res, token) {
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(req)}; Max-Age=${SESSION_DAYS * 86400}`);
}

function clearSessionCookie(req, res) {
  res.append('Set-Cookie', `${COOKIE}=; ${cookieFlags(req)}; Max-Age=0`);
}

/* ---------- sessions ---------- */
async function createSession(db, req, res, userId) {
  const token = newToken();
  await db.query(
    "INSERT INTO sessions (user_id, token_hash, user_agent, expires_at) VALUES ($1,$2,$3, now() + ($4 || ' days')::interval)",
    [userId, sha256(token), String(req.headers['user-agent'] || '').slice(0, 300), String(SESSION_DAYS)],
  );
  setSessionCookie(req, res, token);
}

/* Loads req.user from the session cookie when present and valid. */
function authenticate(pool) {
  return async (req, res, next) => {
    try {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (token) {
        const { rows } = await pool.query(
          `SELECT u.id, u.email, u.name, u.color, u.theme, s.id AS session_id, s.expires_at
             FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = $1 AND s.expires_at > now()`,
          [sha256(token)],
        );
        if (rows[0]) {
          req.user = rows[0];
          req.sessionId = rows[0].session_id;
          // Sliding expiry: renew once less than half the lifetime is left.
          if (new Date(rows[0].expires_at).getTime() - Date.now() < (SESSION_DAYS * 86400000) / 2) {
            await pool.query("UPDATE sessions SET expires_at = now() + ($2 || ' days')::interval WHERE id = $1", [rows[0].session_id, String(SESSION_DAYS)]);
            setSessionCookie(req, res, token);
          }
        }
      }
      next();
    } catch (e) { next(e); }
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in.', 'unauthenticated'));
  next();
}

/* Rejects cross-site writes: the browser's Origin must match this host. */
function originCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* invalid */ }
    if (host !== req.headers.host) return next(new HttpError(403, 'Cross-site request blocked.', 'csrf'));
  }
  next();
}

function requireJson(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method)) return next();
  if (!/^application\/json/.test(req.headers['content-type'] || '')) return next(new HttpError(415, 'JSON required.'));
  next();
}

/* ---------- rate limiting (in memory, per process) ---------- */
function rateLimit({ max, windowMs, key }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();
  const middleware = (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; hits.set(k, entry); }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return next(new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', 'rate_limited'));
    }
    next();
  };
  middleware.reset = (req) => hits.delete(key(req));
  return middleware;
}

/* ---------- workspace access ---------- */
async function workspaceRole(db, userId, workspaceId) {
  const { rows } = await db.query('SELECT role FROM members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
  return rows[0] ? rows[0].role : null;
}

/* Throws unless the user has at least `min` in the workspace. Returns the role. */
async function requireRole(db, user, workspaceId, min = 'viewer') {
  const role = await workspaceRole(db, user.id, workspaceId);
  // Same message for "no such workspace" and "not a member" so ids cannot be probed.
  if (!role) throw new HttpError(404, 'Workspace not found.', 'not_found');
  if (ROLE_RANK[role] < ROLE_RANK[min]) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
  return role;
}

module.exports = {
  hashPassword, verifyPassword, checkPasswordStrength, sha256, newToken,
  createSession, authenticate, requireAuth, originCheck, requireJson, rateLimit,
  clearSessionCookie, workspaceRole, requireRole,
};
