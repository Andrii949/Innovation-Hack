import { Capacitor, registerPlugin } from "@capacitor/core";

import { getApiBaseUrl, isNativeApp } from "@/platform/server";

export type PushPlatform = "android" | "ios" | "web";

export type DeviceRegistrationPayload = {
  platform: PushPlatform;
  fid: string;
};

export type PushRegistrationResult =
  | { status: "registered"; fid: string; platform: PushPlatform }
  | { status: "denied" }
  | { status: "unavailable" };

export type FirebaseInstallationsBridge = {
  getId: () => Promise<{ id: string }>;
};

export type FirebaseMessagingBridge = {
  requestPermissions: () => Promise<{ receive: string }>;
  getToken?: () => Promise<{ token: string }>;
  addListener?: (
    eventName: "notificationReceived",
    cb: () => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

const FirebaseMessaging = registerPlugin<FirebaseMessagingBridge>("FirebaseMessaging");
const FirebaseInstallations = registerPlugin<FirebaseInstallationsBridge>("FirebaseInstallations");

const MAX_FID_LENGTH = 512;

function resolvePlatform(): PushPlatform {
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") {
    return platform;
  }
  return "web";
}

export async function enablePushNotifications(
  registerDevice: (payload: DeviceRegistrationPayload) => Promise<void>,
  onForegroundNotification?: () => void,
  overrides?: {
    messaging?: FirebaseMessagingBridge;
    installations?: FirebaseInstallationsBridge;
  },
): Promise<PushRegistrationResult> {
  const messaging =
    overrides?.messaging ??
    (isNativeApp() && Capacitor.isPluginAvailable("FirebaseMessaging") ? FirebaseMessaging : null);

  if (messaging === null) {
    return { status: "unavailable" };
  }

  const permission = await messaging.requestPermissions();
  if (permission.receive !== "granted") {
    return { status: "denied" };
  }

  const installations =
    overrides?.installations ??
    (isNativeApp() && Capacitor.isPluginAvailable("FirebaseInstallations")
      ? FirebaseInstallations
      : null);

  let fid = "";
  if (installations !== null) {
    const idResult = await installations.getId();
    fid = idResult.id.trim();
  } else if (messaging.getToken !== undefined) {
    const tokenResult = await messaging.getToken();
    fid = tokenResult.token.trim();
  }

  if (fid === "" || fid.length > MAX_FID_LENGTH) {
    return { status: "unavailable" };
  }

  const platform = resolvePlatform();
  await registerDevice({ platform, fid });

  if (onForegroundNotification !== undefined && messaging.addListener !== undefined) {
    await messaging.addListener("notificationReceived", onForegroundNotification);
  }

  return { status: "registered", fid, platform };
}

export async function registerPushDeviceWithApi(
  payload: DeviceRegistrationPayload,
  bearerToken: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (bearerToken !== null && bearerToken !== "") {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  try {
    const response = await fetchImpl(`${baseUrl}/api/devices`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return response.status === 204 || response.ok;
  } catch {
    return false;
  }
}
