// ─── GET /api/geodata — Lapisan wilayah + agregat SAPA tingkat kabupaten ───
//
// PERUBAHAN PENTING (LAPORAN_AUDIT_PRODUCTION_READINESS.md §P1-03)
//
// Versi sebelumnya memetakan OPD ke kecamatan secara manual (mis. Bebesen →
// ['Dinas Kesehatan','Dinas Sosial','RSU Datu Beru']) lalu menghitung
// totalRecords/totalIndicators/dataDensity "per kecamatan" dari pemetaan itu.
// Pemetaan tersebut TIDAK berasal dari data mana pun — OPD adalah organisasi
// tingkat kabupaten, dan kode aplikasi sendiri sudah mencatat bahwa
// "SAPA tidak punya data kecamatan-level secara langsung"
// (src/services/intent-detector.ts).
//
// Angka per kecamatan itu karena itu dihapus seluruhnya. Untuk dashboard resmi
// pemerintah, menampilkan angka yang dikarang jauh lebih berbahaya daripada
// menampilkan "belum tersedia".
//
// Endpoint ini sekarang mengembalikan:
//   • kecamatan   → lapisan referensi wilayah (nama + koordinat bersumber)
//   • kabupaten   → agregat SAPA yang benar-benar ada, di level kabupaten
//   • dataScope   → deklarasi eksplisit granularitas data
//   • sumber      → atribusi yang wajib ditampilkan di UI

import { NextResponse } from 'next/server';
import { getUniqueOpd, getUniqueIndicators } from '@/lib/sapa-client';
import { getSapaRecords } from '@/lib/data-source';
import {
  KECAMATAN_ACEH_TENGAH,
  PUSAT_KABUPATEN,
  SUMBER_WILAYAH,
  JUMLAH_KECAMATAN,
} from '@/lib/aceh-tengah';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { cached } from '@/lib/store';
import { isMockMode } from '@/lib/data-source';

const CACHE_TTL = 10 * 60 * 1000;

interface GeoPayload {
  kecamatan: { nama: string; lat: number; lng: number; wikidataId: string }[];
  bounds: { center: [number, number]; zoom: number };
  kabupaten: {
    totalRecords: number;
    totalOpd: number;
    totalIndicators: number;
    opdTeratas: { nama: string; jumlah: number } | null;
  };
  dataScope: {
    level: 'kabupaten';
    kecamatanBreakdownTersedia: false;
    catatan: string;
  };
  sumber: typeof SUMBER_WILAYAH;
  lastFetched: string;
}

// Cache bersama (§P1-08) — dulu variabel modul per-instance.
const cacheKey = () => `geodata:v2:${isMockMode() ? 'mock' : 'live'}`;

const SCOPE_NOTE =
  'SAPA menyediakan data pada tingkat kabupaten/OPD. Rincian per kecamatan belum ' +
  'tersedia dari sumber data, sehingga peta ini menampilkan letak wilayah sebagai ' +
  'konteks — bukan sebaran nilai indikator.';

export async function GET() {
  try {
    const payload = await cached<GeoPayload>(cacheKey(), CACHE_TTL, async () => {
    const records = await getSapaRecords();
    const opds = getUniqueOpd(records);
    const indicators = getUniqueIndicators(records);

    const payload: GeoPayload = {
      kecamatan: KECAMATAN_ACEH_TENGAH.map((k) => ({ ...k })),
      bounds: {
        center: [PUSAT_KABUPATEN.lat, PUSAT_KABUPATEN.lng],
        zoom: 10,
      },
      kabupaten: {
        totalRecords: records.length,
        totalOpd: opds.length,
        totalIndicators: indicators.length,
        opdTeratas: opds[0] ? { nama: opds[0].nama, jumlah: opds[0].jumlah } : null,
      },
      dataScope: {
        level: 'kabupaten',
        kecamatanBreakdownTersedia: false,
        catatan: SCOPE_NOTE,
      },
      sumber: SUMBER_WILAYAH,
      lastFetched: new Date().toISOString(),
    };

    return payload;
    });

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[geodata] Gagal mengambil data SAPA:', err);

    // Lapisan wilayah tidak bergantung pada SAPA — tetap sajikan peta,
    // tapi nyatakan dengan jelas bahwa agregat kabupaten tidak tersedia.
    return NextResponse.json(
      {
        kecamatan: KECAMATAN_ACEH_TENGAH.map((k) => ({ ...k })),
        bounds: { center: [PUSAT_KABUPATEN.lat, PUSAT_KABUPATEN.lng], zoom: 10 },
        kabupaten: null,
        dataScope: {
          level: 'kabupaten',
          kecamatanBreakdownTersedia: false,
          catatan: SCOPE_NOTE,
        },
        sumber: SUMBER_WILAYAH,
        error: 'SAPA tidak dapat dihubungi — angka agregat kabupaten tidak ditampilkan.',
        errorCode: 'SAPA_UNAVAILABLE',
        lastFetched: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

// Invariant sederhana: kalau konstanta wilayah pernah diubah keliru, ini gagal
// saat modul dimuat, bukan diam-diam salah di produksi.
if (KECAMATAN_ACEH_TENGAH.length !== JUMLAH_KECAMATAN) {
  throw new Error(
    `Data kecamatan tidak konsisten: ${KECAMATAN_ACEH_TENGAH.length} entri, harus ${JUMLAH_KECAMATAN}.`,
  );
}
