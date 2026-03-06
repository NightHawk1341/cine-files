/**
 * Yandex Cloud Postbox Email Sender
 *
 * Uses Postbox SMTP endpoint (postbox.cloud.yandex.net) with API key auth.
 * Falls back to legacy Yandex SMTP (smtp.yandex.ru) if Postbox is not configured
 * or if sending fails.
 */

const nodemailer = require('nodemailer');
const config = require('./config');

let postboxTransporter = null;
let smtpTransporter = null;

/**
 * Create (or reuse) a nodemailer transporter for Postbox SMTP
 */
function getPostboxTransporter() {
  if (!config.postbox.enabled) return null;
  if (postboxTransporter) return postboxTransporter;

  postboxTransporter = nodemailer.createTransport({
    host: config.postbox.host,
    port: config.postbox.port,
    secure: config.postbox.secure,
    auth: {
      user: config.postbox.apiKeyId,
      pass: config.postbox.apiKeySecret
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000
  });

  return postboxTransporter;
}

/**
 * Create (or reuse) a nodemailer transporter for legacy Yandex SMTP
 */
function getSmtpTransporter() {
  if (!config.email.enabled) return null;
  if (smtpTransporter) return smtpTransporter;

  smtpTransporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
      user: config.email.user,
      pass: config.email.password
    },
    connectionTimeout: 10000
  });

  return smtpTransporter;
}

/**
 * Reset cached transporters (useful if credentials rotate)
 */
function resetTransporters() {
  postboxTransporter = null;
  smtpTransporter = null;
}

/**
 * Send email via Postbox, falling back to Yandex SMTP on failure.
 *
 * @param {Object} opts
 * @param {string} opts.from      - Sender "Name <addr>" or just addr
 * @param {string} opts.to        - Recipient email
 * @param {string} opts.subject   - Subject line
 * @param {string} opts.text      - Plain-text body
 * @param {string} opts.html      - HTML body
 * @param {Object} [opts.headers] - Extra SMTP headers
 * @returns {Promise<{ messageId: string, provider: 'postbox'|'smtp' }>}
 * @throws if both providers fail
 */
async function sendEmail({ from, to, subject, text, html, headers }) {
  const mailOptions = { from, to, subject, text, html, headers };

  // --- Try Postbox first ---
  const pbTransporter = getPostboxTransporter();
  if (pbTransporter) {
    try {
      await pbTransporter.verify();
      const info = await pbTransporter.sendMail(mailOptions);
      console.log(`[Postbox] Email sent to ${to}: ${info.messageId}`);
      return { messageId: info.messageId, provider: 'postbox' };
    } catch (err) {
      console.error(`[Postbox] Failed to send to ${to}: ${err.message}`);
      // Reset so a new transporter is built on next call
      postboxTransporter = null;
      // Fall through to SMTP fallback
    }
  }

  // --- Fallback: legacy Yandex SMTP ---
  const smtpTr = getSmtpTransporter();
  if (!smtpTr) {
    throw new Error('No email provider configured (neither Postbox nor Yandex SMTP)');
  }

  try {
    await smtpTr.verify();
    const info = await smtpTr.sendMail(mailOptions);
    console.log(`[SMTP fallback] Email sent to ${to}: ${info.messageId}`);
    return { messageId: info.messageId, provider: 'smtp' };
  } catch (err) {
    smtpTransporter = null;
    console.error(`[SMTP fallback] Failed to send to ${to}: ${err.message}`);
    throw err;
  }
}

module.exports = { sendEmail, resetTransporters };
