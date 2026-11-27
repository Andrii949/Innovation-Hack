function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function nextPathFrom(search: string, fallback = "/schedule"): string {
  const params = new URLSearchParams(search);
  const rawNext = params.get("next");
  if (rawNext === null) {
    return fallback;
  }

  const trimmed = rawNext.trim();
  if (
    trimmed === "" ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    hasControlCharacters(trimmed)
  ) {
    return fallback;
  }

  return trimmed;
}
