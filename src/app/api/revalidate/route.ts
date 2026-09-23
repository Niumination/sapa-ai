import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { verifikasiAksesRevalidate } from '@/lib/revalidate-guard';
import {
  TAG_DIIZINKAN,
  barisLogSegarkan,
  catatKegagalanSegarkan,
  jalankanPenyegaran,
  nilaiBalasan,
} from '@/lib/penyegar-cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/revalidate — pembatal cache bertag (OPS-03).
 *
 * Pagar akses TIDAK berubah sejak perbaikan 21 Sep 2026 (fail-closed tanpa
 * REVALIDATE_SECRET di produksi). Yang ditambahkan OPS-03:
 *   1. jalur tunggal `jalankanPenyegaran` (tag divalidasi + dicatat), sehingga
 *      /api/admin/segarkan dan penjadwal luar tidak bisa menyimpang;
 *   2. pembukuan waktu/tag/mode/hasil → "cache segar harian" menjadi terukur;
 *   3. baris log `[segarkan]` berisi kategori yang bisa ditindaklanjuti;
 *   4. kategori kegagalan pada balasan (bukan sekadar "error"), sehingga
 *      penjadwal luar dapat memberi tahu PENYEBABNYA, bukan hanya bahwa gagal.
 *
 * RAHASIA TIDAK PERNAH DICATAT: log dan pembukuan hanya memuat tag, mode,
 * sumber (dari header x-segarkan-sumber), dan durasi.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { tag?: string; tags?: string[]; secret?: string };

    // Pagar akses: fail-closed di produksi tanpa REVALIDATE_SECRET.
    // (Terukur 2026-09-21: tanpa secret, POST anonim membatalkan seluruh cache.)
    const izin = verifikasiAksesRevalidate({
      secretEnv: process.env.REVALIDATE_SECRET,
      headerSecret: req.headers.get('x-revalidate-secret'),
      bodySecret: body.secret,
      allowUnsigned: process.env.REVALIDATE_ALLOW_UNSIGNED,
    });
    if (!izin.ok) {
      const nilai = nilaiBalasan(izin.status, { error: izin.pesan });
      // Kegagalan sisi-server (endpoint tertutup karena rahasia belum diset)
      // DICATAT: itu kesalahan konfigurasi kita, bukan serangan, dan justru
      // inilah yang harus sampai ke operator. Kegagalan 401 tidak dicatat ke
      // penyimpanan bersama — jalur itu bisa dipanggil anonim, dan menulis
      // untuk setiap percobaan akan membuatnya jadi alat pemborosan kuota.
      if (nilai.kategori === 'endpoint-tertutup') {
        const status = await catatKegagalanSegarkan('endpoint-tertutup', {
          mode: 'tertutup',
          sumber: sumberSegarkan(req),
        });
        console.log('[segarkan]', barisLogSegarkan({ entri: null, status, backend: 'server' }));
      } else {
        console.log(
          '[segarkan]',
          JSON.stringify({ waktu: new Date().toISOString(), kategori: nilai.kategori, sumber: sumberSegarkan(req) }),
        );
      }
      return NextResponse.json({ status: 'error', error: izin.pesan, kategori: nilai.kategori }, { status: izin.status });
    }

    // Pembatal cache yang tak dibatasi sama-sama berbahaya walau bertanda:
    // batasi percobaan per IP.
    const ip = getClientIp(req);
    const batas = await checkRateLimit({ key: `revalidate:${ip}`, limit: 20, windowMs: 60_000 });
    if (!batas.ok) {
      console.log('[segarkan]', JSON.stringify({ waktu: new Date().toISOString(), kategori: 'dibatasi', sumber: sumberSegarkan(req) }));
      return NextResponse.json(
        { status: 'error', error: 'Terlalu banyak permintaan revalidate.', kategori: 'dibatasi' },
        { status: 429, headers: rateLimitHeaders(batas) },
      );
    }

    const hasil = await jalankanPenyegaran({
      tagDiminta: body.tags ?? body.tag,
      mode: izin.mode,
      sumber: sumberSegarkan(req),
    });

    if (!hasil.ok) {
      return NextResponse.json(
        { status: 'error', error: hasil.pesan, kategori: 'tag-salah', diizinkan: [...TAG_DIIZINKAN] },
        { status: 400 },
      );
    }

    console.log('[segarkan]', barisLogSegarkan({ entri: hasil.entri, status: hasil.status, backend: 'server' }));

    return NextResponse.json({
      status: 'ok',
      revalidated: hasil.tag,
      mode: izin.mode,
      kategori: 'ok',
      durasiMs: hasil.durasiMs,
      segarkan: {
        terakhirMs: hasil.status.terakhirMs,
        umurJam: hasil.status.umurJam,
        segar: hasil.status.segar,
        berikutnyaMs: hasil.status.berikutnyaMs,
      },
    });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: e instanceof Error ? e.message : 'Gagal revalidate' }, { status: 500 });
  }
}

/**
 * Sumber penyegaran: penanda dari penjadwal (header x-segarkan-sumber),
 * disaring menjadi token pendek. Tujuannya agar operator dapat membedakan
 * penyegaran dari penjadwal, dari operator, atau dari uji — tanpa menerima
 * sembarang teks dari jaringan ke dalam penyimpanan.
 */
function sumberSegarkan(req: Request): string {
  const mentah = req.headers.get('x-segarkan-sumber') ?? '';
  const bersih = mentah.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return bersih.slice(0, 32) || 'tanpa-penanda';
}
