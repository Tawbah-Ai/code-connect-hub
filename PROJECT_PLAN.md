# Hybrid Remote Device Control System — Project Plan

> Last updated: 2025-04 | Continue from where this file left off.

---

## Architecture

- **`backend/`** — Node.js/TypeScript REST + WebSocket server (port 3001)
- **`dashboard/`** — React/Vite web app (port 5000, proxies `/backend-api` → backend)
- **`android-agent/`** — Kotlin Android app connecting via WebSocket
- **Database** — Replit PostgreSQL (`DATABASE_URL` env var, auto-provisioned)
- **Auth** — JWT tokens signed with `JWT_SECRET` env var (bcrypt passwords)

---

## Completed Items

- [x] Removed all Supabase dependencies from dashboard
- [x] Fixed `ScreenViewer` to use blob URL for live screen frames
- [x] Fixed `AppContent` / `App` to use JWT auth (not Supabase sessions)
- [x] `dashboard/src/lib/supabase.ts` stubbed out (no longer used)
- [x] `JWT_SECRET` set as Replit shared environment variable
- [x] PostgreSQL schema initialized (`users`, `devices`, `pairing_codes` tables)
- [x] Backend runs on port 3001 with `ts-node-dev`
- [x] Dashboard runs on port 5000 with Vite (proxy to backend configured)
- [x] Both workflows configured and running in `.replit`

---

## Remaining / Next Steps

### HIGH PRIORITY

- [ ] **Connection stability (Android agent)**
  - Foreground service keeping WS alive in background (already scaffolded in `AgentForegroundService.kt`)
  - Exponential-backoff reconnect in `WebSocketManager.kt`
  - Heartbeat every 10–15 s

- [ ] **Live screen streaming (Android)**
  - Use `MediaProjection` API to capture frames
  - Encode as JPEG and stream via WebSocket binary frames
  - Dashboard already handles binary frames → blob URL display (`api.subscribeToScreenStream`)

- [ ] **Real file access (Android)**
  - Replace placeholder returns in `CommandEngine.kt` with real `File` API / MediaStore calls
  - `GET_FILES` command should list actual `/sdcard` contents

- [ ] **Remote touch / control (Android)**
  - `TouchAccessibilityService.kt` needs to be registered in `AndroidManifest.xml`
  - Implement `TAP`, `SWIPE`, `SCROLL`, `INPUT_TEXT` via `AccessibilityService`

- [ ] **Permissions onboarding (Android)**
  - First-launch screen prompting: Accessibility, Screen Capture, Storage, Battery Optimization

- [ ] **Screenshot download fix**
  - Android `TAKE_SCREENSHOT` result should return `data:image/jpeg;base64,...` string
  - Dashboard already handles it in `handleCommandResult → TAKE_SCREENSHOT`

### MEDIUM PRIORITY

- [ ] **Pairing codes persisted to DB**
  - `pairingRoutes.ts` currently stores codes in-memory (lost on restart)
  - Move to the `pairing_codes` table already in the schema

- [ ] **Device deletion from DB**
  - `DeviceRegistry.removeDevice` only removes from memory; add `DELETE FROM devices` query

- [ ] **Screen tab latestScreenshot download**
  - Currently renders as `<img src={latestScreenshot}>` — works if device sends full data URL

- [ ] **CSP / eval warning**
  - Vite in dev uses eval-based source maps; disable in production build (already non-issue in prod)

### LOW PRIORITY

- [ ] **Deployment configuration**
  - Current `.replit` deploys dashboard as static + backend as Node process
  - Review `[deployment]` section for production `JWT_SECRET` and `DATABASE_URL`

- [ ] **APK build**
  - `build-apk.sh` exists; requires Android SDK on the build machine (not Replit)
  - Consider documenting external build steps

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/server.ts` | Express entry point |
| `backend/src/auth/authService.ts` | JWT register/login |
| `backend/src/websocket/wsServer.ts` | WS routing (commands, binary frames) |
| `backend/src/websocket/deviceRegistry.ts` | In-memory device state |
| `backend/src/routes/pairingRoutes.ts` | Pairing code generate/claim |
| `backend/src/db/database.ts` | pg pool + schema init |
| `dashboard/src/App.tsx` | All React UI |
| `dashboard/src/services/api.ts` | REST + WS client |
| `android-agent/app/src/main/java/.../WebSocketManager.kt` | Android WS connection |
| `android-agent/app/src/main/java/.../CommandEngine.kt` | Android command execution |

---

## Environment Variables

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `DATABASE_URL` | Replit (auto) | PostgreSQL connection string |
| `JWT_SECRET` | Replit shared env | Signs JWT tokens |
| `PORT` | optional | Backend port (default 3001) |
