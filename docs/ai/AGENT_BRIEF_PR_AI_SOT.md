# Brief Agent — Review Intens & Eksekusi AI Source-of-Truth

Penerima: agent yang mereviu PR dokumen ini, lalu (hanya setelah lolos) mengeksekusi PR-2…PR-5 di `docs/ai/RENCANA_AI_SOURCE_OF_TRUTH.md`.

Bahasa kerja: Indonesia untuk commit/PR; kode/komentar mengikuti gaya file yang disentuh.

---

## Identitas pekerjaan

- Repo: `Niumination/cc-acehtengah`
- Branch sesi dokumen: lihat PR yang memuat file ini
- SoT angka: **hanya** API SAPA lewat `src/lib/sapa-client.ts` (`fetchSapaData`)
- Bukan SoT: LLM, RAG/Qdrant, mock, contoh prompt, heuristic rekomendasi, dokumen AGENTS.md

---

## Prompt sistem untuk agent (salin apa adanya)

```
Anda mengerjakan perbaikan AI SAPA Smart AI.

WAJIB:
- Baca dulu docs/ai/RENCANA_AI_SOURCE_OF_TRUTH.md sampai selesai.
- Baca src/services/ai-orchestrator.ts, llm-client.ts, intent-detector.ts,
  rag-retriever.ts, src/lib/sapa-client.ts, src/app/api/query/route.ts,
  src/app/dashboard/page.tsx, src/components/AIResponseRenderer.tsx.
- Verifikasi setiap klaim dengan git show / git diff. Jangan percaya
  komentar di kode jika bertentangan dengan implementasi.
- Baseline jangan dihancurkan:
  794b80a TableRenderer dual-format columns
  d1228c6 prioritas indikator match di depan payload
  2c8ad16 Direct SAPA + fallback SPLP + agregasi
  41d7386 jangan dump JSON mentah ke narasi
  5faa080 pola rate-limit query — cherry-pick, jangan revert masal
- Satu fase per PR. Jangan campur theme, GIS, EWS, JWT/setup, rebrand.
- Dilarang panggilan LLM kedua. Dilarang contoh prompt berangka fiktif.
- Dilarang mengarang angka. Jika evidence kosong, jangan call LLM.
- Setelah edit: reread diff. Setiap angka di output harus bisa ditunjuk
  ke field record SAPA.
- Jangan commit file di luar fase. Jangan sentuh .env, secret, package-lock
  kecuali dependensi tes yang disepakati di fase A.
- Branch kerja tetap branch sesi Arena jika itu konteksnya; jangan push
  ke main langsung.

SELESAI HANYA jika ceklis §Definisi selesai di rencana terpenuhi untuk fase itu.
Jika ragu, berhenti dan tulis temuan, jangan “perbaiki sekalian”.
```

---

## Tugas 1 — Review intens PR dokumen (sebelum ada kode)

Kerjakan berurutan. Tulis hasil di komentar PR.

1. `git log --oneline 2c8ad16^..HEAD` dan cocokkan tabel riwayat di rencana. Jika SHA/pesan beda, sebutkan.
2. Buktikan dengan cuplikan kode (path + baris):
   - XOR OPD vs token di `buildContext`
   - OR, bukan AND
   - agregasi first-win tahun
   - `retrieveContext` selalu `[]`
   - `ensureRekomendasi` memanggil `callLLM`
   - client abort 45000 vs LLM 90000
   - `liveNarasi` di-set tapi tidak dirender (HEAD)
   - JWT fallback hardcoded
   - tidak ada `src/lib/rate-limit.ts`
3. Buktikan `git show 5faa080:src/app/api/query/route.ts` memuat rate limit + `maxDuration` dan `7cb1d0e` menghapusnya.
4. Tolak rencana jika:
   - mengembalikan dump `narasi = raw`
   - menghidupkan RAG untuk angka
   - menggabungkan theme/GIS
   - LLM kedua “sementara”
5. Setuju / minta revisi dokumen. **Jangan mulai Fase A sebelum dokumen disetujui manusia.**

---

## Tugas 2 — Eksekusi (setelah lolos review manusia)

Ikuti PR-2 → PR-5 di rencana. Untuk tiap PR:

### Sebelum coding

- `git status` bersih.
- Checkout branch sesi; jangan buat branch lain jika platform mengikat nama branch.
- Tulis daftar file yang boleh berubah (maksimal sesuai fase).

### Saat coding

- Fungsi murni (filter, agregasi tahun, ground) dipisah agar bisa dites tanpa Prisma/fetch.
- Jangan pindahkan file besar “supaya rapi”.
- Prompt: nol contoh fiktif.
- `dataSource` harus membedakan `direct` vs `splp` sesuai cabang `fetchSapaData` yang sukses — perlu return origin dari client, bukan string hardcode SPLP.

### Setelah coding (wajib, tiap PR)

```
npx tsc --noEmit
```

Plus tes unit fase A/B/C yang ditambahkan.

Reread:

- Tidak ada angka di string prompt kecuali yang berasal dari variabel evidence saat runtime.
- Tidak ada `ensureRekomendasi`.
- `AIResponseRenderer` dual columns tetap.
- Diff `git diff --stat` hanya file fase.

### Commit

- Satu fase = satu commit atau beberapa commit kecil se-fase, pesan: `fix(ai): …` / `test(ai): …` / `feat(ai): …`
- Jangan `git add .` membabi buta.

### PR

- Isi: fase, file, cara uji manual 5 query:
  1. jumlah ASN (atau indikator yang ada di fixture)
  2. stunting + kata dinkes
  3. tren 3 bulan (harus “tidak tersedia” jika tak ada deret)
  4. kecamatan X (tidak tersedia)
  5. query acak tanpa match
- Lampiran: `evidenceCount`, apakah LLM dipanggil (ya/tidak), apakah grounding replace.

---

## Matriks regresi yang wajib hijau

| ID | Skenario | Harapan |
|---|---|---|
| R1 | columns table `{key,name}` | tidak crash (`794b80a`) |
| R2 | token stunting di depan payload | tetap (`d1228c6`) |
| R3 | Direct gagal | SPLP; origin tercatat |
| R4 | JSON model rusak | bukan raw dump (`41d7386`) |
| R5 | thinking prefix | tidak tampil di UI |
| R6 | angka model ≠ evidence | diganti template |
| R7 | evidence 0 | 0 call LLM |
| R8 | OPD+token | irisan, bukan seluruh OPD |
| R9 | dua tahun sama indikator | tahun numerik max |
| R10 | timeout | client tidak lebih pendek dari LLM |
| R11 | stream | live narasi terlihat lagi |
| R12 | 11 query/menit | 429 pada pola 5faa080 |

---

## Halt conditions (berhenti, jangan “akali”)

- SAPA schema field berubah (bukan `variabel`/`satuan`/…) → update tipe dulu, PR terpisah.
- Provider menolak `response_format` → fallback teruji, jangan naikkan temperature.
- Tes tidak bisa dijalankan di lingkungan → jangan klaim selesai.
- Konflik dengan pekerjaan theme/GIS di file yang sama → jangan merge manual buta; pilih hunk AI saja.

---

## Definition of Done agent

Komentar PR berisi:

- SHA yang di-review
- Hasil 12 item matriks (pass/fail/skip + alasan skip)
- File yang diubah vs allowlist fase
- Pernyataan: “Tidak ada angka di output yang tidak ada di evidence SAPA pada tes yang dijalankan.”
