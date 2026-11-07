import { getSupabaseClient } from '../lib/supabase';
import { getServiceAvailability } from './service-availability';

/** Trigger delivery of the server-owned outbox without making a save depend on SMTP. */
export async function pingNotifyDrain(): Promise<void> {
  try {
    // Read current availability: SMTP can be disabled while a notification is queued.
    if (!(await getServiceAvailability({ force: true })).email) return;
    const client = getSupabaseClient();
    if (!client) return;
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/crm/notify-drain', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // The outbox retains the notification for another delivery attempt.
  }
}
