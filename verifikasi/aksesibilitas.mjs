// ─── Pemeriksa aksesibilitas (NFR-09) — fungsi murni, tanpa dependensi ───
//
// Dipakai oleh DUA pengguna supaya tidak ada dua kebenaran:
//   1. `scripts/uji-aksesibilitas.mjs` — memeriksa HTML yang benar-benar disajikan server.
//   2. `src/lib/__tests__/aksesibilitas-komponen.test.ts` — memeriksa markup komponen
//      (termasuk panel jawaban yang tidak muncul pada pemuatan pertama).
//
// Cakupan sengaja dibatasi pada hal yang DAPAT diperiksa tanpa peramban: struktur
// semantik, nama aksesibel, label, urutan judul, wilayah live, dan kontras warna
// dari token yang benar-benar dipakai. Yang TIDAK dapat diperiksa di sini (dan
// karenanya tidak diklaim): urutan fokus nyata, perangkap fokus, dan ukuran sasaran
// dalam piksel — lihat catatan batas di `24-LAPORAN-NFR-09.md`.

// ── 1. Kontras warna (WCAG 2.2 SC 1.4.3 & 1.4.11) ─────────────────────────

/** @param {string} hex @returns {{r:number,g:number,b:number}} */
export function uraiHex(hex) {
  const t = hex.trim().replace(/^#/, '');
  const penuh = t.length === 3 ? t.split('').map((c) => c + c).join('') : t;
  if (!/^[0-9a-fA-F]{6}$/.test(penuh)) throw new Error(`warna tidak dikenal: ${hex}`);
  return {
    r: parseInt(penuh.slice(0, 2), 16),
    g: parseInt(penuh.slice(2, 4), 16),
    b: parseInt(penuh.slice(4, 6), 16),
  };
}

/** Luminans relatif menurut WCAG 2.x. @param {string} hex */
export function luminansRelatif(hex) {
  const { r, g, b } = uraiHex(hex);
  const kanal = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * kanal[0] + 0.7152 * kanal[1] + 0.0722 * kanal[2];
}

/** Rasio kontras WCAG antara dua warna (1–21). */
export function rasioKontras(a, b) {
  const l1 = luminansRelatif(a);
  const l2 = luminansRelatif(b);
  const [terang, gelap] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (terang + 0.05) / (gelap + 0.05);
}

/**
 * Ambang WCAG 2.2:
 *   - teks normal (< 24 px, atau < 18,66 px tebal)  → 4,5:1
 *   - teks besar (≥ 24 px, atau ≥ 18,66 px tebal)   → 3,0:1
 *   - komponen UI & batas (SC 1.4.11)               → 3,0:1
 */
export const AMBANG = { teks: 4.5, 'teks-besar': 3, ui: 3 };

/**
 * Pasangan warna yang BENAR-BENAR dipakai di halaman utama. Setiap baris wajib
 * menyebut di mana ia dipakai supaya pemeriksaan ini tidak menjadi daftar
 * hiasan: kalau sebuah warna dipakai di tempat lain, tambahkan barisnya.
 */
export const PASANGAN_KONTRAS = [
  // Kepala gelap (--brand-deep #0F2A1E)
  { nama: 'Kepala · subjudul OPD (--text-on-dark-muted)', depan: '#B8CBBE', belakang: '#0F2A1E', jenis: 'teks', di: 'dashboard/layout.tsx (p uppercase tracking-widest)' },
  { nama: 'Kepala · tanggal (--text-on-dark-muted)', depan: '#B8CBBE', belakang: '#0F2A1E', jenis: 'teks', di: 'dashboard/layout.tsx (p text-[10px] tanggal)' },
  { nama: 'Sidebar · label merek di strip gelap (--text-on-dark-muted)', depan: '#B8CBBE', belakang: '#0F2A1E', jenis: 'teks', di: 'Sidebar.tsx (p SAPA Smart AI di strip brand-deep)' },
  { nama: 'Kepala · jam (--border)', depan: '#C6C3B4', belakang: '#0F2A1E', jenis: 'teks', di: 'dashboard/layout.tsx (p font-mono jam)' },
  { nama: 'Kepala · lencana Online (#52B788)', depan: '#52B788', belakang: '#0F2A1E', jenis: 'teks', di: 'dashboard/layout.tsx (span Online)' },
  { nama: 'Kepala · lencana SAPA (#D9C284)', depan: '#D9C284', belakang: '#0F2A1E', jenis: 'teks', di: 'dashboard/layout.tsx (span SAPA Connected)' },
  { nama: 'Kepala · h1 putih', depan: '#FFFFFF', belakang: '#0F2A1E', jenis: 'teks', di: 'dashboard/layout.tsx (h1 SAPA Smart AI)' },

  // Permukaan terang
  { nama: 'Isi · teks utama (--text di --background)', depan: '#1E2420', belakang: '#F5F3EC', jenis: 'teks', di: 'seluruh halaman' },
  { nama: 'Isi · teks paragraf (--text-body di kartu)', depan: '#4B5249', belakang: '#FFFFFF', jenis: 'teks', di: 'ExecutiveAnswerRenderer (p lead/narasi)' },
  { nama: 'Isi · teks samar (--text-muted di kartu)', depan: '#5C6358', belakang: '#FFFFFF', jenis: 'teks', di: 'label kecil di kartu' },
  { nama: 'Isi · teks samar di blok sekunder (--text-muted di --surface-muted)', depan: '#5C6358', belakang: '#E9E6DA', jenis: 'teks', di: 'kepala tabel (thead bg surface-muted)' },
  { nama: 'Isi · teks samar di halaman (--text-muted di --background)', depan: '#5C6358', belakang: '#F5F3EC', jenis: 'teks', di: 'keterangan di luar kartu' },
  { nama: 'Isi · tautan/merek (--brand di kartu)', depan: '#1B4332', belakang: '#FFFFFF', jenis: 'teks', di: 'tombol & judul bagian' },
  { nama: 'Isi · putih di atas merek (--on-brand di --brand)', depan: '#FFFFFF', belakang: '#1B4332', jenis: 'teks', di: 'tombol utama' },
  { nama: 'Panel narasi · keterangan sumber (#B8CBBE di --brand)', depan: '#B8CBBE', belakang: '#1B4332', jenis: 'teks', di: 'ExecutiveAnswerRenderer (p Sumber:)' },
  { nama: 'Panel narasi · peringatan sitasi (#F4E7C3 di --brand)', depan: '#F4E7C3', belakang: '#1B4332', jenis: 'teks', di: 'ExecutiveAnswerRenderer (p Perhatian:)' },
  { nama: 'Panel narasi · narasi putih (--on-brand di --brand)', depan: '#FFFFFF', belakang: '#1B4332', jenis: 'teks', di: 'ExecutiveAnswerRenderer (NarasiBersitasi)' },
  { nama: 'Bahaya · teks di tint (--danger di --danger-tint)', depan: '#B3261E', belakang: '#FBE3DE', jenis: 'teks', di: 'NotisTransparansi / pesan galat' },
  { nama: 'Peringatan · teks di tint (--secondary di --secondary-container)', depan: '#6F5716', belakang: '#F1E4C2', jenis: 'teks', di: 'token tema: dijaga aman-AA bila tint peringatan dipakai untuk teks' },
  { nama: 'Aksen · teks tersier di kartu (--tertiary)', depan: '#A15C38', belakang: '#FFFFFF', jenis: 'teks', di: 'label aksen' },

  // Komponen & batas (SC 1.4.11)
  { nama: 'Batas kartu (--border di kartu putih)', depan: '#8E8A76', belakang: '#FFFFFF', jenis: 'ui', di: 'border kartu & tombol garis' },
  { nama: 'Batas kartu di latar halaman (--border di --background)', depan: '#8E8A76', belakang: '#F5F3EC', jenis: 'ui', di: 'border kartu di dalam main' },
  { nama: 'Batas kuat (--border-strong di kartu putih)', depan: '#7E7A6A', belakang: '#FFFFFF', jenis: 'ui', di: 'border tombol sekunder' },
  // Cincin fokus dua lapis: garis gelap terlihat di permukaan terang (pasangan
  // pertama), halo putih terlihat di permukaan gelap (pasangan kedua).
  { nama: 'Cincin fokus gelap di permukaan terang (--focus-ring)', depan: '#0F2A1E', belakang: '#F5F3EC', jenis: 'ui', di: 'focus-visible pada kartu & halaman' },
  { nama: 'Halo fokus putih di permukaan gelap', depan: '#FFFFFF', belakang: '#0F2A1E', jenis: 'ui', di: 'focus-visible pada kepala/sidebar' },
];

/**
 * Periksa daftar pasangan warna.
 * @returns {{pelanggaran: string[], rincian: Array<{nama:string, rasio:number, ambang:number, lulus:boolean}>}}
 */
export function periksaKontras(pasangan = PASANGAN_KONTRAS) {
  const pelanggaran = [];
  const rincian = [];
  for (const p of pasangan) {
    const rasio = rasioKontras(p.depan, p.belakang);
    const ambang = AMBANG[p.jenis ?? 'teks'];
    const lulus = rasio + 1e-9 >= ambang;
    rincian.push({ nama: p.nama, rasio, ambang, lulus, jenis: p.jenis ?? 'teks', di: p.di });
    if (!lulus) {
      pelanggaran.push(
        `kontras ${rasio.toFixed(2)}:1 < ${ambang}:1 — ${p.nama} (${p.di}); perbaiki warna depan menjadi lebih ${luminansRelatif(p.depan) >= luminansRelatif(p.belakang) ? 'terang' : 'gelap'}`,
      );
    }
  }
  return { pelanggaran, rincian };
}

// ── 2. Pembacaan HTML tanpa peramban ──────────────────────────────────────

const KOSONG = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'area', 'col']);

/**
 * Ambil elemen menurut nama tag, termasuk isinya (menghormati tag bersarang).
 * @param {string} html @param {string} nama
 */
export function ambilElemen(html, nama) {
  const hasil = [];
  const re = new RegExp(`<${nama}\\b`, 'gi');
  let m;
  while ((m = re.exec(html)) !== null) {
    const ujungTag = html.indexOf('>', m.index);
    if (ujungTag === -1) break;
    const tag = html.slice(m.index, ujungTag + 1);
    if (KOSONG.has(nama) || /\/>$/.test(tag)) {
      hasil.push({ tag, isi: '', mulai: m.index });
      re.lastIndex = ujungTag + 1;
      continue;
    }
    const reNested = new RegExp(`<(/?)${nama}\\b[^>]*>`, 'gi');
    reNested.lastIndex = ujungTag + 1;
    let kedalaman = 1;
    let n = null;
    while ((n = reNested.exec(html)) !== null) {
      if (n[1] === '/') {
        kedalaman -= 1;
        if (kedalaman === 0) break;
      } else kedalaman += 1;
    }
    const akhir = n ? n.index : html.length;
    hasil.push({ tag, isi: html.slice(ujungTag + 1, akhir), mulai: m.index });
    re.lastIndex = n ? n.index + n[0].length : html.length;
  }
  return hasil;
}

/** Nilai atribut (dukung kutip ganda, tunggal, dan tanpa kutip). */
export function atr(tag, nama) {
  const re = new RegExp(`\\b${nama}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = tag.match(re);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? '';
}

/** Teks yang terlihat (tag dibuang). */
export function teksDari(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Peta id → teks, untuk menyelesaikan aria-labelledby. */
function petaId(html) {
  const peta = new Map();
  const re = /<([a-zA-Z][\w-]*)\b([^>]*?)\bid\s*=\s*"([^"]+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const ujung = html.indexOf('>', m.index);
    const nama = m[1];
    if (KOSONG.has(nama)) {
      peta.set(m[3], atr(html.slice(m.index, ujung + 1), 'value') ?? '');
      continue;
    }
    const tutup = html.indexOf(`</${nama}>`, ujung + 1);
    peta.set(m[3], teksDari(html.slice(ujung + 1, tutup === -1 ? html.length : tutup)));
  }
  return peta;
}

/**
 * Nama aksesibel versi ringkas (aria-label/Teks/label/title), cukup untuk menangkap
 * kontrol tanpa nama — bukan pengganti penuh algoritma AccName.
 */
export function namaAksesibel(tag, isi, peta) {
  const label = atr(tag, 'aria-label');
  if (label && label.trim()) return label.trim();
  const lab = atr(tag, 'aria-labelledby');
  if (lab) {
    const teks = lab
      .split(/\s+/)
      .map((id) => peta.get(id) ?? '')
      .join(' ')
      .trim();
    if (teks) return teks;
  }
  const teks = teksDari(isi);
  if (teks) return teks;
  const judul = atr(tag, 'title');
  if (judul && judul.trim()) return judul.trim();
  return '';
}

// ── 3. Pemeriksaan struktur ───────────────────────────────────────────────

/**
 * Periksa CSS yang benar-benar dikirim server (NFR-09).
 *
 * Tiga janji yang diperiksa: sasaran sentuh 24 px (SC 2.5.8), cincin fokus
 * (SC 2.4.7/2.4.11), dan penghormatan `prefers-reduced-motion`. Ketiganya hidup
 * di `src/app/globals.css`; di sini diperiksa dari sisi KELUARAN, supaya
 * penghapusan aturan (atau CSS yang gagal ter-build) tertangkap.
 *
 * @param {string} css
 * @returns {{pelanggaran: string[], temuan: {sasaran:boolean, fokus:boolean, gerak:boolean}}}
 */
export function periksaCss(css) {
  const pelanggaran = [];
  const bersih = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // Sasaran sentuh: cari blok aturan yang memuat min-height: 24px, lalu pastikan
  // selektornya mencakup tombol.
  const blok = [...bersih.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /min-height:\s*24px/.test(m[2]));
  const sasaran = blok.some((m) => /button|role=.?button|target-min/.test(m[1]));
  if (!sasaran) {
    pelanggaran.push(
      'CSS tanpa jaminan sasaran sentuh 24 px untuk tombol (SC 2.5.8) — aturan `button, [role=button] { min-height: 24px }` hilang',
    );
  }

  const fokus = /:focus-visible/.test(bersih) && /outline(-width)?\s*:\s*(2|3|4)px/.test(bersih);
  if (!fokus) {
    pelanggaran.push('CSS tanpa cincin fokus `:focus-visible` ber-outline ≥ 2 px (SC 2.4.7 & 2.4.11)');
  }

  const gerak = /prefers-reduced-motion/.test(bersih);
  if (!gerak) pelanggaran.push('CSS tidak menghormati `prefers-reduced-motion` (SC 2.3.3, bermanfaat bagi pengguna vestibular)');

  return { pelanggaran, temuan: { sasaran, fokus, gerak } };
}

/**
 * Pemeriksaan tingkat POTONGAN (fragmen komponen), bukan dokumen penuh.
 *
 * Dipisah supaya markup komponen yang tidak muncul pada pemuatan pertama —
 * terutama panel jawaban executive (tabel bukti, tombol ringkas) — dapat
 * diperiksa oleh uji unit tanpa harus merender seluruh halaman.
 *
 * @param {string} html @param {{nama?: string}} opsi
 * @returns {{pelanggaran: string[], catatan: string[]}}
 */
export function periksaPotonganHtml(html, opsi = {}) {
  const nama = opsi.nama ?? 'potongan';
  const pelanggaran = [];
  const catatan = [];
  const peta = petaId(html);

  // (6) gambar
  for (const g of ambilElemen(html, 'img')) {
    const alt = atr(g.tag, 'alt');
    const aria = atr(g.tag, 'aria-hidden');
    if (alt === null) pelanggaran.push(`[${nama}] <img> tanpa atribut alt (${atr(g.tag, 'src') ?? 'tanpa src'})`);
    else if (!alt.trim() && aria !== 'true') {
      catatan.push(`[${nama}] <img alt=""> tidak ditandai aria-hidden (boleh, bila memang dekoratif)`);
    }
  }

  // (7) kontrol: setiap tombol/tautan harus punya nama aksesibel
  let jumlahKontrol = 0;
  for (const nama_tag of ['button', 'a']) {
    for (const el of ambilElemen(html, nama_tag)) {
      const peran = atr(el.tag, 'role');
      if (nama_tag === 'a' && !atr(el.tag, 'href') && peran !== 'button') continue; // anchor tanpa href bukan kontrol
      if (atr(el.tag, 'aria-hidden') === 'true') continue;
      jumlahKontrol += 1;
      if (!namaAksesibel(el.tag, el.isi, peta)) {
        pelanggaran.push(`[${nama}] <${nama_tag}> tanpa nama aksesibel (tidak ada teks, aria-label, maupun title)`);
      }
    }
  }

  // (8) isian: setiap input harus punya label
  const idLabel = new Set(ambilElemen(html, 'label').map((l) => atr(l.tag, 'for')).filter(Boolean));
  for (const inp of ambilElemen(html, 'input')) {
    const type = (atr(inp.tag, 'type') ?? 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
    const id = atr(inp.tag, 'id');
    const labelPembungkus = ambilElemen(html, 'label').some((l) => l.isi.includes(inp.tag));
    const punya =
      (atr(inp.tag, 'aria-label') || '').trim() ||
      (atr(inp.tag, 'aria-labelledby') || '').trim() ||
      (id && idLabel.has(id)) ||
      labelPembungkus ||
      (atr(inp.tag, 'title') || '').trim();
    if (!punya) {
      pelanggaran.push(
        `[${nama}] <input type="${type}"> tanpa label (placeholder saja tidak cukup — SC 3.3.2); pakai aria-label atau <label for>`,
      );
    }
  }

  // (9) tabindex positif dilarang (urutan fokus kacau)
  //     Dipindai pada SEMUA elemen, bukan daftar tag tertentu: tabindex bisa
  //     muncul di mana saja, dan pemeriksaan yang hanya melihat beberapa tag
  //     akan lulus-palsu (kasus ini nyata — ditemukan uji diri harness).
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const ti = atr(m[0], 'tabindex');
    if (ti !== null && Number(ti) > 0) {
      pelanggaran.push(`[${nama}] tabindex="${ti}" positif pada <${m[1]}> — urutan fokus tidak lagi mengikuti dokumen`);
    }
  }

  // (10) elemen yang masih dapat difokus di dalam wilayah aria-hidden="true"
  //      (termasuk WARISAN dari leluhur: aria-hidden menyembunyikan seluruh subtree
  //      dari pembaca layar, tetapi papan ketik tetap dapat masuk ke sana).
  //      Diperiksa dengan tumpukan tag, bukan sekadar melihat atribut elemen itu
  //      sendiri — versi pertama hanya melihat elemen itu sendiri dan LOLOS-PALSU
  //      pada kasus <span aria-hidden="true"><a href=…>…</a></span>.
  const voide = KOSONG;
  const tumpukan = [];
  const tagSemua = [...html.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)];
  for (const m of tagSemua) {
    const tutup = m[1] === '/';
    const tag = m[2].toLowerCase();
    const atribute = m[3];
    if (tutup) {
      for (let i = tumpukan.length - 1; i >= 0; i -= 1) {
        if (tumpukan[i].tag === tag) {
          tumpukan.length = i;
          break;
        }
      }
      continue;
    }
    const tersembunyi = tumpukan.some((t) => t.sembunyi) || /aria-hidden\s*=\s*"true"/i.test(atribute);
    const dapatDifokus =
      (tag === 'a' && /\bhref\s*=/.test(atribute)) ||
      tag === 'button' ||
      (tag === 'input' && !/type\s*=\s*"hidden"/i.test(atribute)) ||
      tag === 'select' ||
      tag === 'textarea' ||
      /\btabindex\s*=\s*"(-?\d+)"/.test(atribute);
    if (tersembunyi && dapatDifokus) {
      pelanggaran.push(
        `[${nama}] <${tag}> masih dapat difokus di dalam wilayah aria-hidden="true" — pembaca layar & papan ketik tidak sinkron`,
      );
    }
    if (!voide.has(tag) && !/\/>$/.test(m[0])) tumpukan.push({ tag, sembunyi: tersembunyi });
  }

  // (12) tabel: asosiasi kepala kolom
  for (const t of ambilElemen(html, 'table')) {
    const th = ambilElemen(t.isi, 'th');
    if (th.length > 0 && !th.every((h) => atr(h.tag, 'scope'))) {
      pelanggaran.push(`[${nama}] <table> punya <th> tanpa scope — pembaca layar tidak tahu itu kepala kolom/baris`);
    }
    if (!atr(t.tag, 'aria-label') && !/<caption/i.test(t.isi)) {
      catatan.push(`[${nama}] <table> tanpa caption/aria-label (disarankan, bukan wajib AA)`);
    }
  }

  return { pelanggaran, catatan, jumlahKontrol };
}

/**
 * Periksa satu dokumen HTML.
 * @param {string} html
 * @param {{nama?: string}} opsi
 * @returns {{pelanggaran: string[], catatan: string[], statistik: Record<string, number>}}
 */
/**
 * Aturan (13) — ukuran sasaran sentuh untuk TAUTAN yang bergaya tombol ringkas.
 *
 * Dipisahkan menjadi fungsi tersendiri (24 Sep 2026) karena dua alasan:
 *   1. uji unit dapat memanggilnya langsung atas markup komponen yang benar-benar
 *      dirender (uji halaman tidak menjangkau komponen yang hanya muncul setelah
 *      jawaban tampil);
 *   2. pemeriksaan halaman dan pemeriksaan komponen memakai SATU sumber aturan.
 *
 * Kenapa penting: cacat ini pernah lolos — tautan "Keterbukaan penggunaan AI"
 * pada notis transparansi bergaya tombol dengan `py-1.5` tanpa `target-min`,
 * sehingga tingginya di bawah 24 px. Harness halaman menangkapnya; sekarang uji
 * unit komponen pun menangkapnya lebih dulu.
 *
 * @returns {{pelanggaran: string[], kontrolRingkas: number}}
 */
export function periksaSasaranTautan(html, nama = 'potongan') {
  const pelanggaran = [];
  let kontrolRingkas = 0;
  for (const el of ambilElemen(html, 'a')) {
    const kelas = atr(el.tag, 'class') ?? '';
    const ringkas = /text-\[(9|10)px\]|\bp-1\b|\bpy-1\b/.test(kelas);
    if (!ringkas) continue;
    kontrolRingkas += 1;
    if (!/target-min|min-h-\[?24px\]?|\bmin-h-6\b/.test(kelas)) {
      pelanggaran.push(
        `[${nama}] tautan bergaya tombol ringkas tanpa jaminan ukuran sasaran 24 px (SC 2.5.8) — tambahkan kelas "target-min"; kelas: ${kelas.slice(0, 70)}…`,
      );
    }
  }
  return { pelanggaran, kontrolRingkas };
}

export function periksaHtml(html, opsi = {}) {
  const nama = opsi.nama ?? 'dokumen';
  const pelanggaran = [];
  const catatan = [];

  // (1) bahasa
  const tagHtml = html.match(/<html\b[^>]*>/i)?.[0] ?? '';
  const lang = atr(tagHtml, 'lang');
  if (!lang) pelanggaran.push(`[${nama}] <html> tanpa atribut lang — pembaca layar tidak tahu bahasa halaman`);
  else if (!/^id\b/i.test(lang)) catatan.push(`[${nama}] lang="${lang}" (bukan "id") — pastikan memang disengaja`);

  // (2) judul dokumen
  if (!/<title>\s*\S+/i.test(html)) pelanggaran.push(`[${nama}] tidak ada <title> berisi teks`);

  // (3) wilayah utama
  const mains = ambilElemen(html, 'main');
  if (mains.length === 0) pelanggaran.push(`[${nama}] tidak ada <main> — pembaca layar kehilangan wilayah utama`);
  if (mains.length > 1) pelanggaran.push(`[${nama}] ada ${mains.length} <main> (harus satu)`);
  if (ambilElemen(html, 'nav').length === 0) pelanggaran.push(`[${nama}] tidak ada <nav> — menu tidak dikenali sebagai navigasi`);

  // (4) judul halaman: satu h1, urutan tidak melompat
  const urutan = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const jumlahH1 = urutan.filter((t) => t === 1).length;
  if (jumlahH1 === 0) pelanggaran.push(`[${nama}] tidak ada <h1>`);
  if (jumlahH1 > 1) pelanggaran.push(`[${nama}] ada ${jumlahH1} <h1> — pembaca layar memakai h1 sebagai penanda halaman`);
  let sebelumnya = 0;
  for (const t of urutan) {
    if (sebelumnya !== 0 && t > sebelumnya + 1) {
      pelanggaran.push(`[${nama}] urutan judul melompat dari h${sebelumnya} ke h${t} — struktur dokumen tidak terbaca berurutan`);
    }
    sebelumnya = t;
  }

  // (5) tautan lompati navigasi.
  //     DIRAPIKAN 24 Sep 2026: SC 2.4.1 (Bypass Blocks) menuntut mekanisme
  //     melewati BLOK YANG BERULANG. Sebelumnya aturan ini menuntut tautan
  //     lompati pada SETIAP halaman — halaman statis tanpa satu pun tautan
  //     sebelum <main> (mis. /keterbukaan, /tata-kelola-risiko) akan dituduh
  //     melanggar padahal tak ada blok berulang untuk dilewati. Kini tautan itu
  //     dituntut HANYA bila memang ada tautan sebelum <main>.
  const tautanAwal = ambilElemen(html, 'a').filter((a) => a.mulai < (mains[0]?.mulai ?? html.length));
  if (tautanAwal.length > 0) {
    const punyaLompat = tautanAwal.some((a) => /lompati|lewati|skip/i.test(teksDari(a.isi)));
    if (!punyaLompat) pelanggaran.push(`[${nama}] tidak ada tautan "Lompati ke konten" sebelum <main> — pengguna papan ketik terjebak di menu`);
  } else {
    catatan.push(`[${nama}] tidak ada tautan sebelum <main> — tautan lompati tidak dituntut (SC 2.4.1 hanya untuk blok berulang)`);
  }

  // (11) wilayah live untuk jawaban yang muncul tanpa pindah halaman.
  //      DIRAPIKAN 24 Sep 2026: hanya dituntut pada halaman yang memang punya
  //      permukaan tanya (form/isian). Halaman statis tidak "mengumumkan"
  //      apa pun, jadi menuntut wilayah live di sana hanya menghasilkan
  //      temuan palsu yang melemahkan kepercayaan pada pemeriksa.
  const adaPermukaanTanya = /<form|<input|<textarea/i.test(html);
  const adaLive = /aria-live\s*=\s*"(polite|assertive)"/i.test(html) || /role\s*=\s*"(status|alert|log)"/i.test(html);
  if (adaPermukaanTanya && !adaLive) {
    pelanggaran.push(`[${nama}] tidak ada wilayah live (aria-live / role="status") — jawaban yang muncul setelah bertanya tidak diumumkan`);
  } else if (!adaPermukaanTanya) {
    catatan.push(`[${nama}] halaman statis (tanpa permukaan tanya) — wilayah live tidak dituntut`);
  }

  // (6)–(12) pemeriksaan tingkat potongan (dipakai bersama uji komponen)
  const potongan = periksaPotonganHtml(html, { nama });
  pelanggaran.push(...potongan.pelanggaran);
  catatan.push(...potongan.catatan);

  // (13) ukuran sasaran (SC 2.5.8). Kontrol <button> dijamin oleh aturan CSS
  //      global (`button, [role=button] { min-height: 24px }`) yang diperiksa
  //      `periksaCss` atas berkas gaya yang benar-benar dikirim server. Yang
  //      masih harus membawa kelas `target-min` adalah TAUTAN yang dipakai
  //      sebagai tombol (tidak tertangkap aturan `button`).
  const sasaranTautan = periksaSasaranTautan(html, nama);
  pelanggaran.push(...sasaranTautan.pelanggaran);
  const kontrolRingkas = sasaranTautan.kontrolRingkas;

  return {
    pelanggaran,
    catatan,
    statistik: {
      'judul h1': jumlahH1,
      'tingkat judul': urutan.length,
      'kontrol bernama': potongan.jumlahKontrol,
      'kontrol ringkas': kontrolRingkas,
      gambar: ambilElemen(html, 'img').length,
      tabel: ambilElemen(html, 'table').length,
    },
  };
}
