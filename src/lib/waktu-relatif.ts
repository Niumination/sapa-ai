// ─── P6: waktu relatif → tahun konkret (FR-03 lanjutan) ──────────────────────
//
// MASALAH YANG DIPERBAIKI
//
//   Sejak awal, `extractYears()` hanya mengenali tahun yang DIKETIK (`\b20\d{2}\b`).
//   Pertanyaan seperti "Berapa IPM tahun lalu?" tidak punya tahun eksplisit, jadi
//   sistem tidak tahu tahun mana yang dimaksud: ia menyajikan indikator yang benar
//   dengan tahun campur, dan pembaca harus menebak sendiri. Untuk layanan angka
//   daerah itu bukan sekadar kurang rapi — "tahun lalu" punya jawaban berbeda
//   dengan "tahun ini", dan menyerahkan pemetaannya ke pembaca berarti membiarkan
//   dua pembaca menyimpulkan dua hal berbeda dari satu jawaban.
//
// KEPUTUSAN YANG DIAMBIL (dan alasannya)
//
//   1. Dasar pemetaan adalah **tahun kalender sekarang** (UTC), bukan tahun
//      terbaru di katalog. "Tahun lalu" adalah istilah waktu manusia; kalau
//      dasarnya katalog, jawabannya berubah arti saat data baru masuk.
//      Katalog dipakai justru untuk MENGUJI ketersediaannya — dan bila tahun itu
//      tidak ada, kita mengatakannya (lihat `kalimatPemetaan` + peringatan tahun
//      yang sudah ada).
//   2. Frasa yang benar-benar ambigu tidak dipetakan. "Beberapa tahun terakhir"
//      tanpa angka → tidak dipetakan (tebak-tebakan bukan perbaikan). "3 tahun
//      terakhir" dan "sejak 2022" → dipetakan, karena jumlahnya jelas.
//   3. Tidak ada pemetaan yang MENGUBAH cakupan jawaban di sini: modul ini hanya
//      (a) memberi tahu tahun yang dimaksud, (b) memindahkan baris bukti bertahun
//      itu ke depan, (c) menyediakan kalimat transparansi bila tahun itu ada.
//      Penyaringan (membuang baris tahun lain) TIDAK dilakukan — itu akan
//      menurunkan cakupan jawaban dan bukan keputusan modul ini.
//
// Keterbatasan yang dinyatakan: pemetaan memakai tahun UTC; pengguna di WIB pada
// 1 Januari pukul 00.30 (UTC masih 31 Desember) akan melihat pemetaan yang
// berbeda satu hari dalam setahun. Dipilih UTC karena seluruh sistem memakai UTC
// (kunci penghitung harian, stempel data) — satu dasar, bukan dua.

export type JenisWaktu = 'tahun-lalu' | 'tahun-ini' | 'tahun-depan' | 'n-terakhir' | 'sejak' | 'sampai';

export interface WaktuRelatif {
  /** Frasa yang dikenali di pertanyaan (untuk transparansi & uji). */
  frasa: string;
  jenis: JenisWaktu;
  /** Tahun konkret yang dimaksud, urut menaik. */
  tahun: string[];
  /** Dasar pemetaan (tahun kalender yang dipakai). */
  dasarTahun: number;
  /** Catatan jujur bila ada batas yang perlu diketahui pembaca; kosong bila tidak. */
  catatan: string;
}

const ANGKA_KATA: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10,
};

function tahunUrut(dari: number, sampai: number): string[] {
  const hasil: string[] = [];
  const lo = Math.min(dari, sampai);
  const hi = Math.max(dari, sampai);
  for (let t = lo; t <= hi; t++) hasil.push(String(t));
  return hasil;
}

/**
 * Kenali SATU frasa waktu relatif yang paling informatif di pertanyaan.
 * Bila ada beberapa (mis. "sejak 2022 sampai 2024"), yang dipakai adalah yang
 * memberi rentang paling jelas — diutamakan `sejak`/`sampai` yang punya tahun
 * eksplisit, karena itulah yang paling kecil tafsirnya.
 */
export function deteksiWaktuRelatif(query: string, opsi: { sekarangMs?: number } = {}): WaktuRelatif | null {
  const teks = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const dasarTahun = new Date(opsi.sekarangMs ?? Date.now()).getUTCFullYear();

  // (a) "sejak 2022" → 2022..dasarTahun (batas atas = tahun sekarang; bila
  //     pengguna juga menulis "sampai 2024", batas itu yang dipakai).
  const sejak = teks.match(/\bsejak\s+(?:tahun\s+)?((?:19|20)\d{2})\b/);
  if (sejak) {
    const dari = Number(sejak[1]);
    const sampaiM = teks.match(/\bsampai\s+(?:tahun\s+)?((?:19|20)\d{2})\b/);
    const sampai = sampaiM ? Number(sampaiM[1]) : dasarTahun;
    return {
      frasa: sejak[0],
      jenis: 'sejak',
      tahun: tahunUrut(dari, sampai),
      dasarTahun,
      catatan: sampai > dasarTahun ? 'Rentang melewati tahun sekarang.' : '',
    };
  }

  // (b) "sampai 2024" (tanpa "sejak") → 5 tahun yang berakhir di tahun itu.
  //     Rentang bawahnya dihitung dari TAHUN YANG DISEBUT (bukan dari tahun
  //     sekarang), supaya artinya tetap sama walau tahun berjalan berganti:
  //     "sampai 2024" selalu berarti 2020–2024, bukan bergeser tiap Januari.
  const sampai = teks.match(/\bsampai\s+(?:tahun\s+)?((?:19|20)\d{2})\b/);
  if (sampai) {
    const disebut = Number(sampai[1]);
    const hi = Math.min(disebut, dasarTahun);
    return {
      frasa: sampai[0],
      jenis: 'sampai',
      tahun: tahunUrut(hi - 4, hi),
      dasarTahun,
      catatan:
        disebut > dasarTahun
          ? 'Batas yang disebut melewati tahun sekarang; rentang dipangkas sampai tahun berjalan.'
          : 'Batas atas saja yang disebut; rentang bawah diambil 5 tahun (termasuk tahun itu).',
    };
  }

  // (c) "N tahun terakhir" / "N tahun belakangan" — angka atau kata bilangan.
  const nTerakhir = teks.match(/\b(\d{1,2}|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+tahun\s+(?:terakhir|belakangan|ke belakang|kebelakang)\b/);
  if (nTerakhir) {
    const n = ANGKA_KATA[nTerakhir[1]] ?? Number(nTerakhir[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 30) {
      return {
        frasa: nTerakhir[0],
        jenis: 'n-terakhir',
        tahun: tahunUrut(dasarTahun - n + 1, dasarTahun),
        dasarTahun,
        catatan: '',
      };
    }
  }

  // (d) "tahun depan" — hampir pasti belum ada datanya, tetapi harus dikenali
  //     supaya jawabannya jujur alih-alih memakai tahun terbaru diam-diam.
  const tahunDepan = teks.match(/\btahun\s+depan\b/);
  if (tahunDepan) {
    return {
      frasa: tahunDepan[0],
      jenis: 'tahun-depan',
      tahun: [String(dasarTahun + 1)],
      dasarTahun,
      catatan: 'Tahun depan belum bisa memiliki data realisasi.',
    };
  }

  // (e) "tahun lalu" — juga singkatan lazim "thn lalu" dan "tahun kemarin".
  const tahunLalu = teks.match(/\b(?:tahun|thn|taun)\s+(?:lalu|kemarin|sebelumnya)\b/);
  if (tahunLalu) {
    return { frasa: tahunLalu[0], jenis: 'tahun-lalu', tahun: [String(dasarTahun - 1)], dasarTahun, catatan: '' };
  }

  // (f) "tahun ini" / "tahun sekarang" / "sekarang" pada konteks tahun.
  const tahunIni = teks.match(/\b(?:tahun\s+(?:ini|sekarang)|tahun\s+berjalan|sekarang\s+ini)\b/);
  if (tahunIni) {
    return { frasa: tahunIni[0], jenis: 'tahun-ini', tahun: [String(dasarTahun)], dasarTahun, catatan: '' };
  }

  return null;
}

/**
 * Kalimat transparansi pemetaan — hanya dibuat bila tahun yang dimaksud BENAR
 * ADA di antara tahun bukti, sehingga kalimat ini tidak pernah mengandung tahun
 * yang tidak berdasar. Bila tidak ada tahun yang cocok, kalimatnya KOSONG dan
 * kejujurannya dibawa mekanisme peringatan tahun yang sudah ada
 * ("Tidak ada data untuk tahun … di SAPA.").
 */
export function kalimatPemetaan(waktu: WaktuRelatif | null, tahunBukti: Array<string | null | undefined>): string {
  if (!waktu) return '';
  const tersedia = new Set(
    tahunBukti
      .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      .map((t) => t.trim()),
  );
  const cocok = waktu.tahun.filter((t) => tersedia.has(t));
  if (cocok.length === 0) return '';
  const daftar = cocok.join(' dan ');
  return cocok.length === 1
    ? `"${waktu.frasa}" dimengerti sebagai tahun ${daftar}. `
    : `"${waktu.frasa}" dimengerti sebagai tahun ${daftar}. `;
}

/**
 * Pindahkan baris bukti bertahun yang dimaksud ke depan (urutan stabil: baris
 * lain tidak berubah relatif satu sama lain). TIDAK membuang apa pun.
 */
export function dahulukanTahun<T extends { tahun?: string | null }>(bukti: T[], tahun: string[]): T[] {
  if (!tahun.length) return bukti;
  const set = new Set(tahun);
  const depan: T[] = [];
  const belakang: T[] = [];
  for (const b of bukti) {
    const t = typeof b.tahun === 'string' ? b.tahun.trim() : '';
    (set.has(t) ? depan : belakang).push(b);
  }
  return depan.length ? [...depan, ...belakang] : bukti;
}
