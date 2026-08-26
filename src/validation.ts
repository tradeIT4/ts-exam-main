import type { IncomingMessage } from "node:http";
import type { ApiError, Filters, Period, ResultStatus } from "./types.js";

export function httpError(statusCode: number, message: string, details?: unknown): ApiError {
  return Object.assign(new Error(message), { statusCode, details });
}

export async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw httpError(413, "Request body is too large");
    chunks.push(buffer);
  }
  if (!chunks.length) throw httpError(400, "A JSON request body is required");
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw httpError(400, "Request body must be a valid JSON object");
  }
}

export function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw httpError(422, `${field} is required`);
  return value.trim();
}

export function optionalString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw httpError(422, `${field} must be a string`);
  return value.trim();
}

export function numberInRange(body: Record<string, unknown>, field: string, fallback?: number): number {
  const raw = body[field] ?? fallback;
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw httpError(422, `${field} must be a number between 0 and 100`);
  }
  return value;
}

export function isoDate(value: unknown, field: string, fallback = new Date().toISOString()): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw httpError(422, `${field} must be a valid ISO date`);
  }
  return new Date(value).toISOString();
}

export function parseFilters(url: URL): Filters {
  const period = url.searchParams.get("period") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  if (period && !["daily", "weekly", "monthly", "quarterly", "yearly"].includes(period)) {
    throw httpError(400, "period must be daily, weekly, monthly, quarterly, or yearly");
  }
  if (status && !["passed", "failed"].includes(status)) {
    throw httpError(400, "status must be passed or failed");
  }
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  if (from && Number.isNaN(Date.parse(from))) throw httpError(400, "from must be a valid date");
  if (to && Number.isNaN(Date.parse(to))) throw httpError(400, "to must be a valid date");
  if (from && to && Date.parse(from) > Date.parse(to)) {
    throw httpError(400, "from must be earlier than or equal to to");
  }
  return {
    ...(url.searchParams.get("courseId") ? { courseId: url.searchParams.get("courseId")! } : {}),
    ...(url.searchParams.get("courseType") ? { courseType: url.searchParams.get("courseType")! } : {}),
    ...(status ? { status: status as ResultStatus } : {}),
    ...(period ? { period: period as Period } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to).toISOString() } : {}),
  };
}
