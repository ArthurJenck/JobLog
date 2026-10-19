import { parseHTML } from 'linkedom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { injectCaptureButton } from './content-script';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('capture button errors', () => {
  it('keeps the server error visible after a failed save', async () => {
    vi.useFakeTimers();
    const parsed = parseHTML('<html><head><title>Developer</title></head><body><main><h1>Developer</h1></main></body></html>');
    const createElement = parsed.document.createElement.bind(parsed.document);
    let button: HTMLButtonElement | undefined;
    vi.spyOn(parsed.document, 'createElement').mockImplementation((tagName) => {
      const element = createElement(tagName);
      if (tagName === 'button') button = element as HTMLButtonElement;
      return element;
    });

    vi.stubGlobal('document', parsed.document);
    vi.stubGlobal('window', {
      location: {
        href: 'https://www.linkedin.com/jobs/view/123456/',
        origin: 'https://www.linkedin.com',
      },
      setInterval,
      setTimeout,
    });
    vi.stubGlobal('HTMLTextAreaElement', parsed.window.HTMLTextAreaElement);
    vi.stubGlobal('NodeFilter', { SHOW_COMMENT: 128 });
    vi.stubGlobal('MutationObserver', class {
      observe() {}
    });
    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: vi.fn()
          .mockResolvedValueOnce({ authenticated: true })
          .mockResolvedValueOnce({ ok: false, error: 'Internal server error' }),
      },
      storage: { local: { get: vi.fn(async () => ({ capture_consent_accepted: true })) } },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    injectCaptureButton({ sourceHint: 'linkedin' });
    button?.click();
    await vi.waitFor(() => expect(button?.textContent).toBe('Internal server error'));
    vi.advanceTimersByTime(2400);

    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toBe('Internal server error');
  });
});
