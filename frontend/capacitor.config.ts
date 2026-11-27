import type { CapacitorConfig } from "@capacitor/cli";

// Native shells (android/, ios/) load the production build from `dist`.
// The WebView origin is `https://localhost` on Android and `capacitor://localhost` on iOS.
// The API's CORS allow-list accepts both.
const config: CapacitorConfig = {
  android: {
    allowMixedContent: false,
  },
  appId: "pl.innovationhack.lab",
  appName: "Intelligent Laboratory",
  ios: {
    contentInset: "always",
  },
  server: {
    androidScheme: "https",
    iosScheme: "capacitor",
  },
  webDir: "dist",
};

export default config;
