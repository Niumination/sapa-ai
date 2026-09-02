#!/bin/bash
# ─── Sync semua dataset dari SPLP ───
# Panggil: bash scripts/sync-all.sh
# Output: log/sync-YYYY-MM-DD.log

set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)
LOG_DIR="${PROJECT_ROOT}/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="${LOG_DIR}/sync-$(date +%Y-%m-%d).log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[${TIMESTAMP}] === SYNC START ===" | tee -a "$LOG_FILE"

# Cek Prisma Client sudah di-generate
if [ ! -d "node_modules/@prisma/client" ]; then
  echo "[${TIMESTAMP}] ❌ Prisma client not generated. Run: npx prisma generate" | tee -a "$LOG_FILE"
  exit 1
fi

# Cek DATABASE_URL
if ! grep -q "DATABASE_URL=" .env.local 2>/dev/null; then
  echo "[${TIMESTAMP}] ❌ DATABASE_URL not set in .env.local" | tee -a "$LOG_FILE"
  exit 1
fi

# Jalankan sync via npx tsx (TypeScript executor)
echo "[${TIMESTAMP}] ⏳ Running data sync..." | tee -a "$LOG_FILE"

npx tsx -e "
const { syncAllDatasets } = require('./src/services/data-sync');
syncAllDatasets()
  .then(results => {
    results.forEach(r => console.log(r.status === 'ok' ? '✅' : '❌', r.slug, r.error || ''));
    process.exit(results.some(r => r.status === 'error') ? 1 : 0);
  })
  .catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
" 2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=$?
echo "[${TIMESTAMP}] === SYNC END (exit: ${EXIT_CODE}) ===" | tee -a "$LOG_FILE"
exit $EXIT_CODE
