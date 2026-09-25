// ─── Lingkungan bersih untuk aplikasi yang dijalankan harness uji ─────────────
//
// MASALAH YANG DICEGAH (temuan verifikasi penerapan #3, 24 Sep 2026):
//
//   `scripts/uji-segarkan.mjs` menjalankan DUA aplikasi: A **dengan**
//   `REVALIDATE_SECRET`, B **tanpa** rahasia. Justru keadaan "tanpa rahasia"
//   itulah yang membuktikan endpoint fail-closed (HTTP 503). Harness dulu
//   membangun lingkungan anak dengan `{ ...process.env, ... }`, sehingga bila
//   shell operator sudah mengekspor `REVALIDATE_SECRET` — hal yang wajar saat
//   menguji terhadap konfigurasi nyata — rahasia itu IKUT ke aplikasi B.
//   Akibatnya aplikasi B punya rahasia, uji fail-closed tidak lagi menguji apa
//   pun, dan hasilnya 5 GAGAL yang membingungkan ("aplikasi B tidak menolak
//   anonim") padahal kodenya benar.
//
//   Kelas yang sama berlaku untuk semua harness: uji yang hasilnya ditentukan
//   oleh lingkungan luar **bukan uji**. Contoh lain: seseorang mengekspor
//   `SAPA_KAMUS_DAERAH=off` lalu menjalankan `uji-kamus-daerah.mjs` — aplikasi
//   positifnya ikut mematikan kamus, dan uji melaporkan GAGAL padahal kamusnya
//   benar.
//
// ATURAN: aplikasi yang diuji hanya menerima variabel yang disebut **eksplisit**
//   oleh harness. Semua variabel berawalan di bawah ini dari shell dibuang lebih
//   dahulu (dan dilaporkan agar terlihat), lalu nilai eksplisit diterapkan.
//   Proses pendamping (mock penyedia, stub SPLP) TIDAK dibersihkan: konfigurasi
//   mereka memang datang dari luar, dan mereka bukan yang sedang dinilai.
//
// Pakai:
//   import { envUji } from './lingkungan-uji.mjs';
//   const { env, dibuang } = envUji({ SAPA_SPLP_BASE_URL: SPLP, AI_ENABLED: 'false' });

/** Awalan variabel yang boleh mengubah perilaku aplikasi → dibuang dari lingkungan anak. */
export const AWALAN_DIBUANG = ['SAPA_', 'AI_', 'ADMIN_', 'REVALIDATE_', 'MOCK_', 'DET_'];

/**
 * Bangun lingkungan untuk aplikasi yang diuji.
 *
 * @param {Record<string, string>} eksplisit nilai yang MEMANG diinginkan harness (menang atas apa pun)
 * @param {{ izinkan?: string[], awalanDibuang?: string[] }} [opsi]
 *        `izinkan`: kunci dari shell yang sengaja diteruskan apa adanya (harus disebut namanya).
 * @returns {{ env: NodeJS.ProcessEnv, dibuang: string[] }}
 */
export function envUji(eksplisit = {}, opsi = {}) {
  const { izinkan = [], awalanDibuang = AWALAN_DIBUANG } = opsi;
  const env = { ...process.env };
  const dibuang = [];
  for (const kunci of Object.keys(env)) {
    if (izinkan.includes(kunci)) continue;
    if (awalanDibuang.some((a) => kunci.startsWith(a))) {
      delete env[kunci];
      dibuang.push(kunci);
    }
  }
  return { env: { ...env, ...eksplisit }, dibuang: dibuang.sort() };
}

/**
 * Satu baris keterangan untuk dicetak harness: apa yang dinetralkan dari shell.
 * Sengaja dicetak (bukan senyap) supaya operator tahu skenarionya tidak lagi
 * bergantung pada isi terminalnya.
 */
export function catatanLingkungan(dibuang) {
  if (dibuang.length === 0) return 'lingkungan luar bersih (tidak ada variabel SAPA_/AI_/ADMIN_/REVALIDATE_/MOCK_/DET_ yang perlu dinetralkan)';
  const tampil = dibuang.slice(0, 6).join(', ');
  const sisa = dibuang.length > 6 ? ` +${dibuang.length - 6} lagi` : '';
  return `${dibuang.length} variabel shell dinetralkan agar skenario uji tetap sama: ${tampil}${sisa}`;
}
