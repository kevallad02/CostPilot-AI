#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# CostPilot AI – Live End-to-End Test
# Usage: bash test_live.sh
# ─────────────────────────────────────────────────────────────────────────────

ML_URL="https://kevallad-costpilot-inference.hf.space"
BACKEND_URL="https://costpilot-ai.onrender.com"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}  PASS${NC} $1"; }
fail() { echo -e "${RED}  FAIL${NC} $1"; }
section() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

# ── 1. ML Service ─────────────────────────────────────────────────────────────
section "ML Service (HuggingFace Spaces)"

echo "→ Health check"
ML_HEALTH=$(curl -s --max-time 60 "$ML_URL/health")
echo "  $ML_HEALTH"
echo "$ML_HEALTH" | grep -q '"ok"' && pass "Health OK" || fail "Health failed"

echo ""
echo "→ Parse: estimate query"
PARSE1=$(curl -s --max-time 60 -X POST "$ML_URL/parse-input" \
  -H "Content-Type: application/json" \
  -d '{"text":"Estimate 20 cubic meter concrete"}')
echo "  $PARSE1"
echo "$PARSE1" | grep -q '"action"' && pass "Parse returned JSON" || fail "Parse failed"

echo ""
echo "→ Parse: add item query"
PARSE2=$(curl -s --max-time 60 -X POST "$ML_URL/parse-input" \
  -H "Content-Type: application/json" \
  -d '{"text":"Add 500 kg steel"}')
echo "  $PARSE2"
echo "$PARSE2" | grep -q '"action"' && pass "Parse returned JSON" || fail "Parse failed"

echo ""
echo "→ Parse: total query"
PARSE3=$(curl -s --max-time 60 -X POST "$ML_URL/parse-input" \
  -H "Content-Type: application/json" \
  -d '{"text":"What is the total cost?"}')
echo "  $PARSE3"
echo "$PARSE3" | grep -q '"action"' && pass "Parse returned JSON" || fail "Parse failed"

# ── 2. Backend ───────────────────────────────────────────────────────────────
section "Backend (Render)"

echo "→ Health check"
BACK_HEALTH=$(curl -s --max-time 60 "$BACKEND_URL/api/health")
echo "  $BACK_HEALTH"
echo "$BACK_HEALTH" | grep -q '"ok"' && pass "Health OK" || fail "Health failed"

echo ""
echo "→ POST /api/chat – estimate concrete"
CHAT1=$(curl -s --max-time 60 -X POST "$BACKEND_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Estimate 20 cubic meter concrete"}')
echo "  reply: $(echo $CHAT1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reply','NO REPLY'))" 2>/dev/null)"
SESSION_ID=$(echo $CHAT1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
echo "  session_id: $SESSION_ID"
echo "$CHAT1" | grep -q '"reply"' && pass "Chat response OK" || fail "Chat failed"

echo ""
echo "→ POST /api/chat – add steel (same session)"
CHAT2=$(curl -s --max-time 60 -X POST "$BACKEND_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Add 500 kg steel\",\"session_id\":\"$SESSION_ID\"}")
echo "  reply: $(echo $CHAT2 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reply','NO REPLY'))" 2>/dev/null)"
echo "$CHAT2" | grep -q '"reply"' && pass "Chat response OK" || fail "Chat failed"

echo ""
echo "→ POST /api/chat – total cost"
CHAT3=$(curl -s --max-time 60 -X POST "$BACKEND_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is the total cost?\",\"session_id\":\"$SESSION_ID\"}")
echo "  reply: $(echo $CHAT3 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reply','NO REPLY'))" 2>/dev/null)"
echo "$CHAT3" | grep -q '"reply"' && pass "Chat response OK" || fail "Chat failed"

echo ""
echo "→ POST /api/chat – summary"
CHAT4=$(curl -s --max-time 60 -X POST "$BACKEND_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Show me the breakdown\",\"session_id\":\"$SESSION_ID\"}")
echo "  reply: $(echo $CHAT4 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reply','NO REPLY'))" 2>/dev/null)"
echo "$CHAT4" | grep -q '"reply"' && pass "Chat response OK" || fail "Chat failed"

echo ""
echo "→ POST /api/chat – unknown item (graceful fallback)"
CHAT5=$(curl -s --max-time 60 -X POST "$BACKEND_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Add 10 units of diamond\",\"session_id\":\"$SESSION_ID\"}")
echo "  reply: $(echo $CHAT5 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reply','NO REPLY'))" 2>/dev/null)"
echo "$CHAT5" | grep -q '"reply"' && pass "Unknown item handled OK" || fail "Unknown item failed"

echo ""
echo "→ GET /api/summary"
SUMMARY=$(curl -s --max-time 60 "$BACKEND_URL/api/summary?session_id=$SESSION_ID")
echo "  total: $(echo $SUMMARY | python3 -c "import sys,json; print(json.load(sys.stdin).get('total','NO TOTAL'))" 2>/dev/null)"
echo "$SUMMARY" | grep -q '"total"' && pass "Summary OK" || fail "Summary failed"

# ── 3. Direct estimate endpoint ───────────────────────────────────────────────
section "Direct Estimate Endpoint"

echo "→ POST /api/estimate"
EST=$(curl -s --max-time 60 -X POST "$BACKEND_URL/api/estimate" \
  -H "Content-Type: application/json" \
  -d "{\"item\":\"cement\",\"quantity\":100,\"unit\":\"bags\",\"session_id\":\"$SESSION_ID\"}")
echo "  $EST"
echo "$EST" | grep -q '"total_cost"' && pass "Estimate OK" || fail "Estimate failed"

section "Done"
echo "Session ID used: $SESSION_ID"
echo "Re-run with a specific session: SESSION_ID=<uuid> bash test_live.sh"
