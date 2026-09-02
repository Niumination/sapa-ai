# Bapokting Deterministic Query — Reference Notes

## Problem: Output Tidak Berubah Saat Klik Chip Bapokting

**Root Cause:** Query harga komoditas jatuh ke LLM dengan evidence campuran SAPA+DTSEN yang tidak relevan. Output "masih sama seperti lama" karena Bapokting evidence tenggelam di antara evidence lain.

**Fix:** Jalur deterministik di `tryDeterministicDomainQuery` yang memeriksa `ctx.bapoktingEvidence.length > 0` dan menjawab langsung dari data Bapokting (SPLP API) tanpa LLM.

## Data Historis SPLP API

**Ketersediaan data (per Agustus 2026):**
- Hanya data **mingguan**, bukan harian
- Sepanjang Agustus 2026: 4 titik data (10, 17, 24, 31 Agu)
- **TIDAK ADA** data 2025 atau sebelumnya
- Endpoint mendukung parameter `tanggal=YYYY-MM-DD` untuk fetch historis

## Chart Format yang Benar

**User expects:** Line chart dengan x-axis = tanggal (temporal), y-axis = harga.

**Format data untuk frontend:**
```typescript
{
  tipe: 'chart',
  konfigurasi: {
    type: 'line',
    xKey: 'label',
    data: [
      { label: '10 Agu', 'Beras 88': 16000, 'Beras 2 Mawar': 16600, ... },
      { label: '17 Agu', 'Beras 88': 16000, 'Beras 2 Mawar': 16600, ... },
      ...
    ],
    lines: ['Beras 88', 'Beras 2 Mawar', ...]
  }
}
```

**Jangan gunakan:** Chart bar statis (komoditas di x-axis) — ini yang user kritisi sebagai "tidak menunjukkan siklus tren".

## Regex Escape Pitfall

**SALAH:** `/[^\\d.-]/g` (4 backslash) → regex jadi `[^\\d.-]` = selain `\`, `d`, `.`, `-`
**BENAR:** `/[^\d.-]/g` (2 backslash) → regex jadi `[^\d.-]` = selain digit, titik, minus

**Gejala bug:** Chart menampilkan `harga: 0` untuk semua item Bapokting.

## Branch Deployment Note

- `hotfix/meeting-ready` = preview deployment di Vercel
- `main` = production deployment
- User akan cek manual di preview URL karena production adalah branch `main`
