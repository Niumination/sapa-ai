# Cara Set Environment Variables di Vercel

## Lingkungan Saat Ini
- **Provider**: OpenCode Zen (FREE)
- **Model**: `nemotron-3-ultra-free`
- **Base URL**: `https://opencode.ai/zen/v1`
- **API Key**: Same as Hermes (`OPENCODE_API_KEY`)

## Langkah-langkah

### 1. Login ke Vercel CLI
```bash
vercel login
```

### 2. Set Environment Variables
```bash
cd ~/Desktop/Niumination/services/cc-acehtengah

# AI Provider
vercel env add AI_BASE_URL production
# Input: https://opencode.ai/zen/v1

vercel env add AI_API_KEY production
# Input: (key dari OPENCODE_API_KEY di .hermes/.env)

vercel env add AI_MODEL production
# Input: nemotron-3-ultra-free
```

### 3. Deploy ke Production
```bash
vercel --prod
```

### 4. Verifikasi
```bash
curl -X POST https://cc-acehtengah.vercel.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"query":"apa saja OPD di aceh tengah"}'
```

## Alternatif: Lewat Vercel Dashboard

1. Buka https://vercel.com/Niumination/cc-acehtengah
2. Pilih project → **Settings** → **Environment Variables**
3. Tambah 3 vars:
   - `AI_BASE_URL` = `https://opencode.ai/zen/v1`
   - `AI_API_KEY` = (ambil dari ~/.hermes/.env)
   - `AI_MODEL` = `nemotron-3-ultra-free`
4. Deploy ulang

## Catatan Penting

- `.env.local` TIDAK perlu di-commit (sudah di-.gitignore)
- Vercel env vars lebih aman karena terenkripsi
- Setelah deploy, test di: https://cc-acehtengah.vercel.app/api/query
