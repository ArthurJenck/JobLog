export interface CaptureContext {
  sourceHint?: string;
  nativeJobId?: string;
  panelDetected?: boolean;
}

export interface ExtensionCapturePayload {
  version: 1;
  url: string;
  title: string;
  canonicalUrl: string | null;
  metadata: {
    description?: string;
    openGraph: Record<string, string>;
  };
  jsonLd: unknown[];
  html: string;
  captureContext?: CaptureContext;
}

export type ExtensionCaptureStatus = 'saved' | 'already_exists' | 'manual_required';

export interface ExtensionCaptureResponse {
  status: ExtensionCaptureStatus;
  applicationId?: string;
  handoffUrl?: string;
  message?: string;
  duplicate?: boolean;
}

export type CaptureMessageResponse =
  | { ok: true; result: ExtensionCaptureResponse }
  | { ok: false; code?: 'auth_required' | 'capture_failed'; error: string };

export interface AdminFixtureSession {
  id: string;
  acceptsUntil?: string;
}

export type AdminFixtureSessionResponse =
  | { ok: true; session: AdminFixtureSession | null }
  | { ok: false; error: string };

export type AdminFixtureCaptureResponse =
  | { ok: true; message?: string }
  | { ok: false; code?: 'auth_required' | 'capture_failed'; error: string };
