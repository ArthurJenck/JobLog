import { describe, expect, test } from 'vitest';
import { ObjectId } from 'mongodb';
import {
  applicationStatusFallbackRequired,
  getReminderCleanupDecision,
  mergeApplicationDocuments,
  mergeJobPostingDocuments,
} from './dedup-key-v2.js';

describe('mergeJobPostingDocuments', () => {
  test('prioritizes successful manual data and merges set-like fields', () => {
    const older = {
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      userId: 'user-1',
      url: 'https://example.com/jobs/42?utm_source=test',
      title: 'Scraped title',
      company: 'Acme',
      description: 'Scraped description',
      requirements: ['TypeScript', 'React'],
      keywords: ['frontend'],
      scrape_method: 'jina',
      scrape_status: 'succeeded',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-02T00:00:00Z'),
      scraped_at: new Date('2026-01-02T00:00:00Z'),
    };
    const manual = {
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      userId: 'user-1',
      url: 'https://example.com/jobs/42',
      title: 'Correct title',
      company: 'Acme',
      description: 'Correct description',
      description_source: 'manual',
      requirements: ['typescript', 'Accessibility'],
      keywords: ['a11y'],
      scrape_method: 'manual',
      scrape_status: 'succeeded',
      created_at: new Date('2026-01-03T00:00:00Z'),
      updated_at: new Date('2026-01-04T00:00:00Z'),
      scraped_at: new Date('2026-01-04T00:00:00Z'),
    };
    const merged = mergeJobPostingDocuments(
      [older, manual] as Parameters<typeof mergeJobPostingDocuments>[0],
    );
    expect(merged.title).toBe('Correct title');
    expect(merged.description).toBe('Correct description');
    expect(merged.requirements).toEqual(['typescript', 'Accessibility', 'React']);
    expect(merged.keywords).toEqual(['a11y', 'frontend']);
    expect(merged.created_at).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(merged.updated_at).toEqual(new Date('2026-01-04T00:00:00Z'));
  });

  test('keeps a field-level manual correction across multiple manual documents', () => {
    const newer = {
      _id: new ObjectId('507f1f77bcf86cd799439013'),
      userId: 'user-1',
      url: 'https://example.com/jobs/42',
      title: 'New title',
      company: 'Acme',
      description: 'New scraped description',
      manual_fields: ['title'],
      manually_repaired_at: new Date('2026-01-04T00:00:00Z'),
      scrape_status: 'succeeded',
      created_at: new Date('2026-01-02T00:00:00Z'),
      updated_at: new Date('2026-01-04T00:00:00Z'),
    };
    const older = {
      _id: new ObjectId('507f1f77bcf86cd799439014'),
      userId: 'user-1',
      url: 'https://example.com/jobs/42?ref=old',
      title: 'Old title',
      company: 'Acme',
      description: 'Corrected description',
      manual_fields: ['description'],
      manually_repaired_at: new Date('2026-01-03T00:00:00Z'),
      scrape_status: 'succeeded',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-03T00:00:00Z'),
    };

    const merged = mergeJobPostingDocuments(
      [newer, older] as Parameters<typeof mergeJobPostingDocuments>[0],
    );

    expect(merged.title).toBe('New title');
    expect(merged.description).toBe('Corrected description');
  });
});

describe('mergeApplicationDocuments', () => {
  test('keeps the newest mutable data and deduplicates chronological events', () => {
    const created = { type: 'created' as const, at: new Date('2026-01-01T00:00:00Z'), meta: null };
    const applied = { type: 'applied' as const, at: new Date('2026-01-02T00:00:00Z'), meta: null };
    const older = {
      _id: new ObjectId('507f1f77bcf86cd799439021'),
      userId: 'user-1',
      jobPostingId: 'old-1',
      status: 'applied' as const,
      appliedAt: new Date('2026-01-02T00:00:00Z'),
      cvId: 'cv-old',
      notes: 'First note',
      events: [created, applied],
      reminder: { enabled: true, sentCount: 1, at: null },
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-03T00:00:00Z'),
    };
    const newer = {
      _id: new ObjectId('507f1f77bcf86cd799439022'),
      userId: 'user-1',
      jobPostingId: 'old-2',
      status: 'interview' as const,
      appliedAt: new Date('2026-01-03T00:00:00Z'),
      cvId: 'cv-new',
      notes: 'Second note',
      events: [
        created,
        applied,
        { type: 'interview_scheduled' as const, at: new Date('2026-01-04T00:00:00Z'), meta: null },
      ],
      reminder: { enabled: false, sentCount: 3, at: null },
      created_at: new Date('2026-01-02T00:00:00Z'),
      updated_at: new Date('2026-01-05T00:00:00Z'),
    };
    const merged = mergeApplicationDocuments(
      [older, newer] as Parameters<typeof mergeApplicationDocuments>[0],
      'survivor',
    );
    expect(merged.jobPostingId).toBe('survivor');
    expect(merged.status).toBe('interview');
    expect(merged.events).toHaveLength(3);
    expect(merged.cvId).toBe('cv-new');
    expect(merged.notes).toBe('First note\n\n---\n\nSecond note');
    expect(merged.reminder).toMatchObject({ enabled: false, sentCount: 3 });
    expect(merged.appliedAt).toEqual(new Date('2026-01-02T00:00:00Z'));
  });

  test('preserves and reports the newest status when events replay differently', () => {
    const documents = [{
      _id: new ObjectId('507f1f77bcf86cd799439023'),
      userId: 'user-1',
      jobPostingId: 'old-1',
      status: 'interview' as const,
      events: [
        { type: 'created' as const, at: new Date('2026-01-01T00:00:00Z'), meta: null },
        { type: 'rejected' as const, at: new Date('2026-01-02T00:00:00Z'), meta: null },
      ],
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-03T00:00:00Z'),
    }] as Parameters<typeof mergeApplicationDocuments>[0];

    expect(applicationStatusFallbackRequired(documents)).toBe(true);
    expect(mergeApplicationDocuments(documents, 'survivor').status).toBe('interview');
  });
});

describe('getReminderCleanupDecision', () => {
  test('initializes legacy enabled and clears reminders on terminal applications', () => {
    expect(getReminderCleanupDecision({
      status: 'accepted',
      reminder: {
        at: new Date('2026-01-10T00:00:00Z'),
        snoozedUntil: new Date('2026-01-08T00:00:00Z'),
        frequencyDays: 7,
      },
      events: [],
    })).toMatchObject({
      missingEnabled: true,
      terminal: true,
      updates: {
        'reminder.enabled': true,
        'reminder.at': null,
        'reminder.snoozedUntil': null,
      },
    });
  });

  test('clears an automatic reminder scheduled within the normal window after a follow-up', () => {
    expect(getReminderCleanupDecision({
      status: 'applied',
      reminder: {
        enabled: true,
        at: new Date('2026-01-08T00:00:00Z'),
        snoozedUntil: null,
        frequencyDays: 7,
      },
      events: [{ type: 'followup_sent', at: new Date('2026-01-02T00:00:00Z'), meta: null }],
    })).toMatchObject({
      obsolete: true,
      updates: {
        'reminder.at': null,
        'reminder.snoozedUntil': null,
      },
    });
  });

  test('preserves a reminder clearly scheduled later by the user', () => {
    expect(getReminderCleanupDecision({
      status: 'applied',
      reminder: {
        enabled: true,
        at: new Date('2026-02-01T00:00:00Z'),
        snoozedUntil: null,
        frequencyDays: 7,
      },
      events: [{ type: 'response_received', at: new Date('2026-01-02T00:00:00Z'), meta: null }],
    })).toMatchObject({ obsolete: false, ambiguous: false, updates: {} });
  });

  test('preserves and reports invalid legacy dates as ambiguous', () => {
    expect(getReminderCleanupDecision({
      status: 'applied',
      reminder: {
        enabled: true,
        at: 'invalid-date',
        frequencyDays: 7,
      },
      events: [{ type: 'followup_sent', at: new Date('2026-01-02T00:00:00Z'), meta: null }],
    })).toMatchObject({ obsolete: false, ambiguous: true, updates: {} });
  });
});
