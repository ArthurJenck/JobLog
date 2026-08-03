import { normalizeFrequencyDays } from '@joblog/shared';
import { getCollection } from './db.js';

interface NotificationSettingsDoc {
  userId: string;
  reminderDefaultDays?: number;
}

export async function getReminderDefaultDays(userId: string): Promise<number> {
  const col = await getCollection<NotificationSettingsDoc>('notification_settings');
  const settings = await col.findOne({ userId });
  return normalizeFrequencyDays(settings?.reminderDefaultDays);
}
