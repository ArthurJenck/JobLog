export function getExtensionStoreUrl(): string | null {
  const isFirefox = /firefox/i.test(navigator.userAgent);
  const url = isFirefox
    ? import.meta.env.VITE_FIREFOX_EXTENSION_URL
    : import.meta.env.VITE_CHROME_EXTENSION_URL;
  return url || null;
}
