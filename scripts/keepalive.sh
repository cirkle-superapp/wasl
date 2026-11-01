#!/bin/bash
# Wasl dev-server keepalive — checks every 20s; restarts next dev if down.
# Launched double-forked so it survives the spawning shell (see sw.js notes).
# Logs to /tmp/wasl-keepalive.log only when it acts (no periodic spam).

LOG=/tmp/wasl-keepalive.log
cd /home/z/my-project

while true; do
  if ! curl -s -o /dev/null --max-time 5 "http://localhost:3000/" 2>/dev/null; then
    # Port down — check for zombie next processes first.
    if pkill -9 -f "next dev" 2>/dev/null; then
      sleep 1
    fi
    if pkill -9 -f "next-server" 2>/dev/null; then
      sleep 1
    fi
    # Double-fork launch (subshell exits immediately; next dev reparents to init).
    ( bunx next dev -p 3000 > /home/z/my-project/dev.log 2>&1 & )
    echo "[$(date -u +%FT%TZ)] dev server was down — restarted" >> "$LOG"
    sleep 25 # give it time to come up before the next check
  fi
  sleep 20
done
