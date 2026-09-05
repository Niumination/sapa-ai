# sapa-ai — Vercel Environment Variables (SPLP-only, publik)

> Semua variabel **OPSIONAL**. Tanpa satu pun, aplikasi berjalan 100%
> deterministik dari SPLP. Jangan pernah commit nilai asli.

```bash
# ─── AI narasi (OpenCode Go) — aktif hanya bila SEMUA terisi + gerbang lolos ───
AI_ENABLED=true
AI_PROVIDER=opencode-go
AI_MODEL=glm-5.3
AI_API_KEY=<isi via Dashboard → Settings → Environment Variables>
# AI_BASE_URL= (kosongkan = preset bawaan https://opencode.ai/zen/go/v1)
# AI_MAX_OUTPUT_TOKENS=3000
# AI_TIMEOUT_MS=20000

# ─── Revalidate (WAJIB sebelum produksi — tanpa ini endpoint publik) ───
REVALIDATE_SECRET=<hex acak 32 byte: openssl rand -hex 32>

# ─── Mode ukur (bukan produksi) ───
# AI_SHADOW=true   # model dipanggil & diukur, pengguna tetap terima deterministik
```

Catatan: repo ini SPLP-only — tidak ada DATABASE_URL/JWT/cron untuk sapa-ai.
