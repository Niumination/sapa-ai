import { NextResponse } from 'next/server';
import { getAiConfig } from '@/lib/ai/env';
import { pengungkapanAi } from '@/lib/keterbukaan-ai';
import { getAiRuntimeStatus } from '@/services/answer-compose';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/keterbukaan — keterbukaan penggunaan AI dalam bentuk mesin (CMP-02).
 *
 * Dipakai halaman `/keterbukaan` dan uji otomatis. Isinya SAMA dengan yang dilihat
 * pengguna karena keduanya memanggil `pengungkapanAi()`; tidak ada teks kedua yang
 * bisa menyimpang.
 *
 * Keadaan AI diambil dari status runtime yang nyata (env + saklar admin + hasil
 * panggilan terakhir), bukan dari konstanta: bila AI mati, endpoint ini WAJIB
 * melaporkan mati.
 */
export async function GET() {
  const status = await getAiRuntimeStatus().catch(() => null);
  const cfg = getAiConfig();

  let hosPenyedia: string | null = null;
  try {
    hosPenyedia = cfg.baseUrl ? new URL(cfg.baseUrl).host : null;
  } catch {
    hosPenyedia = null;
  }

  const keterbukaan = pengungkapanAi(
    status
      ? {
          keadaan: status.state === 'active' ? 'aktif' : status.state === 'shadow' ? 'bayangan' : 'mati',
          penyedia: status.provider ?? null,
          model: status.model ?? null,
          hosPenyedia,
          alasan: status.reason ?? null,
          terjangkau: status.reachable ?? null,
          gagalBerturut: status.health?.gagalBerturut ?? 0,
          sebabTerakhir: status.health?.sebab ?? null,
          saklarAi: status.toggles?.aiEnabled ?? true,
        }
      : null,
  );

  return NextResponse.json({
    status: 'ok',
    versi: keterbukaan.versi,
    ditinjauPada: keterbukaan.ditinjauPada,
    tinjauanBerikutnya: keterbukaan.tinjauanBerikutnya,
    keadaanAi: keterbukaan.ringkas.keadaan,
    penyedia: keterbukaan.ringkas.penyedia,
    model: keterbukaan.ringkas.model,
    hosPenyedia: keterbukaan.ringkas.hosPenyedia,
    alasan: keterbukaan.ringkas.alasan,
    terjangkau: keterbukaan.ringkas.terjangkau,
    gagalBerturut: keterbukaan.ringkas.gagalBerturut,
    sebabTerakhir: keterbukaan.ringkas.sebabTerakhir,
    kalimatKeadaan: keterbukaan.kalimatKeadaan,
    bagian: keterbukaan.bagian,
    pemetaanNotis: keterbukaan.pemetaanNotis,
    // Kalimat notis per jawaban yang AKAN dilihat pengguna untuk tiap keadaan
    // metadata — dipublikasikan agar dapat diperiksa mesin (uji otomatis).
    notisPerJawaban: keterbukaan.notisPerJawaban,
    kanal: {
      laporAngka: '/api/umpan-balik',
      tinjauan: '/admin/umpan-balik',
      status: '/api/status',
      saklar: '/admin/ai-toggle',
    },
  });
}
