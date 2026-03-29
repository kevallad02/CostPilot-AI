#!/usr/bin/env bash
# Start all three CostPilot services locally.
# Usage: ./start_local.sh
#
# Services:
#   ML  → http://localhost:8001  (FastAPI + flan-t5-small)
#   API → http://localhost:3001  (Node.js backend)
#   UI  → http://localhost:5173  (React/Vite frontend)

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Preflight checks ──────────────────────────────────────────────────────────
if [ ! -d "$ROOT/backend/node_modules" ]; then
  echo "[setup] Installing backend dependencies..."
  cd "$ROOT/backend" && npm install
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "[setup] Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install
fi

# ── 1. ML inference server ────────────────────────────────────────────────────
echo ""
echo "[ml]      Starting ML service on :8001 ..."
cd "$ROOT/ml-model/spaces"
python3 main.py > "$ROOT/logs/ml.log" 2>&1 &
ML_PID=$!
echo "[ml]      PID $ML_PID  (logs: logs/ml.log)"

# ── 2. Node backend ───────────────────────────────────────────────────────────
echo "[backend] Starting backend on :3001 ..."
cd "$ROOT/backend"
npm start > "$ROOT/logs/backend.log" 2>&1 &
API_PID=$!
echo "[backend] PID $API_PID  (logs: logs/backend.log)"

# ── 3. React frontend ─────────────────────────────────────────────────────────
echo "[ui]      Starting frontend on :5173 ..."
cd "$ROOT/frontend"
npm run dev > "$ROOT/logs/frontend.log" 2>&1 &
UI_PID=$!
echo "[ui]      PID $UI_PID  (logs: logs/frontend.log)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CostPilot AI running locally"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ML  → http://localhost:8001/health"
echo "  API → http://localhost:3001/api/health"
echo "  UI  → http://localhost:5173"
echo ""
echo "  Tail logs:  tail -f logs/ml.log"
echo "              tail -f logs/backend.log"
echo "              tail -f logs/frontend.log"
echo ""
echo "  Press Ctrl+C to stop all services."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stop all on Ctrl+C
trap "echo ''; echo 'Stopping...'; kill $ML_PID $API_PID $UI_PID 2>/dev/null; exit 0" INT TERM

wait $ML_PID $API_PID $UI_PID
