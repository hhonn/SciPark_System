#!/usr/bin/env bash
# Zero-downtime demo: hit the site twice a second during a deploy and show
# which release and which instance answered each request.
#
#   ./infra/scripts/watch-health.sh https://dxxxxxxxx.cloudfront.net
#
# During a rolling deploy the "release" column switches from the old commit to
# the new one, the "instance" column shows the fleet being replaced, and the
# failure counter should stay at 0. Ctrl-C prints the totals.
set -uo pipefail

URL=${1:?usage: watch-health.sh <site-url>}
OK=0
FAIL=0
trap 'echo; echo "requests: $((OK + FAIL))  ok: $OK  failed: $FAIL"; exit 0' INT

printf "%-10s %-5s %-10s %-21s %s\n" time code release instance zone
while true; do
  BODY=$(curl -s -m 5 -w '\n%{http_code}' "$URL/api/health")
  CODE=$(echo "$BODY" | tail -n1)
  JSON=$(echo "$BODY" | sed '$d')
  if [ "$CODE" = "200" ]; then OK=$((OK + 1)); else FAIL=$((FAIL + 1)); fi
  REL=$(echo "$JSON" | grep -o '"release":"[^"]*"' | cut -d'"' -f4 | cut -c1-8)
  INST=$(echo "$JSON" | grep -o '"instance":"[^"]*"' | cut -d'"' -f4)
  ZONE=$(echo "$JSON" | grep -o '"zone":"[^"]*"' | cut -d'"' -f4)
  printf "%-10s %-5s %-10s %-21s %s   (failed so far: %d)\n" "$(date +%T)" "$CODE" "${REL:--}" "${INST:--}" "${ZONE:--}" "$FAIL"
  sleep 0.5
done
