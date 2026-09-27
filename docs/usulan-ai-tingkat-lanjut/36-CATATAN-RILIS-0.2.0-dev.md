# 36 — Catatan rilis `v0.2.0-dev` (gelombang peningkatan AI tingkat lanjut)

**Tanggal catatan:** 27 September 2026 · **Cabang:** `dev` · **Basis:** `main` `ff00eb8` (tidak disentuh)
**Status:** **belum dipromosikan ke produksi** — menunggu keputusan pemilik produk.

Dokumen ini menutup butir **OPS-05** di [dokumen 10](10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md):
*"setiap rilis punya catatan + tag git"* — bentuknya tiga bagian yang diminta kriteria itu:
**isi**, **bukti**, dan **cara mundur**.

---

## 1. Isi (apa yang berubah)

| Kelompok | Yang ditambahkan/diperbaiki |
|---|---|
| **Ketahanan & kejujuran operasional** | Sirkuit pemutus penyedia + klasifikasi galat · metrik jujur (`recordMetrics` di-`await`) · `/api/revalidate` **fail-closed** · `/api/status` melaporkan keadaan nyata |
| **Mutu jawaban deterministik** | Niat jawaban (tren/perbandingan/peringkat/komposisi/distribusi/katalog/sebab) · gerbang nilai-tambah · lima sebab positif-palsu grounding · aturan entitas · preferensi satuan · penjaga kejujuran granularitas |
| **Lapis semantik** | Vektor Bahasa Indonesia + **fusi RRF k=60** (leksikal tetap prioritas) · 33 uji · ambang kalibrasi dari data produksi |
| **Bentuk & sitasi** | Bentuk jawaban per niat · **sitasi per klaim `[n]`** · klasifikasi sebab kegagalan · pemeriksa pasangan entitas |
| **Kesegaran data (`DS-03`, `FR-25`)** | Stempel waktu tarik + **sidik korpus** + tahun data pada setiap jawaban · penyegaran cache terjadwal + pembukuan · **alarm kesegaran dua sebab** (tarikan lama & **tahun katalog tertinggal**) |
| **Tata kelola & transparansi** | Halaman `/keterbukaan` + mesin keterbukaan · kanal koreksi "lapor angka" · register 9 risiko AI · jejak audit (JSON & streaming) tanpa data pribadi |
| **Aksesibilitas** | WCAG 2.2 AA rute inti + pemeriksa otomatis |
| **Bahasa daerah** | Kamus sinonim Aceh **57 entri** + tinjauan berkala 3 bulan |
| **Gerbang uji** | Eval **120 item** + baseline · A/B AI vs deterministik · `uji-terima.sh` · **anggaran p95** · **uji kontrak skema SPLP** |

Rincian tiap butir beserta laporan pengukurannya ada di dokumen `12`–`31` dan `33`–`35`.

---

## 2. Bukti (angka yang dapat diperiksa)

| Gerbang | Hasil | Artefak |
|---|---|---|
| Uji unit | **745 lulus / 45 berkas** | `npx vitest run` |
| Typecheck | bersih (`tsc --noEmit`) | `npm run typecheck` |
| Build produksi | lulus (Next 16.2.10) | `npm run build` |
| Pagar PII | `LEAK_COUNT 0` | `scripts/pii-gate.sh` |
| Eval deterministik & AI | **120/120** (mode AI dengan penyedia tiruan) | `verifikasi/eval120-*.txt` |
| Uji kontrak SPLP | kontrak 13 pemeriksaan lulus · 3 sabotase **tertangkap** · pergeseran `satuan` GAGAL | `verifikasi/uji-kontrak-splp.txt` · `verifikasi/kontrak-splp.json` |
| Anggaran kinerja | **p50 142–150 ms · p95 186–200 ms** (anggaran 1000 ms) · kontrol negatif anggaran 1 ms **GAGAL** | `verifikasi/uji-kinerja.txt` · `uji-kinerja-anggaran-terlampau.txt` |
| Alarm kesegaran | dua keadaan korpus **13 ✓ / 0 ✗** | `verifikasi/uji-kesegaran.txt` |
| Uji terima penuh | **LULUS exit 0** (§1b kontrak + §6i kinerja ikut) | `verifikasi/uji-terima-p2-p5.txt` |
| Lingkungan kotor | gerbang penuh LULUS meski shell memuat `REVALIDATE_SECRET` | `verifikasi/uji-terima-lingkungan-kotor.txt` |

**Batas yang jujur** (jangan dibaca lebih jauh dari kenyataannya): korpus uji adalah tarikan
produksi **24 Sep 2026** (2.065 record); jalur AI diuji dengan **penyedia tiruan** karena
langganan belum diperpanjang (EV-06); skor panel penilai manusia (EV-05) belum ada — yang ada
baru praskor mesin; pemeriksa aksesibilitas bekerja tanpa peramban.

---

## 3. Cara mundur (rollback)

**Sasaran NFR-10: ≤ 5 menit, tanpa kehilangan data** (aplikasi tidak menyimpan data pengguna;
satu-satunya keadaan yang tersimpan adalah *cache* dan *pembukuan penyegaran*, keduanya dapat dibangun ulang).

| # | Keadaan yang dihadapi | Langkah | Waktu |
|---|---|---|---|
| **1** | Sudah dipromosikan ke produksi dan ada masalah | Dasbor Vercel → **Deployments** → pilih deployment sebelumnya → **Promote to Production**. Deployment sebelumnya masih utuh; tidak menyentuh Git | ± 1 menit |
| **2** | Perlu mundur di tingkat kode | `git switch main` — seluruh gelombang ini berada di `dev`, jadi `main` **adalah** keadaan aman sebelumnya | ± 10 detik |
| **3** | Ingin mematikan hanya jalur AI, tanpa deployment | Setel `AI_ENABLED=false`. Aplikasi tetap menjawab **100 %** pertanyaan lewat jalur deterministik penuh (NFR-03) — bukan halaman kosong | ± 1 menit |
| **4** | Korpus/cache perlu dipaksa segar | `curl -X POST -H "x-revalidate-secret: $REVALIDATE_SECRET" …/api/revalidate` (endpoint fail-closed) | ± 10 detik |
| **5** | Satu butir patch bermasalah spesifik | `git revert <sha>` pada `dev` (setiap butir = satu komit; daftar `0001`–`0057` ada di kit) | ± 2 menit |

**Yang TIDAK diperlukan saat mundur:** migrasi database (tidak ada), pemulihan berkas pengguna
(tidak ada), perubahan variabel lingkungan (kecuali opsi 3/4 di atas).

---

## 4. Tag rilis (keterbatasan yang harus diketahui)

Tag **tidak ikut** melewati patch/`git am` maupun salinan ringkas berkas. Karena itu tag dibuat
di repo pemilik, sekali, setelah seluruh patch diterapkan:

```bash
git switch dev
git log --oneline -1                 # pastikan ujungnya komit catatan rilis ini
git tag -a v0.2.0-dev -m "Gelombang peningkatan AI tingkat lanjut (dev) — catatan: docs/usulan-ai-tingkat-lanjut/36"
git tag -n1 | grep v0.2.0-dev        # periksa tag benar-benar ada
```

**Kriteria terima OPS-05 terpenuhi bila:** (a) catatan rilis ini ada di repo, (b) `CHANGELOG.md`
memuat entri `0.2.0-dev` dengan isi · bukti · cara mundur, dan (c) `git tag` menampilkan `v0.2.0-dev`.
Butir (a) dan (b) sudah ada di cabang ini; **(c) menunggu tindakan di repo pemilik.**

---

## 5. Yang belum ditutup (agar catatan ini tidak dibaca sebagai "selesai penuh")

1. **Panel penilai manusia EV-05** — instrumen siap, menunggu 2 penilai.
2. **EV-06 / NFR-01** — uji & latensi dengan model sungguhan; menunggu langganan penyedia.
3. **Aksesibilitas 11 rute** (kini 3 rute inti) + uji fokus berperamban.
4. **FR-13/FR-14** (indeksasi berkonteks & penerimaan fusi dengan embedding sungguhan).
5. **DS-04** (data tingkat desa dari OPD) & **P16** — administratif, bukan kode.

Daftar lengkap + siapa yang menutupnya: [dokumen 35 §F](35-RENCANA-KERJA-BERIKUTNYA.md).
