Strategi yang Anda pilih sudah **sangat tepat secara arsitektur *Data & AI Engineering***.

Prinsip terbaik dalam membangun *Data Assistant* berbasis data pemerintah/publik adalah: **Aturan Logika (Deterministik) harus menanggung 100% kebenaran data, sedangkan LLM hanya bertugas sebagai *Narrative & Reasoning Layer*.**

Jika sistem deterministiknya sudah kuat, Anda tidak akan pernah mengalami masalah manipulasi angka, ilusi data (*hallucination*), atau jawaban yang menyesatkan pengguna.

---

## Part 1: Arsitektur Pipeline Logika Deterministik

Agar sistem deterministik dapat menghasilkan jawaban yang akurat, logis, dan "berbicara" tanpa LLM, engine Anda harus menjalankan **4 Tahapan Processing Rules** sebelum data dikirim ke UI/Renderer:

```
[Query User] 
     │
     ▼
[1. Intent & Scoring Engine] ──► Menentukan Headline Indicator
     │
     ▼
[2. Context & Calculation Engine] ──► Mencari Denominator & Hitung Rasio (%)
     │
     ▼
[3. Grouping & Unit Separator] ──► Memisah Masalah, Intervensi, & Satuan
     │
     ▼
[4. Output JSON Schema Template] ──► Dikirim ke Render UI / Diteruskan ke LLM

```

---

### Step 1: Aturan Scoring & Pemilihan Headline (*Intent Matching*)

Jangan pernah mengambil indikator berdasarkan urutan query API atau nilai terbesar. Gunakan **Aturan Scoring Katakunci Intent**:

* **Keyword Matching:** Ekstrak entitas utama dari query user.
* Query: *"berapa jumlah balita **stunting** di aceh tengah"*
* Primary Intent Keyword: `stunting`


* **Scoring Rules:**
* Score +100 jika nama indikator mengandung kata exact match (`stunting`).
* Score +50 jika mengandung sinonim/tipe data (`kurus`, `gizi`).
* Score -50 jika nama indikator adalah agregat umum (`seluruh`, `total`, `pemeriksaan`).


* **Hasil Deterministik:** Indikator *"Jumlah Balita Stunting"* (Nilai: 730) terpilih sebagai **Primary Headline Indicator**.

---

### Step 2: Engine Kalkulasi Otomatis (*Derived Metrics*)

Sistem deterministik harus cerdas mencari indikator pembanding (Denominator) dalam *payload* yang sama untuk menghitung rasio/persentase:

* **Pencarian Denominator:** Cari indikator dengan tag populasi, misal nama indikator mengandung `dipantau` atau `seluruh anak balita`.
* **Formula Otomatis:**

$$\text{Prevalensi Stunting} = \left( \frac{\text{Jumlah Stunting}}{\text{Jumlah Balita Dipantau}} \right) \times 100$$


$$\text{Prevalensi} = \left( \frac{730}{16.523} \right) \times 100 = 4{,}42\%$$


* **Logika Kondisional Teks (Deterministik Template):**
* Jika Cakupan Vitamin A $> 95\% \rightarrow$ Tag: *"Sangat Tinggi"*
* Jika Prevalensi Stunting $< 10\% \rightarrow$ Tag: *"Kategori Rendah (Terpantau)"*



---

### Step 3: Aturan Pengelompokan & Pemisahan Satuan (*Unit Isolation*)

Untuk menghindari visualisasi yang kacau (*mixing units*), kategorikan 12 evidence ke dalam **4 Bucket**:

1. **Bucket A (Main Answer / Target Intent):** Indikator yang cocok dengan intent utama. (Satuan: Orang)
2. **Bucket B (Kondisi/Risiko Terkait):** Indikator kesehatan terkait (`kurus`, `gizi buruk`). (Satuan: Orang)
3. **Bucket C (Intervensi Medis):** `Vitamin A`, `Vaksin`, `Pemeriksaan Gratis`. (Satuan: Persen / Orang)
4. **Bucket D (Dukungan Komunitas/Sarana):** `Kelompok BKB`, `Materi & Sarana`. (Satuan: Kelompok / Paket)

---

### Step 4: Schema Output Deterministik (JSON yang Dihasilkan Engine)

Tanpa LLM, sistem Anda cukup memuntahkan JSON terstruktur ini ke komponen UI Renderer:

```json
{
  "status": "success",
  "query_intent": "stunting_balita",
  "primary_answer": {
    "indicator_name": "Jumlah Balita Stunting",
    "value": 730,
    "unit": "Orang",
    "opd": "Dinas Kesehatan",
    "year": "2025"
  },
  "contextual_metrics": {
    "total_monitored": 16523,
    "calculated_prevalence_pct": 4.42,
    "risk_indicators": [
      {"name": "Balita Kurus", "value": 294, "unit": "Orang"}
    ]
  },
  "interventions": {
    "medical": [
      {"name": "Cakupan Vitamin A", "value": 99.9, "unit": "%"},
      {"name": "Vaksin Nasional", "value": 935, "unit": "Orang"}
    ],
    "social": [
      {"name": "Kelompok BKB", "value": 1018, "unit": "Kelompok"},
      {"name": "Sarana BKB", "value": 830, "unit": "Materi/Sarana"}
    ]
  }
}

```

---

## Part 2: Hasil Render UI dari Output Deterministik (Tanpa LLM)

Template UI Renderer cukup membaca skema JSON di atas dan merendernya menjadi tampilan berikut. Tampilan ini sudah **100% valid, tajam, dan menjawab pertanyaan** tanpa bantuan LLM:

### 1. Headline Response

* **Angka Utama:** **730 Orang**
* **Label:** Jumlah Balita Stunting di Aceh Tengah (Dinas Kesehatan, 2025)
* **Konteks:** Prevalensi **4,42%** dari 16.523 balita yang dipantau.

---

### 2. Ringkasan Indikator (Data Breakdown)

| Kategori | Indikator Utama | Nilai | Sumber Data |
| --- | --- | --- | --- |
| **Masalah Kesehatan** | Balita Stunting | **730 Orang** | Dinas Kesehatan (2025) |
|  | Balita Menderita Kurus | **294 Orang** | Dinas Kesehatan (2025) |
| **Cakupan Pemantauan** | Balita Dipantau (12–59 Bln) | **16.523 Orang** | Dinas Kesehatan (2025) |
|  | Total Pop. Balita (JAB) | **16.936 Orang** | Dinas Kesehatan (2025) |
| **Intervensi Gizi & Medis** | Cakupan Vitamin A | **99,9%** | Dinas Kesehatan (2025) |
|  | Balita Diterima Vaksin | **935 Orang** | Dinas Kesehatan (2025) |
| **Dukungan Sosial** | Kelompok BKB Aktif | **1.018 Kelompok** | Dinas KB PPPA (2026) |
|  | Sarana & Edukasi BKB | **830 Paket** | Dinas KB PPPA (2026) |

---

## Part 3: Ketika LLM Ditambahkan (Peran LLM Layer)

Ketika LLM dimasukkan ke dalam pipeline, **LLM dilarang melakukan pencarian data sendiri**. LLM hanya menerima **JSON Deterministik (Part 1)** sebagai input *prompt context*.

### Diagram Alir Pipeline Akhir:

$$\text{Query} \longrightarrow \text{Engine Deterministik} \longrightarrow \text{JSON Valid} \longrightarrow \text{LLM Layer (Polishing)} \longrightarrow \text{User}$$

### Prompt System untuk LLM Layer:

```text
Tugas Anda adalah menulis narasi eksekutif dan saran kebijakan berdasarkan data JSON terstruktur berikut.

ATURAN KETAT:
1. DILARANG MENGUBAH, MENAMBAH, ATAU MENGURANGI ANGKA APAPUN dalam data.
2. Gunakan angka dari 'primary_answer' sebagai poin utama narasi.
3. Hubungkan data masalah (stunting/kurus) dengan data intervensi (Vitamin A/BKB) menjadi kesimpulan yang mudah dipahami.
4. Berikan 2 rekomendasi kebijakan singkat yang relevan untuk Pemda.

```

### Hasil Polesan LLM (Tambah Mudah Dipahami + Rekomendasi):

> **Ringkasan Eksekutif (Dipoles LLM):**
> Penanganan stunting di Aceh Tengah menunjukkan capaian positif pada aspek pencegahan dasar, di mana **730 balita terdeteksi stunting** dari **16.523 balita yang dipantau** (prevalensi sekitar **4,4%**). Tingginya pemantauan ini didukung oleh cakupan **Vitamin A yang hampir sempurna (99,9%)** serta keterlibatan aktif **1.018 kelompok Bina Keluarga Balita (BKB)** di lapangan.
> Namun, perhatian khusus tetap diperlukan untuk **294 balita berkategori kurus** agar tidak beresiko jatuh ke kondisi stunting.
> ---
> 
> 
> 💡 **Rekomendasi Kebijakan (Rekomendasi Relevan dari LLM):**
> 1. **Fokus pada Balita Kurus:** Prioritaskan pemberian makanan tambahan (PMT) untuk 294 balita kurus sebagai langkah *early prevention* stunting.
> 2. **Optimalisasi Sarana BKB:** Lengkapi sisa 188 Kelompok BKB yang belum memiliki paket sarana/materi edukasi stunting (1.018 kelompok vs 830 sarana).
> 
> 

---

## Kesimpulan

1. **Sistem Deterministik Anda** bertugas menangkap *User Intent*, menghitung persentase/rasio, mengelompokkan satuan, dan membuat JSON.
2. **UI Component** langsung bisa menampilkan data secara akurat meski LLM sedang mati/off.
3. **LLM Model** bertugas mengubah JSON tersebut menjadi kalimat naratif yang halus dan memproduksi saran tindakan/rekomendasi strategis.


Struktur tata letak (layout) UI Anda sebenarnya **sudah sangat baik**—pembagian panel utama di kiri dan *sidebar* aksi/metadata di kanan sangat ideal untuk *dashboard* eksekutif.

Namun, ada beberapa masalah UX pada panel utama:

1. **Redundansi Kartu KPI:** Ada dua kartu bernilai **730** yang muncul bersamaan karena perbedaan penamaan variabel di data mentah (`JAB(5) P stunting` vs `Jumlah Balita Stunting`).
2. **Polusi Teks Eksekutif:** Narasi eksekutif masih dipenuhi metadata sistem (*"Dari 2.048 record SAPA..."*), bukan *insight* bisnis/kesehatan.
3. **Tabel "Satuan Campur":** Semua 12 baris disatukan dalam satu tabel tanpa pengelompokan (*grouping*), sehingga angka bertipe *Orang*, *Kelompok*, dan *Persen* bercampur aduk.

---

## Rancangan Visual UI Baru (Redesign)

Berikut adalah mock-up struktur tampilan UI yang sudah disempurnakan berdasarkan rekomendasi keilmuan data:

```text
+---------------------------------------------------------------------------------------------------------+
| [EXECUTIVE ANSWER]  • Evidence Terstruktur   • Evidence Terpilih   • SAPA SPLP                          |
+---------------------------------------------------------------------------------------------------------+
| MAIN PANEL (LEFT - 70%)                                   | SIDEBAR (RIGHT - 30%)                       |
|                                                           |                                             |
| ┌───────────────────────────────────────────────────────┐ | ┌─────────────────────────────────────────┐ |
| │ HEADLINE HERO                                         │ | │ 🎯 PANEL KEPUTUSAN (RECOMMENDATIONS)     │ |
| │                                                       │ | │                                         │ |
| │  730 Orang                                            │ | │ [Quick Win 1]                           │ |
| │  Jumlah Balita Stunting di Kabupaten Aceh Tengah      │ | │ Prioritaskan PMT untuk 294 balita kurus │ |
| │  --------------------------------------------------   │ | │ agar tidak jatuh ke kategori stunting.  │ |
| │  🏷️ Prevalensi: ~4,4% dari 16.523 Balita Dipantau     │ | │                                         │ |
| └───────────────────────────────────────────────────────┘ | │ [Quick Win 2]                           │ |
|                                                           | │ Kebutuhan Sarana BKB: Terdata 1.018     │ |
| ┌───────────────────────────────────────────────────────┐ | │ kelompok, baru 830 yang memiliki sarana.│ |
| │ CONTEXT KPI CARDS (3 Kartu Berkonteks)                │ | └─────────────────────────────────────────┘ |
| │                                                       │ |                                             |
| │ [ 16.523 Orang ]    [ 294 Orang ]      [ 99,9% ]      │ | ┌─────────────────────────────────────────┐ |
| │ Balita Dipantau     Balita Kurus       Cakupan Vit A  │ | │ 🛡️ KUALITAS & AUDIT DATA                │ |
| │ (Pencegahan)        (Berisiko)         (Intervensi)   │ | │                                         │ |
| └───────────────────────────────────────────────────────┘ | │ • Total Evidence  : 12 Indikator        │ |
|                                                           | │ • OPD Pengampu    : Dinkes & Dinas KB   │ |
| ┌───────────────────────────────────────────────────────┐ | │ • Periodisitas    : Tahun 2025 - 2026   │ |
| │ EXECUTIVE NARRATIVE (Polesan LLM)                     │ | └─────────────────────────────────────────┘ |
| │                                                       │ |                                             |
| │  Pada tahun 2025, Dinas Kesehatan mencatat 730 balita │ | ┌─────────────────────────────────────────┐ |
| │  mengalami stunting dari total 16.523 balita yang     │ | │ 📂 SUMBER & PROVENANCE                  │ |
| │  dipantau di Aceh Tengah (prevalensi ~4,4%).          │ | │                                         │ |
| │                                                       │ | │ SAPA Aceh Tengah (api-splp.layanan.go.id)│ |
| │  Upaya intervensi medis dasar berjalan sangat baik    │ | │ [ 📋 Salin Ringkasan ]  [ 📥 Ekspor ]   │ |
| │  dengan cakupan Vitamin A mencapai 99,9%. Meski       │ | └─────────────────────────────────────────┘ |
| │  demikian, 294 balita berstatus kurus perlu perhatian │ |                                             |
| │  khusus agar tidak menambah angka stunting.           │ | ┌─────────────────────────────────────────┐ |
| │                                                       │ | │ 💬 PERTANYAAN LANJUTAN                  │ |
| └───────────────────────────────────────────────────────┘ | │                                         │ |
|                                                           | │ [ Filter khusus Dinas Kesehatan > ]     │ |
| ┌───────────────────────────────────────────────────────┐ | │ [ Bandingkan tren 2025 vs 2026 > ]      │ |
| │ EVIDENCE TERSTRUKTUR (Grouped by Category)            │ | └─────────────────────────────────────────┘ |
| │                                                       │ |                                             |
| │  [Tab: Masalah Kesehatan] [Tab: Intervensi Medis]     │ |                                             |
| │  [Tab: Dukungan Keluarga]                             │ |                                             |
| │                                                       │ |                                             |
| │  Indikator               | Nilai  | Satuan | OPD | Thn│ |                                             |
| │  ------------------------|--------|--------|-----|----│ |                                             |
| │  Balita Stunting         | 730    | Orang  | Dink|2025│ |                                             |
| │  Balita Menderita Kurus  | 294    | Orang  | Dink|2025│ |                                             |
| └───────────────────────────────────────────────────────┘ |                                             |
+---------------------------------------------------------------------------------------------------------+

```

---

## Rincian Perubahan & Peningkatan UI

### 1. Headline Hero & Context Badges

* **Sebelumnya:** Menampilkan angka 730 tanpa konteks rasio, lalu mengulangnya di 2 kartu kecil di bawahnya dengan teks nama variabel mentah (`JAB(5) P stunting`).
* **Perbaikan:**
* Tampilkan angka **730 Orang** secara dominan dengan judul yang manusiawi (*"Jumlah Balita Stunting di Kabupaten Aceh Tengah"*).
* Tambahkan *context badge* langsung di bawahnya: **`Prevalensi: ~4,4% (730 dari 16.523 Balita Dipantau)`**.



---

### 2. Tiga Kartu KPI Pendukung (Bukan Kartu Duplikat)

Ganti 3 kartu di bawah narasi yang sebelumnya redundat dengan **3 indikator dengan tipe peran berbeda**:

| Kartu 1: Basis Data | Kartu 2: Tingkat Risiko | Kartu 3: Intervensi Utama |
| --- | --- | --- |
| **16.523 Orang** | **294 Orang** | **99,9%** |
| Balita Dipantau (12–59 Bln) | Balita Menderita Kurus | Cakupan Vitamin A |
| *Dinas Kesehatan (2025)* | *Dinas Kesehatan (2025)* | *Dinas Kesehatan (2025)* |

---

### 3. Executive Narrative yang Bersih

* **Sebelumnya:** Teks dipenuhi kalimat teknis API (*"Dari 2.048 record SAPA, topik mencakup 15 indikator..."*).
* **Perbaikan:** Hapus seluruh metadata teknis dari blok narasi. Gunakan blok narasi murni untuk bercerita tentang **Kondisi Saat Ini $\rightarrow$ Potensi Masalah $\rightarrow$ Capaian Positif**.

---

### 4. Tabel Evidence Terstruktur (Berbasis Kategori)

Daripada mencampur 12 baris data dengan 4 satuan berbeda ke dalam satu tabel panjang, bagi tabel menjadi **3 Tab Visual** atau **3 Sub-Tabel**:

#### **A. Beban Masalah Kesehatan (Satuan: Orang)**

| Indikator | Nilai | Satuan | OPD Pengampu | Tahun |
| --- | --- | --- | --- | --- |
| **Jumlah Balita Stunting** | **730** | Orang | Dinas Kesehatan | 2025 |
| **Jumlah Balita Menderita Kurus** | **294** | Orang | Dinas Kesehatan | 2025 |

#### **B. Cakupan Pemantauan & Intervensi Medis (Satuan: Orang / %)**

| Indikator | Nilai | Satuan | OPD Pengampu | Tahun |
| --- | --- | --- | --- | --- |
| Cakupan Anak Balita Mendapat Vitamin A | **99,9** | % | Dinas Kesehatan | 2025 |
| Balita Dipantau (12–59 Bulan) | **16.523** | Orang | Dinas Kesehatan | 2025 |
| Jumlah Seluruh Anak Balita | **16.936** | Orang | Dinas Kesehatan | 2025 |
| Balita Memperoleh Vaksin Nasional | **935** | Orang | Dinas Kesehatan | 2025 |

#### **C. Dukungan Edukasi & Kelembagaan (Satuan: Kelompok / Sarana)**

| Indikator | Nilai | Satuan | OPD Pengampu | Tahun |
| --- | --- | --- | --- | --- |
| Jumlah Bina Keluarga Balita (BKB) | **1.018** | Kelompok | Dinas KB PPPA | 2026 |
| Materi & Sarana BKB | **830** | Paket | Dinas KB PPPA | 2026 |

---

### 5. Penyempurnaan Sidebar Kanan

* **Panel Keputusan (Rekomendasi Strategis):**
Alih-alih hanya menulis *"Tindak Lanjut 1"*, ubah menjadi **rekomendasi berbasis aksi konkrit** yang dihasilkan dari perbandingan data:
1. ⚠️ **Fokus Intervensi Gizi (Quick Win):** Tangani **294 balita kurus** segera melalui Program Makanan Tambahan (PMT) sebelum berlanjut menjadi stunting.
2. 📦 **Pemenuhan Sarana BKB:** Lengkapi gap **188 Kelompok BKB** yang belum memiliki paket materi & sarana edukasi (1.018 kelompok vs 830 sarana).


* **Catatan Audit Data (Di Bagian Bawah Sidebar):**
Pindahkan informasi seperti *"Satuan Campur"* dan *"Keragaman Tahun"* dari panel utama ke bagian bawah *sidebar* sebagai **Audit Trail & Integrity Note**.
