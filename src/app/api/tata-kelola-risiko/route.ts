import { NextResponse } from 'next/server';
import { REGISTER_RISIKO, ringkasRegister, tingkatRisiko } from '@/lib/tata-kelola-risiko';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/tata-kelola-risiko — register risiko AI (CMP-03) dalam bentuk mesin.
 *
 * Dipakai halaman `/tata-kelola-risiko` dan uji otomatis (`scripts/uji-tata-kelola.mjs`,
 * yang juga memeriksa bahwa setiap rujukan bukti benar-benar ada di repositori).
 * Tidak ada kredensial di sini: seluruh isinya memang untuk dibaca.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    ...ringkasRegister(),
    item: REGISTER_RISIKO.map((r) => ({
      ...r,
      tingkat: tingkatRisiko(r.kemungkinan, r.dampak),
    })),
  });
}
