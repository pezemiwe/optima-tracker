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

const OUT_DIR = path.join(__dirname, '..');
const HTML = path.join(__dirname, 'document.html');
const PDF = path.join(OUT_DIR, 'Cortex-Tracker-BRD-PRD.pdf');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

const STATUS = { D: ['Delivered', 'st-d'], P: ['Partial', 'st-p'], N: ['Planned', 'st-n'], X: ['Out of scope', 'st-x'] };
const PRIORITY = { M: 'Must', S: 'Should', C: 'Could', W: "Won't" };
const RELEASE_IDX = { R1: 1, 'R1.1': 1.1, R2: 2, R3: 3, R4: 4, R5: 5 };

/* ---------- derived numbers ---------- */
const allReqs = C.modules.flatMap((m) => m.rows.map((r) => ({ module: m, id: `FR-${m.code}-${r[0]}`, text: r[1], pri: r[2], status: r[3], release: r[4] })));
const total = allReqs.length;
const count = (s) => allReqs.filter((r) => r.status === s).length;
const delivered = count('D'); const partial = count('P'); const planned = count('N');
const pct = (n) => Math.round((n / total) * 100);

const parityRows = C.parity.flatMap(([, rows]) => rows);
const score = (col) => parityRows.reduce((n, r) => n + { F: 1, P: 0.5, N: 0 }[r[col]], 0) / parityRows.length;
const cortexAt = (k) => parityRows.reduce((n, r) => {
  const now = r[4];
  if (now === 'F') return n + 1;
  if (RELEASE_IDX[r[5]] <= k) return n + 1;
  return n + (now === 'P' ? 0.5 : 0);
}, 0) / parityRows.length;
const parityCounts = { F: parityRows.filter((r) => r[4] === 'F').length, P: parityRows.filter((r) => r[4] === 'P').length, N: parityRows.filter((r) => r[4] === 'N').length };

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
const logo = (size = 44, bg = '#14b8a6', fg = '#0f1b3d') => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="${bg}"/><path d="M45 21a17 17 0 1 0 0 22" fill="none" stroke="${fg}" stroke-width="5.5" stroke-linecap="round"/><circle cx="43" cy="32" r="4.5" fill="${fg}"/></svg>`;
const bar = (label, value, color, valueText) => `<div class="bar-row"><span class="bar-label">${esc(label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round(value * 100)}%;background:${color}"></span></span><span class="bar-val">${esc(valueText ?? `${Math.round(value * 100)}%`)}</span></div>`;

/* ---------- diagrams ---------- */
const box = (x, y, w, h, title, lines = [], { planned = false, fill = '#fff', stroke = '#1d2a5b' } = {}) => {
  const dash = planned ? 'stroke-dasharray="5 4"' : '';
  const body = lines.map((l, i) => `<text x="${x + 12}" y="${y + 40 + i * 15}" class="d-small">${esc(l)}</text>`).join('');
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${planned ? '#f4f6fb' : fill}" stroke="${planned ? '#8a94ad' : stroke}" stroke-width="1.5" ${dash}/><text x="${x + 12}" y="${y + 22}" class="d-title${planned ? ' planned' : ''}">${esc(title)}</text>${body}</g>`;
};
const arrow = (x1, y1, x2, y2, label = '') => `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#14b8a6" stroke-width="2" marker-end="url(#ah)"/>${label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 7}" class="d-small" text-anchor="middle">${esc(label)}</text>` : ''}</g>`;

const architectureSvg = `<svg viewBox="0 0 740 360" class="diagram" role="img" aria-label="Architecture: browser, server and database, with planned components shown dashed">
<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#14b8a6"/></marker></defs>
${box(5, 20, 170, 150, 'Browser', ['React single-page app', 'List, board, backlog,', 'timeline, calendar, daily', 'Task panel, palette', 'Polls for changes (5 s)'])}
${box(270, 20, 200, 150, 'Cortex Tracker server', ['Node.js 22 + Express', 'Auth · Workspaces · Projects', 'Tasks · Collaboration · Files', 'Sprints · Custom fields', 'Email worker · Static assets'])}
${box(565, 20, 170, 150, 'PostgreSQL 16', ['Users, workspaces, members', 'Projects, tasks, sprints', 'Comments, activity, files', 'Notifications, saved views', 'Versioned migrations'])}
${arrow(175, 62, 270, 62, 'HTTPS + JSON')}
${arrow(270, 118, 175, 118, 'JSON')}
${arrow(470, 62, 565, 62, 'SQL')}
${arrow(565, 118, 470, 118, 'rows')}
${box(5, 205, 170, 70, 'SMTP provider', ['Invites, resets, digests'])}
${box(190, 205, 170, 70, 'WebSocket gateway', ['Instant updates (R2)'], { planned: true })}
${box(375, 205, 170, 70, 'Job queue and workers', ['Automations, webhooks (R2)'], { planned: true })}
${box(560, 205, 175, 70, 'Object storage', ['Large files, scanning (R3)'], { planned: true })}
${box(5, 290, 235, 60, 'Public API and webhooks', ['Tokens, scopes (R2)'], { planned: true })}
${box(252, 290, 235, 60, 'Identity providers', ['SSO: SAML, OIDC (R3)'], { planned: true })}
${box(499, 290, 236, 60, 'Integrations', ['Slack, Teams, GitHub, calendar (R4)'], { planned: true })}
</svg>`;

const dataModelSvg = (() => {
  const b = (x, y, w, t, sub = '') => `<g><rect x="${x}" y="${y}" width="${w}" height="38" rx="8" fill="#fff" stroke="#1d2a5b" stroke-width="1.4"/><text x="${x + w / 2}" y="${y + 16}" text-anchor="middle" class="d-title">${esc(t)}</text>${sub ? `<text x="${x + w / 2}" y="${y + 30}" text-anchor="middle" class="d-small">${esc(sub)}</text>` : ''}</g>`;
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

const roadmapHtml = (() => {
  const cols = ['Delivered', 'Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027'];
  const rows = [
    ['R1 Foundation', 1, 1, 'done'], ['R1.1 Rename', 2, 1, 'next'], ['R2 Automate', 2, 1, 'plan'],
    ['R3 Secure', 3, 1, 'plan'], ['R4 Insight', 4, 1, 'plan'], ['R5 Intelligence', 5, 1, 'plan'],
  ];
  return `<div class="roadmap"><div class="rm-head">${cols.map((c) => `<span>${c}</span>`).join('')}</div>${rows.map(([label, col, span, kind]) => `<div class="rm-row"><span class="rm-bar ${kind}" style="grid-column:${col} / span ${span}">${esc(label)}</span></div>`).join('')}</div>`;
})();

/* ---------- sections ---------- */
const sections = [];

sections.push(`<section>${h1('Executive summary')}
<p class="lead">Cortex Tracker is a work-management platform for teams that need what Jira, ClickUp and Asana offer, without the weight. It brings tasks, boards, sprints, timelines, collaboration and reporting into one fast product that a small team can deploy in minutes and own completely.</p>
<div class="cards">
  <div class="card"><b>${C.modules.length}</b><span>capability modules</span></div>
  <div class="card"><b>${total}</b><span>product requirements</span></div>
  <div class="card ok"><b>${delivered}</b><span>delivered (${pct(delivered)}%)</span></div>
  <div class="card"><b>${planned + partial}</b><span>planned or partial</span></div>
</div>
<h3>Where the product stands</h3>
${list([
  `**Release 1 is built and verified.** Accounts and roles, workspaces and invitations, projects, tasks with subtasks, dependencies and recurrence, custom fields, six views (list, board, backlog and sprints, timeline, calendar, daily), filters and saved views, comments and mentions, notifications with email, file attachments, markdown, dashboards, Excel export and conflict detection.`,
  `**Quality evidence exists.** 77 automated API and logic tests and 17 browser scenarios run on every change; every main screen passes an accessibility scan in light and dark themes; a 10,000-task project is usable in about 0.3 seconds.`,
  `**Against the market leaders,** Cortex Tracker fully covers ${parityCounts.F} of ${parityRows.length} capability areas today and partly covers ${parityCounts.P} more. The gaps are concentrated in automation, integrations, reporting, enterprise security and AI.`,
  `**The working name in the code is still "Optima Work Tracker".** Renaming to Cortex Tracker is the first item in the plan (R1.1).`,
])}
<h3>What this document asks for</h3>
${list([
  'Agree the business objectives and success measures (section 2).',
  'Confirm positioning and the parity target against Jira, ClickUp and Asana (section 3).',
  'Approve the requirement set and priorities (section 6) and the release plan (section 5).',
  'Decide the open questions that change scope: commercial model, target audience, compliance regimes (section 11.4).',
])}
</section>`);

sections.push(`<section>${h1('Business context')}
${h2('Problem statement')}
${list([
  'Teams track work across spreadsheets, chat threads, email and several tools, so nobody has one trustworthy picture of what is late, blocked or next.',
  'The market leaders solve this but bring cost: Jira is heavy to configure, ClickUp can overwhelm, and Asana gates advanced features behind higher plans.',
  'Programme teams, such as the Zenith Optima close-out, need daily checklists, ownership and escalation, and have outgrown a simple tracker.',
  'Organisations that must own their data or run in their own environment have few modern, low-effort options.',
])}
${h2('Vision and positioning')}
<blockquote>${esc(C.positioning)}</blockquote>
${table(['Differentiator', 'What it means', 'Evidence'], C.differentiators.map((d) => [`<b>${esc(d[0])}</b>`, esc(d[1]), esc(d[2])]), 'compact', ['22%', '56%', '22%'])}
<p class="note">Differentiators marked as hypotheses must be validated with pilot teams before they are used in marketing.</p>
${h2('Business requirements', 'Business requirements (BR) state why the product exists. Functional requirements in section 6 trace back to them (Appendix B).')}
${table(['ID', 'Requirement', 'Rationale', 'Measure of success'], C.businessRequirements.map((b) => [`<code>${b[0]}</code>`, `<b>${esc(b[1])}</b>`, esc(b[2]), esc(b[3])]), 'compact', ['8%', '22%', '40%', '30%'])}
${h2('Success metrics', 'Targets are proposals for the product owner to confirm. Baselines are marked "not yet measured" where no users have used the product at scale.')}
${table(['Metric', 'Definition', 'Baseline today', 'Target'], C.kpis.map((k) => [`<b>${esc(k[0])}</b>`, esc(k[1]), esc(k[2]), `<b>${esc(k[3])}</b>`]), 'compact', ['17%', '39%', '24%', '20%'])}
</section>`);

const parityHtml = C.parity.map(([cat, rows]) => `<tr class="cat"><td colspan="6">${esc(cat)}</td></tr>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td class="c">${dot(r[1])}</td><td class="c">${dot(r[2])}</td><td class="c">${dot(r[3])}</td><td class="c now">${dot(r[4])}</td><td class="c">${r[4] === 'F' ? '<span class="muted">Done</span>' : chip(r[5], 'rel')}</td></tr>`).join('')}`).join('');

sections.push(`<section>${h1('Competitive analysis')}
<p class="note">Competitor information reflects publicly known capabilities at the time of writing and varies by plan. Re-verify before any external use.</p>
${h2('The incumbents')}
${table(['Product', 'Strengths', 'Typical friction', 'Implication for Cortex Tracker'], C.incumbents.map((i) => [`<b>${esc(i[0])}</b>`, esc(i[1]), esc(i[2]), esc(i[3])]), 'compact', ['11%', '30%', '28%', '31%'])}
${h2('Capability parity matrix', 'Full, partial or no capability. "Cortex Tracker" is the current build; "Target" is the release that closes the gap.')}
<table class="parity"><colgroup><col style="width:44%"><col style="width:10%"><col style="width:11%"><col style="width:10%"><col style="width:14%"><col style="width:11%"></colgroup>
<thead><tr><th>Capability</th><th class="c">Jira</th><th class="c">ClickUp</th><th class="c">Asana</th><th class="c now">Cortex Tracker</th><th class="c">Target</th></tr></thead><tbody>${parityHtml}</tbody></table>
<p class="legend"><span class="dot f"></span> Full &nbsp; <span class="dot p"></span> Partial &nbsp; <span class="dot n"></span> Not available</p>
${h2('Where Cortex Tracker competes, and where not yet')}
<p class="keep">Coverage score across the ${parityRows.length} capability areas (full = 1, partial = 0.5). Every area counts equally, so read it as a trend, not a verdict: the areas that matter most differ for each team.</p>
<div class="bars">
${bar('Jira', score(1), '#6b7a99')}${bar('ClickUp', score(2), '#6b7a99')}${bar('Asana', score(3), '#6b7a99')}
${bar('Cortex Tracker today (R1)', cortexAt(1), '#14b8a6')}${bar('after R2', cortexAt(2), '#14b8a6')}${bar('after R3', cortexAt(3), '#14b8a6')}${bar('after R4', cortexAt(4), '#14b8a6')}${bar('after R5', cortexAt(5), '#14b8a6')}
</div>
${list([
  `**Strong today:** tasks, views, agile planning, collaboration and a self-hosted option. These cover the daily needs of most teams.`,
  `**Largest gaps:** automation, public API and webhooks, integrations, dashboards and reports, enterprise security, and AI. Release 2 and 3 close the first three; Release 4 and 5 the rest.`,
  `**Deliberately different:** a smaller surface than ClickUp, an easier setup than Jira, and agile depth that Asana lacks.`,
])}
</section>`);

const permHtml = C.permissionRows.map((r) => `<tr><td>${esc(r[0])}</td>${r.slice(1).map((v) => `<td class="c">${v ? '<span class="yes">✓</span>' : '<span class="no">–</span>'}</td>`).join('')}</tr>`).join('');
sections.push(`<section>${h1('Users, roles and permissions')}
${h2('Personas')}
${table(['Persona', 'Goal', 'Pain today', 'What they use'], C.personas.map((p) => [`<b>${esc(p[0])}</b>`, esc(p[1]), esc(p[2]), esc(p[3])]), 'compact', ['19%', '24%', '27%', '30%'])}
${h2('Role model and permission matrix', 'Roles apply per workspace and are enforced on every request. A workspace always has at least one Owner.')}
<table class="perm"><colgroup><col style="width:58%"><col style="width:10.5%"><col style="width:10.5%"><col style="width:10.5%"><col style="width:10.5%"></colgroup><thead><tr><th>Capability</th><th class="c">Viewer</th><th class="c">Member</th><th class="c">Admin</th><th class="c">Owner</th></tr></thead><tbody>${permHtml}</tbody></table>
<p class="note">Planned: guests, private projects and custom roles (FR-WSP-08, 09, 10).</p>
</section>`);

sections.push(`<section>${h1('Product scope and release plan')}
${h2('Scope')}
<div class="two"><div><h3>In scope</h3>${list(C.inScope)}</div><div><h3>Out of scope for this horizon</h3>${list(C.outScope)}</div></div>
${h2('Release plan', 'Dates are indicative planning aids and are reviewed at the end of each release.')}
${roadmapHtml}
<div style="break-before:page"></div>
${table(['Release', 'Theme and timing', 'Contents', 'Exit criteria'], C.releases.map((r) => [`<b>${esc(r[0])}</b>`, `<b>${esc(r[1])}</b><br><span class="muted">${esc(r[2])}</span>`, esc(r[3]), esc(r[4])]), 'compact rel', ['8%', '20%', '48%', '24%'])}
</section>`);

const moduleSections = () => C.modules.map((m) => {
  const mTotal = m.rows.length; const mDel = m.rows.filter((r) => r[3] === 'D').length;
  const rows = m.rows.map((r) => {
    const [label, cls] = STATUS[r[3]];
    return [`<code>FR-${m.code}-${r[0]}</code>`, inline(r[1]), PRIORITY[r[2]], chip(label, cls), r[4], esc(r[5])];
  });
  return `<div class="module">${h2(m.name, m.goal)}<p class="meta">Prefix <code>FR-${m.code}</code> · ${mDel} of ${mTotal} delivered</p>${table(['ID', 'Requirement', 'Priority', 'Status', 'Release', 'Acceptance criteria'], rows, 'req', ['11%', '40%', '8%', '10%', '7.5%', '23.5%'])}</div>`;
}).join('');
sections.push(`<section>${h1('Functional requirements')}
<p>Each requirement has an identifier, a priority (Must, Should, Could, Won't), a status (Delivered, Partial, Planned), the release that delivers it, and an acceptance criterion a tester can verify. "Delivered" means present and verified in the current build.</p>
${moduleSections()}
</section>`);

sections.push(`<section>${h1('Non-functional requirements')}
<p>Targets are the commitments; the third column records what is actually evidenced today, so nothing is claimed that has not been measured.</p>
${table(['Area', 'Requirement', 'Evidence today', 'State'], C.nfrs.map((n) => [`<b>${esc(n[0])}</b>`, esc(n[1]), esc(n[2]), chip(n[3], /Verified$/.test(n[3]) && !/Partly/.test(n[3]) ? 'st-d' : /Partly/.test(n[3]) ? 'st-p' : 'st-n')]), 'compact', ['13%', '33%', '42%', '12%'])}
</section>`);

sections.push(`<section>${h1('Architecture and data')}
${h2('System context', 'Solid boxes exist today; dashed boxes are planned.')}
${architectureSvg}
${h2('Technology')}
${table(['Layer', 'Choice'], C.stack.map((s) => [`<b>${esc(s[0])}</b>`, esc(s[1])]), 'compact', ['16%', '84%'])}
${h2('Data model', 'Main entities and how they relate.')}
${dataModelSvg}
<p class="small"><b>Entities:</b> ${C.entities.join(' · ')}.</p>
${h2('API and engineering principles')}
${list(C.apiPrinciples)}
</section>`);

sections.push(`<section>${h1('User experience')}
${h2('Principles')}
${table(['Principle', 'In practice'], C.uxPrinciples.map((p) => [`<b>${esc(p[0])}</b>`, esc(p[1])]), 'compact', ['22%', '78%'])}
${h2('Key user journeys')}
${table(['Journey', 'Steps', 'Success measure'], C.journeys.map((j) => [`<b>${esc(j[0])}</b>`, esc(j[1]), esc(j[2])]), 'compact', ['16%', '54%', '30%'])}
</section>`);

sections.push(`<section>${h1('Quality and release criteria')}
${h2('Test strategy')}
${table(['Layer', 'What it covers', 'When'], C.qa.map((q) => [`<b>${esc(q[0])}</b>`, esc(q[1]), esc(q[2])]), 'compact', ['20%', '60%', '20%'])}
${h2('Definition of done')}
${list(C.dod)}
</section>`);

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
  return `<div class="bar-row"><span class="bar-label wide">${esc(m.name)}</span><span class="bar-track"><span class="bar-fill" style="width:${(d / n) * 100}%;background:#14b8a6"></span><span class="bar-fill" style="width:${(p / n) * 100}%;background:#f5b942"></span></span><span class="bar-val">${d}/${n}</span></div>`;
}).join('');
const trace = [
  ['BR-01', 'TSK, PRJ, VWS, RPT'], ['BR-02', 'TSK, REL, FLD, VWS, SPR, COL, AUTO, INT, RPT'], ['BR-03', 'VWS, SRC, TSK (performance and keyboard requirements)'],
  ['BR-04', 'AUT, WSP, ADM'], ['BR-05', 'Section 7 (maintainability), section 8 (single service and database)'], ['BR-06', 'Section 7 (accessibility), VWS-02, SPR-06'],
  ['BR-07', 'IMP'], ['BR-08', 'INT, AUTO, NTF'], ['BR-09', 'IMP-02, VWS-06'],
];
sections.push(`<section>${h1('Requirement status summary', { appendix: true, letter: 'A' })}
<p>${total} requirements across ${C.modules.length} modules: <b>${delivered} delivered</b> (${pct(delivered)}%), <b>${partial} partial</b>, <b>${planned} planned</b> (${pct(planned)}%).</p>
<div class="bars">${modRows}</div>
<p class="legend"><span class="swatch" style="background:#14b8a6"></span> Delivered &nbsp; <span class="swatch" style="background:#f5b942"></span> Partial &nbsp; <span class="swatch" style="background:#e4e8f1"></span> Planned</p>
${h1('Traceability from business requirements', { appendix: true, letter: 'B' })}
${table(['Business requirement', 'Delivered through'], trace.map((t) => [`<code>${t[0]}</code>`, esc(t[1])]), 'compact', ['22%', '78%'])}
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
${table(['Version', 'Date', 'Author', 'Change'], [[C.doc.version, C.doc.date, 'Product', 'First complete draft: business context, competitive analysis, requirements, release plan']], 'compact', ['12%', '20%', '18%', '50%'])}
<h3>Approvals</h3>
${table(['Role', 'Name', 'Signature', 'Date'], ['Product owner', 'Engineering lead', 'Security lead', 'Sponsor'].map((r) => [r, '<span class="blank"></span>', '<span class="blank"></span>', '<span class="blank"></span>']), 'compact sign', ['25%', '30%', '30%', '15%'])}
<h3>How to read this document</h3>
<div class="legend-grid">
  <div><b>Status</b><br>${chip('Delivered', 'st-d')} present and verified in the current build<br>${chip('Partial', 'st-p')} present with a known limitation<br>${chip('Planned', 'st-n')} not built yet</div>
  <div><b>Priority</b><br><b>Must</b> required for the release to be useful<br><b>Should</b> important, not blocking<br><b>Could</b> valuable if capacity allows<br><b>Won't</b> excluded from this horizon</div>
  <div><b>Release</b><br>R1 current build · R1.1 brand alignment<br>R2 automate and connect · R3 scale and secure<br>R4 insight and collaboration · R5 intelligence</div>
</div>
<p class="note">Basis of this document: requirement statuses reflect the product's source code and automated tests as of ${esc(C.doc.date)}. Targets, dates and competitor comparisons are proposals or high-level observations and are marked as such.</p>
</section>`;

const tocPlaceholder = '__TOC__';
const renderToc = (pages) => `<section class="toc"><h1 class="plain">Contents</h1><div class="toc-cols">${toc.map((e) => `<div class="toc-row l${e.level}"><span class="t">${esc(e.text)}</span><span class="dots"></span><span class="p">${pages ? (pages.get(e.text) ?? '') : '00'}</span></div>`).join('')}</div></section>`;

const cover = `<section class="cover"><div class="cover-in">
<div class="brand">${logo(58)}<span>Cortex Tracker</span></div>
<div class="cover-mid"><p class="eyebrow">Business and Product Requirements Document</p><h1>Work management that<br>stays out of the way</h1><p class="cover-sub">Requirements for a platform that matches Jira, ClickUp and Asana on the capabilities teams use every day.</p></div>
<div class="cover-meta"><div><span>Version</span><b>${C.doc.version}</b></div><div><span>Date</span><b>${C.doc.date}</b></div><div><span>Status</span><b>${C.doc.status}</b></div><div><span>Classification</span><b>Confidential</b></div></div>
</div></section>`;

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
