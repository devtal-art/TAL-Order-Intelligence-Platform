import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { buildHelpEmailHtml } from './helpEmailTemplate.js';

// ────────────────────────────────────────────────
//  HELP SERVICE (new, additive)
//
//  Sends the in-app "Help" button's message to the team via Brevo's
//  transactional email API. Accounts have no stored personal email
//  (see user.model.js), so every message is sent FROM one fixed, Brevo-
//  verified address — the sender's NAME (from the authenticated JWT) is
//  carried in the subject/body instead, so the recipient still knows who
//  wrote it.
// ────────────────────────────────────────────────

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export async function sendHelpRequest({ senderName, message }) {
  if (!env.brevoApiKey || !env.brevoSenderEmail) {
    throw new AppError('CONFIG_ERROR', 'Help email is not configured on the server.', { status: 500 });
  }

  const submittedOn = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': env.brevoApiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Order Intelligence Help', email: env.brevoSenderEmail },
      to: [{ email: env.helpRecipientEmail }],
      subject: `Help request from ${senderName}`,
      htmlContent: buildHelpEmailHtml({ senderName, message, submittedOn }),
      textContent: `${senderName} sent a help request from Order Intelligence:\n\n${message}`,
    }),
  });

  if (!res.ok) {
    let providerMessage = '';
    try {
      const body = await res.json();
      providerMessage = body?.message || '';
    } catch {
      // non-JSON error body — fall through with no extra detail
    }
    throw new AppError(
      'BAD_GATEWAY',
      'Could not send the help request. Please try again in a moment.',
      { status: 502, details: providerMessage ? [{ issue: providerMessage }] : undefined }
    );
  }
}
