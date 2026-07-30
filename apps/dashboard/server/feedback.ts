import { z } from 'zod';
import { getEnv } from '../lib/env.js';
import { escapeHtml } from '../lib/html.js';
import { defineHandler, method } from '../lib/http/define-handler.js';
import { ApiError } from '../lib/http/errors.js';
import { sendEmail } from '../lib/resend.js';

const FeedbackSchema = z.object({
  type: z.enum(['bug', 'feedback', 'feature']),
  message: z.string().min(1).max(2000).trim(),
  url: z.string().max(2048),
  userAgent: z.string().max(500),
  viewport: z.string().max(50),
});

const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug',
  feedback: 'Retour',
  feature: 'Idée',
};

export default defineHandler({
  POST: method({
    body: FeedbackSchema,
    rateLimit: {
      max: 5,
      windowMs: 60 * 60 * 1000,
      scope: ({ user }) => `feedback:${user!.id}`,
    },
    async handle({ user, body }) {
      const { type, message, url, userAgent, viewport } = body;
      const { id, email, name } = user;

      const adminMail = (getEnv('ADMIN_MAIL') ?? '').replace(/^mailto:/, '');
      if (!adminMail) throw new ApiError(500, 'internal_error', 'Missing ADMIN_MAIL configuration');

      const typeLabel = TYPE_LABELS[type] ?? type;
      const subject = `JobLog feedback - ${typeLabel} - ${email}`;

      const text = [
        `Type: ${typeLabel}`,
        `Message:\n${message}`,
        ``,
        `URL: ${url}`,
        `Viewport: ${viewport}`,
        `User-Agent: ${userAgent}`,
        ``,
        `User ID: ${id}`,
        `Email: ${email}`,
        `Name: ${name ?? '—'}`,
      ].join('\n');

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px">JobLog feedback — ${escapeHtml(typeLabel)}</h2>
  <p style="background:#f4f4f5;border-radius:6px;padding:16px;white-space:pre-wrap;margin:0 0 24px;word-break:break-word">${escapeHtml(message)}</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px">
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">URL</td><td style="padding:4px 0;word-break:break-all">${escapeHtml(url)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">Viewport</td><td style="padding:4px 0">${escapeHtml(viewport)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">User-Agent</td><td style="padding:4px 0;word-break:break-all">${escapeHtml(userAgent)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">User ID</td><td style="padding:4px 0">${escapeHtml(id)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">Email</td><td style="padding:4px 0">${escapeHtml(email)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">Name</td><td style="padding:4px 0">${escapeHtml(name ?? '—')}</td></tr>
  </table>
</body>
</html>`;

      try {
        await sendEmail({
          from: getEnv('RESEND_FROM') ?? 'JobLog <noreply@arthurjenck.com>',
          to: adminMail,
          replyTo: email,
          subject,
          text,
          html,
        });
      } catch {
        throw new ApiError(500, 'internal_error', 'Failed to send feedback');
      }

      return { json: { ok: true } };
    },
  }),
});
