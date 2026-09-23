import { NextRequest, NextResponse } from 'next/server';
import { izinAdmin } from '@/lib/admin-guard';
import {
  TAHAP_URUT,
  bacaAgregat,
  nolkanAgregat,
  rekapSetiap,
  ringkasTahap,
  ringkasTelemetri,
  telemetriAktif,
  tulisRekapSekarang,
} from '@/lib/ai/telemetri';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/telemetri — telemetri per tahap (NFR-07).
 *
 * Mengapa endpoint, padahal `/api/status` sudah memuat ringkasannya:
 *   1. `/api/status` menyajikan persentil; endpoint ini menyajikan juga SAMPEL
 *      MENTAH per tahap. Tanpa sampel, "p95 = 812 ms" tidak bisa diperiksa —
 *      dengannya, siapa pun (termasuk uji otomatis) bisa MENGHITUNG ULANG
 *      persentil itu dari data yang sama dan membandingkannya dengan angka yang
 *      dilaporkan sistem. Laporan yang tidak bisa diverifikasi bukan laporan.
 *   2. `?rekap=1` menulis baris `[gen_ai-rekap]` ke log SEKARANG. Ini membuat
 *      p95 per tahap bisa muncul di log kapan saja diminta — bukan hanya tiap
 *      20 permintaan — dan itulah yang diuji §6g kit uji terima.
 *   3. `?nolkan=1` mengosongkan jendela agregat, supaya operator dapat mengukur
 *      efek satu perubahan (mis. penyedia embedding baru) tanpa menunggu sampel
 *      lama keluar dari jendela.
 *
 * Dilindungi `ADMIN_TOKEN` dengan prinsip yang sama seperti endpoint admin lain:
 * FAIL-CLOSED. Telemetri tidak memuat isi pertanyaan, tetapi ia memuat pola
 * trafik internal (jumlah permintaan, kegagalan model) — bukan bahan publik.
 */
export async function GET(req: NextRequest) {
  const izin = izinAdmin(req);
  if (!izin.ok) return NextResponse.json({ status: 'error', error: izin.pesan }, { status: izin.status });

  const sp = new URL(req.url).searchParams;

  // (a) Nolkan agregat lebih dulu, bila diminta — jangan mencampur dua tindakan.
  if (sp.get('nolkan') === '1') {
    await nolkanAgregat();
  }

  const ag = await bacaAgregat();
  const ringkas = await ringkasTelemetri();

  const sampel: Record<string, { n: number; kejadian: number; ms: number[]; p50: number; p95: number; maks: number }> = {};
  for (const nama of TAHAP_URUT) {
    const sel = ag.tahap[nama];
    if (!sel) continue;
    const r = ringkasTahap(sel.sampel, sel.kejadian);
    sampel[nama] = { n: r.n, kejadian: r.kejadian, ms: sel.sampel, p50: r.p50, p95: r.p95, maks: r.maks };
  }

  // (b) Tulis baris rekap ke log atas permintaan. Baris yang dikembalikan di sini
  //     HARUS sama dengan yang masuk log — pemanggil dapat membandingkannya.
  const rekap = sp.get('rekap') === '1' ? await tulisRekapSekarang('manual-admin') : null;

  return NextResponse.json({
    status: 'ok',
    aktif: telemetriAktif(),
    jendela: ringkas.jendela,
    rekapSetiap: rekapSetiap(),
    backend: ringkas.backend,
    diperbaruiPada: ringkas.diperbaruiPada,
    logTerakhir: ringkas.logTerakhir,
    jumlah: ringkas.jumlah,
    tahap: ringkas.tahap,
    sampel,
    rekap,
    catatan: telemetriAktif()
      ? null
      : 'Telemetri dimatikan (SAPA_TELEMETRI=off). Tidak ada baris [gen_ai] yang ditulis.',
  });
}
