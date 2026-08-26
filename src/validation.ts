import type { IncomingMessage } from "node:http";
import type { ApiError, Filters, Period, ResultStatus } from "./types.js";
import { parseDateInput } from "./utils/dates.js";

export function httpError(statusCode: number, message: string, details?: unknown, errors?: Record<string, string[]> | undefined): ApiError {
  const err = new Error(message) as ApiError;
  err.statusCode = statusCode;
  err.details = details;
  err.errors = errors;
  return err;
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
  if (typeof value !== "string" || !value.trim()) throw httpError(422, `${field} is required`, undefined, { [field]: [`${field} is required`] });
  return value.trim();
}

export function optionalString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw httpError(422, `${field} must be a string`, undefined, { [field]: [`${field} must be a string`] });
  return value.trim();
}

export function numberInRange(body: Record<string, unknown>, field: string, fallback?: number): number {
  const raw = body[field] ?? fallback;
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw httpError(422, `${field} must be a number between 0 and 100`, undefined, { [field]: [`${field} must be a number between 0 and 100`] });
  }
  return value;
}

export function isoDate(value: unknown, field: string, fallback = new Date().toISOString()): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw httpError(422, `${field} must be a valid ISO date`, undefined, { [field]: [`${field} must be a valid ISO date`] });
  }
  return new Date(value).toISOString();
}

export function validateSummaryQuery(url: URL): {
  period?: Period | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  courseId?: string | undefined;
  courseType?: string | undefined;
  status?: ResultStatus | undefined;
  page: number;
  perPage: number;
} {
  const errors: Record<string, string[]> = {};

  const rawPeriod = url.searchParams.get("period")?.toLowerCase();
  let period: Period | undefined;
  if (rawPeriod) {
    const validPeriods: Period[] = ["today", "daily", "weekly", "monthly", "quarterly", "yearly"];
    if (validPeriods.includes(rawPeriod as Period)) {
      period = rawPeriod as Period;
    } else {
      errors.period = ["period must be one of: today, weekly, monthly, yearly, daily, quarterly"];
    }
  }

  const rawStatus = url.searchParams.get("status")?.toLowerCase();
  let status: ResultStatus | undefined;
  if (rawStatus) {
    if (rawStatus === "passed" || rawStatus === "failed") {
      status = rawStatus;
    } else {
      errors.status = ["status must be either 'passed' or 'failed'"];
    }
  }

  // Support both snake_case and camelCase / short param names
  const rawFrom = url.searchParams.get("from_date") ?? url.searchParams.get("from");
  const rawTo = url.searchParams.get("to_date") ?? url.searchParams.get("to");

  let fromDate: string | undefined;
  let toDate: string | undefined;

  if (rawFrom) {
    fromDate = parseDateInput(rawFrom, false);
    if (!fromDate) {
      errors.from_date = ["from_date must be a valid date in YYYY-MM-DD or ISO 8601 format"];
    }
  }

  if (rawTo) {
    toDate = parseDateInput(rawTo, true);
    if (!toDate) {
      errors.to_date = ["to_date must be a valid date in YYYY-MM-DD or ISO 8601 format"];
    }
  }

  if (fromDate && toDate) {
    if (new Date(fromDate).getTime() > new Date(toDate).getTime()) {
      errors.from_date = errors.from_date ?? [];
      errors.from_date.push("from_date must be earlier than or equal to to_date");
    }
  }

  const courseId = url.searchParams.get("course_id") ?? url.searchParams.get("courseId") ?? undefined;
  const courseType = url.searchParams.get("course_type") ?? url.searchParams.get("courseType") ?? undefined;

  // Pagination
  const rawPage = url.searchParams.get("page");
  let page = 1;
  if (rawPage !== null) {
    const parsedPage = Number(rawPage);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      errors.page = ["page must be a positive integer >= 1"];
    } else {
      page = parsedPage;
    }
  }

  const rawLimit = url.searchParams.get("per_page") ?? url.searchParams.get("limit");
  let perPage = 50;
  if (rawLimit !== null) {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      errors.per_page = ["per_page must be an integer between 1 and 100"];
    } else {
      perPage = parsedLimit;
    }
  }

  if (Object.keys(errors).length > 0) {
    const firstMessage = Object.values(errors)[0]?.[0] ?? "Validation error";
    throw httpError(400, firstMessage, undefined, errors);
  }

  return {
    period,
    fromDate,
    toDate,
    courseId,
    courseType,
    status,
    page,
    perPage,
  };
}

export function parseFilters(url: URL): Filters {
  const q = validateSummaryQuery(url);
  return {
    courseId: q.courseId,
    courseType: q.courseType,
    status: q.status,
    period: q.period,
    from: q.fromDate,
    to: q.toDate,
    fromDate: q.fromDate,
    toDate: q.toDate,
  };
}
