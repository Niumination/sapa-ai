// ─── Pagar akses halaman/API admin yg memuat data sensitif ────────────────────
//
// MENGAPA ADA
// Dasbor celah pengetahuan (FR-27) memuat PERTANYAAN WARGA. Walau sudah
// dibersihkan dari angka & identitas (lihat insight-celah.ts), ia tetap bukan
// bahan publik: pertanyaan orang bisa menyinggung hal pribadi, dan daftar itu
// menunjukkan kelemahan sistem.
//
// PRINSIP — sama seperti pagar /api/revalidate: FAIL-CLOSED.
//   • `ADMIN_TOKEN` belum diset → SEMUA permintaan ditolak (dengan penjelasan),
//     bukan dibiarkan terbuka. Kesalahan konfigurasi tidak boleh menghasilkan
//     data terbuka; itu sebabnya "lupa set" mengarah ke tertutup, bukan terbuka.
//   • Token dibandingkan dengan waktu-tetap (menghindari tebakan berbasis waktu).
//   • Token tidak pernah masuk log atau balasan.
//
// Pemakaian:
//   curl -H "x-admin-token: <token>" https://…/api/admin/celah
//   curl "https://…/api/admin/celah?token=<token>"     (untuk dibuka di peramban)

export interface IzinAdmin {
  ok: boolean;
  status: number;
  pesan: string;
}

const PESAN_KOSONG =
  'ADMIN_TOKEN belum diset di lingkungan ini. Endpoint admin sengaja MENOLAK semua permintaan ' +
  '(fail-closed) agar data pertanyaan warga tidak pernah terbuka karena lupa konfigurasi. ' +
  'Set ADMIN_TOKEN di lingkungan (Vercel → Settings → Environment Variables), lalu ulangi.';

const PESAN_SALAH =
  'Unauthorized — sertakan token admin yang benar pada header x-admin-token atau parameter ?token= ' +
  'yang cocok dengan ADMIN_TOKEN.';

/** Bandingkan dua teks dengan waktu-tetap (tidak bocor lewat durasi). */
export function samakanWaktuTetap(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i++) beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return beda === 0;
}

/** Ambil token dari header atau kueri. */
export function tokenDariPermintaan(req: Request): string {
  const header = req.headers.get('x-admin-token');
  if (header) return header.trim();
  try {
    const url = new URL(req.url);
    return (url.searchParams.get('token') ?? '').trim();
  } catch {
    return '';
  }
}

/**
 * Periksa izin. `env` dapat disuntik untuk pengujian.
 */
export function izinAdmin(
  req: Request,
  env: { ADMIN_TOKEN?: string } = { ADMIN_TOKEN: process.env.ADMIN_TOKEN },
): IzinAdmin {
  const diharapkan = (env.ADMIN_TOKEN ?? '').trim();
  if (!diharapkan) return { ok: false, status: 503, pesan: PESAN_KOSONG };
  const diberi = tokenDariPermintaan(req);
  if (!diberi) return { ok: false, status: 401, pesan: PESAN_SALAH };
  return samakanWaktuTetap(diberi, diharapkan)
    ? { ok: true, status: 200, pesan: 'ok' }
    : { ok: false, status: 401, pesan: PESAN_SALAH };
}
