import { NextRequest, NextResponse } from 'next/server';
import { izinAdmin } from '@/lib/admin-guard';
import { TAG_DIIZINKAN, JAM_JADWAL_UTC, barisLogSegarkan, jalankanPenyegaran, ringkasSegarkan } from '@/lib/penyegar-cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/segarkan — pemeriksa penyegaran cache (OPS-03).
 *
 * Mengapa ada endpoint, padahal penjadwal luar sudah memanggil /api/revalidate:
 *   1. MELIHAT TANPA MENYENTUH. `?periksa=1` (bawaan) menampilkan status
 *      kesegaran + riwayat penyegaran terakhir. Ini menjawab pertanyaan
 *      "apakah cache benar-benar disegarkan tiap hari?" dari dalam aplikasi,
 *      tanpa menunggu cron berikutnya.
 *   2. MENYEGARKAN SEKARANG. `?sekarang=1&tag=stats` membatalkan cache saat
 *      itu juga — mis. setelah operator memperbaiki data di SPLP dan tidak
 *      ingin menunggu jadwal 05:00 WIB.
 *   3. UJI KERING. `?sekarang=1&kering=1` memvalidasi tag dan mencatat niat,
 *      TIDAK membatalkan cache — untuk memastikan jalur ini hidup sebelum
 *      dijadwalkan.
 *
 * Dilindungi `ADMIN_TOKEN` dengan prinsip sama seperti /api/admin/celah:
 * FAIL-CLOSED. Balasan tidak pernah memuat rahasia penyegaran.
 */
export async function GET(req: NextRequest) {
  const izin = izinAdmin(req);
  if (!izin.ok) return NextResponse.json({ status: 'error', error: izin.pesan }, { status: izin.status });

  const sp = new URL(req.url).searchParams;
  const ringkas = await ringkasSegarkan();
  const dasar = {
    status: 'ok' as const,
    tagDiizinkan: [...TAG_DIIZINKAN],
    jadwalUtc: JAM_JADWAL_UTC,
    jadwalWib: `${(JAM_JADWAL_UTC + 7) % 24}:00 WIB`,
    backend: ringkas.backend,
    kesegaran: ringkas.status,
    riwayat: ringkas.riwayat.slice(-10),
    jumlahRiwayat: ringkas.riwayat.length,
  };

  if (sp.get('sekarang') === '1') {
    const hasil = await jalankanPenyegaran({
      tagDiminta: sp.getAll('tag').length > 0 ? sp.getAll('tag') : null,
      mode: 'admin',
      sumber: 'admin',
      kering: sp.get('kering') === '1',
    });
    console.log('[segarkan]', barisLogSegarkan({ entri: hasil.entri, status: hasil.status, backend: ringkas.backend }));
    if (!hasil.ok) {
      return NextResponse.json({ ...dasar, status: 'error', error: hasil.pesan, kategori: 'tag-salah' }, { status: 400 });
    }
    return NextResponse.json({
      ...dasar,
      aksi: hasil.kering ? 'kering' : 'disegarkan',
      tag: hasil.tag,
      pesan: hasil.pesan,
      durasiMs: hasil.durasiMs,
      kesegaran: hasil.status,
    });
  }

  return NextResponse.json(dasar);
}
