# ExampleHR — TimeOff Management System

A full-stack time-off management system built with NestJS microservices, SQLite, and React 18. Employees submit leave requests, managers approve or reject them in real-time. **HCM is the single source of truth for leave balances** — balances are always fetched live from HCM and written back on every approval. A local SQLite cache covers HCM downtime and tracks in-flight pending days that HCM has no visibility into.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  React 18 Frontend  (Vite + TailwindCSS)    :5173           │
│  React Query · Socket.io-client · React Router              │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP REST + WebSocket
┌─────────────────────▼───────────────────────────────────────┐
│  API Gateway  (NestJS HTTP)                  :3000           │
│  JWT Auth · Guards · WS EventsGateway · Swagger             │
└────────────┬────────────────────────────────────────────────┘
             │ NestJS TCP
┌────────────▼────────────────────────────────────────────────┐
│  Time-Off Microservice  (NestJS TCP)         :3001           │
│  SQLite · TypeORM · Scheduled HCM Sync · Idempotency        │
└────────────┬────────────────────────────────────────────────┘
             │ HTTP REST
┌────────────▼────────────────────────────────────────────────┐
│  HCM Mock Server  (NestJS HTTP)              :3002           │
│  SQLite · HMAC Webhooks · Anniversary/Refresh Triggers       │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Concern | Approach |
|---|---|
| Balance source of truth | HCM — fetched live on every read; local cache refreshed automatically |
| HCM downtime | Local cache fallback (transparent to the user); `pendingDays` always tracked locally |
| Third-party HCM changes | HCM pushes HMAC-signed webhooks (anniversary bonuses, year-reset, etc.) → gateway updates local cache + notifies employee via WebSocket |
| Write-back to HCM | Every approval calls HCM `PUT /hcm/balance` in the same transaction; `hcmSyncStatus` field records the outcome |
| Real-time updates | Socket.io — per-user rooms, JWT auth on handshake |
| Race conditions | Optimistic locking (`@VersionColumn`) on `LeaveBalance` |
| Idempotency | HMAC-derived key on `(employeeId, locationId, leaveType, dates)`; only blocks re-submits with PENDING/APPROVED status so users can re-apply after a rejection |
| Security | Bcrypt passwords, JWT access (15 m) + refresh (7 d), HMAC webhook verification |
| Error visibility | Stack traces only when `DEBUG=true` (or `VITE_DEBUG=true` in frontend) |

---

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10 (or pnpm/yarn)

---

## Local Setup

### 1. Clone and install

```bash
git clone <repo> ExampleHR
cd ExampleHR

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

Edit `backend/.env` — at minimum change `JWT_SECRET` and `HCM_WEBHOOK_SECRET` for any non-local environment.

### 3. Run all services

Open three terminals:

```bash
# Terminal 1 — HCM Mock (port 3002)
cd backend && npm run start:hcm-mock

# Terminal 2 — Time-Off microservice (TCP 3001)
cd backend && npm run start:time-off

# Terminal 3 — API Gateway (port 3000)
cd backend && npm run start:api
```

Then start the frontend:

```bash
# Terminal 4 — Frontend dev server (port 5173)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `GATEWAY_PORT` | `3000` | API Gateway HTTP port |
| `NODE_ENV` | `development` | Environment |
| `DEBUG` | `true` | Expose error stack traces in responses |
| `JWT_SECRET` | — | **Change in production** |
| `JWT_EXPIRY` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifetime |
| `HCM_WEBHOOK_SECRET` | — | HMAC secret shared with HCM mock |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |
| `TIME_OFF_TCP_HOST` | `localhost` | Time-off service host |
| `TIME_OFF_TCP_PORT` | `3001` | Time-off TCP port |
| `HCM_BASE_URL` | `http://localhost:3002` | HCM mock base URL |
| `HCM_MOCK_PORT` | `3002` | HCM mock HTTP port |
| `HCM_API_KEY` | `mock-api-key-for-development` | API key for HCM calls |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `/api` | API base path (proxied by Vite) |
| `VITE_WS_URL` | `http://localhost:3000` | WebSocket server URL |
| `VITE_DEBUG` | `false` | Show error details in UI |

---

## Running Tests

```bash
cd backend

# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

Tests use an in-memory SQLite database — no external services required.

---

## API Reference

Swagger UI is available at [http://localhost:3000/api/docs](http://localhost:3000/api/docs) when the gateway is running.

### Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register a new employee |
| POST | `/auth/login` | Login, receive access + refresh tokens |
| POST | `/auth/refresh` | Refresh access token |
| GET | `/auth/me` | Get current user profile |

### Time-Off Requests

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/requests` | Employee+ | List my requests |
| POST | `/requests` | Employee+ | Submit a new request |
| GET | `/requests/:id` | Employee+ | Get request by ID |
| PATCH | `/requests/:id/approve` | Manager+ | Approve a request |
| PATCH | `/requests/:id/reject` | Manager+ | Reject a request |
| PATCH | `/requests/:id/cancel` | Employee+ | Cancel own request |

### Balances

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/balances/me` | Employee+ | Fetch my balances — pulls live from HCM, refreshes local cache, then returns local (which includes `pendingDays` HCM doesn't know about) |
| GET | `/balances/:employeeId` | Manager+ | Same HCM-first fetch for any employee |
| PATCH | `/balances/:employeeId` | Admin | Override a balance manually (local only) |

> **How the cache works:** HCM stores *remaining available* days (i.e. after approved deductions). ReadyOn reconstructs the full allocation as `totalDays = hcm.balance + local.usedDays` and adds `pendingDays` on top. When HCM is unreachable the last cached values are served and a warning is logged — no error is returned to the user.

### HCM Integration

The integration is **two-way**:

| Direction | Mechanism | When |
|---|---|---|
| ReadyOn → HCM | `PUT /hcm/balance/:employeeId/:locationId` (real-time) | Every approval — deducts approved days from HCM |
| HCM → ReadyOn (pull) | `GET /hcm/balance/:employeeId/:locationId` (real-time) | Every balance read — fetched fresh, cache refreshed |
| HCM → ReadyOn (push) | HMAC-signed webhook `POST /hcm/webhook/balance-update` | HCM-initiated events: anniversary bonus, year-reset, any external change |
| HCM → ReadyOn (bulk) | `POST /hcm/batch` → full reconciliation | Manually triggered by admin or scheduled job |

**Gateway endpoints:**

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/hcm/webhook/balance-update` | HMAC `x-hcm-signature` header | Receive HCM balance-change webhook |
| POST | `/hcm/sync/batch` | Admin JWT | Trigger full batch reconciliation |
| GET | `/hcm/sync/logs` | Admin JWT | View HCM sync audit logs |

#### Triggering the webhook manually

The gateway verifies an HMAC-SHA256 signature over a canonical JSON body. Keys must appear in this exact order: `employeeId → locationId → leaveType → newBalance → triggeredAt`.

**Step 1 — Generate the signature** (reads `HCM_WEBHOOK_SECRET` from `backend/.env`):

```bash
BODY='{"employeeId":"f6ce4e20-8ca6-4143-ac71-f664cadb9f5c","locationId":"pk1234","leaveType":"VACATION","newBalance":18,"triggeredAt":"2026-04-08T10:00:00.000Z"}'

SIG=$(echo -n "$BODY" \
  | openssl dgst -sha256 -hmac "$(grep HCM_WEBHOOK_SECRET backend/.env | cut -d= -f2)" \
  | awk '{print $2}')

echo "Signature: $SIG"
```

**Step 2 — Send the request:**

```bash
curl -s -X POST http://localhost:3000/hcm/webhook/balance-update \
  -H 'Content-Type: application/json' \
  -H "x-hcm-signature: $SIG" \
  -d "$BODY" | jq
```

> The `$BODY` variable must be **identical** in both steps — any difference in whitespace, key order, or field values will produce a 401.

**Accepted `leaveType` values:** `VACATION` · `SICK` · `PERSONAL` · `MATERNITY` · `PATERNITY`

#### Easier alternative — use the HCM mock trigger (auto-signs for you)

```bash
curl -s -X POST http://localhost:3002/hcm/webhook/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "employeeId": "f6ce4e20-8ca6-4143-ac71-f664cadb9f5c",
    "locationId": "pk1234",
    "leaveType": "VACATION",
    "newBalance": 18
  }' | jq
```

Other simulation endpoints on the HCM mock (port 3002):

| Method | Path | Description |
|---|---|---|
| POST | `/hcm/webhook/trigger` | Push arbitrary balance change → gateway (auto-signs) |
| POST | `/hcm/simulate/anniversary/:employeeId` | Add bonus vacation days → push webhook |
| POST | `/hcm/simulate/year-reset` | Reset all balances for new year → push webhooks |
| POST | `/hcm/seed/:employeeId/:locationId` | Seed default balances for a new employee |

### WebSocket Events

Connect to `ws://localhost:3000` with `{ auth: { token: '<accessToken>' } }`.

| Event | Direction | Recipient | Payload |
|---|---|---|---|
| `request.created` | Server → Client | Manager (personal room + all managers) | `{ requestId, employeeId, leaveType, startDate, endDate, daysCount }` |
| `request.approved` | Server → Client | Employee (own room) + all managers | `{ requestId, status, managerNote }` |
| `request.rejected` | Server → Client | Employee (own room) + all managers | `{ requestId, status, managerNote }` |
| `request.cancelled` | Server → Client | Manager (personal room) | `{ requestId }` |
| `balance.updated` | Server → Client | Employee (own room) | `{ employeeId, locationId, leaveType, available, totalDays, usedDays, pendingDays }` |
| `balance.overdrawn-warning` | Server → Client | All admins | `{ employeeId, affectedRequests: string[] }` — fired when an HCM webhook lowers a balance below the sum of pending requests |
| `hcm.sync.completed` | Server → Client | All admins | `{ syncType, updated, errors }` — fired after a batch reconciliation finishes |

---

## Project Structure

```
ExampleHR/
├── backend/
│   ├── apps/
│   │   ├── api-gateway/          # HTTP REST + WebSocket server
│   │   ├── time-off/             # TCP microservice (business logic)
│   │   └── hcm-mock/             # Simulated HCM REST API
│   ├── libs/
│   │   └── common/               # Shared enums, constants, interfaces, crypto utils
│   ├── nest-cli.json
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/           # ErrorBoundary, Layout, BalanceCard, RequestCard, …
│   │   ├── context/              # AuthContext, SocketContext
│   │   ├── hooks/                # useAuth, useBalances, useRequests, useRealtimeRequests
│   │   ├── pages/                # LoginPage, DashboardPage, RequestsPage, ManagerPage, …
│   │   ├── services/             # axios clients: auth, requests, balance
│   │   └── types/                # TypeScript interfaces matching backend models
│   └── vite.config.ts
└── docs/
    └── TRD.md                    # Technical Requirements Document
```

---

## Security Notes

- Never commit `.env` files — `.env.example` files are provided as templates.
- Set `DEBUG=false` (and `VITE_DEBUG=false`) in any non-development environment.
- Rotate `JWT_SECRET` and `HCM_WEBHOOK_SECRET` before deploying.
- The HCM mock server is for **development/testing only** — it has no authentication by default.
