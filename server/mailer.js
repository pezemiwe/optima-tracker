'use strict';
/*
 * Outgoing email. Set SMTP_URL (e.g. smtps://user:pass@smtp.example.com:465) and MAIL_FROM to enable it.
 * Without SMTP_URL the app works fine: invites and reset links are shown to admins to share by hand.
 */
const nodemailer = require('nodemailer');

function createMailer({ url = process.env.SMTP_URL, from = process.env.MAIL_FROM } = {}) {
  if (!url) {
    return { enabled: false, async send() { return { skipped: true }; } };
  }
  const transport = nodemailer.createTransport(url);
  const sender = from || 'Cortex Tracker <no-reply@localhost>';
  return {
    enabled: true,
    async send({ to, subject, text, html }) {
      await transport.sendMail({ from: sender, to, subject, text, html });
      return { sent: true };
    },
  };
}

/* For tests: records messages instead of sending them. */
function createMemoryMailer() {
  const outbox = [];
  return { enabled: true, outbox, async send(message) { outbox.push(message); return { sent: true }; } };
}

module.exports = { createMailer, createMemoryMailer };
