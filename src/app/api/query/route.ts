import { NextRequest } from 'next/server';
import { fetchSapaData, retrieveRelevant, aggregateByIndicator, getUniqueOpd, dataSourceLabel } from '@/lib/sapa-client';
import { scoreIntent, dedupIndicators, toRecordMetasFromRows, normalizeText } from '@/lib/sapa-client';
import { buildDeterministicNarasi, buildVizFromEvidence, formatAngkaPresentasi, type EvidenceItem } from '@/services/grounding';
import type { HybridResponse } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function buildEnrichedNarasi(evidence: EvidenceItem[], query: string, totalRecords: number): string {
  if (evidence.length === 0) return 'Data untuk pertanyaan ini tidak ditemukan di SAPA.';
  const top = evidence.slice(0, 3);
  const sumUnique = evidence.length;
  const opds = [...new Set(evidence.map(e => e.opd))];
  const opdLabel = opds.length === 1 ? opds[0] : `${opds.length} OPD (${opds.slice(0, 3).join('; ')}${opds.length>3?' …':''})`;
  const parts = top.map(e => {
    const tahunStr = e.tahun && /^\d{4}$/.test(e.tahun.trim()) ? e.tahun.trim() : 'tahun tidak tercantum';
    const satuanStr = e.satuan ? ` ${e.satuan}` : '';
    return `"${e.indikator}" — ${e.nilai}${satuanStr} (${e.opd}, ${tahunStr})`;
  });
  const q = query.trim().slice(0, 120);
  // Narasi dasar dari grounding (sudah 100% grounded) + konteks agregat
  const base = buildDeterministicNarasi(evidence, query);
  // Perkaya tanpa menambah angka baru: hanya merangkum evidence yang sudah ada
  if (evidence.length <= 3) return base;
  return `${base} Dari ${totalRecords.toLocaleString('id-ID')} record SAPA, topik "${q}" mencakup ${sumUnique} indikator unik dari ${opdLabel}. Tiga teratas: ${parts.join('; ')}. Selengkapnya pada visualisasi.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const queryRaw = typeof body?.query === 'string' ? body.query.trim() : (typeof body?.question === 'string' ? body.question.trim() : '');
    if (!queryRaw || queryRaw.length < 3) {
      return Response.json({ error: 'Query tidak valid (minimal 3 karakter)' }, { status: 400 });
    }

    const { records, origin } = await fetchSapaData();

    const hits = retrieveRelevant(records, queryRaw, 80);

    // Kosong → HybridResponse deterministik (agar renderer tetap konsisten)
    if (hits.length === 0) {
      const resp: HybridResponse = {
        narasi: `Tidak ditemukan data SAPA yang relevan dengan "${queryRaw}". Coba kata kunci lain yang ada di katalog: stunting, prevalensi, IPM, kemiskinan, PDRB, kopi arabika, jalan, putus sekolah, ASN. Total katalog saat ini ${records.length.toLocaleString('id-ID')} record dari ${getUniqueOpd(records).length} OPD.`,
        visualisasi: { tipe: 'none', konfigurasi: {} },
        rekomendasi: ['Perhalus kata kunci — gunakan 1–2 istilah inti (mis. "IPM" bukan "angka IPM tahun").', 'Lihat /dashboard/status untuk daftar OPD dan /dashboard/laporan untuk sebaran OPD.'],
        dataSource: dataSourceLabel(origin),
        timestamp: new Date().toISOString(),
      };
      // Kompatibilitas: tetap kirim field lama agar riwayat lama tidak pecah
      return Response.json({
        ...resp,
        answer: resp.narasi,
        source: resp.dataSource,
        count: records.length,
        matched: 0,
        results: [],
        opds: [],
        query: queryRaw,
      });
    }

    const top = hits.slice(0, 20);
    const aggregated = aggregateByIndicator(top.map(h => h.record));
    const opds = getUniqueOpd(top.map(h => h.record));

    // Evidence: agregat unik (satu baris per indikator, tahun terbaru) — 1:1 dengan KPI
    const evidence: EvidenceItem[] = aggregated.slice(0, 15).map(a => ({
      opd: a.opd,
      indikator: a.nama,
      nilai: a.nilai,
      satuan: a.satuan,
      tahun: a.tahun,
      id: a.id,
    }));

    const narasiRaw = buildEnrichedNarasi(evidence, queryRaw, records.length);

    // ─── Rekons: Kalkulasi Derivatif (Tahap 2) ───
    const topicMatch = narasiRaw.match(/untuk\s+"([^"]+)"/);
    const topic = topicMatch?.[1] ?? queryRaw;
    const recordMetas = toRecordMetasFromRows(
      evidence.map(e => [e.indikator, e.nilai, e.satuan, e.opd, e.tahun ?? '—']),
      [{ key: 'Indikator' }, { key: 'Nilai' }, { key: 'Satuan' }, { key: 'OPD' }, { key: 'Tahun' }],
    );
    const scored = scoreIntent(recordMetas, topic);
    const deduped = dedupIndicators(scored);
    // denominator KHUSUS dipantau/seluruh/pop, bukan generic "jumlah" (coba luas)
    const denominator = deduped.find((m) =>
      normalizeText(m.indikator).includes('dipantau') ||
      normalizeText(m.indikator).includes('seluruh anak balita') ||
      normalizeText(m.indikator).includes('populasi')
    );
    const primary = deduped.find((m) => normalizeText(m.indikator).includes(normalizeText(topic)));
    let derivedContext: { prevalencePct?: number; denominatorNilai?: string; denominatorLabel?: string } | undefined;
    if (denominator && primary && primary.nilai !== null && denominator.nilai !== null && denominator.nilai > 0) {
      const prevalence = (primary.nilai / denominator.nilai) * 100;
      derivedContext = {
        prevalencePct: Math.round(prevalence * 100) / 100,
        denominatorNilai: denominator.nilai.toString(),
        denominatorLabel: denominator.indikator,
      };
    }
    void derivedContext;
    const visualisasi = buildVizFromEvidence(evidence);
    const rekomendasi: string[] = [
      `Tindak lanjuti temuan "${queryRaw}" dengan OPD pengampu (${opds.slice(0,2).map(o=>o.nama).join(' / ') || 'lihat OPD pada tabel'}) untuk verifikasi data terbaru.`,
      `Bandingkan antar-tahun bila indikator multi-tahun — cek kolom Tahun pada visualisasi untuk melihat deret historis.`,
    ];

    let response: HybridResponse = {
      narasi: narasiRaw,
      visualisasi,
      rekomendasi,
      dataSource: dataSourceLabel(origin),
      timestamp: new Date().toISOString(),
    };
    response = formatAngkaPresentasi(response);

    const evidenceLegacy = top.slice(0, 8).map(h => ({
      indikator: h.record.kode_indikator_nama_indikator,
      opd: h.record.opds_nama_opd,
      variabel: h.record.variabel,
      satuan: h.record.satuan,
      tahun: h.record.tahun,
      jadwal: h.record.jadwal_pemutakhiran,
      score: h.score,
    }));

    return Response.json({
      ...response,
      // Alias kompatibilitas untuk klien lama / riwayat
      answer: response.narasi,
      source: response.dataSource,
      count: records.length,
      matched: hits.length,
      aggregated: aggregated.slice(0, 10),
      opds,
      results: evidenceLegacy,
      evidence,
      query: queryRaw,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Gagal memproses query' }, { status: 500 });
  }
}
