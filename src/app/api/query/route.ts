import { NextRequest } from 'next/server';
import { fetchSapaData, retrieveRelevant, aggregateByIndicator, getUniqueOpd } from '@/lib/sapa-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const queryRaw = typeof body?.query === 'string' ? body.query.trim() : (typeof body?.question === 'string' ? body.question.trim() : '');
    if (!queryRaw || queryRaw.length < 3) {
      return Response.json({ error: 'Query tidak valid (minimal 3 karakter)' }, { status: 400 });
    }

    const { records } = await fetchSapaData();

    // Retrieval v2: word-boundary + stemming + sinonim
    const hits = retrieveRelevant(records, queryRaw, 80);

    if (hits.length === 0) {
      return Response.json({
        answer: `Tidak ditemukan data SAPA yang relevan dengan "${queryRaw}". Coba kata kunci lain seperti: stunting, kemiskinan, IPM, inflasi, pendidikan, kesehatan, PDRB, pariwisata.`,
        source: 'SAPA SPLP',
        count: records.length,
        matched: 0,
        results: [],
        opds: [],
      });
    }

    const top = hits.slice(0, 20);
    const aggregated = aggregateByIndicator(top.map(h => h.record));
    const opds = getUniqueOpd(top.map(h => h.record));

    // Narasi deterministik
    const topInd = aggregated[0];
    const summary = topInd
      ? `Ditemukan ${hits.length} data relevan untuk "${queryRaw}". Teratas: "${topInd.nama}" (${topInd.opd}) — ${topInd.nilai} ${topInd.satuan} (tahun ${topInd.tahun || '—'}).`
      : `Ditemukan ${hits.length} data relevan untuk "${queryRaw}".`;

    // Evidence: top 8 untuk visualisasi
    const evidence = top.slice(0, 8).map(h => ({
      indikator: h.record.kode_indikator_nama_indikator,
      opd: h.record.opds_nama_opd,
      variabel: h.record.variabel,
      satuan: h.record.satuan,
      tahun: h.record.tahun,
      jadwal: h.record.jadwal_pemutakhiran,
      score: h.score,
    }));

    return Response.json({
      answer: summary,
      source: 'SAPA SPLP',
      count: records.length,
      matched: hits.length,
      aggregated: aggregated.slice(0, 10),
      opds,
      results: evidence,
      query: queryRaw,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Gagal memproses query' }, { status: 500 });
  }
}
