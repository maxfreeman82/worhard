#!/usr/bin/env bash
# Lance le serveur de production et tous les parcours e2e contre la base Neon de .env.local, puis nettoie.
#   npm run build && bash replica/e2e/run-all.sh [dossier des captures]
# Navigateur : le Chrome installé sur la machine (playwright-core, canal « chrome »).
# Les tests sont espacés de 65 s : l'envoi de codes est limité à 3 par minute et par IP.
set -u
set -o pipefail
SHOTS="${1:-$(pwd)/replica/clone-screens}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$(mktemp)"
cd "$ROOT"
node --env-file=.env.local scripts/cleanup-e2e.mjs
if curl -s -o /dev/null http://localhost:3123/login; then echo "Le port 3123 est déjà occupé : arrêter l'ancien serveur." >&2; exit 1; fi
npx next start -p 3123 >"$LOG" 2>&1 &
SERVER=$!
until curl -s -o /dev/null http://localhost:3123/login; do sleep 1; done
status=0
first=1
for t in flow dnd db backend; do
  [ $first -eq 1 ] || sleep 65
  first=0
  echo "=== $t"
  (SERVER_LOG="$LOG" timeout 400 node "replica/e2e/$t.mjs" "$SHOTS" 2>&1 | grep -vE "^\s+at ") || status=1
done
echo "=== erreurs serveur"
grep -E "^sync:|SERVER_ERROR" "$LOG" || echo "aucune"
kill $SERVER 2>/dev/null
# npx lance un processus node enfant : on l'arrête aussi (sinon il garde le port).
if command -v powershell >/dev/null; then
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'next.*start -p 3123' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" >/dev/null 2>&1
else
  pkill -f "next start -p 3123" 2>/dev/null
fi
node --env-file=.env.local scripts/cleanup-e2e.mjs
exit $status
