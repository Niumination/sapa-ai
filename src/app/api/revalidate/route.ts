import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { verifikasiAksesRevalidate } from '@/lib/revalidate-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_TAGS = new Set(['sapa-analytics', 'kpi', 'stats', 'report']);

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
      return NextResponse.json({ status: 'error', error: izin.pesan }, { status: izin.status });
    }

    // Pembatal cache yang tak dibatasi sama-sama berbahaya walau bertanda:
    // batasi percobaan per IP.
    const ip = getClientIp(req);
    const batas = await checkRateLimit({ key: `revalidate:${ip}`, limit: 20, windowMs: 60_000 });
    if (!batas.ok) {
      return NextResponse.json(
        { status: 'error', error: 'Terlalu banyak permintaan revalidate.' },
        { status: 429, headers: rateLimitHeaders(batas) },
      );
    }

    const tags: string[] = body.tags ?? (body.tag ? [body.tag] : []);
    if (tags.length === 0) {
      return NextResponse.json({ status: 'error', error: 'tag/tags required (sapa-analytics|kpi|stats|report|all)' }, { status: 400 });
    }

    const toRevalidate = tags.includes('all') ? Array.from(ALLOWED_TAGS) : tags.filter((t) => ALLOWED_TAGS.has(t));
    if (toRevalidate.length === 0) {
      return NextResponse.json({ status: 'error', error: `unknown tag. allowed: ${Array.from(ALLOWED_TAGS).join(', ')}|all` }, { status: 400 });
    }

    // Next 16 mewajibkan argumen kedua: revalidateTag(tag) tanpa profil
    // memicu peringatan "deprecated". Namun profil bawaan 'max' TIDAK boleh
    // dipakai di sini — artinya stale 5 mnt · revalidate 30 hari · expire
    // 1 tahun, yakni entri hanya ditandai basi dan MASIH BOLEH disajikan
    // selama itu. Itu bertentangan dengan kontrak repo: cache 10 menit
    // terdistribusi, dan /api/revalidate adalah pembatal KERAS.
    //
    // { expire: 0 } = kedaluwarsa SEKETIKA. Handler cache Next lalu menulis
    // expired = now (identik dengan perilaku revalidateTag(tag) satu argumen
    // yang dipakai sebelumnya), tanpa memicu peringatan deprecated.
    const BATAL_SEKETIKA = { expire: 0 };
    for (const t of toRevalidate) {
      revalidateTag(t, BATAL_SEKETIKA);
    }

    return NextResponse.json({ status: 'ok', revalidated: toRevalidate, mode: izin.mode });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: e instanceof Error ? e.message : 'Gagal revalidate' }, { status: 500 });
  }
}
