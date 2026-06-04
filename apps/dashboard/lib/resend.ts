import { Resend, type CreateEmailOptions } from 'resend';
import { requireEnv } from './env.js';

let resend: Resend | null = null;

function getResend() {
  resend ??= new Resend(requireEnv('RESEND_API_KEY'));
  return resend;
}

function formatResendError(error: { name?: string; message?: string }) {
  return [error.name, error.message].filter(Boolean).join(': ') || 'Unknown Resend error';
}

export async function sendEmail(payload: CreateEmailOptions) {
  const { data, error } = await getResend().emails.send(payload);

  if (error) {
    throw new Error(`Resend failed: ${formatResendError(error)}`);
  }

  return data.id;
}
