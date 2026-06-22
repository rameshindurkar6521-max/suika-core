/**
 * SUIKA X — Security utilities.
 *
 * - sanitizeError(): removes internal details from error messages before
 *   returning to the client. Prisma error messages (which leak table/column
 *   names) are replaced with generic messages.
 * - validateInput(): basic length + type validation for user-provided text.
 * - securityHeaders(): standard security headers for all responses.
 */

// Errors that should never leak to the client
const SENSITIVE_PATTERNS = [
  /prisma/i,
  /database/i,
  /constraint/i,
  /foreign key/i,
  /column/i,
  /table/i,
  /sqlite/i,
  /query/i,
  /invocation/i,
  /module/i,
];

export function sanitizeError(error: unknown): { message: string; status: number } {
  const msg = error instanceof Error ? error.message : String(error);

  // Check for known error types
  if (msg.includes("not found")) {
    return { message: "Resource not found", status: 404 };
  }
  if (msg.includes("required") || msg.includes("must be")) {
    return { message: "Invalid request: missing or invalid parameters", status: 400 };
  }
  if (msg.includes("unique constraint")) {
    return { message: "Conflict: resource already exists", status: 409 };
  }
  if (msg.includes("foreign key")) {
    return { message: "Conflict: referenced resource does not exist", status: 409 };
  }

  // Check for sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(msg)) {
      return { message: "Internal server error", status: 500 };
    }
  }

  // If the error is short and doesn't match sensitive patterns, it's probably
  // a domain-level error message that's safe to return
  if (msg.length < 200) {
    return { message: msg, status: 500 };
  }

  return { message: "Internal server error", status: 500 };
}

export function validateText(
  value: unknown,
  maxLen: number = 10000
): { ok: boolean; sanitized?: string; error?: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "must be a string" };
  }
  if (value.length > maxLen) {
    return { ok: false, error: `exceeds max length of ${maxLen}` };
  }
  // Strip null bytes (common injection vector)
  const sanitized = value.replace(/\0/g, "");
  return { ok: true, sanitized };
}

export const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function applySecurityHeaders(
  response: Response
): Response {
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}
