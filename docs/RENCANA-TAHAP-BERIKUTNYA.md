# Rencana Tahap Berikutnya — sapa-ai (2026-09-06)

> Status kini: AI **AKTIF** produksi (`glm-5.3` OpenCode Go, `sapa-smart-ai.vercel.app`).
> Gerbang lolos 47/52 (90,4% pass, 9,6% replaced, 0 fail). Deterministik 74/78, regresi 0.
> Aturan main: deterministik tetap kebenaran yang disajikan bila AI gagal (fallback, bukan error).

## Tahap A — Polish narasi (P0, bug terlihat produksi)

- **A1. Duplikasi satuan** (`"31,4 Persen (2025) persen"`, `"rupiah rupiah"`).
  Dugaan: eject `{{id|t}}` + kata satuan model bertumpuk. Perbaiki di lapis
  eject/format + tambah test unit. DoD: 5 query showcase tanpa duplikasi.
- **A2. Latensi mode aktif** (9–38 dtk, default timeout 20 dtk → fallback sehat
  tapi lambat). Pertimbangkan SSE (`/api/query/stream` sudah ada) sebagai jalur
  utama UI agar parsial mengalir. DoD: UI memakai stream, fallback tetap jalan.

## Tahap B — Operasi produksi (P0)

- **B1. Monitor**: cek `dailyUsed` via `/api/status`, awasi log Vercel pola
  `[ai-error]`/`[ai-retry]`, alert kuota 5-jam (>80% dari $3 — pernah 66% sehari).
- **B2. `AI_DAILY_CALL_LIMIT` eksplisit** di Vercel (kini default kode 2000).
  Tentukan angka bersama bendahara kuota sebelum traffic naik.
- **B3. Re-baseline eval mode aktif.** Baseline kini deterministik (2026-09-04);
  jawaban tersaji aktif = narasi AI → butuh baseline baru agar regresi bermakna.
  DoD: `eval --baseline` vs produksi-aktif hijau, disimpan terpisah.

## Tahap C — Biaya (TERKUNCI — hanya atas perintah eksplisit owner)

- **C1. Uji `deepseek-v4-flash`** (kemungkinan non-reasoning: cepat, murah, muat
  budget kecil) dalam shadow + gerbang penuh. Jangan sentuh default sebelum lolos.
- Jangan ganti `glm-5.3` tanpa perintah (boros tapi terbukti lolos).

## Tahap D — Fase 3: pemahaman konsep (dari roadmap arena.ai)

- Empat gagal abadi **C9, D4, D5, M1** butuh embedding/sinonim, bukan daftar kata
  (daftar kata = overfitting, dilarang). DoD: 78/78 atau alasan tertulis per item.

## Tahap E — Hutang lama (diketahui, bukan blokir)

- Prune dep menganggur (`prisma/bcryptjs/jose/next-auth` + postinstall).
- Buang `rekons.md`, arsipkan jejak DTSEN di `docs/archive`/`references` atau biarkan.
- Hapus branch `origin/feat/perf-rsc-cache` bila tak terpakai (tanya owner).
- Putuskan durasi shadow produksi (saran: 1 siklus pelaporan).
