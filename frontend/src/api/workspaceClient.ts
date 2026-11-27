import { getApiBaseUrl } from "@/platform/server";

export type ApiRecord = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, token: string | null, method: string, body?: unknown) {
  const headers = new Headers();
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const payload = body instanceof FormData ? body : JSON.stringify(body);
  if (payload !== undefined && !(payload instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${getApiBaseUrl()}/api${path}`, { method, headers, body: payload });
  if (!response.ok) {
    const failure: unknown = await response.json().catch(() => null);
    const details = objectValue(failure);
    throw new ApiError(
      response.status,
      textValue(details.message, `Żądanie nie powiodło się (HTTP ${response.status}).`),
    );
  }
  return response;
}

export function api<T>(
  path: string,
  token: string | null,
  method?: string,
  body?: unknown,
): Promise<T>;

export async function api(
  path: string,
  token: string | null,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const response = await request(path, token, method, body);
  const json: unknown = await response.json();
  return json;
}

export async function apiVoid(path: string, token: string, method: string, body?: unknown) {
  await request(path, token, method, body);
}

export async function download(path: string, token: string, filename: string) {
  const response = await request(path, token, "GET");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  const disposition = response.headers.get("Content-Disposition");
  const nameFromResponse = disposition?.match(/filename="([^"]+)"/)?.[1];
  link.download = filename || nameFromResponse || "zalacznik";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function upload(file: File, token: string) {
  const body = new FormData();
  body.set("file", file);
  return api<{ id: number; filename: string }>("/attachments", token, "POST", body);
}

export function objectValue(value: unknown): ApiRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

export function textValue(value: unknown, fallback = "—"): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Spróbuj ponownie.";
}
