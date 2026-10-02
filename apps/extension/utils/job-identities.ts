export function getLinkedInJobIdFromUrl(rawUrl: string) {
  const url = parseUrl(rawUrl);
  if (!url) return null;
  return url.pathname.match(/\/jobs\/view\/(\d+)/i)?.[1]
    ?? url.searchParams.get('currentJobId');
}

export function getIndeedJobKeyFromUrl(rawUrl: string) {
  const url = parseUrl(rawUrl);
  if (!url) return null;
  return url.searchParams.get('jk') ?? url.searchParams.get('vjk');
}

export function getGlassdoorListingIdFromUrl(rawUrl: string) {
  const url = parseUrl(rawUrl);
  if (!url) return null;
  return url.searchParams.get('jl') ?? url.searchParams.get('jobListingId');
}

function parseUrl(rawUrl: string) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}
