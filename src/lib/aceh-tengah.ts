// ─── Referensi wilayah Kabupaten Aceh Tengah ───
//
// KOREKSI DATA (LAPORAN_AUDIT_PRODUCTION_READINESS.md §P1-03)
//
// Daftar sebelumnya berisi 15 entri dengan 4 kesalahan fatal:
//   • "Banda Mulia"  → kecamatan di Kabupaten Aceh Tamiang, bukan Aceh Tengah
//   • "Burni Telong" → wilayah di Kabupaten Bener Meriah
//   • "Permata"      → kecamatan di Kabupaten Bener Meriah
//   • "Bies Penjara" → nama keliru, yang benar "Bies"
// dan 2 kecamatan resmi hilang: "Bintang" dan "Jagong Jeget".
//
// SUMBER (keduanya publik & bebas diakses):
//   1. Nama & jumlah (14 kecamatan) — Wikipedia "Kabupaten Aceh Tengah",
//      tabel kode Kemendagri: https://id.wikipedia.org/wiki/Kabupaten_Aceh_Tengah
//   2. Koordinat titik pusat — Wikidata (CC0), properti P625 pada item
//      dengan P31=kecamatan dan P131=Q5675 (Kabupaten Aceh Tengah).
//      Query: https://query.wikidata.org/
//
// CATATAN: kode Kemendagri sengaja TIDAK disertakan karena sumber publik yang
// tersedia memuat duplikasi kode (11.04.18 tercatat untuk dua kecamatan
// berbeda). Lebih baik tidak menampilkan data daripada menampilkan yang salah.
// Bila Diskominfo punya SK resmi berisi kode wilayah, tambahkan di sini.

export interface Kecamatan {
  /** Nama resmi kecamatan. */
  nama: string;
  /** Lintang titik pusat (WGS84). */
  lat: number;
  /** Bujur titik pusat (WGS84). */
  lng: number;
  /** ID item Wikidata — jejak sumber agar bisa ditelusuri ulang. */
  wikidataId: string;
}

/** 14 kecamatan resmi Kabupaten Aceh Tengah, urut alfabetis. */
export const KECAMATAN_ACEH_TENGAH: readonly Kecamatan[] = [
  { nama: 'Atu Lintang', lat: 4.45, lng: 96.766667, wikidataId: 'Q12200304' },
  { nama: 'Bebesen', lat: 4.633333, lng: 96.816667, wikidataId: 'Q9637483' },
  { nama: 'Bies', lat: 4.616667, lng: 96.8, wikidataId: 'Q9634173' },
  { nama: 'Bintang', lat: 4.533333, lng: 97.133333, wikidataId: 'Q9634978' },
  { nama: 'Celala', lat: 4.566667, lng: 96.716667, wikidataId: 'Q12478440' },
  { nama: 'Jagong Jeget', lat: 4.4, lng: 96.733333, wikidataId: 'Q9633859' },
  { nama: 'Kebayakan', lat: 4.65, lng: 96.85, wikidataId: 'Q9636774' },
  { nama: 'Ketol', lat: 4.8, lng: 96.6, wikidataId: 'Q9636243' },
  { nama: 'Kute Panang', lat: 4.7, lng: 96.766667, wikidataId: 'Q9634318' },
  { nama: 'Laut Tawar', lat: 4.615831, lng: 96.854939, wikidataId: 'Q9640235' },
  { nama: 'Linge', lat: 4.383333, lng: 97.0, wikidataId: 'Q9636587' },
  { nama: 'Pegasing', lat: 4.516667, lng: 96.783333, wikidataId: 'Q9636414' },
  { nama: 'Rusip Antara', lat: 4.683333, lng: 96.533333, wikidataId: 'Q9636658' },
  { nama: 'Silih Nara', lat: 4.616667, lng: 96.75, wikidataId: 'Q9636472' },
] as const;

/** Jumlah kecamatan resmi — dipakai sebagai invariant pada tes. */
export const JUMLAH_KECAMATAN = 14;

/** Ibu kota kabupaten (Takengon) — dipakai sebagai titik tengah peta. */
export const PUSAT_KABUPATEN = {
  nama: 'Takengon',
  lat: 4.6,
  lng: 96.85,
  wikidataId: 'Q4189818',
} as const;

/** Atribusi sumber yang wajib ditampilkan di UI. */
export const SUMBER_WILAYAH = {
  nama: [
    {
      label: 'Wikipedia — Kabupaten Aceh Tengah',
      url: 'https://id.wikipedia.org/wiki/Kabupaten_Aceh_Tengah',
    },
  ],
  koordinat: [
    { label: 'Wikidata (CC0)', url: 'https://www.wikidata.org/wiki/Q5675' },
  ],
  peta: [
    { label: '© OpenStreetMap contributors (ODbL)', url: 'https://www.openstreetmap.org/copyright' },
  ],
} as const;
