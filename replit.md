# Hybrid Remote Device Control System

## Overview
A production-grade remote control platform for Android devices. Users can link multiple devices under one account — an OWNER/admin device can control CLIENT devices via command-based execution or touch-based UI automation.

## Architecture
Three main components:
1. **Android Agent** (`/android-agent`) — Kotlin Android app with Accessibility Service for touch injection, MediaProjection for screen capture, and OkHttp/WebSocket for real-time communication.
2. **Web Dashboard** (`/dashboard`) — React 19 + TypeScript + Vite SPA for monitoring and controlling connected devices.
3. **Supabase Backend** (`/supabase`) — PostgreSQL + Auth + Realtime + Storage. Migrations in `/supabase/migrations/`.

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite 8, Framer Motion, Lucide React
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **Android:** Kotlin, Gradle (Kotlin DSL), OkHttp, Coroutines
- **Package Manager:** npm (dashboard)

## Development Setup
The dashboard runs on port 5000 via Vite dev server.

### Run dashboard
```bash
cd dashboard && npm run dev
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
- Command Engine: OPEN_APP, TAKE_SCREENSHOT, DEVICE_INFO, file management
- Touch Engine: Remote tap/swipe/text input via Android Accessibility Service
- Realtime sync via Supabase Realtime

## Supabase Configuration
Set the following environment variables for the dashboard:
- `VITE_SUPABASE_URL` — Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Your Supabase anonymous key
