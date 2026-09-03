# Setup DTSEN untuk Meeting

## ✅ Deploy Berhasil
Branch `hotfix/meeting-ready` sudah live di:
**https://cc-acehtengah.vercel.app**

## Health Check
```bash
curl https://cc-acehtengah.vercel.app/api/health
```
Response:
```json
{
  "status": "healthy",
  "services": {
    "sapa": "ok",
    "ai": "ok",
    "qdrant": "skip"
  }
}
```

## Environment Variables (Sudah Ada)
| Variable | Status | Keterangan |
|----------|--------|------------|
| `DTSEN_NIK_KEY` | ✅ Ada | Kunci HMAC untuk masking NIK |
| `ADMIN_SETUP_TOKEN` | ✅ Ada | Token untuk setup API |
| `DATABASE_URL` | ✅ Ada | Koneksi Supabase |
| `JWT_SECRET` | ✅ Ada | untuk admin auth |

## Langkah Setup DTSEN (Sekali Saja)

### 1. Ambil Setup Token
Dari Vercel Dashboard atau CLI:
```bash
vercel env read ADMIN_SETUP_TOKEN --scope archk4lis-projects
```

### 2. Jalankan Setup API
```bash
curl -X POST https://cc-acehtengah.vercel.app/api/setup \
  -H "x-setup-token: $ADMIN_SETUP_TOKEN" \
  -H "Content-Type: application/json"
```

### 3. Verifikasi Tabel Terbentuk
```bash
# Cek via Supabase dashboard
# atau
curl https://cc-acehtengah.vercel.app/api/health
```

### 4. Test Query DTSEN
```bash
curl -X POST https://cc-acehtengah.vercel.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Berapa jumlah penerima bansos di Laut Tawar?"}'
```

## Fitur 3 Sumber Data

### 1. SAPA (Live)
- Endpoint: `/api/stats`, `/api/query`
- Data: ~2.032 records dari api-splp.layanan.go.id
- Status: ✅ Siap pakai

### 2. Bapokting (Live)
- Scraper: `src/lib/bapokting-client.ts`
- Sumber: cc.acehtengahkab.go.id/data-bapokting
- Trigger: Query mengandung "harga", "beras", "pangan"
- Status: ✅ Siap pakai

### 3. DTSEN (Butuh Setup)
- Planner: `src/services/dtsen-planner.ts`
- Model DB: `DtsenRelease`, `DtsenIndividu`, `DtsenAgregatWilayah`
- Trigger: Query mengandung "dtsen", "desil", "bansos", "pkh"
- Status: ⏸️ Menunggu setup API

## Demo untuk Meeting

### Test SAPA
```bash
curl -X POST https://cc-acehtengah.vercel.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Statistik stunting 2024"}'
```

### Test Bapokting
```bash
curl -X POST https://cc-acehtengah.vercel.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Harga beras hari ini"}'
```

### Test DTSEN (setelah setup)
```bash
curl -X POST https://cc-acehtengah.vercel.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Jumlah penerima PKH di Aceh Tengah"}'
```

## Branch Status
- `hotfix/meeting-ready` → **Production** ✅ (Live)
- `feat/ai-executive-answer-v3` → diamankan untuk client
- `main` → stable

## Catatan Penting
1. **DTSEN Tables**: Belum ada di database, perlu jalankan `/api/setup`
2. **Setup Token**: Ambil dari Vercel dashboard → Settings → Environment Variables
3. **Access Control**: Endpoint DTSEN protected (butuh auth untuk import/query per-orang)
