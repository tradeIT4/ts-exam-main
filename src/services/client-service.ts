import { randomUUID } from "node:crypto";
import type { ExamDatabase } from "../database.js";
import type { ApiClient, AuthenticatedClient } from "../types.js";
import { generateApiKey, hashApiKey, secureCompare } from "../utils/crypto.js";

export interface CreateClientInput {
  name: string;
  allowedIps?: string[] | string | null | undefined;
  permissions?: string[] | string | undefined;
  expiresAt?: string | null | undefined;
}

export class ClientService {
  constructor(private db: ExamDatabase) {}

  createClient(input: CreateClientInput): { client: Omit<ApiClient, "api_key_hash">; apiKey: string } {
    const id = randomUUID();
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const now = new Date().toISOString();

    const allowedIps = Array.isArray(input.allowedIps)
      ? input.allowedIps.join(",")
      : input.allowedIps ?? null;

    const permissions = Array.isArray(input.permissions)
      ? input.permissions.join(",")
      : input.permissions ?? "read:all";

    const client: ApiClient = {
      id,
      name: input.name,
      api_key_hash: apiKeyHash,
      status: "active",
      allowed_ips: allowedIps,
      permissions,
      last_used_at: null,
      expires_at: input.expiresAt ?? null,
      created_at: now,
      updated_at: now,
    };

    this.db.prepare(`
      INSERT INTO api_clients (id, name, api_key_hash, status, allowed_ips, permissions, last_used_at, expires_at, created_at, updated_at)
      VALUES (:id, :name, :api_key_hash, :status, :allowed_ips, :permissions, :last_used_at, :expires_at, :created_at, :updated_at)
    `).run({
      id: client.id,
      name: client.name,
      api_key_hash: client.api_key_hash,
      status: client.status,
      allowed_ips: client.allowed_ips,
      permissions: client.permissions,
      last_used_at: client.last_used_at,
      expires_at: client.expires_at,
      created_at: client.created_at,
      updated_at: client.updated_at,
    });

    return {
      client: {
        id: client.id,
        name: client.name,
        status: client.status,
        allowed_ips: client.allowed_ips,
        permissions: client.permissions,
        last_used_at: client.last_used_at,
        expires_at: client.expires_at,
        created_at: client.created_at,
        updated_at: client.updated_at,
      },
      apiKey,
    };
  }

  authenticate(rawKey: string, clientIp?: string): { success: boolean; client?: AuthenticatedClient | undefined; errorReason?: string | undefined; statusCode?: number | undefined } {
    if (!rawKey || typeof rawKey !== "string") {
      return { success: false, errorReason: "Missing or malformed API token", statusCode: 401 };
    }

    const keyHash = hashApiKey(rawKey);
    const row = this.db.prepare("SELECT * FROM api_clients WHERE api_key_hash = ?").get(keyHash) as ApiClient | undefined;

    if (!row) {
      return { success: false, errorReason: "Invalid API token", statusCode: 401 };
    }

    if (!secureCompare(row.api_key_hash, keyHash)) {
      return { success: false, errorReason: "Invalid API token", statusCode: 401 };
    }

    if (row.status !== "active") {
      return { success: false, errorReason: `API client is ${row.status}`, statusCode: 403 };
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return { success: false, errorReason: "API token has expired", statusCode: 401 };
    }

    // Check IP restrictions
    if (row.allowed_ips && clientIp) {
      const allowedList = row.allowed_ips.split(",").map((ip) => ip.trim()).filter(Boolean);
      if (allowedList.length > 0) {
        const normalizedClientIp = clientIp.replace(/^::ffff:/, "");
        const isAllowed = allowedList.some((allowed) => {
          const normalizedAllowed = allowed.replace(/^::ffff:/, "");
          return normalizedAllowed === "*" || normalizedAllowed === normalizedClientIp || normalizedClientIp.startsWith(normalizedAllowed);
        });

        if (!isAllowed) {
          return { success: false, errorReason: `Access forbidden from IP address ${clientIp}`, statusCode: 403 };
        }
      }
    }

    // Update last_used_at
    const now = new Date().toISOString();
    try {
      this.db.prepare("UPDATE api_clients SET last_used_at = ? WHERE id = ?").run(now, row.id);
    } catch {
      // Non-blocking update failure
    }

    const permissions = row.permissions.split(",").map((p) => p.trim()).filter(Boolean);
    const allowedIps = row.allowed_ips ? row.allowed_ips.split(",").map((ip) => ip.trim()) : null;

    return {
      success: true,
      client: {
        id: row.id,
        name: row.name,
        permissions,
        allowedIps,
      },
    };
  }

  revokeClient(id: string): boolean {
    const now = new Date().toISOString();
    const result = this.db.prepare("UPDATE api_clients SET status = 'revoked', updated_at = ? WHERE id = ?").run(now, id);
    return result.changes > 0;
  }
}
