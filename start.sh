#!/bin/bash
# ============================================================
#  Hybrid Remote Device Control System - Startup Script
# ============================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║    Hybrid Remote Device Control System           ║"
echo "  ║    Starting all services...                      ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Check dependencies ─────────────────────────────────────
echo -e "${YELLOW}[1/3] Checking dependencies...${NC}"

if ! command -v node &>/dev/null; then
  echo -e "${RED}  ✗ Node.js not found. Please install Node.js 20+${NC}"
  exit 1
fi

if [ ! -d "backend/node_modules" ]; then
  echo "  Installing backend dependencies..."
  cd backend && npm install --silent && cd ..
fi

if [ ! -d "dashboard/node_modules" ]; then
  echo "  Installing dashboard dependencies..."
  cd dashboard && npm install --silent && cd ..
fi

echo -e "${GREEN}  ✓ Dependencies OK${NC}"

# ─── Start Backend (port 3001) ───────────────────────────────
echo -e "${YELLOW}[2/3] Starting Backend API (port 3001)...${NC}"

cd backend
npm run dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
for i in $(seq 1 15); do
  sleep 1
  if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Backend running (PID: $BACKEND_PID)${NC}"
    break
  fi
  if [ $i -eq 15 ]; then
    echo -e "${RED}  ✗ Backend failed to start. Check /tmp/backend.log${NC}"
  fi
done

# ─── Start Dashboard (port 5000) ─────────────────────────────
echo -e "${YELLOW}[3/3] Starting Dashboard (port 5000)...${NC}"

cd dashboard
npm run dev > /tmp/dashboard.log 2>&1 &
DASHBOARD_PID=$!
cd ..

# Wait for dashboard to be ready
for i in $(seq 1 15); do
  sleep 1
  if curl -s http://localhost:5000 > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Dashboard running (PID: $DASHBOARD_PID)${NC}"
    break
  fi
  if [ $i -eq 15 ]; then
    echo -e "${GREEN}  ✓ Dashboard starting (PID: $DASHBOARD_PID)${NC}"
  fi
done

# ─── Print Info ──────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              Services Started!                       ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}  🌐 Dashboard  : ${GREEN}http://localhost:5000${NC}"
echo -e "${CYAN}║${NC}  ⚙️  Backend API: ${GREEN}http://localhost:3001/api${NC}"
echo -e "${CYAN}║${NC}  🔌 WebSocket  : ${GREEN}ws://localhost:3001/ws${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}  Register via the Dashboard or POST /api/auth/register"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Logs: /tmp/backend.log | /tmp/dashboard.log${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# ─── Trap Ctrl+C ─────────────────────────────────────────────
cleanup() {
  echo ""
  echo -e "${RED}Stopping all services...${NC}"
  kill $BACKEND_PID $DASHBOARD_PID 2>/dev/null
  echo -e "${GREEN}Services stopped.${NC}"
  exit 0
}
trap cleanup INT TERM

# Keep running
wait
