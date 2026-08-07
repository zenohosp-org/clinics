#!/bin/bash
# ZenoHosp Clinics — Frontend (macOS)

cd "$(dirname "$0")/clinics-frontend"

# Kill anything already on port 5177
if lsof -ti:5177 > /dev/null 2>&1; then
  echo " Killing existing process on port 5177..."
  lsof -ti:5177 | xargs kill -9 2>/dev/null
  sleep 1
fi

echo ""
echo " ZenoHosp Clinics Frontend"
echo " http://localhost:5177"
echo " Proxy → http://localhost:9003"
echo " Press Ctrl+C to stop."
echo ""

npm run dev
