# 10 — Kebutuhan Upgrade SAPA AI ke Tingkat Lanjut

**Dokumen ini disusun dari awal (bukan tambalan atas dokumen lama)** dan berdiri sendiri:
dapat dibaca tanpa berkas lain. Disiapkan untuk pemilik produk (klien), pengembang, dan
agen yang bekerja di repo lokal.

| | |
|---|---|
| **Produk** | SAPA Smart AI — tanya-jawab data pembangunan Kabupaten Aceh Tengah |
| **Repo** | `Niumination/sapa-ai` · produksi `https://sapa-smart-ai.vercel.app` |
| **Cabang kerja** | `usulan/perbaikan-ai-2026-09-21` @ `b64231d` — **7 komit di atas `main`, `main` tidak tersentuh** |
| **Tanggal** | 22 September 2026 · disusun Arena.ai Agent Mode |
| **Sasaran dokumen** | menjadi **dasar tunggal** untuk: (1) melanjutkan pengembangan, (2) serah terima ke repo lokal/hermes agent, (3) menilai kesiapan produksi |

---

## 0. Cara memakai dokumen ini

1. **§1–§2** untuk memahami tujuan dan titik berangkat (angka nyata, bukan dugaan).
2. **§3** adalah pagar yang tidak boleh dilanggar siapa pun yang mengubah kode.
3. **§4–§9** adalah daftar kebutuhan bernomor (`FR-*`, `NFR-*`, `DS-*`, `EV-*`, `OPS-*`, `CMP-*`).
   Setiap butir punya **kriteria terima yang terukur** dan **status**: ✅ sudah · 🟡 sebagian · ⬜ belum.
4. **§10–§11** menentukan urutan pengerjaan (fase) dan apa yang dianggap "selesai".
5. **§12** memberi perintah pengujian yang bisa dijalankan di workspace ini **atau** di repo lokal Anda.
6. **§13–§14** risiko, asumsi, dan daftar centang serah terima.
7. **Lampiran A** memetakan setiap kebutuhan ke berkas kode, uji, dan bukti pengukuran.

> Aturan main: **tidak ada kebutuhan yang dianggap selesai tanpa bukti angka** yang dapat diulang
> oleh pihak lain (pengembang lain, hermes agent, atau Anda sendiri).

---

## 1. Tujuan & hasil yang diharapkan

**Tujuan:** menjadikan SAPA AI bukan sekadar "chatbot data", melainkan **layanan tanya-jawab
statistik daerah yang dapat dipercaya, hemat, dan tahan gangguan** — dengan AI sebagai lapis
penyaji yang tidak pernah mengorbankan kebenaran angka.

Lima hasil yang ingin dicapai (semuanya harus terukur):

| # | Hasil | Ukuran |
|---|---|---|
| H1 | **AI unggul, bukan sekadar hadir** — saat AI aktif, jawaban harus lebih kaya bukti daripada jawaban template | sitasi AI ≥ sitasi deterministik; saat ini **4,50 vs 3,00** ✅ |
| H2 | **Tidak pernah menyesatkan** — tidak ada jawaban dari data yang bukan ditanyakan, termasuk saat data memang tidak ada | evaluasi 90 item: `menyesatkan = 0`, invarians 0 ✅ |
| H3 | **Hemat & tahan gangguan** — AI mati/langganan habis jangan membuat pengguna menunggu | pertanyaan ber-bukti: **11,4 dtk → 0,56 dtk** saat penyedia mati ✅ |
| H4 | **Jujur kepada operator** — panel status melaporkan kenyataan, bukan niat konfigurasi | `reachable`, `health.sebab`, `reason` terisi saat gagal ✅ |
| H5 | **Bisa dikembangkan tanpa merusak** — setiap perubahan diukur pada set evaluasi tetap | bar 90 item sebagai gerbang ✅ |

**Yang belum tercapai dan menjadi pekerjaan Fase B–D:** pemahaman parafrase awam skala luas
(lapis semantik), jawaban per-klaim bersitasi, perluasan cakupan data (per desa), dasbor celah
pengetahuan, dan umpan balik pengguna.

---

## 2. Baseline terukur (titik berangkat)

**Sudah terverifikasi pada cabang `b64231d`** (penyedia model tiruan; jalur aplikasi nyata):

| Ukuran | Nilai | Bukti |
|---|---|---|
| Evaluasi 90 item — mode AI | **90/90 (100%)** | `verifikasi/eval90-ai-run2.txt` |
| Evaluasi 90 item — mode deterministik | **90/90 (100%)** | `verifikasi/eval90-det.txt` |
| `grounded pass` saat model dipanggil | **61/61 (100%)** | idem |
| Fallback (jawaban AI dibuang) | **0%** | idem |
| Invarians (halu/token/jargon/sumber/NIK) | **0 pelanggaran** | idem |
| Sitasi AI vs deterministik (A/B 10 pertanyaan) | **4,50 vs 3,00** | `verifikasi/banding-G.txt` |
| Latensi pertanyaan ber-bukti (penyedia mati) | **0,14–0,56 dtk** (dari 11,4 dtk) | `verifikasi/aman-cabang-perilaku.txt` |
| Uji unit | 20 berkas / **237 uji** | `npm test` |
| Kontrak API `/api/query` | **identik** (14 kunci, tanpa penghapusan) | `09` §3 |
| Baseline regresi | `data/eval-baseline.json` **90/90, setVersi 2** | `verifikasi/eval90-baseline.txt` |

**Sudah diterapkan (✅)** — niat jawaban (tren/perbandingan/peringkat/komposisi/distribusi/katalog/
sebab/personal/nilai-saat-ini), gerbang nilai-tambah, penyisipan peringatan baku, gerbang niat-meta,
normalisasi singkatan, penutupan lima sebab positif-palsu grounding, aturan entitas, kejujuran
granularitas per desa, preferensi satuan fisik, penolakan permintaan aturan internal tanpa gema,
sirkuit penyedia (auth/throttle/server/jaringan/timeout), status jujur, fail-closed revalidate,
token angka murni dibuang dari kueri, serialisasi evidence markdown-KV.

**Belum ada (⬜)** — lapis semantik berbahasa Indonesia, pengunci cache semantik, jawaban
per-klaim bersitasi, dasbor celah pengetahuan, umpan balik pengguna, log `gen_ai.*`, jawaban
kausal bersitasi, data per desa, penjadwal penyegaran cache, dan pengujian dengan model sungguhan.

---

## 3. Invariants — pagar yang tidak boleh dilanggar

Setiap perubahan kode **wajib** mempertahankan tujuh hal berikut. Melanggar satu = perubahan ditolak,
seberapa pun bagusnya fitur baru.

| Kode | Invariant | Mengapa |
|---|---|---|
| **INV-01** | **Model tidak pernah menulis angka.** Angka masuk melalui token `{{id}}` yang diisi kode dari bukti SAPA, lalu diperiksa pagar grounding | inilah yang membuat aplikasi ini tidak berhalusinasi angka — terukur 0 pelanggaran pada 90 item |
| **INV-02** | **Visualisasi milik aplikasi**, bukan model (`buildVizFromEvidence`). Model hanya memberi `visualHint` | memindai grafik sebagai klaim prosa pernah membuang 26% jawaban model yang benar |
| **INV-03** | **Peringatan sistem tidak boleh hilang** karena diringkas model; boleh diparafrase, boleh disisipkan — tidak boleh dihapus | "tidak ada data untuk tahun 2025" yang hilang = jawaban menyesatkan |
| **INV-04** | **AI hanya disajikan bila menambah nilai** (catatan wajib utuh + sitasi ≥ kepala jawaban deterministik); bila tidak, sajikan jawaban deterministik **lengkap** | jawaban mode AI tidak boleh lebih miskin daripada mode template |
| **INV-05** | **Data perorangan tidak pernah dilayani** (NIK, alamat, data individu) — permintaan seperti itu ditolak dengan penjelasan, bukan dijawab sebagian | UU 27/2022 (PDP) |
| **INV-06** | **Aturan internal tidak ditampilkan dan tidak digemakan** — permintaan atas instruksi sistem dijawab kalimat tetap yang bersih | muatan injeksi tidak boleh dipantulkan kembali ke jawaban |
| **INV-07** | **Kejujuran granularitas**: bila data tidak ada pada tingkat yang diminta (mis. per desa), jawab jujur-kosong — jangan sajikan data tingkat lain seolah menjawab | "kader KB" bukan "jumlah keluarga" |

---

## 4. Kebutuhan fungsional

Format: **Kode · Kebutuhan · Alasan/bukti · Kriteria terima (terukur) · Usaha · Status**

### Kelompok A — Memahami pertanyaan

| Kode | Kebutuhan | Alasan / bukti | Kriteria terima | Usaha | Status |
|---|---|---|---|---|---|
| **FR-01** | Mengenali **niat jawaban**: tren, perbandingan, peringkat, komposisi, distribusi, katalog, sebab, personal, nilai-saat-ini | Sebelumnya semua pertanyaan dijawab dengan satu bentuk yang sama, sehingga "tren X" dan "berapa X" tampil serupa | ≥ 9 niat dikenali; item `T*/C*/R*/P*/D*` lulus pada set 90 | M | ✅ |
| **FR-02** | **Normalisasi bahasa rakyat**: singkatan (`brp`, `jml`, `kec`) dan sinonim awam (`tengkes` → stunting, `hasil/dihasilkan` → produksi) | Mengurangi keluhan "pertanyaan saya tidak dikenali" | item `F1–F4` lulus | S | ✅ |
| **FR-03** | **Kueri waktu relatif** ("tahun lalu", "3 tahun terakhir", "sejak 2022") diterjemahkan ke rentang tahun eksplisit | Tanpa ini, kata "tahun lalu" tidak memetakan ke data mana pun | item `W1`, `T1–T9` lulus | M | 🟡 (rentang tahun dasar ✅; "tahun lalu" belum dipetakan ke tahun konkret) |
| **FR-04** | **Niat katalog/meta** ("indikator apa saja…", "OPD mana…") dijawab dari metadata katalog, bukan dari nilai data | Pertanyaan metadata dijawab dengan nilai → tidak nyambung | item `M1–M3`, `R4` lulus | S | ✅ |
| **FR-05** | **Pertanyaan kausal** dijawab dengan **bukti terdekat + batas kesimpulan**, tanpa mengarang sebab-akibat | Data SAPA tidak memuat variabel sebab-akibat | item `K1–K4`, `N4` lulus sebagai jujur/pagu | M | 🟡 (pagu ✅; bentuk jawaban kausal bersitasi ⬜) |

### Kelompok B — Retrieval & bukti

| Kode | Kebutuhan | Alasan / bukti | Kriteria terima | Usaha | Status |
|---|---|---|---|---|---|
| **FR-06** | **Bobot kelangkaan kata (IDF)** + ambang kecocokan minimum yang menyesuaikan panjang kueri | "penduduk miskin" harus menang atas "Jumlah Data Penduduk" | uji retrieval lulus | S | ✅ |
| **FR-07** | **Aturan entitas**: akronim/nama diri (`IPM`, `PPKS`, `Bebesen`) **mengangkat** bukti yang memuatnya dan diutamakan di urutan atas | "Bandingkan IPM dengan target nasional" semula dijawab "target INM" = menyesatkan | item `C9` lulus; 0 regresi | M | ✅ |
| **FR-08** | **Preferensi satuan fisik** (ton, kg, kuintal, liter, km, hektar) bila pengguna menyebutnya | "Berapa ton kopi…" semula dijawab jumlah **petani** (satuan KK) | item `F4` lulus | S | ✅ |
| **FR-09** | **Kolom satuan diakui sebagai bagian korpus** sehingga kata satuan tidak dianggap konsep asing | akar sebenarnya kegagalan `F4`: "ton" dianggap asing → penjaga kejujuran memilih bukti salah | uji + item `F4` lulus | S | ✅ |
| **FR-10** | **Penjaga kejujuran**: konsep yang tidak pernah ada di katalog tidak boleh dijawab dengan data mirip | mencegah jawaban menyesatkan | item `kosong`/`jujur` lulus | M | ✅ |
| **FR-11** | **Kejujuran granularitas per desa/kecamatan** (INV-07) | SAPA berhenti di tingkat kecamatan | item `D5` lulus | S | ✅ |
| **FR-12** | **Lapis semantik berbahasa Indonesia** (embedding prakomputasi + fusi RRF dengan leksikal) | Uji parafrase bebas (bukan sinonim yang sudah dipetakan) masih bergantung pada kecocokan kata | recall@15 pada 20 kueri parafrase baru ≥ 90%; latensi muat dingin < 300 ms; artefak ber-hash ± 3 MB | L | ✅ 22 Sep 2026 |
| **FR-13** | **Indeksasi berkonteks** (judul · OPD · satuan · tahun) agar kata OPD tahun tidak "mengotori" skor | Menaikkan presisi pada kueri panjang | 4 item uji tambahan lulus | S | ⬜ |
| **FR-14** | **Fusi hasil ganda (RRF k=60)** antara daftar leksikal dan semantik | Standar industri; recall naik tanpa menurunkan presisi | recall@10 ≥ 90% pada kueri sulit | M | ⬜ |

### Kelompok C — Penyusunan jawaban

| Kode | Kebutuhan | Alasan / bukti | Kriteria terima | Usaha | Status |
|---|---|---|---|---|---|
| **FR-15** | **Narasi AI selalu bersitasi bukti** (mengutip nilai + OPD + tahun) dan tidak lebih miskin daripada template | keluhan awal: AI aktif justru lebih miskin | sitasi AI ≥ sitasi deterministik (kini 4,50 vs 3,00) | M | ✅ |
| **FR-16** | **Peringatan sistem disisipkan** bila model memarafrasekannya | frasa baku "tidak ada data" hilang saat diparafrase | item `L7`, `T10` lulus; `nilaiTambah='dipakai-dengan-catatan'` tampil | S | ✅ |
| **FR-17** | **Gerbang nilai-tambah** (INV-04) dengan catatan sebab (`meta.reason`) | transparansi: operator tahu mengapa AI tidak dipakai | 0 fallback pada set 90 | M | ✅ |
| **FR-18** | **Bentuk jawaban per niat** (tabel tren, peringkat 5 besar, komposisi, dst.) | Satu bentuk untuk semua niat = pengalaman buruk | ≥ 3 item per niat lulus | M | 🟡 (niat dikenali & masuk prompt ✅; template khusus per niat ⬜) |
| **FR-19** | **Jawaban per-klaim bersitasi** (setiap kalimat klaim menunjuk baris bukti) | Standar RAGAS/faithfulness; memudahkan verifikasi pembaca | 0 klaim tanpa rujukan pada 50 keluaran sampel | S–M | ✅ (`sitasi-per-klaim.ts`; penanda `[n]` pada narasi + `narasiBersitasi`/`sitasi` pada API; **42/42 klaim bersitasi, 0 penunjukan salah** pada 50 sampel di dua mode; `scripts/uji-sitasi.mjs`; laporan `14-LAPORAN-FR-19.md`) |
| **FR-20** | **Klasifikasi sebab kegagalan** (retrieval vs generasi) per item evaluasi | supaya perbaikan tepat sasaran | setiap item gagal punya tag sebab | M | ✅ (selesai 22 Sep 2026; tag `lapis:rincian`, laporan: dokumen `16`) |

### Kelompok D — Keamanan, privasi, penyalahgunaan

| Kode | Kebutuhan | Alasan / bukti | Kriteria terima | Usaha | Status |
|---|---|---|---|---|---|
| **FR-21** | **Tolak permintaan data perorangan** (NIK/alamat/nama individu) dengan penjelasan, tanpa menjawab sebagian | UU PDP; sudah ada | item `S2`, `X1–X3` lulus | S | ✅ |
| **FR-22** | **Tolak permintaan atas aturan internal tanpa menggemakan muatan** (INV-06) | item `S1` (angka 999999) & `S3` (jargon "system prompt") semula gagal | item `S1`, `S3` lulus; narasi tidak memuat muatan pengguna | S | ✅ |
| **FR-23** | **Pembersihan masukan katalog** (panjang, karakter kendali) sebelum masuk prompt — mencegah injeksi tak-langsung dari data | OWASP LLM01 | uji unit baru lulus | S | ✅ |
| **FR-24** | **Pemeriksa pasangan entitas** (nilai ↔ indikator ↔ OPD ↔ wilayah) untuk melawan *deceptive grounding* | mencegah nilai benar dipasangkan ke indikator salah | 0 kesalahan pasangan pada 50 keluaran sampel → **terukur 0 pada model jujur & model penukar entitas** | M | ✅ (selesai 23 Sep 2026; laporan: dokumen `17`) |

### Kelompok E — Penyajian & pengalaman

| Kode | Kebutuhan | Alasan / bukti | Kriteria terima | Usaha | Status |
|---|---|---|---|---|---|
| **FR-25** | **Tahun data, tanggal pengambilan SPLP, & sidik isi korpus** tampil pada setiap jawaban | kesegaran data adalah pertanyaan pertama pejabat | 100% jawaban menampilkan ketiganya | S | ✅ (`dataFetchedAt`+`dataFingerprint`+`dataYears` pada jalur JSON & streaming; gerbang otomatis di `uji-terima.sh` §3; bukti `verifikasi/uji-terima-hasil.txt`) |
| **FR-26** | **Notis transparansi AI + kanal koreksi** ("lapor angka") | kepercayaan publik; wajib untuk layanan berbasis AI | teks tampil; umpan balik tercatat di penyimpanan | S | ✅ (notis 3 keadaan jujur + kanal `POST /api/umpan-balik` berkuota + tinjauan `/admin/umpan-balik`; 6 gerbang otomatis di `uji-terima.sh` §5; laporan `13-LAPORAN-FR-26.md`) |
| **FR-27** | **Dasbor celah pengetahuan** (pertanyaan tanpa bukti & penolakan AI per minggu) | dari keluhan menjadi backlog sinonim & item evaluasi | 20 pertanyaan teratas tersedia tiap minggu | M | ✅ (`/api/admin/celah` + halaman `/admin/celah-pengetahuan`; 100 teratas, 8 minggu terakhir; digit/surel/tautan/nomor telepon dibuang sebelum disimpan — gerbang otomatis + pagar privasi di `uji-terima.sh` §4) |

---

## 5. Kebutuhan non-fungsional

| Kode | Kebutuhan | Ambang | Status |
|---|---|---|---|
| **NFR-01** | Latensi pertanyaan ber-bukti saat **penyedia AI sehat** | p95 < 8 dtk | 🟡 (belum diukur dengan model asli) |
| **NFR-02** | Latensi saat **penyedia AI mati/gagal** | ≤ 1 dtk (fail-fast) | ✅ (0,14–0,56 dtk) |
| **NFR-03** | **Ketersediaan jawaban**: AI mati ⇒ layanan tetap menjawab | 100% pertanyaan terjawab template | ✅ |
| **NFR-04** | **Biaya**: panggilan model hanya bila ada bukti; ada batas harian | 0 panggilan tanpa bukti; batas `AI_DAILY_CALL_LIMIT` aktif | ✅ |
| **NFR-05** | **Kejujuran status**: panel melaporkan kenyataan panggilan | `reachable=false` + sebab terisi saat gagal | ✅ |
| **NFR-06** | **Keamanan endpoint operasional** | `/api/revalidate` menolak tanpa rahasia (fail-closed) | ✅ |
| **NFR-07** | **Telemetri terstruktur** per tahap (retrieval, prompt, model, grounding, gerbang) | p95 per tahap terlihat di log (`gen_ai.*`) | ⬜ |
| **NFR-08** | **Uji otomatis** sebagai gerbang perubahan | ≥ 230 uji lulus; typecheck & build bersih | ✅ (237 uji) |
| **NFR-09** | **Aksesibilitas** halaman utama | WCAG 2.2 AA: kontras, fokus, label ARIA, navigasi papan ketik | ⬜ |
| **NFR-10** | **Keterpulihan**: rollback produksi ≤ 5 menit | deployment sebelumnya dapat dipromosikan ulang; tanpa migrasi data | ✅ |

---

## 6. Kebutuhan data & sumber

| Kode | Kebutuhan | Alasan | Kriteria terima | Status |
|---|---|---|---|---|
| **DS-01** | Sumber tunggal resmi: `api-splp.layanan.go.id/sapa` (Perpres 39/2019 SDI) | akuntabilitas angka | semua jawaban menyebut `dataSource` | ✅ |
| **DS-02** | **Metadata tingkat data** (kecamatan/desa/individu) ikut dibaca, sehingga sistem tahu batas granularitasnya | mencegah jawaban menyesatkan tingkat salah | sistem menolak dengan alasan bila tingkat tidak tersedia | 🟡 (per desa ✅; peta tingkat lengkap ⬜) |
| **DS-03** | **Kesegaran**: stempel waktu pengambilan + tag versi korpus pada setiap jawaban & cache | angka lama tanpa penanda = risiko kebijakan | stempel tampil di API & UI | ⬜ |
| **DS-04** | **Permintaan data tingkat desa ke OPD** (mis. jumlah keluarga per desa) | 3 item evaluasi jujur-kosong karena data ini memang tidak ada | ≥ 1 OPD menyediakan data tingkat desa | ⬜ |
| **DS-05** | **Kamus sinonim daerah** (Aceh: gampong, meugang, mustahik, PPKBD…) yang dipelihara | pengguna memakai istilah daerah | ≥ 50 entri; tiap 3 bulan ditinjau | 🟡 (sebagian ✅) |

---

## 7. Kebutuhan evaluasi & mutu

| Kode | Kebutuhan | Ambang/kriteria | Status |
|---|---|---|---|
| **EV-01** | Set evaluasi **90 item** mencakup 12 kelompok: metadata, level, tren, perbandingan, persentase, distribusi, peringkat, kausal, parafrase, waktu relatif, keamanan, anomalı | 90/90 lulus di kedua mode | ✅ |
| **EV-02** | **Baseline terkunci** (`data/eval-baseline.json`, setVersi 2) — setiap perubahan dibandingkan per item | 0 regresi diterima; regresi = build ditolak | ✅ |
| **EV-03** | **Uji A/B AI vs deterministik** (10 pertanyaan multi-niat) untuk memastikan AI benar-benar menambah | sitasi AI > sitasi deterministik | ✅ (4,50 vs 3,00) |
| **EV-04** | **Gerbang mutu AI**: grounded pass ≥ 90%, fallback ≤ 10%, grounded fail = 0 | tercapai 100% / 0% / 0 | ✅ |
| **EV-05** | Perluasan ke **120 item** dengan 12 item baru per niat + panel penilai manusia 30 sampel | ≥ 3 item baru per niat lulus; skor relevansi penilai ≥ 4/5 | ⬜ |
| **EV-06** | **Uji dengan model sungguhan** (bukan penyedia tiruan), hasil dibandingkan dengan baseline | set 90 lulus dengan `AI_BASE_URL` produksi | ⬜ |

---

## 8. Operasi & rilis

| Kode | Kebutuhan | Kriteria terima | Status |
|---|---|---|---|
| **OPS-01** | **Saklar AI/Deterministik** + status jujur untuk operator | saklar bekerja; status memuat sebab | ✅ |
| **OPS-02** | **Sirkuit penyedia** untuk auth/throttle/server/jaringan/timeout | gagal cepat; pulih otomatis satu percobaan setelah cooldown | ✅ |
| **OPS-03** | **Penyegaran cache terjadwal** (mis. harian) dengan rahasia | cache segar harian; endpoint tetap fail-closed | ⬜ |
| **OPS-04** | **Log & peringatan**: bila sirkuit terbuka > 15 menit, kirim notifikasi (Surel/Telegram) | operator diberi tahu tanpa membuka panel | ✅ (23 Sep 2026 — dok 19: peringatan segera + eskalasi 15 mnt, Telegram/webhook, penjadwal luar, 13 butir uji ujung-ke-ujung) |
| **OPS-05** | **Catatan rilis** per gelombang (isi, bukti, cara mundur) | setiap rilis punya catatan + tag git | 🟡 (pesan komit ✅; tag belum) |
| **OPS-06** | **Uji terima otomatis** sebelum rilis (`uji-terima.sh`) | LULUS sebelum promosi produksi | ✅ |

---

## 9. Kepatuhan & tata kelola

| Kode | Kebutuhan | Rujukan | Status |
|---|---|---|---|
| **CMP-01** | Perlindungan data pribadi: tidak menyajikan data perorangan; tidak menyimpan NIK pada log | UU 27/2022 | ✅ |
| **CMP-02** | Keterbukaan penggunaan AI pada layanan publik | SE Menkominfo 9/2023 | ⬜ (teks notis belum ada) |
| **CMP-03** | Tata kelola risiko AI: daftar risiko, pemilik, tindak lanjut | ISO/IEC 42001 · NIST AI RMF | 🟡 (dokumen `10 §13` ✅; pemilik risiko ⬜) |
| **CMP-04** | Jejak audit jawaban (pertanyaan, bukti, gerbang, sebab) tanpa data pribadi | kebutuhan internal & pemeriksaan | 🟡 (metadata AI ✅; retensi & ekspor ⬜) |

---

## 10. Arsitektur target & letak tiap kebutuhan

```
                    ┌───────────────── PAGAR MASUK (FR-21, FR-22, FR-23) ─────────────────┐
Pertanyaan ──► [1] Penjaga permintaan sistem/data perorangan ──► ditolak dengan kalimat tetap
                    └──────────────────────────┬─────────────────────────────────────────┘
                                               ▼
   [2] Tokenisasi + normalisasi + sinonim (FR-02)  ·  niat jawaban (FR-01)
                                               ▼
   [3] RETRIEVAL LEKSIKAL (FR-06, FR-07, FR-08, FR-09, FR-10, FR-11)
        │  ── Fase B: + lapis SEMANTIK & fusi RRF (FR-12, FR-13, FR-14)
        ▼
   [4] BUKTI (evidence)  ── kosong? ──► jawaban jujur + penjelasan sebab (FR-10) ──► SELESAI
        ▼                                             (model TIDAK dipanggil — NFR-04)
   [5] JAWABAN DETERMINISTIK (template) + peringatan sistem (INV-03)
        ▼
   [6] PROMPT AI (markdown-KV ≤15 baris + acuan draf + catatan wajib)  ──► [7] MODEL
        │                                              (sirkuit & fail-fast: OPS-02, NFR-02)
        ▼
   [8] TOKEN {{id}} diisi kode (INV-01)  →  GROUNDING (angka/tahun/label)
        ▼
   [9] GERBANG NILAI-TAMBAH (INV-04): catatan wajib utuh? sitasi ≥ template?
        │        tidak ──► sajikan jawaban deterministik LENGKAP (NFR-03)
        ▼ ya
   [10] PENYAJIAN: narasi + sitasi + visualisasi aplikasi (INV-02) + tahun data (FR-25)
        ▼
   [11] TELEMETRI & CELAH PENGETAHUAN (NFR-07, FR-27)  ·  UMPAN BALIK (FR-26)
```

**Di mana kebutuhan Fase B–D duduk:** FR-12/13/14 di [3]; FR-19 di [8]–[10]; FR-15 lanjutan &
FR-18 di [5]/[10]; FR-25/26 di [10]/[11]; NFR-07 & FR-27 di [11].

---

## 11. Peta fase & prioritas

| Fase | Isi | Kriteria terima | Perkiraan |
|---|---|---|---|
| **A — Selesai (✅ gelombang 1–3)** | Sirkuit penyedia · status jujur · revalidate fail-closed · gerbang niat-meta · niat jawaban · gerbang nilai-tambah · lima sebab positif-palsu grounding · aturan entitas · kejujuran granularitas · preferensi satuan · penolakan injeksi · set evaluasi 90 · uji terima otomatis | 90/90 dua mode · 237 uji · kit serah terima | — |
| **B — Cocok-makna & parafrase** | ~~FR-12 lapis semantik Indonesia + fusi RRF~~ (selesai 22 Sep 2026; penyedia `hash`, penyedia `remote` kelas e5 siap dipakai) · FR-13 indeksasi berkonteks · FR-14 fusi RRF lanjutan · EV-05 120 item · EV-06 uji model sungguhan | recall@15 **20/20** pada 20 kueri parafrase baru (ambang 90 %); luar-katalog 5/5 ditolak; latensi muat dingin **75 ms** (ambang 300 ms); artefak ± 0 MB (in-memory, tanpa berkas) | sisa 2–4 minggu |
| **C — Mutu tertutup** | ~~FR-19 jawaban per-klaim~~ · ~~FR-20 klasifikasi sebab~~ · ~~FR-24 pemeriksa pasangan entitas~~ · ~~FR-23 pembersihan masukan~~ · ~~OPS-04 notifikasi sirkuit~~ (selesai 22–23 Sep 2026) · NFR-07 telemetri `gen_ai.*` | 0 klaim tanpa rujukan pada 50 sampel ✅; tiap kegagalan bertag sebab ✅; 0 kesalahan pasangan pada 50 sampel ✅; 0 penanda kepatuhan pada model yang menuruti perintah data ✅ (kontrol negatif ikut gagal) | sisa 1–2 minggu |
| **D — Tata kelola & pengalaman** | ~~FR-25 · FR-26 · FR-27~~ (selesai 22 Sep 2026) · NFR-09 aksesibilitas · OPS-03 penyegaran terjadwal · CMP-02/03/04 | notis tampil; ≥ 50 umpan balik/bulan; WCAG 2.2 AA | 3–4 minggu |

**Urutan yang disarankan bila sumber daya terbatas:** ~~FR-25 → FR-27 → FR-26 → FR-19 → FR-12 → FR-20 → FR-24 → FR-23~~
(selesai 22–23 Sep 2026; OPS-04 ikut selesai 23 Sep 2026) → **NFR-07 telemetri `gen_ai.*`** → **Fase D** (OPS-03 penyegaran terjadwal, NFR-09 aksesibilitas, CMP-02/03/04).
Alasannya: FR-19 menaikkan kepercayaan paling tinggi per satuan usaha; FR-12 (lapis semantik) sudah
selesai dan menutup celah parafrase; FR-20 murah dan membuat **setiap** kegagalan yang tersisa
terjelaskan dengan satu tag sebab — termasuk kegagalan yang baru muncul dari lapis semantik.

---

## 12. Rencana pengujian (workspace ini **atau** repo lokal)

**Cara 1 — uji cepat (tanpa eval):**

```bash
bash verifikasi/uji-terima.sh                    # typecheck + uji unit + pemeriksaan pagar
```

**Cara 2 — uji penuh di repo lokal dengan penyedia tiruan (tanpa biaya, tanpa langganan):**

```bash
node verifikasi/mock-llm.mjs 8899 &
AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=http://127.0.0.1:8899/v1 \
  AI_API_KEY=mock-uji AI_MODEL=mock-pintar npx next start -p 3116 &
AI_ENABLED=false npx next start -p 3117 &
AI_URL=http://127.0.0.1:3116 DET_URL=http://127.0.0.1:3117 bash verifikasi/uji-terima.sh
```

**Cara 3 — uji dengan model sungguhan (setelah langganan aktif):**

```bash
AI_BASE_URL=<penyedia asli> AI_API_KEY=<kunci> AI_MODEL=<model> npx next start -p 3116 &
SAPA_EVAL_URL=http://127.0.0.1:3116 node scripts/eval-run.mjs     # bandingkan dengan baseline 90/90
python3 verifikasi/banding-ai-vs-det.py verifikasi/uji-pertanyaan.txt   # A/B AI vs deterministik
```

**Ambang penerimaan (dipakai skrip):** eval ≥ 90/90 · invarians 0 · grounded pass ≥ 90% ·
fallback ≤ 10% · uji unit ≥ 230 · revalidate menolak tanpa rahasia.

---

## 13. Risiko & asumsi

| Risiko | Kemungkinan | Dampak | Penanganan |
|---|---|---|---|
| Mutu bahasa model sungguhan berbeda dari penyedia tiruan | Sedang | Mutu jawaban | Gerbang nilai-tambah otomatis menolak jawaban AI yang lebih miskin — kebenaran tetap terjaga; ulangi EV-06 lalu setel prompt |
| Biaya token naik (prompt memuat acuan draf) | Sedang | Kuota harian | Batas harian aktif; evidence kosong tanpa panggilan; pengunci cache prompt di Fase B |
| Data tingkat desa tidak kunjung tersedia dari OPD | Tinggi | Sebagian pertanyaan tetap jujur-kosong | Ini **perilaku yang benar** (INV-07); komunikasikan sebagai keterbatasan data, bukan kegagalan sistem |
| Perubahan aturan SPLP / pemadaman API | Rendah | Layanan dashboard | Cache 10 menit + fallback tampilan terakhir (`/api/status` jujur) |
| Perubahan kode oleh agen lain (hermes) bertabrakan | Sedang | Konflik penggabungan | Seri patch + pagar invariants + uji terima otomatis (`11 §5`) |

**Asumsi:** Node 20 (EOL 30 Apr 2026 — jadwalkan naik versi); Vercel Hobby (retensi log 1 jam,
cron terbatas); Upstash gratis 500 ribu perintah/bulan; model dipanggil dari luar (tidak ada
penyimpanan kunci di klien).

---

## 14. Definition of Done & daftar centang serah terima

Sebuah pekerjaan dianggap **selesai** hanya bila **semuanya** terpenuhi:

1. Kode diterapkan **tanpa melanggar satu pun INV-01…INV-07**.
2. `npm run typecheck` bersih · **seluruh uji unit lulus** · `next build` bersih.
3. `bash verifikasi/uji-terima.sh` **LULUS** (semua ambang, dua mode).
4. Evaluasi **90/90** di mode AI **dan** deterministik, **0 regresi** terhadap baseline.
5. A/B AI vs deterministik menunjukkan AI **tidak lebih miskin** (sitasi ≥ template).
6. Ada **bukti angka tersimpan** di `verifikasi/` + pesan komit memuat alasan & hasil.
7. Dokumentasi diperbarui (dokumen ini bila menyentuh kebutuhan; `04`/`05` bila menyentuh desain/peta jalan).
8. Perubahan **tidak menyentuh `main`** sampai pemilik memutuskan penggabungan.
9. Ada **cara mundur** yang teruji (revert komit / promosi ulang deployment).

**Daftar centang serah terima ke repo lokal/agen Anda** ada di `11-KIT-SERAH-TERIMA.md` §6.

---

## Lampiran A — Pemetaan kebutuhan → berkas → uji → bukti

| Kebutuhan | Berkas utama | Uji | Bukti pengukuran |
|---|---|---|---|
| FR-01 niat jawaban | `src/lib/intent-meta.ts`, `src/services/answer-compose.ts` | `intent-meta.test.ts` (16) | eval `T*/C*/R*/P*` |
| FR-02 normalisasi & sinonim | `src/lib/sapa-client.ts` | `retrieval.test.ts` | eval `F1–F4` |
| FR-04 niat katalog | `src/services/answer-compose.ts` | `intent-meta.test.ts` | eval `M1–M3` |
| FR-06 bobot IDF | `src/lib/sapa-client.ts` | `retrieval.test.ts` | — |
| FR-07 aturan entitas | `src/lib/sapa-client.ts` | `retrieval.test.ts` (3) | eval `C9` |
| FR-08/09 preferensi satuan + satuan masuk korpus | `src/lib/sapa-client.ts` | `retrieval.test.ts` (3) | eval `F4` |
| FR-10 penjaga kejujuran | `src/lib/sapa-client.ts` | `retrieval.test.ts` | eval `kosong/jujur` |
| FR-11 granularitas per desa | `src/lib/sapa-client.ts` | `retrieval.test.ts` (2) | eval `D5` |
| FR-15/17 gerbang nilai-tambah | `src/services/answer-compose.ts` | `answer-compose.test.ts` (20) | `banding-G.txt` (4,50 vs 3,00) |
| FR-16 penyisipan peringatan | `src/services/grounding.ts` (`catatanTerjaga`) | `grounding.test.ts` (34) | eval `L7`, `T10` |
| FR-21/22 penolakan aman | `src/services/deterministic-answer.ts` | `answer-compose.test.ts` (3) | eval `S1–S3` |
| INV-01 grounding | `src/services/grounding.ts` | `grounding.test.ts` | invarians 0 pada 90 item |
| NFR-02/05/OPS-02 sirkuit & status | `src/lib/ai/provider-health.ts`, `src/lib/ai/llm-client.ts`, `src/app/api/status/route.ts` | `provider-health.test.ts` (13), `llm-client.test.ts` | 11,4 dtk → 0,14 dtk |
| NFR-06 revalidate | `src/lib/revalidate-guard.ts`, `src/app/api/revalidate/route.ts` | `revalidate-guard.test.ts` (5) | `aman-cabang-perilaku.txt` |
| EV-01…EV-04 evaluasi | `data/eval-set.json` (90), `scripts/eval-run.mjs`, `data/eval-baseline.json` | — | `eval90-*.txt`, `uji-terima-hasil.txt` |

## Lampiran B — Berkas bukti (semua dapat diperiksa)

| Berkas | Isi |
|---|---|
| `verifikasi/eval90-ai-run2.txt` | eval 90 item mode AI: 90/90, grounded 100%, fallback 0% |
| `verifikasi/eval90-det.txt` | eval 90 item mode deterministik: 90/90 |
| `verifikasi/eval90-baseline.txt` | penulisan baseline baru (90/90, setVersi 2) |
| `verifikasi/uji-terima-hasil.txt` | keluaran uji terima otomatis dua mode |
| `verifikasi/banding-G.txt` | A/B AI vs deterministik: 4,50 vs 3,00 sitasi |
| `verifikasi/aman-cabang-perilaku.txt` | produksi vs cabang: 13/16 identik, 11,4 dtk → 0,56 dtk |
| `06-USULAN-KODE/seri-patch/` | seluruh berkas `NNNN-*.patch` (dijalankan urut angka) + satu paket `00-semua.patch` — teruji `git am` pada klon bersih `main`, hasil pohon identik dengan cabang |
| `verifikasi/stub-splp.mjs` | penyedia SPLP tiruan untuk uji luring (pasangan `SAPA_SPLP_BASE_URL`) |
| `12-LAPORAN-FR-25-FR-27.md` | laporan bukti penambahan cap kesegaran data & dasbor celah (289 uji, gerbang baru, seri patch teruji di klon bersih) |
| `13-LAPORAN-FR-26.md` | laporan bukti notis transparansi & kanal koreksi warga (317 uji, 14 gerbang uji terima) |
| `14-LAPORAN-FR-19.md` | laporan bukti sitasi per klaim (343 uji; 50 sampel × 2 mode: 42/42 bersitasi, 0 penunjukan salah) |
| `15-LAPORAN-FR-12.md` | laporan bukti lapis semantik Indonesia + fusi RRF (20/20 parafrase, 5/5 di luar katalog ditolak, muat dingin 75 ms) |
| `16-LAPORAN-FR-20.md` | laporan bukti klasifikasi sebab kegagalan (`lapis:rincian`), wiring rute & dasbor celah, harness penanda sebab |
| `17-LAPORAN-FR-24.md` | laporan bukti pemeriksa pasangan entitas (deceptive grounding), tiga penuduhan palsu yang diperbaiki, keputusan desain & batas |
| `scripts/uji-sitasi.mjs` | skrip uji 50 sampel sitasi (kriteria terima FR-19) + pemeriksaan independen tiap penanda |
| `06-USULAN-KODE/uji-terima.sh` | skrip uji terima (dipakai hermes agent/pengembang) |
