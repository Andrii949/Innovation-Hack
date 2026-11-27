/** Case- and diacritic-insensitive matching for client-side search boxes. */

const FOLDED: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (character) => FOLDED[character] ?? character)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Every whitespace-separated token must appear in at least one field. */
export function matchesQuery(query: string, ...fields: (string | null)[]): boolean {
  const tokens = normalizeText(query.trim())
    .split(/\s+/)
    .filter((token) => token !== "");
  if (tokens.length === 0) {
    return true;
  }
  const haystacks = fields
    .filter((field): field is string => field !== null)
    .map((field) => normalizeText(field));
  return tokens.every((token) => haystacks.some((haystack) => haystack.includes(token)));
}
