import { existsSync } from "node:fs";

import type { CapacitorConfig } from "@capacitor/cli";

// Firebase plugins abort the process when no Firebase app is configured, so each platform
// only bundles them after its own project file is dropped in (both gitignored, see README).
const pluginsWithoutFirebase = [
  "@capacitor/barcode-scanner",
  "@capacitor/camera",
  "@capacitor/local-notifications",
  "@capgo/capacitor-nfc",
  "capacitor-secure-storage-plugin",
];
const androidFirebase = existsSync("android/app/google-services.json");
const iosFirebase = existsSync("ios/App/App/GoogleService-Info.plist");

// Native shells (android/, ios/) load the production build from `dist`.
// The WebView origin is `https://localhost` on Android and `capacitor://localhost` on iOS.
// The API's CORS allow-list accepts both.
const config: CapacitorConfig = {
  android: {
    allowMixedContent: false,
    ...(androidFirebase ? {} : { includePlugins: pluginsWithoutFirebase }),
  },
  appId: "pl.innovationhack.lab",
  appName: "Intelligent Laboratory",
  ios: {
    contentInset: "always",
    ...(iosFirebase ? {} : { includePlugins: pluginsWithoutFirebase }),
  },
  server: {
    androidScheme: "https",
    iosScheme: "capacitor",
  },
  webDir: "dist",
};

export default config;
