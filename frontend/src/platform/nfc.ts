import { Capacitor, registerPlugin } from "@capacitor/core";

import { equipmentUrl, isValidPublicId, parseEquipmentUrl } from "@/lib/qr";

export const NDEF_URI_PREFIXES: readonly string[] = [
  "",
  "http://www.",
  "https://www.",
  "http://",
  "https://",
  "tel:",
  "mailto:",
  "ftp://anonymous:anonymous@",
  "ftp://ftp.",
  "ftps://",
  "sftp://",
  "smb://",
  "nfs://",
  "ftp://",
  "dav://",
  "news:",
  "telnet://",
  "imap:",
  "rtsp://",
  "urn:",
  "pop:",
  "sip:",
  "sips:",
  "tftp:",
  "btspp://",
  "btl2cap://",
  "btgoep://",
  "tcpobex://",
  "irdaobex://",
  "file://",
  "urn:epc:id:",
  "urn:epc:tag:",
  "urn:epc:pat:",
  "urn:epc:raw:",
  "urn:epc:",
  "urn:nfc:",
];

export type NdefRecordLike = {
  recordType?: string;
  tnf?: number;
  type?: readonly number[] | Uint8Array;
  payload?: readonly number[] | Uint8Array | DataView;
  data?: DataView | string;
  url?: string;
};

export type EncodedNdefUriRecord = {
  tnf: 1;
  type: number[];
  payload: number[];
};

export type NfcReadResult =
  | { kind: "equipment"; publicId: string; rawUrl: string }
  | { kind: "invalid_tag"; message: string }
  | { kind: "cancelled" }
  | { kind: "unavailable" };

export type NfcWriteResult =
  | { kind: "written"; url: string }
  | { kind: "invalid_id" }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

type CapacitorNfcEvent = {
  message?: {
    records?: readonly NdefRecordLike[];
  };
};

type CapacitorNfcPluginShape = {
  startScanSession: () => Promise<void>;
  stopScanSession: () => Promise<void>;
  addListener: (
    eventName: "nfcTagScanned",
    listener: (event: CapacitorNfcEvent) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
  write?: (options: { records: readonly EncodedNdefUriRecord[] }) => Promise<void>;
};

type WebNdefReaderInstance = {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  write?: (
    message: { records: ReadonlyArray<{ recordType: "url"; data: string }> },
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
  addEventListener: (
    type: string,
    listener: (event: unknown) => void,
    options?: { once?: boolean },
  ) => void;
};

type WebNdefReaderConstructor = new () => WebNdefReaderInstance;

declare global {
  var NDEFReader: WebNdefReaderConstructor | undefined;
}

const CapacitorNfcPlugin = registerPlugin<CapacitorNfcPluginShape>("CapacitorNfc");
const INVALID_TAG_MESSAGE = "To nie jest tag urządzenia";

function toBytes(input: readonly number[] | Uint8Array | DataView | undefined): Uint8Array | null {
  if (input === undefined) {
    return null;
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof DataView) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return Uint8Array.from(input);
}

function isUriRecord(record: NdefRecordLike): boolean {
  if (record.recordType === "url" || record.recordType === "U") {
    return true;
  }
  if (record.type !== undefined) {
    const typeBytes =
      record.type instanceof Uint8Array ? record.type : Uint8Array.from(record.type);
    return typeBytes.length === 1 && typeBytes[0] === 0x55;
  }
  return false;
}

export function extractNdefUri(records: readonly NdefRecordLike[]): string | null {
  for (const record of records) {
    if (typeof record.url === "string" && record.url.trim() !== "") {
      return record.url.trim();
    }

    if (record.recordType === "url" && record.data !== undefined) {
      if (typeof record.data === "string" && record.data.trim() !== "") {
        return record.data.trim();
      }
      if (record.data instanceof DataView) {
        const decoded = new TextDecoder().decode(record.data).trim();
        if (decoded !== "") {
          return decoded;
        }
      }
    }

    if (!isUriRecord(record)) {
      continue;
    }

    const bytes = toBytes(record.payload);
    if (bytes === null || bytes.length < 2) {
      continue;
    }

    const prefixCode = bytes[0];
    if (prefixCode === undefined) {
      continue;
    }
    const prefix = NDEF_URI_PREFIXES[prefixCode] ?? "";
    const suffix = new TextDecoder().decode(bytes.slice(1)).trim();
    const combined = `${prefix}${suffix}`.trim();
    if (combined !== "") {
      return combined;
    }
  }

  return null;
}

export function resolveNfcRecords(records: readonly NdefRecordLike[]): NfcReadResult {
  const uri = extractNdefUri(records);
  if (uri === null) {
    return { kind: "invalid_tag", message: INVALID_TAG_MESSAGE };
  }
  const publicId = parseEquipmentUrl(uri);
  if (publicId === null) {
    return { kind: "invalid_tag", message: INVALID_TAG_MESSAGE };
  }
  return { kind: "equipment", publicId, rawUrl: uri };
}

function getWebNdefConstructor(): WebNdefReaderConstructor | null {
  if (typeof globalThis.NDEFReader === "function") {
    return globalThis.NDEFReader;
  }
  return null;
}

export function isNfcAvailable(): boolean {
  return Capacitor.isPluginAvailable("CapacitorNfc") || getWebNdefConstructor() !== null;
}

function readViaCapacitorNfc(signal?: AbortSignal): Promise<NfcReadResult> {
  if (signal?.aborted) {
    return Promise.resolve({ kind: "cancelled" });
  }

  return new Promise<NfcReadResult>((resolve) => {
    let settled = false;
    let handle: { remove: () => Promise<void> } | null = null;

    const finish = (result: NfcReadResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (handle !== null) {
        void handle.remove();
      }
      void CapacitorNfcPlugin.stopScanSession().catch(() => {});
      resolve(result);
    };

    if (signal !== undefined) {
      signal.addEventListener("abort", () => finish({ kind: "cancelled" }), { once: true });
    }

    void CapacitorNfcPlugin.addListener("nfcTagScanned", (event) => {
      const records = event.message?.records ?? [];
      finish(resolveNfcRecords(records));
    })
      .then((listenerHandle) => {
        handle = listenerHandle;
        return CapacitorNfcPlugin.startScanSession();
      })
      .catch(() => {
        finish({ kind: "cancelled" });
      });
  });
}

function toNdefRecord(item: unknown): NdefRecordLike | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const record: NdefRecordLike = {};
  if ("recordType" in item && typeof item.recordType === "string") {
    record.recordType = item.recordType;
  }
  if ("tnf" in item && typeof item.tnf === "number") {
    record.tnf = item.tnf;
  }
  if ("url" in item && typeof item.url === "string") {
    record.url = item.url;
  }
  if ("data" in item && (typeof item.data === "string" || item.data instanceof DataView)) {
    record.data = item.data;
  }
  if ("type" in item && (item.type instanceof Uint8Array || Array.isArray(item.type))) {
    record.type = Uint8Array.from(item.type.filter((v): v is number => typeof v === "number"));
  }
  if (
    "payload" in item &&
    (item.payload instanceof Uint8Array ||
      item.payload instanceof DataView ||
      Array.isArray(item.payload))
  ) {
    record.payload = Array.isArray(item.payload)
      ? item.payload.filter((v): v is number => typeof v === "number")
      : item.payload;
  }
  return record;
}

function extractRecordsFromEvent(rawEvent: unknown): readonly NdefRecordLike[] {
  if (
    typeof rawEvent !== "object" ||
    rawEvent === null ||
    !("message" in rawEvent) ||
    typeof rawEvent.message !== "object" ||
    rawEvent.message === null ||
    !("records" in rawEvent.message) ||
    !Array.isArray(rawEvent.message.records)
  ) {
    return [];
  }

  const rawRecords: readonly unknown[] = rawEvent.message.records;
  const out: NdefRecordLike[] = [];
  for (const item of rawRecords) {
    const parsed = toNdefRecord(item);
    if (parsed !== null) {
      out.push(parsed);
    }
  }
  return out;
}

function readViaWebNfc(
  Ctor: WebNdefReaderConstructor,
  signal?: AbortSignal,
): Promise<NfcReadResult> {
  const controller = new AbortController();
  if (signal !== undefined) {
    if (signal.aborted) {
      return Promise.resolve({ kind: "cancelled" });
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return new Promise<NfcReadResult>((resolve) => {
    const reader = new Ctor();
    let settled = false;

    const finish = (result: NfcReadResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      controller.abort();
      resolve(result);
    };

    controller.signal.addEventListener("abort", () => finish({ kind: "cancelled" }), {
      once: true,
    });

    reader.addEventListener(
      "reading",
      (rawEvent) => {
        finish(resolveNfcRecords(extractRecordsFromEvent(rawEvent)));
      },
      { once: true },
    );

    reader.addEventListener(
      "readingerror",
      () => finish({ kind: "invalid_tag", message: INVALID_TAG_MESSAGE }),
      { once: true },
    );

    void reader.scan({ signal: controller.signal }).catch(() => finish({ kind: "cancelled" }));
  });
}

export function encodeNdefUriRecord(uri: string): EncodedNdefUriRecord {
  const trimmed = uri.trim();
  let bestIndex = 0;
  let bestPrefix = "";

  for (let i = 1; i < NDEF_URI_PREFIXES.length; i += 1) {
    const candidate = NDEF_URI_PREFIXES[i];
    if (
      candidate !== undefined &&
      trimmed.startsWith(candidate) &&
      candidate.length > bestPrefix.length
    ) {
      bestIndex = i;
      bestPrefix = candidate;
    }
  }

  const suffixBytes = new TextEncoder().encode(trimmed.slice(bestPrefix.length));
  return {
    tnf: 1,
    type: [0x55],
    payload: [bestIndex, ...Array.from(suffixBytes)],
  };
}

export function readEquipmentNfcTag(signal?: AbortSignal): Promise<NfcReadResult> {
  if (Capacitor.isPluginAvailable("CapacitorNfc")) {
    return readViaCapacitorNfc(signal);
  }
  const WebNdef = getWebNdefConstructor();
  if (WebNdef !== null) {
    return readViaWebNfc(WebNdef, signal);
  }
  return Promise.resolve({ kind: "unavailable" });
}

export async function writeEquipmentNfcTag(
  baseUrl: string,
  publicId: string,
  options?: {
    signal?: AbortSignal;
    writerOverride?: (
      url: string,
      record: EncodedNdefUriRecord,
      signal?: AbortSignal,
    ) => Promise<void>;
  },
): Promise<NfcWriteResult> {
  if (!isValidPublicId(publicId)) {
    return { kind: "invalid_id" };
  }

  const url = equipmentUrl(baseUrl, publicId);
  if (parseEquipmentUrl(url) !== publicId) {
    return { kind: "invalid_id" };
  }

  if (options?.signal?.aborted) {
    return { kind: "cancelled" };
  }

  const record = encodeNdefUriRecord(url);

  try {
    if (options?.writerOverride !== undefined) {
      await options.writerOverride(url, record, options.signal);
      return { kind: "written", url };
    }

    if (
      Capacitor.isPluginAvailable("CapacitorNfc") &&
      typeof CapacitorNfcPlugin.write === "function"
    ) {
      await CapacitorNfcPlugin.write({ records: [record] });
      return { kind: "written", url };
    }

    const WebNdef = getWebNdefConstructor();
    if (WebNdef !== null) {
      const reader = new WebNdef();
      if (typeof reader.write === "function") {
        await reader.write(
          { records: [{ recordType: "url", data: url }] },
          options?.signal !== undefined ? { signal: options.signal } : undefined,
        );
        return { kind: "written", url };
      }
    }

    return { kind: "unavailable" };
  } catch {
    if (options?.signal?.aborted) {
      return { kind: "cancelled" };
    }
    return { kind: "error", message: "Nie udało się zapisać tagu NFC" };
  }
}
