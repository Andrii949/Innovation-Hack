import { Capacitor, registerPlugin } from "@capacitor/core";

type PermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

type LocalNotificationsPluginShape = {
  checkPermissions: () => Promise<{ display: PermissionState }>;
  requestPermissions: () => Promise<{ display: PermissionState }>;
  createChannel: (channel: {
    id: string;
    name: string;
    description: string;
    importance: 0 | 1 | 2 | 3 | 4 | 5;
    visibility: 0 | 1;
    vibration: boolean;
    lights: boolean;
  }) => Promise<void>;
  schedule: (options: {
    notifications: Array<{
      id: number;
      title: string;
      body: string;
      isExactNotification: boolean;
      channelId?: string;
    }>;
  }) => Promise<unknown>;
};

const LocalNotifications = registerPlugin<LocalNotificationsPluginShape>("LocalNotifications");
const CHANNEL_ID = "lab-demo";
const SUMMARY_NOTIFICATION_ID = 900_000;
let allowed: boolean | null = null;
let channelReady = false;
let nextId = 1;

async function ensureAllowed(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("LocalNotifications")) {
    return false;
  }
  if (allowed !== null) {
    return allowed;
  }
  try {
    let status = await LocalNotifications.checkPermissions();
    if (status.display !== "granted") {
      status = await LocalNotifications.requestPermissions();
    }
    allowed = status.display === "granted";
  } catch {
    allowed = false;
  }
  return allowed;
}

async function ensureChannel(): Promise<string | undefined> {
  if (channelReady) {
    return CHANNEL_ID;
  }
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Prezentacja",
      description: "Sygnały wysyłane z konsoli prezentacji",
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    });
    channelReady = true;
    return CHANNEL_ID;
  } catch {
    return undefined;
  }
}

export function unreadSummaryCopy(unreadCount: number): { title: string; body: string } {
  if (unreadCount === 1) {
    return {
      title: "Masz 1 nieprzeczytane powiadomienie",
      body: "Otwórz dzwonek w aplikacji, aby sprawdzić szczegóły.",
    };
  }
  const rest = unreadCount % 10;
  const tens = unreadCount % 100;
  if (unreadCount < 5 && rest >= 2 && rest <= 4 && (tens < 12 || tens > 14)) {
    return {
      title: `Masz ${unreadCount} nieprzeczytane powiadomienia`,
      body: "W aplikacji czekają alerty wymagające Twojej uwagi.",
    };
  }
  return {
    title: `Masz dużo powiadomień (${unreadCount})`,
    body: "Sprawdź pilne terminy wzorcowań i przekroczenia w laboratorium.",
  };
}

export async function requestLocalNotificationPermission(): Promise<boolean> {
  return ensureAllowed();
}

/** Shows a system notification banner for the stage demo; no FCM involved. */
export async function notifyLocally(title: string, body: string): Promise<void> {
  if (!(await ensureAllowed())) {
    return;
  }
  const channelId = await ensureChannel();
  const id = nextId;
  nextId = nextId >= 899_999 ? 1 : nextId + 1;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          isExactNotification: false,
          ...(channelId === undefined ? {} : { channelId }),
        },
      ],
    });
  } catch {
    // Best effort: the in-app toast already showed the same signal.
  }
}

/** Sends or updates a single summary banner when unread notifications await in the app. */
export async function notifyUnreadSummary(unreadCount: number): Promise<void> {
  if (unreadCount <= 0 || !(await ensureAllowed())) {
    return;
  }
  const channelId = await ensureChannel();
  const { title, body } = unreadSummaryCopy(unreadCount);
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: SUMMARY_NOTIFICATION_ID,
          title,
          body,
          isExactNotification: false,
          ...(channelId === undefined ? {} : { channelId }),
        },
      ],
    });
  } catch {
    // Best effort: the header bell badge still reflects unread items.
  }
}
