# 20 — Laporan NFR-07: Telemetri Terstruktur per Tahap (`gen_ai.*`)

**Tanggal:** 23 September 2026 · **Cabang:** `usulan/perbaikan-ai-2026-09-21` (tidak menyentuh `main`)
**Kriteria terima (dokumen 10):** *p95 per tahap terlihat di log (`gen_ai.*`)* — di laporan ini
dibuktikan dengan uji ujung-ke-ujung yang **menjalankan aplikasinya sendiri**, menghitung ulang
p50/p95 dari log, lalu membandingkannya dengan angka yang dilaporkan API.

---

## 1. Masalah yang diselesaikan

Sebelum ini, sistem hanya tahu **satu angka**: `latencyMs` total. Saat jawaban terasa lambat,
satu-satunya cara tahu penyebabnya adalah menambah `console.time` secara manual — dan begitu
masalahnya selesai, pengukuran itu dihapus, lalu kejadian berikutnya dimulai dari nol lagi.

Akibatnya nyata dan berulang:

| Pertanyaan operator | Jawaban sebelum NFR-07 |
|---|---|
| "Lambatnya di mana?" | tidak diketahui — hanya total |
| "Modelnya yang lambat atau retrieval-nya?" | tebakan |
| "Sejak kapan lambat?" | tidak ada data (log platform hanya 1 jam di paket Hobby) |
| "Apakah gerbang grounding memakan waktu?" | tidak pernah diukur |
| "Berapa token yang dibakar jalur streaming?" | tidak tercatat sama sekali |

Tanpa pemecahan per tahap, optimasi menjadi undian: tim bisa menghabiskan hari mempercepat prompt
(padahal 4 ms) sementara retrieval memakan 116 ms.

---

## 2. Apa yang dikerjakan

### 2.1 Dua lapis yang sengaja dipisah

| Lapis | Isi | Menjawab pertanyaan |
|---|---|---|
| **Baris per permintaan** — `[gen_ai] {json}` | durasi tiap tahap + medan semconv `gen_ai.*` | "permintaan INI lambat di mana?" |
| **Agregat bergulir** — jendela N sampel per tahap di penyimpanan bersama | p50/p95/maks/rata + jumlah | "SEKARANG pola-nya bagaimana?", "sejak kapan?" |

Lapisy kedua penting karena alasan yang sangat praktis: **log platform kedaluwarsa** (Vercel Hobby
menyimpan log hanya 1 jam — terukur pada audit ini). Tanpa agregat, telemetri hanya berguna selama
seseorang menonton log. Agregat juga **muncul di log** sebagai baris `[gen_ai-rekap]` setiap 20
permintaan (dapat diatur), sehingga kriteria "p95 terlihat di log" terpenuhi tanpa membuka dasbor.

### 2.2 Tujuh tahap (lima wajib + dua tambahan berguna)

| Tahap | Isi | Dipasang di |
|---|---|---|
| `pengambilan_data` | ambil katalog dari SPLP | route `/api/query` & `/api/query/stream` |
| `indeks_semantik` | panaskan indeks FR-12 | route (sebelum jawaban disusun) |
| **`retrieval`** | skor leksikal + semantik → jawaban dasar | `answer-compose` |
| **`prompt`** | bangun + bersihkan prompt (FR-23) | `answer-compose` |
| **`model`** | panggilan penyedia model | `llm-client` (JSON **dan** SSE) |
| **`grounding`** | `isGrounded` + pemeriksaan nilai | `answer-compose` |
| **`gerbang`** | nilai-tambah + gerbang FR-24 pasangan entitas | `answer-compose` (2 titik, dijumlahkan) |

Tambahan pada tahap: `prompt` mencatat **panjang** system/user + jumlah sel dibersihkan (`sel_dibersihkan`);
`model` mencatat token masuk/keluar, finish reason, dan **ttfb** (`ttfb_ms`, khusus streaming);
`gerbang` mencatat keputusan nilai-tambah dan jumlah temuan pasangan keras.

### 2.3 Konteks async, bukan pembawa parameter

Pengukuran memakai `AsyncLocalStorage` (Node `async_hooks`), bukan menambahkan parameter ke setiap
fungsi. Konsekuensinya penting untuk kebenaran:

* `llm-client` memanggil `catatModel(...)` **tanpa tahu** apakah ia sedang berada di dalam sebuah
  permintaan — di luar konteks ia diam (aman untuk uji unit dan untuk pemanggil lain);
* route membuka konteks untuk menangkap `pengambilan_data` + `indeks_semantik`, lalu `composeAnswer`
  **menumpang** konteks itu → **satu permintaan tetap satu baris log**, tidak pernah ganda;
* konteks tidak bocor antar-permintaan paralel (diuji khusus: dua permintaan dengan jeda buatan
  tidak saling mencampur tahap).

### 2.4 Nama medan: konvensi OTel, dengan sikap yang jujur

Keluaran memuat objek `gen_ai` dengan nama sesuai **OpenTelemetry GenAI semantic conventions**:

```
gen_ai.operation.name = "chat"          gen_ai.provider.name = "custom"
gen_ai.request.model                    gen_ai.response.finish_reasons = ["stop"]   (ARRAY)
gen_ai.usage.input_tokens               gen_ai.usage.output_tokens
error.type                              (hanya saat panggilan model gagal)
```

Tiga catatan yang dipegang sadar:

1. **Nama lama tidak dipakai.** `gen_ai.system` → `gen_ai.provider.name`;
   `prompt_tokens/completion_tokens` → `input_tokens/output_tokens`. Uji unit menolak keberadaan
   nama lama supaya dasbor tidak pernah membaca medan yang sudah usang.
2. **`finish_reasons` berupa array**, bukan string — sesuai konvensi (satu respons bisa punya lebih
   dari satu pilihan).
3. **Konvensi ini masih pra-stabil.** Pada 12 Juni 2026 (semantic-conventions v1.42.0) seluruh
   `gen_ai.*` dipindahkan ke repositori tersendiri dan **belum ada versi 1.0**; statusnya masih
   *Development*. Karena itu medan internal kita (`tahap.*`, `jalan`, `jumlah_tahap_ms`) berdiri
   sendiri, dan `gen_ai.*` **diturunkan** darinya di satu fungsi. Bila konvensi berganti nama,
   satu berkas ini yang disesuaikan — log lama tetap terbaca.

### 2.5 Tanpa isi pertanyaan (jadi telemetri tidak bisa jadi jalur PII baru)

Baris `[gen_ai]` hanya memuat **metadata**: id anonim (`q-<base36>-<acak>`), jumlah bukti, niat yang
terdeteksi, durasi, token, dan keputusan gerbang. Tidak ada pertanyaan, narasi, atau nilai data.
Ini disengaja dan sejalan dengan anjuran semconv ("content capture opt-in only"). Diuji dua arah:
kata canary yang disisipkan ke pertanyaan **tidak boleh muncul** di baris `[gen_ai]`, dan baris itu
tidak boleh memuat medan bernama `query`/`narasi`/`content`.

### 2.6 Saklar, endpoint, dan biaya

| Hal | Nilai |
|---|---|
| `SAPA_TELEMETRI` | `off` = matikan seluruh telemetri (untuk A/B dan lingkungan yang tidak ingin log tambahan) |
| `SAPA_TELEMETRI_JENDELA` | 200 (jumlah sampel ditahan per tahap) |
| `SAPA_TELEMETRI_REKAP_N` | 20 (tulis baris rekap tiap N permintaan; `0` = matikan rekap otomatis) |
| `SAPA_TELEMETRI_SIMPAN` | `off` = jangan simpan agregat (log saja) |
| `/api/status` → `telemetri` | ringkasan p50/p95 + jumlah (publik, tanpa PII) |
| `/api/admin/telemetri` | sampel mentah + `?rekap=1` (tulis rekap sekarang) + `?nolkan=1`; **fail-closed** |

Biaya penyimpanan jujur: satu permintaan = satu baca + satu tulis agregat (2 perintah Redis).
Dengan kuota gratis Upstash 500 ribu perintah/bulan, itu ≈ 250 ribu permintaan/bulan — jauh di atas
lalu lintas SAPA saat ini. Penulisan dilakukan **nirblokir** (tidak menahan jawaban); pembaca
(`/api/status`, endpoint admin) menunggu penulisan tertunda selesai, supaya angka yang dilaporkan
selalu sudah termasuk permintaan terakhir.

---

## 3. Berkas

| Berkas | Isi |
|---|---|
| `src/lib/ai/telemetri.ts` **(baru)** | konteks async, pengukuran tahap, penyusun baris `[gen_ai]`, turunan `gen_ai.*`, agregat bergulir + persentil |
| `src/lib/ai/__tests__/telemetri.test.ts` **(baru)** | 19 uji: isolasi konteks, tidak ada baris ganda, persentil, jendela, saklar off, medan semconv, agregat |
| `src/app/api/admin/telemetri/route.ts` **(baru)** | sampel mentah · `?rekap=1` · `?nolkan=1` · fail-closed |
| `scripts/uji-telemetri.mjs` **(baru)** | harness ujung-ke-ujung: menjalankan sendiri stub SPLP + penyedia tiruan + aplikasi (positif & kontrol negatif) |
| `src/lib/ai/llm-client.ts` | tahap `model` di kedua jalur (JSON & SSE) + **token jalur streaming** (temuan baru) |
| `src/services/answer-compose.ts` | tahap `retrieval`, `prompt`, `grounding`, `gerbang` + ringkasan hasil di corong keluaran |
| `src/app/api/query/route.ts`, `.../stream/route.ts` | konteks telemetri + tahap `pengambilan_data` & `indeks_semantik` |
| `src/app/api/status/route.ts` | bagian `telemetri` |
| `verifikasi/uji-terima.sh` + `docs/…/uji-terima.sh` | §6g baru (byte-identical) |
| `verifikasi/uji-telemetri.txt`, `…-bukti.json` | bukti: keluaran harness + seluruh baris `[gen_ai]`/`[gen_ai-rekap]` yang benar-benar ditulis |

---

## 4. Bukti terukur

### 4.1 Uji unit & statis

| Pemeriksaan | Hasil |
|---|---|
| `npx vitest run` | **34 berkas / 533 uji lulus** (naik dari 33/514 — 19 uji baru) |
| `npm run typecheck` | bersih |
| `npm run build` | sukses |
| lint berkas baru | 0 error, 0 warning (seluruh peringatan yang muncul dibersihkan) |
| gerbang PII | 0 kebocoran |

### 4.2 Uji terima otomatis (§6g)

```
── 6g. Telemetri per tahap (NFR-07) ──
  ✓ telemetri per tahap: 19 ✓ / 0 ✗
  ✓ p95 per tahap muncul di log — model p95 = 15 ms
```

Seluruh kit: **39 ✓ (naik dari 37)**, `exit 0`; §6e tetap 4/4 dan §6f tetap LULUS
(`verifikasi/uji-terima-hasil.txt`).

### 4.3 Harness 19 butir — semuanya bisa GAGAL

| # | Butir |
|---|---|
| 1 | Jalur AI menyala (`ai.state=active`) — kalau tidak, tahap yang diukur tidak pernah berjalan |
| 2 | Telemetri aktif terlaporkan |
| 3 | Semua 10 permintaan dijawab HTTP 200 |
| 4 | Tepat **10 baris `[gen_ai]`** untuk 10 permintaan (tidak hilang, tidak ganda) |
| 5 | Lima tahap wajib ada di **setiap** baris |
| 6 | Model benar-benar dipanggil 10/10 (uji tidak vakum) |
| 7 | Token masuk/keluar tercatat pada semua panggilan model yang berhasil |
| 8 | Panjang prompt > 0 di setiap baris (tahap `prompt` nyata, bukan 0 ms kosong) |
| 9 | `jumlah_tahap_ms ≤ total_ms` di setiap baris (tidak ada pengukuran ganda) |
| 10 | **p50/p95 dilaporkan = p50/p95 dihitung ulang dari log** (5 tahap, n = 10) |
| 11 | Sampel mentah di endpoint admin **sama persis** dengan durasi di log, berurutan |
| 12 | Baris `[gen_ai-rekap]` hasil `?rekap=1` **identik** dengan balasan API |
| 13 | ≥ 1 baris rekap **otomatis** muncul di log |
| 14 | Endpoint admin **fail-closed** tanpa token (HTTP 401) |
| 15 | Kata canary dari pertanyaan **tidak** muncul di baris `[gen_ai]` |
| 16 | Tidak ada medan isi (`query`/`narasi`/`content`) di baris `[gen_ai]` |
| 17 | Aplikasi negatif melaporkan telemetri **nonaktif** (saklar jujur) |
| 18 | Aplikasi negatif tetap menjawab normal (mematikan telemetri tidak merusak layanan) |
| 19 | **NOL baris** `[gen_ai]`/`[gen_ai-rekap]` saat `SAPA_TELEMETRI=off` |

Butir 19 adalah **kontrol negatif**: tanpa itu, "ada baris di log" tidak membuktikan apa pun —
bisa saja baris itu datang dari sumber lain.

### 4.4 Bentuk nyata satu baris log (dari `verifikasi/uji-telemetri-bukti.json`)

```json
[gen_ai] {
  "waktu":"2026-09-23T07:22:45.394Z","permintaan":"q-mudrzwkh-mxcas5","jalan":"query-json",
  "total_ms":113,"jumlah_tahap_ms":109,
  "tahap":{
    "pengambilan_data":{"ms":0,"dipanggil":1},
    "indeks_semantik":{"ms":0,"dipanggil":1},
    "retrieval":{"ms":102,"dipanggil":1,"jumlah_record":1210},
    "prompt":{"ms":1,"dipanggil":1,"panjang_system":2461,"panjang_user":3608,"sel_dibersihkan":0,"baris_ditandai":0},
    "model":{"ms":4,"dipanggil":1,"sukses":true,"model":"mock-pintar","penyedia":"custom",
             "token_masuk":902,"token_keluar":219,"finish_reason":"stop"},
    "grounding":{"ms":0,"dipanggil":1,"lolos":true,"temuan":0,"nilai_diperiksa":3},
    "gerbang":{"ms":2,"dipanggil":2,"nilai_tambah":"dipakai","catatan_wajib":0,"pasangan_ok":true,"pasangan_keras":0,"keluaran_diperiksa":5}
  },
  "hasil":{"mode":"ai","grounded":"pass","nilai_tambah":"dipakai","used":true,"cached":false,
           "jumlah_bukti":15,"jumlah_cocok":31,"niat":"nilai_saat_ini","fallback":false},
  "gen_ai":{"gen_ai.operation.name":"chat","gen_ai.provider.name":"custom",
            "gen_ai.request.model":"mock-pintar","gen_ai.response.finish_reasons":["stop"],
            "gen_ai.usage.input_tokens":902,"gen_ai.usage.output_tokens":219,
            "sapa.jalan":"query-json","sapa.mode":"ai"}
}
```

### 4.5 Baris rekap — p95 per tahap, di log

```json
[gen_ai-rekap] {"sebab":"otomatis-5","jendela":10,
 "jumlah":{"permintaan":10,"tahapLengkap":10,"modelDipanggil":10,"modelGagal":0,"tanpaBukti":0,"fallback":0},
 "tahap":{
   "pengambilan_data":{"n":10,"p50":0,"p95":1,"maks":1,"rata":0.2},
   "indeks_semantik":{"n":10,"p50":0,"p95":107,"maks":107,"rata":10.7},
   "retrieval":{"n":10,"p50":100,"p95":116,"maks":116,"rata":98.3},
   "prompt":{"n":10,"p50":1,"p95":4,"maks":4,"rata":1.2},
   "model":{"n":10,"p50":5,"p95":26,"maks":26,"rata":8.1},
   "grounding":{"n":10,"p50":0,"p95":1,"maks":1,"rata":0.3},
   "gerbang":{"n":10,"p50":2,"p95":5,"maks":5,"rata":3.1}},
 "backend":"memory"}
```

### 4.6 Tidak ada regresi

| Pemeriksaan | Hasil |
|---|---|
| Uji pasangan entitas FR-24 (:3116) | **50 keluaran · 0 kesalahan** |
| Uji pasangan entitas FR-24 (:3119, model menukar entitas) | **50 · 0 kesalahan · 8 narasi ditolak** |
| §6e pembersihan data (FR-23) | 4/4 |
| §6f notifikasi sirkuit (OPS-04) | LULUS (13 ✓ / 0 ✗) |

---

## 5. Temuan yang muncul saat verifikasi (dan diperbaiki di sumbernya)

1. **Token jalur streaming tidak pernah tercatat** (temuan nyata, bukan cacat kosmetik).
   Harness menolak lulus karena token hanya ada pada 5 dari 10 panggilan model — tepatnya yang
   lewat jalur JSON. Penyebabnya: parser SSE hanya mengambil `delta.content` dan membuang `usage`.
   Penyedia OpenAI-compatible mengirim `usage` pada potongan terakhir; kini diparsing dan dicatat.
   Tanpa NFR-07, ini tidak akan pernah terlihat: biaya jalur streaming (jalur yang dipakai halaman
   utama!) sama sekali tidak terukur sebelum hari ini.
2. **Uji yang nyaris lulus secara palsu** karena AI tidak menyala. Putaran pertama harness
   melaporkan "model dipanggil 0/10" — jalur AI memang tidak aktif (env tidak diset), sehingga
   tahap `prompt`/`model`/`grounding` tidak pernah berjalan. Harness kini **menyalakan sendiri**
   stub SPLP + penyedia tiruan + aplikasi, dan memeriksa `ai.state=active` sebagai butir pertama.
3. **Pembaca agregat mendahului penulisnya.** Penulisan agregat sengaja nirblokir, sehingga
   `/api/status` yang dipanggil terlalu cepat bisa melihat keadaan satu permintaan yang lalu —
   selisih satu sampel sudah cukup membuat perbandingan "dilaporkan vs dihitung ulang" gagal.
   Ditambahkan `tungguAgregatSelesai()` di **sisi pembaca** (bukan penulis), jadi jalur permintaan
   tetap tidak pernah menunggu.
4. **Pratinjau `SAPA_TELEMETRI_REKAP_N=0`** (rekap otomatis dimatikan) tidak boleh membuat
   `?rekap=1` ikut mati — keduanya jalur berbeda, dan operator tetap harus bisa meminta rekap manual.

---

## 6. Apa yang telemetri ini langsung beritahu (nilai nyata, bukan janji)

Dari 10 permintaan uji pada katalog 1210 record (penyedia tiruan, jadi angka **model** belum
mewakili penyedia sungguhan):

* **`retrieval` adalah tahap termahal** — p95 **116 ms**, rata-rata 98 ms, dan itu 86–100 % dari
  total waktu permintaan. Tahap lain: `model` p95 26 ms (tiruan), `prompt` 4 ms, `gerbang` 5 ms,
  `grounding` 1 ms.
* **`indeks_semantik` memuncak sekali** (p95 107 ms, rata-rata 10,7 ms) — yaitu **muat dingin**
  indeks FR-12; setelah itu 0 ms. Ini konsisten dengan temuan FR-12 (75–1210 record) dan
  menunjukkan biaya itu **satu kali per versi korpus**, bukan per permintaan.
* **`pengambilan_data` ≈ 0 ms** di seluruh permintaan setelah yang pertama — bukti bahwa katalog
  memang di-cache (FR-25), bukan diambil ulang dari SPLP tiap permintaan.

Kesimpulan operasional: optimasi berikutnya harus menyasar **retrieval leksikal/semantik**, bukan
prompt.

---

## 7. Keputusan desain

| Keputusan | Alasan |
|---|---|
| `AsyncLocalStorage`, bukan menambah parameter | nol perubahan tanda tangan fungsi di jalur kritis; `llm-client` tidak perlu tahu apa pun tentang telemetri |
| Konteks **menumpang** bila sudah ada | satu permintaan = satu baris; tidak ada p95 yang terhitung dua kali |
| Persentil **nearest-rank**, bukan interpolasi | hasilnya dapat dihitung ulang persis oleh siapa pun dari sampel mentah — dasar pemeriksaan §6g butir 10 |
| Simpan **sampel mentah**, hitung persentil saat dibaca | satu sumber kebenaran: angka di `/api/status`, di endpoint admin, dan di baris rekap selalu berasal dari data yang sama |
| Tulis agregat **nirblokir**, tunggu di sisi pembaca | telemetri tidak boleh menambah latensi jawaban warga |
| `gen_ai.*` **diturunkan** dari medan internal | konvensi masih pra-stabil (belum ada 1.0); penggantian nama cukup di satu tempat |
| Isi pertanyaan **tidak pernah** masuk log | telemetri adalah alat diagnosa, bukan jalan pintas PII; diuji dengan canary |

---

## 8. Batas yang diketahui

- **Angka `model` pada uji ini dari penyedia tiruan.** Angka model sungguhan (dan `ttfb`) baru bermakna
  setelah langganan penyedia aktif; strukturnya sudah siap menerimanya tanpa perubahan kode.
- **Agregat bergulir, bukan riwayat.** Jendela 200 sampel terakhir menjawab "sekarang", bukan
  "bulan lalu". Riwayat jangka panjang menuntut penyimpanan deret waktu — di luar lingkup NFR-07.
- **Tanpa Redis, agregat bersifat per-instance.** Beberapa instance serverless akan saling menimpa
  agregat (bukan menggabungkan). Setelah Upstash dipasang, agregat menjadi global tanpa perubahan kode;
  sampai itu terjadi, `/api/status` melaporkan `backend` apa adanya.
- **Percobaan ulang model dihitung dalam satu tahap `model`** (durasi gabungan). Ini disengaja:
  yang ingin diketahui operator adalah biaya waktu yang dirasakan pengguna.
- **Bukan penagih biaya.** Token dicatat bila penyedia mengirimnya; bila tidak, kolomnya kosong —
  bukan dikarang. Untuk perhitungan biaya resmi, tetap gunakan tagihan penyedia.
- **Log ditulis ke stdout** (tanpa OTLP exporter). Bentuk medannya siap diserap backend
  observabilitas, tetapi pengiriman langsung via OTLP adalah pekerjaan terpisah dan belum dilakukan.

---

## 9. Langkah berikutnya

Fase D berlanjut ke **OPS-03 — penyegaran cache terjadwal** (endpoint `/api/revalidate` sudah ada
dan sudah fail-closed; yang kurang adalah penjadwal + rahasianya), lalu **NFR-09 aksesibilitas
WCAG 2.2 AA**, dan terakhir **CMP-02/03/04** (keterbukaan penggunaan AI, tata kelola risiko, jejak
audit). Sisa pekerjaan Fase D kini terekam dengan bukti di `10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md` §11.
