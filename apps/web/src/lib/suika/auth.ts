/**
 * SUIKA X — Authentication & Authorization.
 *
 * Session-based auth with three roles:
 *   admin    — full access (read + write + constitution amendments + user management)
 *   operator — read + task dispatch + memory mutations
 *   observer — read-only
 *
 * Sessions are signed JWTs stored in the `suika-session` cookie. The signing
 * key is derived from a static secret (in production, from env var
 * SUIKA_AUTH_SECRET). Verification is Edge-runtime-compatible (HMAC-SHA256
 * via Web Crypto API).
 *
 * Default bootstrap credentials (for first-run):
 *   admin / suika-admin-2024  →  role: admin
 *   operator / suika-op-2024  →  role: operator
 *   observer / suika-obs-2024 →  role: observer
 *
 * In production these MUST be changed via environment variables.
 */
import type { NextRequest } from "next/server";

export type Role = "admin" | "operator" | "observer";

export interface Session {
  userId: string;
  role: Role;
  name: string;
  issuedAt: number;
  expiresAt: number;
}

const SECRET =
  process.env.SUIKA_AUTH_SECRET || "suika-dev-secret-change-in-production";
const SESSION_COOKIE = "suika-session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Bootstrap users (static — in production these come from the DB) ─────────

const USERS: Record<string, { password: string; role: Role; name: string }> = {
  admin: { password: "suika-admin-2024", role: "admin", name: "Administrator" },
  operator: { password: "suika-op-2024", role: "operator", name: "Operator" },
  observer: { password: "suika-obs-2024", role: "observer", name: "Observer" },
};

// ─── Permission matrix ───────────────────────────────────────────────────────

/**
 * Which roles can perform which HTTP methods on which route patterns.
 * Write operations (POST/PATCH/DELETE) require operator+ for most routes,
 * admin for constitution amendments.
 */
export function canAccess(
  role: Role,
  method: string,
  pathname: string
): boolean {
  const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
  const isRead = method === "GET";

  // Observer: read-only
  if (role === "observer") return isRead;

  // Operator: read + most writes, but NOT constitution amendments or user management
  if (role === "operator") {
    if (isRead) return true;
    // Constitution amendments require admin
    if (pathname.includes("/constitution/amendments")) return false;
    // System seed requires admin
    if (pathname.includes("/system/seed")) return false;
    // Workspace activation requires admin
    if (pathname.includes("/workspaces/") && pathname.includes("/activate"))
      return false;
    return true;
  }

  // Admin: everything
  if (role === "admin") return true;

  return false;
}

// ─── Session token (JWT-lite, Edge-compatible) ───────────────────────────────

async function sign(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(new Uint8Array(sig)).toString("base64url");
}

async function verify(payload: string, signature: string): Promise<boolean> {
  const expected = await sign(payload);
  return expected === signature;
}

export async function createSession(user: string): Promise<string | null> {
  const u = USERS[user];
  if (!u || u.password !== USERS[user]?.password) return null;
  const now = Date.now();
  const payload = JSON.stringify({
    userId: user,
    role: u.role,
    name: u.name,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  const sig = await sign(payload);
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;
    const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const valid = await verify(payload, sig);
    if (!valid) return null;
    const session = JSON.parse(payload) as Session;
    if (Date.now() > session.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

export function getSessionCookie(): string {
  return SESSION_COOKIE;
}

export function validateCredentials(
  user: string,
  password: string
): { ok: boolean; role?: Role; name?: string } {
  const u = USERS[user];
  if (!u || u.password !== password) return { ok: false };
  return { ok: true, role: u.role, name: u.name };
}

export function listUsers(): Array<{ id: string; role: Role; name: string }> {
  return Object.entries(USERS).map(([id, u]) => ({
    id,
    role: u.role,
    name: u.name,
  }));
}
