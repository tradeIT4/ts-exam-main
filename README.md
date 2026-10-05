# Online Exam & Registration Reporting REST API

A secure, high-performance, read-only REST API built with Node.js and TypeScript. It enables third-party systems and dashboards to query aggregated statistics for online exams, course performance, and student registration trends without direct database access or exposure of sensitive student PII.

---

## Architecture Overview

The API is built using a clean, layered Service/Repository architecture:

* **Database Layer (`src/database.ts`)**: Built-in SQLite (`node:sqlite`), optimized composite indices, WAL journal mode.
* **Service Layer (`src/services/`)**: SQL aggregation queries for exams (`ExamService`), registration trend deltas (`RegistrationService`), unified dashboard (`DashboardService`), and API client credential lifecycle (`ClientService`).
* **Controller Layer (`src/controllers/`)**: Small, focused request dispatchers with validated parameter handling.
* **Middleware Pipeline (`src/middlewares/`)**:
  * **Authentication (`auth.ts`)**: Bearer token and `X-API-Key` verification with SHA-256 key hashing, expiration, status, IP restrictions, and granular read permissions (`read:exams`, `read:registrations`, `read:reports`, `read:all`).
  * **Rate Limiter (`rate-limiter.ts`)**: In-memory sliding window limiter with standard `X-RateLimit-*` and `Retry-After` headers.
  * **Audit Logger (`audit-logger.ts`)**: Structured request logging to the `api_logs` table.
  * **Security & HTTPS (`security.ts`)**: CORS, HTTPS enforcement, and security headers (`X-Content-Type-Options`, `X-Frame-Options`).
* **Validation & Serialization (`src/validation.ts`, `src/serializers/`)**: Strict date parsing (YYYY-MM-DD / ISO), range verification, and standardized response envelopes.

---

## Getting Started

Requires Node.js 22.5 or newer.

```bash
# Install dependencies
npm install

# Run locally in development mode
npm run dev

# Run automated test suite
npm test

# Build for production
npm run build
npm start
```

The admin analytics dashboard is available at `http://localhost:3000/admin/data-analytics`. It includes course-level exam pass/fail charts and tables, plus student registration charts and tables with optional date filtering.

---

## API Client Management (CLI)

Certification controls are available at `/admin/certifications`. All registrations, including existing ones, default to **On hold**. An admin can grant access, restore the hold, and generate a private student status code. Students check their current status at `/student/certifications` using that code. Codes are stored as hashes; generating another code invalidates the previous one.

`GET /api/v1/certifications?page=1&limit=25` requires `read:certifications` or `read:all`. `PUT /api/v1/certifications/:registrationId` accepts `{ "status": "hold" | "active", "rotateCode": true | false }` and requires `write:certifications` or `write:all`. `POST /api/v1/student/certifications/status` accepts `{ "accessCode": "..." }` and returns only `status` and `accessAllowed`, without certification details. `POST /api/v1/student/certifications/view` accepts the same code and returns course details only when active; held certifications return HTTP 403. Both routes check the stored hold on every request and use `Cache-Control: no-store`. The student page hides certification details while held or when verification fails and rechecks every 15 seconds while visible. This feature manages certification visibility and approval; certificate file generation and downloads are not part of this reporting API.

Generate and manage API keys for third-party systems:

```bash
# Create an API client with specific permissions
npm run client:manage -- create "Analytics Partner" --permissions "read:exams,read:registrations"

# Create a client restricted to specific IP addresses
npm run client:manage -- create "Internal Microservice" --allowed-ips "192.168.1.50,10.0.0.1"

# List all registered API clients
npm run client:manage -- list

# Revoke an API client
npm run client:manage -- revoke <client_id>
```

---

## Third-Party Read-Only Endpoints

All requests require authentication:

```http
Authorization: Bearer <YOUR_API_TOKEN>
```
*(or via header `X-API-Key: <YOUR_API_TOKEN>`)*

### 1. Online Exams Summary
`GET /api/v1/exams/summary`

Query parameters:
* `period`: `today`, `weekly`, `monthly`, `yearly`
* `from_date`: `YYYY-MM-DD` or ISO 8601 string
* `to_date`: `YYYY-MM-DD` or ISO 8601 string
* `course_id`: Filter by specific course ID

**Example Response (`200 OK`):**
```json
{
  "success": true,
  "period": "monthly",
  "from_date": "2026-08-01",
  "to_date": "2026-08-31",
  "data": {
    "total_exams": 42,
    "students_taken": 1450,
    "passed": 1180,
    "failed": 270,
    "pass_rate": 81.38,
    "fail_rate": 18.62
  }
}
```

---

### 2. Exams By Course
`GET /api/v1/exams/by-course`

Query parameters:
* `page`: Page number (default: `1`)
* `per_page`: Items per page (default: `50`, max: `100`)
* `from_date`, `to_date`, `period`, `course_id`

**Example Response (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "course_id": "c-math-101",
      "course_name": "Mathematics",
      "course_code": "MATH101",
      "exam_date": "2026-08-24",
      "students_taken": 120,
      "passed": 100,
      "failed": 20,
      "pass_rate": 83.33,
      "fail_rate": 16.67
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 1,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

---

### 3. Student Registrations Summary
`GET /api/v1/registrations/summary`

Returns weekly, monthly, and yearly current vs. previous registration counts and percentage growth rates.

**Example Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "weekly": {
      "current": 185,
      "previous": 160,
      "change_percentage": 15.63
    },
    "monthly": {
      "current": 720,
      "previous": 650,
      "change_percentage": 10.77
    },
    "yearly": {
      "current": 6850,
      "previous": 5900,
      "change_percentage": 16.10
    }
  }
}
```

---

### 4. Executive Dashboard Summary
`GET /api/v1/dashboard/summary`

Combines exam totals, registration growth deltas, and top courses in a single lightweight payload.

---

## Standard Error Format

```json
{
  "success": false,
  "message": "from_date must be earlier than or equal to to_date",
  "errors": {
    "from_date": [
      "from_date must be earlier than or equal to to_date"
    ]
  }
}
```

### HTTP Status Codes
* `200` - OK
* `400` - Bad Request / Validation Failure
* `401` - Authentication Required
* `403` - Permission Denied / IP Restriction / Token Revoked
* `404` - Route Not Found
* `422` - Unprocessable Entity
* `429` - Too Many Requests (Rate Limit Exceeded)
* `500` - Internal Server Error

---

## OpenAPI Specification

Full machine-readable specification is available in [`openapi.yaml`](./openapi.yaml).
