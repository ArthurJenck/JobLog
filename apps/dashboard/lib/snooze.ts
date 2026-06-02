import jwt from 'jsonwebtoken';

const SNOOZE_EXPIRY = '7d';

export function signSnoozeToken(applicationId: string, userId: string): string {
  return jwt.sign(
    { applicationId, userId },
    process.env.SNOOZE_JWT_SECRET!,
    { expiresIn: SNOOZE_EXPIRY }
  );
}

export function verifySnoozeToken(token: string): { applicationId: string; userId: string } | null {
  try {
    return jwt.verify(token, process.env.SNOOZE_JWT_SECRET!) as { applicationId: string; userId: string };
  } catch {
    return null;
  }
}
