# Hybrid Remote Device Control System

## Overview
A remote control platform for Android devices. Users authenticate through the Express backend, register devices, send commands from the web dashboard, and receive live Android screen frames over WebSocket binary messages.

## Architecture
Four main components:
1. **Android Agent** (`/android-agent`) — Kotlin Android app with JWT auth, OkHttp WebSocket, command execution, accessibility/touch control, and MediaProjection screen streaming.
2. **Web Dashboard** (`/dashboard`) — React + TypeScript + Vite SPA for device monitoring and remote control.
3. **Express Backend** (`/backend`) — Node.js/TypeScript server providing JWT auth, REST APIs, WebSocket relay, pairing code APIs, and database initialization.
4. **Database** — Replit PostgreSQL via `DATABASE_URL` for users, devices, and pairing codes.

## Tech Stack
- **Frontend:** React, TypeScript, Vite, Framer Motion, Lucide React
- **Backend API:** Node.js, Express, TypeScript, WebSocket (`ws`), PostgreSQL (`pg`)
- **Auth:** Backend-issued JWT tokens with bcrypt password hashes
- **Android:** Kotlin, Gradle Kotlin DSL, OkHttp, Gson, Coroutines
- **Database:** Replit PostgreSQL

## Current Data Flow
```
Dashboard ── REST /backend-api/api/* ──► Backend ──► Replit PostgreSQL
Dashboard ── WS /backend-api/ws ───────► Backend
Android   ── REST /api/* ──────────────► Backend
Android   ── WS /ws?token=<JWT> ───────► Backend
Android   ── binary JPEG frames ───────► Backend ──► Dashboard sockets
```

## Development Setup
The dashboard runs on port 5000, backend on port 3001.

### Run dashboard
```bash
cd dashboard && npm run dev
```

### Run backend
```bash
cd backend && npm run dev
```

### Start both on Replit
Use the configured workflows:
- `Start backend`
- `Start application`

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/server.ts` | Express entry point and API route registration |
| `backend/src/db/database.ts` | PostgreSQL pool and schema initialization |
| `backend/src/auth/authService.ts` | JWT register/login/verify logic |
| `backend/src/routes/pairingRoutes.ts` | Authenticated, database-backed pairing code routes |
| `backend/src/routes/deviceRoutes.ts` | Device listing, command dispatch, device deletion |
| `backend/src/websocket/wsServer.ts` | WebSocket auth, command relay, binary screen frame relay |
| `backend/src/websocket/deviceRegistry.ts` | In-memory device cache backed by PostgreSQL |
| `dashboard/src/services/api.ts` | Dashboard REST + WebSocket client |
| `dashboard/src/App.tsx` | Dashboard UI and live frame rendering |
| `android-agent/app/src/main/kotlin/com/hybridcontrol/agent/auth/AuthManager.kt` | Android backend JWT auth |
| `android-agent/app/src/main/kotlin/com/hybridcontrol/agent/connection/WebSocketManager.kt` | Android WebSocket connection and binary frame sender |
| `android-agent/app/src/main/kotlin/com/hybridcontrol/agent/commands/ScreenStreamService.kt` | Android live screen stream service |
| `scripts/test-device-sim.ts` | Real-data API/WebSocket binary frame simulation |

## Environment Variables
| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Replit PostgreSQL connection string |
| `JWT_SECRET` | Production | JWT signing secret. Development uses an ephemeral process secret if omitted. |
| `PORT` | Optional | Backend port, defaults to 3001 |

Obsolete Supabase runtime configuration has been removed from the active environment.

## Android Build Configuration
`android-agent/local.properties` currently contains the Replit backend URL for APK builds:
```properties
BACKEND_URL=https://3000-9ad8c845-f14e-49f7-a14c-7b01433778c5-00-wwwlgc64rxvz.janeway.replit.dev
```
For deployed builds, replace this with the deployed HTTPS backend URL.

## Validation Status
- Workflows restart successfully.
- Backend initializes PostgreSQL schema successfully.
- Real-data simulator creates a real user/devices through REST, opens authenticated WebSockets, sends binary JPEG data, and confirms relay to the dashboard-side socket.
- Android APK build was attempted. Replit lacks `/home/runner/workspace/.android-sdk`, so a build-ready ZIP was generated at `builds/HybridControl-Android-build-ready.zip` for Android Studio/local execution.

## Important Notes
- Browser code does not access database credentials or backend secrets directly.
- Pairing code generation is authenticated and persisted in PostgreSQL.
- WebSocket accepts both `/ws` and `/backend-api/ws` so dev proxy and same-origin backend hosting both work.
- Production deployment should configure `JWT_SECRET` as a secure secret before going live.