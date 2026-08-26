import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { ExamDatabase } from "../database.js";
import type { AuthenticatedRequest } from "./auth.js";

export function createAuditLogger(db: ExamDatabase) {
  const insertStmt = db.prepare(`
    INSERT INTO api_logs (id, api_client_id, endpoint, method, status_code, ip_address, requested_at, response_time_ms)
    VALUES (:id, :api_client_id, :endpoint, :method, :status_code, :ip_address, :requested_at, :response_time_ms)
  `);

  return function logRequest(req: AuthenticatedRequest, res: ServerResponse, startTime: number) {
    const requestedAt = new Date(startTime).toISOString();
    const durationMs = Number((performance.now() - startTime).toFixed(2));
    const url = req.url ?? "/";
    const method = req.method ?? "GET";
    const statusCode = res.statusCode;
    const clientId = req.client?.id ?? null;
    const ip = req.clientIp ?? null;

    try {
      insertStmt.run({
        id: randomUUID(),
        api_client_id: clientId,
        endpoint: url.split("?")[0] ?? url,
        method,
        status_code: statusCode,
        ip_address: ip,
        requested_at: requestedAt,
        response_time_ms: durationMs,
      });
    } catch {
      // Prevent audit logging failures from crashing response flow
    }
  };
}
