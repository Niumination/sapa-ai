# Usulan: SAPA AI Tingkat Lanjut (gelombang 1–3, siap dilanjutkan)

Berkas di folder ini **berdiri sendiri** — dapat dibaca tanpa dokumen lain.

| Berkas | Untuk siapa | Isi singkat |
|---|---|---|
| `10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md` | pengembang · perencana · pemilik anggaran | **Kebutuhan upgrade disusun dari awal**: tujuan, 7 invariants, 27 kebutuhan fungsional + 10 non-fungsional dengan kriteria terima berangka, kebutuhan data/evaluasi/operasi/kepatuhan, arsitektur target, peta fase B–D |
| `11-KIT-SERAH-TERIMA.md` | pengembang · agen repo lokal | cara menerapkan (3 cara), titik rawan konflik, batas kepemilikan berkas, cara uji di localhost, validasi dengan model sungguhan, rollback, **instruksi siap-tempel untuk agen** |
| `12-LAPORAN-FR-25-FR-27.md` | pengembang · pemilik produk | **Laporan dua butir termurah**: cap kesegaran data (waktu tarik · sidik isi korpus · tahun data) + dasbor celah pengetahuan — rancangan, bukti uji, dan batas yang jujur |
| `13-LAPORAN-FR-26.md` | pengembang · tim data | **Notis transparansi + kanal koreksi warga**: notis tiga keadaan, kanal "lapor angka" tanpa menyimpan angka, dasbor tinjauan `/admin/umpan-balik` — beserta bukti uji |
| `14-LAPORAN-FR-19.md` | pengembang · tim data | **Sitasi per klaim**: penanda `[n]` pada narasi, `narasiBersitasi`/`sitasi` pada API, skrip uji 50 sampel beserta bukti lulusnya |
| `15-LAPORAN-FR-12.md` | pengembang · tim data | **Lapis semantik Bahasa Indonesia + fusi RRF**: penyedia `hash` tanpa jaringan, invarian leksikal-dulu, kalibrasi ambang berpasangan (0,25/0,27), hasil recall@15 12/20 → 20/20, indeks dingin 75 ms, plus tiga bug yang ditemukan verifikasi dan batas yang jujur |
| `09-AUDIT-KEAMANAN-PENGGABUNGAN.md` | pemilik produk · DevOps | bukti `main` belum tersentuh, hasil uji gabung, kesetaraan kontrak API, perbandingan perilaku produksi vs cabang, risiko & rencana mundur |
| `uji-terima.sh` | semua | skrip uji terima otomatis (LULUS/GAGAL sesuai ambang) |
| `seri-patch/` | agen repo lokal | 7 patch berurutan + `00-semua.patch` |

## Angka kunci versi ini (terukur 22 Sep 2026, penyedia model tiruan)

| Ukuran | Nilai |
|---|---|
| Evaluasi 90 item — mode AI | **90/90 (100%)** |
| Evaluasi 90 item — mode deterministik | **90/90 (100%)** |
| `grounded pass` saat model dipanggil | **61/61 (100%)** |
| Fallback (jawaban AI dibuang) | **0%** |
| Invarians (halu/token/jargon/sumber/NIK) | **0** |
| Sitasi AI vs deterministik (A/B) | **4,50 vs 3,00** |
| Latensi ber-bukti saat penyedia mati | **0,14–0,56 dtk** (dari 11,4 dtk) |
| Uji unit | **20 berkas / 237 uji** |

## Satu menit untuk mencoba

```bash
npm ci
node verifikasi/mock-llm.mjs 8899 &
AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=http://127.0.0.1:8899/v1 \
  AI_API_KEY=mock-uji AI_MODEL=mock-pintar npx next start -p 3116 &
AI_ENABLED=false npx next start -p 3117 &
AI_URL=http://127.0.0.1:3116 DET_URL=http://127.0.0.1:3117 bash verifikasi/uji-terima.sh
```
