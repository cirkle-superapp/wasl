#!/bin/bash
# Simple supervisor: restarts the dev server if it exits.
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting next dev..."
  ./node_modules/.bin/next dev -p 3000
  echo "[$(date)] next dev exited with code $?. Restarting in 3s..."
  sleep 3
done
