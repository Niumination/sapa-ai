import { NextRequest, NextResponse } from 'next/server';
import { catatUmpan, jenisSah } from '@/lib/umpan-balik';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/umpan-balik — kanal koreksi publik "lapor angka" (FR-26).
 *
 * Terbuka tanpa token (warga tidak punya token), jadi pagarnya bukan izin
 * melainkan BATAS BENTUK + KUOTA HARIAN GLOBAL:
 *   - `jenis` wajib salah satu dari daftar tetap (mencegah masukan liar);
 *   - isi teks dibersihkan dari SELURUH angka, surel, tautan, nomor telepon;
 *   - maksimum 200 laporan/hari untuk seluruh sistem (bukan per-pengguna, supaya
 *     tidak ada data pengguna yang perlu disimpan);
 *   - isi kosong setelah dibersihkan ditolak 400 (bukan disimpan sebagai sampah).
 *
 * Balasan sengaja miskin informasi: status, minggu, dan jumlah hari ini. Tidak ada
 * echo teks pengguna (mencegah pemantulan injeksi) dan tidak ada data pribadi.
 */
export async function POST(req: NextRequest) {
  let badan: unknown;
  try {
    badan = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Badan permintaan bukan JSON yang sah.' }, { status: 400 });
  }

  const obj = (badan ?? {}) as Record<string, unknown>;
  if (!jenisSah(obj.jenis)) {
    return NextResponse.json(
      { status: 'error', error: 'Jenis laporan tidak dikenali.' },
      { status: 400 },
    );
  }

  const hasil = await catatUmpan({
    jenis: obj.jenis,
    catatan: typeof obj.catatan === 'string' ? obj.catatan : undefined,
    pertanyaan: typeof obj.pertanyaan === 'string' ? obj.pertanyaan : undefined,
  });

  if (hasil.alasan === 'kosong') {
    return NextResponse.json(
      { status: 'error', error: 'Laporan kosong. Tuliskan keterangan singkat (tanpa angka) atau pilih pertanyaan yang dikoreksi.' },
      { status: 400 },
    );
  }
  if (hasil.alasan === 'kuota') {
    return NextResponse.json(
      { status: 'error', error: 'Kanal laporan sedang penuh untuk hari ini. Coba lagi besok atau hubungi OPD terkait.' },
      { status: 429 },
    );
  }

  return NextResponse.json(
    {
      status: 'ok',
      pesan: 'Terima kasih. Laporan Anda masuk daftar tinjauan tim data.',
      minggu: hasil.minggu,
    },
    { status: 201 },
  );
}
