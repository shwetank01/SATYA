#!/usr/bin/env bash
# Commit and push work in progress every 10-15 minutes (random), forever.
# Every commit still goes through the secret guard (pre-commit hook).
# Start:  bash tools/autopush.sh &      Stop: kill the process, or touch tools/autopush.stop
set -u
cd "$(dirname "$0")/.." || exit 1
LOG=tools/autopush.log
while true; do
  sleep $(( 600 + RANDOM % 301 ))
  [ -f tools/autopush.stop ] && { echo "$(date '+%F %T') stop file found, exiting" >> "$LOG"; exit 0; }
  if [ -z "$(git status --porcelain)" ]; then
    echo "$(date '+%F %T') nothing to push" >> "$LOG"; continue
  fi
  git add -A
  areas=$(git diff --cached --name-only | awk -F/ '{print $1}' | sort -u | paste -sd, -)
  n=$(git diff --cached --name-only | wc -l | tr -d ' ')
  if git commit -q -m "wip(${areas}): autosave $(date '+%Y-%m-%d %H:%M'), ${n} files" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" >> "$LOG" 2>&1; then
    git pull -q --rebase origin main >> "$LOG" 2>&1 || git rebase --abort >> "$LOG" 2>&1
    if git push -q origin HEAD:main >> "$LOG" 2>&1; then
      echo "$(date '+%F %T') pushed ${n} files (${areas})" >> "$LOG"
    else
      echo "$(date '+%F %T') push failed, will retry next round" >> "$LOG"
    fi
  else
    git reset -q
    echo "$(date '+%F %T') commit refused (secret guard or hook), nothing pushed" >> "$LOG"
  fi
done
