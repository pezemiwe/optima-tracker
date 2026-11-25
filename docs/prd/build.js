'use strict';
/*
 * Builds docs/Cortex-Tracker-BRD-PRD.pdf from content.js.
 *   node docs/prd/build.js
 * Needs Playwright's Chromium (set E2E_CHROMIUM=/path/to/chrome to use a specific browser) and pdftotext (poppler) for the contents page numbers.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const C = require('./content');
const C_SPEC = require('./spec');

const OUT_DIR = path.join(__dirname, '..');
const HTML = path.join(__dirname, 'document.html');
const PDF = path.join(OUT_DIR, 'Cortex-Tracker-BRD-PRD.pdf');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

const STATUS = { D: ['Built', 'st-d'], P: ['Partial', 'st-p'], N: ['Planned', 'st-n'], X: ['Out of scope', 'st-x'] };
const PRIORITY = { M: 'Must', S: 'Should', C: 'Could', W: "Won't" };

/* ---------- derived numbers ---------- */
const allReqs = C.modules.flatMap((m) => m.rows.map((r) => ({ module: m, id: `FR-${m.code}-${r[0]}`, text: r[1], pri: r[2], status: r[3], })));
const total = allReqs.length;
const count = (s) => allReqs.filter((r) => r.status === s).length;
const delivered = count('D'); const partial = count('P'); const planned = count('N');
const pct = (n) => Math.round((n / total) * 100);

/* ---------- heading registry for the contents page ---------- */
const toc = [];
let h1n = 0; let h2n = 0;
const h1 = (title, { appendix = false, letter = '' } = {}) => {
  if (appendix) { const label = `Appendix ${letter}`; toc.push({ level: 1, text: `${label}. ${title}` }); return `<h1 class="appendix"><span class="num">${label}</span>${esc(title)}</h1>`; }
  h1n += 1; h2n = 0; toc.push({ level: 1, text: `${h1n}. ${title}` });
  return `<h1><span class="num">${h1n}</span>${esc(title)}</h1>`;
};
const h2 = (title, sub = '') => { h2n += 1; toc.push({ level: 2, text: `${h1n}.${h2n} ${title}` }); return `<h2><span class="num">${h1n}.${h2n}</span>${esc(title)}</h2>${sub ? `<p class="sub">${inline(sub)}</p>` : ''}`; };

/* ---------- small components ---------- */
const chip = (text, cls) => `<span class="chip ${cls}">${esc(text)}</span>`;
const table = (head, rows, cls = '', widths = []) => `<table class="${cls}"><colgroup>${widths.map((w) => `<col style="width:${w}">`).join('')}</colgroup><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const list = (items) => `<ul>${items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
const dot = (v) => `<span class="dot ${v.toLowerCase()}" title="${{ F: 'Full', P: 'Partial', N: 'Not available' }[v]}"></span>`;
const logo = (size = 44, bg = '#86BC25', fg = '#0f1b3d') => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="${bg}"/><path d="M45 21a17 17 0 1 0 0 22" fill="none" stroke="${fg}" stroke-width="5.5" stroke-linecap="round"/><circle cx="43" cy="32" r="4.5" fill="${fg}"/></svg>`;
const bar = (label, value, color, valueText) => `<div class="bar-row"><span class="bar-label">${esc(label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round(value * 100)}%;background:${color}"></span></span><span class="bar-val">${esc(valueText ?? `${Math.round(value * 100)}%`)}</span></div>`;

/* ---------- diagrams ---------- */
const box = (x, y, w, h, title, lines = [], { planned = false, fill = '#fff', stroke = '#000000' } = {}) => {
  const dash = planned ? 'stroke-dasharray="5 4"' : '';
  const body = lines.map((l, i) => `<text x="${x + 12}" y="${y + 40 + i * 15}" class="d-small">${esc(l)}</text>`).join('');
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${planned ? '#f4f6fb' : fill}" stroke="${planned ? '#8a94ad' : stroke}" stroke-width="1.5" ${dash}/><text x="${x + 12}" y="${y + 22}" class="d-title${planned ? ' planned' : ''}">${esc(title)}</text>${body}</g>`;
};
const arrow = (x1, y1, x2, y2, label = '') => `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#86BC25" stroke-width="2" marker-end="url(#ah)"/>${label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 7}" class="d-small" text-anchor="middle">${esc(label)}</text>` : ''}</g>`;

const architectureSvg = `<svg viewBox="0 0 740 360" class="diagram" role="img" aria-label="Architecture: browser, server and database, with planned components shown dashed">
<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#86BC25"/></marker></defs>
${box(5, 20, 170, 150, 'Browser', ['React single-page app', 'List, board, backlog,', 'timeline, calendar, daily', 'Task panel, palette', 'Polls for changes (5 s)'])}
${box(270, 20, 200, 150, 'Cortex Tracker server', ['Node.js 22 + Express', 'Auth · Workspaces · Projects', 'Tasks · Collaboration · Files', 'Sprints · Custom fields', 'Email worker · Static assets'])}
${box(565, 20, 170, 150, 'PostgreSQL 16', ['Users, workspaces, members', 'Projects, tasks, sprints', 'Comments, activity, files', 'Notifications, saved views', 'Versioned migrations'])}
${arrow(175, 62, 270, 62, 'HTTPS + JSON')}
${arrow(270, 118, 175, 118, 'JSON')}
${arrow(470, 62, 565, 62, 'SQL')}
${arrow(565, 118, 470, 118, 'rows')}
${box(5, 205, 170, 70, 'SMTP provider', ['Invites, resets, digests'])}
${box(190, 205, 170, 70, 'WebSocket gateway', ['Instant updates'], { planned: true })}
${box(375, 205, 170, 70, 'Job queue and workers', ['Automations, webhooks'], { planned: true })}
${box(560, 205, 175, 70, 'Object storage', ['Large files, virus scanning'], { planned: true })}
${box(5, 290, 235, 60, 'Public API and webhooks', ['Tokens, scopes'], { planned: true })}
${box(252, 290, 235, 60, 'Identity providers', ['Single sign-on (SAML, OpenID Connect)'], { planned: true })}
${box(499, 290, 236, 60, 'Integrations', ['Chat, code and calendar tools'], { planned: true })}
</svg>`;

const dataModelSvg = (() => {
  const b = (x, y, w, t, sub = '') => `<g><rect x="${x}" y="${y}" width="${w}" height="38" rx="8" fill="#fff" stroke="#000000" stroke-width="1.4"/><text x="${x + w / 2}" y="${y + 16}" text-anchor="middle" class="d-title">${esc(t)}</text>${sub ? `<text x="${x + w / 2}" y="${y + 30}" text-anchor="middle" class="d-small">${esc(sub)}</text>` : ''}</g>`;
  const l = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8a94ad" stroke-width="1.4"/>`;
  const kids = [['Comment · Activity', 'discussion, history'], ['Attachment · Link', 'files, references'], ['Relation', 'blocks, relates, duplicates'], ['Label · Field value', 'tags, custom data'], ['Watcher · Notification', 'alerts']];
  const xs = [5, 153, 301, 449, 597];
  return `<svg viewBox="0 0 740 330" class="diagram" role="img" aria-label="Data model: a workspace contains projects, which contain tasks and their related records">
${l(370, 58, 370, 75)}${l(120, 75, 620, 75)}${l(120, 75, 120, 92)}${l(370, 75, 370, 92)}${l(620, 75, 620, 92)}
${b(295, 20, 150, 'Workspace', 'isolation boundary')}
${b(45, 92, 150, 'Member', 'one role per user')}${b(295, 92, 150, 'Project', 'key, archive state')}${b(545, 92, 150, 'Invite', 'single use, 14 days')}
${l(120, 130, 120, 168)}${b(45, 168, 150, 'User', 'sessions, resets')}
${l(370, 130, 370, 168)}${b(295, 168, 150, 'Task', 'KEY-n, subtasks, sprint')}
${l(370, 150, 627, 150)}${l(627, 150, 627, 168)}${b(525, 168, 205, 'Status · Label · Field · Sprint', 'configured per project')}
${l(370, 206, 370, 225)}${l(74, 225, 666, 225)}
${kids.map((k, i) => `${l(xs[i] + 69, 225, xs[i] + 69, 244)}${b(xs[i], 244, 138, k[0], k[1])}`).join('')}
<text x="370" y="310" text-anchor="middle" class="d-small">Saved views belong to a project and a user. Every record belongs to exactly one workspace.</text>
</svg>`;
})();


/* ---------- extracted facts: data dictionary and API, read from the code so they cannot drift ---------- */
const ROOT = path.join(__dirname, '..', '..');
const dataDictionary = (() => {
  const dir = path.join(ROOT, 'server', 'migrations'); const tables = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)) {
      const cols = [];
      for (const line of m[2].split('\n')) {
        const t = line.trim().replace(/,$/, ''); if (!t || /^(PRIMARY KEY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)/i.test(t) || t.startsWith('--')) continue;
        const mm = /^(\w+)\s+((?:double precision|timestamptz|[a-z]+)(?:\(\d+\))?)(.*)$/i.exec(t); if (mm) cols.push([mm[1], mm[2], mm[3].trim()]);
      }
      tables.set(m[1], cols);
    }
    for (const m of sql.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+) ((?:double precision|timestamptz|[a-z]+))(.*);/gi)) tables.get(m[1])?.push([m[2], m[3], m[4].trim()]);
  }
  return tables;
})();
const shortRule = (r) => r.replace(/DEFAULT gen_random_uuid\(\)/, '').replace(/REFERENCES (\w+)\(\w+\)( ON DELETE (CASCADE|SET NULL))?/, (a, t, x, d) => `→ ${t}${d ? ` (${d.toLowerCase()})` : ''}`).replace(/DEFAULT now\(\)/, 'default now').replace(/\s+/g, ' ').trim();
const ddHtml = [...dataDictionary].map(([name, cols]) => `<div class="dd"><h4><code>${esc(name)}</code></h4><table class="dd-t"><tbody>${cols.map((c) => `<tr><td><b>${esc(c[0])}</b></td><td>${esc(c[1])}</td><td>${esc(shortRule(c[2]))}</td></tr>`).join('')}</tbody></table></div>`).join('');

const apiRoutes = (() => {
  const dir = path.join(ROOT, 'server', 'routes'); const out = [];
  const rank = { viewer: 'Viewer', member: 'Member', admin: 'Admin', owner: 'Owner' };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const m = /router\.(get|post|put|patch|delete)\('([^']+)'/.exec(l); if (!m) return;
      const block = lines.slice(i, i + 12).join('\n'); const r = /'(viewer|member|admin|owner)'/.exec(block);
      const open = /^\/(auth\/(status|register|login|forgot|reset)|invites\/:token(?!\/accept))/.test(m[2]) || m[2] === '/auth/reset/:token';
      out.push([f.replace('.js', ''), m[1].toUpperCase(), `/api${m[2]}`, open ? 'None' : (r ? `${rank[r[1]]}+` : 'Signed in')]);
    });
  }
  return out;
})();
const apiGroups = { auth: 'Accounts and invitations', workspaces: 'Workspaces, members and invitations', projects: 'Projects, statuses and labels', tasks: 'Tasks', agile: 'Sprints and custom fields', collab: 'Comments, notifications, activity and saved views', files: 'Attachments and relations' };

/* ---------- section helpers ---------- */
const sections = [];
const priLabel = (p) => PRIORITY[p];
const detailHtml = (code) => {
  const d = C_SPEC.detailSpecs.find((x) => x.code === code); if (!d) return '';
  return `<div class="detail"><h3>Detailed specification: ${esc(d.title)}</h3><p>${esc(d.intro)}</p>${d.tables.map((t) => `<p class="meta"><b>${esc(t.title)}</b></p>${table(t.head, t.rows.map((r) => r.map((c) => esc(c))), 'compact', t.widths)}`).join('')}${d.lists.map((l) => `<p class="meta"><b>${esc(l.title)}</b></p>${list(l.items)}`).join('')}</div>`;
};

/* 1 */
sections.push(`<section>${h1('Executive summary')}
<p class="lead">Cortex Tracker is a work-management platform: tasks, boards, sprints, timelines, collaboration, automation and reporting in one fast product that a small team can deploy in minutes and own completely. A development team can build the whole product from this document, to the level of professional work-management products.</p>
<div class="cards">
  <div class="card"><b>${C.modules.length}</b><span>capability modules</span></div>
  <div class="card"><b>${total}</b><span>numbered requirements</span></div>
  <div class="card ok"><b>${delivered}</b><span>already built (${pct(delivered)}%)</span></div>
  <div class="card"><b>${planned + partial}</b><span>still to build</span></div>
</div>
<h3>What exists and what remains</h3>
${list([
  `**The foundation is built and verified.** Accounts and roles, workspaces and invitations, projects, tasks with subtasks, dependencies and recurrence, custom fields, six views (list, board, backlog and sprints, timeline, calendar, daily), filters and saved views, comments, mentions, notifications by app and email, file attachments, sprints with burndown, Excel export and a home dashboard.`,
  `**Quality evidence exists.** 77 automated API and logic tests and 17 browser scenarios run on every change; every main screen passes an accessibility scan in light and dark themes; a 10,000-task project is usable in about 0.3 seconds.`,
  `**What remains** is concentrated in automation, a public API and integrations, import, reporting and time tracking, security controls for large organisations, richer task structure (types, multiple assignees, templates, trash) and assisted features. Each is fully specified in section 6.`,
  `**The application is named Cortex Tracker** in the interface, emails, page titles and package.`,
])}
<h3>How a developer should use this document</h3>
${list([
  '**Section 3** states the standard of capability the finished product must reach and what is built today.',
  '**Section 6** lists every requirement with an identifier, priority, status and acceptance criterion, and gives a detailed specification (triggers, scopes, rules, formulas, limits) for each module not yet built.',
  '**Section 7** gives the business rules, state machines and notification rules that every module must obey.',
  '**Section 9** holds the data dictionary and API reference taken from the running code, and the tables to add.',
  '**Sections 10 and 11** give screens, interface standards, and the acceptance scenarios that prove the product works.',
  'Work in the priority order of each module (Must, then Should, then Could) and follow the dependency map in section 5.2.',
])}
</section>`);
/* 2 */
sections.push(`<section>${h1('Business context')}
${h2('Problem statement')}
${list([
  'Teams track work across spreadsheets, chat threads, email and several tools, so nobody can see in one place what is late, blocked or next.',
  'Professional work-management products solve this but bring cost, complexity or restrictive plans.',
  'Programme teams, such as a close-out programme, need daily checklists, ownership and escalation, and outgrow a simple tracker.',
  'Organisations that must own their data or run in their own environment have few modern, low-effort options.',
])}
${h2('Vision and positioning')}
<blockquote>${esc(C.positioning)}</blockquote>
${table(['Differentiator', 'What it means', 'Evidence'], C.differentiators.map((d) => [`<b>${esc(d[0])}</b>`, esc(d[1]), esc(d[2])]), 'compact', ['22%', '56%', '22%'])}
${h2('Business requirements', 'Business requirements (BR) state why the product exists. Functional requirements in section 6 trace back to them (Appendix B).')}
${table(['ID', 'Requirement', 'Rationale', 'Measure of success'], C.businessRequirements.map((b) => [`<code>${b[0]}</code>`, `<b>${esc(b[1])}</b>`, esc(b[2]), esc(b[3])]), 'compact', ['8%', '22%', '40%', '30%'])}
${h2('Success metrics', 'Targets are proposals for the product owner to confirm. Baselines are marked "not yet measured" where no users have used the product at scale.')}
${table(['Metric', 'Definition', 'Baseline today', 'Target'], C.kpis.map((k) => [`<b>${esc(k[0])}</b>`, esc(k[1]), esc(k[2]), `<b>${esc(k[3])}</b>`]), 'compact', ['17%', '39%', '24%', '20%'])}
</section>`);
/* 3 */
const stateChip = (s) => ({ F: chip('Built', 'st-d'), P: chip('Partly built', 'st-p'), N: chip('To build', 'st-n') }[s]);
sections.push(`<section>${h1('Capability standard')}
<p>This is the standard the finished product must meet, by area. "Built" means present and verified today; "To build" means fully specified in section 6 but not yet in the product. A capability is complete only when every requirement behind it in section 6 passes its acceptance criterion.</p>
${C_SPEC.capabilities.map(([cat, rows]) => `${h2(cat)}${table(['Capability', 'What "complete" means', 'Today'], rows.map((r) => [`<b>${esc(r[0])}</b>`, esc(r[1]), stateChip(r[2])]), 'compact', ['27%', '58%', '15%'])}`).join('')}
</section>`);
/* 4 */
const permHtml = C.permissionRows.map((r) => `<tr><td>${esc(r[0])}</td>${r.slice(1).map((v) => `<td class="c">${v ? '<span class="yes">✓</span>' : '<span class="no">–</span>'}</td>`).join('')}</tr>`).join('');
sections.push(`<section>${h1('Users, roles and permissions')}
${h2('Personas')}
${table(['Persona', 'Goal', 'Pain today', 'What they use'], C.personas.map((p) => [`<b>${esc(p[0])}</b>`, esc(p[1]), esc(p[2]), esc(p[3])]), 'compact', ['19%', '24%', '27%', '30%'])}
${h2('Role model and permission matrix', 'Roles apply per workspace and are enforced on every request. A workspace always has at least one Owner.')}
<table class="perm"><colgroup><col style="width:58%"><col style="width:10.5%"><col style="width:10.5%"><col style="width:10.5%"><col style="width:10.5%"></colgroup><thead><tr><th>Capability</th><th class="c">Viewer</th><th class="c">Member</th><th class="c">Admin</th><th class="c">Owner</th></tr></thead><tbody>${permHtml}</tbody></table>
<p class="note">Planned: guests, private projects, per-project roles and custom roles (FR-WSP-08, 09, 10). When added, a person’s effective permission on a project is the higher of their workspace role and their project role, except for private projects, where only project members have access.</p>
</section>`);
/* 5 */
const deps = [['AUT', 'none', 'Identity comes first'], ['WSP', 'AUT', 'Membership needs accounts'], ['PRJ', 'WSP', 'Projects live in workspaces'], ['TSK', 'PRJ', 'Tasks live in projects'], ['REL', 'TSK', 'Subtasks, relations, recurrence act on tasks'], ['FLD', 'PRJ, TSK', 'Fields belong to projects and hold task values'], ['VWS', 'TSK, FLD', 'Views render tasks and fields'], ['SPR', 'PRJ, TSK', 'Sprints group tasks'], ['SRC', 'TSK, FLD', 'Filters and queries cover fields'], ['COL', 'TSK', 'Comments and activity attach to tasks'], ['NTF', 'COL, TSK', 'Notifications come from task events'], ['FIL', 'TSK', 'Files attach to tasks'], ['TIM', 'TSK', 'Time is logged on tasks'], ['IMP', 'PRJ, TSK, FLD', 'Import creates tasks and values'], ['INT', 'all domain events', 'API and webhooks expose every event'], ['AUTO', 'TSK, FLD, NTF, INT', 'Rules react to events and call actions'], ['RPT', 'TSK, SPR, TIM', 'Reports aggregate tasks, sprints and time'], ['DOC', 'WSP, SRC', 'Pages need workspaces and search'], ['ADM', 'AUT, WSP', 'Policies govern sign-in and membership'], ['AI', 'SRC, COL', 'Assistance reads what search and comments hold'], ['BRN', 'none', 'Naming is independent']];
sections.push(`<section>${h1('Product scope and build order')}
${h2('Scope')}
<div class="two"><div><h3>In scope</h3>${list(C.inScope)}</div><div><h3>Out of scope</h3>${list(C.outScope)}</div></div>
${h2('Module dependency map', 'A module can be built once the modules it depends on exist. Within a module, build Must requirements first, then Should, then Could.')}
${table(['Module', 'Build after', 'Why'], deps.map((d) => [`<code>${d[0]}</code> ${esc(C.modules.find((m) => m.code === d[0])?.name || '')}`, esc(d[1]), esc(d[2])]), 'compact', ['38%', '24%', '38%'])}
<p class="note">Priorities: <b>Must</b> is required for the product to be useful; <b>Should</b> is important but not blocking; <b>Could</b> is valuable if capacity allows; <b>Won't</b> is excluded from this horizon.</p>
</section>`);
/* 6 */
const moduleSections = () => C.modules.map((m) => {
  const mTotal = m.rows.length; const mDel = m.rows.filter((r) => r[3] === 'D').length;
  const rows = m.rows.map((r) => { const [label, cls] = STATUS[r[3]]; return [`<code>FR-${m.code}-${r[0]}</code>`, inline(r[1]), PRIORITY[r[2]], chip(label, cls), esc(r[4])]; });
  return `<div class="module">${h2(m.name, m.goal)}<p class="meta">Prefix <code>FR-${m.code}</code> · ${mDel} of ${mTotal} built</p>${table(['ID', 'Requirement', 'Priority', 'Status', 'Acceptance criteria'], rows, 'req', ['12%', '42%', '8%', '10%', '28%'])}${detailHtml(m.code)}</div>`;
}).join('');
sections.push(`<section>${h1('Functional requirements')}
<p>Each requirement has an identifier, a priority (Must, Should, Could, Won't), a status (Built, Partial, Planned) and an acceptance criterion a tester can verify. "Built" means present and verified in the current product. Modules not yet built carry a detailed specification after their table; mobile requirements follow the last module.</p>
${moduleSections()}
<div class="module">${h2('Mobile experience', 'Daily work must be possible from a phone. Requirements are in addition to the responsive behaviour already built.')}${detailHtml('MOB').replace(/<h3>Detailed specification: [^<]*<\/h3><p>[^<]*<\/p>/, '')}</div>
</section>`);
/* 7 */
sections.push(`<section>${h1('Business rules and behaviour')}
<p>These rules apply across modules. Where a module requirement and a rule seem to differ, the rule wins and the requirement must be corrected.</p>
${h2('Business rules and limits')}
${table(['ID', 'Rule', 'Enforced'], C_SPEC.businessRules.map((r) => [`<code>${r[0]}</code>`, esc(r[1]), esc(r[2])]), 'compact', ['9%', '78%', '13%'])}
${h2('State machines')}
${C_SPEC.stateMachines.map((s) => `<h3>${esc(s.name)}</h3><p class="small">${esc(s.note)}</p>${table(['From', 'Event', 'To', 'Rule'], s.rows.map((r) => r.map((c) => esc(c))), 'compact', ['16%', '24%', '22%', '38%'])}`).join('')}
${h2('Notification rules', 'No one is notified of their own action. In-app notifications are immediate; email is batched into one digest per person after two minutes and skipped when the person has switched email off.')}
${table(['Event', 'Recipients', 'In app', 'Email'], C_SPEC.notificationRules.map((r) => r.map((c) => esc(c))), 'compact', ['34%', '34%', '14%', '18%'])}
${h2('Interface conventions')}
${list(C.apiPrinciples)}
</section>`);
/* 8 */
sections.push(`<section>${h1('Non-functional requirements')}
<p>Targets are the commitments; the third column records what is actually evidenced today, so nothing is claimed that has not been measured.</p>
${table(['Area', 'Requirement', 'Evidence today', 'State'], C.nfrs.map((n) => [`<b>${esc(n[0])}</b>`, esc(n[1]), esc(n[2]), chip(n[3], /Verified$/.test(n[3]) && !/Partly/.test(n[3]) ? 'st-d' : /Partly/.test(n[3]) ? 'st-p' : 'st-n')]), 'compact', ['13%', '33%', '38%', '16%'])}
</section>`);
/* 9 */
const apiHtml = Object.entries(apiGroups).map(([k, label]) => { const rows = apiRoutes.filter((r) => r[0] === k); return rows.length ? `<h3>${esc(label)}</h3>${table(['Method', 'Path', 'Needs'], rows.map((r) => [`<code>${r[1]}</code>`, `<code>${esc(r[2])}</code>`, esc(r[3])]), 'compact api', ['12%', '66%', '22%'])}` : ''; }).join('');
sections.push(`<section>${h1('Architecture, data and API')}
${h2('System context', 'Solid boxes exist today; dashed boxes are planned.')}
${architectureSvg}
${h2('Technology')}
${table(['Layer', 'Choice'], C.stack.map((s) => [`<b>${esc(s[0])}</b>`, esc(s[1])]), 'compact', ['16%', '84%'])}
${h2('Data model', 'Main entities and how they relate.')}
${dataModelSvg}
<p class="small"><b>Entities:</b> ${C.entities.join(' · ')}.</p>
${h2('Data dictionary', `Generated from the database migrations, so it matches the product exactly: ${dataDictionary.size} tables. Types are PostgreSQL types; "→" marks a foreign key and its delete behaviour.`)}
<div class="dd-grid">${ddHtml}</div>
${h2('Tables to add', 'Needed by the modules not yet built. Names and columns are the starting design; keep migrations forward-only.')}
${table(['Table', 'Purpose', 'Key columns'], C_SPEC.plannedTables.map((r) => [`<code>${esc(r[0])}</code>`, esc(r[1]), esc(r[2])]), 'compact', ['24%', '24%', '52%'])}
${h2('API reference', `The ${apiRoutes.length} endpoints in the current product, read from the code. "Needs" is the lowest workspace role allowed; write endpoints also require a same-origin JSON request. Unknown or forbidden resources return 404.`)}
${apiHtml}
</section>`);
/* 10 */
sections.push(`<section>${h1('User experience')}
${h2('Principles')}
${table(['Principle', 'In practice'], C.uxPrinciples.map((p) => [`<b>${esc(p[0])}</b>`, esc(p[1])]), 'compact', ['22%', '78%'])}
${h2('Screen inventory', 'Every screen must design and test the listed states in addition to its normal state.')}
${table(['Screen', 'Route', 'Purpose and main elements', 'States to design'], C_SPEC.screens.map((r) => [`<b>${esc(r[0])}</b>`, `<code>${esc(r[1])}</code>`, esc(r[2]), esc(r[3])]), 'compact', ['15%', '20%', '40%', '25%'])}
${h2('Interface standards')}
${list(C_SPEC.uiStandards)}
${h2('Key user journeys')}
${table(['Journey', 'Steps', 'Success measure'], C.journeys.map((j) => [`<b>${esc(j[0])}</b>`, esc(j[1]), esc(j[2])]), 'compact', ['16%', '54%', '30%'])}
</section>`);
/* 11 */
sections.push(`<section>${h1('Quality and acceptance')}
${h2('Test strategy')}
${table(['Layer', 'What it covers', 'When'], C.qa.map((q) => [`<b>${esc(q[0])}</b>`, esc(q[1]), esc(q[2])]), 'compact', ['20%', '60%', '20%'])}
${h2('Acceptance scenarios', 'End-to-end scenarios that must pass. Scenarios marked "Planned" apply when their module is built.')}
${table(['ID', 'Scenario', 'Expected result'], C_SPEC.testScenarios.map((r) => [`<code>${r[0]}</code>`, esc(r[1]), esc(r[2])]), 'compact', ['8%', '56%', '36%'])}
${h2('Definition of done')}
${list(C.dod)}
</section>`);
/* 12 */
sections.push(`<section class="tight">${h1('Risks, assumptions and open questions')}
${h2('Risks')}
${table(['Risk', 'Impact', 'Mitigation'], C.risks.map((r) => [esc(r[0]), `<b>${esc(r[1])}</b>`, esc(r[2])]), 'compact', ['42%', '10%', '48%'])}
${h2('Assumptions')}
${list(C.assumptions)}
${h2('Dependencies')}
${list(C.dependencies)}
${h2('Open questions for the product owner')}
${list(C.openQuestions)}
</section>`);
/* appendices */
const modRows = C.modules.map((m) => {
  const n = m.rows.length; const d = m.rows.filter((r) => r[3] === 'D').length; const p = m.rows.filter((r) => r[3] === 'P').length;
  return `<div class="bar-row"><span class="bar-label wide">${esc(m.name)}</span><span class="bar-track"><span class="bar-fill" style="width:${(d / n) * 100}%;background:#86BC25"></span><span class="bar-fill" style="width:${(p / n) * 100}%;background:#f5b942"></span></span><span class="bar-val">${d}/${n}</span></div>`;
}).join('');
const trace = [
  ['BR-01', 'TSK, PRJ, VWS, RPT, TIM'], ['BR-02', 'TSK, REL, FLD, VWS, SPR, COL, NTF, AUTO, INT, RPT, DOC, TIM'], ['BR-03', 'VWS, SRC, TSK, section 8 (performance and usability)'],
  ['BR-04', 'AUT, WSP, ADM, section 8 (security)'], ['BR-05', 'Section 8 (maintainability), section 9 (single service and database)'], ['BR-06', 'Section 8 (accessibility), section 10 (interface standards)'],
  ['BR-07', 'IMP'], ['BR-08', 'INT, AUTO, NTF'], ['BR-09', 'IMP-02, VWS-06'],
];
sections.push(`<section>${h1('Requirement status summary', { appendix: true, letter: 'A' })}
<p>${total} requirements across ${C.modules.length} modules: <b>${delivered} built</b> (${pct(delivered)}%), <b>${partial} partial</b>, <b>${planned} planned</b> (${pct(planned)}%).</p>
<div class="bars">${modRows}</div>
<p class="legend"><span class="swatch" style="background:#86BC25"></span> Built &nbsp; <span class="swatch" style="background:#f5b942"></span> Partial &nbsp; <span class="swatch" style="background:#e4e8f1"></span> Planned</p>
${h1('Traceability from business requirements', { appendix: true, letter: 'B' })}
${table(['Business requirement', 'Covered by'], trace.map((t) => [`<code>${t[0]}</code>`, esc(t[1])]), 'compact', ['22%', '78%'])}
${h1('Keyboard shortcuts', { appendix: true, letter: 'C' })}
${table(['Keys', 'Action'], C.shortcuts.map((s) => [`<code>${esc(s[0])}</code>`, esc(s[1])]), 'compact', ['30%', '70%'])}
${h1('Glossary', { appendix: true, letter: 'D' })}
${table(['Term', 'Meaning'], C.glossary.map((g) => [`<b>${esc(g[0])}</b>`, esc(g[1])]), 'compact', ['22%', '78%'])}
</section>`);

/* ---------- front matter ---------- */
const frontMatter = `<section class="front">
<h1 class="plain">Document control</h1>
${table(['Item', 'Detail'], [
  ['Document', `${C.doc.title}`], ['Product', `${C.doc.product}`], ['Version', `${C.doc.version}`], ['Date', C.doc.date], ['Status', C.doc.status],
  ['Product owner', '<span class="blank"></span>'], ['Audience', 'Product owner, sponsors, engineering, design, QA, security and operations'],
], 'compact kv', ['26%', '74%'])}
<h3>Revision history</h3>
${table(['Version', 'Date', 'Author', 'Change'], [['1.0', '24 November 2026', 'Product', 'First draft'], [C.doc.version, C.doc.date, 'Product', 'Rewritten for developers: capability list, detailed specifications, business rules, data dictionary, API reference, screens and test scenarios.']], 'compact', ['12%', '20%', '18%', '50%'])}
<h3>Approvals</h3>
${table(['Role', 'Name', 'Signature', 'Date'], ['Product owner', 'Engineering lead', 'Security lead', 'Sponsor'].map((r) => [r, '<span class="blank"></span>', '<span class="blank"></span>', '<span class="blank"></span>']), 'compact sign', ['25%', '30%', '30%', '15%'])}
<h3>How to read this document</h3>
<div class="legend-grid">
  <div><b>Status</b><br>${chip('Built', 'st-d')} in the product now and tested<br>${chip('Partial', 'st-p')} present with a known limitation<br>${chip('Planned', 'st-n')} not built yet</div>
  <div><b>Priority</b><br><b>Must</b> the product is not useful without it<br><b>Should</b> important, not blocking<br><b>Could</b> valuable if capacity allows<br><b>Won't</b> excluded from this horizon</div>
  <div><b>Where to look</b><br>Capabilities: section 3<br>Requirements: section 6<br>Rules: section 7<br>Data and API: section 9</div>
</div>
<p class="note">Basis of this document: requirement statuses reflect the product's source code and automated tests as of ${esc(C.doc.date)}. Targets are proposals for the product owner to confirm.</p>
</section>`;

const tocPlaceholder = '__TOC__';
const renderToc = (pages) => `<section class="toc"><h1 class="plain">Contents</h1><div class="toc-cols">${toc.map((e) => `<div class="toc-row l${e.level}"><span class="t">${esc(e.text)}</span><span class="dots"></span><span class="p">${pages ? (pages.get(e.text) ?? '') : '00'}</span></div>`).join('')}</div></section>`;

const logoFile = ['svg', 'png'].map((e) => path.join(__dirname, '..', 'frd', 'assets', `deloitte-logo.${e}`)).find((f) => fs.existsSync(f));
const logoHtml = logoFile ? `<img alt="Deloitte" src="data:${logoFile.endsWith('svg') ? 'image/svg+xml' : 'image/png'};base64,${fs.readFileSync(logoFile).toString('base64')}">` : '<div class="logo-ph"><b>[ Deloitte logo ]</b>Official artwork to be placed here<br>(docs/frd/assets/deloitte-logo.svg)</div>';
const cover = `<section class="cover" style="break-before:auto"><div class="band"></div><div class="cover-in"><div class="logo-slot">${logoHtml}</div>
<div><p class="eyebrow">Business and Product Requirements Document</p><h1>Cortex Tracker<span class="dot2">.</span></h1><p class="cover-sub">What to build, how it must behave, and how to prove it works: a complete requirements document for a work-management product.</p></div>
<div><div class="cover-meta"><div><span>Version</span><b>${C.doc.version}</b></div><div><span>Date</span><b>${C.doc.date}</b></div><div><span>Status</span><b>${C.doc.status}</b></div><div><span>Classification</span><b>Restricted</b></div></div></div></div></section>`;

const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const buildHtml = (pages) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cortex Tracker: Business and Product Requirements Document</title><style>${css}</style></head><body>${cover}${frontMatter}${renderToc(pages)}${sections.join('\n')}</body></html>`;

/* ---------- render ---------- */
async function render(pages) {
  fs.writeFileSync(HTML, buildHtml(pages));
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`file://${HTML}`);
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: PDF, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
}

function pageTexts() {
  const info = execFileSync('pdfinfo', [PDF]).toString();
  const n = Number(/Pages:\s+(\d+)/.exec(info)[1]);
  const texts = [];
  for (let i = 1; i <= n; i++) texts.push(execFileSync('pdftotext', ['-f', String(i), '-l', String(i), '-layout', PDF, '-']).toString().replace(/\s+/g, ' '));
  return texts;
}

(async () => {
  await render(null);
  let texts = pageTexts();
  const tocPage = texts.findIndex((t) => t.trim().startsWith('Contents')) + 1;
  const pages = new Map();
  for (const e of toc) {
    // In the page the number and title are separate spans, so the dot after the number is not in the text.
    const needle = e.text.replace(/^(\d+)\.\s/, '$1 ').replace(/^(Appendix [A-D])\.\s/, '$1 ').replace(/\s+/g, ' ');
    const idx = texts.findIndex((t, i) => i + 1 > tocPage && t.toLowerCase().includes(needle.toLowerCase()));
    pages.set(e.text, idx >= 0 ? idx + 1 : '');
  }
  await render(pages); // same layout, now with real page numbers
  texts = pageTexts();
  const missing = [...pages].filter(([, p]) => p === '').map(([t]) => t);
  console.log(`Pages: ${texts.length}; requirements: ${total} (delivered ${delivered}, partial ${partial}, planned ${planned}); contents entries: ${toc.length}`);
  if (missing.length) console.log('Contents entries without a page:', missing.join(' | '));
  console.log(`Wrote ${PDF}`);
})().catch((e) => { console.error(e); process.exit(1); });
