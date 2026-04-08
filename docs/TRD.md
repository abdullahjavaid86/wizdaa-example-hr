# Technical Requirements Document: ExampleHR Time-Off Microservice

**Version**: 1.0
**Date**: April 2026
**Status**: Approved for Implementation

---

## 1. Problem Statement

ExampleHR serves as the primary interface for employees to submit and track time-off requests. The Human Capital Management (HCM) system (e.g., Workday, SAP) is the authoritative **source of truth** for employment data and leave balances. The core challenge is **bidirectional balance integrity**:

- An employee requests 2 days on ExampleHR → HCM must agree the balance exists.
- HCM can update balances independently (work anniversaries, year-start resets, manual adjustments) without ExampleHR being the initiator.
- HCM may or may not reliably return errors for invalid balance draws — we must be **defensive**.

---

## 2. Stakeholders & User Personas

| Persona      | Goal                                                              |
|--------------|-------------------------------------------------------------------|
| **Employee** | See accurate balance, submit requests, get instant feedback       |
| **Manager**  | Approve/reject requests with confidence that data is valid        |
| **Admin**    | Trigger manual reconciliation, view sync logs                     |
| **HCM**      | Push real-time balance changes, serve batch exports               |

---

## 3. System Architecture

### 3.1 Service Map

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React 18 + Vite)                                          │
│  HTTP REST + WebSocket (Socket.IO)                                  │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP :3000
┌────────────────────────▼────────────────────────────────────────────┐
│  api-gateway (NestJS HTTP + WS)                                     │
│  • JWT auth (RS256)                  • Role guard (EMPLOYEE/MANAGER)│
│  • WebSocket gateway (Socket.IO)     • HTTP exception filter        │
│  • HCM webhook receiver              • Rate limiting (helmet)       │
└──────┬────────────────────────────────────────┬──────────────────────┘
       │ TCP :3001                               │ HTTP :3002
┌──────▼──────────────────────┐   ┌─────────────▼──────────────────────┐
│  time-off (NestJS TCP µsvc) │   │  hcm-mock (NestJS HTTP server)     │
│  • Request lifecycle        │   │  • GET  /hcm/balance/:emp/:loc      │
│  • Balance management       │   │  • POST /hcm/balance/:emp/:loc      │
│  • HCM sync client          │   │  • POST /hcm/batch                  │
│  • Cron reconciliation      │   │  • POST /hcm/webhook/trigger        │
│  • SQLite (time_off.db)     │   │  • POST /hcm/simulate/anniversary   │
└─────────────────────────────┘   │  • SQLite (hcm_mock.db)            │
                                   └────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer         | Technology                                              |
|---------------|---------------------------------------------------------|
| Runtime       | Node.js 20 LTS                                          |
| Framework     | NestJS 10 (monorepo)                                    |
| Database      | TypeORM 0.3 + better-sqlite3 9                          |
| Auth          | @nestjs/jwt + @nestjs/passport + passport-jwt           |
| Scheduling    | @nestjs/schedule (cron)                                 |
| WebSocket     | @nestjs/websockets + @nestjs/platform-socket.io         |
| Validation    | class-validator + class-transformer                     |
| HTTP Client   | axios 1.x                                               |
| Security      | helmet, express-rate-limit                              |
| Frontend      | React 18, Vite 5, TanStack Query 5, React Router 6     |
| Styling       | Tailwind CSS 3                                          |
| Forms         | React Hook Form 7 + Zod 3                               |
| Real-time     | socket.io-client 4                                      |
| Package Mgr   | pnpm 9 (workspaces)                                     |
| Testing       | Jest + Supertest + @nestjs/testing                      |

---

## 4. Data Model

### 4.1 Employee

```
employees
├── id            UUID PK
├── name          VARCHAR(255)
├── email         VARCHAR(255) UNIQUE
├── passwordHash  TEXT
├── role          ENUM('EMPLOYEE','MANAGER','ADMIN')
├── locationId    VARCHAR(100)          ← e.g. "US-NYC", "UK-LON"
├── managerId     UUID FK (self)
├── hireDate      DATE
├── createdAt     DATETIME
└── updatedAt     DATETIME
```

### 4.2 LeaveBalance

```
leave_balances
├── id            UUID PK
├── employeeId    UUID FK
├── locationId    VARCHAR(100)
├── leaveType     ENUM('VACATION','SICK','PERSONAL','MATERNITY','PATERNITY')
├── year          INTEGER               ← balance year (2024, 2025…)
├── totalDays     DECIMAL(5,1)
├── usedDays      DECIMAL(5,1)          ← approved/taken days
├── pendingDays   DECIMAL(5,1)          ← days locked by PENDING requests
├── version       INTEGER               ← optimistic locking
├── lastHcmSync   DATETIME
├── createdAt     DATETIME
└── updatedAt     DATETIME
UNIQUE (employeeId, locationId, leaveType, year)
```

### 4.3 TimeOffRequest

```
time_off_requests
├── id              UUID PK
├── idempotencyKey  VARCHAR(64) INDEX    ← SHA-256: employeeId+start+end+type
│                                        (not UNIQUE at DB level — allows re-submit
│                                         after REJECTED/CANCELLED; app-layer check
│                                         blocks duplicates in PENDING/APPROVED state)
├── employeeId      UUID FK
├── locationId      VARCHAR(100)
├── leaveType       ENUM(...)
├── startDate       DATE
├── endDate         DATE
├── daysCount       DECIMAL(5,1)
├── status          ENUM('PENDING','APPROVED','REJECTED','CANCELLED')
├── managerId       UUID FK (nullable)
├── reason          TEXT
├── managerNote     TEXT
├── hcmSyncStatus   ENUM('PENDING','SYNCED','FAILED')
├── hcmTransactionId VARCHAR(255) (nullable)
├── createdAt       DATETIME
└── updatedAt       DATETIME
```

### 4.4 HcmSyncLog

```
hcm_sync_logs
├── id          UUID PK
├── syncType    ENUM('REALTIME','BATCH','WEBHOOK')
├── employeeId  UUID (nullable)
├── locationId  VARCHAR(100) (nullable)
├── status      ENUM('SUCCESS','FAILED','PARTIAL')
├── payload     TEXT (JSON)
├── response    TEXT (JSON)
├── error       TEXT
├── durationMs  INTEGER
└── createdAt   DATETIME
```

---

## 5. API Specification

### 5.1 Authentication

| Method | Path              | Auth | Description                |
|--------|-------------------|------|----------------------------|
| POST   | /auth/register    | —    | Register new employee      |
| POST   | /auth/login       | —    | Login, returns JWT         |
| GET    | /auth/me          | JWT  | Current user profile       |
| POST   | /auth/refresh     | JWT  | Refresh access token       |

### 5.2 Employees

| Method | Path              | Auth          | Description                |
|--------|-------------------|---------------|----------------------------|
| GET    | /employees        | JWT+MANAGER   | List all employees         |
| GET    | /employees/:id    | JWT           | Get employee profile       |

### 5.3 Leave Balances

| Method | Path                               | Auth          | Description                     |
|--------|------------------------------------|---------------|---------------------------------|
| GET    | /balances/me                       | JWT           | Fetch my balances — pulls live from HCM, refreshes local cache, returns local (includes `pendingDays` HCM doesn't track) |
| GET    | /balances/:employeeId              | JWT+MANAGER   | Same HCM-first fetch for any employee |
| PATCH  | /balances/:employeeId              | JWT+ADMIN     | Manual admin override (local only; triggers `balance.updated` WS event) |

> `GET /balances/me` **always calls HCM first**. The local SQLite row is refreshed in-place (`totalDays = hcm.balance + usedDays`). If HCM is unreachable the cached row is returned silently and a warning is logged.

### 5.4 Time-Off Requests

| Method | Path                          | Auth          | Description                     |
|--------|-------------------------------|---------------|---------------------------------|
| POST   | /requests                     | JWT+EMPLOYEE  | Submit new request              |
| GET    | /requests                     | JWT           | My requests (employee) / all pending (manager) |
| GET    | /requests/:id                 | JWT           | Get request detail              |
| PATCH  | /requests/:id/cancel          | JWT+EMPLOYEE  | Cancel PENDING request          |
| PATCH  | /requests/:id/approve         | JWT+MANAGER   | Approve request                 |
| PATCH  | /requests/:id/reject          | JWT+MANAGER   | Reject request                  |
| GET    | /requests/pending             | JWT+MANAGER   | All pending requests in team    |

### 5.5 HCM Integration

| Method | Path                          | Auth          | Description                        |
|--------|-------------------------------|---------------|------------------------------------|
| POST   | /hcm/webhook/balance-update   | HMAC-SHA256   | HCM pushes balance change          |
| POST   | /hcm/sync/batch               | JWT+ADMIN     | Trigger full batch reconciliation  |
| GET    | /hcm/sync/logs                | JWT+ADMIN     | View sync logs                     |

### 5.6 HCM Mock Server (port 3002)

| Method | Path                                  | Description                                 |
|--------|---------------------------------------|---------------------------------------------|
| GET    | /hcm/balance/:empId/:locId            | Real-time balance for employee+location     |
| PUT    | /hcm/balance/:empId/:locId            | Update balance in mock HCM (after approval) |
| POST   | /hcm/batch                            | Full corpus of all balances                 |
| POST   | /hcm/simulate/anniversary/:empId      | Simulate work anniversary balance bonus     |
| POST   | /hcm/simulate/year-reset              | Simulate year-start balance reset           |
| POST   | /hcm/webhook/trigger                  | Trigger push to ExampleHR (tests only)      |

---

## 6. Key Flows & Sequence Diagrams

### 6.1 Request Submission (Happy Path)

```
Employee  →  API Gateway  →  time-off µsvc  →  hcm-mock
   │              │               │                │
   │  POST /requests               │                │
   │─────────────►│               │                │
   │              │  TCP: request.create            │
   │              │──────────────►│                │
   │              │               │  GET /balance/:type  (HCM primary)
   │              │               │───────────────►│
   │              │               │◄───────────────│
   │              │               │  effectiveAvail = hcm.balance - pendingDays
   │              │               │  (fallback: totalDays-usedDays-pendingDays
   │              │               │   if HCM is unreachable)
   │              │               │  Create PENDING│
   │              │               │  pendingDays++ │
   │              │◄──────────────│                │
   │  201 Created │               │                │
   │◄─────────────│               │                │
   │              │  WS: request.created → manager  │
```

### 6.2 Manager Approval (with HCM Validation)

```
Manager   →  API Gateway  →  time-off µsvc  →  hcm-mock
   │              │               │                │
   │  PATCH /requests/:id/approve  │                │
   │─────────────►│               │                │
   │              │  TCP: request.approve           │
   │              │──────────────►│                │
   │              │               │  GET /balance  │
   │              │               │───────────────►│
   │              │               │◄───────────────│
   │              │               │  (balance ok)  │
   │              │               │  Tx: APPROVED  │
   │              │               │  usedDays++    │
   │              │               │  pendingDays-- │
   │              │               │  PUT /balance  │
   │              │               │───────────────►│
   │              │               │◄───────────────│
   │              │◄──────────────│                │
   │  200 OK      │               │                │
   │◄─────────────│               │                │
   │              │  WS: request.approved (→ employee)
   │              │               │                │
```

### 6.3 HCM-Initiated Balance Update (Webhook)

```
hcm-mock  →  API Gateway  →  time-off µsvc  →  Employees (WS)
   │              │               │                │
   │  POST /hcm/webhook/balance-update             │
   │─────────────►│               │                │
   │              │ (verify HMAC) │                │
   │              │  TCP: balance.syncFromHcm       │
   │              │──────────────►│                │
   │              │               │  Update balance│
   │              │               │  Re-validate   │
   │              │               │  pending reqs  │
   │              │◄──────────────│                │
   │  200 OK      │               │                │
   │◄─────────────│               │                │
   │              │ WS: balance.updated ──────────►│
```

### 6.4 Batch Reconciliation (Cron / Manual)

```
CronJob / Admin  →  time-off µsvc  →  hcm-mock
   │                    │                │
   │  (scheduled daily) │                │
   │───────────────────►│                │
   │                    │  POST /hcm/batch
   │                    │───────────────►│
   │                    │◄───────────────│
   │                    │  (all balances)│
   │                    │  Upsert all    │
   │                    │  LeaveBalances │
   │                    │  Log sync      │
   │                    │  Re-validate   │
   │                    │  pending reqs  │
```

---

## 7. Balance Integrity Strategy

### 7.1 Layered Defense

| Layer | Mechanism | What It Guards Against |
|-------|-----------|------------------------|
| 1 | Idempotency key (SHA-256) on active statuses | Duplicate submissions — only blocks re-submit when a PENDING or APPROVED record exists for the same key; REJECTED/CANCELLED records do not block |
| 2 | Date-range overlap check | Overlapping PENDING/APPROVED requests for the same employee |
| 3 | **HCM real-time balance (primary)** `hcm.balance - pendingDays` | Requests exceeding HCM-authoritative available balance; `pendingDays` subtracted because HCM has no visibility into unresolved requests |
| 4 | Local cache fallback (HCM unreachable) | Unblocks legitimate submissions during HCM downtime using last-known cached balance |
| 5 | TypeORM `@VersionColumn` + serializable transaction | Concurrent approvals / balance writes racing each other |
| 6 | HCM balance check at approval time | Re-validates against HCM in the approval transaction; auto-rejects if HCM reports insufficient balance |
| 7 | Batch reconciliation (admin / cron) | Accumulated drift; `totalDays` overwritten with HCM value, overdrawn pending requests flagged |
| 8 | Inbound HCM webhook | HCM-initiated changes (anniversaries, year-resets, HR corrections) — cache refreshed, overdrawn pending requests flagged |

### 7.2 Optimistic Locking

Every write to `LeaveBalance` increments `version`. If two concurrent approval attempts load `version=5`, the second write will fail with `OptimisticLockVersionMismatch` and return HTTP 409 Conflict.

### 7.3 Available Balance Formula

**At submission time (HCM available):**
```
effectiveAvailable = hcm.balance - local.pendingDays
```
`hcm.balance` already reflects approved deductions. We subtract `pendingDays` because HCM has no knowledge of requests awaiting manager decision.

**Fallback (HCM unreachable):**
```
effectiveAvailable = totalDays - usedDays - pendingDays
```

**Cache reconstruction (on every balance read):**
```
local.totalDays = hcm.balance + local.usedDays
```
This keeps `totalDays` meaningful (the employee's full allocation) while letting the balance display `available = totalDays - usedDays - pendingDays` consistently.

### 7.4 HCM Mismatch Handling

**On every balance read (pull-on-read):**
`totalDays` is refreshed automatically (`hcm.balance + usedDays`). Drift is self-healing — no discrepancy survives beyond one read cycle.

**On inbound webhook or batch sync:**
1. Log discrepancy to `hcm_sync_logs`.
2. **Trust HCM** — overwrite `totalDays` with HCM value.
3. If any PENDING request now exceeds available balance, emit `balance.overdrawn-warning` to the admin room and log — do **not** auto-cancel; require manager action.

---

## 8. Security Design

| Concern              | Solution                                                          |
|----------------------|-------------------------------------------------------------------|
| Authentication       | JWT RS256, 15 min access token, 7 day refresh token              |
| Authorization        | Role-based guards (`EMPLOYEE`, `MANAGER`, `ADMIN`)               |
| HCM Webhook Auth     | HMAC-SHA256 signature on `X-HCM-Signature` header                |
| Rate Limiting        | `express-rate-limit`: 100 req/15min per IP                       |
| Security Headers     | `helmet` (HSTS, XSS protection, no-sniff, CSP)                   |
| CORS                 | Whitelist `FRONTEND_URL` env var only                            |
| Error Exposure       | Stack traces only when `DEBUG=true` or `NODE_ENV=development`    |
| Password Hashing     | `bcryptjs` with 12 salt rounds                                   |
| SQL Injection        | TypeORM parameterized queries (no raw string concatenation)       |
| Input Validation     | class-validator on all DTOs at controller boundary               |

---

## 9. Real-Time Events (WebSocket)

Each authenticated user joins `user:{id}`. Managers also join the shared `managers` room. Admins also join the `admins` room.

| Event                    | Payload                                                               | Recipients                          |
|--------------------------|-----------------------------------------------------------------------|-------------------------------------|
| `request.created`        | `{ requestId, employeeId, daysCount, leaveType, startDate, endDate }` | Manager (personal room) + all managers room |
| `request.approved`       | `{ requestId, status, managerNote }`                                  | Requesting employee + all managers  |
| `request.rejected`       | `{ requestId, status, managerNote }`                                  | Requesting employee + all managers  |
| `request.cancelled`      | `{ requestId }`                                                       | Manager (personal room)             |
| `balance.updated`        | `{ employeeId, locationId, leaveType, available, totalDays, usedDays, pendingDays }` | Affected employee |
| `balance.overdrawn-warning` | `{ employeeId, affectedRequests: string[] }`                       | All admins — fired when HCM webhook/batch lowers a balance below the sum of pending requests |
| `hcm.sync.completed`     | `{ syncType, updated, errors }`                                       | All admins — fired after batch reconciliation |

---

## 10. Challenges & Alternatives Considered

### Challenge 1: Balance Drift Between Systems

**Problem**: HCM can update balances (anniversaries, HR corrections) at any time without notifying ExampleHR.

**Chosen Solution**: Pull-on-read with push fallback. Every balance read fetches live from HCM and refreshes the local cache (`totalDays = hcm.balance + usedDays`). HCM also pushes HMAC-signed webhooks for autonomous changes (anniversary bonuses, year-resets). An admin-triggered batch endpoint covers bulk reconciliation.

**Alternatives Considered**:
- *Local cache as primary, periodic sync only*: Rejected — cache can be stale between sync runs; employees could see and act on incorrect balances.
- *Queue-based sync (Redis/RabbitMQ)*: Rejected — adds infrastructure complexity; overkill for SQLite-based deployment.

### Challenge 2: Concurrent Approval Race Condition

**Problem**: Two managers approve the same request simultaneously, or a manager approves while balance is being updated.

**Chosen Solution**: Optimistic locking (`@VersionColumn`) combined with serializable transactions for balance updates.

**Alternatives Considered**:
- *Pessimistic locking (SELECT FOR UPDATE)*: SQLite supports this partially; optimistic locking is simpler here.
- *Application-level mutex*: Not distributed-safe; fails in multi-instance deployments.

### Challenge 3: HCM Unreliability

**Problem**: HCM real-time API may not always return errors for insufficient balance, and may be temporarily down.

**Chosen Solution**: HCM is primary but never a single point of failure. If `GET /hcm/balance` times out or errors, the service silently falls back to the last local cached balance and logs a warning. The local cache is kept fresh by the pull-on-read strategy so fallback values are rarely stale. At submission, `hcm.balance - pendingDays` is evaluated; if HCM is down, `totalDays - usedDays - pendingDays` is used. At approval, HCM is always checked; if it reports insufficient balance the request is auto-rejected with a clear note.

**Alternatives Considered**:
- *Block requests entirely when HCM is down*: Rejected — poor UX; legitimate requests blocked unnecessarily.
- *Queue requests for deferred HCM validation*: Considered for future iteration; out of scope for v1.

### Challenge 4: Duplicate Request Submission

**Problem**: Network retries or double-clicks could create duplicate requests. A UNIQUE DB-level constraint would also prevent re-submission after a REJECTED or CANCELLED request for the same dates.

**Chosen Solution**: Idempotency key = SHA-256(`employeeId:startDate:endDate:leaveType`) stored with an index (not a UNIQUE constraint). The application layer checks for an existing record with the same key **and status IN (PENDING, APPROVED)** only. A re-submit after REJECTED/CANCELLED is allowed and creates a new record.

**Note**: We only apply idempotency to request creation (the most critical duplication risk), not to all endpoints.

### Challenge 5: Microservice Communication Without a Message Broker

**Problem**: We need services to communicate but can't introduce Kafka/RabbitMQ complexity.

**Chosen Solution**: NestJS built-in TCP transport for synchronous request-response. For events (balance updates), the API Gateway emits WebSocket events after receiving TCP responses.

**Alternatives Considered**:
- *HTTP proxy*: Avoided — adds latency and loses the type-safe NestJS message pattern.
- *Redis Pub/Sub*: Good future-state option; skipped to keep deployment to zero external dependencies.

---

## 11. Test Strategy

### 11.1 Test Layers

| Layer | Type | Tool | What It Tests |
|-------|------|------|---------------|
| Unit | Pure function | Jest | DTO validation, business logic (balance calc, idempotency key gen), date utilities |
| Service | Mocked dependencies | Jest + `@nestjs/testing` | `RequestsService`, `BalancesService`, `HcmService` in isolation |
| Integration | In-memory SQLite | Jest + TypeORM | DB interactions, transactions, optimistic lock conflicts |
| E2E | Running `api-gateway` | Jest + Supertest | Full HTTP flows: auth, submit, approve, reject, webhook |
| Contract | HTTP assertions | Jest + Supertest | HCM Mock endpoints respond as expected |

### 11.2 Coverage Target

- **Statements**: ≥ 85%
- **Branches**: ≥ 80%
- **Critical paths** (balance write, approval, webhook): 100%

### 11.3 Mock HCM Scenarios Tested

| Scenario | Test |
|----------|------|
| Sufficient balance → approval succeeds | `requests.e2e-spec.ts` |
| Insufficient balance (HCM error) → approval rejected | `requests.e2e-spec.ts` |
| HCM timeout → fallback to local balance | `hcm.service.spec.ts` |
| HCM webhook balance increase | `webhook.e2e-spec.ts` |
| HCM batch sync reconciliation | `batch-sync.e2e-spec.ts` |
| Work anniversary bonus push | `webhook.e2e-spec.ts` |
| Year-start reset | `batch-sync.e2e-spec.ts` |
| Duplicate request (idempotency) | `requests.e2e-spec.ts` |
| Concurrent approval (optimistic lock) | `balance.service.spec.ts` |

---

## 12. Deployment

### Environment Variables

| Variable              | Service        | Description                          |
|-----------------------|----------------|--------------------------------------|
| `NODE_ENV`            | all            | `production` / `development` / `test`|
| `DEBUG`               | api-gateway    | Expose error stacks in responses     |
| `JWT_SECRET`          | api-gateway    | JWT signing secret                   |
| `JWT_EXPIRY`          | api-gateway    | Access token TTL (default: `15m`)    |
| `JWT_REFRESH_EXPIRY`  | api-gateway    | Refresh token TTL (default: `7d`)    |
| `HCM_WEBHOOK_SECRET`  | api-gateway    | HMAC secret for HCM webhooks         |
| `HCM_BASE_URL`        | time-off       | Base URL of HCM (mock) server        |
| `HCM_API_KEY`         | time-off       | API key for HCM mock server          |
| `TIME_OFF_TCP_PORT`   | time-off       | TCP port (default: `3001`)           |
| `HCM_MOCK_PORT`       | hcm-mock       | HTTP port (default: `3002`)          |
| `FRONTEND_URL`        | api-gateway    | Allowed CORS origin                  |
| `GATEWAY_PORT`        | api-gateway    | HTTP port (default: `3000`)          |

---

## 13. Out of Scope (v1)

- Multi-tenant support
- Holiday calendar validation (dates are accepted as-is)
- Email notifications (WebSocket only for v1)
- Mobile app
- Audit log UI
- OAuth2 / SSO integration
