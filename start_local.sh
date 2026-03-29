#!/usr/bin/env bash
# Start all three CostPilot services locally.
# Usage: ./start_local.sh
#
# Services:
#   ML  → http://localhost:8001  (FastAPI + flan-t5-small)
#   API → http://localhost:3001  (Node.js backend)
#   UI  → http://localhost:5173  (React/Vite frontend)

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── 1. ML inference server ────────────────────────────────────────────────────
echo "Starting ML service on :8001 ..."
cd "$ROOT/ml-model/spaces"
python main.py &
ML_PID=$!

# ── 2. Node backend ───────────────────────────────────────────────────────────
echo "Starting backend on :3001 ..."
cd "$ROOT/backend"
npm start &
API_PID=$!

# ── 3. React frontend ─────────────────────────────────────────────────────────
echo "Starting frontend on :5173 ..."
cd "$ROOT/frontend"
npm run dev &
UI_PID=$!

echo ""
echo "All services started:"
echo "  ML  → http://localhost:8001/health"
echo "  API → http://localhost:3001/api/health"
echo "  UI  → http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all."

# Stop all on exit
trap "kill $ML_PID $API_PID $UI_PID 2>/dev/null" EXIT
wait
