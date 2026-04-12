# Hybrid Remote Device Control System

## Overview
A production-grade remote control platform for Android devices. Users can link multiple devices under one account — an OWNER/admin device can control CLIENT devices via command-based execution or touch-based UI automation.

## Architecture
Four main components:
1. **Android Agent** (`/android-agent`) — Kotlin Android app with Accessibility Service for touch injection, MediaProjection for screen capture, and OkHttp/WebSocket for real-time communication.
2. **Web Dashboard** (`/dashboard`) — React 19 + TypeScript + Vite SPA for monitoring and controlling connected devices.
3. **Express Backend** (`/backend`) — Node.js/TypeScript Express server providing WebSocket relay, device registry, auth, and pairing code API. Runs on port 3001.
4. **Supabase** (`/supabase`) — PostgreSQL + Auth + Realtime. Migrations in `/supabase/migrations/`.

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite 8, Framer Motion, Lucide React
- **Backend API:** Node.js, Express, TypeScript, WebSocket (`ws`), PostgreSQL (`pg`)
- **Auth/Realtime:** Supabase (Auth, Realtime, device/command storage)
- **Android:** Kotlin, Gradle (Kotlin DSL), OkHttp, Coroutines
- **Database:** Replit PostgreSQL (pairing codes), Supabase (auth, devices, commands, logs)

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

### Build dashboard
```bash
cd dashboard && npm run build
```

## Deployment
- **Type:** Static site
- **Build command:** `npm --prefix dashboard run build`
- **Public directory:** `dashboard/dist`

## Key Features
- Auth & Role Management via Supabase Auth (OWNER/CLIENT roles)
- Command Engine: OPEN_APP, TAKE_SCREENSHOT, DEVICE_INFO, GET_FILES, LIST_APPS, GET_BATTERY, GET_STORAGE_INFO, DELETE_FILE
- Touch Engine: Remote tap/swipe/text input via Android Accessibility Service
- Realtime sync via Supabase Realtime
- Live screen streaming: Dashboard sends START_STREAM/STOP_STREAM and subscribes to `screen-{device.id}` Broadcast channel
- Sidebar navigation dashboard: Overview, Screen, Files, Apps, Control, Info, Alerts, Log tabs
- Interactive file browser: Navigate directories, delete files, quick-path buttons
- App list panel: Search and click-to-open installed apps
- Device Info tab: Battery gauge, storage bar, detailed device info table
- Automatic JWT token refresh: Android stores refresh_token, refreshes when within 5 min of expiry, handles 401s
- Device UUID recovery: Android recovers UUID from Supabase on startup if SharedPreferences lost it
- Device pairing codes: 6-digit, 15-minute codes via `POST /backend-api/api/pairing/generate`

## APK Versions
- v1.1.0: Initial release (`android-agent/HybridControl-Agent-v1.1.0-release.apk`)
- v1.2.0: Token refresh + UUID recovery fix (`android-agent/HybridControl-Agent-v1.2.0-release.apk`)

## Keystore
- Path: `android-agent/hybridcontrol-release.jks`
- Password: `hybridcontrol2024`, Alias: `hybridcontrol`

## Critical Architecture Notes
- Commands: Dashboard → Supabase `commands` table → Android polls every 2s → updates result → Dashboard realtime subscription
- Screen stream: Android broadcasts to `realtime:screen-{deviceUuid}` via REST broadcast API; Dashboard subscribes to `screen-{device.id}` (both are the UUID PK)
- Commands use device UUID PK (`device.id`), NOT the Android hardware ID (`device.device_id`)
- Token expiry: Supabase tokens expire after 1 hour; refresh is handled in AuthManager.getValidToken()
- Android permission compliance: All required permissions (camera, microphone, storage, notifications, overlay, battery optimization) are declared in AndroidManifest.xml and requested at runtime with Arabic-language rationale dialogs. Special permissions (SYSTEM_ALERT_WINDOW, battery optimization) open the correct system settings screens.
- Boot receiver: App auto-starts the agent on device boot if the user was already logged in.
- Backend pairing API: `/api/pairing/generate` and `/api/pairing/claim` endpoints with Replit PostgreSQL storage. Dashboard calls them via Vite dev proxy at `/backend-api/*`.

## Build Output
- Latest signed APK: `HybridControl-v1.1.0.apk` (includes all permission updates, pairing backend support, BACKEND_URL BuildConfig)
- Android SDK for local builds is configured via `android-agent/local.properties` with `sdk.dir=/home/runner/workspace/.android-sdk`.
- To rebuild: `cd android-agent && ./gradlew assembleRelease`

## Startup
Run `./start.sh` to start both the backend (port 3001) and dashboard (port 5000) together.

## Admin Credentials
- **Email:** admin@hybridcontrol.com
- **Password:** HybridAdmin@2024
- Note: For the Supabase-based dashboard, register with these credentials (email confirmation may be required in the Supabase project settings).

## Supabase Configuration
Set the following environment variables for the dashboard:
- `VITE_SUPABASE_URL` — Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Your Supabase anonymous key

## Android Build Configuration (`android-agent/local.properties`)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anonymous key
- `BACKEND_URL` — Express backend URL (e.g. `https://3001-<replit-dev-domain>`) for pairing code claim
- `sdk.dir` — Android SDK path

## Backend API (Port 3001)
The Express backend runs alongside the dashboard. Key endpoints:
- `POST /api/pairing/generate` — Generate a 6-digit pairing code (requires `{ userId }` in body)
- `POST /api/pairing/claim` — Claim a pairing code from Android (requires `{ code, deviceId, deviceName, model, osVersion, manufacturer }`)
- `WS /ws` — WebSocket server for Android agent connections
