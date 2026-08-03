import { Resend, type CreateEmailOptions } from 'resend';
import { requireEnv } from './env.js';

const BATCH_SIZE = 100;

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

async function sendChunk(chunk: CreateEmailOptions[]): Promise<PromiseSettledResult<string>[]> {
  const { data, error } = await getResend().batch.send(chunk);

  if (error || !data || data.data.length !== chunk.length) {
    return Promise.allSettled(chunk.map((payload) => sendEmail(payload)));
  }

  return data.data.map((sent) => ({ status: 'fulfilled', value: sent.id }) as const);
}

export async function sendEmails(
  payloads: CreateEmailOptions[]
): Promise<PromiseSettledResult<string>[]> {
  const results: PromiseSettledResult<string>[] = [];

  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const chunk = payloads.slice(i, i + BATCH_SIZE);
    try {
      results.push(...(await sendChunk(chunk)));
    } catch (reason) {
      results.push(...chunk.map(() => ({ status: 'rejected', reason }) as const));
    }
  }

  return results;
}
