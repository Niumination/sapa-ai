import { NextRequest, NextResponse } from 'next/server';
import { izinAdmin } from '@/lib/admin-guard';
import { ambilCelah, kunciMinggu, pilihanMinggu } from '@/lib/insight-celah';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/celah — daftar celah pengetahuan (FR-27).
 *
 * Dilindungi `ADMIN_TOKEN` (fail-closed; lihat admin-guard.ts). Mengembalikan
 * pertanyaan yang TIDAK berhasil dilayani sistem pada satu minggu, terurut dari
 * yang paling sering — bahan kerja untuk menambah sinonim, indikator, atau
 * meminta data ke OPD.
 *
 * Sengaja TIDAK memuat IP, id pengguna, atau waktu-per-kejadian: yang tersimpan
 * hanya pertanyaan (sudah dibersihkan dari angka & identitas), jumlah, sebab,
 * dan waktu terakhir.
 */
export async function GET(req: NextRequest) {
  const izin = izinAdmin(req);
  if (!izin.ok) return NextResponse.json({ status: 'error', error: izin.pesan }, { status: izin.status });

  const diminta = new URL(req.url).searchParams.get('minggu')?.trim();
  // Hanya minggu yang bentuknya sah dan wajar (tidak menerima sembarang kunci).
  const minggu = diminta && /^\d{4}-W\d{2}$/.test(diminta) ? diminta : kunciMinggu();

  const ringkas = await ambilCelah(minggu);
  return NextResponse.json({
    status: 'ok',
    minggu: ringkas.minggu,
    total: ringkas.total,
    jumlahEntri: ringkas.item.length,
    backend: ringkas.backend,
    pilihanMinggu: pilihanMinggu(8),
    item: ringkas.item.slice(0, 100),
  });
}
