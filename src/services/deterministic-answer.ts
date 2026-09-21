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
  getSapaSummary,
  dataSourceLabel,
  type SapaRecord,
} from '@/lib/sapa-client';
import { deteksiMetaIntent } from '@/lib/intent-meta';
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
/**
 * Jawaban untuk pertanyaan tentang SKALA KATALOG (berapa OPD, berapa record,
 * sebaran tahun) — dibaca langsung dari katalog yang sedang dipegang sistem,
 * bukan lewat pencocokan kata pada nama indikator.
 *
 * Mengapa ada: tanpa cabang ini, "Berapa OPD yang melaporkan data?" dijawab
 * dengan indikator yang namanya memuat kata "laporan" (Frekuensi laporan isu
 * publik, PPKBD pencatatan & pelaporan, …) — menjawab sesuatu yang tidak
 * ditanyakan, padahal jawaban benarnya cuma pembacaan metadata katalog.
 * Semua angka di narasi diambil dari `getSapaSummary()` dan dimasukkan sebagai
 * baris evidence, sehingga invarians anti-halu tetap dipenuhi.
 */
export function buildMetaAnswer(
  intent: ReturnType<typeof deteksiMetaIntent> & object,
  query: string,
  records: SapaRecord[],
): DeterministicResult {
  const ringkas = getSapaSummary(records);
  const tahunList = ringkas.tahun.map((t) => t.trim()).sort();
  const opdUrut = [...getUniqueOpd(records)].sort((a, b) => b.jumlah - a.jumlah);
  const tahunKeJumlah = new Map<string, number>();
  let tanpaTahun = 0;
  for (const r of records) {
    const t = r.tahun?.trim();
    if (t) tahunKeJumlah.set(t, (tahunKeJumlah.get(t) ?? 0) + 1);
    else tanpaTahun += 1;
  }

  const tahunStr = tahunList.length
    ? tahunList.length === 1
      ? tahunList[0]
      : `${tahunList[0]}–${tahunList[tahunList.length - 1]}`
    : 'tidak tercantum';

  const LABEL_OPD = 'Jumlah OPD/Perangkat Daerah yang melaporkan data';
  const LABEL_RECORD = 'Jumlah record (baris data) di portal SAPA';
  const LABEL_INDIKATOR = 'Jumlah indikator unik di portal SAPA';
  const LABEL_PERIODE = 'Periode tahun data yang termuat';

  let evidence: EvidenceItem[];
  let narasi: string;

  switch (intent.jenis) {
    case 'opd': {
      // Setiap angka yang disebut narasi WAJIB punya barisnya di evidence —
      // invarians anti-halu memindai narasi terhadap nilai evidence, dan audit
      // 2026-09-21 menangkap versi pertama fungsi ini menyebut jumlah indikator
      // & tiga OPD teratas tanpa barisnya (narasi benar, tapi tak tercite).
      const teratasOpd = opdUrut.slice(0, 3);
      evidence = [
        { opd: 'Seluruh katalog SAPA', indikator: LABEL_OPD, nilai: String(ringkas.totalOpd), satuan: 'OPD', tahun: null, id: 'meta:opd' },
        { opd: 'Seluruh katalog SAPA', indikator: LABEL_RECORD, nilai: String(ringkas.totalRecords), satuan: 'record', tahun: null, id: 'meta:records' },
        { opd: 'Seluruh katalog SAPA', indikator: LABEL_INDIKATOR, nilai: String(ringkas.totalIndicators), satuan: 'indikator', tahun: null, id: 'meta:indikator' },
        // Baris periode ikut di sini karena narasinya menyebut "periode 2022–2026"
        // — tanpa baris ini, angka tahun dituding halu (terukur pada run E).
        { opd: 'Seluruh katalog SAPA', indikator: LABEL_PERIODE, nilai: tahunStr, satuan: 'tahun', tahun: null, id: 'meta:periode' },
        ...teratasOpd.map((o, i) => ({
          opd: o.nama,
          indikator: `Jumlah record OPD ${o.nama} (peringkat ${i + 1})`,
          nilai: String(o.jumlah),
          satuan: 'record',
          tahun: null,
          id: `meta:opd:${i + 1}`,
        })),
      ];
      const teratas = teratasOpd.map((o) => `${o.nama} (${o.jumlah} record)`).join('; ');
      narasi =
        `Katalog SAPA memuat ${ringkas.totalRecords.toLocaleString('id-ID')} record dari ` +
        `${ringkas.totalOpd} OPD/Perangkat Daerah yang melaporkan data, untuk ${ringkas.totalIndicators.toLocaleString('id-ID')} indikator unik ` +
        `(periode ${tahunStr}). Tiga OPD dengan record terbanyak: ${teratas}. ` +
        `Angka ini adalah keterangan tentang katalog, bukan nilai capaian kinerja.`;
      break;
    }
    case 'katalog': {
      evidence = [
        { opd: 'Seluruh katalog SAPA', indikator: LABEL_RECORD, nilai: String(ringkas.totalRecords), satuan: 'record', tahun: null, id: 'meta:records' },
        { opd: 'Seluruh katalog SAPA', indikator: LABEL_INDIKATOR, nilai: String(ringkas.totalIndicators), satuan: 'indikator', tahun: null, id: 'meta:indikator' },
        { opd: 'Seluruh katalog SAPA', indikator: LABEL_OPD, nilai: String(ringkas.totalOpd), satuan: 'OPD', tahun: null, id: 'meta:opd' },
        { opd: 'Seluruh katalog SAPA', indikator: LABEL_PERIODE, nilai: tahunStr, satuan: 'tahun', tahun: null, id: 'meta:periode' },
      ];
      narasi =
        `Portal SAPA saat ini memuat ${ringkas.totalRecords.toLocaleString('id-ID')} record ` +
        `dari ${ringkas.totalOpd} OPD/Perangkat Daerah, mencakup ${ringkas.totalIndicators.toLocaleString('id-ID')} ` +
        `indikator unik dengan periode ${tahunStr}. ` +
        `Catatan: satu indikator dapat memiliki beberapa record (per OPD atau per tahun), ` +
        `sehingga jumlah record selalu lebih besar daripada jumlah indikator.`;
      break;
    }
    case 'tahun':
    default: {
      const urutTahun = [...tahunKeJumlah.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      evidence = urutTahun.map(([t, n]) => ({
        opd: 'Seluruh katalog SAPA',
        indikator: `Jumlah record SAPA bertahun ${t}`,
        nilai: String(n),
        satuan: 'record',
        tahun: t,
        id: `meta:tahun:${t}`,
      }));
      if (tanpaTahun > 0) {
        evidence.push({
          opd: 'Seluruh katalog SAPA',
          indikator: 'Jumlah record tanpa tahun tercantum',
          nilai: String(tanpaTahun),
          satuan: 'record',
          tahun: null,
          id: 'meta:tahun:kosong',
        });
      }
      const rincian = urutTahun.map(([t, n]) => `${t}: ${n} record`).join('; ');
      narasi =
        `Sebaran record SAPA menurut tahun: ${rincian || 'tidak ada tahun tercantum'}. ` +
        (tanpaTahun > 0 ? `${tanpaTahun} record tidak mencantumkan tahun. ` : '') +
        `Total ${ringkas.totalRecords.toLocaleString('id-ID')} record dari ${ringkas.totalOpd} OPD. ` +
        `Untuk tren capaian, tanyakan indikator tertentu (mis. "tren stunting 2023–2025").`;
      break;
    }
  }

  const rekomendasi = [
    'Pertanyaan ini dijawab dari metadata katalog (bukan dari nilai capaian) — cek /dashboard/status untuk daftar OPD dan /dashboard/laporan untuk sebarannya.',
    intent.jenis === 'tahun'
      ? 'Untuk tren antar-tahun, sebutkan nama indikatornya agar sistem menampilkan deret tahun.'
      : 'Untuk angka capaian, sebut indikator dan tahunnya (mis. "prevalensi stunting 2025").',
  ];

  return {
    hits: [],
    evidence,
    aggregated: [],
    opds: [],
    response: formatAngkaPresentasi({
      narasi,
      visualisasi: { tipe: 'none', konfigurasi: {} },
      rekomendasi,
      dataSource: dataSourceLabel('splp'),
      timestamp: new Date().toISOString(),
    }),
  };
}

export function buildDeterministicAnswer(query: string, records: SapaRecord[]): DeterministicResult {
  // Gerbang niat meta di paling depan: murah, deterministik, dan mencegah
  // jawaban menyesatkan (lihat buildMetaAnswer). Bila tidak yakin → null → lanjut.
  const meta = deteksiMetaIntent(query, getUniqueOpd(records).map((o) => o.nama));
  if (meta) return buildMetaAnswer(meta, query, records);

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
