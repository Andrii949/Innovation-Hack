export const PUBLIC_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/;

export function isValidPublicId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value);
}

export function equipmentUrl(baseUrl: string, publicId: string): string {
  if (!isValidPublicId(publicId)) {
    throw new Error(`Invalid equipment public_id: ${publicId}`);
  }
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  return `${cleanBase}/e/${publicId}`;
}

export function parseEquipmentUrl(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }

  let pathname: string;
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//") || trimmed.includes("?") || trimmed.includes("#")) {
      return null;
    }
    pathname = trimmed;
  } else {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.search !== "" || parsed.hash !== "") {
      return null;
    }
    pathname = parsed.pathname;
  }

  const normalizedPath = pathname.replace(/\/+$/, "");
  const match = /^\/e\/([0-9A-HJKMNP-TV-Z]{10})$/.exec(normalizedPath);
  if (match === null) {
    return null;
  }
  const candidate = match[1];
  return candidate !== undefined && isValidPublicId(candidate) ? candidate : null;
}
