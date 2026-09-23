// ─── OPS-04: pemberitahuan operator saat sirkuit penyedia AI terbuka ──────────
//
// MASALAH
// Sirkuit penyedia (provider-health.ts) sudah membuat SISTEM aman: saat kunci
// ditolak atau penyedia mati berulang, panggilan model dilewati seketika dan
// pengguna tetap menerima jawaban deterministik. Yang belum ada: OPERATOR tidak
// tahu apa-apa. Tanpa notifikasi, sirkuit bisa terbuka berjam-jam (persis
// kejadian nyata 2026-09-21: langganan AI belum diperpanjang, jawaban tetap
// keluar, dan tidak ada satu pun tanda yang muncul kecuali operator membuka
// panel admin).
//
// SOLUSI
// Satu fungsi pemeriksa yang dipanggil dari DUA tempat:
//   1. jalur jawaban (setelah catatGagal/catatSukses) — nirblokir, tidak pernah
//      memperlambat atau menggagalkan permintaan pengguna;
//   2. endpoint admin /api/admin/peringatan — untuk penjadwal luar (cron) dan
//      untuk pemeriksaan manual oleh operator.
//
// ATURAN YANG DIPEGANG
//   • Sekali per episode. Peringatan pertama dikirim pada detik sirkuit terbuka
//     (operator tidak kehilangan 15 menit pertama), lalu DIULANG bila sirkuit
//     masih terbuka ≥ ambang (bawaan 15 menit) dengan jeda ulang ≥ 1 jam —
//     persis kalimat OPS-04 "bila sirkuit terbuka > 15 menit, kirim notifikasi",
//     tanpa dua-duanya saling meniadakan.
//   • Tidak pernah spam: keadaan disimpan di penyimpanan bersama (Redis bila
//     ada), jadi beberapa instance serverless tidak mengirim berkali-kali.
//   • Tidak pernah melempar. Notifikasi yang gagal tidak boleh menggagalkan
//     jawaban warga; kegagalan dicatat dan dicoba lagi pada pemeriksaan
//     berikutnya dengan jeda yang wajar.
//   • Tidak pernah memuat rahasia: token/kunci disaring dari pesan (pesan galat
//     penyedia kadang mengutip kunci).
//   • Saluran opsional. Tanpa saluran, modul ini "siap tapi diam" (siap:false)
//     dan endpoint melaporkannya apa adanya — bukan dianggap sukses palsu.

import { activeBackend, cacheGet, cacheSet } from '@/lib/store';
import type { KesehatanPenyedia, SebabGalat } from './provider-health';

export type JenisPeringatan = 'sirkuit-terbuka' | 'sirkuit-pulih' | 'uji';
export type SaluranJenis = 'telegram' | 'webhook';

export interface Saluran {
  jenis: SaluranJenis;
  nama: string;
  url: string;
  /** Rahasia yang dipakai saluran ini (untuk header), tidak pernah ikut ke pesan. */
  rahasia?: string;
}

export interface Peringatan {
  jenis: JenisPeringatan;
  judul: string;
  teks: string;
  /** Ringkasan mesin (dipakai webhook) — tanpa rahasia. */
  data: Record<string, unknown>;
}

export interface HasilKirim {
  saluran: string;
  ok: boolean;
  catatan: string;
}

export interface KeadaanPeringatan {
  /** true = sedang dalam episode peringatan (sirkuit terbuka, pemulihan belum dikirim). */
  aktif: boolean;
  sejak: string | null;
  sebab: SebabGalat | null;
  terakhirKirim: string | null;
  terakhirPercobaan: string | null;
  jumlahKirim: number;
  percobaanGagal: number;
  terakhirJenis: JenisPeringatan | null;
}

export type StatusPeringatan =
  | 'tenang'
  | 'tanpa-saluran'
  | 'peringatan-dikirim'
  | 'peringatan-diulang'
  | 'masih-terbuka'
  | 'pulih-dikirim'
  | 'gagal-kirim'
  | 'kering';

export interface HasilPeringatan {
  status: StatusPeringatan;
  /** Ada saluran terpasang? false = modul diam (dan itu dilaporkan apa adanya). */
  siap: boolean;
  pesan: string;
  terbukaMenit: number | null;
  dikirim: HasilKirim[];
  keadaan: KeadaanPeringatan;
  /** Isi pesan yang AKAN dikirim (hanya diisi pada mode kering) — untuk diinspeksi operator. */
  pratinjau?: string;
}

export interface OpsiPeriksa {
  kesehatan: KesehatanPenyedia;
  /** Jam yang dipakai (ms). Disuntik pada pengujian. */
  sekarang?: number;
  saluran?: Saluran[];
  kirim?: (p: Peringatan, s: Saluran[]) => Promise<HasilKirim[]>;
  /** true = hanya menghitung, tidak mengirim & tidak mengubah keadaan. */
  kering?: boolean;
}

const KEY = 'sapa:ops:peringatan:v1';
/** TTL panjang: keadaan episode bersifat operasional. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_KIRIM_MS = 5_000;

const KOSONG: KeadaanPeringatan = {
  aktif: false,
  sejak: null,
  sebab: null,
  terakhirKirim: null,
  terakhirPercobaan: null,
  jumlahKirim: 0,
  percobaanGagal: 0,
  terakhirJenis: null,
};

// ─── Pembacaan lingkungan (dibaca saat dipanggil, bukan saat impor) ───────────

function menit(nama: string, bawaan: number): number {
  const n = Number(process.env[nama]);
  return Number.isFinite(n) && n >= 0 ? n : bawaan;
}

/** Saluran yang terpasang, dari env. Tidak pernah melempar. */
export function bacaSaluran(env: Record<string, string | undefined> = process.env): Saluran[] {
  const ambil = (nama: string): string | undefined => {
    const v = env[nama];
    return v && v.trim() ? v.trim() : undefined;
  };
  const keluar: Saluran[] = [];

  const token = ambil('SAPA_ALERT_TELEGRAM_BOT_TOKEN');
  const chat = ambil('SAPA_ALERT_TELEGRAM_CHAT_ID');
  if (token && chat) {
    keluar.push({
      jenis: 'telegram',
      nama: `telegram:${chat}`,
      url: `https://api.telegram.org/bot${token}/sendMessage`,
      rahasia: token,
    });
  }

  const url = ambil('SAPA_ALERT_WEBHOOK_URL');
  if (url) {
    keluar.push({ jenis: 'webhook', nama: 'webhook', url, rahasia: ambil('SAPA_ALERT_WEBHOOK_TOKEN') });
  }

  return keluar;
}

/** URL panel admin yang dipasang di pesan — supaya notifikasi bisa ditindaklanjuti. */
export function urlPanel(env: Record<string, string | undefined> = process.env): string {
  const v = env['SAPA_ALERT_PANEL_URL'];
  return v && v.trim() ? v.trim() : 'https://sapa-smart-ai.vercel.app/admin/ai-toggle';
}

const AMBANG_ESKALASI_MENIT = 15; // bawaan; boleh diubah lewat SAPA_ALERT_ESKALASI_MENIT
const JEDA_ULANG_MENIT = 60;
const JEDA_GAGAL_MENIT = 5;

// ─── Penyaring rahasia ───────────────────────────────────────────────────────
//
// Pesan galat penyedia kadang mengutip potongan permintaan kita (termasuk kunci).
// Notifikasi keluar ke saluran pihak ketiga, jadi teks disaring DULU.

export function saringRahasia(teks: string | null | undefined, rahasia: string[] = []): string {
  let s = String(teks ?? '');
  if (!s) return '';

  // 1) Kunci yang persis kita ketahui panjangnya — buang apa pun yang memuatnya.
  for (const r of rahasia) {
    if (r && r.length >= 6) s = s.split(r).join('«disunting»');
  }

  // 2) Pola kunci yang lazim.
  s = s.replace(/\b(sk|pk|ghp|xoxb|AIza)[-_A-Za-z0-9]{6,}/g, '«disunting»');
  s = s.replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer «disunting»');
  s = s.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '«disunting»');
  s = s.replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '«disunting»'); // token bot Telegram
  return s;
}

// ─── Pesan ───────────────────────────────────────────────────────────────────

export interface BahanPesan {
  kesehatan: KesehatanPenyedia;
  terbukaMenit: number;
  jenis: JenisPeringatan;
  panel: string;
  rahasia?: string[];
  sekarang?: number;
}

function sisaCooldownDetik(k: KesehatanPenyedia, sekarang: number): number {
  const sisa = (k.dibukaSampai ?? 0) - sekarang;
  return sisa > 0 ? Math.ceil(sisa / 1000) : 0;
}

/** Susun pesan notifikasi (teks polos — tahan semua klien Surel/Telegram). */
export function susunPesan(b: BahanPesan): Peringatan {
  const k = b.kesehatan;
  const sebab = k.sebabTerakhir ?? 'tidak diketahui';
  const sebabManusia: Record<string, string> = {
    auth: 'kunci ditolak / langganan mati',
    throttle: 'kuota atau batas laju penyedia',
    server: 'galat 5xx penyedia',
    jaringan: 'jaringan ke penyedia gagal',
    timeout: 'penyedia tidak menjawab tepat waktu',
    stall: 'aliran model mandek',
    konfigurasi: 'konfigurasi permintaan salah',
  };

  if (b.jenis === 'uji') {
    const teks = [
      '[SAPA] Uji notifikasi OPS-04 (bukan gangguan)',
      `waktu  : ${new Date(b.sekarang ?? Date.now()).toISOString()}`,
      'arti   : saluran ini akan menerima peringatan bila sirkuit penyedia AI terbuka',
      `panel  : ${b.panel}`,
    ].join('\n');
    return {
      jenis: 'uji',
      judul: 'Uji notifikasi OPS-04',
      teks,
      data: { jenis: 'uji', waktu: new Date(b.sekarang ?? Date.now()).toISOString(), panel: b.panel },
    };
  }

  if (b.jenis === 'sirkuit-pulih') {
    const teks = [
      `[SAPA] Sirkuit penyedia AI PULIH (terbuka ${b.terbukaMenit} menit)`,
      `berhasil: ${k.berhasilTerakhir ?? new Date(b.sekarang ?? Date.now()).toISOString()}`,
      'dampak  : narasi AI dilayani lagi seperti biasa',
      `panel   : ${b.panel}`,
    ].join('\n');
    return {
      jenis: 'sirkuit-pulih',
      judul: 'Sirkuit penyedia AI pulih',
      teks,
      data: { jenis: 'sirkuit-pulih', terbukaMenit: b.terbukaMenit, berhasil: k.berhasilTerakhir },
    };
  }

  const teks = [
    `[SAPA] Sirkuit penyedia AI TERBUKA (${b.terbukaMenit} menit)`,
    `sebab    : ${sebab} — ${sebabManusia[sebab] ?? 'sebab lain'}`,
    `pesan    : ${saringRahasia(k.pesanTerakhir, b.rahasia) || '—'}`,
    `dibuka   : ${k.dibukaPada ?? '—'}`,
    `gagal    : ${k.gagalBerturut} berturut (auth: ${k.gagalAuthBerturut})`,
    `cooldown : sisa ${sisaCooldownDetik(k, b.sekarang ?? Date.now())} dtk, lalu percobaan setengah terbuka otomatis`,
    'dampak   : panggilan model dilewati → pengguna menerima jawaban deterministik (tanpa galat)',
    `panel    : ${b.panel}`,
  ].join('\n');
  return {
    jenis: 'sirkuit-terbuka',
    judul: 'Sirkuit penyedia AI terbuka',
    teks,
    data: {
      jenis: 'sirkuit-terbuka',
      sebab,
      pesan: saringRahasia(k.pesanTerakhir, b.rahasia),
      dibukaPada: k.dibukaPada,
      terbukaMenit: b.terbukaMenit,
      gagalBerturut: k.gagalBerturut,
      gagalAuthBerturut: k.gagalAuthBerturut,
      panel: b.panel,
    },
  };
}

// ─── Pengiriman ──────────────────────────────────────────────────────────────

async function kirimSatu(sal: Saluran, p: Peringatan): Promise<HasilKirim> {
  const rahasia = [sal.rahasia, process.env['SAPA_ALERT_WEBHOOK_TOKEN'], process.env['ADMIN_TOKEN']].filter(
    (x): x is string => Boolean(x),
  );
  try {
    const isi =
      sal.jenis === 'telegram'
        ? { chat_id: sal.nama.split(':')[1], text: p.teks, disable_web_page_preview: true }
        : { jenis: p.jenis, judul: p.judul, teks: p.teks, sirkuit: p.data };

    const res = await fetch(sal.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sal.rahasia ? { Authorization: `Bearer ${sal.rahasia}` } : {}),
      },
      body: JSON.stringify(isi),
      signal: AbortSignal.timeout(TIMEOUT_KIRIM_MS),
    });

    if (!res.ok) {
      const badan = await res.text().catch(() => '');
      return { saluran: sal.nama, ok: false, catatan: `HTTP ${res.status}: ${saringRahasia(badan.slice(0, 120), rahasia)}` };
    }
    // Telegram menjawab 200 walau pesannya ditolak — periksa medan `ok`.
    if (sal.jenis === 'telegram') {
      const badan = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
      if (badan && badan.ok === false) {
        return { saluran: sal.nama, ok: false, catatan: saringRahasia(badan.description ?? 'ditolak Telegram', rahasia) };
      }
    }
    return { saluran: sal.nama, ok: true, catatan: 'terkirim' };
  } catch (e) {
    return {
      saluran: sal.nama,
      ok: false,
      catatan: saringRahasia(e instanceof Error ? e.message : String(e), rahasia).slice(0, 160),
    };
  }
}

/** Kirim ke seluruh saluran (tidak pernah melempar). */
export async function kirimKeSaluran(p: Peringatan, saluran: Saluran[]): Promise<HasilKirim[]> {
  if (!saluran.length) return [];
  const hasil = await Promise.all(saluran.map((s) => kirimSatu(s, p)));
  for (const h of hasil) {
    if (h.ok) console.warn('[ops-alert]', `${p.jenis} terkirim via ${h.saluran}`);
    else console.warn('[ops-alert]', `${p.jenis} GAGAL via ${h.saluran} — ${h.catatan}`);
  }
  return hasil;
}

// ─── Keadaan episode ─────────────────────────────────────────────────────────

export async function bacaKeadaanPeringatan(): Promise<KeadaanPeringatan> {
  const tersimpan = await cacheGet<Partial<KeadaanPeringatan>>(KEY);
  return { ...KOSONG, ...(tersimpan ?? {}) };
}

async function tulisKeadaan(k: KeadaanPeringatan): Promise<void> {
  await cacheSet(KEY, k, TTL_MS);
}

/** Berapa menit sirkuit sudah terbuka (0 bila waktu buka tidak diketahui). */
export function hitungTerbukaMenit(k: KesehatanPenyedia, sekarang: number): number {
  const mulai = k.dibukaPada ? Date.parse(k.dibukaPada) : NaN;
  if (!Number.isFinite(mulai)) return 0;
  return Math.max(0, Math.floor((sekarang - mulai) / 60_000));
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function sudahLewat(waktu: string | null, ms: number): boolean {
  if (!waktu) return true;
  const t = Date.parse(waktu);
  return !Number.isFinite(t) || ms - t >= 0;
}

function ringkas(status: StatusPeringatan, terbukaMenit: number | null, dikirim: HasilKirim[]): string {
  const gagal = dikirim.filter((d) => !d.ok).length;
  switch (status) {
    case 'tenang':
      return 'sirkuit penyedia sehat — tidak ada yang perlu diberitahukan';
    case 'tanpa-saluran':
      return 'tidak ada saluran notifikasi terpasang (SAPA_ALERT_TELEGRAM_* atau SAPA_ALERT_WEBHOOK_URL)';
    case 'peringatan-dikirim':
      return `peringatan pertama terkirim (sirkuit terbuka ${terbukaMenit} menit)`;
    case 'peringatan-diulang':
      return `peringatan diulang karena sirkuit masih terbuka (${terbukaMenit} menit)`;
    case 'masih-terbuka':
      return `sirkuit masih terbuka (${terbukaMenit} menit); belum waktunya dikirim ulang`;
    case 'pulih-dikirim':
      return 'notifikasi pemulihan terkirim';
    case 'gagal-kirim':
      return `pengiriman gagal pada ${gagal} saluran${dikirim.length > 1 ? ' (sebagian)' : ''} — akan dicoba lagi`;
    case 'kering':
      return 'pemeriksaan kering: tidak ada pengiriman dan tidak ada perubahan keadaan';
    default:
      return status;
  }
}

/**
 * Periksa keadaan sirkuit dan kirim notifikasi bila perlu. TIDAK PERNAH melempar.
 *
 * Mesin keadaan (satu episode = satu kali sirkuit terbuka sampai pulih):
 *   • sehat + bukan episode   → tenang
 *   • terbuka + belum episode → kirim SEGERA (status peringatan-dikirim)
 *   • terbuka + sudah episode → kirim ulang bila sudah ≥ AMBANG_ESKALASI_MENIT
 *                               dan jeda ulang ≥ JEDA_ULANG_MENIT
 *   • sehat + masih episode   → kirim pemulihan, tutup episode
 */
export async function periksaPeringatan(opsi: OpsiPeriksa): Promise<HasilPeringatan> {
  const sekarang = opsi.sekarang ?? Date.now();
  const saluran = opsi.saluran ?? bacaSaluran();
  const kirim = opsi.kirim ?? kirimKeSaluran;
  const panel = urlPanel();
  const rahasia = saluran.map((s) => s.rahasia).filter((x): x is string => Boolean(x));

  const keadaan = await bacaKeadaanPeringatan();
  const terbuka = opsi.kesehatan.state === 'terbuka';
  const menitTerbuka = terbuka ? hitungTerbukaMenit(opsi.kesehatan, sekarang) : null;

  const keluar = (status: StatusPeringatan, dikirim: HasilKirim[], keadaanBaru: KeadaanPeringatan): HasilPeringatan => ({
    status,
    siap: saluran.length > 0,
    pesan: ringkas(status, menitTerbuka, dikirim),
    terbukaMenit: menitTerbuka,
    dikirim,
    keadaan: keadaanBaru,
  });

  const bangunPesan = (jenis: JenisPeringatan): Peringatan =>
    susunPesan({ kesehatan: opsi.kesehatan, terbukaMenit: menitTerbuka ?? 0, jenis, panel, rahasia, sekarang });

  // ── Kering (dry-run): hanya melaporkan apa yang AKAN terjadi ──
  if (opsi.kering) {
    if (!terbuka) return keluar('kering', [], keadaan);
    const perluPertama = !keadaan.aktif;
    const ambang = menit('SAPA_ALERT_ESKALASI_MENIT', AMBANG_ESKALASI_MENIT);
    const jeda = menit('SAPA_ALERT_JEDA_ULANG_MENIT', JEDA_ULANG_MENIT);
    const terakhirKirimMs = keadaan.terakhirKirim ? Date.parse(keadaan.terakhirKirim) : NaN;
    const belumSampai = !Number.isFinite(terakhirKirimMs);
    const bolehUlang =
      keadaan.aktif &&
      menitTerbuka !== null &&
      (belumSampai || menitTerbuka >= ambang) &&
      (belumSampai ? keadaan.percobaanGagal === 0 : sekarang - terakhirKirimMs >= jeda * 60_000);
    const akanKirim = perluPertama || bolehUlang;
    return {
      status: 'kering',
      siap: saluran.length > 0,
      pesan: akanKirim
        ? `KRING: peringatan ${perluPertama ? 'pertama' : 'ulangan'} akan dikirim ke ${saluran.length} saluran`
        : 'KRING: tidak ada yang akan dikirim sekarang',
      terbukaMenit: menitTerbuka,
      dikirim: [],
      keadaan,
      // Pratinjau selalu diisi selama sirkuit terbuka: operator yang memeriksa
      // manual ingin tahu APA yang akan/sedang dikirim, bukan hanya apakah ada
      // kiriman baru pada detik ini.
      pratinjau: bangunPesan('sirkuit-terbuka').teks,
    };
  }

  // Saluran kosong: tetap laporkan (jangan diam-diam dianggap sukses), dan
  // JANGAN buka episode — supaya saat saluran dipasang, peringatan pertama tetap terkirim.
  if (!saluran.length) return keluar('tanpa-saluran', [], keadaan);

  // ── Sirkuit sehat ──
  if (!terbuka) {
    if (!keadaan.aktif) return keluar('tenang', [], keadaan);

    const pesanPulih = bangunPesan('sirkuit-pulih');
    const dikirim = await kirim(pesanPulih, saluran);
    const adaYangKirim = dikirim.some((d) => d.ok);
    const baru: KeadaanPeringatan = {
      ...keadaan,
      aktif: false,
      terakhirPercobaan: iso(sekarang),
      terakhirKirim: adaYangKirim ? iso(sekarang) : keadaan.terakhirKirim,
      jumlahKirim: keadaan.jumlahKirim + (adaYangKirim ? 1 : 0),
      percobaanGagal: adaYangKirim ? 0 : keadaan.percobaanGagal + 1,
      terakhirJenis: adaYangKirim ? 'sirkuit-pulih' : keadaan.terakhirJenis,
    };
    await tulisKeadaan(baru);
    return keluar('pulih-dikirim', dikirim, baru);
  }

  // ── Sirkuit terbuka ──
  const ambang = menit('SAPA_ALERT_ESKALASI_MENIT', AMBANG_ESKALASI_MENIT);
  const jedaUlang = menit('SAPA_ALERT_JEDA_ULANG_MENIT', JEDA_ULANG_MENIT);
  const jedaGagal = menit('SAPA_ALERT_JEDA_GAGAL_MENIT', JEDA_GAGAL_MENIT);

  const pertama = !keadaan.aktif;
  /** true = peringatan belum pernah benar-benar sampai ke operator. */
  const belumSampai = keadaan.terakhirKirim === null;
  const bolehCobaUlang = belumSampai
    ? keadaan.percobaanGagal === 0 || sudahLewat(keadaan.terakhirPercobaan, sekarang - jedaGagal * 60_000)
    : sudahLewat(keadaan.terakhirKirim, sekarang - jedaUlang * 60_000);
  // Pengulangan menuntut DUA syarat: gangguan sudah bertahan ≥ ambang (bawaan 15
  // menit) DAN jeda ulang sudah lewat (bawaan 60 menit). Pengecualiannya: bila
  // peringatan pertama TIDAK pernah sampai (semua saluran gagal), ia dicoba lagi
  // secepat jeda gagal mengizinkan — bukan menunggu ambang tahan-lama.
  const ulangan = keadaan.aktif && bolehCobaUlang && (belumSampai || (menitTerbuka ?? 0) >= ambang);

  if (!pertama && !ulangan) return keluar('masih-terbuka', [], keadaan);

  // Klaim episode LEBIH DULU (sebelum mengirim) supaya dua permintaan paralel
  // tidak mengirim dua peringatan pertama untuk episode yang sama.
  const klaim: KeadaanPeringatan = pertama
    ? {
        aktif: true,
        sejak: iso(sekarang),
        sebab: opsi.kesehatan.sebabTerakhir,
        terakhirKirim: null,
        terakhirPercobaan: iso(sekarang),
        jumlahKirim: 0,
        percobaanGagal: 0,
        terakhirJenis: null,
      }
    : { ...keadaan, terakhirPercobaan: iso(sekarang) };

  if (pertama) await tulisKeadaan(klaim);

  const pesan = bangunPesan('sirkuit-terbuka');
  const dikirim = await kirim(pesan, saluran);
  const adaYangKirim = dikirim.some((d) => d.ok);

  const baru: KeadaanPeringatan = {
    ...klaim,
    terakhirPercobaan: iso(sekarang),
    terakhirKirim: adaYangKirim ? iso(sekarang) : klaim.terakhirKirim,
    jumlahKirim: klaim.jumlahKirim + (adaYangKirim ? 1 : 0),
    percobaanGagal: adaYangKirim ? 0 : klaim.percobaanGagal + 1,
    terakhirJenis: adaYangKirim ? 'sirkuit-terbuka' : klaim.terakhirJenis,
  };
  await tulisKeadaan(baru);

  if (!adaYangKirim) return keluar('gagal-kirim', dikirim, baru);
  return keluar(pertama ? 'peringatan-dikirim' : 'peringatan-diulang', dikirim, baru);
}

/**
 * Pembungkus untuk jalur jawaban: nirblokir, tidak pernah melempar.
 * Dipanggil setelah catatGagal/catatSukses di llm-client.
 */
export function periksaPeringatanSirkuit(k: KesehatanPenyedia, opsi: Omit<OpsiPeriksa, 'kesehatan'> = {}): void {
  void periksaPeringatan({ ...opsi, kesehatan: k }).catch(() => {
    /* notifikasi tidak boleh pernah menggagalkan permintaan pengguna */
  });
}

/** Ringkasan untuk endpoint/laporan: sehat atau tidaknya notifikasi. */
export async function ringkasanPeringatan(): Promise<{
  siap: boolean;
  saluran: { nama: string; jenis: SaluranJenis }[];
  keadaan: KeadaanPeringatan;
  backend: string;
}> {
  const saluran = bacaSaluran();
  return {
    siap: saluran.length > 0,
    saluran: saluran.map((s) => ({ nama: s.nama, jenis: s.jenis })),
    keadaan: await bacaKeadaanPeringatan(),
    backend: activeBackend(),
  };
}
