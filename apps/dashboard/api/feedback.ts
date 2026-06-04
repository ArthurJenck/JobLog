import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getEnv } from '../lib/env.js';
import { sendEmail } from '../lib/resend.js';
import { requireSession } from '../lib/session.js';

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

function esc(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session) return;

  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { type, message, url, userAgent, viewport } = parsed.data;
  const { id, email, name } = session.user;

  const adminMail = (getEnv('ADMIN_MAIL') ?? '').replace(/^mailto:/, '');
  if (!adminMail) return res.status(500).json({ error: 'Missing ADMIN_MAIL configuration' });

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
  <h2 style="margin:0 0 16px">JobLog feedback — ${esc(typeLabel)}</h2>
  <p style="background:#f4f4f5;border-radius:6px;padding:16px;white-space:pre-wrap;margin:0 0 24px;word-break:break-word">${esc(message)}</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px">
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">URL</td><td style="padding:4px 0;word-break:break-all">${esc(url)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">Viewport</td><td style="padding:4px 0">${esc(viewport)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">User-Agent</td><td style="padding:4px 0;word-break:break-all">${esc(userAgent)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">User ID</td><td style="padding:4px 0">${esc(id)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">Email</td><td style="padding:4px 0">${esc(email)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">Name</td><td style="padding:4px 0">${esc(name ?? '—')}</td></tr>
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
    return res.status(500).json({ error: 'Failed to send feedback' });
  }

  return res.status(200).json({ ok: true });
}
