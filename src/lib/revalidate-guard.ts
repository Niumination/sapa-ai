// ─── Pagar akses /api/revalidate ───
//
// MASALAH YANG DIPERBAIKI (terukur 2026-09-21 di produksi)
// Endpoint pembatal-cache menerima POST anonim dan benar-benar membatalkan
// cache: `POST /api/revalidate {"tag":"all"}` → 200
// `{"status":"ok","revalidated":["sapa-analytics","kpi","stats","report"]}`.
// Penyebabnya: `REVALIDATE_SECRET` tidak diset di produksi, dan kode
// memperlakukan "tidak ada secret" sebagai "tidak perlu secret".
//
// Akibatnya siapa pun dapat memaksa seluruh agregat (2.065 record SPLP)
// dihitung ulang berulang kali: beban ke API pemerintah, kuota fungsi Vercel,
// dan latensi pengguna — pola "unbounded consumption" (OWASP LLM10/API4).
//
// Prinsip baru: FAIL-CLOSED. Tanpa secret di produksi, endpoint menolak
// (503) dengan pesan yang menjelaskan cara memperbaikinya — bukan diam-diam
// terbuka. Jalur pengembangan tetap terbuka agar `npm run dev` tidak terganggu.

import { timingSafeEqual } from 'node:crypto';

export type KeputusanRevalidate =
  | { ok: true; mode: 'bertanda' | 'terbuka-dev' }
  | { ok: false; status: 401 | 503; pesan: string };

export interface InputRevalidate {
  /** process.env.REVALIDATE_SECRET (boleh kosong). */
  secretEnv?: string;
  /** Nilai dari header x-revalidate-secret. */
  headerSecret?: string | null;
  /** Nilai dari body.secret. */
  bodySecret?: string | null;
  /** process.env.NODE_ENV. */
  nodeEnv?: string;
  /** Pelarian darurat: REVALIDATE_ALLOW_UNSIGNED=true (jangan dipakai di produksi). */
  allowUnsigned?: string;
}

/** Bandingkan dua string rahasia dalam waktu konstan (anti timing-attack). */
export function samaAman(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifikasiAksesRevalidate(input: InputRevalidate): KeputusanRevalidate {
  const secret = (input.secretEnv ?? '').trim();
  const isProduksi = (input.nodeEnv ?? process.env.NODE_ENV) === 'production';
  const pelarian = (input.allowUnsigned ?? '').trim().toLowerCase() === 'true';

  if (secret) {
    const dikirim = [input.headerSecret ?? '', input.bodySecret ?? ''].some((k) => k && samaAman(k, secret));
    if (!dikirim) {
      return {
        ok: false,
        status: 401,
        pesan: 'Unauthorized — sertakan header x-revalidate-secret (atau body.secret) yang cocok dengan REVALIDATE_SECRET.',
      };
    }
    return { ok: true, mode: 'bertanda' };
  }

  // Tidak ada secret di lingkungan: jangan pernah diam-diam terbuka di produksi.
  if (isProduksi && !pelarian) {
    return {
      ok: false,
      status: 503,
      pesan:
        'REVALIDATE_SECRET belum diset di lingkungan produksi. Endpoint ini sengaja MENOLAK semua permintaan (fail-closed) agar cache tidak dapat dibatalkan siapa pun. Set REVALIDATE_SECRET di dashboard Vercel, atau set REVALIDATE_ALLOW_UNSIGNED=true bila benar-benar disengaja.',
    };
  }
  return { ok: true, mode: 'terbuka-dev' };
}
