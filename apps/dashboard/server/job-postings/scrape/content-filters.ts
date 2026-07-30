export function isBlockedOrErrorContent(input: {
  title: string;
  company: string;
  content: string;
  status: number | null;
}) {
  const text = `${input.title} ${input.company} ${input.content}`.toLowerCase();

  if (input.status !== null && input.status >= 400) return true;
  if (input.title.trim().toLowerCase() === '403 error') return true;
  if (text.includes('403 error')) return true;
  if (text.includes('access denied')) return true;
  if (text.includes('not a robot')) return true;
  if (text.includes("verify that you're not a robot")) return true;
  if (looksLikeCaptchaChallenge(text)) return true;
  if (text.includes('javascript is disabled')) return true;
  if (text.includes('enable javascript and then reload the page')) return true;
  if (text.includes('sign in to view')) return true;
  if (text.includes('log in to view')) return true;
  if (text.includes('authwall')) return true;
  if (text.includes('just a moment...') && text.includes('cloudflare')) return true;

  return false;
}

export function looksLikeCaptchaChallenge(text: string) {
  const hasCaptcha = text.includes('captcha') || text.includes('recaptcha');
  if (!hasCaptcha) return false;

  const cookiePanelContext =
    text.includes('gestion des cookies') ||
    text.includes('cookie consent') ||
    text.includes('services tiers') ||
    text.includes("ce service n'a déposé aucun cookie") ||
    text.includes('politique de confidentialité');

  const challengeContext =
    text.includes('captcha challenge') ||
    text.includes('captcha required') ||
    text.includes('captcha verification') ||
    text.includes('complete the security check') ||
    text.includes('solve the captcha') ||
    text.includes('verify you are human') ||
    text.includes("verify that you're not a robot") ||
    text.includes('unusual traffic') ||
    text.includes('automated requests');

  if (cookiePanelContext && !challengeContext) return false;
  return challengeContext;
}

export function isBlockedOrErrorJobPosting(jobPosting: Record<string, unknown>) {
  const title = String(jobPosting.title ?? '').trim().toLowerCase();
  const company = String(jobPosting.company ?? '').trim();
  const description = String(jobPosting.description ?? '').toLowerCase();

  if (title === '403 error') return true;
  if (title.includes('403 error') && !company) return true;
  if (description.includes('not a robot')) return true;
  if (description.includes('javascript is disabled')) return true;

  return false;
}

export function blockedScrapeMessage(url: string) {
  if (url.includes('welcometothejungle.com')) {
    return "Welcome to the Jungle bloque peut-être la récupération depuis le dashboard. Ouvre l'offre dans ton navigateur et sauvegarde-la via l'extension.";
  }

  if (url.includes('francetravail.fr')) {
    return "France Travail charge parfois l'employeur côté navigateur. Ouvre l'offre dans ton navigateur et sauvegarde-la via l'extension JobLog.";
  }

  if (url.includes('linkedin.com')) {
    return "LinkedIn bloque souvent les lectures serveur. Ouvre l'offre dans ton navigateur et sauvegarde-la via l'extension JobLog.";
  }

  return "Le site bloque la récupération automatique. Ouvre l'offre dans ton navigateur et sauvegarde-la via l'extension.";
}

export function unreadableUrlMessage(url: string) {
  if (url.includes('linkedin.com')) {
    return "LinkedIn est illisible automatiquement ou bloque la récupération serveur. L'extension reste le chemin le plus fiable.";
  }

  return "Impossible de lire cette URL automatiquement. Le site peut bloquer la récupération serveur, être indisponible, ou renvoyer une page que le service de lecture ne peut pas convertir.";
}
