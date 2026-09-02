# OpenCode Go API Status — 31 Agu 2026

## Masalah
API chat completions OpenCode Go sedang **DOWN** (issue #35276).

### Yang Berfungsi
- ✅ `GET /zen/go/v1/models` — list model (200 OK)
- ✅ Workspace API keys valid

### Yang Rusak
- ❌ `POST /zen/go/v1/chat/completions` — 500 Internal Server Error
- ❌ `POST /zen/go/v1/responses` — 500 Internal Server Error

## Workaround
Sambil menunggu OpenCode fix, gunakan **OpenCode Zen (FREE)** sebagai fallback:
- Endpoint: `https://opencode.ai/zen/v1`
- Model: `nemotron-3-ultra-free`
- Status: ✅ Berfungsi (meski kadang 502)

## Update
Pantau issue: https://github.com/anomalyco/opencode/issues/35276
