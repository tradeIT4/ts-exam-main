import type { ServerResponse } from "node:http";
import type { PaginationMeta } from "../types.js";

export interface ApiResponseOptions {
  status?: number | undefined;
  headers?: Record<string, string> | undefined;
  period?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  pagination?: PaginationMeta | undefined;
}

export function sendSuccess(
  response: ServerResponse,
  data: unknown,
  options: ApiResponseOptions = {},
) {
  const status = options.status ?? 200;
  const body: Record<string, unknown> = {
    success: true,
  };

  if (options.period) body.period = options.period;
  if (options.fromDate) body.from_date = options.fromDate.split("T")[0];
  if (options.toDate) body.to_date = options.toDate.split("T")[0];

  body.data = data;
  if (options.pagination) body.pagination = options.pagination;

  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...(options.headers ?? {}),
  });
  response.end(JSON.stringify(body));
}

export function sendError(
  response: ServerResponse,
  statusCode: number,
  message: string,
  errors?: Record<string, string[]> | undefined,
  headers: Record<string, string> = {},
) {
  const body: Record<string, unknown> = {
    success: false,
    message,
  };

  if (errors && Object.keys(errors).length > 0) {
    body.errors = errors;
  }

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}
