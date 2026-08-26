import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function createDatabase(filename = process.env.DATABASE_PATH ?? "./data/exams.db") {
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      course_id TEXT NOT NULL REFERENCES courses(id),
      registered_at TEXT NOT NULL,
      UNIQUE(student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS exam_results (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id),
      score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
      pass_mark REAL NOT NULL CHECK(pass_mark >= 0 AND pass_mark <= 100),
      status TEXT NOT NULL CHECK(status IN ('passed', 'failed')),
      taken_at TEXT NOT NULL,
      UNIQUE(student_id, course_id, taken_at)
    );

    CREATE TABLE IF NOT EXISTS api_clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      api_key_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('active', 'revoked', 'suspended')) DEFAULT 'active',
      allowed_ips TEXT,
      permissions TEXT NOT NULL DEFAULT 'read:all',
      last_used_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_logs (
      id TEXT PRIMARY KEY,
      api_client_id TEXT REFERENCES api_clients(id),
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      ip_address TEXT,
      requested_at TEXT NOT NULL,
      response_time_ms REAL
    );

    CREATE INDEX IF NOT EXISTS idx_courses_type ON courses(type);
    CREATE INDEX IF NOT EXISTS idx_registrations_date ON registrations(registered_at);
    CREATE INDEX IF NOT EXISTS idx_registrations_course_date ON registrations(course_id, registered_at);
    CREATE INDEX IF NOT EXISTS idx_results_date_status ON exam_results(taken_at, status);
    CREATE INDEX IF NOT EXISTS idx_results_course_date ON exam_results(course_id, taken_at);
    CREATE INDEX IF NOT EXISTS idx_api_clients_key_hash ON api_clients(api_key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_logs_client_time ON api_logs(api_client_id, requested_at);
    CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_logs(endpoint, requested_at);
  `);
  return db;
}

export type ExamDatabase = ReturnType<typeof createDatabase>;
