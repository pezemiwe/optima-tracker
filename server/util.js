'use strict';
/* Small shared helpers: HTTP errors, async wrapper and input validation. */

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

function fail(message) {
  throw new Error(message);
}

/* Validators take a raw value and return the normalised value, or throw. */
const v = {
  str: (min, max) => (x) => {
    if (typeof x !== 'string') fail('must be text');
    const t = x.trim();
    if (t.length < min) fail(min === 1 ? 'is required' : `must be at least ${min} characters`);
    if (t.length > max) fail(`must be at most ${max} characters`);
    return t;
  },
  // Free text that keeps its whitespace (descriptions, comments), may be empty.
  text: (max) => (x) => {
    if (typeof x !== 'string') fail('must be text');
    if (x.length > max) fail(`must be at most ${max} characters`);
    return x;
  },
  email: (x) => {
    if (typeof x !== 'string') fail('must be text');
    const t = x.trim().toLowerCase();
    if (t.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) fail('must be a valid email address');
    return t;
  },
  oneOf: (list) => (x) => {
    if (!list.includes(x)) fail(`must be one of: ${list.join(', ')}`);
    return x;
  },
  uuid: (x) => {
    if (!isUuid(x)) fail('must be an id');
    return x.toLowerCase();
  },
  bool: (x) => {
    if (typeof x !== 'boolean') fail('must be true or false');
    return x;
  },
  int: (min, max) => (x) => {
    if (!Number.isInteger(x) || x < min || x > max) fail(`must be a whole number between ${min} and ${max}`);
    return x;
  },
  num: (x) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) fail('must be a number');
    return x;
  },
  date: (x) => {
    if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) fail('must be a date (YYYY-MM-DD)');
    const d = new Date(`${x}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== x) fail('must be a real date');
    return x;
  },
  time: (x) => {
    if (typeof x !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x)) fail('must be a time (HH:MM)');
    return x;
  },
  color: (x) => {
    if (typeof x !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(x)) fail('must be a hex colour like #4a7a0a');
    return x.toLowerCase();
  },
  url: (x) => {
    if (typeof x !== 'string') fail('must be text');
    const t = x.trim();
    if (t.length > 2000) fail('is too long');
    let u;
    try { u = new URL(t); } catch { fail('must be a valid link'); }
    if (!['http:', 'https:'].includes(u.protocol)) fail('must start with http:// or https://');
    return u.toString();
  },
  uuidList: (max) => (x) => {
    if (!Array.isArray(x) || x.length > max) fail(`must be a list of at most ${max} ids`);
    const out = [...new Set(x.map((i) => {
      if (!isUuid(i)) fail('must contain only ids');
      return i.toLowerCase();
    }))];
    return out;
  },
  nullable: (inner) => (x) => (x === null ? null : inner(x)),
};

/*
 * validate(body, spec, { required }) -> cleaned object.
 * Unknown fields are rejected so typos never silently pass.
 */
function validate(body, spec, { required = [] } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Request body must be a JSON object.');
  const out = {};
  for (const key of Object.keys(body)) {
    if (!spec[key]) throw new HttpError(400, `Unknown field: ${key}`);
    try {
      out[key] = spec[key](body[key]);
    } catch (e) {
      throw new HttpError(400, `${key} ${e.message}.`, 'invalid');
    }
  }
  for (const key of required) {
    if (!(key in out)) throw new HttpError(400, `${key} is required.`, 'invalid');
  }
  return out;
}

const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };

function slugify(name) {
  const base = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || 'workspace';
}

module.exports = { HttpError, wrap, v, validate, isUuid, ROLE_RANK, slugify };
