import { describe, expect, it } from "bun:test";

import {
  encodeNdefUriRecord,
  extractNdefUri,
  resolveNfcRecords,
  writeEquipmentNfcTag,
} from "./nfc";
import {
  enablePushNotifications,
  type FirebaseInstallationsBridge,
  type FirebaseMessagingBridge,
  registerPushDeviceWithApi,
} from "./push";
import { resolveScannedPayload, scanEquipment } from "./scan";
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

describe("NFC NDEF encoding, writing, and QR resolution", () => {
  it("round-trips NDEF URI prefix encoding and decoding across URI schemes", () => {
    const uris = [
      { uri: "https://lab.warta.pl/e/CWA000121A", prefixCode: 4 },
      { uri: "https://www.warta.pl/e/CWA000121A", prefixCode: 2 },
      { uri: "http://localhost:8000/e/CWA000121A", prefixCode: 3 },
      { uri: "capacitor://localhost/e/CWA000121A", prefixCode: 0 },
    ];

    for (const item of uris) {
      const record = encodeNdefUriRecord(item.uri);
      expect(record.tnf).toBe(1);
      expect(record.type).toEqual([0x55]);
      expect(record.payload[0]).toBe(item.prefixCode);
      expect(extractNdefUri([record])).toBe(item.uri);
    }
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

  it("writes equipment NDEF tags and handles validation, cancellation, and failures", async () => {
    const captured: { url: string | null; payload: number[] | null } = {
      url: null,
      payload: null,
    };

    const ok = await writeEquipmentNfcTag("https://lab.warta.pl/", "CWA000121A", {
      writerOverride: (url, record) => {
        captured.url = url;
        captured.payload = record.payload;
        return Promise.resolve();
      },
    });
    expect(ok).toEqual({ kind: "written", url: "https://lab.warta.pl/e/CWA000121A" });
    expect(captured.url).toBe("https://lab.warta.pl/e/CWA000121A");
    expect(captured.payload?.[0]).toBe(4);

    let calledOnInvalid = false;
    const badId = await writeEquipmentNfcTag("https://lab.warta.pl", "bad-id", {
      writerOverride: () => {
        calledOnInvalid = true;
        return Promise.resolve();
      },
    });
    expect(badId).toEqual({ kind: "invalid_id" });
    expect(calledOnInvalid).toBe(false);

    const badBase = await writeEquipmentNfcTag("not a url", "CWA000121A");
    expect(badBase).toEqual({ kind: "invalid_id" });

    const aborted = new AbortController();
    aborted.abort();
    expect(
      await writeEquipmentNfcTag("https://lab.warta.pl", "CWA000121A", { signal: aborted.signal }),
    ).toEqual({
      kind: "cancelled",
    });

    const failed = await writeEquipmentNfcTag("https://lab.warta.pl", "CWA000121A", {
      writerOverride: () => Promise.reject(new Error("NFC I/O error")),
    });
    expect(failed).toEqual({ kind: "error", message: "Nie udało się zapisać tagu NFC" });

    expect(await writeEquipmentNfcTag("https://lab.warta.pl", "CWA000121A")).toEqual({
      kind: "unavailable",
    });
  });

  it("prefers NFC by default, falls back to QR when NFC is unavailable, and respects preferNfc=false", async () => {
    let qrCalled = false;
    const nfcFirst = await scanEquipment(undefined, {
      nfcAvailable: true,
      readNfc: () =>
        Promise.resolve({
          kind: "equipment",
          publicId: "CWA000121A",
          rawUrl: "https://lab.warta.pl/e/CWA000121A",
        }),
      canQr: true,
      readQr: () => {
        qrCalled = true;
        return Promise.resolve("https://lab.warta.pl/e/CWA000122A");
      },
    });
    expect(nfcFirst).toEqual({ status: "ok", publicId: "CWA000121A", source: "nfc" });
    expect(qrCalled).toBe(false);

    const fallback = await scanEquipment(undefined, {
      nfcAvailable: true,
      readNfc: () => Promise.resolve({ kind: "unavailable" }),
      canQr: true,
      readQr: () => Promise.resolve("https://lab.warta.pl/e/CWA000122A"),
    });
    expect(fallback).toEqual({ status: "ok", publicId: "CWA000122A", source: "qr" });

    let nfcCalledWhenDisabled = false;
    const qrOnly = await scanEquipment(
      { preferNfc: false },
      {
        nfcAvailable: true,
        readNfc: () => {
          nfcCalledWhenDisabled = true;
          return Promise.resolve({ kind: "cancelled" });
        },
        canQr: true,
        readQr: () => Promise.resolve("not-an-equipment-qr"),
      },
    );
    expect(nfcCalledWhenDisabled).toBe(false);
    expect(qrOnly).toEqual({ status: "invalid_code", message: "To nie jest kod urządzenia" });

    const badNfc = await scanEquipment(undefined, {
      nfcAvailable: true,
      readNfc: () =>
        Promise.resolve({ kind: "invalid_tag", message: "To nie jest tag urządzenia" }),
      canQr: true,
    });
    expect(badNfc).toEqual({ status: "invalid_code", message: "To nie jest tag urządzenia" });
  });
});

describe("push notifications", () => {
  it("registers Firebase Installation ID (fid) from installations bridge and attaches foreground listener", async () => {
    const registered: Array<{ platform: string; fid: string }> = [];
    let foregroundCalls = 0;
    const listeners: Array<() => void> = [];

    const messaging: FirebaseMessagingBridge = {
      requestPermissions: () => Promise.resolve({ receive: "granted" }),
      getToken: () => Promise.resolve({ token: "legacy-fcm-token" }),
      addListener: (_eventName, cb) => {
        listeners.push(cb);
        return Promise.resolve({ remove: () => Promise.resolve() });
      },
    };
    const installations: FirebaseInstallationsBridge = {
      getId: () => Promise.resolve({ id: "fid-primary-001" }),
    };

    const result = await enablePushNotifications(
      (payload) => {
        registered.push(payload);
        return Promise.resolve();
      },
      () => {
        foregroundCalls += 1;
      },
      { messaging, installations },
    );

    expect(result).toEqual({ status: "registered", fid: "fid-primary-001", platform: "web" });
    expect(registered).toEqual([{ platform: "web", fid: "fid-primary-001" }]);
    for (const cb of listeners) {
      cb();
    }
    expect(foregroundCalls).toBe(1);
  });

  it("falls back to getToken when installations bridge is omitted and validates fid length", async () => {
    const registered: Array<{ platform: string; fid: string }> = [];
    const fallback = await enablePushNotifications(
      (payload) => {
        registered.push(payload);
        return Promise.resolve();
      },
      undefined,
      {
        messaging: {
          requestPermissions: () => Promise.resolve({ receive: "granted" }),
          getToken: () => Promise.resolve({ token: "fid-fallback-789" }),
        },
      },
    );
    expect(fallback).toEqual({ status: "registered", fid: "fid-fallback-789", platform: "web" });
    expect(registered).toEqual([{ platform: "web", fid: "fid-fallback-789" }]);

    const emptyFid = await enablePushNotifications(() => Promise.resolve(), undefined, {
      messaging: { requestPermissions: () => Promise.resolve({ receive: "granted" }) },
      installations: { getId: () => Promise.resolve({ id: "   " }) },
    });
    expect(emptyFid).toEqual({ status: "unavailable" });

    const oversizedFid = await enablePushNotifications(() => Promise.resolve(), undefined, {
      messaging: { requestPermissions: () => Promise.resolve({ receive: "granted" }) },
      installations: { getId: () => Promise.resolve({ id: "x".repeat(513) }) },
    });
    expect(oversizedFid).toEqual({ status: "unavailable" });
  });

  it("returns denied on rejected permission and unavailable without native bridge", async () => {
    const denied = await enablePushNotifications(() => Promise.resolve(), undefined, {
      messaging: {
        requestPermissions: () => Promise.resolve({ receive: "denied" }),
      },
    });
    expect(denied).toEqual({ status: "denied" });

    expect(await enablePushNotifications(() => Promise.resolve())).toEqual({
      status: "unavailable",
    });
  });

  it("posts fid registration payload to /api/devices with bearer header", async () => {
    let seenUrl = "";
    let seenMethod = "";
    let seenHeaders: HeadersInit | undefined;
    let seenBody = "";

    const mockFetch: typeof fetch = Object.assign(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        seenUrl =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        seenMethod = init?.method ?? "GET";
        seenHeaders = init?.headers;
        seenBody = typeof init?.body === "string" ? init.body : "";
        return Promise.resolve(new Response(null, { status: 204 }));
      },
      { preconnect: fetch.preconnect },
    );

    const ok = await registerPushDeviceWithApi(
      { platform: "android", fid: "fid-123" },
      "tok-xyz",
      mockFetch,
    );
    expect(ok).toBe(true);
    expect(seenUrl).toBe("/api/devices");
    expect(seenMethod).toBe("POST");
    expect(seenHeaders).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer tok-xyz",
    });
    expect(seenBody).toBe('{"platform":"android","fid":"fid-123"}');

    const failingFetch: typeof fetch = Object.assign(
      (): Promise<Response> => Promise.reject(new Error("offline")),
      { preconnect: fetch.preconnect },
    );
    expect(
      await registerPushDeviceWithApi({ platform: "ios", fid: "fid-456" }, null, failingFetch),
    ).toBe(false);
  });
});
