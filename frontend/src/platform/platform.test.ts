import { describe, expect, it } from "bun:test";

import { extractNdefUri, resolveNfcRecords } from "./nfc";
import { enablePushNotifications } from "./push";
import type { FirebaseMessagingBridge } from "./push";
import { resolveScannedPayload } from "./scan";
import { normalizeServerUrl, parseServerConfigQr } from "./server";
import { createTokenStore } from "./tokenStore";

describe("server setup helpers", () => {
  it("normalizes server addresses and parses config QR codes", () => {
    expect(normalizeServerUrl("lab.example.com")).toBe("https://lab.example.com");
    expect(normalizeServerUrl("https://lab.example.com/")).toBe("https://lab.example.com");
    expect(normalizeServerUrl("http://localhost:8000/")).toBe("http://localhost:8000");
    expect(normalizeServerUrl("https://lab.example.com?x=1")).toBeNull();

    expect(parseServerConfigQr("https://lab.warta.pl/")).toBe("https://lab.warta.pl");
    expect(parseServerConfigQr('{"serverUrl":"https://lab.warta.pl:8443"}')).toBe(
      "https://lab.warta.pl:8443",
    );
    expect(parseServerConfigQr("https://lab.warta.pl/e/CWA000121A")).toBeNull();
    expect(parseServerConfigQr("{bad json")).toBeNull();
  });
});

describe("tokenStore", () => {
  it("stores, reads, and clears tokens through the provided adapter", async () => {
    let stored: string | null = null;
    const store = createTokenStore({
      get: () => Promise.resolve(stored),
      set: (token: string) => {
        stored = token;
        return Promise.resolve();
      },
      clear: () => {
        stored = null;
        return Promise.resolve();
      },
    });

    expect(await store.getToken()).toBeNull();
    await store.setToken("tok-123");
    expect(await store.getToken()).toBe("tok-123");
    await store.clearToken();
    expect(await store.getToken()).toBeNull();
  });
});

describe("NFC NDEF and QR resolution", () => {
  it("decodes binary NDEF URI prefix records and resolves equipment links", () => {
    const suffix = Array.from(new TextEncoder().encode("lab.example.com/e/CWA000121A"));
    const records = [{ tnf: 1, type: [0x55], payload: [0x04, ...suffix] }];

    expect(extractNdefUri(records)).toBe("https://lab.example.com/e/CWA000121A");
    expect(resolveNfcRecords(records)).toEqual({
      kind: "equipment",
      publicId: "CWA000121A",
      rawUrl: "https://lab.example.com/e/CWA000121A",
    });
  });

  it("ignores non-URI records and returns Polish messages on invalid QR/NFC codes", () => {
    const textBytes = Array.from(new TextEncoder().encode("\x02plhello"));
    expect(extractNdefUri([{ tnf: 1, type: [0x54], payload: textBytes }])).toBeNull();

    expect(resolveNfcRecords([{ recordType: "url", url: "https://evil.example/other" }])).toEqual({
      kind: "invalid_tag",
      message: "To nie jest tag urządzenia",
    });

    expect(resolveScannedPayload("121/A", "qr")).toEqual({
      status: "invalid_code",
      message: "To nie jest kod urządzenia",
    });
    expect(resolveScannedPayload("https://example.com/e/K7Q2M9XH4D", "qr")).toEqual({
      status: "ok",
      publicId: "K7Q2M9XH4D",
      source: "qr",
    });
  });
});

describe("push notifications", () => {
  it("registers device token and attaches foreground listener on permission grant", async () => {
    const registered: Array<{ platform: string; token: string }> = [];
    let foregroundCalls = 0;
    const listeners: Array<() => void> = [];

    const bridge: FirebaseMessagingBridge = {
      requestPermissions: () => Promise.resolve({ receive: "granted" }),
      getToken: () => Promise.resolve({ token: "fcm-token-abc" }),
      addListener: (_eventName, cb) => {
        listeners.push(cb);
        return Promise.resolve({ remove: () => Promise.resolve() });
      },
    };

    const result = await enablePushNotifications(
      (payload) => {
        registered.push(payload);
        return Promise.resolve();
      },
      () => {
        foregroundCalls += 1;
      },
      bridge,
    );

    expect(result).toEqual({ status: "registered", token: "fcm-token-abc", platform: "web" });
    expect(registered).toEqual([{ platform: "web", token: "fcm-token-abc" }]);
    for (const cb of listeners) {
      cb();
    }
    expect(foregroundCalls).toBe(1);
  });

  it("returns denied when user rejects push permission", async () => {
    const result = await enablePushNotifications(() => Promise.resolve(), undefined, {
      requestPermissions: () => Promise.resolve({ receive: "denied" }),
      getToken: () => Promise.resolve({ token: "unused" }),
    });
    expect(result).toEqual({ status: "denied" });
  });

  it("returns unavailable when no native bridge is present", async () => {
    const result = await enablePushNotifications(() => Promise.resolve());
    expect(result).toEqual({ status: "unavailable" });
  });
});
