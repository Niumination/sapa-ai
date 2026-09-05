// ─── Jawaban deterministik — diekstrak dari /api/query (reviu 2026-09-04) ───
// Dipisah agar /api/query, /api/query/stream, dan mode shadow AI memakai SATU
// jalur yang sama persis. Tidak ada fetch, LLM, atau angka karangan: narasi hanya
// merangkum evidence yang benar-benar ditemukan di SAPA.

import {
  retrieveRelevant,
  konsepTidakDikenal,
  konsepTakTermuat,
  extractYears,
  aggregateByIndicator,
  getUniqueOpd,
  dataSourceLabel,
  type SapaRecord,
} from '@/lib/sapa-client';
import {
  buildDeterministicNarasi,
  buildVizFromEvidence,
  formatAngkaPresentasi,
  type EvidenceItem,
} from '@/services/grounding';
import type { HybridResponse } from '@/types';

export const MAX_EVIDENCE = 20;

/** Narasi deterministik + konteks agregat (tanpa menambah angka baru). */
export function buildEnrichedNarasi(evidence: EvidenceItem[], query: string, totalRecords: number): string {
  if (evidence.length === 0) return 'Data untuk pertanyaan ini tidak ditemukan di SAPA.';
  const top = evidence.slice(0, 3);
  const sumUnique = evidence.length;
  const opds = [...new Set(evidence.map((e) => e.opd))];
  const opdLabel =
    opds.length === 1 ? opds[0] : `${opds.length} OPD (${opds.slice(0, 3).join('; ')}${opds.length > 3 ? ' …' : ''})`;
  const parts = top.map((e) => {
    const tahunStr = e.tahun && /^\d{4}$/.test(e.tahun.trim()) ? e.tahun.trim() : 'tahun tidak tercantum';
    const satuanStr = e.satuan ? ` ${e.satuan}` : '';
    return `"${e.indikator}" — ${e.nilai}${satuanStr} (${e.opd}, ${tahunStr})`;
  });
  const q = query.trim().slice(0, 120);
  const base = buildDeterministicNarasi(evidence, query);
  if (evidence.length <= 3) return base;
  return `${base} Dari ${totalRecords.toLocaleString('id-ID')} record SAPA, topik "${q}" mencakup ${sumUnique} indikator unik dari ${opdLabel}. Tiga teratas: ${parts.join('; ')}. Selengkapnya pada visualisasi.`;
}

export interface DeterministicResult {
  hits: ReturnType<typeof retrieveRelevant>;
  evidence: EvidenceItem[];
  aggregated: ReturnType<typeof aggregateByIndicator>;
  opds: ReturnType<typeof getUniqueOpd>;
  response: HybridResponse;
}

/**
 * Susun jawaban deterministik lengkap (narasi + visualisasi + rekomendasi).
 * `records` = seluruh katalog SAPA; retrieval dilakukan di sini agar satu pintu.
 */
export function buildDeterministicAnswer(query: string, records: SapaRecord[]): DeterministicResult {
  const hits = retrieveRelevant(records, query, 80);

  if (hits.length === 0) {
    // Jelaskan KENAPA kosong: sebut kata kunci yang tidak pernah tercatat di
    // SAPA (bila ada). Ini keterangan tentang pertanyaannya sendiri — bukan
    // tebakan isi data.
    const asing = konsepTidakDikenal(records, query).slice(0, 3);
    const sebabAsing = asing.length
      ? ' Kata kunci ' + asing.map((k) => '"' + k + '"').join(', ') +
        ' tidak terdapat pada satu pun indikator di katalog SAPA.'
      : '';
    const narasi =
      `Tidak ditemukan data SAPA yang relevan dengan "${query}". ` +
      sebabAsing +
      `Coba kata kunci lain yang ada di katalog: stunting, prevalensi, IPM, kemiskinan, PDRB, kopi arabika, jalan, putus sekolah, ASN. ` +
      `Total katalog saat ini ${records.length.toLocaleString('id-ID')} record dari ${getUniqueOpd(records).length} OPD.`;
    return {
      hits,
      evidence: [],
      aggregated: [],
      opds: [],
      response: {
        narasi,
        visualisasi: { tipe: 'none', konfigurasi: {} },
        rekomendasi: [
          'Perhalus kata kunci — gunakan 1–2 istilah inti (mis. "IPM" bukan "angka IPM tahun").',
          'Lihat /dashboard/status untuk daftar OPD dan /dashboard/laporan untuk sebaran OPD.',
        ],
        dataSource: dataSourceLabel('splp'),
        timestamp: new Date().toISOString(),
      },
    };
  }

  const top = hits.slice(0, MAX_EVIDENCE);
  // Urutan evidence = relevansi retrieval (T-12): dulu diurutkan ulang
  // berdasarkan nilai terbesar, sehingga yang tampil di atas sering bukan
  // yang ditanyakan ("jalan kabupaten" → Drainase 16.027 mengalahkan
  // Jalan Kabupaten 399,37 hanya karena… tidak, justru karena nilainya
  // lebih besar di mata agregator lama).
  const aggregated = aggregateByIndicator(top.map((h) => h.record), { urut: 'relevansi' });
  const opds = getUniqueOpd(top.map((h) => h.record));

  // Kanonikalisasi: satu baris per indikator, buang duplikat nilai+satuan+OPD
  // (reviu T-11: "Jumlah Balita Stunting 730" vs "…(JAB(5) P stunting) 730").
  const seen = new Map<string, EvidenceItem>();
  for (const a of aggregated) {
    const key = `${a.nilai}|${a.satuan}|${a.opd}`;
    const existing = seen.get(key);
    // Pertahankan yang punya tahun; bila sama-sama punya, pilih nama lebih spesifik.
    const better =
      !existing ||
      (!existing.tahun && a.tahun) ||
      (!!existing.tahun === !!a.tahun && a.nama.length > existing.indikator.length);
    if (better) {
      seen.set(key, { opd: a.opd, indikator: a.nama, nilai: a.nilai, satuan: a.satuan, tahun: a.tahun, id: a.id });
    }
  }
  const evidence: EvidenceItem[] = [...seen.values()].slice(0, 15);

  const narasiRaw = buildEnrichedNarasi(evidence, query, records.length);
  // Jujur soal tahun: bila pertanyaan menyebut tahun tertentu dan tidak satu
  // pun evidence bertahun itu (atau tanpa tahun), katakan terus terang —
  // jangan biarkan angka tahun lain terbaca sebagai jawaban atas tahun itu.
  const tahunDiminta = extractYears(query);
  const tahunAda = evidence.some((e) => e.tahun && tahunDiminta.includes(e.tahun.trim()));
  const peringatanTahun =
    tahunDiminta.length && !tahunAda
      ? `Tidak ada data untuk tahun ${tahunDiminta.join(', ')} di SAPA. `
      : '';
  // Jujur soal kecocokan parsial: bila SAPA punya data tentang sebuah kata
  // kunci tetapi TIDAK ada indikator yang menggabungkannya dengan kata kunci
  // lain, katakan terus terang sebelum menampilkan indikator terdekat.
  // Tanpa ini, "harga beras" dijawab dengan "penyaluran beras" seolah-olah
  // itu jawaban atas pertanyaan harga.
  const kurangKonsep = konsepTakTermuat(records, hits[0].record, query).slice(0, 3);
  const peringatanKonsep = kurangKonsep.length
    ? 'Tidak ada data SAPA yang memuat seluruh kata kunci sekaligus — ' +
      'tidak ada indikator yang memuat ' +
      kurangKonsep.map((k) => '"' + k + '"').join(', ') +
      ' bersama kata kunci lainnya. Berikut indikator terdekat. '
    : '';
  const visualisasi = buildVizFromEvidence(evidence);
  const rekomendasi: string[] = [
    `Tindak lanjuti temuan "${query}" dengan OPD pengampu (${opds.slice(0, 2).map((o) => o.nama).join(' / ') || 'lihat OPD pada tabel'}) untuk verifikasi data terbaru.`,
    'Bandingkan antar-tahun bila indikator multi-tahun — cek kolom Tahun pada visualisasi untuk melihat deret historis.',
  ];

  const response = formatAngkaPresentasi({
    narasi: peringatanTahun + peringatanKonsep + narasiRaw,
    visualisasi,
    rekomendasi,
    dataSource: dataSourceLabel('splp'),
    timestamp: new Date().toISOString(),
  });

  return { hits, evidence, aggregated, opds, response };
}
