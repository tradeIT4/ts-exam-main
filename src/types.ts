export type Period = "today" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export type ResultStatus = "passed" | "failed";
export type ClientStatus = "active" | "revoked" | "suspended";

export interface ApiClient {
  id: string;
  name: string;
  api_key_hash: string;
  status: ClientStatus;
  allowed_ips: string | null;
  permissions: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiLog {
  id: string;
  api_client_id: string | null;
  endpoint: string;
  method: string;
  status_code: number;
  ip_address: string | null;
  requested_at: string;
  response_time_ms?: number | null | undefined;
}

export interface Filters {
  courseId?: string | undefined;
  courseType?: string | undefined;
  status?: ResultStatus | undefined;
  period?: Period | undefined;
  from?: string | undefined;
  to?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
}

export interface DateRange {
  fromDate: string;
  toDate: string;
  period?: Period | undefined;
}

export interface PaginationParams {
  page: number;
  perPage: number;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ExamSummaryData {
  total_exams: number;
  students_taken: number;
  passed: number;
  failed: number;
  pass_rate: number;
  fail_rate: number;
  average_score?: number | null | undefined;
}

export interface ExamSummaryResponse {
  success: boolean;
  period?: string | undefined;
  from_date?: string | undefined;
  to_date?: string | undefined;
  data: ExamSummaryData;
}

export interface CourseExamSummaryItem {
  course_id: string;
  course_name: string;
  course_code?: string | undefined;
  exam_date?: string | undefined;
  students_taken: number;
  passed: number;
  failed: number;
  pass_rate: number;
  fail_rate?: number | undefined;
}

export interface CourseExamResponse {
  success: boolean;
  data: CourseExamSummaryItem[];
  pagination?: PaginationMeta | undefined;
}

export interface PeriodRegistrationStat {
  current: number;
  previous: number;
  change_percentage: number;
}

export interface RegistrationsSummaryData {
  weekly: PeriodRegistrationStat;
  monthly: PeriodRegistrationStat;
  yearly: PeriodRegistrationStat;
}

export interface RegistrationsSummaryResponse {
  success: boolean;
  data: RegistrationsSummaryData;
}

export interface DashboardSummaryResponse {
  success: boolean;
  data: {
    exams: ExamSummaryData;
    registrations: RegistrationsSummaryData;
    top_courses: CourseExamSummaryItem[];
  };
}

export interface ApiError extends Error {
  statusCode?: number | undefined;
  details?: unknown | undefined;
  errors?: Record<string, string[]> | undefined;
}

export interface AuthenticatedClient {
  id: string;
  name: string;
  permissions: string[];
  allowedIps: string[] | null;
}
