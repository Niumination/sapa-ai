import { NextResponse } from 'next/server';
import { fetchSapaData, getUniqueOpd, getUniqueIndicators } from '@/lib/sapa-client';
import { metaSemantik } from '@/services/semantik';
import { getAiRuntimeStatus } from '@/services/answer-compose';
import { ringkasTelemetri, type RingkasTahap } from '@/lib/ai/telemetri';
import { ringkasanSegarkan, ringkasSegarkan } from '@/lib/penyegar-cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export interface SystemStatus {
  /**
   * Lapis semantik (FR-12): penyedia yang dipakai, dimensi, sidik artefak, dan
   * waktu muat dingin terakhir. Operator perlu ini untuk tahu apakah jawaban
   * "tidak ditemukan" datang dari katalog yang memang kosong atau dari lapis
   * semantik yang mati.
   */
  semantik?: {
    aktif: boolean;
    penyedia: 'hash' | 'remote';
    dim: number;
    pembangunanTerakhir: { durasiMs: number; jumlahRecord: number; penyedia: 'hash' | 'remote' } | null;
    sidik: string | null;
    catatan: string | null;
  };
  /**
   * NFR-07: telemetri per tahap. Angka di sini adalah p50/p95 dari jendela
   * sampel terakhir — bukan rata-rata seluruh riwayat, karena tujuan pertanyaan
   * operasional selalu "SEKARANG lambat di mana", bukan "rata-rata sejak kapan".
   */
  /**
   * OPS-03: kesegaran cache. Sebelum ini tidak ada cara melihat kapan cache
   * terakhir disegarkan — bila penjadwal mati, situs menyajikan data basi
   * tanpa satu pun sinyal. `terlewat` = jadwal harian sudah terlewat lebih dari
   * satu jam, jadi itu bukti penjadwal berhenti, bukan sekadar data lama.
   */
  segarkanCache?: Record<string, unknown>;
  telemetri?: {
    aktif: boolean;
    jendela: number;
    rekapSetiap: number;
    tahap: Record<string, RingkasTahap>;
    jumlah: {
      permintaan: number;
      tahapLengkap: number;
      modelDipanggil: number;
      modelGagal: number;
      tanpaBukti: number;
      fallback: number;
    };
    backend: string;
    diperbaruiPada: string | null;
    logTerakhir: { waktu: string; totalMs: number } | null;
  };
  /** records = jumlah baris katalog; opd = jumlah OPD unik (dipakai uji meta & pemantauan). */
  sapa: { state: 'active' | 'down'; records: number; opd: number; indikator?: number };
  ai: {
    /** active = narasi AI dikirim ke pengguna; shadow = dievaluasi saja; inactive = deterministik. */
    state: 'active' | 'shadow' | 'inactive';
    provider: string | null;
    model: string | null;
    reason: string | null;
    dailyUsed: number;
    /** false = penyedia model tidak menjawab (kredensial/langganan/kuota), walau env terisi. */
    reachable?: boolean;
    /** Rincian kesehatan penyedia dari circuit breaker. */
    health?: {
      state: 'sehat' | 'terbuka';
      reachable: boolean;
      sebab: string | null;
      pesan: string | null;
      gagalBerturut: number;
      sisaDetik: number;
      dibukaPada: string | null;
      berhasilTerakhir: string | null;
      backend: 'redis' | 'memory';
    };
    /** State toggle admin — menang atas env. backend='memory' berarti toggle tidak global. */
    toggles?: {
      aiEnabled: boolean;
      detEnabled: boolean;
      backend: 'redis' | 'memory';
      updatedAt: string;
    };
    metrics?: {
      deterministicToday: number;
      llmToday: number;
      ratio: { deterministic: number; llm: number };
    };
  };
}

/**
 * Status sistem jujur untuk sidebar & halaman status.
 * - SAPA: active bila SPLP bisa diambil (memakai LRU yang sama dengan /api/query).
 * - AI: state dihitung dari env yang nyata (bukan konstanta hardcode), plus alasan
 *   bila nonaktif — supaya operator tahu persis apa yang kurang.
 */
export async function GET() {
  const status: SystemStatus = {
    sapa: { state: 'down', records: 0, opd: 0 },
    ai: { state: 'inactive', provider: null, model: null, reason: null, dailyUsed: 0 },
  };

  const [sapa, ai, telemetri, segarkan] = await Promise.all([
    fetchSapaData()
      .then(({ records }) => ({
        state: 'active' as const,
        records: records.length,
        opd: getUniqueOpd(records).length,
        indikator: getUniqueIndicators(records).length,
      }))
      .catch(() => ({ state: 'down' as const, records: 0, opd: 0 })),
    getAiRuntimeStatus().catch(() => null),
    ringkasTelemetri().catch(() => null),
    ringkasSegarkan()
      .then((r) => ringkasanSegarkan(r.status))
      .catch(() => null),
  ]);

  status.sapa = sapa;
  if (ai) status.ai = ai;
  status.semantik = metaSemantik();
  if (telemetri) status.telemetri = telemetri;
  if (segarkan) status.segarkanCache = segarkan;
  return NextResponse.json(status);
}
