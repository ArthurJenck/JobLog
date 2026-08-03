import { beforeAll, describe, expect, test } from 'vitest';

const SECRET = 'test-snooze-secret';

beforeAll(() => {
  process.env.SNOOZE_JWT_SECRET = SECRET;
  process.env.PUBLIC_APP_URL = 'https://joblog.test';
});

const { MAX_DIGEST_ITEMS, buildReminderDigestEmail } = await import('./email.js');
const { verifySnoozeToken } = await import('./snooze.js');

function makeItems(count: number, frequencyDays = 7) {
  return Array.from({ length: count }, (_, i) => ({
    applicationId: `app-${i}`,
    jobTitle: `Poste ${i}`,
    company: `Société ${i}`,
    frequencyDays,
  }));
}

function snoozeTokens(html: string) {
  return [...html.matchAll(/\/api\/snooze\?token=([\w.-]+)/g)].map((m) => m[1]);
}

describe('buildReminderDigestEmail', () => {
  test('single item keeps the unitary copy', () => {
    const email = buildReminderDigestEmail({
      to: 'a@b.c',
      userId: 'user-1',
      items: makeItems(1),
    });

    expect(email.subject).toBe('Relance — Poste 0 chez Société 0');
    expect(email.html).toContain('Voir la candidature');
    expect(email.html).toContain('Me rappeler dans 7 jours');

    const tokens = snoozeTokens(email.html as string);
    expect(tokens).toHaveLength(1);
    expect(verifySnoozeToken(tokens[0])).toEqual({
      kind: 'single',
      applicationId: 'app-0',
      userId: 'user-1',
    });
  });

  test('several items produce one card each plus a bulk link', () => {
    const email = buildReminderDigestEmail({
      to: 'a@b.c',
      userId: 'user-1',
      items: makeItems(3),
    });

    expect(email.subject).toBe('3 relances à faire');
    expect(email.html).toContain("Tu as 3 relances à faire aujourd'hui.");
    expect(email.html).toContain('Tout reporter dans 7 jours');

    const payloads = snoozeTokens(email.html as string).map(verifySnoozeToken);
    expect(payloads.filter((p) => p?.kind === 'single')).toHaveLength(3);

    const bulk = payloads.find((p) => p?.kind === 'bulk');
    expect(bulk?.kind === 'bulk' && bulk.applicationIds).toEqual(['app-0', 'app-1', 'app-2']);
  });

  test('mixed frequencies drop the delay from the bulk label', () => {
    const email = buildReminderDigestEmail({
      to: 'a@b.c',
      userId: 'user-1',
      items: [...makeItems(1, 7), { ...makeItems(1, 14)[0], applicationId: 'app-x' }],
    });

    expect(email.html).toContain('Tout reporter');
    expect(email.html).not.toContain('Tout reporter dans');
  });

  test('caps the listed items and mentions the overflow', () => {
    const email = buildReminderDigestEmail({
      to: 'a@b.c',
      userId: 'user-1',
      items: makeItems(30),
    });

    expect(email.subject).toBe('30 relances à faire');
    expect(email.html).toContain("Tu as 30 relances à faire aujourd'hui.");
    expect(email.html).toContain('+ 5 autres relances');

    const payloads = snoozeTokens(email.html as string).map(verifySnoozeToken);
    expect(payloads.filter((p) => p?.kind === 'single')).toHaveLength(MAX_DIGEST_ITEMS);

    const bulk = payloads.find((p) => p?.kind === 'bulk');
    expect(bulk?.kind === 'bulk' && bulk.applicationIds).toHaveLength(MAX_DIGEST_ITEMS);
  });

  test('escapes user-controlled fields in the html', () => {
    const email = buildReminderDigestEmail({
      to: 'a@b.c',
      userId: 'user-1',
      items: [
        {
          applicationId: 'app-0',
          jobTitle: '<script>alert(1)</script>',
          company: 'A & B "Co"',
          frequencyDays: 7,
        },
      ],
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('A &amp; B &quot;Co&quot;');
    expect(email.subject).toBe('Relance — <script>alert(1)</script> chez A & B "Co"');
  });

  test('throws on an empty item list', () => {
    expect(() => buildReminderDigestEmail({ to: 'a@b.c', userId: 'user-1', items: [] })).toThrow();
  });
});
