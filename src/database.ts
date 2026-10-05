import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashApiKey } from "./utils/crypto.js";

export function seedInitialData(db: DatabaseSync) {
  const courseCount = db.prepare("SELECT COUNT(*) AS total FROM courses").get() as { total: number };
  if (courseCount.total > 0) return;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const day = now.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  // 1. Seed Courses
  const courses = [
    { id: "c-math-101", name: "Mathematics & Analytical Reasoning", code: "MATH101", type: "stem" },
    { id: "c-cs-102", name: "Web Development & TypeScript", code: "CS102", type: "programming" },
    { id: "c-ds-103", name: "Data Science & Machine Learning", code: "DS103", type: "data" },
    { id: "c-sec-104", name: "Cybersecurity Fundamentals", code: "SEC104", type: "security" },
    { id: "c-eng-105", name: "Business English & Communication", code: "ENG105", type: "business" },
    { id: "c-db-106", name: "Database Engineering & SQL", code: "DB106", type: "programming" },
  ];

  const insertCourse = db.prepare("INSERT OR IGNORE INTO courses (id, name, code, type, created_at) VALUES (:id, :name, :code, :type, :created_at)");
  for (const c of courses) {
    insertCourse.run({ ...c, created_at: new Date(Date.UTC(year, 0, 1)).toISOString() });
  }

  // 2. Seed Default Demo API Client (Key: demo_api_token_2026)
  const defaultClient = {
    id: "client-demo-2026",
    name: "Admin & Dashboard Default Client",
    api_key_hash: hashApiKey("demo_api_token_2026"),
    status: "active",
    allowed_ips: null,
    permissions: "read:all,write:all",
    last_used_at: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.prepare(`
    INSERT OR IGNORE INTO api_clients (id, name, api_key_hash, status, allowed_ips, permissions, last_used_at, expires_at, created_at, updated_at)
    VALUES (:id, :name, :api_key_hash, :status, :allowed_ips, :permissions, :last_used_at, :expires_at, :created_at, :updated_at)
  `).run(defaultClient);

  // 3. Seed Student Registrations across Weekly, Monthly, and Yearly comparison windows
  const insertReg = db.prepare(`
    INSERT OR IGNORE INTO registrations (id, student_id, student_name, email, phone, course_id, registered_at)
    VALUES (:id, :student_id, :student_name, :email, :phone, :course_id, :registered_at)
  `);

  let regId = 1;
  // A. Current Week (185 registrations)
  for (let i = 0; i < 185; i++) {
    const course = courses[i % courses.length]!;
    const offsetDay = (i % 6);
    const regDate = new Date(Date.UTC(year, month, date + diffToMonday + offsetDay, 9 + (i % 8), i % 60, 0));
    insertReg.run({
      id: `reg-cw-${regId++}`,
      student_id: `STD-CW-${i + 1}`,
      student_name: `Student CW ${i + 1}`,
      email: `student.cw${i + 1}@example.com`,
      phone: `+1555000${(1000 + i).toString()}`,
      course_id: course.id,
      registered_at: regDate.toISOString(),
    });
  }

  // B. Previous Week (160 registrations)
  for (let i = 0; i < 160; i++) {
    const course = courses[i % courses.length]!;
    const offsetDay = (i % 6);
    const regDate = new Date(Date.UTC(year, month, date + diffToMonday - 7 + offsetDay, 9 + (i % 8), i % 60, 0));
    insertReg.run({
      id: `reg-pw-${regId++}`,
      student_id: `STD-PW-${i + 1}`,
      student_name: `Student PW ${i + 1}`,
      email: `student.pw${i + 1}@example.com`,
      phone: `+1555001${(1000 + i).toString()}`,
      course_id: course.id,
      registered_at: regDate.toISOString(),
    });
  }

  // C. Remainder of Current Month (to reach 720 monthly total)
  const remainingThisMonth = 720 - 185;
  for (let i = 0; i < remainingThisMonth; i++) {
    const course = courses[i % courses.length]!;
    const dayInMonth = (i % 20) + 1;
    const regDate = new Date(Date.UTC(year, month, dayInMonth, 10, i % 60, 0));
    insertReg.run({
      id: `reg-cm-${regId++}`,
      student_id: `STD-CM-${i + 1}`,
      student_name: `Student CM ${i + 1}`,
      email: `student.cm${i + 1}@example.com`,
      phone: `+1555002${(1000 + i).toString()}`,
      course_id: course.id,
      registered_at: regDate.toISOString(),
    });
  }

  // D. Remainder of Previous Month (to reach 650 previous month total)
  const remainingPrevMonth = 650 - 160;
  for (let i = 0; i < remainingPrevMonth; i++) {
    const course = courses[i % courses.length]!;
    const dayInMonth = (i % 25) + 1;
    const regDate = new Date(Date.UTC(year, month - 1, dayInMonth, 11, i % 60, 0));
    insertReg.run({
      id: `reg-pm-${regId++}`,
      student_id: `STD-PM-${i + 1}`,
      student_name: `Student PM ${i + 1}`,
      email: `student.pm${i + 1}@example.com`,
      phone: `+1555003${(1000 + i).toString()}`,
      course_id: course.id,
      registered_at: regDate.toISOString(),
    });
  }

  // E. Previous Year Sample
  for (let i = 0; i < 590; i++) {
    const course = courses[i % courses.length]!;
    const m = i % 12;
    const regDate = new Date(Date.UTC(year - 1, m, (i % 28) + 1, 12, 0, 0));
    insertReg.run({
      id: `reg-py-${regId++}`,
      student_id: `STD-PY-${i + 1}`,
      student_name: `Student PY ${i + 1}`,
      email: `student.py${i + 1}@example.com`,
      phone: `+1555004${(1000 + i).toString()}`,
      course_id: course.id,
      registered_at: regDate.toISOString(),
    });
  }

  // 4. Seed Online Exam Results for EACH Course
  const insertExam = db.prepare(`
    INSERT OR IGNORE INTO exam_results (id, student_id, course_id, score, pass_mark, status, taken_at)
    VALUES (:id, :student_id, :course_id, :score, :pass_mark, :status, :taken_at)
  `);

  let examId = 1;
  const coursePerformanceConfig = [
    { course: courses[0]!, totalStudents: 150, passRatio: 0.84, baseScore: 78 },
    { course: courses[1]!, totalStudents: 180, passRatio: 0.88, baseScore: 82 },
    { course: courses[2]!, totalStudents: 120, passRatio: 0.79, baseScore: 74 },
    { course: courses[3]!, totalStudents: 95, passRatio: 0.82, baseScore: 76 },
    { course: courses[4]!, totalStudents: 110, passRatio: 0.91, baseScore: 85 },
    { course: courses[5]!, totalStudents: 140, passRatio: 0.86, baseScore: 80 },
  ];

  for (const cfg of coursePerformanceConfig) {
    for (let i = 0; i < cfg.totalStudents; i++) {
      const isPassed = i < Math.floor(cfg.totalStudents * cfg.passRatio);
      const score = isPassed
        ? Math.min(100, Math.floor(cfg.baseScore + (i % 18) - 5))
        : Math.max(15, Math.floor(48 - (i % 30)));
      const passMark = 50;
      const status = score >= passMark ? "passed" : "failed";
      const dayOffset = (i % 7);
      const examDate = new Date(Date.UTC(year, month, date + diffToMonday + dayOffset, 14, (i * 3) % 60, 0));

      insertExam.run({
        id: `exam-${examId++}`,
        student_id: `STD-EX-${cfg.course.id}-${i + 1}`,
        course_id: cfg.course.id,
        score,
        pass_mark: passMark,
        status,
        taken_at: examDate.toISOString(),
      });
    }
  }
}

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

    CREATE TABLE IF NOT EXISTS certifications (
      registration_id TEXT PRIMARY KEY REFERENCES registrations(id),
      status TEXT NOT NULL DEFAULT 'hold' CHECK(status IN ('hold', 'active')),
      access_code_hash TEXT UNIQUE,
      updated_at TEXT NOT NULL
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

  // Auto seed in production and local persistent database
  if (filename !== ":memory:") {
    seedInitialData(db);
  }

  return db;
}

export type ExamDatabase = ReturnType<typeof createDatabase>;
