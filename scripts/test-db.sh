#!/usr/bin/env bash
# ทดสอบ migration + RLS บน PostgreSQL ในเครื่อง (ต้องมี postgres 15+ ติดตั้งอยู่)
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DATA=$(mktemp -d)
PORT=${PORT:-54329}
trap '"$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA"; RUN="runuser -u postgres --"; else RUN=""; fi
$RUN "$PGBIN/initdb" -D "$DATA" -A trust -U postgres >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
sleep 1
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database kengscore" >/dev/null
$PSQL -d kengscore -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do echo "applying $f"; $PSQL -d kengscore -f "$f"; done
FAILED=0
for t in supabase/tests/*_test.sql; do
  echo "── $t"
  OUT=$($PSQL -d kengscore -At -F ' | ' -f "$t" 2>&1) || FAILED=1
  echo "$OUT"
  if echo "$OUT" | grep -qE '\| f$|FAIL|ERROR'; then FAILED=1; fi
done
if [ "$FAILED" != 0 ]; then echo "❌ DB tests failed"; exit 1; fi
echo "✅ DB tests passed"
