/** Demo-only role routes for the persona switcher; production auth decides the home view. */

const ROLE_ROUTE = /^#\/role\/([A-Za-z0-9_-]+)$/;

export function roleCodeFromHash(hash: string): string | null {
  return ROLE_ROUTE.exec(hash)?.[1] ?? null;
}

export function roleHash(roleCode: string): string {
  return `#/role/${encodeURIComponent(roleCode)}`;
}
