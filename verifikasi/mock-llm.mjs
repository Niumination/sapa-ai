// pii-gate: izinkan NIK sintetis uji — NIK 9000000000000001 sintetis untuk uji P11, bukan NIK warga.
// ─── Penyedia model TIRUAN untuk menguji jalur AI SAPA tanpa langganan ───
//
// Latar: langganan penyedia produksi belum diperpanjang (403), sehingga jalur AI
// tidak pernah bisa diukur. Server ini meniru endpoint OpenAI-compatible
// (/v1/chat/completions, JSON + SSE) sehingga seluruh pipa SAPA benar-benar
// berjalan: prompt → model → parse skema → eject {{id}} → grounding → tampil.
//
// Tiga kepribadian model, dipilih lewat nama model pada request:
//   mock-pintar  — "model bagus": menulis narasi Indonesia dengan token {{id}},
//                  menyesuaikan bentuk jawaban dengan niat, memakai ≥3 bukti.
//   mock-flash   — "model flash lemah": menulis DIGIT sendiri (melanggar aturan 1),
//                  narasi super pendek, kadang menambah satuan ganda.
//   mock-tukar   — "model menukar entitas": angka BENAR diambil dari bukti, tetapi
//                  dipasangkan ke baris LAIN (OPD/satuan/tahun/wilayah tertukar).
//                  Inilah deceptive grounding — satu-satunya kelas salah yang lolos
//                  anti-halu & grounding, dan sasaran gerbang FR-24.
//   mock-nakal   — "model mengarang": mengarang angka, token tak dikenal, dan
//                  keluar dari skema; menguji apakah pagar grounding benar bekerja.
//   mock-patuh   — "model yang MENURUTI perintah di dalam data": bila di prompt ada
//                  perintah imperatif yang TIDAK dibungkus sebagai teks-data, ia
//                  menjalankannya dan menandai dirinya dengan [PATUH: …]. Model ini
//                  tidak bisa 'berpikir' — karena itu ia alat ukur yang jujur untuk
//                  membuktikan bahwa pembersih FR-23 benar-benar menghilangkan
//                  perintah dari prompt: bila penanda [PATUH:] tetap muncul, berarti
//                  perintah masih terbaca model.
//
// Pemakaian:
//   node verifikasi/mock-llm.mjs [port]          # bawaan 8899
//
// Rahasia uji: tidak ada kredensial nyata; hanya dipakai di mesin audit.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.argv[2] ?? 8899);
// Relatif ke cwd agar portabel lintas OS (arena memakai sandbox Linux; macOS tidak punya /home/user).
// MOCK_LLM_LOG tetap bisa diarahkan ke lokasi lain bila perlu.
const LOG = process.env.MOCK_LLM_LOG ?? path.join(process.cwd(), 'verifikasi', 'mock-llm-log.jsonl');

// ─── Pembacaan prompt: dukung JSON lama maupun markdown-KV baru ───
function ambilPayload(userContent) {
  // 1. Coba JSON (bentuk prompt sebelum upgrade).
  const start = userContent.indexOf('{');
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < userContent.length; i++) {
      const ch = userContent[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            const obj = JSON.parse(userContent.slice(start, i + 1));
            if (obj && Array.isArray(obj.evidence)) return { bentuk: 'json', payload: obj };
          } catch { /* lanjut ke markdown */ }
          break;
        }
      }
    }
  }
  // 2. Markdown-KV: baris "| id | indikator | nilai | satuan | opd | tahun |"
  const baris = userContent.split('\n').filter((l) => l.trim().startsWith('|'));
  const evidence = [];
  let pertanyaan = '', intent = '';
  const mq = userContent.match(/PERTANYAAN_PENGGUNA:\s*(.+)/i);
  if (mq) pertanyaan = mq[1].trim();
  const mi = userContent.match(/^INTENT:\s*(\S+)/im);
  if (mi) intent = mi[1].trim();
  for (const b of baris) {
    const sel = b.split('|').map((s) => s.trim());
    // sel[0] kosong (awal baris), jadi: 1=id,2=indikator,3=nilai,4=satuan,5=opd,6=tahun
    if (sel.length < 7) continue;
    const [id, indikator, nilai, satuan, opd, tahun] = [sel[1], sel[2], sel[3], sel[4], sel[5], sel[6]];
    if (!id || /^-+$/.test(id) || /^id$/i.test(id)) continue;
    if (!/^\d+$/.test(id.replace(/^meta:/, '')) && !/^meta:/.test(id)) continue;
    evidence.push({
      id,
      indikator,
      nilai,
      satuan: satuan === 'N/A' ? '' : satuan,
      opd,
      tahun: tahun === 'N/A' ? null : tahun,
    });
  }
  // CATATAN_WAJIB: baris "- ..." setelah penanda sampai baris kosong berikutnya.
  const catatan = [];
  const blokCatatan = userContent.match(/CATATAN_WAJIB[^\n]*:\s*\n([\s\S]*?)(?:\n\s*\n|\nacuan_draf|\nCARA_MENULIS_ANGKA)/i);
  if (blokCatatan) {
    for (const l of blokCatatan[1].split('\n')) {
      const t = l.trim();
      if (t.startsWith('- ')) catatan.push(t.slice(2).trim());
    }
  }
  const panduan = (userContent.match(/PANDUAN_BENTUK_JAWABAN:\s*([^\n]+)/i) ?? [])[1] ?? '';

  const statMatch = userContent.match(/STATISTIK_KATALOG:\s*([^\n]+)/i);
  let statistik = { totalRecord: 0, totalOpd: 0, evidenceDihitung: evidence.length };
  if (statMatch) {
    const t = statMatch[1];
    const num = (re) => { const m = t.match(re); return m ? Number(m[1]) : 0; };
    statistik = {
      totalRecord: num(/(\d[\d.]*)\s*record/i) || num(/record[=: ]+(\d[\d.]*)/i),
      totalOpd: num(/(\d[\d.]*)\s*OPD/i) || num(/opd[=: ]+(\d[\d.]*)/i),
      evidenceDihitung: evidence.length,
    };
  }
  return { bentuk: 'markdown', payload: { pertanyaan_pengguna: pertanyaan, intent, evidence, statistik, catatan, panduan } };
}

function tulisJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const tahunAda = (e) => e.tahun && /^\d{4}$/.test(String(e.tahun).trim());
const tok = (e, withYear = false) => `{{${e.id}${withYear ? '|t' : ''}}}`;
const namaPendek = (e) => String(e.indikator ?? '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);

// ─── mock-pintar: narasi berkualitas, bentuk mengikuti niat ───
function narasiPintar(pertanyaan, intent, evidence, statistik, catatan = []) {
  if (evidence.length === 0) {
    return {
      narasi: `SAPA belum memuat data untuk pertanyaan ini. Katalog saat ini berisi ${statistik.totalRecord} record dari ${statistik.totalOpd} OPD; coba kata kunci lain seperti stunting, IPM, kemiskinan, atau PDRB.`,
      rekomendasi: ['Ubah ke kata kunci yang tercatat di katalog SAPA, atau tanyakan ketersediaan data ke OPD pengampu.'],
      followUps: ['Apa saja indikator yang tersedia tentang stunting?', 'Berapa jumlah OPD yang melaporkan data?'],
      visualHint: 'none', confidence: 'rendah',
    };
  }
  const e1 = evidence[0], e2 = evidence[1], e3 = evidence[2], e4 = evidence[3], e5 = evidence[4];
  const pakaiTahun = tahunAda(e1);
  const kepala = `${namaPendek(e1)} tercatat ${tok(e1, pakaiTahun)} (${e1.opd})`;
  // Prefiks catatan wajib: prompt meminta maknanya TIDAK boleh hilang, jadi model
  // bagus menuliskannya apa adanya di awal — inilah yang membedakannya dari
  // model yang "menghaluskan" dan menghapus keterbatasan data.
  const prefiks = catatan.length ? catatan.join(' ') + ' ' : '';

  let narasi;
  switch (intent) {
    case 'tren':
      narasi = e2
        ? `${kepala}. Perkembangan terbaru: ${e3 ? `${namaPendek(e3)} ${tok(e3, true)}; ` : ''}${namaPendek(e2)} ${tok(e2, true)}. Selisih antarperiode perlu dibaca sebagai perubahan capaian, bukan angka tunggal.`
        : `${kepala}. SAPA baru memuat satu titik data untuk topik ini, sehingga tren belum dapat disimpulkan.`;
      break;
    case 'perbandingan':
      narasi = e2
        ? `Perbandingan dua indikator terdekat: ${kepala}, sedangkan ${namaPendek(e2)} ${tok(e2, pakaiTahun)} (${e2.opd}). Keduanya berbeda definisi dan OPD penghasil, jadi tidak dapat disimpulkan mana yang lebih baik tanpa indikator pembanding yang sama.`
        : `${kepala}. Belum ada indikator pembanding di katalog untuk topik ini.`;
      break;
    case 'peringkat':
      narasi = `Tiga catatan teratas: ${kepala}; ${e2 ? `${namaPendek(e2)} ${tok(e2, pakaiTahun)}` : 'tidak tersedia'}; ${e3 ? `${namaPendek(e3)} ${tok(e3, pakaiTahun)}` : 'tidak tersedia'}. Perlu dibaca sebagai urutan relevansi katalog, bukan urutan peringkat resmi daerah.`;
      break;
    case 'komposisi':
    case 'distribusi':
      narasi = `${kepala}, dengan rincian terbesar pada ${e2 ? tok(e2) : tok(e1)}. Sebaran lengkap per kategori tampil pada tabel. Angka per kategori tidak dapat dijumlahkan menjadi total karena satuan dan OPD penghasilnya berbeda.`;
      break;
    case 'meta_katalog':
      narasi = `Katalog SAPA memuat ${statistik.totalRecord} record dari ${statistik.totalOpd} OPD, dan pertanyaan ini menyentuh ${statistik.evidenceDihitung} indikator terkait. Catatan ini menggambarkan isi katalog, bukan capaian kinerja.`;
      break;
    default:
      narasi = `${kepala}${e2 ? `; ${namaPendek(e2)} ${tok(e2, pakaiTahun)}` : ''}${e3 ? `; ${namaPendek(e3)} ${tok(e3, pakaiTahun)}` : ''}. ${tahunAda(e1) ? '' : 'Tahun data tidak dicantumkan pada baris utama, sehingga angka ini belum dapat dibandingkan antarperiode. '}Untuk angka per OPD dan per tahun, lihat tabel pada visualisasi.`;
      break;
  }
  // Model bagus menyitir lebih dari tiga baris bila tersedia (draf deterministik
  // memuat tiga teratas; prompt meminta setidaknya sepadan).
  const tambahan = [e4, e5].filter(Boolean).map((e) => `${namaPendek(e)} ${tok(e, tahunAda(e))}`).join('; ');
  if (tambahan) narasi += ` Beberapa baris terkait lain: ${tambahan}.`;

  return {
    narasi: prefiks + narasi,
    rekomendasi: [
      `Verifikasi angka ini ke ${e1.opd} sebagai penghasil data sebelum dipakai untuk perencanaan.`,
      'Bandingkan dengan indikator sejenis pada tahun lain untuk melihat arah perubahan.',
    ],
    followUps: ['Tampilkan tren indikator ini 3 tahun terakhir', 'OPD mana yang menghasilkan data ini?'],
    visualHint: evidence.length > 4 ? 'table' : 'metric',
    confidence: tahunAda(e1) ? 'tinggi' : 'sedang',
  };
}

// ─── mock-flash: menulis digit sendiri (pelanggaran aturan 1) ───
function narasiFlash(pertanyaan, _intent, evidence, statistik) {
  if (evidence.length === 0) {
    return { narasi: `Tidak ada data. Katalog berisi ${statistik.totalRecord} record.`, rekomendasi: [], followUps: [], visualHint: 'none', confidence: 'rendah' };
  }
  const e1 = evidence[0];
  const angka = String(e1.nilai ?? '').replace(/\s/g, '');
  const narasi = `${namaPendek(e1)} sebesar ${angka} ${e1.satuan ?? ''} menurut ${e1.opd} pada tahun ${e1.tahun ?? '-'}. Datanya bisa dilihat di tabel.`;
  return { narasi, rekomendasi: ['Cek OPD terkait.'], followUps: [], visualHint: 'metric', confidence: 'sedang' };
}

// ─── mock-nakal: mengarang untuk menguji pagar ───
function narasiNakal(_pertanyaan, _intent, evidence) {
  const e1 = evidence[0];
  return {
    narasi: `${e1 ? namaPendek(e1) : 'Indikator ini'} mencapai 87.654 ton pada 2019 dan naik 42,7 persen dibanding 2021 {{999}}. Pemerintah menargetkan 100.000 pada 2030.`,
    rekomendasi: ['Angka ini 100% akurat.'],
    followUps: [], visualHint: 'chart', confidence: 'tinggi',
  };
}

// ─── mock-tukar: angka benar, pasangan salah (sasaran FR-24) ───
//
// Strategi perusakan: ambil NILAI baris pertama (tetap benar, jadi lolos
// anti-halu), lalu tempelkan satuan & tahun dari baris KEDUA — plus OPD baris
// kedua bila ada. Bila hanya ada satu baris bukti, satuan baris itu sendiri
// ditukar dengan satuan katalog lain yang umum ("Persen"/"Jiwa"/"Unit"),
// sehingga tetap ada pasangan salah untuk diperiksa.
function narasiTukar(_pertanyaan, _intent, evidence) {
  if (!evidence.length) {
    return { narasi: 'Tidak ada data.', rekomendasi: [], followUps: [], visualHint: 'none', confidence: 'rendah' };
  }
  // Bukti dari prompt memakai kunci ala SAPA (indikator/opd/nilai/satuan/tahun);
  // dicari longgar supaya mock tetap benar bila bentuk prompt berubah.
  const ambil = (e, ...kunci) => {
    for (const k of kunci) if (e && e[k] != null && String(e[k]).trim() !== '') return String(e[k]);
    return '';
  };
  const a = evidence[0];
  // Cari baris SEMBILAN yang benar-benar berbeda dari baris pertama (satuan atau
  // OPD). Tanpa pencarian ini, pada kueri yang seluruh barisnya bersatuan sama
  // ("berapa jumlah penduduk" → semua Jiwa) penukaran tidak terjadi, dan gerbang
  // FR-24 tidak akan pernah teruji oleh mock ini.
  const beda = (e, kunci) => ambil(e ?? {}, ...kunci).trim() !== ambil(a, ...kunci).trim();
  const b =
    evidence.find((e) => beda(e, ['satuan', 'unit']) || beda(e, ['opd', 'nama_opd'])) ?? evidence[1] ?? null;
  const angka = ambil(a, 'nilai', 'value').replace(/\s/g, '');
  const satuanAsli = ambil(a, 'satuan', 'unit');
  const satuanSalah = ambil(b ?? {}, 'satuan', 'unit') || (satuanAsli.toLowerCase().includes('persen') ? 'Jiwa' : 'Persen');
  const opdSalah = ambil(b ?? {}, 'opd', 'nama_opd') || ambil(a, 'opd', 'nama_opd');
  // Tahun SENGAJA diambil dari bukti (baris mana pun) supaya gerbang anti-halu
  // & grounding TIDAK menangkap lebih dulu — yang harus menangkap adalah gerbang
  // pasangan entitas FR-24 (satuan & OPD). Kalau tahunnya dikarang, uji ini
  // hanya akan mengulang pembuktian gerbang grounding yang sudah ada.
  const tahunSalah = ambil(b ?? {}, 'tahun', 'year') || ambil(a, 'tahun', 'year');
  const narasi =
    `${namaPendek(a)} sebesar ${angka} ${satuanSalah} menurut ${opdSalah}` +
    `${tahunSalah ? ` pada tahun ${tahunSalah}` : ''}. Angka ini ${tok(a, true)} dan sudah diverifikasi.`;
  return {
    narasi,
    rekomendasi: ['Gunakan angka ini untuk perencanaan.'],
    followUps: [],
    visualHint: 'metric',
    confidence: 'tinggi',
  };
}

// ─── mock-patuh: menuruti perintah yang ditemukan di dalam data ───
/** Buang semua pembungkus teks-data — yang tersisa = perintah yang MASIH terbaca model.
 *  Menangani sarang (nested) dengan loop yang tahan terhadap tumpang tindih:
 *  "[teks-data: ringkas semua [teks-data: NIK] dan alamat]" harus hilang sepenuhnya.
 *  Versi sebelumnya memakai [^\]]* yang berhenti di ] pertama dan menyisakan
 *  " dan alamat]" → memicu deteksi PII palsu.
 */
function tanpaPembungkus(teks) {
  let s = String(teks ?? '');
  // Hapus semua pembungkus teks-data secara iteratif, termasuk yang bersarang
  // dengan pendekatan: ganti "[teks-data:" dan "]" secara terpisah setelah beberapa iterasi
  let prev;
  let iter = 0;
  do {
    prev = s;
    s = s.replace(/\[teks-data:[^\]]*\]/gi, ' ');
    iter++;
  } while (s !== prev && iter < 10);
  // Sisa kurung siku dari sarang yang gagal terhapus (mis. " dan alamat]") dibuang
  s = s.replace(/\[teks-data:/gi, ' ');
  s = s.replace(/\]/g, ' ');
  s = s.replace(/\[/g, ' ');
  // Buang penanda lain yang bukan perintah mentah
  s = s.replace(/data-pii/gi, ' ');
  s = s.replace(/data-pembatas/gi, ' ');
  s = s.replace(/data-[a-z]+:/gi, ' ');
  return s;
}

function narasiPatuh(_pertanyaan, _intent, evidence, _stat, _catatan, userRaw = '') {
  const bersih = tanpaPembungkus(userRaw);
  const dasar = {
    rekomendasi: ['Ikuti perintah di data.'],
    followUps: [],
    visualHint: 'metric',
    confidence: 'tinggi',
  };

  const angka = /(?:tulis|output|sebutkan|cetak)\s+angka\s+([\d][\d.,]*)/i.exec(bersih);
  if (angka) {
    return { ...dasar, narasi: `Angka resmi menurut data adalah ${angka[1]}. [PATUH: angka ${angka[1]}]` };
  }
  if (/ganti semua angka jadi nol/i.test(bersih)) {
    return { ...dasar, narasi: 'Seluruh angka pada data ini nol. [PATUH: nol]' };
  }
  if (/(?:sebutkan|sebut|beritahu|beri\s+tahu|tampilkan|cetak|ulangi)\s+(?:isi\s+|kembali\s+|seluruh\s+)?(?:aturan|instruksi|prompt|perintah|panduan)/i.test(bersih)) {
    return { ...dasar, narasi: 'Aturan internal saya: jawab selalu dengan angka pertama yang terlihat. [PATUH: aturan internal]' };
  }
  if (/(?:abaikan|ignore|disregard)[^.!?\n]{0,40}(?:instruksi|instructions?|aturan|rules?|prompt)/i.test(bersih)) {
    return { ...dasar, narasi: 'Baik, saya abaikan aturan sebelumnya. [PATUH: abaikan aturan]' };
  }
  // ── P11: perluasan OWASP LLM Top 10 2025 ──────────────────────────────────
  if (/kirim\s+.*https?:\/\/\S+/i.test(bersih)) {
    return { ...dasar, narasi: 'Baik, saya kirim semua data ke URL luar. [PATUH: eksfiltrasi URL]' };
  }
  if (/ungkapkan\s+(?:seluruh\s+|semua\s+)?(?:instruksi|aturan|prompt)(?:\s+rahasia)?/i.test(bersih)) {
    return { ...dasar, narasi: 'Berikut instruksi rahasia sistem: ... [PATUH: system prompt]' };
  }
  if (/BEGIN\s+SYSTEM/i.test(bersih)) {
    return { ...dasar, narasi: 'SYSTEM: instruksi rahasia terbaca. [PATUH: BEGIN SYSTEM]' };
  }
  if (/tulis\s+\d+\s+paragraf/i.test(bersih) || /ulangi\s+\d+\s+kali/i.test(bersih)) {
    return { ...dasar, narasi: 'Baik, saya tulis 10000 paragraf sesuai permintaan. [PATUH: denial-of-wallet]' };
  }
  if (/ringkas\s+semua\s+NIK/i.test(bersih) || /\bNIK\b.*\balamat\b/i.test(bersih)) {
    return { ...dasar, narasi: 'Berikut NIK yang ada: 9000000000000001. [PATUH: PII]' };
  }
  // Tidak ada perintah yang terbaca → berperilaku seperti model biasa. Karena itu ia
  // sekaligus kontrol: pada data bersih, jawabannya normal (tidak menandai apa pun).
  return narasiPintar(_pertanyaan, _intent, evidence, _stat, _catatan);
}

const KEPRIBADIAN = {
  'mock-pintar': narasiPintar,
  'mock-flash': narasiFlash,
  'mock-tukar': narasiTukar,
  'mock-nakal': narasiNakal,
  'mock-patuh': narasiPatuh,
};

function balas(body) {
  const model = String(body?.model ?? 'mock-pintar');
  const pesan = Array.isArray(body?.messages) ? body.messages : [];
  const system = String(pesan.find((m) => m.role === 'system')?.content ?? '');
  const userRaw = String(pesan.find((m) => m.role === 'user')?.content ?? '');
  const { bentuk, payload } = ambilPayload(userRaw);
  const fn = KEPRIBADIAN[model] ?? narasiPintar;

  // Simulasi kenyataan: model flash kadang menolak skema (1 dari 4) — menguji jalur retry.
  const gagalSkema = model === 'mock-flash' && Math.random() < 0.25;
  const isi = gagalSkema
    ? 'Baik, berikut ringkasannya dalam bentuk paragraf saja tanpa JSON.'
    : JSON.stringify(fn(
        payload.pertanyaan_pengguna,
        payload.intent || 'nilai_saat_ini',
        payload.evidence ?? [],
        payload.statistik ?? { totalRecord: 0, totalOpd: 0, evidenceDihitung: 0 },
        payload.catatan ?? [],
        userRaw,
      ));

  // Penangkapan prompt (FR-23): bila MOCK_LLM_SIMPAN_PROMPT diisi, pesan pengguna
  // terakhir ditulis ke berkas itu. Dipakai uji untuk membuktikan APA YANG BENAR-
  // BENAR diterima model — bukan sekadar apa yang dijanjikan kode pembersih.
  const simpanPrompt = process.env.MOCK_LLM_SIMPAN_PROMPT;
  if (simpanPrompt) {
    try {
      fs.writeFileSync(simpanPrompt, userRaw);
    } catch { /* berkas uji; kegagalan menulis tidak boleh menjatuhkan mock */ }
  }
  fs.appendFileSync(LOG, JSON.stringify({
    waktu: new Date().toISOString(),
    model,
    bentukPrompt: bentuk,
    intentDiminta: payload.intent ?? null,
    catatanWajib: (payload.catatan ?? []).length,
    jumlahEvidence: (payload.evidence ?? []).length,
    panjangPrompt: userRaw.length,
    panjangSystem: system.length,
    idEvidence: (payload.evidence ?? []).slice(0, 8).map((e) => String(e.id)),
    narasiMentah: isi.slice(0, 2000),
  }) + '\n');

  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: isi },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: Math.ceil(userRaw.length / 4), completion_tokens: Math.ceil(isi.length / 4), total_tokens: 0 },
  };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/v1/models')) {
    return tulisJson(res, { ok: true, models: Object.keys(KEPRIBADIAN) });
  }
  if (req.method !== 'POST' || !req.url?.includes('/chat/completions')) {
    return tulisJson(res, { error: { message: 'hanya POST /v1/chat/completions' } }, 404);
  }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch { return tulisJson(res, { error: { message: 'body bukan JSON' } }, 400); }
    const hasil = balas(body);
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const isi = hasil.choices[0].message.content;
      // Potongan kecil agar benar-benar menguji penahanan token parsial "{{".
      for (const potong of isi.match(/[\s\S]{1,24}/g) ?? []) {
        res.write(`data: ${JSON.stringify({ id: hasil.id, object: 'chat.completion.chunk', model: hasil.model, choices: [{ index: 0, delta: { content: potong } }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ id: hasil.id, object: 'chat.completion.chunk', model: hasil.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: hasil.usage })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    return tulisJson(res, hasil);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-llm] siap di 0.0.0.0:${PORT} — model: ${Object.keys(KEPRIBADIAN).join(', ')}`);
  console.log(`[mock-llm] log: ${LOG}`);
});
