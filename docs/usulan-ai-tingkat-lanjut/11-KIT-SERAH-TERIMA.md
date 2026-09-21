# 11 — Kit Serah Terima (repo lokal · hermes agent · localhost)

Dokumen ini menjawab: **"bagaimana cara memindahkan dan menguji hasil kerja ini di repo lokal saya
yang sedang dikerjakan agen lain, tanpa mengganggu `main`?"**

Semua perintah di bawah dijalankan **dari dalam klon repo lokal Anda**. Tidak ada langkah yang
menyentuh `main` sampai Anda sendiri memutuskan.

---

## 1. Apa yang diserahkan

| Aset | Letak | Isi |
|---|---|---|
| **Cabang utuh** | `usulan/perbaikan-ai-2026-09-21` @ `b64231d` | 7 komit, 0 divergensi dari `main` (fast-forward) |
| **Seri patch** | `06-USULAN-KODE/seri-patch/` | `0001`…`0007` (urutan wajib) + `00-semua.patch` (paket tunggal) |
| **Skrip uji terima** | `06-USULAN-KODE/uji-terima.sh` | memutuskan LULUS/GAGAL sesuai ambang dokumen `10` |
| **Alat pengukuran** | `verifikasi/mock-llm.mjs`, `verifikasi/banding-ai-vs-det.py`, `verifikasi/banding-main-vs-branch.py` | penyedia model tiruan + dua harness pembanding |
| **Bukti angka** | `verifikasi/eval90-*.txt`, `banding-G.txt`, `aman-cabang-perilaku.txt`, `uji-terima-hasil.txt` | semua hasil yang diklaim di dokumen `10` |
| **Spesifikasi kebutuhan** | `10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md` | daftar kebutuhan `FR/NFR/DS/EV/OPS/CMP` + kriteria terima |
| **Peta kerja tinggal-jalan** | `10` §11 (Fase B–D) | urutan pekerjaan berikutnya + perkiraan usaha |

## 2. Prasyarat

| Hal | Nilai yang diuji | Catatan |
|---|---|---|
| Node.js | 20.20.2 (dipakai saat pengujian) | Node 20 EOL 30 Apr 2026 — jadwalkan naik versi |
| Next.js | 16.2.10 | tidak ada perubahan dependensi di cabang ini |
| Uji | 20 berkas / **237 uji** | `npm test` |
| Variabel lingkungan baru | `REVALIDATE_ALLOW_UNSIGNED` (opsional) | **`REVALIDATE_SECRET` kini wajib** agar penyegaran cache tidak tertolak (fail-closed) |
| Penyimpanan | memori proses (tanpa Redis) atau Upstash | tanpa Redis, sirkuit & saklar hidup per-instance (tetap benar, hanya perlu belajar sekali) |

## 3. Tiga cara menerapkan

**Cara A — ambil cabangnya (paling utuh, disarankan bila agen Anda bekerja di cabang lain):**

```bash
git fetch origin usulan/perbaikan-ai-2026-09-21     # atau impor bundel/zip bila offline
git switch -c kerja/ai-tingkat-lanjut origin/usulan/perbaikan-ai-2026-09-21
```

**Cara B — seri patch (paling terkendali; satu komit = satu alasan):**

```bash
git switch -c kerja/ai-tingkat-lanjut main
git am 06-USULAN-KODE/seri-patch/0001-*.patch
# … ulangi 0002 … 0007 (urutan wajib) — atau sekaligus:
git am 06-USULAN-KODE/seri-patch/000[1-7]-*.patch
```

**Cara C — paket tunggal (paling cepat, riwayat menjadi satu komit):**

```bash
git switch -c kerja/ai-tingkat-lanjut main
git apply --3way 06-USULAN-KODE/seri-patch/00-semua.patch
git add -A && git commit -m "AI tingkat lanjut: gelombang 1-3 (set 90 item)"
```

Setelah salah satu cara: `npm ci` (walaupun dependensi tidak berubah, ini memastikan `node_modules`
selaras) lalu jalankan uji terima (§7).

> **Catatan tentang bit eksekusi:** komit `0003`/`0004` hanya memulihkan bit eksekusi
> `.githooks/pre-commit` & `scripts/pii-gate.sh` yang hilang saat pemindahan berkas. Bila Anda
> memakai Cara C dan hook tidak dipakai, dua komit itu boleh dilewati.

## 4. Titik yang perlu perhatian saat menerapkan

| Berkas | Mengapa berpotensi bertabrakan | Saran |
|---|---|---|
| `src/lib/sapa-client.ts` | pusat retrieval — paling banyak disentuh gelombang ini (entitas, satuan, sinonim, granularitas) | terapkan **setelah** patch lain; jalankan `retrieval.test.ts` segera |
| `src/services/grounding.ts` | pagar mutu; `groundOutput()` **dihapus** | bila agen Anda masih memanggil `groundOutput`, alihkan ke `dasar.response` (jawaban deterministik lengkap) |
| `src/services/answer-compose.ts` | orkestrasi AI + gerbang nilai-tambah + penjaga permintaan sistem | jangan sisipkan logika sebelum tahap 9 (gerbang) tanpa membaca komentarnya |
| `data/eval-set.json` | naik dari 78 → **90 item** (`versi: 2`) | bila agen Anda menambah item, tambahkan **setelah** item `F1–F4, N1–N4, W1, S1–S3` |
| `data/eval-baseline.json` | baseline kini **90/90, setVersi 2** | jangan timpa dengan baseline lama; bila perlu, `node scripts/eval-run.mjs --baseline` |
| `scripts/eval-run.mjs` | pemindaian invarians memakai teks tanpa kutipan pertanyaan | perubahan ini **wajib** agar item `S1`/`S3` adil |

## 5. Batas kepemilikan berkas (agar tidak bertabrakan dengan agen lain)

| Wilayah | Pemilik yang disarankan | Aturan |
|---|---|---|
| `src/lib/sapa-client.ts`, `src/services/*` | pekerjaan AI/retrieval (cabang ini) | ubah satu per satu, selalu jalankan eval 90 sebelum menutup pekerjaan |
| `src/app/dashboard/**`, `src/components/**` | pekerjaan tampilan | **tidak disentuh** cabang ini; perubahan UI baru aman dari konflik |
| `data/eval-set.json`, `scripts/eval-run.mjs` | mutu/evaluasi | menambah item = menaikkan bar; **jangan** melonggarkan invarians |
| `README.md`, `docs/**`, `AGENTS.md` | dokumentasi repo | cabang ini tidak mengubah isinya (hanya satu berkas berubah **mode**, bukan isi) |
| `vercel.json`, `package.json`, `middleware.ts` | rilis/keamanan | **tidak disentuh**; perubahan di sini butuh persetujuan pemilik |

## 6. Daftar centang serah terima

- [ ] `git status` bersih pada cabang kerja; `main` belum tersentuh.
- [ ] `npm ci` selesai; `npm test` → **237 uji lulus** (≥ 230).
- [ ] `bash verifikasi/uji-terima.sh` → **LULUS** (statis + pagar).
- [ ] Eval dua mode → **90/90** masing-masing, invarians 0, hasil tersimpan di `verifikasi/`.
- [ ] A/B AI vs deterministik → sitasi AI **≥** deterministik.
- [ ] `REVALIDATE_SECRET` disiapkan pada lingkungan non-lokal (Vercel/preview).
- [ ] Rencana mundur diketahui (revert komit / promosi ulang deployment).
- [ ] Satu orang ditunjuk sebagai **pemilik risiko** (ISO 42001) untuk laporan mingguan.

## 7. Menguji di lokal (tanpa biaya, tanpa langganan)

```bash
# 1) Penyedia model tiruan (menjawab gaya model nyata, mencatat tiap panggilan)
node verifikasi/mock-llm.mjs 8899 &

# 2) Aplikasi — mode AI (memakai penyedia tiruan)
AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=http://127.0.0.1:8899/v1 \
  AI_API_KEY=mock-uji AI_MODEL=mock-pintar npx next start -p 3116 &

# 3) Aplikasi — mode deterministik (pembanding)
AI_ENABLED=false npx next start -p 3117 &

# 4) Uji terima lengkap (dua mode, ambang dari dokumen 10)
AI_URL=http://127.0.0.1:3116 DET_URL=http://127.0.0.1:3117 bash verifikasi/uji-terima.sh

# 5) Pada repo lokal, `next start` memakai hasil build: jalankan `npm run build` lebih dahulu
```

Hasil yang diharapkan pada cabang ini (terukur 22 Sep 2026): eval **90/90** dua mode ·
grounded pass **100%** · fallback **0%** · invarians **0** · uji unit **237** ·
A/B sitasi **4,50 vs 3,00** · pertanyaan ber-bukti saat penyedia mati **0,14–0,56 dtk**.

## 8. Memvalidasi dengan model sungguhan (setelah langganan aktif)

```bash
AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=<penyedia asli> AI_API_KEY=<kunci> \
  AI_MODEL=<model> npx next start -p 3116 &
SAPA_EVAL_URL=http://127.0.0.1:3116 node scripts/eval-run.mjs          # bandingkan dengan 90/90
python3 verifikasi/banding-ai-vs-det.py verifikasi/uji-pertanyaan.txt   # A/B vs deterministik
curl -s http://127.0.0.1:3116/api/status | python3 -m json.tool          # cek reachable & health
```

Yang dinilai: (a) apakah set 90 tetap lulus, (b) apakah sitasi AI masih ≥ deterministik,
(c) apakah `ai.nilaiTambah` didominasi `dipakai` (bukan `ditolak-*`). Bila (c) buruk, prompt
perlu disetel — **bukan** gerbangnya dilonggarkan.

## 9. Cara mundur (rollback)

| Keadaan | Tindakan | Waktu |
|---|---|---|
| Baru di cabang kerja | `git switch main` (cabang kerja ditinggalkan) | detik |
| Sudah digabung ke cabang kerja | `git revert <komit>` atau `git reset --hard <komit sebelum>` | detik |
| Sudah naik produksi | Vercel → Deployments → promosikan deployment sebelumnya | < 5 menit |
| Butuh membalik satu gelombang saja | revert komit gelombang tersebut (pesan komit memuat daftar berkas) | menit |

## 10. Setelan lingkungan di Vercel setelah penggabungan

| Variabel | Nilai | Wajib? |
|---|---|---|
| `REVALIDATE_SECRET` | rahasia acak panjang | **wajib** (atau penyegaran cache akan ditolak — fail-closed) |
| `REVALIDATE_ALLOW_UNSIGNED` | `true` hanya bila benar-benar ingin endpoint terbuka | opsional (tidak disarankan) |
| `AI_ENABLED`, `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | tidak berubah dari setelan sekarang | — |
| `AI_CIRCUIT_FAIL_THRESHOLD` | bawaan 3 (kegagalan berturut) | opsional |
| `AI_DAILY_CALL_LIMIT` | tetap seperti sekarang | — |

## 11. Instruksi siap-tempel untuk agen di repo lokal

> **Tugas:** menerapkan versi "AI tingkat lanjut" pada repo ini tanpa menyentuh `main`.
> Sumber: cabang/seri patch dari Arena (`06-USULAN-KODE/seri-patch/`, 7 patch, urut).
> Langkah:
> 1. `git switch -c kerja/ai-tingkat-lanjut main`
> 2. `git am 06-USULAN-KODE/seri-patch/000[1-7]-*.patch`
> 3. `npm ci && npm test` → wajib **237 uji lulus**; `npm run typecheck` → bersih.
> 4. `bash verifikasi/uji-terima.sh` → wajib **LULUS**.
> 5. Jalankan eval dua mode (lihat `11 §7`) → wajib **90/90** masing-masing, **0 regresi**.
> 6. Bila ada konflik, jangan menimpa; laporkan berkas konflik beserta keputusan yang diambil.
> 7. **Jangan** mengubah `data/eval-baseline.json` kecuali setelah eval 90/90 terbukti;
>    **jangan** melonggarkan invarians di `scripts/eval-run.mjs`; **jangan** menghapus pagar
>    grounding/penjaga permintaan sistem (`INV-01`…`INV-07` pada dokumen `10`).
> 8. Laporkan: daftar komit, keluaran `uji-terima.sh`, angka eval, dan berkas yang sempat konflik.

**Kalimat kunci untuk agen:** *"Kebenaran angka tidak bisa dinegosiasikan; kehalusan bahasa bisa."*
Bila ragu antara menambah fitur dan menjaga pagar, **pagar yang menang**.
