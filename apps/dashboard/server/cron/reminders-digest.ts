import { normalizeFrequencyDays } from '@joblog/shared';
import type { ReminderDigestItem } from '../../lib/email.js';

export interface DueApplication {
  applicationId: string;
  userId: string;
  jobPostingId: string;
  frequencyDays?: number;
}

export interface ReminderUser {
  email?: string;
}

export interface ReminderJobPosting {
  title?: string;
  company?: string;
}

export interface ReminderNotificationSettings {
  email?: boolean;
  push?: boolean;
  vapidSubscription?: unknown;
}

export interface ReminderGroup {
  userId: string;
  email?: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  vapidSubscription?: unknown;
  items: (ReminderDigestItem & { applicationId: string; frequencyDays: number })[];
}

export interface GroupedReminders {
  groups: ReminderGroup[];
  skipped: string[];
}

export function groupDueReminders({
  due,
  users,
  jobPostings,
  notificationSettings,
}: {
  due: DueApplication[];
  users: Map<string, ReminderUser>;
  jobPostings: Map<string, ReminderJobPosting>;
  notificationSettings: Map<string, ReminderNotificationSettings>;
}): GroupedReminders {
  const groups = new Map<string, ReminderGroup>();
  const skipped: string[] = [];

  for (const app of due) {
    const user = users.get(app.userId);
    const jp = jobPostings.get(app.jobPostingId);

    if (!user || !jp) {
      skipped.push(`${app.applicationId}: missing ${!user ? 'user' : 'job posting'}`);
      continue;
    }

    let group = groups.get(app.userId);
    if (!group) {
      const settings = notificationSettings.get(app.userId);
      group = {
        userId: app.userId,
        email: user.email,
        emailEnabled: settings?.email !== false,
        pushEnabled: settings?.push === true,
        vapidSubscription: settings?.vapidSubscription,
        items: [],
      };
      groups.set(app.userId, group);
    }

    group.items.push({
      applicationId: app.applicationId,
      jobTitle: String(jp.title ?? ''),
      company: String(jp.company ?? ''),
      frequencyDays: normalizeFrequencyDays(app.frequencyDays),
    });
  }

  return { groups: [...groups.values()], skipped };
}

export function buildPushPayload(group: ReminderGroup, url: string) {
  if (group.items.length === 1) {
    const [item] = group.items;
    return {
      title: `Relance — ${item.company}`,
      body: `N'oublie pas de relancer pour "${item.jobTitle}"`,
      url,
    };
  }

  return {
    title: `${group.items.length} relances à faire`,
    body: group.items.map((item) => item.company).join(', '),
    url,
  };
}
