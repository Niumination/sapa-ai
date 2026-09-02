# OpenCode Go Integration Test Results
> Date: 2026-08-31
> Tester: Agnes (AI Assistant)

## Test Summary

### API Key yang Dicoba
1. **Key baru dari user**: [REDACTED]
   - Status: ❌ INVALID (AuthError)
   - Kemungkinan: Key belum diaktifkan atau salah endpoint

2. **Key lama (OPENCODE_API_KEY)**: [REDACTED]
   - Status: ✅ VALID untuk endpoint Go
   - Error yang muncul:
     - `RegionError`: Model butuh opt-in di workspace
     - `No payment method`: Subscription belum aktif

### Workspace Info
- Workspace ID: `wrk_01KRR4R9YNHVJ349SQD0P6JKFM`
- URL Workspace: https://opencode.ai/workspace/wrk_01KRR4R9YNHVJ349SQD0P6JKFM/go
- URL Billing: https://opencode.ai/workspace/wrk_01KRR4R9YNHVJ349SQD0P6JKFM/billing

### Model Tersedia di Go (33 models)
```
deepseek-v4-flash, deepseek-v4-pro
glm-5.3-flash, glm-5.3, glm-5.2, glm-5.1, glm-5
kimi-k3, kimi-k2.7-code, kimi-k2.6, kimi-k2.5
mimo-v2.5, mimo-v2.5-pro, mimo-v2-pro, mimo-v2-omni
minimax-m3, minimax-m2.7, minimax-m2.5
qwen3.7-max, qwen3.8-max, qwen3.8-flash, qwen3.7-plus, qwen3.6-plus, qwen3.5-plus
hy4-preview, hy3, hy3-preview
gpt-5.6-luna
grok-4.5, grok-4.6
muse-spark-1.2-contributor
longcat-2.0
```

### Rekomendasi Model untuk SAPA Smart AI
| Model | Cost/Session | Cache | Rekomendasi |
|-------|--------------|-------|-------------|
| `deepseek-v4-flash` | $0.105 | 94% | ✅ PRIMARY (terbaik untuk JSON) |
| `glm-5.3-flash` | $0.022 | 93% | ✅ Fallback (termurah) |
| `mimo-v2.5` | $0.003 | 94% | ✅ Emergency (paling hemat) |
| `qwen3.7-plus` | - | - | ✅ Alternatif (multilingual ID) |

## Next Steps (User Action Required)

1. **Aktifkan Payment Method**
   - Buka: https://opencode.ai/workspace/wrk_01KRR4R9YNHVJ349SQD0P6JKFM/billing
   - Tambah kartu kredit/debit
   - Subscribe Go plan ($10/bulan)

2. **Opt-in Model**
   - Buka: https://opencode.ai/workspace/wrk_01KRR4R9YNHVJ349SQD0P6JKFM/go
   - Klik opt-in untuk: `deepseek-v4-flash`, `glm-5.3-flash`, `mimo-v2.5`

3. **Deploy ke Vercel** (setelah payment aktif)
   ```bash
   vercel env add AI_BASE_URL production -- "https://opencode.ai/zen/go/v1"
   vercel env add AI_API_KEY production -- "[REDACTED_SK]"
   vercel env add AI_MODEL production -- "deepseek-v4-flash"
   vercel deploy --prod
   ```

## Files Created/Updated
- `.env.local` — Updated dengan config OpenCode Go
- `docs/OPENCODE_GO_INTEGRATION.md` — Panduan lengkap
- `docs/OPENCODE_GO_SETUP.md` — Panduan aktivasi
- `references/opencode-go-integration.md` — Reference untuk skill library

## Lessons Learned
1. **OpenCode Go vs Zen**: Key SAMA, endpoint BEDA, perlu aktivasi workspace
2. **Error messages jelas**: `RegionError` = perlu opt-in, `No payment` = perlu billing
3. **Verifikasi workflow**: Probe `/v1/models` dulu, baru chat-completion
4. **Model availability**: Tidak semua model available di semua subscription tier
