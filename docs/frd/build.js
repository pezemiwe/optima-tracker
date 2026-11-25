'use strict';
/* Builds docs/Cortex-SuperApp-Admin-Portal-FRD.pdf.  node docs/frd/build.js
   Logo: put the official Deloitte logo (SVG or PNG, supplied by Deloitte brand) at docs/frd/assets/deloitte-logo.svg|png.
   Without it, the cover shows a clearly labelled placeholder: the logo is not reproduced from memory. */
const fs = require('node:fs'); const path = require('node:path'); const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright'); const C = require('./content');
const HTML = path.join(__dirname, 'document.html'); const PDF = path.join(__dirname, '..', 'Cortex-SuperApp-Admin-Portal-FRD.pdf');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const table = (head, rows, cls = '', w = []) => `<table class="${cls}"><colgroup>${w.map((x) => `<col style="width:${x}">`).join('')}</colgroup><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const tag = (t) => (t === 'Src' ? '<span class="chip src">v2.4</span>' : '<span class="chip new">Proposed</span>');
const toc = []; let n1 = 0; let n2 = 0;
const h1 = (t, app) => { if (app) { toc.push({ l: 1, t: `Appendix ${app}. ${t}` }); return `<h1 class="app"><span class="num">Appendix ${app}</span>${esc(t)}</h1>`; } n1++; n2 = 0; toc.push({ l: 1, t: `${n1}. ${t}` }); return `<h1><span class="num">${n1}</span>${esc(t)}</h1>`; };
const h2 = (t) => { n2++; toc.push({ l: 2, t: `${n1}.${n2} ${t}` }); return `<h2><span class="num">${n1}.${n2}</span>${esc(t)}</h2>`; };

/* logo */
const logoFile = ['svg', 'png'].map((e) => path.join(__dirname, 'assets', `deloitte-logo.${e}`)).find((f) => fs.existsSync(f));
const logoHtml = logoFile
  ? `<img alt="Deloitte" src="data:${logoFile.endsWith('svg') ? 'image/svg+xml' : 'image/png'};base64,${fs.readFileSync(logoFile).toString('base64')}">`
  : '<div class="logo-ph"><b>[ Deloitte logo ]</b>Official artwork to be placed here<br>(assets/deloitte-logo.svg)</div>';

/* diagrams */
const flowSvg = `<svg viewBox="0 0 760 150" class="diagram" role="img" aria-label="Maker-checker request lifecycle">
<defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8Z" fill="#046A38"/></marker></defs>
${[[10, 'Initiate', 'Initiator submits'], [165, 'Pending', 'Awaits approver'], [330, 'Review', 'Approver opens details'], [515, 'Approved', 'Change applied']].map(([x, t, s], i) => `<rect x="${x}" y="40" width="${i === 3 ? 140 : 130}" height="56" rx="4" fill="${i === 3 ? '#86BC25' : '#fff'}" stroke="#000" stroke-width="1.5"/><text x="${x + 10}" y="64" class="d-t">${t}</text><text x="${x + 10}" y="81" class="d-s">${s}</text>`).join('')}
<rect x="515" y="108" width="140" height="36" rx="4" fill="#fff" stroke="#53565A" stroke-width="1.5"/><text x="525" y="124" class="d-t">Rejected</text><text x="525" y="137" class="d-s">Reason recorded</text>
<line x1="140" y1="68" x2="165" y2="68" stroke="#046A38" stroke-width="2" marker-end="url(#a)"/><line x1="295" y1="68" x2="330" y2="68" stroke="#046A38" stroke-width="2" marker-end="url(#a)"/>
<line x1="460" y1="62" x2="515" y2="62" stroke="#046A38" stroke-width="2" marker-end="url(#a)"/><line x1="460" y1="78" x2="515" y2="122" stroke="#53565A" stroke-width="2" marker-end="url(#a)"/>
<text x="470" y="52" class="d-s">Approve</text><text x="470" y="108" class="d-s">Reject</text>
<text x="10" y="20" class="d-t">Every approval-based action follows this path. The approver must be a different person with the same SOL ID.</text></svg>`;

const sections = [];
/* 1 */
sections.push(`<section>${h1('Introduction')}
${h2('Purpose of this document')}
<p>This Functional Requirements Definition (FRD) describes the workings of the ${C.doc.title}. The portal supports the ${C.doc.client} Cortex application so that the Customer Support Team (FirstContact and Customer Service Officers) can:</p>
<ul><li>carry out basic enquiries on customers’ transaction history;</li><li>troubleshoot customer complaints;</li><li>lock and unlock customer profiles on the mobile app channels when required.</li></ul>
<p>It records the requirements as defined by the relevant stakeholders. The intended audience is the project sponsor, project manager, project team, IT, ISOD, Internal Control, FirstContact and any stakeholder whose input or approval is needed.</p>
${h2('What changed from v2.4')}
<p>Version 3.0 keeps every requirement in v2.4 and adds structure and rigour. Content from v2.4 is tagged <span class="chip src">v2.4</span>; anything added in this version is tagged <span class="chip new">Proposed</span> and needs product owner confirmation before it is treated as agreed scope.</p>
<table><thead><tr><th>Enhancement</th><th>Where</th></tr></thead><tbody>
<tr><td>Shared approval workflow defined once instead of copied nine times</td><td>Section 4</td></tr>
<tr><td>Actor definitions and an access matrix</td><td>Section 3</td></tr>
<tr><td>Use cases with priority, approval need, acceptance criteria and traceability</td><td>Section 5</td></tr>
<tr><td>Functional requirements with gaps closed (view role, view user, request queue)</td><td>Section 6</td></tr>
<tr><td>Measurable performance and security targets</td><td>Section 7</td></tr>
<tr><td>Business requirement → use case → requirement matrix</td><td>Section 8</td></tr>
<tr><td>Review findings and decisions needed</td><td>Section 9</td></tr></tbody></table>
</section>`);
/* 2 */
sections.push(`<section>${h1('Business requirement overview')}
${table(['ID', 'Description'], C.br.flatMap(([g, rows]) => [[`<span class="grp"></span>`, `<b>${esc(g)}</b>`], ...rows.map(([i, d]) => [`<code>${i}</code>`, esc(d)])]).map((r, i) => r), 'kv2', ['16%', '84%']).replace(/<tr><td><span class="grp"><\/span><\/td><td>/g, '<tr><td class="grp"></td><td class="grp">')}
${h2('Assumptions and constraints')}
<ol><li>Details of a customer can only be viewed on the admin dashboard if the customer is registered on Cortex. ${tag('Src')}</li><li>Approvers and viewers can see initiated items with only the same SOL ID. ${tag('Src')}</li><li>99.9% network uptime for the intranet and for the solution’s web service API. ${tag('Src')}</li><li>There will be no breach of data security. ${tag('Src')}</li></ol>
${h2('Solution overview')}
<p>The portal is a user-support platform for bank staff. It helps customers resolve complaints on the Cortex app and helps prevent unauthorised use. It streamlines issue resolution and supports a secure and efficient banking experience.</p>
<p class="note">Proposed addition: all changes that affect access, limits or customer devices use a maker-checker approval, and every action is written to an audit trail. These two controls are the backbone of the requirements that follow.</p>
</section>`);
/* 3 */
sections.push(`<section>${h1('Actors and access')}
${h2('Actors')}
<p>v2.4 lists one primary actor, FirstBank Staff. The use cases refer to six distinct responsibilities, which are named here.</p>
${table(['Actor', 'Responsibility'], C.roles.map(([a, d]) => [`<b>${a}</b>`, esc(d)]), '', ['24%', '76%'])}
${h2('Access matrix')}
<p><b>I</b> initiates or performs, <b>A</b> approves or rejects, <b>V</b> views requests only. ${tag('New')} Derived from the use cases; the product owner must confirm it.</p>
<table><thead><tr><th>Capability</th>${['Admin initiator', 'Admin approver', 'Permitted initiator', 'Permitted approver', 'Permitted user', 'Viewer'].map((h) => `<th style="text-align:center">${h}</th>`).join('')}</tr></thead><tbody>
${C.matrix.map((r) => `<tr><td>${r[0]}</td>${r.slice(1).map((c) => `<td class="mx ${c === '-' ? 'x' : c}">${c === '-' ? '–' : c}</td>`).join('')}</tr>`).join('')}</tbody></table>
</section>`);
/* 4 */
sections.push(`<section>${h1('Common workflows')}
${h2('Sign-in')}
<p>Staff sign in with Staff ID and Active Directory password, then a token. A staff member must be enrolled on Active Directory and profiled on the portal. ${tag('Src')}</p>
${h2('Standard approval workflow')}
${flowSvg}
<p>Nine use cases (003 to 010, 012, 014 to 016) share the same approver steps. They are written once here and referred to by queue name in section 5. ${tag('Src')}</p>
${table(['Step', 'Approver action', 'System response'], [['1', 'Opens the queue named in the use case (for example Roles › Requests)', 'Displays the requests screen'], ['2', 'Clicks View Details on a request', 'Displays request details. For pending items, shows Approve and Reject'], ['3', 'Clicks Approve', 'Shows a success message; the request flows into the module and takes effect'], ['4', 'Clicks Reject and enters a reason', 'Shows a success message; status changes to Rejected'], ['5', 'Filters the queue', 'Pending, Approved and Rejected requests can be viewed by filter']], '', ['8%', '46%', '46%'])}
<h3>Rules</h3>
<ul><li>A new request shows as <b>Pending</b> until an approver acts. ${tag('Src')}</li><li>Viewers can only view requests. ${tag('Src')}</li><li>The approver must be a different person from the initiator. ${tag('New')}</li><li>A rejection reason is mandatory, stored and shown to the initiator. ${tag('New')}</li></ul>
${h2('Actions that need approval')}
${table(['Needs approval', 'Does not need approval'], [['Create, edit, activate, deactivate roles; create, edit, activate, deactivate users; remove dormancy; unlock profile; release device; change limit', 'Login, logout, lock profile, view or download reports, view or download the audit trail']], '', ['60%', '40%'])}
</section>`);
/* 5 */
const ucCard = (u) => `<div class="uc"><div class="uc-head"><b>${esc(u.name)}</b><code>UC/PROJECTADMIN/${u.id}</code></div>
<div class="uc-meta"><div><span>Priority</span>${u.pri[0]} ${u.pri[1] ? tag('Src') : tag('New')}</div><div><span>Approval</span>${u.approval === 'Required' ? '<span class="chip req">Required</span>' : `<span class="chip nor">${u.approval}</span>`}</div><div><span>Traces to</span>${u.br} · ${u.fr}</div><div><span>Frequency</span>${u.freq || 'Not stated'}</div></div>
<div class="body"><b>Preconditions</b><ul>${u.pre.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
<table><thead><tr><th style="width:5%">#</th><th>Actor action</th><th>System response</th></tr></thead><tbody>${u.flow.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f[0])}</td><td>${esc(f[1])}</td></tr>`).join('')}</tbody></table>
<div class="body">${u.queue ? `<b>Approver flow</b> Standard approval workflow (section 4.2), queue <code>${esc(u.queue)}</code>.<br>` : ''}${u.rules.length ? `<b>Business rules</b><ul>${u.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}<b>Acceptance criteria</b> ${tag('New')}<ul>${u.ac.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>${u.note ? `<i>${esc(u.note)}</i>` : ''}</div></div>`;
const groups = [['Access', ['001', '002']], ['Role management', ['003', '005', '006', '007']], ['User management', ['004', '008', '009', '010', '011', '012']], ['Customer support actions', ['013', '014', '015', '016']], ['Audit', ['017']]];
sections.push(`<section>${h1('Use cases')}<p>Use case IDs are unchanged from v2.4. Primary actor and approver are as defined in section 3.</p>
${groups.map(([g, ids]) => { const s = h2(g); return s + ids.map((i) => ucCard(C.uc.find((u) => u.id === i))).join(''); }).join('')}</section>`);
/* 6 */
const frRow = (f) => [`<code>${f[0]}</code>`, esc(f[1]), f[3], tag(f[2])];
sections.push(`<section>${h1('Functional requirements')}
${h2('General requirements')}
${table(['ID', 'Requirement', 'Priority', 'Origin'], C.fr.map(frRow), '', ['10%', '62%', '14%', '14%'])}
<p class="note">Priorities for FR001 to FR017 follow the use case priority where v2.4 gave one, otherwise they are proposed.</p></section>`);
/* 7 */
const nf = (rows) => table(['ID', 'Requirement', 'Origin'], rows.map((r) => [`<code>${r[0]}</code>`, esc(r[1]), tag(r[2])]), '', ['11%', '75%', '14%']);
sections.push(`<section>${h1('Non-functional requirements')}
${h2('Usability')}${nf(C.nfr.usability)}
${h2('Performance')}${nf(C.nfr.performance)}
${h2('Supportability')}${nf(C.nfr.support)}
${h2('Security')}${nf(C.nfr.security)}
${h2('Compliance')}${nf(C.nfr.compliance)}
${h2('Availability and constraints')}<ul><li>99.9% network uptime for the intranet. ${tag('Src')}</li><li>99.9% availability of the solution’s web service API. ${tag('Src')}</li></ul></section>`);
/* 8 */
const brName = Object.fromEntries(C.br.flatMap(([, r]) => r));
const trace = Object.keys(brName).map((b) => { const u = C.uc.filter((x) => x.br === b); return [`<code>${b}</code>`, esc(brName[b]), u.length ? u.map((x) => x.id).join(', ') : '<b>none</b>', u.length ? u.map((x) => x.fr).join(', ') : (b === 'BR007' ? 'FR018 (new)' : 'FR019 (new)')]; });
sections.push(`<section>${h1('Traceability')}
${table(['Business req.', 'Description', 'Use case', 'Functional req.'], trace, '', ['16%', '38%', '22%', '24%'])}
<p class="note">BR007 and BR012 had no use case in v2.4. Use cases for FR018 and FR019 remain to be written.</p></section>`);
/* 9 */
sections.push(`<section>${h1('Review findings and decisions needed')}
<p>Issues found while reviewing v2.4, with what this version did about them.</p>
${table(['Ref', 'Finding', 'Action in v3.0'], C.findings.map((f) => [`<code>${f[0]}</code>`, esc(f[1]), esc(f[2])]), '', ['8%', '58%', '34%'])}</section>`);
/* appendices + approval */
sections.push(`<section>${h1('Glossary', 'A')}${table(['Term', 'Meaning'], C.glossary.map((g) => [`<b>${g[0]}</b>`, esc(g[1])]), '', ['24%', '76%'])}
${h1('Approval', 'B')}<p>The undersigned acknowledge they have reviewed the “Cortex Admin Portal Refresh Functional Requirements Definition” version 3.0 and agree with the approach it presents. Any changes will be coordinated with and approved by the undersigned or their designated representatives.</p>
${table(['Approver name', 'Department', 'Role', 'Signature', 'Date'], Array(6).fill(0).map(() => Array(5).fill('<span class="blank"></span>')), 'sign', ['24%', '20%', '20%', '24%', '12%'])}
<p class="note">Signatures on v2.4 are not carried over. This version needs its own approvals.</p></section>`);

const front = `<section><h1 style="border:0;padding:0;margin-bottom:4mm">Document control</h1>
${table(['Item', 'Detail'], [['Document', `${C.doc.title}: ${C.doc.subtitle}`], ['Client', C.doc.client], ['Version', C.doc.version], ['Date', C.doc.date], ['Based on', C.doc.basis], ['Status', 'Draft for product owner review'], ['Classification', 'Restricted']], 'kv', ['30%', '70%'])}
<h3>Version history</h3>${table(['Version', 'Name', 'Date', 'Description of change'], C.history, '', ['10%', '24%', '14%', '52%'])}
<div class="notice-box"><h2>Restricted use</h2><p><b>This document must not be used for research purposes.</b> It is provided solely for reviewing, approving and delivering the ${C.doc.title} project. It must not be used for research, benchmarking, academic or market study, training data, publication or any purpose other than the one stated.</p><p>It contains confidential information. Do not copy, quote, share or distribute it beyond the named project audience without written permission from the document owner.</p></div></section>`;
const cover = `<section class="cover" style="break-before:auto"><div class="band"></div><div class="cover-in"><div class="logo-slot">${logoHtml}</div>
<div><p class="eyebrow">${C.doc.subtitle}</p><h1>${C.doc.title}<span class="dot">.</span></h1><p class="cover-sub">Requirements for ${C.doc.client}’s customer-support and administration portal for the Cortex app.</p></div>
<div><div class="cover-meta"><div><span>Version</span><b>${C.doc.version.split(' ')[0]}</b></div><div><span>Date</span><b>${C.doc.date}</b></div><div><span>Client</span><b>${C.doc.client}</b></div><div><span>Status</span><b>Draft</b></div></div>
<p class="cover-notice"><b>Restricted use.</b> Not to be used for research purposes. Confidential.</p></div></div></section>`;
const renderToc = (pages) => `<section><h1 style="border:0;padding:0">Contents</h1>${toc.map((e) => `<div class="toc-row l${e.l}"><span>${esc(e.t)}</span><span class="dots"></span><span class="p">${pages ? (pages.get(e.t) ?? '') : '00'}</span></div>`).join('')}</section>`;
const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const html = (p) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${C.doc.title}: ${C.doc.subtitle}</title><style>${css}</style></head><body>${cover}${front}${renderToc(p)}${sections.join('\n')}</body></html>`;
async function render(p) {
  fs.writeFileSync(HTML, html(p)); const b = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined, args: ['--no-sandbox'] }); const pg = await b.newPage();
  await pg.goto(`file://${HTML}`); await pg.evaluate(() => document.fonts.ready); await pg.pdf({ path: PDF, format: 'A4', printBackground: true, preferCSSPageSize: true }); await b.close();
}
const texts = () => { const n = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [PDF]).toString())[1]); return Array.from({ length: n }, (_, i) => execFileSync('pdftotext', ['-f', `${i + 1}`, '-l', `${i + 1}`, '-layout', PDF, '-']).toString().replace(/\s+/g, ' ')); };
(async () => {
  await render(null); let t = texts(); const tp = t.findIndex((x) => x.trim().startsWith('Contents')) + 1; const pages = new Map();
  for (const e of toc) { const needle = e.t.replace(/^(\d+)\.\s/, '$1 ').replace(/^(Appendix [A-D])\.\s/, '$1 ').toLowerCase(); const i = t.findIndex((x, k) => k + 1 > tp && x.toLowerCase().includes(needle)); pages.set(e.t, i >= 0 ? i + 1 : ''); }
  await render(pages); t = texts();
  console.log(`Pages: ${t.length}; missing contents: ${[...pages].filter(([, v]) => v === '').map(([k]) => k).join(' | ') || 'none'}; logo: ${logoFile ? 'supplied' : 'placeholder'}`);
})().catch((e) => { console.error(e); process.exit(1); });
