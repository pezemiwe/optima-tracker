'use strict';
/* Plain, accessible email bodies. Every message has a text part and a simple HTML part. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wrap(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#14171c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:28px">
<tr><td><p style="margin:0 0 16px;font-weight:bold;font-size:15px">Cortex Tracker</p><h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>${bodyHtml}</td></tr></table>
</td></tr></table></body></html>`;
}

const button = (href, label) => `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#86bc25;color:#14171c;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px;display:inline-block">${esc(label)}</a></p>`;

function resetEmail(link) {
  return {
    subject: 'Reset your password',
    text: `Someone asked to reset the password for this account.\n\nUse this link within 1 hour:\n${link}\n\nIf this was not you, ignore this email. Your password stays the same.`,
    html: wrap('Reset your password', `<p>Someone asked to reset the password for this account. The link works for 1 hour.</p>${button(link, 'Choose a new password')}<p style="color:#64748b;font-size:13px">If this was not you, ignore this email. Your password stays the same.</p>`),
  };
}

function inviteEmail({ workspaceName, inviterName, role, link }) {
  return {
    subject: `${inviterName} invited you to ${workspaceName}`,
    text: `${inviterName} invited you to join ${workspaceName} as ${role}.\n\nAccept the invitation (valid for 14 days):\n${link}`,
    html: wrap(`Join ${workspaceName}`, `<p>${esc(inviterName)} invited you to join <b>${esc(workspaceName)}</b> as ${esc(role)}. The invitation is valid for 14 days.</p>${button(link, 'Accept invitation')}`),
  };
}

/* items: [{ body, link }] */
function digestEmail(items, appUrl) {
  const n = items.length;
  const lines = items.map((i) => `- ${i.body}${i.link ? `\n  ${i.link}` : ''}`).join('\n');
  const rows = items.map((i) => `<li style="margin:0 0 10px">${i.link ? `<a href="${esc(i.link)}" style="color:#3d6208">${esc(i.body)}</a>` : esc(i.body)}</li>`).join('');
  return {
    subject: n === 1 ? items[0].body.slice(0, 120) : `${n} new notifications`,
    text: `${lines}${appUrl ? `\n\nOpen the tracker: ${appUrl}` : ''}\n\nTurn these emails off in your account settings.`,
    html: wrap(n === 1 ? 'New notification' : `${n} new notifications`, `<ul style="padding-left:18px">${rows}</ul>${appUrl ? button(appUrl, 'Open the tracker') : ''}<p style="color:#64748b;font-size:13px">You can turn these emails off in your account settings.</p>`),
  };
}

module.exports = { resetEmail, inviteEmail, digestEmail };
