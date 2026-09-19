# Pengujian dan Jaminan Mutu

## Ringkasan keadaan

| Pemeriksaan | Perintah | Hasil 19 Sep 2026 |
|---|---|---|
| Pemeriksaan tipe | `npm run typecheck` | Bersih (`[typecheck] OK`) |
| Pengujian unit | `npx vitest run` | **169 lulus** pada 17 berkas, 0 gagal |
| Build produksi | `npm run build` | Berhasil (`✓ Compiled successfully`, ±30 detik) |
| Gerbang evaluasi | `npm run eval` | 78 butir; bergantung pada API SPLP yang hidup |
| Palang PII/kredensial | otomatis saat commit | `LEAK_COUNT 0` |

## Apa yang diuji

Pengujian ditulis dengan **Vitest** dan tersebar pada 17 berkas. Kelompoknya:

**Pencarian dan penyusunan jawaban**

- `src/lib/__tests__/retrieval.test.ts` — pencocokan pertanyaan ke indikator SAPA
- `src/services/__tests__/grounding.test.ts` — pemastian angka jawaban berasal dari bukti; tahun di luar rentang wajar dan OPD yang tidak ada akan ditolak
- `src/services/__tests__/answer-compose.test.ts` — orkestrasi menyeluruh: urutan tahap, gerbang kedua saklar admin, keluaran model tidak sesuai skema, penolakan pertanyaan berisi data pribadi

**Lapisan model bahasa (`src/lib/ai/__tests__/`)**

- `llm-client.test.ts` — pengiriman permintaan ke penyedia, kebijakan percobaan ulang (galat 5xx diulang, timeout tidak), pembatalan
- `stream-stall.test.ts` — sambungan mandek diputus lalu dicoba ulang; percobaan ulang **tidak** dilakukan bila sudah ada keluaran (mencegah teks berganda)
- `schema.test.ts` — penguraian keluaran model dan penolakan bentuk yang tidak sah
- `prompt-dan-guard.test.ts` — aturan prompt (termasuk larangan contoh angka fiktif) dan penyaring data pribadi
- `tokens.test.ts` — penanda nilai `{{id}}` dan pembersihan satuan ganda

**Penyajian dan utilitas**

- `src/services/executive-presentation.test.ts`, `src/services/__tests__/opd-drilldown.test.ts`
- `src/lib/format-singkat.test.ts`, `src/lib/__tests__/parse-numeric.test.ts`, `src/lib/__tests__/nilai-sapa.test.ts`
- `src/lib/__tests__/guard.test.ts` — penyaring data pribadi (NIK 16 digit, permintaan per-orang)
- `src/lib/__tests__/eval-set.test.ts` — keutuhan berkas kumpulan evaluasi
- `src/app/api/query/route.test.ts` dan `src/app/api/status/route.test.ts` — perilaku endpoint, termasuk balasan 503 saat SPLP mati

## Cara menjalankan

```bash
# Wajib hijau sebelum setiap unggahan
npm run typecheck && npx vitest run && npm run build

# Hanya pengujian
npx vitest run                 # sekali jalan
npm run test:watch             # mode pantau saat mengembangkan

# Gerbang evaluasi (memanggil API SPLP yang sesungguhnya)
npm run eval
npm run eval:baseline          # membandingkan dengan baseline tersimpan
```

**Hasil yang diharapkan:** pemeriksaan tipe berakhir `[typecheck] OK`; pengujian
melaporkan `Tests 169 passed (17)`; build berakhir `✓ Compiled successfully`.

## Gerbang otomatis

### Sebelum commit (lokal)

`.githooks/pre-commit` menjalankan dua hal berurutan:

1. `scripts/pii-gate.sh` — memindai **seluruh** repositori untuk NIK 16 digit dan
   pola kredensial (`sk-…`, `ghp_…`, `AKIA…`, blok private key). Berkas uji yang
   sengaja memuat NIK sintetis harus mendeklarasikan penanda
   `pii-gate: izinkan NIK sintetis uji` **pada awal berkas** (1000 karakter pertama).
   Commit dibatalkan bila ditemukan temuan.
2. `scripts/typecheck.sh` — pemeriksaan tipe.

Palang ini hanya aktif bila `core.hooksPath` menunjuk ke `.githooks`. Pemasangan
dilakukan otomatis oleh script `prepare` pada `npm install`. **Bila seseorang clone
repositori lalu tidak pernah menjalankan `npm install`, palang ini tidak aktif** —
periksa dengan `git config --get core.hooksPath`, dan bila kosong jalankan
`git config core.hooksPath .githooks`.

### Di server (GitHub Actions)

`.github/workflows/ci.yml` berisi dua pekerjaan:

| Pekerjaan | Isi | Sifat |
|---|---|---|
| `fondasi` | Pemeriksaan tipe, pengujian, build | **Gerbang**: kegagalan menandai commit bermasalah |
| `eval` (nama: "Gerbang regresi — 78 item") | Menjalankan server lokal lalu kumpulan evaluasi 78 butir | `continue-on-error: true` — **penanda, bukan gerbang** |

Pekerjaan `eval` sengaja tidak dijadikan gerbang karena memanggil API SPLP pihak
ketiga: bila SPLP sedang tidak tersedia, kegagalannya bukan disebabkan perubahan
kode. Alasan ini tercatat langsung sebagai komentar di berkas workflow. Jadikan
gerbang setelah terbukti stabil beberapa pekan.

Catatan penting: kedua pekerjaan CI **tidak memakai kredensial apa pun** — aplikasi
dirancang berjalan penuh tanpa variabel lingkungan (mode deterministik dari data
SPLP). Bila CI sampai memerlukan kredensial, itu pertanda desainnya menyimpang.

## Hasil evaluasi yang pernah dicapai

- **Deterministik (tanpa model):** 74 dari 78 butir lulus, tanpa regresi
- **Dengan model:** 47 dari 52 butir lulus (90,4%); 5 jawaban digantikan template,
  tidak ada yang gagal; jaring pengaman berhasil menangkap kasus "tahun halusinasi"

Angka-angka ini adalah hasil pengukuran yang tercatat pada riwayat proyek, bukan
jaminan mutu berkelanjutan — jalankan `npm run eval` untuk keadaan terkini.

## Batas pengujian — apa yang belum tercakup

Jujur agar penerima tidak mengira lebih dari yang sebenarnya:

1. **Tidak ada pengujian antarmuka di peramban.** Seluruh pengujian bersifat unit
   dan endpoint. Perilaku halaman (grafik, peta, tombol, tata letak di ponsel)
   hanya diverifikasi secara manual.
2. **Tidak ada pengujian beban.** Belum pernah diukur perilaku aplikasi pada
   pemakaian bersamaan yang tinggi.
3. **Tidak ada pengukuran cakupan kode (coverage).** Jumlah 169 pengujian
   menggambarkan banyaknya kasus, bukan seberapa besar kode tercakup.
4. **Gerbang evaluasi bergantung pada layanan pihak ketiga.** Bila SPLP tidak
   dapat dijangkau, pekerjaan `eval` gagal meski kode sehat — itu sebabnya ia
   bersifat penanda, bukan gerbang.
5. **Pengujian model bahasa memakai tiruan (mock), bukan model sungguhan.**
   Pengujian memastikan logika penanganan benar; ia tidak mengukur mutu jawaban
   model. Yang mengukur mutu jawaban adalah gerbang evaluasi.
6. **Keamanan belum diuji secara ofensif.** `07-KEAMANAN-DAN-DATA.md` memuat
   daftar risiko terbuka yang belum ditutup (tidak ada jejak audit per-aksi,
   endpoint revalidate terbuka bila kunci tidak dipasang, tidak ada header keamanan).

## Saran peningkatan berikutnya

1. Tambahkan pengujian antarmuka (mis. Playwright) untuk alur bertanya dan empat halaman utama.
2. Pasang kunci `REVALIDATE_SECRET` dan tambahkan `AI_ADMIN_KEY` rotasi berkala.
3. Tambahkan header keamanan pada `next.config.ts`.
4. Jadikan pekerjaan `eval` sebagai gerbang setelah stabil beberapa pekan.
5. Ukur cakupan kode untuk mengetahui bagian yang benar-benar terlindungi.
