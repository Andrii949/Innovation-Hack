import { Capacitor, registerPlugin } from "@capacitor/core";

import { parseEquipmentUrl } from "@/lib/qr";
import { isNfcAvailable, readEquipmentNfcTag } from "@/platform/nfc";

export type ScanOutcome =
  | { status: "ok"; publicId: string; source: "nfc" | "qr" }
  | { status: "invalid_code"; message: string }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string };

type BarcodeScannerPluginShape = {
  scanBarcode: (options: { hint: number }) => Promise<{ ScanResult?: string }>;
};

const BarcodeScanner = registerPlugin<BarcodeScannerPluginShape>("BarcodeScanner");
const QR_HINT_CODE = 0;

export function canScanQr(): boolean {
  return Capacitor.isPluginAvailable("BarcodeScanner");
}

export function resolveScannedPayload(raw: string, source: "nfc" | "qr"): ScanOutcome {
  const publicId = parseEquipmentUrl(raw);
  if (publicId !== null) {
    return { status: "ok", publicId, source };
  }
  return {
    status: "invalid_code",
    message: source === "nfc" ? "To nie jest tag urządzenia" : "To nie jest kod urządzenia",
  };
}

export async function scanRawQrCode(): Promise<string | null> {
  if (!canScanQr()) {
    return null;
  }

  try {
    const result = await BarcodeScanner.scanBarcode({ hint: QR_HINT_CODE });
    const raw = result.ScanResult?.trim() ?? "";
    return raw === "" ? null : raw;
  } catch {
    return null;
  }
}

export async function scanEquipment(options?: {
  preferNfc?: boolean;
  signal?: AbortSignal;
}): Promise<ScanOutcome> {
  if (options?.preferNfc === true && isNfcAvailable()) {
    const nfcResult = await readEquipmentNfcTag(options.signal);
    switch (nfcResult.kind) {
      case "equipment":
        return { status: "ok", publicId: nfcResult.publicId, source: "nfc" };
      case "invalid_tag":
        return { status: "invalid_code", message: nfcResult.message };
      case "cancelled":
        return { status: "cancelled" };
      case "unavailable":
        break;
    }
  }

  if (!canScanQr()) {
    return {
      status: "unavailable",
      message: "Skaner kodów QR wymaga aplikacji mobilnej.",
    };
  }

  const raw = await scanRawQrCode();
  if (raw === null) {
    return { status: "cancelled" };
  }
  return resolveScannedPayload(raw, "qr");
}
