import { NextResponse } from 'next/server';
import { fetchSapaData, getUniqueOpd, getUniqueIndicators } from '@/lib/sapa-client';
import { metaSemantik } from '@/services/semantik';
import { getAiRuntimeStatus } from '@/services/answer-compose';
import { ringkasTelemetri, type RingkasTahap } from '@/lib/ai/telemetri';
import { ringkasanSegarkan, ringkasSegarkan } from '@/lib/penyegar-cache';
import { nilaiKesegaran, type BahanKesegaran, type NilaiKesegaran } from '@/lib/kesegaran';

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
  /**
   * P3: alarm kesegaran data. Menjawab satu pertanyaan yang sebelumnya tidak
   * punya tempat: "apakah angka yang sedang disajikan sudah terlalu tua?" —
   * dari dua sebab yang berbeda (tarikan lama & tahun katalog tertinggal),
   * ditambah sinyal jadwal penyegaran OPS-03. `tingkat` bisa `tak-diketahui`,
   * dan itu memang jawaban yang benar bila tidak ada bahan.
   */
  kesegaranData?: NilaiKesegaran;
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

  // P3: bahan kesegaran dikumpulkan dari tarikan yang SAMA (tidak ada tarikan
  // kedua). Disimpan di variabel terpisah, bukan di dalam `sapa`, supaya bentuk
  // balasan `/api/status` tidak berubah karena urusan internal ini.
  let bahanKesegaran: BahanKesegaran = {};

  const [sapa, ai, telemetri, segarkan] = await Promise.all([
    fetchSapaData()
      .then(({ records, meta }) => {
        const diambilPada =
          meta && typeof meta.diambilPada === 'string' ? meta.diambilPada : null;
        bahanKesegaran = { diambilPada, tahunData: records.map((r) => r.tahun) };
        return {
          state: 'active' as const,
          records: records.length,
          opd: getUniqueOpd(records).length,
          indikator: getUniqueIndicators(records).length,
        };
      })
      .catch(() => ({ state: 'down' as const, records: 0, opd: 0 })),
    getAiRuntimeStatus().catch(() => null),
    ringkasTelemetri().catch(() => null),
    ringkasSegarkan()
      .then((r) => ringkasanSegarkan(r.status))
      .catch(() => null),
  ]);

  status.sapa = sapa;
  // P3: kesegaran data dinilai SETELAH penyegaran diketahui, karena jadwal yang
  // terlewat (OPS-03) adalah salah satu sebabnya. Bila SPLP tidak bisa dihubungi
  // sama sekali, penilaian tetap dilakukan dengan bahan yang ada — dan bila
  // bahan tidak ada sama sekali, jawabannya `tak-diketahui`, bukan `segar`.
  // "Jadwal terlewat" HANYA berlaku bila penjadwal memang pernah berjalan pada
  // instance ini (`terakhirMs` terisi). Instance baru yang belum pernah
  // disegarkan bukan "terlewat" — ia "belum pernah", dan menyebutnya terlewat
  // membuat alarm berbunyi pada setiap instance baru; alarm yang selalu
  // berbunyi adalah alarm yang diabaikan orang. Ditemukan oleh
  // `scripts/uji-kesegaran.mjs` pada percobaan pertama.
  const segarkanRingkas = segarkan as { terlewat?: boolean; terakhirMs?: number | null } | null;
  status.kesegaranData = nilaiKesegaran({
    ...bahanKesegaran,
    penyegaranTerlewat: Boolean(segarkanRingkas?.terlewat && segarkanRingkas?.terakhirMs),
  });
  if (ai) status.ai = ai;
  status.semantik = metaSemantik();
  if (telemetri) status.telemetri = telemetri;
  if (segarkan) status.segarkanCache = segarkan;
  return NextResponse.json(status);
}
