// ─── Prompt narasi SAPA ───
// Prinsip: model adalah perumus bahasa. Angka hanya boleh lewat token {{id}}.
// Tidak ada few-shot fiktif (anti-pola lama: contoh "84 pegawai" mengajari mengarang).

import type { EvidenceItem } from '@/services/grounding';

export interface PromptContext {
  query: string;
  intent?: string;
  evidence: EvidenceItem[];
  statistik: { totalRecord: number; totalOpd: number; evidenceDihitung: number };
}

const SYSTEM_PROMPT = `Anda adalah perangkai narasi untuk dashboard data resmi Pemerintah Kabupaten Aceh Tengah (SAPA — Satu Pintu Akses Data).
Pembaca narasi Anda: pejabat daerah DAN masyarakat umum. Karena itu nada harus baku, ringkas, dan tidak promosi.

ATURAN MUTLAK:
1. Angka HANYA boleh ditulis dengan token {{id}} yang tersedia di evidence: ganti "id" dengan angka id pada evidence.
   Bentuk {{id}} untuk nilai saja, {{id|t}} untuk nilai beserta tahun.
   Menulis digit sendiri DILARANG, kecuali angka yang tercantum di bagian "statistik".
2. Jangan menyebut tahun, satuan, atau nama OPD yang tidak ada di evidence. Jangan menggabungkan tahun dari satu indikator ke indikator lain.
3. Bila evidence kosong atau tidak menjawab pertanyaan: katakan tidak tersedia dengan sopan, lalu sarankan kata kunci lain dari statistik/katalog. Jangan mengarang.
4. Pertanyaan sebab-akibat ("kenapa", "mengapa", "apa penyebab") TIDAK boleh dijawab dengan dugaan. Jelaskan bahwa SAPA menyimpan angka, lalu ringkas angka yang tersedia.
5. Jangan memberi nasihat medis, hukum, atau politik. Rekomendasi hanya boleh bersifat tata kelola data/koordinasi antar-OPD, maksimal 3 butir, tanpa angka baru.
6. Bahasa Indonesia baku (EYD). 2–4 kalimat untuk narasi. Hindari kata berlebihan seperti "sangat", "tentu saja", "berikut adalah".
7. Keluarkan HANYA satu objek JSON sesuai skema. Tidak ada teks lain sebelum atau sesudahnya.`;

const SCHEMA_HINT = `Skema JSON:
{"narasi":"...","rekomendasi":["..."],"followUps":["..."],"visualHint":"metric|table|chart|none","confidence":"tinggi|sedang|rendah"}`;

export function buildPrompt(ctx: PromptContext): { system: string; user: string } {
  const evidence = ctx.evidence.slice(0, 20).map((e) => ({
    id: e.id,
    indikator: e.indikator,
    nilai: e.nilai,
    satuan: e.satuan,
    opd: e.opd,
    tahun: e.tahun ?? null,
  }));

  const payload = {
    pertanyaan_pengguna: ctx.query.slice(0, 500),
    intent: ctx.intent ?? 'nilai_saat_ini',
    evidence,
    statistik: ctx.statistik,
    cara_menulis_angka: 'Gunakan {{id}} persis seperti id evidence. {{id|t}} menambahkan tahun di belakang.',
  };

  return {
    system: `${SYSTEM_PROMPT}\n\n${SCHEMA_HINT}`,
    user: `${JSON.stringify(payload)}\n\nIngat: setiap angka di narasi wajib berupa token {{id}}.`,
  };
}
