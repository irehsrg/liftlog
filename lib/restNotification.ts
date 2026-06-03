// Schedules the "Rest complete — Go!" notification to fire at a wall-clock time
// via the service worker's Notification Triggers API. Unlike `new Notification()`
// fired from page JS, a TimestampTrigger notification is delivered by the OS even
// when the PWA is backgrounded or fully closed — the page's timers don't have to
// be running. Falls back gracefully (returns false) where the API is unavailable
// (e.g. iOS Safari), so the caller can keep its in-page notification as a backup.

const TAG = "liftlog-rest";

export function supportsScheduledNotifications(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "showTrigger" in Notification.prototype &&
    "TimestampTrigger" in window
  );
}

export async function scheduleRestNotification(endTime: number): Promise<boolean> {
  if (!supportsScheduledNotifications()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await cancelRestNotification(reg);
    await reg.showNotification("Rest complete — Go!", {
      body: "Time for your next set",
      icon: "/logo.png",
      tag: TAG,
      // Notification Triggers API — experimental, hence the cast.
      showTrigger: new (window as unknown as {
        TimestampTrigger: new (t: number) => unknown;
      }).TimestampTrigger(endTime),
    } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}

export async function cancelRestNotification(
  reg?: ServiceWorkerRegistration
): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const r = reg ?? (await navigator.serviceWorker.ready);
    // includeTriggered surfaces pending (scheduled-but-not-yet-shown) notifications.
    const notes = await r.getNotifications({
      tag: TAG,
      includeTriggered: true,
    } as GetNotificationOptions);
    notes.forEach((n) => n.close());
  } catch {
    // best-effort
  }
}
