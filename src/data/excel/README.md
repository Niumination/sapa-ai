# Dokumen Excel — Sumber Data AI (Dokumen A/B/C)

Data agregat dari 6 berkas Excel pemberdayaan sosial Kab. Aceh Tengah,
diekstrak secara deterministik menjadi bentuk **agregat tanpa PII** agar aman
dikomit dan ditampilkan di jawaban AI.

## Klasifikasi (sesuai permintaan)

| Slug | Dokumen | OPD | Sumber asli |
|---|---|---|---|
| `dok-a-01-pendidikan-pencapaian-2025` | A | Dinas Pendidikan | `2025 MISKIN PENDIDIKAN.xlsx` (sheet PENCAPAIAN) |
| `dok-a-02-santri-dalam-daerah-2025` | A | Dinas Pendidikan | `DHV SANTRI DALAM DAERAH 2025.xlsx` |
| `dok-a-03-santri-luar-daerah-2025` | A | Dinas Pendidikan | `DHV SANTRI LUAR DAERAH 2025.xlsx` |
| `dok-a-04-mahasiswa-s1-luar-daerah-2025` | A | Dinas Pendidikan | `DHV TA S1 LUAR DAERAH 2025.xlsx` |
| `dok-b-01-stunting-2026-07` | B | Dinas Kesehatan | `STUNTING BY NIK.xlsx` |
| `dok-c-01-kominfo-ppks` | C | Diskominfo | `data kominfo.xlsx` |

## Keamanan PII (UU PDP)

Berkas asli sebagian besar memuat data per-orang sensitif (NIK, nama, alamat,
kontak, nama anak). **Tidak satu baris pun data per-orang yang dikomit.**
Untuk sheet penerima bantuan, hanya diambil agregat: jumlah penerima dan total
bantuan per lembaga/kecamatan/kriteria. Verifikasi: jalankan pemindaian
`\b\d{16}\b` — harus 0 kecocokan di `json/` maupun `xlsx/`.

## Format

- `json/<slug>.json` — dipakai runtime (diimpor via `import` dengan `resolveJsonModule`).
- `xlsx/<slug>.xlsx` — salinan agregat bebas-PII untuk audit/arsip, bukan dipakai runtime.
