import { describe, expect, it } from 'vitest';
import { deriveStatusFromEvents, resolveStatusOnEvent } from './constants.js';

describe('resolveStatusOnEvent', () => {
  it('advances the pipeline when the event moves it forward', () => {
    expect(resolveStatusOnEvent('saved', 'applied')).toBe('applied');
    expect(resolveStatusOnEvent('applied', 'interview_scheduled')).toBe('interview');
  });

  it('ignores events that would move the pipeline backward', () => {
    expect(resolveStatusOnEvent('interview', 'applied')).toBeNull();
    expect(resolveStatusOnEvent('offer', 'interview_scheduled')).toBeNull();
  });

  it('ignores events with no auto-status mapping', () => {
    expect(resolveStatusOnEvent('saved', 'custom')).toBeNull();
    expect(resolveStatusOnEvent('saved', 'created')).toBeNull();
  });

  it('forces terminal statuses regardless of pipeline order', () => {
    expect(resolveStatusOnEvent('offer', 'rejected')).toBe('rejected');
    expect(resolveStatusOnEvent('saved', 'ghosted')).toBe('ghosted');
    expect(resolveStatusOnEvent('interview', 'cancelled')).toBe('cancelled');
  });

  it('returns null when a forced terminal event repeats the current status', () => {
    expect(resolveStatusOnEvent('rejected', 'rejected')).toBeNull();
  });
});

describe('deriveStatusFromEvents', () => {
  it('defaults to saved when there are no relevant events', () => {
    expect(deriveStatusFromEvents([])).toBe('saved');
    expect(deriveStatusFromEvents([{ type: 'created', at: '2024-01-01' }])).toBe('saved');
  });

  it('picks the furthest pipeline status reached', () => {
    const events = [
      { type: 'applied' as const, at: '2024-01-01' },
      { type: 'interview_scheduled' as const, at: '2024-01-02' },
    ];
    expect(deriveStatusFromEvents(events)).toBe('interview');
  });

  it('is not confused by out-of-order pipeline events', () => {
    const events = [
      { type: 'interview_scheduled' as const, at: '2024-01-05' },
      { type: 'applied' as const, at: '2024-01-01' },
    ];
    expect(deriveStatusFromEvents(events)).toBe('interview');
  });

  it('lets a terminal event override the pipeline status', () => {
    const events = [
      { type: 'applied' as const, at: '2024-01-01' },
      { type: 'interview_scheduled' as const, at: '2024-01-02' },
      { type: 'rejected' as const, at: '2024-01-03' },
    ];
    expect(deriveStatusFromEvents(events)).toBe('rejected');
  });

  it('uses the most recent terminal event when several are present', () => {
    const events = [
      { type: 'rejected' as const, at: '2024-01-03' },
      { type: 'ghosted' as const, at: '2024-01-10' },
    ];
    expect(deriveStatusFromEvents(events)).toBe('ghosted');
  });
});
