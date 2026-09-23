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
  mintaRincianPerDesa,
  granularitasTidakTersedia,
  type SapaRecord,
} from '@/lib/sapa-client';
import { retrieveDenganSemantik, punyaJangkarIsi } from '@/services/semantik';
import { deteksiMetaIntent, deteksiNiat } from '@/lib/intent-meta';
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
  /**
   * Peringatan WAJIB yang lahir dari perhitungan, bukan dari model:
   * tahun yang diminta tidak ada, atau kata kunci tidak pernah muncul bersama.
   *
   * Mengapa diekspos: terukur 21 Sep 2026 pada penyedia tiruan — saat AI aktif,
   * narasinya menggantikan narasi deterministik **beserta peringatannya**, jadi
   * jawaban terlihat lebih rapi tetapi MENYEMBUNYIKAN keterbatasan data
   * ("Tidak ada data untuk tahun 2025" hilang, padahal pengguna menanyakannya).
   * Peringatan tidak boleh menjadi tanggung jawab model; ia harus dibawa sebagai
   * data dan diverifikasi ulang setelah model selesai.
   */
  peringatan: string[];
  /**
   * FR-20: fakta-fakta yang dibutuhkan pengklasifikasi sebab. Sengaja fakta
   * MENTAH (jalur, jumlah bukti, kata asing, skor makna tertinggal) — bukan tag
   * sebab — supaya keputusan "ini gagal karena apa" berada di satu tempat
   * (`sebab-kegagalan.ts`) dan tidak tersebar di banyak `return`.
   */
  diagnosa: FaktaRetrieval;
}

/** Fakta lapis retrieval untuk klasifikasi sebab (FR-20). */
export interface FaktaRetrieval {
  jalur: 'leksikal' | 'leksikal+sisipan' | 'semantik' | 'kosong' | 'meta' | 'sistem';
  jumlahBukti: number;
  konsepAsing: string[];
  /** Skor makna teratas yang DITOLAK ambang (dananya jalur semantik kosong). */
  skorSemantik?: number;
  /** Kandidat yang lolos ambang tetapi ditolak karena tanpa jangkar isi (FR-20). */
  ditolakTanpaJangkar?: number;
  mintaPerDesa: boolean;
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
    peringatan: [],
    // Dijawab dari METADATA katalog — jalurnya dilaporkan apa adanya supaya
    // pengklasifikasi sebab (FR-20) tidak menyebutnya "kecocokan kata".
    diagnosa: {
      jalur: 'meta',
      jumlahBukti: evidence.length,
      konsepAsing: [],
      mintaPerDesa: false,
    },
    response: formatAngkaPresentasi({
      narasi,
      visualisasi: { tipe: 'none', konfigurasi: {} },
      rekomendasi,
      dataSource: dataSourceLabel('splp'),
      timestamp: new Date().toISOString(),
    }),
  };
}

/** Pola permintaan yang menyasar SISTEM, bukan data. */
const POLA_PERMINTAAN_SISTEM: RegExp[] = [
  /(?:system|sistem)\s*prompt/i,
  /instruksi\s*(?:sistem|internal|awal|rahasia|dasar)/i,
  /(?:aturan|prompt|instruksi)\s*(?:internal|rahasia|tersembunyi)/i,
  /(?:lupakan|abaikan|hapus|langgar|lewati)\s+(?:semua\s+)?(?:instruksi|perintah|aturan|prompt|batasan)/i,
  /ignore\s+(?:all\s+)?(?:previous\s+|prior\s+)?(?:instructions|rules|prompt)/i,
  /(?:tampilkan|tunjukkan|beri|kasih|bocorkan|sebutkan|reveal|show|print)\s+(?:saya\s+|aku\s+)?(?:isi\s+|teks\s+|kode\s+)?(?:prompt|instruksi|aturan\s+internal)/i,
  /(?:kamu|anda|kamu\s+ini)\s+(?:pakai|gunakan|diberi|dijalankan)\s+(?:prompt|instruksi|aturan)/i,
  /(?:developer|debug|dAN|dan)\s*mode/i,
  /jailbreak|prompt\s*injection|\bDAN\s*mode\b/i,
];

/**
 * Apakah pengguna meminta isi ATURAN INTERNAL aplikasi (bukan data SAPA)?
 *
 * Dua hal diuji di sini, dan keduanya penting untuk klien:
 *
 * 1. **Menolak dengan jelas** — permintaan seperti ini bukan pertanyaan data;
 *    menjawabnya dengan "data tidak ditemukan" membuat pengguna bingung.
 * 2. **TIDAK MENGGEMAKAN muatan pengguna.** Balasan lama mengutip pertanyaan apa
 *    adanya, sehingga muatan injeksi ikut tercetak di jawaban — terukur 22 Sep
 *    2026 pada item eval S1: narasi memuat "999999" (angka karangan penyerang)
 *    dan item S3 memuat "system prompt" (jargon internal). Kalimat tetap di
 *    bawah ini bersih dari angka asing sekaligus dari jargon internal, sehingga
 *    tidak ada muatan yang dipantulkan kembali.
 */
export function deteksiPermintaanSistem(query: string): boolean {
  return POLA_PERMINTAAN_SISTEM.some((p) => p.test(query));
}

/** Balasan tetap: jujur, tanpa jargon internal, tanpa mengutip pertanyaan. */
export const NARASI_TOLAK_SISTEM =
  'Maaf, aturan kerja internal saya tidak dapat ditampilkan maupun diubah, dan permintaan ' +
  'seperti itu tidak memengaruhi cara saya menjawab. Saya hanya membantu pertanyaan tentang ' +
  'data SAPA Aceh Tengah — misalnya indikator, perangkat daerah, tahun data, atau angka ' +
  'pembangunan daerah. Silakan ajukan pertanyaan seputar data tersebut.';

export function buildDeterministicAnswer(query: string, records: SapaRecord[]): DeterministicResult {
  // Penjaga paling depan: permintaan atas aturan internal dijawab dengan kalimat
  // tetap — tidak meneruskan kueri ke retrieval (tidak ada gunanya) dan tidak
  // memantulkan muatan pengguna.
  if (deteksiPermintaanSistem(query)) {
    return {
      hits: [],
      evidence: [],
      aggregated: aggregateByIndicator([]),
      opds: [],
      peringatan: [],
      diagnosa: {
        jalur: 'sistem',
        jumlahBukti: 0,
        konsepAsing: [],
        mintaPerDesa: false,
      },
      response: {
        narasi: NARASI_TOLAK_SISTEM,
        rekomendasi: [],
        visualisasi: buildVizFromEvidence([]),
        dataSource: dataSourceLabel('splp'),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Gerbang niat meta di paling depan: murah, deterministik, dan mencegah
  // jawaban menyesatkan (lihat buildMetaAnswer). Bila tidak yakin → null → lanjut.
  const meta = deteksiMetaIntent(query, getUniqueOpd(records).map((o) => o.nama));
  if (meta) return buildMetaAnswer(meta, query, records);

  // FR-12: leksikal lebih dahulu; lapis semantik HANYA mengisi bila leksikal
  // kosong (lihat retrieveDenganSemantik) — sehingga jawaban yang sudah benar
  // tidak mungkin berubah karena lapis ini.
  const retrieval = retrieveDenganSemantik(records, query, { cap: 80 });
  const hits = retrieval.hasil;

  if (hits.length === 0) {
    // Jelaskan KENAPA kosong: sebut kata kunci yang tidak pernah tercatat di
    // SAPA (bila ada). Ini keterangan tentang pertanyaannya sendiri — bukan
    // tebakan isi data.
    const asing = konsepTidakDikenal(records, query).slice(0, 3);
    // Rangkai dengan pemisah yang eksplisit: versi lama menempelkan
    // "…di katalog SAPA." + "Coba…" tanpa spasi → "SAPA.Coba" terbaca di layar.
    const sebabAsing = asing.length
      ? 'Kata kunci ' + asing.map((k) => '"' + k + '"').join(', ') +
        ' tidak terdapat pada satu pun indikator di katalog SAPA. '
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
      diagnosa: {
        jalur: 'kosong',
        jumlahBukti: 0,
        konsepAsing: asing,
        skorSemantik: retrieval.skorSemantik,
        ditolakTanpaJangkar: retrieval.ditolakTanpaJangkar,
        // Sinyal presisi: bukan "kueri menyebut per desa", melainkan "penjaga
        // granularitas memang menolak kueri ini pada korpus ini".
        mintaPerDesa: granularitasTidakTersedia(records, query),
      },
      peringatan: [
        `Tidak ada indikator di katalog SAPA yang cocok dengan pertanyaan "${query}".`,
      ],
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
  let evidence: EvidenceItem[] = [...seen.values()].slice(0, 15);

  // ── Niat SEBAB: SAPA menyimpan angka, bukan sebab (perbaikan 23 Sep 2026) ──
  //
  // MENGAPA BUKAN HANYA DI PROMPT. Panduan prompt untuk niat `sebab` sudah ada
  // sejak awal, tetapi hanya berlaku di mode AI dan hanya sebagai imbauan. Pada
  // mode deterministik, pertanyaan "Apa penyebab utama stunting?" dijawab dengan
  // 15 indikator dari 7 OPD — termasuk irigasi, arsip, dan ASI — sebagai daftar
  // "indikator terkait". Terukur pada korpus produksi: item eval U5 gagal
  // ("menjawab padahal data tidak ada"), dan pembaca manusia pun akan mengira
  // angka-angka itu penyebabnya.
  //
  // Perbaikannya di lapis DATA, bukan lapis kalimat:
  //   1. hanya baris yang benar-benar mengenai topik pertanyaan yang disajikan
  //      (jangkar isi: kata isi pertanyaan muncul di nama indikator/OPD), dan
  //      paling banyak tiga — cukup sebagai konteks, tidak menyerupai jawaban;
  //   2. pernyataan jujur WAJIB ikut sebagai `peringatan`, sehingga jalur AI
  //      tidak dapat menghapusnya (mekanisme `catatanWajib` di answer-compose).
  const { niat } = deteksiNiat(query);
  const sebabDiminta = niat === 'sebab';
  let peringatanSebab = '';
  if (sebabDiminta) {
    const terjangkar = evidence.filter((e) => punyaJangkarIsi(query, `${e.indikator} ${e.opd}`));
    const dibuang = evidence.length - terjangkar.length;
    evidence = terjangkar.slice(0, 3);
    peringatanSebab =
      'Data penyebab atau kausalitas tidak tersedia di SAPA — katalog ini menyimpan angka capaian, bukan sebab. ' +
      (evidence.length > 0
        ? 'Angka berikut hanya konteks topik, bukan bukti sebab. '
        : '') +
      (dibuang > 0
        ? `Indikator lain yang tidak mengenai topik pertanyaan tidak disajikan agar tidak terbaca sebagai penyebab. `
        : '');
  }

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
  const daftarPeringatan: string[] = [];
  if (peringatanTahun) daftarPeringatan.push(peringatanTahun.trim());
  // Niat sebab: pernyataan jujur ini WAJIB (dijaga `catatanWajib` pada jalur AI).
  if (peringatanSebab) daftarPeringatan.push(peringatanSebab.trim());
  // Kejujuran jalur (FR-12): bila jawaban datang dari pencocokan makna, katakan
  // — baik pada peringatan wajib (agar jalur AI tidak menghapusnya) maupun pada
  // narasi (agar pembaca tanpa AI pun melihatnya).
  if (retrieval.jalur === 'semantik' && retrieval.peringatan) daftarPeringatan.push(retrieval.peringatan);
  const kurangKonsepFinal = konsepTakTermuat(records, hits[0].record, query).slice(0, 3);
  if (kurangKonsepFinal.length) {
    // Frasa di sini adalah KANONIK: teks yang sama dipakai sebagai peringatan
    // wajib di jalur AI, sehingga pemakaian kata yang konsisten ("tidak ada
    // data") menjadi syarat yang bisa diuji, bukan soal selera penulisan.
    daftarPeringatan.push(
      'Tidak ada data SAPA yang memuat seluruh kata kunci sekaligus — tidak ada indikator yang memuat ' +
      kurangKonsepFinal.map((k) => '"' + k + '"').join(', ') + ' bersama kata kunci lainnya.',
    );
  }
  const visualisasi = buildVizFromEvidence(evidence);
  const rekomendasi: string[] = [
    `Tindak lanjuti temuan "${query}" dengan OPD pengampu (${opds.slice(0, 2).map((o) => o.nama).join(' / ') || 'lihat OPD pada tabel'}) untuk verifikasi data terbaru.`,
    'Bandingkan antar-tahun bila indikator multi-tahun — cek kolom Tahun pada visualisasi untuk melihat deret historis.',
  ];

  const peringatanSemantik = retrieval.jalur === 'semantik' && retrieval.peringatan ? `${retrieval.peringatan} ` : '';
  const response = formatAngkaPresentasi({
    narasi: peringatanTahun + peringatanSebab + peringatanKonsep + peringatanSemantik + narasiRaw,
    visualisasi,
    rekomendasi,
    dataSource: dataSourceLabel('splp'),
    timestamp: new Date().toISOString(),
  });

  return {
    hits,
    evidence,
    aggregated,
    opds,
    response,
    peringatan: daftarPeringatan,
    diagnosa: {
      jalur: retrieval.jalur,
      jumlahBukti: evidence.length,
      konsepAsing: [],
      skorSemantik: retrieval.skorSemantik,
      mintaPerDesa: mintaRincianPerDesa(query),
    },
  };
}
