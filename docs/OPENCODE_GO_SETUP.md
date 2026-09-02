# Panduan Aktivasi OpenCode Go untuk SAPA Smart AI

## Status Saat Ini
- ✅ API key OpenCode Go: [REDACTED] (sudah dibuat di workspace baru)
- ❌ Model `deepseek-v4-flash`: BUTUH OPT-IN di workspace Go
- ❌ Key belum valid di endpoint `/zen/go/v1`

## Langkah Aktivasi (DI LAKUKAN DI BROWSER)

### 1. Buka Workspace Go
```
https://opencode.ai/workspace/wrk_01KRR4R9YNHVJ349SQD0P6JKFM/go
```

### 2. Opt-In Model yang Diinginkan
Di halaman workspace, klik model berikut untuk mengaktifkan:
- [ ] `deepseek-v4-flash` (RECOMMENDED - cepat & murah)
- [ ] `glm-5.3-flash` (alternatif - retention tinggi)
- [ ] `qwen3.7-plus` (multilingual Indonesia)

### 3. Generate API Key Baru (jika diperlukan)
Setelah opt-in, generate API key baru di:
```
https://opencode.ai/auth
```
Pilih workspace **Go** (bukan Zen), lalu copy key-nya.

### 4. Update .env.local
Setelah dapat key baru, update file:
```bash
cd ~/Desktop/Niumination/services/cc-acehtengah
nano .env.local
```

Ubah baris:
```
AI_API_KEY=<PASTE_KEY_BARU_DISINI>
```

### 5. Deploy ke Vercel
```bash
git add .env.local
git commit -m "feat: update OpenCode Go API key"
git push
```

## Ringkasan Model Tersedia di Go
| Model | Cost/Session | Cache | Rekomendasi |
|-------|--------------|-------|-------------|
| `deepseek-v4-flash` | $0.105 | 94% | ✅ **PILIHAN UTAMA** |
| `glm-5.3-flash` | $0.022 | 93% | ✅ Termurah |
| `mimo-v2.5` | $0.003 | 94% | ✅ Paling hemat |
| `qwen3.7-plus` | - | - | ✅ Bahasa Indonesia |

## Troubleshooting

### Error: "Invalid API key"
- Key masih untuk Zen, bukan Go
- Solution: Generate key baru di workspace Go

### Error: "RegionError - requires explicit opt in"
- Model belum diaktifkan di workspace
- Solution: Buka link workspace di atas, klik opt-in model

### Error: "Model not found"
- Model belum tersedia di subscription Go Anda
- Solution: Pilih model lain dari daftar di atas
