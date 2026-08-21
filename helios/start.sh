#!/bin/bash
set -e

# Start Helios backend
(
  cd "$(dirname "$0")/backend"
  export USER_LLM_API_KEY="${USER_LLM_API_KEY:-}"
  uvicorn app.main:app --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

# Start frontend (exposed preview port)
(
  cd "$(dirname "$0")/frontend"
  pnpm dev
) &
FRONTEND_PID=$!

cleanup() {
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
}
trap cleanup EXIT

wait
