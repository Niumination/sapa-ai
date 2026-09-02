import { NextResponse } from 'next/server';
import { fetchSapaData, SapaRecord } from '@/lib/sapa-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface KpiItem {
  id: string;
  label: string;
  icon: string;
  indikator: string;
  opd: string;
  nilai: string;
  satuan: string;
  tahun: string | null;
  deltaPct: number | null;
  deltaDir: 'up' | 'down' | 'flat' | null;
}

export async function GET() {
  try {
    const { records } = await fetchSapaData();

    // Mapping indikator prioritas SAPA Aceh Tengah
    const curatedKeys = [
      { pattern: /stunting|balita pendek/i, label: 'Stunting', icon: '👶' },
      { pattern: /kemiskinan|penduduk miskin/i, label: 'Kemiskinan', icon: '📉' },
      { pattern: /ipm|pembangunan manusia/i, label: 'IPM', icon: '📈' },
      { pattern: /pengangguran|tpt/i, label: 'Pengangguran', icon: '💼' },
      { pattern: /inflasi|ihk/i, label: 'Inflasi', icon: '🏷️' },
      { pattern: /pertumbuhan ekonomi|pdrb/i, label: 'Ekonomi', icon: '💰' },
      { pattern: /pendidikan|harapan lama sekolah/i, label: 'Pendidikan', icon: '🎓' },
      { pattern: /kesehatan|usia harapan hidup/i, label: 'Kesehatan', icon: '🏥' },
    ];

    const kpis: KpiItem[] = [];

    for (const key of curatedKeys) {
      const match = records.find((r: SapaRecord) =>
        key.pattern.test(r.kode_indikator_nama_indikator || '')
      );

      if (match) {
        kpis.push({
          id: String(match.id),
          label: key.label,
          icon: key.icon,
          indikator: match.kode_indikator_nama_indikator || key.label,
          opd: match.opds_nama_opd || 'Pemerintah Kab. Aceh Tengah',
          nilai: match.variabel || '—',
          satuan: match.satuan || '%',
          tahun: match.tahun ? String(match.tahun) : '2025',
          deltaPct: null,
          deltaDir: null,
        });
      }
    }

    // Jika filter matching kosong, fallback ke ringkasan agregat SAPA
    if (kpis.length === 0 && records.length > 0) {
      kpis.push({
        id: 'total-indikator',
        label: 'Total Indikator',
        icon: '📊',
        indikator: 'Total Dataset & Indikator SAPA',
        opd: 'Diskominfo Aceh Tengah',
        nilai: String(records.length),
        satuan: 'Indikator',
        tahun: '2025',
        deltaPct: null,
        deltaDir: null,
      });
    }

    return NextResponse.json({
      status: 'ok',
      source: 'SAPA SPLP',
      kpis,
    });
  } catch (e) {
    return NextResponse.json(
      { status: 'error', error: e instanceof Error ? e.message : 'Gagal' },
      { status: 500 }
    );
  }
}
