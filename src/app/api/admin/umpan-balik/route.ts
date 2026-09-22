import { NextRequest, NextResponse } from 'next/server';
import { izinAdmin } from '@/lib/admin-guard';
import { ambilUmpan, pilihanMinggu } from '@/lib/umpan-balik';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/umpan-balik — daftar laporan koreksi warga (FR-26).
 *
 * Dilindungi `ADMIN_TOKEN` dengan aturan yang sama seperti celah pengetahuan
 * (fail-closed: tanpa token yang diset, endpoint menolak 503 alih-alih membuka).
 * Isinya sudah bersih dari identitas: hanya jenis, teks tanpa angka, jumlah, dan
 * waktu terakhir.
 */
export async function GET(req: NextRequest) {
  const izin = izinAdmin(req);
  if (!izin.ok) return NextResponse.json({ status: 'error', error: izin.pesan }, { status: izin.status });

  const diminta = new URL(req.url).searchParams.get('minggu')?.trim();
  const minggu = diminta && /^\d{4}-W\d{2}$/.test(diminta) ? diminta : undefined;

  const ringkas = await ambilUmpan(minggu);
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
