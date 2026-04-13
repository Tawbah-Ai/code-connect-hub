# Hybrid Remote Device Control System

A remote control system for Android devices. A web dashboard authenticates users, lists devices, sends commands, and receives live screen frames from Android agents through the backend.

## Current Architecture

```
Dashboard (React/Vite :5000)
  ├─ REST /backend-api/api/*
  └─ WS   /backend-api/ws
          │
          ▼
Backend (Express/Node :3001)
  ├─ JWT auth
  ├─ device registry
  ├─ pairing code API
  ├─ WebSocket command + binary frame relay
  └─ Replit PostgreSQL
          ▲
          │
Android Agent (Kotlin/OkHttp)
  ├─ REST /api/auth/* and /api/pairing/*
  ├─ WS /ws?token=<JWT>
  └─ MediaProjection JPEG binary streaming
```

## Run on Replit

Start the configured workflows:

- `Start backend` runs the Express API and WebSocket server on port `3001`.
- `Start application` runs the Vite dashboard on port `5000` and proxies `/backend-api` to the backend.

The backend initializes the Replit PostgreSQL schema automatically on startup.

## Backend

Location: `backend/`

Key endpoints:

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register a user and device, returns a JWT |
| POST | `/api/auth/login` | Login and register/update the current device |
| GET | `/api/devices` | List authenticated user's devices |
| POST | `/api/devices/:deviceId/command` | Send command to a connected device |
| DELETE | `/api/devices/:deviceId` | Remove a device from memory and database |
| POST | `/api/pairing/generate` | Generate authenticated 6-digit pairing code |
| POST | `/api/pairing/claim` | Claim pairing code and link Android device |
| WS | `/ws` or `/backend-api/ws` | Authenticated WebSocket connection |

Authentication uses JWTs. In development, if `JWT_SECRET` is not configured, the backend uses an ephemeral secret for the current process only. For production, set `JWT_SECRET` as a secure secret before deploying.

## Dashboard

Location: `dashboard/`

The dashboard uses `dashboard/src/services/api.ts` for all REST and WebSocket traffic. It does not connect directly to the database or external backend services from the browser.

Live screen frames arrive as binary JPEG WebSocket messages and are rendered with blob URLs.

## Android Agent

Location: `android-agent/`

`android-agent/local.properties` must contain the backend URL used by the APK build:

```properties
BACKEND_URL=https://3000-9ad8c845-f14e-49f7-a14c-7b01433778c5-00-wwwlgc64rxvz.janeway.replit.dev
```

For a deployed backend, replace this value with the deployed HTTPS backend URL.

The Android app now uses:

- `AuthManager.kt` for backend JWT login/register/pairing.
- `WebSocketManager.kt` for `/ws?token=<JWT>` command/result/heartbeat traffic and `sendBinaryFrame`.
- `ScreenStreamService.kt` for MediaProjection JPEG frame capture and binary WebSocket streaming.

## Real Data Simulation

Run this from the project root while the backend workflow is running:

```bash
npx tsx scripts/test-device-sim.ts
```

The simulator creates a real user and two real devices through the backend API, connects both WebSockets with real JWTs, sends a binary JPEG frame from the Android-simulated socket, and verifies the dashboard-simulated socket receives it.

## APK Build Status

The Replit environment does not currently include the Android SDK path required for a full APK build. A build-ready Android Studio archive is generated at:

```text
builds/HybridControl-Android-build-ready.zip
```

Open `android-agent/` in Android Studio or extract the ZIP locally, ensure the Android SDK is installed, confirm `BACKEND_URL`, and run `./gradlew assembleRelease`.

## Security Notes

- Browser code only talks to the backend API; database access stays server-side.
- Pairing code generation requires authentication and is persisted in PostgreSQL.
- Obsolete Supabase runtime secrets/configuration were removed from the Replit environment.
- Production deployments must configure `JWT_SECRET` as a secret.