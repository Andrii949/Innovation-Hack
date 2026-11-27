import { Capacitor } from "@capacitor/core";

import { parseEquipmentUrl } from "@/lib/qr";

const SERVER_URL_KEY = "lab.server-url";
const HEALTH_PATH = "/api/health";
const HEALTH_TIMEOUT_MS = 5000;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

// Accepts "lab.example.com" or "https://lab.example.com/", keeps scheme + host only.
export function normalizeServerUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    return null;
  }

  return parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, ""));
}

export function parseServerConfigQr(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }

  let candidate = trimmed;
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("serverUrl" in parsed) ||
        typeof parsed.serverUrl !== "string"
      ) {
        return null;
      }
      candidate = parsed.serverUrl;
    } catch {
      return null;
    }
  }

  if (parseEquipmentUrl(candidate) !== null) {
    return null;
  }

  const normalized = normalizeServerUrl(candidate);
  if (normalized === null) {
    return null;
  }

  try {
    return new URL(normalized).pathname === "/" ? normalized : null;
  } catch {
    return null;
  }
}

export function getServerUrl(): string | null {
  return localStorage.getItem(SERVER_URL_KEY);
}

export function getApiBaseUrl(): string {
  return isNativeApp() ? (getServerUrl() ?? "") : "";
}

export function setServerUrl(url: string): void {
  localStorage.setItem(SERVER_URL_KEY, url);
}

export function clearServerUrl(): void {
  localStorage.removeItem(SERVER_URL_KEY);
}

// Browser deployments are served by the same host as the API, so no setup is needed.
export function needsServerSetup(): boolean {
  return isNativeApp() && getServerUrl() === null;
}

export async function checkServer(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}${HEALTH_PATH}`, { signal: controller.signal });
    if (!response.ok) {
      return false;
    }

    const body: unknown = await response.json();
    return isHealthResponse(body);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function isHealthResponse(body: unknown): boolean {
  return typeof body === "object" && body !== null && "status" in body && body.status === "ok";
}
