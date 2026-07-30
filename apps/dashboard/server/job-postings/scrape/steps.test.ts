import { describe, expect, test } from 'vitest';
import {
  buildInitialSteps,
  getScrapeStatus,
  isReadyJobPosting,
  markCurrentStepFailed,
  markStep,
} from './steps.js';

describe('buildInitialSteps', () => {
  test('created is succeeded, rest pending', () => {
    const now = new Date('2026-07-30T00:00:00Z');
    const steps = buildInitialSteps(now);
    expect(steps).toHaveLength(5);
    const created = steps[0];
    expect(created.key).toBe('created');
    expect(created.status).toBe('succeeded');
    expect(created.at).toBe(now);
    for (const step of steps.slice(1)) {
      expect(step.status).toBe('pending');
      expect(step.at).toBeNull();
    }
  });
});

describe('markStep', () => {
  test('updates only the matching key', () => {
    const now = new Date();
    const steps = markStep(buildInitialSteps(now), 'fetch', 'processing', now);
    expect(steps.find((s) => s.key === 'fetch')?.status).toBe('processing');
    expect(steps.find((s) => s.key === 'extract')?.status).toBe('pending');
  });
});

describe('markCurrentStepFailed', () => {
  test('fails the first processing step', () => {
    const now = new Date();
    const steps = markStep(buildInitialSteps(now), 'fetch', 'processing', now);
    const failed = markCurrentStepFailed(steps, 'boom');
    const fetch = failed.find((s) => s.key === 'fetch');
    expect(fetch?.status).toBe('failed');
    expect(fetch?.message).toBe('boom');
  });
  test('falls back to first pending when none processing', () => {
    const failed = markCurrentStepFailed(buildInitialSteps(new Date()), 'boom');
    expect(failed.find((s) => s.key === 'fetch')?.status).toBe('failed');
  });
});

describe('getScrapeStatus', () => {
  test('returns explicit status', () => {
    expect(getScrapeStatus({ scrape_status: 'queued' })).toBe('queued');
    expect(getScrapeStatus({ scrape_status: 'failed' })).toBe('failed');
  });
  test('legacy benign posting is succeeded', () => {
    expect(getScrapeStatus({ title: 'Dev', company: 'Acme', description: 'ok' })).toBe('succeeded');
  });
  test('legacy blocked posting is failed', () => {
    expect(getScrapeStatus({ title: '403 error' })).toBe('failed');
  });
});

describe('isReadyJobPosting', () => {
  test('succeeded status is ready', () => {
    expect(isReadyJobPosting({ scrape_status: 'succeeded' })).toBe(true);
  });
  test('legacy blocked posting is not ready', () => {
    expect(isReadyJobPosting({ title: '403 error' })).toBe(false);
  });
});
