import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthenticatedClient } from "../types.js";
import { ClientService } from "../services/client-service.js";
import { sendError } from "../serializers/response.js";
import type { ExamDatabase } from "../database.js";

export interface AuthenticatedRequest extends IncomingMessage {
  client?: AuthenticatedClient;
  clientIp?: string;
  startTime?: number;
}

export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip) return ip;
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return req.socket.remoteAddress ?? "127.0.0.1";
}

export function extractApiToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && (parts[0]?.toLowerCase() === "bearer" || parts[0]?.toLowerCase() === "token")) {
      return parts[1]!.trim();
    }
  }
  const apiKeyHeader = req.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }
  return null;
}

export function createAuthMiddleware(db: ExamDatabase, clientService = new ClientService(db)) {
  return function authMiddleware(
    req: AuthenticatedRequest,
    res: ServerResponse,
    requiredPermission?: string,
  ): boolean {
    const token = extractApiToken(req);
    const clientIp = getClientIp(req);
    req.clientIp = clientIp;

    // Check legacy env API_KEY for backward compatibility if configured
    if (process.env.API_KEY && token === process.env.API_KEY) {
      req.client = {
        id: "env-master-key",
        name: "Legacy Master API Key",
        permissions: ["read:all", "read:exams", "read:registrations", "read:reports", "write:all"],
        allowedIps: null,
      };
      return true;
    }

    if (!token) {
      // If no token provided and no client in DB, but auth is required
      sendError(res, 401, "Authentication required. Please provide a valid Bearer token or X-API-Key header.");
      return false;
    }

    const authResult = clientService.authenticate(token, clientIp);
    if (!authResult.success || !authResult.client) {
      const status = authResult.statusCode ?? 401;
      sendError(res, status, authResult.errorReason ?? "Invalid or unauthorized API key.");
      return false;
    }

    req.client = authResult.client;

    // Check required permission if specified
    if (requiredPermission) {
      const perms = authResult.client.permissions;
      const hasPermission = perms.includes("*") ||
        (requiredPermission.startsWith("read:") && perms.includes("read:all")) ||
        (requiredPermission.startsWith("write:") && perms.includes("write:all")) ||
        perms.includes(requiredPermission) ||
        (requiredPermission.startsWith("read:") && perms.includes("read:*"));

      if (!hasPermission) {
        sendError(res, 403, `Forbidden. Missing required permission: ${requiredPermission}`);
        return false;
      }
    }

    return true;
  };
}
