#!/bin/bash
# watchdog-supervisor.sh — restarts protected-files-watchdog.sh if it dies.
# Runs forever; started detached via setsid+disown so it survives shell exits.
cd "$(dirname "$0")/.." || exit 1
while true; do
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] supervisor: starting watchdog..." >> .watchdog.log
  ./scripts/protected-files-watchdog.sh >> .watchdog.log 2>&1
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] supervisor: watchdog exited (code $?), restarting in 5s..." >> .watchdog.log
  sleep 5
done
