# Hybrid Remote Device Control System

A production-grade remote control system for Android devices. A single user account can link multiple devices — the first device becomes the **OWNER** (admin), and subsequent devices become **CLIENTS**. The OWNER can control CLIENT devices using command-based execution or touch-based UI automation.

## Architecture

```
┌─────────────────┐     WebSocket     ┌─────────────────┐     REST/WS     ┌─────────────────┐
│  Android Agent  │ ◄──────────────► │    Backend       │ ◄────────────► │   Dashboard      │
│  (Kotlin)       │                   │  (Node.js/TS)    │                │  (React + Vite)  │
│                 │                   │                  │                │                  │
│ • Command Engine│                   │ • Auth Service   │                │ • Login          │
│ • Touch Engine  │                   │ • Device Registry│                │ • Device List    │
│ • Hybrid Mode   │                   │ • WS Server      │                │ • Command Panel  │
│ • Accessibility │                   │ • Command Router │                │ • Touch Controls │
└─────────────────┘                   └─────────────────┘                └─────────────────┘
```

## Phase 1 — Android Agent (Kotlin)

**Location:** `android-agent/`

### Features
- **Auth + Device Registration** — Email login, auto-assigns OWNER/CLIENT roles
- **Persistent WebSocket** — Auto-reconnect, heartbeat every 15s
- **Command Engine** — OPEN_APP, GET_FILES, DELETE_FILE, TAKE_SCREENSHOT, DEVICE_INFO, LIST_APPS, GET_BATTERY, GET_STORAGE_INFO
- **Touch Engine** — Accessibility Service: Tap, Swipe, Long Press, Scroll, Input Text
- **Hybrid Control** — Auto-selects Command or Touch engine based on capability
- **User Activity Detection** — Screen ON/OFF monitoring

### Setup
1. Open `android-agent/` in Android Studio
2. Update `WS_URL` and `API_URL` in `app/build.gradle.kts` to point to your backend
3. Build and install the debug APK
4. Enable the Accessibility Service in device Settings

### Permissions Required
- Internet, Foreground Service, Storage, Notifications
- Accessibility Service (for Touch Engine)
- MediaProjection (for screenshots)

## Phase 2 — Backend (Node.js + TypeScript)

**Location:** `backend/`

### Features
- **Auth** — JWT token-based registration and login
- **Device Registry** — Tracks devices, roles, online/offline status
- **WebSocket Server** — Real-time device connections with heartbeat monitoring
- **Command Router** — Routes commands from OWNER to CLIENT devices
- **REST API** — Device management and command dispatch from dashboard

### Setup
```bash
cd backend
npm install
cp .env.example .env  # or create .env with PORT=3000 and JWT_SECRET
npm run dev
```

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user + device |
| POST | `/api/auth/login` | Login with email/password |
| GET | `/api/devices` | List user's devices |
| GET | `/api/devices/:id` | Get device details |
| POST | `/api/devices/:id/command` | Send command to device |
| DELETE | `/api/devices/:id` | Remove device |
| WS | `/ws` | WebSocket connection |

### WebSocket Messages
```json
{ "type": "DEVICE_REGISTER", "payload": { "token": "...", "deviceId": "..." } }
{ "type": "HEARTBEAT", "payload": { "deviceId": "...", "timestamp": 123 } }
{ "type": "COMMAND", "payload": { "targetDeviceId": "...", "command": { "type": "DEVICE_INFO" } } }
```

## Phase 3 — Dashboard (React + Vite)

**Location:** `dashboard/`

### Features
- **Login/Register** — Email-based authentication
- **Device List** — Real-time device status (online/offline)
- **Command Panel** — Send system commands to devices
- **Touch Controls** — Remote tap, swipe, scroll, text input
- **Control Mode Selector** — Command / Touch / Hybrid
- **Activity Log** — Real-time command and result logging

### UI Design
- Dark futuristic theme with glassmorphism
- Neon cyan/blue accents
- Mobile-first responsive layout
- Smooth animations

### Setup
```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Quick Start

```bash
# 1. Start the backend
cd backend && npm install && npm run dev

# 2. Start the dashboard (in another terminal)
cd dashboard && npm install && npm run dev

# 3. Open http://localhost:5173, register an account

# 4. Install the Android APK on your device(s)
#    Build from android-agent/ in Android Studio
```

## Security
- JWT token validation on all endpoints
- Command authorization (OWNER only)
- WebSocket authentication via Bearer token
- Activity logging

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Android Agent | Kotlin, OkHttp, Gson, MVVM |
| Backend | Node.js, TypeScript, Express, ws |
| Dashboard | React, TypeScript, Vite, Lucide Icons |
