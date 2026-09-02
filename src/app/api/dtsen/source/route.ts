// ─── GET /api/dtsen/source — fetch DTSEN data dari sumber eksternal ───
// Mendukung fetch dari:
//   1. api-splp.layanan.go.id (API resmi Portal SDI)
//   2. Format DTSEN standar (CSV)
//   3. Format kominfo (Excel)
//   4. Format stunting (Excel)
//
// Query params:
//   ?type=aggr|katalog|preview — jenis data yang di-fetch
//   ?source=dtsen|sapa|splp|kominfo|stunting — sumber data
//   ?kecamatan=NAMA — filter kecamatan
//   ?desa=NAMA — filter desa
//   ?desil=1-3 — filter desil
//
// Role: RESTRICTED_AGGR (DTSEN_ANALYST/DTSEN_LOOKUP/SUPERADMIN) untuk aggr
// Role: RESTRICTED_PERSONAL (DTSEN_LOOKUP/SUPERADMIN) untuk data pribadi

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/auth';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { decideDataAccess } from '@/lib/data-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const DTSEN_API_KEY = process.env.DTSEN_NIK_KEY ?? '';
const SPLP_BASE_URL = 'https://api-splp.layanan.go.id';

// ─── SPLP API endpoints ───
// Endpoint DTSEN: https://api-splp.layanan.go.id/dtsen-aceh-tengah/1.0/api/dtsen-aceh-tengah?tb=data_aset&s=kecamatan&f=desil

/** Fetch data agregat DTSEN dari API SPLP */
async function fetchSplpDtsen(params: {
  kecamatan?: string;
  desa?: string;
  desil?: string;
}): Promise<{ records: Record<string, unknown>[]; source: string; fetchedAt: string }> {
  const searchParams = new URLSearchParams({
    tb: 'data_aset',
    s: params.kecamatan ?? '',
    f: params.desil ?? '',
  });
  if (params.desa) searchParams.set('desa', params.desa);

  const url = `${SPLP_BASE_URL}/dtsen-aceh-tengah/1.0/api/dtsen-aceh-tengah?${searchParams.toString()}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'cc-acehtengah/DTSEN-Source-v1',
      Authorization: `Bearer ${DTSEN_API_KEY}`,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`SPLP API error ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  return {
    records: Array.isArray(data.data) ? data.data : [data],
    source: 'splp',
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit
  const rl = await checkRateLimit({ key: `dtsen:src:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan.' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source') ?? 'splp';
  const dataType = searchParams.get('type') ?? 'aggr';
  const kecamatan = searchParams.get('kecamatan') ?? undefined;
  const desa = searchParams.get('desa') ?? undefined;
  const desil = searchParams.get('desil') ?? undefined;

  // Auth & authorization
  const admin = await getAdminFromRequest(req);
  const sensitivity: 'PUBLIC' | 'RESTRICTED_AGGR' | 'RESTRICTED_PERSONAL' =
    dataType === 'aggr' ? 'RESTRICTED_AGGR' : 'RESTRICTED_PERSONAL';
  const decision = decideDataAccess(admin?.role ?? null, sensitivity);

  if (!decision.ok) {
    return NextResponse.json(
      {
        error:
          decision.status === 401
            ? 'Login diperlukan.'
            : `Role Anda tidak berhak (${sensitivity === 'RESTRICTED_PERSONAL' ? 'butuh DTSEN_LOOKUP' : 'butuh DTSEN_ANALYST'}).`,
      },
      { status: decision.status },
    );
  }

  try {
    let result;
    switch (source) {
      case 'splp':
        result = await fetchSplpDtsen({ kecamatan, desa, desil });
        break;
      case 'dtsen':
      case 'kominfo':
      case 'stunting':
        // Untuk sumber lain, arahkan ke route import yang sudah ada
        return NextResponse.json({
          ok: true,
          message: `Gunakan POST /api/dtsen/import dengan format=${source} untuk import data ${source}.`,
          supportedFormats: ['DTSEN_CSV', 'STUNTING_XLSX', 'KOMINFO_XLSX'],
        });
      default:
        return NextResponse.json({ error: `Sumber "${source}" tidak didukung.` }, { status: 400 });
    }

    const response: Record<string, unknown> = {
      ok: true,
      source: result.source,
      dataType,
      totalRecords: result.records.length,
      fetchedAt: result.fetchedAt,
      provenance: {
        label: `DTSEN via SPLP API — ${result.fetchedAt}`,
        source: 'api-splp.layanan.go.id',
      },
    };

    if (kecamatan) response.kecamatan = kecamatan;
    if (desa) response.desa = desa;
    if (desil) response.desil = desil;

    return NextResponse.json(response);
  } catch (err) {
    console.error('[dtsen/source] fetch error:', err);
    return NextResponse.json(
      {
        error: 'Gagal mengambil data dari sumber eksternal.',
        detail: err instanceof Error ? err.message : 'Unknown',
      },
      { status: 502 },
    );
  }
}
