import { Capacitor, registerPlugin } from "@capacitor/core";

import { isNativeApp } from "@/platform/server";

export type PushPlatform = "android" | "ios" | "web";

export type PushRegistrationResult =
  | { status: "registered"; token: string; platform: PushPlatform }
  | { status: "denied" }
  | { status: "unavailable" };

export type FirebaseMessagingBridge = {
  requestPermissions: () => Promise<{ receive: string }>;
  getToken: () => Promise<{ token: string }>;
  addListener?: (
    eventName: "notificationReceived",
    cb: () => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

const FirebaseMessaging = registerPlugin<FirebaseMessagingBridge>("FirebaseMessaging");

function resolvePlatform(): PushPlatform {
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") {
    return platform;
  }
  return "web";
}

export async function enablePushNotifications(
  registerDevice: (payload: { platform: PushPlatform; token: string }) => Promise<void>,
  onForegroundNotification?: () => void,
  pluginOverride?: FirebaseMessagingBridge,
): Promise<PushRegistrationResult> {
  const bridge =
    pluginOverride ??
    (isNativeApp() && Capacitor.isPluginAvailable("FirebaseMessaging") ? FirebaseMessaging : null);

  if (bridge === null) {
    return { status: "unavailable" };
  }

  const permission = await bridge.requestPermissions();
  if (permission.receive !== "granted") {
    return { status: "denied" };
  }

  const tokenResult = await bridge.getToken();
  const token = tokenResult.token.trim();
  if (token === "") {
    return { status: "unavailable" };
  }

  const platform = resolvePlatform();
  await registerDevice({ platform, token });

  if (onForegroundNotification !== undefined && bridge.addListener !== undefined) {
    await bridge.addListener("notificationReceived", onForegroundNotification);
  }

  return { status: "registered", token, platform };
}
