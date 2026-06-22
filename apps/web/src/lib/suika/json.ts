/** SUIKA X — small JSON helpers for the SQLite (String-encoded) fields. */
export function readJSON<T = Record<string, unknown>>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(v: unknown): string {
  return JSON.stringify(v ?? {});
}
