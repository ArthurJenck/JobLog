import { parseHTML } from 'linkedom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectPageCapture, MAX_CAPTURE_BYTES } from './page-capture';

function installPage(html: string, url = 'https://jobs.example.com/offers/42?utm_source=test&token=secret#private') {
  const parsed = parseHTML(html);
  vi.stubGlobal('document', parsed.document);
  vi.stubGlobal('window', {
    location: {
      href: url,
      origin: new URL(url).origin,
    },
  });
  vi.stubGlobal('HTMLTextAreaElement', parsed.window.HTMLTextAreaElement);
  vi.stubGlobal('NodeFilter', { SHOW_COMMENT: 128 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page capture', () => {
  it('keeps useful job data while removing scripts, form values, hidden content and sensitive URLs', () => {
    installPage(`
      <!doctype html>
      <html>
        <head>
          <title>Senior Developer</title>
          <meta name="description" content="Build useful products">
          <meta property="og:title" content="Senior Developer">
          <link rel="canonical" href="https://jobs.example.com/offers/42?token=secret&utm_source=test#private">
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"JobPosting","title":"Senior Developer","hiringOrganization":{"name":"Example"}}
          </script>
          <script>window.secret = "private"</script>
          <style>.secret { display: block }</style>
        </head>
        <body>
          <!-- private comment -->
          <main class="job" data-testid="job-panel" onclick="steal()" style="color:red">
            <h1>Senior Developer</h1>
            <input value="arthur@example.com">
            <textarea>private draft</textarea>
            <div hidden>hidden token</div>
            <a href="https://example.com/apply?access_token=secret&campaign=summer#form">Apply</a>
            <iframe src="https://tracker.example.com"></iframe>
            <svg><text>heavy</text></svg>
          </main>
        </body>
      </html>
    `);

    const payload = collectPageCapture();

    expect(payload.url).toBe('https://jobs.example.com/offers/42?utm_source=test');
    expect(payload.canonicalUrl).toBe('https://jobs.example.com/offers/42?utm_source=test');
    expect(payload.metadata).toEqual({
      description: 'Build useful products',
      openGraph: { 'og:title': 'Senior Developer' },
    });
    expect(payload.jsonLd).toHaveLength(1);
    expect(payload.html).toContain('data-testid="job-panel"');
    expect(payload.html).toContain('class="job"');
    expect(payload.html).toContain('campaign=summer');
    expect(payload.html).not.toMatch(/arthur@example\.com|private draft|hidden token|access_token|secret|onclick|style=|iframe|svg|script/i);
  });

  it('captures only the preferred active panel when one is available', () => {
    installPage(`
      <html><head><title>Jobs</title></head><body>
        <section id="inactive"><h1>Old offer</h1></section>
        <section id="active"><h1>Selected offer</h1></section>
      </body></html>
    `);

    const payload = collectPageCapture({ preferredRootSelector: '#active' });

    expect(payload.html).toContain('Selected offer');
    expect(payload.html).not.toContain('Old offer');
  });

  it('bounds the complete serialized payload to 750 KiB', () => {
    installPage(`<html><head><title>Large</title></head><body><main>${'é'.repeat(900_000)}</main></body></html>`);

    const payload = collectPageCapture();
    const byteLength = new TextEncoder().encode(JSON.stringify(payload)).byteLength;

    expect(byteLength).toBeLessThanOrEqual(MAX_CAPTURE_BYTES);
    expect(payload.html.length).toBeGreaterThan(0);
  });
});
