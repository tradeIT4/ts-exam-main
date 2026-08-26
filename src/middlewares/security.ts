import type { IncomingMessage, ServerResponse } from "node:http";
import { sendError } from "../serializers/response.js";

export function applySecurityHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins = process.env.ALLOWED_ORIGINS ?? "*",
): boolean {
  const origin = req.headers.origin;
  const allowed = allowedOrigins.split(",").map((item) => item.trim());
  const corsOrigin = allowed.includes("*") ? "*" : origin && allowed.includes(origin) ? origin : "";

  if (corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Requested-With, Accept");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin, Authorization");

  // Security Headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");

  // HTTPS Enforcement check
  if (process.env.ENFORCE_HTTPS === "true") {
    const proto = req.headers["x-forwarded-proto"];
    if (proto && proto !== "https") {
      sendError(res, 403, "HTTPS is required to access this API.");
      return false;
    }
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return false;
  }

  return true;
}
