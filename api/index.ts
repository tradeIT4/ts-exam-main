import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";

// In Vercel serverless environment, use /tmp/exams.db if write access is required or DATABASE_PATH
const dbPath = process.env.DATABASE_PATH ?? (process.env.VERCEL ? "/tmp/exams.db" : "./data/exams.db");
const db = createDatabase(dbPath);
const app = createApp(db);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
