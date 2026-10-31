#!/bin/bash
# Keep dev server alive — restarts if it dies
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting dev server..." >> dev.log
  bun run dev >> dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Dev server exited with code $EXIT_CODE, restarting in 3s..." >> dev.log
  sleep 3
done
