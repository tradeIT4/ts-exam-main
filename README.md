# Online Exam Reporting REST API

A dependency-light TypeScript API that other projects, dashboards, and platforms can use to record courses, student registrations, and exam results. It calculates pass/fail status and provides course-level and time-based reports.

## Run locally

Requires Node.js 22.5 or newer.

```bash
npm install
npm run dev
```

The API runs at `http://localhost:3000` and stores data in `data/exams.db`. Copy `.env.example` values into your environment to change the port, database, allowed origins, or API key.

For production:

```bash
npm run build
npm start
```

## Main endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST`, `GET` | `/api/v1/courses` | Create/list courses |
| `POST`, `GET` | `/api/v1/registrations` | Register/list students |
| `POST`, `GET` | `/api/v1/exam-results` | Record/list exam attempts |
| `GET` | `/api/v1/reports/exams` | Passed/failed totals, pass rate, course breakdown, timeline |
| `GET` | `/api/v1/reports/registrations` | Registration totals, course breakdown, timeline |
| `GET` | `/api/v1/dashboard` | Both reports in one response |

List and report endpoints accept `courseId`, `courseType`, `from`, and `to`. Exam endpoints also accept `status=passed|failed`. Report endpoints accept `period=daily|weekly|monthly|quarterly|yearly`. List endpoints support `page` and `limit` (maximum 100).

Registrations represent student applications/enrolments for a course. Registration reports return both `totalRegistrations` and `uniqueStudents`; exam reports return the number of attempts as `total` and the distinct learner count as `uniqueStudents`. Every breakdown includes course ID, code, name, and type so another system can display or process the results.

Example report:

```text
GET /api/v1/reports/exams?courseType=programming&status=passed&period=monthly&from=2026-01-01&to=2026-12-31
```

Quarterly combined dashboard example:

```text
GET /api/v1/dashboard?period=quarterly&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
X-API-Key: your-shared-secret
```

Example registration:

```json
{
  "studentId": "S-001",
  "studentName": "Amina Yusuf",
  "email": "amina@example.com",
  "phone": "+254700000000",
  "courseId": "course-uuid",
  "registeredAt": "2026-08-24T09:00:00Z"
}
```

Example exam result (status is calculated by the API):

```json
{
  "studentId": "S-001",
  "courseId": "course-uuid",
  "score": 82,
  "passMark": 50,
  "takenAt": "2026-08-24T12:00:00Z"
}
```

To protect a shared deployment, set `API_KEY`; clients must then include `X-API-Key`. Configure `ALLOWED_ORIGINS` as a comma-separated list of dashboard/platform origins instead of `*`.

See [openapi.yaml](./openapi.yaml) for the machine-readable API contract.
