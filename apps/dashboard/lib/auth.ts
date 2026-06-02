import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { magicLink } from 'better-auth/plugins';
import { getDb } from './db.js';

let _auth: ReturnType<typeof betterAuth> | null = null;

export async function getAuth() {
  if (_auth) return _auth;

  const db = await getDb();

  _auth = betterAuth({
    database: mongodbAdapter(db),
    baseURL: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
    secret: process.env.BETTER_AUTH_SECRET!,
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: 'JobLog <noreply@arthurjenck.com>',
            to: email,
            subject: 'Connexion à JobLog',
            html: `<p>Clique sur ce lien pour te connecter : <a href="${url}">${url}</a></p><p>Ce lien expire dans 10 minutes.</p>`,
          });
        },
      }),
    ],
    trustedOrigins: [process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'],
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
  });

  return _auth;
}
