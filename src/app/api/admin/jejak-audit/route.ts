import { NextRequest, NextResponse } from 'next/server';
import { izinAdmin } from '@/lib/admin-guard';
import {
  RETENSI_HARI,
  ambilJejak,
  eksporCsv,
  eksporMengandungPii,
  eksporNdjson,
  hariSah,
  hariTersedia,
  hariIni,
} from '@/lib/jejak-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/jejak-audit — jejak audit jawaban (CMP-04).
 *
 * Dilindungi `ADMIN_TOKEN` dengan aturan fail-closed yang sama seperti endpoint
 * admin lain: tanpa token yang diset, endpoint menolak (503) alih-alih membuka.
 *
 * Parameter:
 *   hari=YYYY-MM-DD   (bawaan: hari ini) — di luar jendela retensi ⇒ hasil kosong
 *   format=json|csv|ndjson   (bawaan: json)
 *   batas=<n>         potong jumlah baris (untuk pemeriksaan cepat)
 *
 * Jawaban JSON selalu memuat `pemeriksaanPii` — hasil jaring terakhir atas teks
 * yang diekspor; bila penyamaran gagal, pemeriksaan itu memberi tahu, bukan
 * diam-diam mengirimkan data pribadi.
 */
export async function GET(req: NextRequest) {
  const izin = izinAdmin(req);
  if (!izin.ok) return NextResponse.json({ status: 'error', error: izin.pesan }, { status: izin.status });

  const url = new URL(req.url);
  const hariDiminta = url.searchParams.get('hari')?.trim() ?? hariIni();
  const hari = hariSah(hariDiminta) ? hariDiminta : hariIni();
  const format = (url.searchParams.get('format') ?? 'json').trim();
  const batasMentah = Number(url.searchParams.get('batas') ?? '0');
  const batas = Number.isFinite(batasMentah) && batasMentah > 0 ? Math.min(batasMentah, 1000) : 0;

  const ringkas = await ambilJejak(hari);
  const item = batas ? ringkas.item.slice(0, batas) : ringkas.item;
  const teksEkspor = format === 'csv' ? eksporCsv(item) : format === 'ndjson' ? eksporNdjson(item) : '';
  // Jaring terakhir atas APA YANG DIKIRIM (bukan atas niat penyamaran): bentuk
  // JSON pun diperiksa sebagai teks, sehingga satu catatan yang lolos tetap tertangkap.
  const adaPii = eksporMengandungPii(teksEkspor || JSON.stringify(item));

  if (format === 'csv' || format === 'ndjson') {
    return new Response(teksEkspor, {
      status: 200,
      headers: {
        'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="jejak-audit-${hari}.${format}"`,
        'x-retensi-hari': String(RETENSI_HARI),
        'x-pii-terdeteksi': String(adaPii),
      },
    });
  }

  return NextResponse.json({
    status: 'ok',
    hari: ringkas.hari,
    diluarRetensi: ringkas.diluarRetensi,
    retensiHari: RETENSI_HARI,
    jumlah: ringkas.jumlah,
    dilewati: ringkas.dilewati,
    backend: ringkas.backend,
    perMode: ringkas.perMode,
    perStatus: ringkas.perStatus,
    piiDisamarkan: ringkas.piiDisamarkan,
    pemeriksaanPii: { bersih: !adaPii, temuan: adaPii ? ['pola 16 digit terdeteksi pada ekspor'] : [] },
    pilihanHari: hariTersedia(),
    item,
  });
}
