'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AxeBuilder = require('@axe-core/playwright').default;
const { boot, launch, newPage, login } = require('./harness');

const PASSWORD = 'correct horse battery';
const errors = [];
let env; let browser; let owner; let base; let tmp;

const clientApi = (page) => (method, url, body) => page.evaluate(async ([m, u, b]) => {
  const r = await fetch(`/api${u}`, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, [method, url, body]);

test.before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'optima-e2e-'));
  fs.writeFileSync(path.join(tmp, 'notes.txt'), 'meeting notes\n');
  fs.writeFileSync(path.join(tmp, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  env = await boot();
  base = env.base;
  browser = await launch();
  owner = await newPage(browser, errors);
});
test.after(async () => {
  await browser?.close();
  await env?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.deepEqual(errors, [], `unexpected browser errors:\n${errors.join('\n')}`);
});

test('first-run setup creates the owner and imports the original checklist', async () => {
  await owner.goto(base);
  await owner.waitForSelector('text=Set up your workspace');
  await owner.fill('#name', 'Ada Owner');
  await owner.fill('#email', 'ada@example.com');
  await owner.fill('#password', PASSWORD);
  await owner.click('button:has-text("Create workspace")');
  await owner.waitForSelector('text=Good ');
  await owner.waitForSelector('text=Imported 4 tasks');
  await owner.click('a:has-text("Daily Close-out")');
  await owner.waitForSelector('text=Showing 4 of 4 tasks');
  assert.match(owner.url(), /\/w\/zenith-optima\/p\/CLO\/list/);
});

test('task panel: change fields, add a subtask, comment with a mention', async () => {
  await owner.goto(`${base}/w/zenith-optima/p/CLO/list?task=3`);
  await owner.waitForSelector('aside[aria-label="Details"]');
  await owner.click('aside[aria-label="Details"] button[aria-label="Status"]');
  await owner.click('[role="menu"] >> text=In progress');
  await owner.click('aside[aria-label="Details"] button[aria-label="Priority"]');
  await owner.click('[role="menu"] >> text=Urgent');
  await owner.waitForSelector('text=changed priority from medium to urgent');
  await owner.fill('input[aria-label="Add a subtask"]', 'Collect feedback notes');
  await owner.press('input[aria-label="Add a subtask"]', 'Enter');
  await owner.waitForSelector('text=Collect feedback notes');
  await owner.fill('textarea[aria-label="Comment"]', 'Please review @Sam');
  await owner.waitForSelector('[role="listbox"] >> text=Samuel Kolajo');
  await owner.press('textarea[aria-label="Comment"]', 'Enter');
  assert.equal(await owner.inputValue('textarea[aria-label="Comment"]'), 'Please review @Samuel Kolajo ');
  await owner.click('button:text-is("Comment")');
  await owner.waitForSelector('[id^="comment-"]');
  await owner.keyboard.press('Escape');
  await owner.waitForFunction(() => !location.search.includes('task='));
});

test('markdown renders safely and checklists are clickable', async () => {
  await owner.goto(`${base}/w/zenith-optima/p/CLO/list?task=2`);
  await owner.waitForSelector('aside[aria-label="Details"]');
  if (!(await owner.locator('textarea[aria-label="Description"]').count())) await owner.click('div:has(> p:has-text("Description")) button:has-text("Edit")');
  await owner.fill('textarea[aria-label="Description"]', '## Plan\n\nThis is **bold**. <img src=x onerror="window.__pwned=1"> [bad](javascript:alert(1))\n\n- [ ] first\n- [x] second\n\nSee https://example.com/spec');
  await owner.click('h3:has-text("Subtasks")');
  await owner.waitForSelector('strong:has-text("bold")');
  assert.equal(await owner.locator('h4:has-text("Plan")').count(), 1);
  assert.equal(await owner.locator('a[href^="javascript"]').count(), 0, 'no script links');
  assert.equal(await owner.locator('aside img[src="x"]').count(), 0, 'no injected elements');
  assert.equal(await owner.evaluate(() => window.__pwned), undefined, 'injected handlers never run');
  await owner.locator('input[aria-label="Mark done"]').first().click();
  await owner.waitForTimeout(600);
  await owner.reload();
  await owner.waitForSelector('aside[aria-label="Details"]');
  assert.equal(await owner.locator('input[aria-label="Mark not done"]').count(), 2, 'ticking a box is saved');
});

test('attachments upload, show a thumbnail, and download the exact bytes', async () => {
  await owner.setInputFiles('input[aria-label="Attach files"]', [path.join(tmp, 'pixel.png'), path.join(tmp, 'notes.txt')]);
  await owner.waitForSelector('a:has-text("notes.txt")');
  await owner.waitForSelector('img[src*="inline=1"]');
  const [download] = await Promise.all([owner.waitForEvent('download'), owner.click('a:has-text("notes.txt")')]);
  assert.equal(fs.readFileSync(await download.path(), 'utf8'), 'meeting notes\n');
  const sideways = await owner.evaluate(() => { const el = document.querySelector('aside[aria-label^="Task"] .overflow-y-auto'); return el.scrollWidth > el.clientWidth + 1; });
  assert.equal(sideways, false, 'the panel never scrolls sideways');
});

test('dependencies: add from search, refuse a loop, show Blocked in the list', async () => {
  await owner.click('section[aria-label="Dependencies"] button:has-text("Add")');
  await owner.click('[role="radio"]:has-text("Blocked by")');
  await owner.fill('input[aria-label="Find a task to link"]', 'OPEX module');
  await owner.click('ul.max-h-48 button:has-text("Update OPEX module")');
  await owner.waitForSelector('section[aria-label="Dependencies"] >> text=Blocked by');
  await owner.goto(`${base}/w/zenith-optima/p/CLO/list?task=3`);
  await owner.waitForSelector('aside[aria-label="Details"]');
  await owner.click('section[aria-label="Dependencies"] button:has-text("Add")');
  await owner.click('[role="radio"]:has-text("Blocked by")');
  await owner.fill('input[aria-label="Find a task to link"]', 'DAMS module');
  await owner.click('ul.max-h-48 button:has-text("Update DAMS module")');
  await owner.waitForSelector('text=circular dependency');
  await owner.keyboard.press('Escape');
  await owner.goto(`${base}/w/zenith-optima/p/CLO/list`);
  await owner.waitForSelector('[role="listitem"]:has-text("DAMS module") >> text=Blocked');
});

test('board: drag a card between columns, and move one with the keyboard', async () => {
  await owner.click('a[role="tab"]:has-text("Board")');
  await owner.waitForSelector('[aria-label="Done column"]');
  await owner.locator('article[aria-label^="CLO-1 "]').dragTo(owner.locator('[aria-label="Done column"]'));
  await owner.waitForSelector('[aria-label="Done column"] article[aria-label^="CLO-1 "]');
  const card = owner.locator('article[aria-label^="CLO-4 "]');
  await card.focus();
  await owner.keyboard.press('Alt+ArrowRight');
  await owner.waitForSelector('[aria-label="In progress column"] article[aria-label^="CLO-4 "]');
  assert.equal(await owner.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('CLO-4 ')), true, 'focus follows the card');
  assert.match(await owner.locator('[role="status"].sr-only').textContent(), /Moved CLO-4 to In progress/);
});

test('create a project and tasks, then search, filter, save a view, bulk edit and use the palette', async () => {
  await owner.click('button[aria-label="New project"]');
  await owner.fill('#np-name', 'Website Redesign');
  assert.equal(await owner.inputValue('#np-key'), 'WR');
  await owner.click('button:has-text("Create project")');
  await owner.waitForURL(/\/p\/WR\/list/);
  await owner.waitForSelector('text=No tasks in this project yet');
  await owner.keyboard.press('n');
  await owner.fill('input[aria-label="Task title"]', 'Design the homepage hero');
  await owner.click('button[aria-label="Priority"]');
  await owner.click('[role="menu"] >> text=High');
  await owner.click('button:has-text("Create task")');
  await owner.waitForSelector('text=Design the homepage hero');
  for (const title of ['Write copy for pricing page', 'Set up analytics']) {
    await owner.fill('input[aria-label="Add task…"] >> nth=0', title);
    await owner.press('input[aria-label="Add task…"] >> nth=0', 'Enter');
    await owner.waitForSelector(`text=${title}`);
  }
  await owner.keyboard.press('/');
  await owner.keyboard.type('pricing');
  await owner.waitForTimeout(300);
  assert.equal(await owner.locator('[role="listitem"]:has-text("analytics")').count(), 0, 'search hides non-matches');
  await owner.fill('input[aria-label="Search tasks"]', '');
  await owner.click('button:has-text("Filter")');
  await owner.click('button:has-text("Priority")');
  await owner.click('[role="menu"] >> text=High');
  await owner.keyboard.press('Escape');
  await owner.waitForTimeout(300);
  assert.equal(await owner.locator('[role="listitem"]:has-text("pricing")').count(), 0, 'priority filter works');
  await owner.click('button:has-text("Views")');
  await owner.click('text=Save current view');
  await owner.fill('#sv-name', 'High priority');
  await owner.click('button:has-text("Save view")');
  await owner.waitForSelector('text=View saved');
  await owner.click('button:has-text("Clear all")');
  await owner.waitForSelector('[role="listitem"]:has-text("pricing")');
  await owner.locator('[role="listitem"]:has-text("pricing") input[type="checkbox"]').check({ force: true });
  await owner.locator('[role="listitem"]:has-text("analytics") input[type="checkbox"]').check({ force: true });
  await owner.click('[aria-label="Bulk actions"] button[aria-label="Status"]');
  await owner.click('[role="menu"] >> text=In progress');
  await owner.waitForSelector('text=Updated 2 tasks');
  await owner.keyboard.press('Control+k');
  await owner.fill('input[role="combobox"]', 'hero');
  await owner.waitForSelector('[role="option"]:has-text("WR-1")');
  await owner.keyboard.press('Enter');
  await owner.waitForSelector('[aria-label="Task WR-1"]');
  await owner.keyboard.press('Escape');
});

test('two people editing one description: the second save is caught and can be resolved', async () => {
  const other = await newPage(browser, errors);
  const api = clientApi(owner);
  const inv = await api('POST', `/workspaces/${await owner.evaluate(async () => (await (await fetch('/api/auth/me')).json()).workspaces[0].id)}/invites`, { email: 'bea@example.com', role: 'member' });
  await other.goto(`${base}${inv.json.path}`);
  await other.fill('#name', 'Bea Member');
  await other.fill('#password', PASSWORD);
  await other.click('button:has-text("Create account and join")');
  await other.waitForSelector('text=Good ');

  for (const page of [owner, other]) {
    await page.goto(`${base}/w/zenith-optima/p/WR/list?task=1`);
    await page.waitForSelector('aside[aria-label="Details"]');
    if (!(await page.locator('textarea[aria-label="Description"]').count())) await page.click('div:has(> p:has-text("Description")) button:has-text("Edit")');
  }
  await owner.fill('textarea[aria-label="Description"]', 'Owner wrote this first');
  await other.fill('textarea[aria-label="Description"]', 'Bea wrote something else');
  await owner.click('h3:has-text("Subtasks")');
  await owner.waitForSelector('text=Owner wrote this first');
  await other.click('h3:has-text("Subtasks")');
  await other.waitForSelector('text=Someone else changed the description');
  assert.match(await other.locator('[role="dialog"]').innerText(), /Owner wrote this first/);
  await other.click('button:has-text("Overwrite with mine")');
  await other.waitForSelector('text=Bea wrote something else');
  await other.context().close();
});

test('invites, viewer read-only access and live notifications', async () => {
  const wid = await owner.evaluate(async () => (await (await fetch('/api/auth/me')).json()).workspaces[0].id);
  const api = clientApi(owner);
  const members = (await api('GET', `/workspaces/${wid}/members`)).json.members;
  const sam = members.find((m) => m.name === 'Samuel Kolajo');

  // Samuel claims his imported name and is a member.
  const samInvite = await api('POST', `/workspaces/${wid}/invites`, { email: 'sam@example.com', role: 'member', placeholderUserId: sam.id });
  const samPage = await newPage(browser, errors);
  await samPage.goto(`${base}${samInvite.json.path}`);
  await samPage.fill('#name', 'Samuel Kolajo');
  await samPage.fill('#password', PASSWORD);
  await samPage.click('button:has-text("Create account and join")');
  await samPage.waitForSelector('text=Good ');
  await samPage.click('a:has-text("My tasks")');
  await samPage.waitForSelector('text=Update DAMS module');

  // The owner assigns Samuel a task; his bell lights up without a refresh.
  await owner.goto(`${base}/w/zenith-optima/p/WR/list?task=2`);
  await owner.waitForSelector('aside[aria-label="Details"]');
  await owner.click('aside[aria-label="Details"] button[aria-label="Assignee"]');
  await owner.click('[role="menu"] >> text=Samuel Kolajo');
  await samPage.waitForSelector('button[aria-label^="Notifications, "]', { timeout: 15000 });
  await samPage.click('button[aria-label^="Notifications"]');
  await samPage.click('text=assigned you');
  await samPage.waitForSelector('[aria-label="Task WR-2"]');
  await samPage.context().close();

  // A viewer can read but not change anything.
  const viewerInvite = await api('POST', `/workspaces/${wid}/invites`, { email: 'vic@example.com', role: 'viewer' });
  const vic = await newPage(browser, errors);
  await vic.goto(`${base}${viewerInvite.json.path}`);
  await vic.fill('#name', 'Vic Viewer');
  await vic.fill('#password', PASSWORD);
  await vic.click('button:has-text("Create account and join")');
  await vic.waitForSelector('text=Good ');
  assert.equal(await vic.locator('button:has-text("New task")').count(), 0);
  await vic.goto(`${base}/w/zenith-optima/p/WR/list?task=1`);
  await vic.waitForSelector('aside[aria-label="Details"]');
  assert.equal(await vic.locator('input[aria-label="Title"]').isDisabled(), true);
  assert.equal(await vic.locator('textarea[aria-label="Comment"]').count(), 0);
  assert.equal(await vic.locator('a:has-text("Project settings")').count(), 0);
  await vic.context().close();
});

test('forgot password: the emailed link sets a new password and signs in', async () => {
  const page = await newPage(browser, errors);
  await page.goto(`${base}/login`);
  await page.click('text=Forgot your password?');
  await page.fill('#email', 'ada@example.com');
  await page.click('button:has-text("Send reset link")');
  await page.waitForSelector('text=a reset link is on its way');
  const mail = env.mailer.outbox.find((m) => m.to === 'ada@example.com' && /Reset your password/.test(m.subject));
  assert.ok(mail, 'a reset email was sent');
  const link = mail.text.match(/https?:\/\/\S+\/reset\/[\w-]+/)[0].replace(/^https?:\/\/[^/]+/, base);
  await page.goto(link);
  await page.fill('#pw1', 'a brand new password');
  await page.fill('#pw2', 'a brand new password');
  await page.click('button:has-text("Set password and sign in")');
  await page.waitForSelector('text=Good ');
  await page.goto(link);
  await page.waitForSelector('text=Link unavailable');
  await page.context().close();
  await owner.context().clearCookies();
  await login(owner, base, 'ada@example.com', 'a brand new password');
});

test('daily view brings unfinished tasks to the chosen day', async () => {
  await owner.goto(`${base}/w/zenith-optima/p/CLO/daily`);
  await owner.waitForSelector('text=Completed');
  await owner.click('button:has-text("unfinished here")');
  await owner.click('[role="dialog"] button:has-text("Move here")');
  await owner.waitForSelector('text=Moved');
  await owner.waitForTimeout(500);
  assert.equal(await owner.locator('button:has-text("unfinished here")').count(), 0);
});

const ymd = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const wrProject = async (api) => {
  const wid = (await api('GET', '/auth/me')).json.workspaces[0].id;
  const project = (await api('GET', `/workspaces/${wid}/projects`)).json.projects.find((p) => p.key === 'WR');
  const tasks = (await api('GET', `/projects/${project.id}/tasks`)).json.tasks;
  return { wid, project, byNumber: (n) => tasks.find((t) => t.number === n), tasks };
};

test('sprints: plan in the backlog, start, see the burndown, complete with carry-over', async () => {
  const api = clientApi(owner);
  await owner.goto(`${base}/w/zenith-optima/p/WR/backlog`);
  await owner.waitForSelector('button:has-text("New sprint")');
  await owner.click('button:has-text("New sprint")');
  await owner.fill('#sp-name', 'Sprint 1');
  await owner.click('button:has-text("Create sprint")');
  await owner.waitForSelector('section[aria-label="Sprint 1"]');
  for (const key of ['WR-1', 'WR-3']) {
    await owner.click(`button[aria-label="Sprint for ${key}"]`);
    await owner.click('[role="menu"] >> text=Sprint 1');
  }
  await owner.waitForSelector('section[aria-label="Sprint 1"] [role="listitem"]:has-text("WR-3")');
  await owner.locator('section[aria-label="Backlog"] [role="listitem"]:has-text("WR-2")').dragTo(owner.locator('section[aria-label="Sprint 1"]'));
  await owner.waitForSelector('section[aria-label="Sprint 1"] [role="listitem"]:has-text("WR-2")');
  await owner.fill('input[aria-label="Story points for WR-1"]', '5');
  await owner.press('input[aria-label="Story points for WR-1"]', 'Enter');
  await owner.waitForTimeout(500);
  await owner.click('button:has-text("Start sprint")');
  await owner.waitForSelector('svg[aria-label^="Burndown"]');
  assert.match(await owner.locator('svg[aria-label^="Burndown"]').getAttribute('aria-label'), /5 of 5 points remaining/);
  assert.equal(await owner.locator('button:has-text("Start sprint")').count(), 0);

  const { project, byNumber } = await wrProject(api);
  await api('PATCH', `/tasks/${byNumber(1).id}`, { statusId: (await api('GET', `/projects/${project.id}`)).json.statuses.find((x) => x.category === 'done').id });
  await owner.reload();
  await owner.waitForSelector('svg[aria-label^="Burndown"]');
  assert.match(await owner.locator('svg[aria-label^="Burndown"]').getAttribute('aria-label'), /0 of 5 points remaining/);

  await owner.click('button:has-text("Complete sprint")');
  await owner.waitForSelector('[role="dialog"] >> text=2 tasks are not finished');
  await owner.click('[role="dialog"] button:has-text("Complete sprint")');
  await owner.waitForSelector('text=Completed Sprint 1');
  await owner.waitForSelector('text=Completed sprints');
  const after = await wrProject(api);
  assert.equal(after.byNumber(2).sprintId, null, 'unfinished work went back to the backlog');
  assert.notEqual(after.byNumber(1).sprintId, null, 'finished work stays with the sprint');
});

test('timeline: dependency arrows, drag to reschedule, keyboard moves', async () => {
  const api = clientApi(owner);
  const { project, byNumber } = await wrProject(api);
  await api('PATCH', `/tasks/${byNumber(1).id}`, { startDate: ymd(0), dueDate: ymd(4) });
  await api('PATCH', `/tasks/${byNumber(2).id}`, { startDate: ymd(2), dueDate: ymd(6) });
  await api('PATCH', `/tasks/${byNumber(3).id}`, { dueDate: ymd(8) });
  await api('POST', `/tasks/${byNumber(1).id}/relations`, { toTaskId: byNumber(2).id, type: 'blocks' });
  await owner.goto(`${base}/w/zenith-optima/p/WR/timeline`);
  await owner.waitForSelector('[role="button"][aria-label^="WR-3 "]');
  assert.ok((await owner.locator('svg path[marker-end]').count()) >= 1, 'a blocking dependency is drawn as an arrow');

  const bar = owner.locator('[role="button"][aria-label^="WR-3 "]');
  const box = await bar.boundingBox();
  await owner.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await owner.mouse.down();
  await owner.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2, { steps: 4 });
  await owner.mouse.move(box.x + box.width / 2 + 48, box.y + box.height / 2, { steps: 4 });
  await owner.mouse.up();
  await owner.waitForTimeout(800);
  assert.equal((await api('GET', `/tasks/${byNumber(3).id}`)).json.task.dueDate, ymd(11), 'dragging 3 days right moves the due date 3 days');

  await bar.focus();
  await owner.keyboard.press('Alt+ArrowRight');
  await owner.waitForTimeout(800);
  assert.equal((await api('GET', `/tasks/${byNumber(3).id}`)).json.task.dueDate, ymd(12), 'Alt+Arrow moves a day');
  await owner.keyboard.press('Alt+Shift+ArrowLeft');
  await owner.waitForTimeout(800);
  assert.equal((await api('GET', `/tasks/${byNumber(3).id}`)).json.task.dueDate, ymd(11), 'Alt+Shift+Arrow changes the end');
  void project;
});

test('custom fields: define in project settings, then fill them in on a task', async () => {
  await owner.goto(`${base}/w/zenith-optima/p/WR/settings`);
  await owner.waitForSelector('input[aria-label="New field name"]');
  await owner.fill('input[aria-label="New field name"]', 'Customer');
  await owner.click('button:has-text("Add field")');
  await owner.waitForSelector('input[aria-label="Name of field Customer"]');
  await owner.fill('input[aria-label="New field name"]', 'Region');
  await owner.click('button[aria-label="New field type"]');
  await owner.click('[role="menu"] >> text=Choice list');
  await owner.fill('input[aria-label="New field choices"]', 'EMEA, APAC');
  await owner.click('button:has-text("Add field")');
  await owner.waitForSelector('input[aria-label="Name of field Region"]');

  await owner.goto(`${base}/w/zenith-optima/p/WR/list?task=1`);
  await owner.waitForSelector('input[aria-label="Customer"]');
  await owner.fill('input[aria-label="Customer"]', 'Acme');
  await owner.press('input[aria-label="Customer"]', 'Enter');
  await owner.waitForTimeout(500);
  await owner.click('button[aria-label="Region"]');
  await owner.click('[role="menu"] >> text=APAC');
  await owner.waitForSelector('text=set Region to APAC');
  await owner.reload();
  await owner.waitForSelector('input[aria-label="Customer"]');
  assert.equal(await owner.inputValue('input[aria-label="Customer"]'), 'Acme', 'the value is saved');
  assert.match(await owner.locator('button[aria-label="Region"]').innerText(), /APAC/);
});

test('recurring tasks: finishing one creates the next', async () => {
  const api = clientApi(owner);
  await owner.goto(`${base}/w/zenith-optima/p/WR/list?task=2`);
  await owner.waitForSelector('button[aria-label="Repeat"]');
  await owner.click('button[aria-label="Repeat"]');
  await owner.click('[role="menu"] >> text=Every day');
  await owner.waitForSelector('text=set this to repeat: every day');
  await owner.click('button:has-text("Mark as done")');
  await owner.waitForSelector('text=created the next occurrence');
  const { tasks, byNumber } = await wrProject(api);
  const copies = tasks.filter((t) => t.title === byNumber(2).title);
  assert.equal(copies.length, 2);
  assert.equal(copies.find((t) => t.id !== byNumber(2).id).dueDate, ymd(7), 'the copy is due the day after the original (which was due in 6 days)');
});

test('the phone layout never scrolls sideways', async () => {
  const phone = await newPage(browser, errors, { viewport: { width: 390, height: 844 } });
  await login(phone, base, 'ada@example.com', 'a brand new password');
  for (const route of ['', '/p/CLO/list', '/p/CLO/board', '/p/CLO/calendar', '/inbox', '/my-tasks']) {
    await phone.goto(`${base}/w/zenith-optima${route}`);
    await phone.waitForTimeout(500);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const culprits = overflow > 1 ? await phone.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ').slice(0, 5).join('.')}`)) : [];
    assert.ok(overflow <= 1, `${route || 'home'} overflows by ${overflow}px: ${culprits.join(' | ')}`);
  }
  await phone.context().close();
});

test('accessibility: no serious or critical WCAG A/AA violations on the main screens', async () => {
  const screens = [
    ['home', '/w/zenith-optima'], ['list', '/w/zenith-optima/p/CLO/list'], ['board', '/w/zenith-optima/p/CLO/board'],
    ['calendar', '/w/zenith-optima/p/CLO/calendar'], ['daily', '/w/zenith-optima/p/CLO/daily'], ['task panel', '/w/zenith-optima/p/CLO/list?task=3'],
    ['my tasks', '/w/zenith-optima/my-tasks'], ['inbox', '/w/zenith-optima/inbox'], ['members', '/w/zenith-optima/settings?tab=members'],
    ['project settings', '/w/zenith-optima/p/CLO/settings'], ['account', '/account'],
    ['backlog', '/w/zenith-optima/p/WR/backlog'], ['timeline', '/w/zenith-optima/p/WR/timeline'],
  ];
  const failures = [];
  const scan = async (page, name) => {
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    for (const v of results.violations.filter((x) => ['serious', 'critical'].includes(x.impact))) {
      failures.push(`${name}: ${v.id} (${v.impact}) ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }
  };
  for (const theme of ['light', 'dark']) {
    const page = await newPage(browser, errors, { colorScheme: theme });
    await page.goto(`${base}/login`);
    await page.waitForSelector('#email');
    await scan(page, `login (${theme})`);
    await login(page, base, 'ada@example.com', 'a brand new password');
    for (const [name, url] of screens) {
      await page.goto(`${base}${url}`);
      await page.waitForSelector(url.includes('task=') ? 'aside[aria-label="Details"]' : 'main, #root');
      await scan(page, `${name} (${theme})`);
    }
    await page.context().close();
  }
  assert.deepEqual(failures, [], `accessibility violations:\n${failures.join('\n')}`);
});
