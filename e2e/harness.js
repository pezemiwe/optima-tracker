'use strict';
/*
 * End-to-end harness: boots the real server (built app + Postgres) in-process with a memory mailer,
 * and launches Chromium. Needs `npm run build` first and a throwaway TEST_DATABASE_URL (its public schema is recreated).
 *   E2E_CHROMIUM=/path/to/chrome  use a specific browser binary (otherwise Playwright's own is used)
 */
const { chromium } = require('playwright');
const { makePool, migrate } = require('../server/db');
const { createApp } = require('../server/app');
const { createMemoryMailer } = require('../server/mailer');

const DB = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/optima_test';

async function boot() {
  const pool = makePool(DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  const mailer = createMemoryMailer();
  const server = await new Promise((resolve) => { const s = createApp(pool, { mailer }).listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { pool, mailer, base, close: async () => { server.close(); await pool.end(); } };
}

async function launch() {
  return chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined, args: ['--no-sandbox'] });
}

/* A fresh browser context (separate cookies) with page errors collected. */
async function newPage(browser, errors, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // 4xx responses are expected in negative tests; anything else logged as an error is a bug.
    if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return page;
}

async function login(page, base, email, password) {
  await page.goto(`${base}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector('text=Good ');
}

module.exports = { boot, launch, newPage, login };
