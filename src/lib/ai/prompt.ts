// ─── Prompt narasi SAPA ───
// Prinsip: model adalah perumus bahasa. Angka hanya boleh lewat token {{id}}.
// Tidak ada few-shot fiktif (anti-pola lama: contoh "84 pegawai" mengajari mengarang).
//
// ── Revisi 21 Sep 2026 (gelombang 2) — semua karena pengukuran, bukan selera ──
//
// 1. EVIDENCE KINI MARKDOWN-KV, bukan JSON bertingkat. Alasan: (a) tiga uji
//    format tabel yang saling bertentangan sepakat pada satu hal — format
//    penting pada prompt panjang dan baris banyak; (b) markdown-KV dengan kolom
//    eksplisit mengurangi risiko salah-kolom; (c) bentuk JSON bertingkat
//    menyisipkan kunci meta di antara baris data, sehingga baris ke-n mudah
//    tertukar. Sel kosong ditulis literal `N/A`, bukan dikosongkan.
//
// 2. ID BARIS DITULIS APA ADANYA di kolom pertama supaya model dapat merujuk
//    baris spesifik, bukan mengandalkan urutan.
//
// 3. NIAT DIISI (router `deteksiNiat`) + panduan bentuk jawaban per niat.
//    Sebelumnya `intent` selalu bernilai 'nilai_saat_ini' untuk semua pertanyaan.
//
// 4. PERINGATAN WAJIB dibawa sebagai data (`catatanWajib`) dan DRAF
//    deterministik disertakan sebagai acuan informasi. Terukur pada penyedia
//    tiruan: tanpa keduanya, narasi AI menghapus peringatan "tidak ada data
//    untuk tahun X" dan menyajikan angka tahun lain seolah menjawab — jawaban
//    jadi lebih rapi tetapi menyesatkan.

import type { EvidenceItem } from '@/services/grounding';
import { PANDUAN_NIAT, type NiatJawaban } from '@/lib/intent-meta';

export interface PromptContext {
  query: string;
  intent?: NiatJawaban | string;
  evidence: EvidenceItem[];
  statistik: { totalRecord: number; totalOpd: number; evidenceDihitung: number };
  /** Peringatan hasil hitungan yang WAJIB muncul di narasi (tahun tak ada, kata kunci tak termuat). */
  catatanWajib?: string[];
  /** Narasi deterministik sebagai acuan isi — bukan untuk disalin mentah. */
  draf?: string;
}

const SYSTEM_PROMPT = `Anda adalah perangkai narasi untuk dashboard data resmi Pemerintah Kabupaten Aceh Tengah (SAPA — Satu Pintu Akses Data).
Pembaca narasi Anda: pejabat daerah DAN masyarakat umum. Karena itu nada harus baku, ringkas, dan tidak promosi.

ATURAN MUTLAK:
1. Angka HANYA boleh ditulis dengan token {{id}} yang tersedia di evidence: ganti "id" dengan angka id pada evidence.
   Bentuk {{id}} untuk nilai saja, {{id|t}} untuk nilai beserta tahun.
   Menulis digit sendiri DILARANG, kecuali angka yang tercantum di bagian "STATISTIK_KATALOG".
2. Jangan menyebut tahun, satuan, atau nama OPD yang tidak ada di evidence. Jangan menggabungkan tahun dari satu indikator ke indikator lain.
3. Bila evidence kosong atau tidak menjawab pertanyaan: katakan tidak tersedia dengan sopan, lalu sarankan kata kunci lain dari statistik/katalog. Jangan mengarang.
4. Pertanyaan sebab-akibat ("kenapa", "mengapa", "apa penyebab") TIDAK boleh dijawab dengan dugaan. Jelaskan bahwa SAPA menyimpan angka, lalu ringkas angka yang tersedia.
5. Jangan memberi nasihat medis, hukum, atau politik. Rekomendasi hanya boleh bersifat tata kelola data/koordinasi antar-OPD, maksimal 3 butir, tanpa angka baru.
6. Bahasa Indonesia baku (EYD). 3–6 kalimat untuk narasi. Hindari kata berlebihan seperti "sangat", "tentu saja", "berikut adalah".
7. Jangan menulis satuan (persen, orang, rupiah, jiwa, km, dan sejenisnya) setelah token {{id}} atau {{id|t}} — satuan sudah otomatis ditambahkan oleh sistem, jadi menulisnya lagi menghasilkan satuan ganda.
8. Keluarkan HANYA satu objek JSON sesuai skema. Tidak ada teks lain sebelum atau sesudahnya.
9. SERTAKAN SEMUA baris pada "CATATAN_WAJIB" secara apa adanya (boleh Anda haluskan kalimatnya, tetapi maknanya tidak boleh hilang, dan tidak boleh dipindah ke akhir sebagai catatan kaki kecil). Bila catatan menyatakan data tidak tersedia, jangan menyajikan angka lain sebagai jawaban atas permintaan itu — sebutkan keterbatasannya lebih dulu.
10. Tulis hasil yang setidaknya sama informatifnya dengan "DRAF_DETERMINISTIK" pada bagian "acuan_draf": boleh lebih rapi, tidak boleh lebih sedikit memuat nilai, OPD, dan tahun. Jangan menyalinnya mentah — perbaiki kalimatnya.
11. Jangan menulis kata teknis internal ("evidence", "bukti pelaporan", "retrieval", "skor kemiripan", "system prompt") kepada pembaca.`;

const SCHEMA_HINT = `Skema JSON:
{"narasi":"...","rekomendasi":["..."],"followUps":["..."],"visualHint":"metric|table|chart|none","confidence":"tinggi|sedang|rendah"}`;

/** Serialisasi evidence sebagai tabel markdown-KV — kolom eksplisit, sel kosong = N/A. */
export function serializeEvidence(evidence: EvidenceItem[], maxBaris = 15): string {
  const header = '| id | indikator | nilai | satuan | opd | tahun |';
  const garis = '|----|-----------|-------|--------|-----|-------|';
  const sel = (v: unknown) => {
    const t = String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
    return t === '' ? 'N/A' : t;
  };
  const baris = evidence.slice(0, maxBaris).map((e) =>
    `| ${sel(e.id)} | ${sel(e.indikator)} | ${sel(e.nilai)} | ${sel(e.satuan)} | ${sel(e.opd)} | ${sel(e.tahun)} |`,
  );
  return [header, garis, ...baris].join('\n');
}

export function buildPrompt(ctx: PromptContext): { system: string; user: string } {
  const evidence = ctx.evidence.slice(0, 15);
  const niat = (ctx.intent ?? 'nilai_saat_ini') as NiatJawaban;
  const panduan = PANDUAN_NIAT[niat] ?? PANDUAN_NIAT.nilai_saat_ini;

  const catatan = (ctx.catatanWajib ?? []).filter(Boolean);
  const bagianCatatan = catatan.length
    ? `\nCATATAN_WAJIB (semua harus muncul di narasi):\n${catatan.map((c) => `- ${c}`).join('\n')}\n`
    : '\nCATATAN_WAJIB: (tidak ada)\n';

  const bagianDraf = ctx.draf
    ? `\nacuan_draf: teks berikut dihasilkan aturan deterministik dan informasinya sudah benar — pakai sebagai acuan, rapikan bahasanya, jangan kurangi informasinya:\n"${ctx.draf.slice(0, 900)}"\n`
    : '';

  const user = [
    `PERTANYAAN_PENGGUNA: ${ctx.query.slice(0, 500)}`,
    `INTENT: ${niat}`,
    `PANDUAN_BENTUK_JAWABAN: ${panduan}`,
    '',
    'EVIDENCE (tabel; kolom id dipakai untuk token {{id}}; N/A berarti tidak dicantumkan):',
    serializeEvidence(evidence),
    '',
    `STATISTIK_KATALOG: ${ctx.statistik.totalRecord} record, ${ctx.statistik.totalOpd} OPD, ${ctx.statistik.evidenceDihitung} indikator terkait pertanyaan ini.`,
    bagianCatatan,
    bagianDraf,
    'CARA_MENULIS_ANGKA: "{{id}}" untuk nilai; "{{id|t}}" menambahkan tahun di belakang. Contoh: "Prevalensi Stunting {{511|t}}" — jangan menambah satuannya.',
    '',
    'Ingat: setiap angka di narasi wajib berupa token {{id}} (kecuali angka dari STATISTIK_KATALOG). Keluarkan satu objek JSON sesuai skema.',
  ].filter((b) => b !== undefined).join('\n');

  return {
    system: `${SYSTEM_PROMPT}\n\n${SCHEMA_HINT}`,
    user,
  };
}
