// ─── FR-18 · Bentuk jawaban per NIAT ───
//
// MASALAH YANG DISELESAIKAN. Sebelum ini, niat pertanyaan HANYA memengaruhi
// prompt (perintah kepada model) dan tidak pernah memengaruhi BENTUK jawaban
// yang dilihat pengguna. Akibatnya pertanyaan "tren stunting 5 tahun" dan
// "nilai stunting 2025" menghasilkan panel yang sama: bukti apa adanya, urutan
// apa adanya, tanpa pemotongan — sehingga pengguna harus menyortir sendiri
// untuk melihat 5 besar, harus mencari tahun sendiri untuk melihat tren, dan
// tidak pernah diberi tahu bahwa porsi tidak dapat dihitung karena totalnya
// tidak ada. Satu bentuk untuk semua niat = pengalaman buruk (dokumen 10).
//
// APA YANG DIATUR MODUL INI (dan yang TIDAK):
//   ✅ urutan baris bukti (menurun/menaik/kronologis), jumlah baris yang dipajang,
//      judul panel, kolom tambahan (mis. porsi), serta CATATAN KEJUJURAN ketika
//      bentuk yang diminta tidak dapat dipenuhi dari bukti yang ada;
//   ❌ tidak mengarang angka: porsi hanya dihitung bila totalnya ADA di bukti,
//      tren hanya dinyatakan bila ada ≥ 2 tahun berbeda, peringkat tidak pernah
//      mencampur satuan yang berbeda tanpa menyebutkannya.
//
// Modul ini MURNI (tanpa jaringan, tanpa jam) supaya dapat diuji langsung.

import type { NiatJawaban } from '@/lib/intent-meta';
import { normalisasiNilai } from '@/lib/parse-numeric';

export type BentukVisual = 'metric' | 'tabel' | 'batang' | 'garis' | 'komposisi' | 'teks';
export type UrutanBaris = 'menurun' | 'menaik' | 'kronologis' | 'tetap';

/** Bukti minimum yang dibutuhkan modul ini (cocok dengan `EvidenceItem`). */
export interface BarisBukti {
  id: number | string;
  indikator: string;
  nilai: string;
  satuan: string;
  opd?: string;
  tahun?: string | null;
}

export interface BentukJawaban {
  niat: NiatJawaban | null;
  /** Nama bentuk untuk dibaca manusia (badge UI & log). */
  label: string;
  visual: BentukVisual;
  urutan: UrutanBaris;
  /** Jumlah maksimum baris yang dipajang; `null` = tampilkan semua. */
  batas: number | null;
  judul: string;
  /**
   * Kolom tambahan yang dihitung modul ini (mis. `porsi`). Kosong = tidak ada
   * kolom turunan, dan UI hanya menampilkan kolom bukti biasa.
   */
  kolomTurunan: 'porsi' | null;
  /**
   * Catatan kejujuran: alasan bentuk yang diminta tidak sepenuhnya dapat
   * dipenuhi. Ditampilkan ke pengguna; `undefined` = bentuk terpenuhi.
   */
  catatan?: string;
}

/** Arah yang diminta pengguna untuk niat peringkat. */
export type ArahPeringkat = 'menurun' | 'menaik';

const POLA_TERENDAH = /\b(terendah|tersedikit|terkecil|paling sedikit|paling rendah)\b/i;

/**
 * Gabungkan catatan bentuk dengan catatan tentang baris yang DIPOTONG batas.
 *
 * Mengapa ada: bentuk "5 besar" memang hanya memajang 5 baris, tetapi pengguna
 * berhak tahu bahwa ada bukti lain yang tidak ikut dipajang — kalau tidak,
 * panel terlihat seolah buktinya hanya lima. Ini aturan yang muncul dari uji:
 * versi pertama membuang baris tanpa angka tanpa sepatah kata.
 */
function catatanBatas(evidence: BarisBukti[], batas: number | null, catatan?: string): string | undefined {
  if (batas === null || evidence.length <= batas) return catatan;
  const sisa = evidence.length - batas;
  const tambahan = `${sisa} baris bukti lain tidak dipajang karena bentuk ini menampilkan maksimum ${batas} baris — nilainya tetap dipakai menjawab (lihat jumlah bukti pada keterangan sumber).`;
  return catatan ? `${catatan} ${tambahan}` : tambahan;
}

/** Niat yang benar-benar MENGUBAH bentuk jawaban (dipakai uji & dokumentasi). */
export const NIAT_BERBENTUK: NiatJawaban[] = [
  'tren',
  'peringkat',
  'komposisi',
  'distribusi',
  'perbandingan',
  'nilai_saat_ini',
];

/** Tabel kontrak: niat → bentuk. Inilah "template khusus per niat" FR-18. */
export const KONTRAK_BENTUK: Record<NiatJawaban, Pick<BentukJawaban, 'label' | 'visual' | 'urutan' | 'batas'>> = {
  tren: { label: 'Tren antarperiode', visual: 'garis', urutan: 'kronologis', batas: null },
  peringkat: { label: 'Peringkat 5 besar', visual: 'batang', urutan: 'menurun', batas: 5 },
  komposisi: { label: 'Komposisi & porsi', visual: 'komposisi', urutan: 'menurun', batas: 10 },
  distribusi: { label: 'Sebaran per kelompok', visual: 'batang', urutan: 'menurun', batas: 10 },
  perbandingan: { label: 'Perbandingan berdampingan', visual: 'tabel', urutan: 'tetap', batas: 5 },
  nilai_saat_ini: { label: 'Nilai saat ini', visual: 'metric', urutan: 'tetap', batas: 5 },
  meta_katalog: { label: 'Keterangan katalog', visual: 'teks', urutan: 'tetap', batas: null },
  sebab: { label: 'Angka terdekat (bukan sebab)', visual: 'teks', urutan: 'tetap', batas: 5 },
  personal: { label: 'Tidak tersedia (data per orang)', visual: 'teks', urutan: 'tetap', batas: 0 },
};

/** Angka dari teks nilai SAPA: "1.234,56" → 1234.56; "31,4" → 31.4; "-" → null. */
export function angkaDari(nilai: string): number | null {
  const teks = normalisasiNilai(nilai).replace(/[^\d,.\-]/g, '');
  if (!teks || teks === '-' || teks === ',' || teks === '.') return null;
  // Format Indonesia: titik = pemisah ribuan, koma = desimal.
  const polos = teks.replace(/\./g, '').replace(',', '.');
  const angka = Number(polos);
  return Number.isFinite(angka) ? angka : null;
}

/** Apakah baris ini tampak seperti TOTAL (bukan bagian)? Dipakai niat komposisi. */
export function tampakTotal(indikator: string): boolean {
  return /\b(total|jumlah|keseluruhan|akumulasi|seluruh)\b/i.test(indikator);
}

/**
 * Apakah niat ini dimatikan paksa (untuk kontrol negatif harness & A/B).
 *
 * `SAPA_BENTUK_NIAT=off` mengembalikan bentuk NETRAL untuk semua niat —
 * dipakai `scripts/uji-bentuk-jawaban.mjs` untuk membuktikan bahwa pemeriksaan
 * benar-benar bergantung pada bentuk, bukan lulus karena kebetulan.
 */
export function bentukDimatikan(): boolean {
  return (process.env.SAPA_BENTUK_NIAT ?? '').toLowerCase() === 'off';
}

/**
 * Tentukan bentuk jawaban untuk sebuah niat.
 *
 * @param niat hasil router niat (`deteksiNiat`)
 * @param query pertanyaan pengguna — dipakai HANYA untuk arah peringkat
 * @param evidence bukti yang tersedia (untuk menilai apakah bentuk dapat dipenuhi)
 */
export function bentukUntukNiat(
  niat: NiatJawaban | null,
  query: string,
  evidence: BarisBukti[] = [],
): BentukJawaban {
  const kunci: NiatJawaban = niat ?? 'nilai_saat_ini';
  const kontrak = KONTRAK_BENTUK[kunci];
  const dasar: BentukJawaban = {
    niat,
    label: kontrak.label,
    visual: kontrak.visual,
    urutan: kontrak.urutan,
    batas: kontrak.batas,
    judul: kontrak.label,
    kolomTurunan: null,
  };

  if (bentukDimatikan()) {
    return { ...dasar, label: 'Bentuk netral (dimatikan)', visual: 'teks', urutan: 'tetap', batas: null, judul: 'Bentuk netral' };
  }

  const tahunUnik = [...new Set(evidence.map((e) => (e.tahun ?? '').trim()).filter((t) => t && t !== '—'))];

  switch (kunci) {
    case 'peringkat': {
      const arah: ArahPeringkat = POLA_TERENDAH.test(query) ? 'menaik' : 'menurun';
      // Campur satuan → peringkat lintas satuan menyesatkan; sebutkan apa adanya.
      const satuan = [...new Set(evidence.map((e) => e.satuan.trim()).filter(Boolean))];
      const catatan =
        satuan.length > 1
          ? `Bukti memuat ${satuan.length} satuan berbeda (${satuan.slice(0, 3).join(', ')}); peringkat lintas satuan tidak selalu sebanding — periksa kolom satuan.`
          : undefined;
      return {
        ...dasar,
        urutan: arah,
        judul: arah === 'menurun' ? '5 besar (nilai tertinggi)' : '5 teratas (nilai terendah)',
        catatan: catatanBatas(evidence, dasar.batas, catatan),
      };
    }
    case 'tren': {
      const catatan =
        tahunUnik.length < 2
          ? `Bukti hanya memuat ${tahunUnik.length === 0 ? 'tidak ada' : `${tahunUnik.length}`} tahun berbeda — tren tidak dapat disimpulkan dari satu titik data.`
          : undefined;
      return { ...dasar, judul: 'Perubahan antarperiode', catatan };
    }
    case 'komposisi': {
      // Dua syarat, bukan satu: harus ada baris TOTAL (pembagi) DAN baris BAGIAN
      // yang berangka. Kasus nyata di korpus produksi: semua baris yang terambil
      // bernama "Jumlah ..." sehingga tidak ada bagian untuk diporsi — dahulu
      // ini mengirim `porsi: {}` (objek kosong) yang seolah menjawab "porsi 0%".
      const total = evidence.filter((e) => tampakTotal(e.indikator));
      const bagian = evidence.filter((e) => !tampakTotal(e.indikator) && angkaDari(e.nilai) !== null);
      const bisaPorsi = total.length > 0 && bagian.length > 0;
      const catatan =
        total.length === 0
          ? 'Total keseluruhan tidak ada di bukti — porsi tidak dihitung (SAPA tidak menjumlahkan sendiri).'
          : bagian.length === 0
            ? 'Semua baris bukti tampak sebagai total — tidak ada baris bagian yang dapat diporsi.'
            : undefined;
      return {
        ...dasar,
        judul: 'Komposisi terhadap keseluruhan',
        kolomTurunan: bisaPorsi ? 'porsi' : null,
        catatan: catatanBatas(evidence, dasar.batas, catatan),
      };
    }
    case 'distribusi': {
      const catatan =
        evidence.length > 0 && evidence.length <= 2
          ? 'Bukti hanya memuat sedikit kelompok — sebaran mungkin tidak mewakili keseluruhan.'
          : undefined;
      return { ...dasar, judul: 'Sebaran per kelompok', catatan: catatanBatas(evidence, dasar.batas, catatan) };
    }
    case 'perbandingan': {
      const catatan =
        evidence.length < 2
          ? 'Bukti kurang dari dua nilai — perbandingan tidak dapat disusun.'
          : undefined;
      return { ...dasar, judul: 'Perbandingan berdampingan', catatan: catatanBatas(evidence, dasar.batas, catatan) };
    }
    case 'sebab':
      return {
        ...dasar,
        judul: 'Angka terdekat (SAPA tidak menyimpan sebab)',
        catatan: 'SAPA menyimpan angka, bukan sebab-akibat. Angka di bawah adalah konteks terdekat, bukan penjelasan sebab.',
      };
    default:
      return dasar;
  }
}

/**
 * Susun ulang baris bukti mengikuti bentuk: urutkan, batasi, dan (bila diminta)
 * hitung porsi terhadap total yang ADA di bukti.
 *
 * Baris yang tidak punya angka tetap dipertahankan di akhir urutan — menyembunyikan
 * baris tanpa angka akan membuat jawaban tampak lebih lengkap daripada buktinya.
 */
export function susunBaris<T extends BarisBukti>(evidence: T[], bentuk: BentukJawaban): T[] {
  const berangka = evidence.map((e) => ({ baris: e, angka: angkaDari(e.nilai) }));

  const urut = (a: { angka: number | null }, b: { angka: number | null }) => {
    if (a.angka === null && b.angka === null) return 0;
    if (a.angka === null) return 1;
    if (b.angka === null) return -1;
    return b.angka - a.angka;
  };

  let hasil: T[];
  if (bentuk.urutan === 'kronologis') {
    hasil = [...berangka]
      .sort((a, b) => {
        const ta = (a.baris.tahun ?? '').trim();
        const tb = (b.baris.tahun ?? '').trim();
        // Tahun kosong/"—" selalu di belakang, terlepas dari arah.
        if (!ta && !tb) return 0;
        if (!ta) return 1;
        if (!tb) return -1;
        return ta.localeCompare(tb);
      })
      .map((x) => x.baris);
  } else if (bentuk.urutan === 'menurun') {
    hasil = [...berangka].sort(urut).map((x) => x.baris);
  } else if (bentuk.urutan === 'menaik') {
    hasil = [...berangka].sort((a, b) => -urut(a, b)).map((x) => x.baris);
  } else {
    hasil = [...evidence];
  }

  return bentuk.batas === null ? hasil : hasil.slice(0, bentuk.batas);
}

/**
 * Terapkan bentuk pada sekumpulan bukti — SATU pintu untuk rute API maupun
 * panel. Mengembalikan bentuk, baris yang sudah ditata, dan porsi (bila ada
 * total di bukti). Rute memakainya supaya urutan yang DISAJIKAN dapat diperiksa
 * lewat HTTP; panel memakainya supaya bentuk yang digambar sama persis.
 */
export function terapkanBentuk<T extends BarisBukti>(
  niat: NiatJawaban | null,
  query: string,
  evidence: T[],
): { bentuk: BentukJawaban; baris: T[]; porsi: Record<string, number> | null } {
  const bentuk = bentukUntukNiat(niat, query, evidence);
  const baris = susunBaris(evidence, bentuk);
  const peta = bentuk.kolomTurunan === 'porsi' ? hitungPorsi(evidence) : null;
  const isi = peta ? [...peta.entries()] : [];
  // Objek kosong BUKAN jawaban: kalau tidak ada satu pun porsi yang dapat
  // dihitung, kirim null supaya tidak ada yang salah tafsir sebagai "0%".
  const porsi = isi.length > 0
    ? Object.fromEntries(isi.map(([id, v]) => [String(id), Math.round(v * 10) / 10]))
    : null;
  return { bentuk, baris, porsi };
}

/**
 * Porsi setiap baris terhadap total yang ADA di bukti.
 *
 * Mengembalikan `null` bila tidak ada baris total — pemanggil WAJIB menampilkan
 * catatan kejujuran, bukan menghitung total sendiri.
 */
export function hitungPorsi(evidence: BarisBukti[]): Map<number | string, number> | null {
  const total = evidence
    .filter((e) => tampakTotal(e.indikator))
    .map((e) => angkaDari(e.nilai))
    .filter((n): n is number => n !== null && n > 0);
  if (total.length === 0) return null;
  const pembagi = Math.max(...total);
  const peta = new Map<number | string, number>();
  for (const e of evidence) {
    const angka = angkaDari(e.nilai);
    if (angka === null || tampakTotal(e.indikator)) continue;
    peta.set(e.id, (angka / pembagi) * 100);
  }
  return peta;
}
