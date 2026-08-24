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

    CREATE INDEX IF NOT EXISTS idx_courses_type ON courses(type);
    CREATE INDEX IF NOT EXISTS idx_registrations_date ON registrations(registered_at);
    CREATE INDEX IF NOT EXISTS idx_results_date_status ON exam_results(taken_at, status);
    CREATE INDEX IF NOT EXISTS idx_results_course ON exam_results(course_id);
  `);
  return db;
}

export type ExamDatabase = ReturnType<typeof createDatabase>;
