# OpenCode Go Integration Plan
> Date: 2026-08-31
> Status: Pending payment method activation

## Summary
- Provider: OpenCode Go (subscription $10/bulan)
- Model: `deepseek-v4-flash` (recommended) atau `glm-5.3-flash` (cheaper)
- API Key: Sudah ada di Hermes (`OPENCODE_API_KEY`)
- Workspace: `wrk_01KRR4R9YNHVJ349SQD0P6JKFM`

## What's Done
- ✅ Konfigurasi `.env.local` diupdate
- ✅ Model `deepseek-v4-flash` tersedia di workspace
- ✅ API key valid (terbukti dari probe)

## What's Needed
- ⏳ **ACTIVATION REQUIRED**: Tambah payment method di workspace Go
  - Link: https://opencode.ai/workspace/wrk_01KRR4R9YNHVJ349SQD0P6JKFM/billing
  - Cost: $10/bulan (Go subscription)

## Deployment to Vercel
Setelah payment method aktif, jalankan:
```bash
cd ~/Desktop/Niumination/services/cc-acehtengah
vercel env add AI_BASE_URL production -- "https://opencode.ai/zen/go/v1"
vercel env add AI_API_KEY production -- "[REDACTED_SK]"
vercel env add AI_MODEL production -- "deepseek-v4-flash"
vercel deploy --prod
```

## Alternative: Gunakan Zen (Free) Saja
Jika Go belum bisa diaktifkan, fallback ke Zen free tier:
```bash
vercel env add AI_BASE_URL production -- "https://opencode.ai/zen/v1"
vercel env add AI_API_KEY production -- "[REDACTED_SK]"
vercel env add AI_MODEL production -- "nemotron-3-ultra-free"
```

## Model Comparison
| Model | Provider | Cost/Session | Cache | Recommendation |
|-------|----------|--------------|-------|----------------|
| deepseek-v4-flash | Go | $0.105 | 94% | ✅ Best for JSON |
| glm-5.3-flash | Go | $0.022 | 93% | ✅ Cheapest |
| mimo-v2.5 | Go | $0.003 | 94% | ✅ Most economical |
| nemotron-3-ultra-free | Zen | FREE | 84% | ⚠️ Fallback (503 sering) |
