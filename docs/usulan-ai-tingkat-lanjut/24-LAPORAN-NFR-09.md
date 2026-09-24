# 24 — Laporan NFR-09: Aksesibilitas Halaman Utama (WCAG 2.2 AA)

**Tanggal:** 24 September 2026 · **Basis:** cabang kerja `dev`, tanpa menyentuh `main` (`ff00eb8`), tanpa operasi remote
**Kriteria terima (dokumen 10):** *WCAG 2.2 AA — kontras, fokus, label ARIA, navigasi papan ketik*
**Status:** ✅ kode + pemeriksa otomatis + bukti `sebelum/sesudah` + uji yang tidak vakum

---

## 1. Yang ditemukan (sebelum perbaikan)

Semua temuan di bawah **terukur**, bukan tafsiran: pemeriksa membaca HTML yang benar-benar
dikirim server (`/dashboard`) dan menghitung kontras token yang benar-benar dipakai.

| # | Temuan | Kriteria WCAG | Ukuran sebelum |
|---|---|---|---|
| 1 | **Dua `<h1>`** pada satu halaman (kepala dashboard + merek sidebar) | 1.3.1 · 2.4.1 | 2 × `<h1>` |
| 2 | Tidak ada **tautan "Lompati ke konten"** | 2.4.1 (Bypass Blocks) | 0 tautan |
| 3 | **Isian pertanyaan tanpa label** — hanya placeholder | 3.3.2 (Labels or Instructions) | 0 label |
| 4 | Tidak ada **wilayah live** — jawaban muncul tanpa diumumkan | 4.1.3 (Status Messages) | 0 `aria-live` |
| 5 | **Kontrol ringkas < 24 px** (chip, tombol ringkas teks 9–10 px) | 2.5.8 (Target Size, baru di 2.2) | 11 kontrol |
| 6 | Teks samar di kepala gelap | 1.4.3 (Contrast) | **2,47:1** dan **3,60:1** (butuh 4,5:1) |
| 7 | Batas kartu di permukaan putih | 1.4.11 (Non-text Contrast) | **2,97:1** (butuh 3,0:1) |
| 8 | Teks tint peringatan | 1.4.3 | **3,84:1** |
| 9 | Tidak ada cincin fokus yang dijamin; `prefers-reduced-motion` tidak dihormati | 2.4.7 · 2.4.11 · 2.3.3 | tidak ada aturan |
| 10 | Kepala kolom tabel tanpa `scope` (panel jawaban) | 1.3.1 (Info and Relationships) | 11 `<th>` |

## 2. Perbaikan

| Berkas | Perubahan |
|---|---|
| `src/app/globals.css` | `--text-on-dark-muted` (#B8CBBE, 8,99:1 di kepala gelap); `--border` #9A9683 → **#8E8A76** (3,47:1 di putih, 3,13:1 di latar halaman); `--secondary` → **#6F5716** (5,45:1 di tint peringatan); aturan **`.target-min`, `button`, `[role=button] { min-height/min-width: 24px }`**; cincin fokus dua lapis `:focus-visible` (garis gelap + halo putih, terlihat di permukaan terang **dan** gelap); blok `prefers-reduced-motion` |
| `src/app/dashboard/layout.tsx` | Tautan **"Lompati ke konten"** (tersembunyi sampai difokus) → `#konten-utama`; `<main id="konten-utama">`; warna teks kepala memakai `--text-on-dark-muted` |
| `src/components/Sidebar.tsx` | `<h1>` merek → `<p>` (judul halaman tunggal); `<nav aria-label="Navigasi utama">`; `aria-current="page"` pada menu aktif; warna di strip gelap |
| `src/components/QueryBar.tsx` | `aria-label` pada isian; warna placeholder memakai `--text-muted` |
| `src/app/dashboard/DashboardClient.tsx` | Wilayah live `role="status" aria-live="polite"` (untuk pembaca layar saja): menyusun → siap → gagal |
| `src/components/ExecutiveAnswerRenderer.tsx` | 11 `<th>` diberi `scope="col"`; `<caption>` (sr-only) pada tabel bukti & tabel per kategori |
| semua komponen halaman utama | kelas `text-[#767D6F]` (4,26:1 di putih, **3,60:1 di gelap**) diganti token `--text-muted` (#5C6358; 6,21:1 di putih, 4,97:1 di blok sekunder) |

Perubahan warna sengaja **minimum dan terukur**: setiap nilai baru dipilih karena angka
kontrasnya, bukan karena selera — dan dituliskan di komentar CSS beserta angkanya.

## 3. Alat pembukti

Dua berkas baru, satu sumber kebenaran (agar harness dan uji unit tidak pernah berbeda):

| Berkas | Isi |
|---|---|
| `verifikasi/aksesibilitas.mjs` | Fungsi murni: `rasioKontras`, `periksaKontras` (25 pasangan warna nyata), `periksaHtml` (dokumen), `periksaPotonganHtml` (fragmen komponen), `periksaCss` (janji di CSS yang dikirim server) |
| `scripts/uji-aksesibilitas.mjs` | Harness: mengambil HTML + CSS nyata dari aplikasi, memeriksa, **dan menguji dirinya sendiri** |
| `src/lib/__tests__/aksesibilitas.test.tsx` | 9 uji: rumus kontras, cacat yang ditanam, tanpa positif palsu, markup panel jawaban yang benar-benar dirender |

**Harness ini tidak dapat hijau secara vakum.** Ia menanam 12 cacat (9 pada HTML halaman nyata,
3 pada CSS nyata) dan **gagal** bila salah satu tidak tertangkap. Cacat yang ditanam antara lain:
lang dihapus, `alt` dihapus, h1 kedua, tautan lompati dihapus, wilayah live dihapus, label isian
dicopot, tombol kehilangan nama, `tabindex="3"`, kontras rendah — plus pemeriksaan **positif palsu**
(pasangan kontras yang jelas aman tidak boleh dituduh melanggar).

## 4. Bukti (sesudah perbaikan)

| Pemeriksaan | Hasil |
|---|---|
| `npx vitest run` | **599/599 lulus** (36 berkas; +9 uji aksesibilitas) |
| `npx tsc --noEmit` | **0 galat** |
| `npm run build` | **exit 0** |
| `node scripts/uji-aksesibilitas.mjs` | **LULUS, keluar 0** — `verifikasi/uji-aksesibilitas.txt` |
| └ struktur `/dashboard` | 1 `<h1>`, 19 kontrol bernama, 0 kontrol ringkas tanpa jaminan |
| └ uji diri pemeriksa | **9/9 sabotase HTML** dan **3/3 sabotase CSS** tertangkap |
| └ kontras | **25/25 pasangan lulus** (paling ketat: batas kartu di latar halaman 3,13:1) |
| Uji markup panel jawaban | 0 pelanggaran; sabotase `scope` dilepas → **tertangkap** (uji gagal bila pemeriksa buta) |

Perbandingan angka kunci: kontras kepala gelap **2,47 → 8,99** · tanggal kepala **3,60 → 8,99** ·
batas kartu **2,97 → 3,47** · tint peringatan **3,84 → 5,45** · `<h1>` **2 → 1** ·
wilayah live **0 → 1** · kontrol ringkas tanpa jaminan **11 → 0**.

## 5. Batas yang jujur (tidak diklaim)

1. **Tanpa peramban, tidak ada pengukuran fokus nyata.** Urutan fokus, perangkap fokus pada
   panel/dialog, dan fokus yang tidak tertutup (2.4.11) diperiksa **secara statis**: adanya
   `:focus-visible` ber-outline ≥ 2 px dan tidak ada `tabindex` positif. Verifikasi dengan
   pembaca layar (NVDA/TalkBack) **belum dilakukan** dan tetap menjadi pekerjaan lapangan.
2. **Ukuran sasaran** diverifikasi lewat janji CSS (`button, [role=button] { min-height: 24px }`)
   dan konvensi kelas `target-min` pada tautan bergaya tombol — bukan lewat pengukuran piksel.
3. **Cakupan = halaman utama (`/dashboard`) dan komponen yang direndernya.** Halaman lain
   (`/dashboard/analytics`, `/dashboard/gis`, `/dashboard/laporan`, `/dashboard/status`,
   `/admin/*`) **belum diaudit**; kelas `text-[#767D6F]` di sana sudah ikut diperbaiki (penggantian
   menyeluruh), tetapi struktur/sasaran/labelnya belum diperiksa.
4. **Kontras dihitung dari token yang terdaftar** di `PASANGAN_KONTRAS` (25 pasangan dengan
   catatan "dipakai di mana"). Bila ada warna baru dipakai di tempat lain, barisnya wajib
   ditambahkan — daftar itu bukan hiasan, ia diperiksa tiap jalan.
5. **Tema gelap** (`[data-theme='dark']`) belum diaudit; halaman utama memakai tema terang.

### Temuan pada alat ukurnya sendiri (jujur, karena ini bagian dari mutu)

Jalan pertama harness **lolos-palsu**: 4 dari 9 sabotase tidak mengubah apa pun (dijalankan pada
contoh karangan yang tidak memuat gambar/isian/tombol), dan pemeriksaan `tabindex` hanya melihat
empat tag sehingga `tabindex="3"` pada `<main>` lolos. Jalan kedua menemukan dua cacat lagi:
pemeriksa `aria-hidden` hanya melihat elemen itu sendiri (bukan leluhurnya), dan blok "wilayah
live" sempat ikut terpindah ke pemeriksaan fragmen. Ketiganya diperbaiki di jalan yang sama, dan
sekarang **diuji**: uji unit menegaskan potongan tanpa `<main>`/`<h1>`/`aria-live` tetap gagal di
tingkat dokumen.

## 6. Cara mengulang

```bash
# 1. aplikasi (lihat 11-KIT-SERAH-TERIMA.md §7)
npm run build
ADMIN_TOKEN=token-uji-123 REVALIDATE_SECRET=rahasia-uji \
SAPA_SPLP_BASE_URL=http://127.0.0.1:9955/sapa/1.0/api \
AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=http://127.0.0.1:8899/v1 \
AI_API_KEY=mock-uji AI_MODEL=mock-pintar npx next start -p 3131 &

# 2. pemeriksaan aksesibilitas (mandiri, ± 1 detik)
SAPA_A11Y_URL=http://127.0.0.1:3131 node scripts/uji-aksesibilitas.mjs   # harus keluar 0

# 3. uji unit (termasuk markup panel jawaban)
npx vitest run src/lib/__tests__/aksesibilitas.test.tsx
```

Cara membuktikan pemeriksa tidak vakum: hapus `.target-min, button, [role=button] { min-height: 24px }`
dari `globals.css`, `npm run build`, lalu ulangi langkah 2 — harness **wajib GAGAL** (sabotase CSS
ke-1). Cara lain: kembalikan satu `text-[#767D6F]` ke kepala gelap → pasangan kontras gagal.

## 7. Dampak pada dokumen 10

| Butir | Sebelum | Sesudah |
|---|---|---|
| **NFR-09** Aksesibilitas halaman utama | ⬜ | ✅ WCAG 2.2 AA: 1 `<h1>`, tautan lompati, label isian, wilayah live, sasaran 24 px, cincin fokus, tanpa `tabindex` positif, 25/25 pasangan kontras lulus — diperiksa otomatis dengan 12 sabotase |

## 8. Berikutnya

Urutan yang disetujui: DS-03 ✅ → **NFR-09 ✅** → **FR-18** (bentuk jawaban per niat: tabel tren,
peringkat 5 besar, komposisi — minimal 3 bentuk per niat lulus) → **DS-05** (kamus sinonim daerah
≥ 50 entri).
