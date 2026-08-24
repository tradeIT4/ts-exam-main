export type Period = "daily" | "weekly" | "monthly" | "yearly";
export type ResultStatus = "passed" | "failed";

export interface Filters {
  courseId?: string;
  courseType?: string;
  status?: ResultStatus;
  period?: Period;
  from?: string;
  to?: string;
}

export interface ApiError extends Error {
  statusCode?: number;
  details?: unknown;
}
