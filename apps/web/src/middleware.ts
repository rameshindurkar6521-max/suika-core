/**
 * SUIKA X — Global middleware.
 *
 * Runs before every route handler. Applies:
 *   1. Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
 *   2. Authentication (session cookie verification)
 *   3. Authorization (role-based access control)
 *   4. Rate limiting (per-client, per-tier)
 *
 * Auth flow:
 *   - GET requests: allowed without auth (observer-level read access)
 *     but rate-limited. If a session is present, the role is attached.
 *   - Write requests (POST/PATCH/DELETE): require a valid session cookie.
 *     The role must have permission for the target route.
 *
 * The /api/suika/auth/* routes are exempt from auth (they issue sessions).
 * The /api/suika/system route is exempt (it's the health check).
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  verifySession,
  canAccess,
  getSessionCookie,
  type Role,
} from "@/lib/suika/auth";
import { checkRateLimit } from "@/lib/suika/rate-limit";
import { securityHeaders } from "@/lib/suika/security";

// Routes exempt from authentication
const AUTH_EXEMPT_PATHS = [
  "/api/suika/auth/login",
  "/api/suika/auth/session",
  "/api/suika/system",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // 1. Apply security headers to all responses
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  // 2. Only protect /api/suika/* routes
  if (!pathname.startsWith("/api/suika/")) {
    return response;
  }

  // 3. Rate limiting (applies to ALL routes, including auth-exempt ones,
  //    to prevent brute-force attacks on the login endpoint)
  const rateLimit = checkRateLimit(req);
  if (!rateLimit.allowed) {
    return new NextResponse(
      JSON.stringify({
        error: "Rate limit exceeded",
        tier: rateLimit.tier,
        retryAfterMs: rateLimit.retryAfterMs,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
          ...securityHeaders,
        },
      }
    );
  }

  // 4. Skip auth for exempt paths (but rate limiting still applies above)
  if (AUTH_EXEMPT_PATHS.some((p) => pathname === p)) {
    return response;
  }

  // 5. Authentication
  const sessionToken = req.cookies.get(getSessionCookie())?.value;
  let role: Role = "observer"; // unauthenticated users get observer (read-only)
  let authenticated = false;

  if (sessionToken) {
    const session = await verifySession(sessionToken);
    if (session) {
      role = session.role;
      authenticated = true;
    }
  }

  // 6. Authorization
  // Write operations require authentication
  const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
  if (isWrite && !authenticated) {
    return new NextResponse(
      JSON.stringify({
        error: "Authentication required",
        hint: "POST /api/suika/auth/login with { user, password }",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...securityHeaders,
        },
      }
    );
  }

  // Check role-based permissions
  if (!canAccess(role, method, pathname)) {
    return new NextResponse(
      JSON.stringify({
        error: "Insufficient permissions",
        role,
        method,
        path: pathname,
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          ...securityHeaders,
        },
      }
    );
  }

  // 7. Attach session info to headers for route handlers
  if (authenticated) {
    response.headers.set("x-suika-role", role);
    response.headers.set("x-suika-authenticated", "true");
  }

  return response;
}

export const config = {
  matcher: ["/api/suika/:path*"],
};
