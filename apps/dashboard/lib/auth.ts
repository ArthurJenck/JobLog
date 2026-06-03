import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { magicLink } from 'better-auth/plugins';
import { getDb } from './db.js';
import { getEnv, requireEnv } from './env.js';

let _auth: ReturnType<typeof betterAuth> | null = null;

function getFallbackAppUrl() {
  return getEnv('PUBLIC_APP_URL') ?? 'https://joblog.arthurjenck.com';
}

function getPublicAppHost() {
  try {
    return new URL(getFallbackAppUrl()).host;
  } catch {
    return undefined;
  }
}

export async function getAuth() {
  if (_auth) return _auth;

  const db = await getDb();
  const publicAppHost = getPublicAppHost();

  _auth = betterAuth({
    database: mongodbAdapter(db),
    baseURL: {
      allowedHosts: [
        'localhost',
        'localhost:*',
        '127.0.0.1',
        '127.0.0.1:*',
        '[::1]',
        '[::1]:*',
        'joblog.arthurjenck.com',
        '*.vercel.app',
        ...(publicAppHost ? [publicAppHost] : []),
      ],
      fallback: getFallbackAppUrl(),
      protocol: 'auto',
    },
    secret: requireEnv('BETTER_AUTH_SECRET'),
    socialProviders: {
      google: {
        clientId: requireEnv('GOOGLE_CLIENT_ID'),
        clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const { Resend } = await import('resend');
          const resend = new Resend(requireEnv('RESEND_API_KEY'));
          await resend.emails.send({
            from: 'JobLog <noreply@arthurjenck.com>',
            to: email,
            subject: 'Connexion à JobLog',
            html: `<p>Clique sur ce lien pour te connecter : <a href="${url}">${url}</a></p><p>Ce lien expire dans 10 minutes.</p>`,
          });
        },
      }),
    ],
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
  });

  return _auth;
}
