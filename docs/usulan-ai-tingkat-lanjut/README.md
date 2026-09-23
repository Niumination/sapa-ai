# Usulan: SAPA AI Tingkat Lanjut (gelombang 1–3, siap dilanjutkan)

Berkas di folder ini **berdiri sendiri** — dapat dibaca tanpa dokumen lain.

| Berkas | Untuk siapa | Isi singkat |
|---|---|---|
| `21-LAPORAN-OPS-03.md` | operator · pengembang | **Penyegaran cache terjadwal**: penjadwal (GitHub Actions + cron lokal) yang **membuktikan kesegaran pada data** sebelum melaporkan sukses, kategori kegagalan yang menunjuk perbaikan (rahasia salah · endpoint tertutup · dibatasi · galat server), pembukuan kesegaran di `/api/status`, endpoint admin (periksa · segarkan sekarang · uji kering), dan tata cara pemasangan termasuk tabel "bila gagal" |
| `20-LAPORAN-NFR-07.md` | pengembang · operator | **Telemetri per tahap** (`gen_ai.*`): satu baris log per permintaan dengan durasi retrieval · prompt · model · grounding · gerbang, medan sesuai konvensi OpenTelemetry (dan catatan jujur bahwa konvensi itu masih pra-stabil), agregat p50/p95 bergulir di penyimpanan bersama, endpoint admin (sampel mentah · `?rekap=1` · `?nolkan=1`), serta harness yang menjalankan sendiri aplikasi + penyedia tiruan dan **menghitung ulang** p95 dari log |
| `19-LAPORAN-OPS-04.md` | pengembang · operator · tim dukungan | **Pemberitahuan saat sirkuit penyedia AI terbuka**: satu episode satu peringatan (tanpa spam), kabar pemulihan, saluran Telegram/webhook dengan penyaring rahasia, endpoint admin (periksa · kering · uji), penjadwal luar untuk kasus tanpa lalu lintas, dan tiga temuan nyata dari uji ujung-ke-ujung — termasuk uji yang nyaris vakum karena cache jawaban |
| `18-LAPORAN-FR-23.md` | pengembang · tim keamanan | **Pembersihan data katalog sebelum masuk prompt**: dua rem (masuk prompt + keluar ke layar), 7 kelompok aturan, model uji `mock-patuh` yang menuruti perintah data, kontrol negatif yang sengaja gagal, plus empat temuan yang hanya muncul lewat pengujian nyata |
| `10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md` | pengembang · perencana · pemilik anggaran | **Kebutuhan upgrade disusun dari awal**: tujuan, 7 invariants, 27 kebutuhan fungsional + 10 non-fungsional dengan kriteria terima berangka, kebutuhan data/evaluasi/operasi/kepatuhan, arsitektur target, peta fase B–D |
| `11-KIT-SERAH-TERIMA.md` | pengembang · agen repo lokal | cara menerapkan (3 cara), titik rawan konflik, batas kepemilikan berkas, cara uji di localhost, validasi dengan model sungguhan, rollback, **instruksi siap-tempel untuk agen** |
| `12-LAPORAN-FR-25-FR-27.md` | pengembang · pemilik produk | **Laporan dua butir termurah**: cap kesegaran data (waktu tarik · sidik isi korpus · tahun data) + dasbor celah pengetahuan — rancangan, bukti uji, dan batas yang jujur |
| `13-LAPORAN-FR-26.md` | pengembang · tim data | **Notis transparansi + kanal koreksi warga**: notis tiga keadaan, kanal "lapor angka" tanpa menyimpan angka, dasbor tinjauan `/admin/umpan-balik` — beserta bukti uji |
| `14-LAPORAN-FR-19.md` | pengembang · tim data | **Sitasi per klaim**: penanda `[n]` pada narasi, `narasiBersitasi`/`sitasi` pada API, skrip uji 50 sampel beserta bukti lulusnya |
| `15-LAPORAN-FR-12.md` | pengembang · tim data | **Lapis semantik Bahasa Indonesia + fusi RRF**: penyedia `hash` tanpa jaringan, invarian leksikal-dulu, kalibrasi ambang berpasangan (0,25/0,27), hasil recall@15 12/20 → 20/20, indeks dingin 75 ms, plus tiga bug yang ditemukan verifikasi dan batas yang jujur |
| `16-LAPORAN-FR-20.md` | pengembang · tim data | **Klasifikasi sebab kegagalan**: satu tag `lapis:rincian` per jawaban (masukan · retrieval · generasi · penyajian · selesai), tag menggantikan dua sebab kasar lama, wiring ke rute JSON + streaming & dasbor celah, harness penanda sebab, plus keputusan desain dan batas yang jujur |
| `17-LAPORAN-FR-24.md` | pengembang · tim data | **Pemeriksa pasangan entitas**: gerbang anti-*deceptive grounding* (nilai benar dipasangkan ke entitas lain), pemeriksaan per klausa, tag sebab `generasi:pasangan-entitas`, mock `mock-tukar`, harness 50 sampel independen, plus tiga penuduhan palsu yang ditemukan & diperbaiki |
| `09-AUDIT-KEAMANAN-PENGGABUNGAN.md` | pemilik produk · DevOps | bukti `main` belum tersentuh, hasil uji gabung, kesetaraan kontrak API, perbandingan perilaku produksi vs cabang, risiko & rencana mundur |
| `uji-terima.sh` | semua | skrip uji terima otomatis (LULUS/GAGAL sesuai ambang) |
| `seri-patch/` | agen repo lokal | seluruh berkas `NNNN-*.patch` (urut angka) + `00-semua.patch` |

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
