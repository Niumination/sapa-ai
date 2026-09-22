// ─── Sitasi per klaim (FR-19) ─────────────────────────────────────────────────
//
// MENGAPA ADA
// Sampai FR-26, pembaca sudah tahu: data ditarik kapan (FR-25), pertanyaan apa
// yang belum terlayani (FR-27), dan siapa yang menyusun narasi (FR-26). Yang belum:
// penunjukan LANGSUNG — kalimat mana berdiri di atas baris bukti yang mana. Tanpa
// itu, memverifikasi satu angka berarti membandingkan seluruh daftar bukti dengan
// seluruh narasi; dengan itu, cukup melihat baris yang ditunjuk.
//
// Definisi yang dipakai (sengaja sempit dan dapat diuji):
//   KLAIM = kalimat yang memuat sekurang-kurangnya satu ANGKA NILAI, yaitu angka
//   yang menyatakan besaran data (mis. "9.610", "31,4", "1,44 Triliun").
//   Kalimat yang hanya memuat tahun ("sejak 2025"), jumlah meta ("ditemukan 1
//   indikator", "3 OPD"), atau tidak memuat angka sama sekali BUKAN klaim —
//   karena tidak ada nilai data yang bisa salah dirujuk.
//
// Jaminan yang diberikan modul ini:
//   1. TIDAK PERNAH mengarang rujukan. Penanda [n] hanya dipasang bila angkanya
//      benar-benar cocok dengan baris bukti ke-n (dengan toleransi pembulatan,
//      mis. "1,44 Triliun" vs nilai penuh 1.438.857.592.538,6).
//   2. Klaim yang tidak menemukan baris bukti TIDAK diberi penanda dan DILAPORKAN
//      pada `ringkas.tanpaSitasi` — inilah angka yang dipakai gerbang mutu
//      ("0 klaim tanpa rujukan").
//   3. Idempoten: penanda yang sudah ada dibersihkan lebih dahulu, sehingga modul
//      boleh dipanggil pada narasi yang sudah bersitasi (mis. dari riwayat).
//
// CATATAN PENTING tentang nomor penanda
//   `[n]` menunjuk URUTAN BARIS BUKTI pada daftar yang ditampilkan bersama narasi
//   itu (bukan id internal). Karena tampilan boleh mengurutkan ulang bukti
//   (mis. menaikkan baris yang paling relevan ke atas), nomor penanda dihitung
//   dari urutan bukti yang benar-benar dipakai pada konteksnya.

import { parseNilaiSapa } from '@/lib/format-singkat';

/** Baris bukti minimum yang dibutuhkan untuk merujuk. */
export interface BuktiSitasi {
  indikator: string;
  nilai: string;
  satuan?: string;
  tahun?: string | null;
  opd?: string;
}

export interface RingkasSitasi {
  /** Jumlah kalimat yang menyatakan angka nilai. */
  totalKlaim: number;
  /** Klaim yang berhasil dirujuk ke sekurang-kurangnya satu baris bukti. */
  bersitasi: number;
  /** Klaim yang TIDAK dapat dirujuk (idealnya kosong) — dipotong agar ringkas. */
  tanpaSitasi: string[];
}

export interface HasilSitasi {
  /** Narasi dengan penanda [n] pada tiap kalimat klaim. */
  narasi: string;
  ringkas: RingkasSitasi;
}

/** Faktor skala yang boleh mengikuti angka ("1,44 Triliun"). */
const FAKTOR_SKALA: Record<string, number> = {
  triliun: 1e12,
  triliunan: 1e12,
  miliar: 1e9,
  milyar: 1e9,
  miliaran: 1e9,
  juta: 1e6,
  jutaan: 1e6,
  ribu: 1e3,
  ribuan: 1e3,
};

/**
 * Kata yang menandakan angkanya bukan nilai data melainkan keterangan sistem
 * ("ditemukan 2 indikator", "3 OPD", "5 record"). Angka semacam ini tidak perlu
 * dirujuk: tidak ada baris bukti yang bisa menampungnya.
 */
const KATA_META =
  /^\s*(indikator|opd|record|entri|baris|kolom|kata kunci|keyword|dataset|sumber|temuan|hasil terkait|dokumen)\b/i;

/** Batas jumlah penanda per kalimat — lebih dari ini membuat bacaan berat. */
export const MAKS_PENANDA = 3;
/** Toleransi kecocokan relatif (pembulatan tampilan 2 desimal ⇒ ≤ 0,5%). */
const TOLERANSI_RELATIF = 0.006;

interface TokenAngka {
  /** Angka setelah skala diterapkan (mis. "1,44 Triliun" → 1.44e12). */
  nilai: number;
  /** Teks asli di narasi (dipakai untuk penelusuran/uji). */
  teks: string;
}

/** Buang penanda lama supaya fungsi ini idempoten. */
function tanpaPenanda(teks: string): string {
  return teks.replace(/\s*\[\d+(?:\]\[\d+)*\]/g, '').replace(/\s{2,}/g, ' ');
}

/** Pecah narasi menjadi kalimat — baris baru & butir "•" juga memisahkan. */
export function pecahKalimat(narasi: string): string[] {
  return narasi
    .split(/\n+/)
    .flatMap((baris) => baris.split(/(?<=[.!?])\s+/))
    .map((k) => k.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter((k) => k.length > 0);
}

/** Ambil angka nilai (bukan tahun, bukan jumlah meta) dari sebuah kalimat. */
function tokenNilai(kalimat: string): TokenAngka[] {
  const keluar: TokenAngka[] = [];
  const pola = /\d[\d.]*(?:,\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = pola.exec(kalimat)) !== null) {
    const teks = m[0];
    const sesudah = kalimat.slice(m.index + teks.length);

    // Tahun (4 digit 1900–2100) bukan nilai data: ia keterangan waktu.
    const polos = teks.replace(/\./g, '');
    if (/^\d{4}$/.test(polos) && Number(polos) >= 1900 && Number(polos) <= 2100) continue;

    const skala = sesudah.match(/^\s*([a-zA-Z]+)/)?.[1]?.toLowerCase();
    const faktor = skala ? FAKTOR_SKALA[skala] ?? 1 : 1;
    const nilaiDasar = parseNilaiSapa(teks);
    if (nilaiDasar === null) continue;

    // "ditemukan 2 indikator" / "5 record" → keterangan sistem, bukan nilai data.
    const sisaSetelahSkala = skala && FAKTOR_SKALA[skala] ? sesudah.replace(/^\s*[a-zA-Z]+/, '') : sesudah;
    if (faktor === 1 && KATA_META.test(sesudah)) continue;
    if (faktor !== 1 && KATA_META.test(sisaSetelahSkala)) continue;

    keluar.push({ nilai: nilaiDasar * faktor, teks });
  }
  return keluar;
}

/** Kata bermakna (≥ 4 aksara) dari sebuah label, untuk mencocokkan entitas. */
function kataBermakna(label: string | undefined | null): string[] {
  if (!label) return [];
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((k) => k.length >= 4);
}

/**
 * Beri penanda sitasi `[n]` pada setiap kalimat klaim.
 *
 * `bukti` harus berupa daftar yang urutannya SAMA dengan yang ditampilkan pembaca,
 * karena nomor penanda menunjuk urutan itu.
 */
export function beriSitasi(narasiMentah: string, bukti: BuktiSitasi[]): HasilSitasi {
  const narasi = tanpaPenanda(narasiMentah ?? '');
  const kalimat = pecahKalimat(narasi);
  const nilaiBukti = bukti.map((b) => parseNilaiSapa(b.nilai));

  let totalKlaim = 0;
  let bersitasi = 0;
  const tanpaSitasi: string[] = [];
  const hasilKalimat: string[] = [];

  for (const k of kalimat) {
    const token = tokenNilai(k);
    if (token.length === 0) {
      hasilKalimat.push(k);
      continue;
    }

    totalKlaim += 1;

    // Skor per baris bukti: berapa angka yang cocok + bonus entitas.
    const skor = bukti.map((b, i) => {
      const nilai = nilaiBukti[i];
      let cocok = 0;
      if (nilai !== null) {
        for (const t of token) {
          const rel = Math.abs(nilai - t.nilai) / Math.max(Math.abs(nilai), 1);
          if (rel <= TOLERANSI_RELATIF || (Number.isInteger(nilai) && Math.abs(nilai - t.nilai) < 0.5)) cocok += 1;
        }
      }
      const kataKalimat = new Set(kataBermakna(k).length ? k.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 4) : []);
      const bonusEntitas =
        (kataBermakna(b.indikator).some((x) => kataKalimat.has(x)) ? 1 : 0) +
        (kataBermakna(b.opd).some((x) => kataKalimat.has(x)) ? 1 : 0);
      return { i, cocok, nilaiSkor: cocok * 3 + bonusEntitas, rel: nilai === null ? Infinity : Math.min(...token.map((t) => Math.abs(nilai - t.nilai) / Math.max(Math.abs(nilai), 1))) };
    });

    const layak = skor
      .filter((s) => s.cocok > 0)
      .sort((a, b) => b.nilaiSkor - a.nilaiSkor || a.rel - b.rel || a.i - b.i)
      .slice(0, MAKS_PENANDA)
      .map((s) => s.i)
      .sort((a, b) => a - b);

    if (layak.length === 0) {
      // Jujur: kalimat menyatakan angka tetapi tidak ada baris bukti yang cocok.
      if (tanpaSitasi.length < 5) tanpaSitasi.push(k.length > 120 ? `${k.slice(0, 117)}…` : k);
      hasilKalimat.push(k);
      continue;
    }

    bersitasi += 1;
    const penanda = layak.map((i) => `[${i + 1}]`).join('');
    hasilKalimat.push(sisipkanPenanda(k, penanda));
  }

  return {
    narasi: hasilKalimat.join(' '),
    ringkas: { totalKlaim, bersitasi, tanpaSitasi },
  };
}

/** Sisipkan penanda sebelum tanda baca akhir kalimat (gaya catatan akademik). */
function sisipkanPenanda(kalimat: string, penanda: string): string {
  const m = kalimat.match(/([.!?]+)$/);
  if (!m) return `${kalimat} ${penanda}`;
  return `${kalimat.slice(0, kalimat.length - m[1].length).trimEnd()} ${penanda}${m[1]}`;
}

/**
 * Bentuk siap-pakai untuk balasan API (FR-19).
 *
 * Dipakai jalur JSON maupun streaming supaya kedua jalur tidak pernah berbeda.
 * Indeks penanda di sini menunjuk urutan `evidence` pada BALASAN API (apa yang
 * dilihat pemanggil API); tampilan web menghitung ulang dari urutan bukti versinya
 * sendiri sehingga nomor penanda selalu cocok dengan tabel yang terlihat.
 */
export function sitasiBalasan(
  narasi: string,
  bukti: BuktiSitasi[],
): { narasiBersitasi: string; sitasi: RingkasSitasi } {
  const hasil = beriSitasi(narasi ?? '', bukti ?? []);
  return { narasiBersitasi: hasil.narasi, sitasi: hasil.ringkas };
}
