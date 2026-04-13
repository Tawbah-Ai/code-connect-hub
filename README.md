# Hybrid Remote Device Control System

A real-time remote control system for Android devices. A React dashboard authenticates users, lists paired devices, sends commands (touch, swipe, screenshot, file browse), and receives live screen frames from Android agents — all relayed through a Node.js backend over WebSocket.

## Architecture

```
┌──────────────────────────────┐
│  Dashboard (React/Vite :5000)│
│  ├─ REST  /backend-api/api/* │
│  └─ WS    /backend-api/ws   │
└─────────────┬────────────────┘
              │  Vite proxy (ws: true)
              ▼
┌──────────────────────────────┐
│  Backend (Express/Node :3001)│
│  ├─ JWT authentication       │
│  ├─ Device registry (in-mem) │
│  ├─ PostgreSQL persistence   │
│  │   (users, devices, codes) │
│  ├─ REST command endpoint    │
│  └─ WS binary frame relay    │
└─────────────┬────────────────┘
              │  WS /ws?token=<JWT>
              ▼
┌──────────────────────────────┐
│  Android Agent (Kotlin)      │
│  ├─ OkHttp REST + WebSocket  │
│  ├─ MediaProjection JPEG     │
│  │   binary streaming        │
│  └─ AccessibilityService     │
│     (touch/swipe execution)  │
└──────────────────────────────┘
```

### Data Flow

1. **Auth**: Dashboard/Android → `POST /api/auth/register` or `/login` → JWT returned
2. **WebSocket**: Both connect to `ws://backend:3001/ws?token=JWT`
3. **Screen Stream**: Android captures screen via MediaProjection → sends binary JPEG frames over WS → Backend relays to all same-user sockets (skipping sender) → Dashboard renders via blob URL
4. **Commands**: Dashboard → `POST /api/devices/:id/command` → Backend forwards `COMMAND` message over WS to Android → Android AccessibilityService executes touch/swipe → sends `COMMAND_RESULT` back

### Device Roles

- **OWNER** — First device registered for a user (typically the Dashboard)
- **CLIENT** — Subsequent devices (typically the Android agent)

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+

### Setup

```bash
# Install all dependencies
npm install
(cd backend && npm install)
(cd dashboard && npm install)

# Configure backend database
cat > backend/.env << 'EOF'
DATABASE_URL=postgresql://user:pass@localhost:5432/hybridcontrol
EOF

# Start everything (creates DB tables automatically)
./start.sh
```

Or start services individually:

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Dashboard
cd dashboard && npm run dev
```

- Dashboard: http://localhost:5000
- Backend API: http://localhost:3001/api
- WebSocket: ws://localhost:3001/ws

## Backend

Location: `backend/`

### API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register user + device → JWT |
| POST | `/api/auth/login` | Login + register/update device → JWT |
| GET | `/api/devices` | List user's devices |
| POST | `/api/devices/:deviceId/command` | Send command to connected device |
| DELETE | `/api/devices/:deviceId` | Remove device |
| POST | `/api/pairing/generate` | Generate 6-digit pairing code |
| POST | `/api/pairing/claim` | Claim pairing code, link device |
| WS | `/ws` | Authenticated WebSocket (binary frames + JSON commands) |
| GET | `/health` | Health check |

### Database Schema (auto-created on startup)

- **users** — `id`, `email`, `password_hash`, `created_at`
- **devices** — `device_id`, `user_id`, `device_name`, `model`, `os_version`, `role`, `status`, `last_heartbeat`
- **pairing_codes** — `id`, `owner_user_id`, `code`, `expires_at`, `used_at`, `used_by_device_id`

### Authentication

JWTs carry `{ userId, deviceId, email }`. Set `JWT_SECRET` env var for production. In development, an ephemeral secret is generated per process.

## Dashboard

Location: `dashboard/`

Built with React + Vite + TypeScript. All API/WebSocket traffic goes through `src/services/api.ts` and `src/services/wsClient.ts`. The Vite dev server proxies `/backend-api/*` to `localhost:3001` with WebSocket support enabled.

### Features

- Device list with online/offline status
- Live screen view (binary JPEG frames rendered as blob URLs)
- Remote touch/swipe via click-on-screen
- Screenshot capture
- File browser
- Device info panel

## Android Agent

Location: `android-agent/`

Kotlin app using OkHttp for REST and WebSocket communication.

### Key Components

- **AuthManager.kt** — JWT login/register/pairing via REST
- **WebSocketManager.kt** — Persistent WS connection with auto-reconnect, heartbeat, command handling
- **ScreenStreamService.kt** — MediaProjection JPEG capture → binary WS frames
- **CommandEngine.kt** — Dispatches received commands to appropriate handlers
- **TouchAutomationService.kt** — AccessibilityService for executing touch/swipe gestures

### Building the APK

Set `BACKEND_URL` in `android-agent/local.properties`:

```properties
BACKEND_URL=https://your-backend-url.com
```

Then build:

```bash
cd android-agent
./gradlew assembleRelease
```

A pre-packaged build-ready archive is available at `builds/HybridControl-Android-build-ready.zip`. Extract it, open in Android Studio, set `BACKEND_URL`, and build.

## Verification Scripts

Run from project root with the backend running:

```bash
# End-to-end test: auth, WebSocket, binary frame relay
npx tsx scripts/test-device-sim.ts

# Command latency measurement (10 rounds)
npx tsx scripts/test-command-latency.ts
```

## Security Notes

- Browser code only communicates with the backend API; no direct DB access from client
- Pairing codes are authenticated and persisted in PostgreSQL
- Android agent uses network security config allowing cleartext only for localhost/emulator IPs
- Production deployments must set `JWT_SECRET` as a secure environment variable
