import { NextRequest, NextResponse } from 'next/server';
import { izinAdmin } from '@/lib/admin-guard';
import { bacaKesehatan } from '@/lib/ai/provider-health';
import { bacaSaluran, periksaPeringatan, ringkasanPeringatan, susunPesan, kirimKeSaluran, urlPanel } from '@/lib/ai/notifikasi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/peringatan — pemeriksa notifikasi operator (OPS-04).
 *
 * Mengapa ada endpoint, padahal notifikasi sudah dikirim dari jalur jawaban:
 *   1. PENJADWAL LUAR. Bila tidak ada satu pun warga bertanya, sirkuit yang
 *      sudah terbuka tidak akan pernah dipanggil ulang oleh jalur jawaban.
 *      Cron (mis. GitHub Actions tiap 10 menit) memanggil endpoint ini agar
 *      kalimat "sirkuit terbuka > 15 menit" tetap terpenuhi tanpa lalu lintas.
 *   2. PEMERIKSAAN MANUAL. Operator dapat memastikan salurannya benar-benar
 *      sampai (`?uji=1`) dan melihat pesan yang akan dikirim (`?kering=1`)
 *      tanpa menunggu gangguan sungguhan.
 *
 * Dilindungi `ADMIN_TOKEN` dengan prinsip yang sama seperti /api/admin/celah:
 * FAIL-CLOSED. Perhatikan: endpoint ini TIDAK mengembalikan token saluran dan
 * tidak pernah memuatnya di badan balasan.
 *
 *   ?kering=1  → hanya menghitung; tidak mengirim, tidak mengubah keadaan
 *   ?uji=1     → kirim satu notifikasi uji ke semua saluran (bukan episode)
 *   (kosong)   → periksa keadaan sekarang dan kirim bila perlu
 */
export async function GET(req: NextRequest) {
  const izin = izinAdmin(req);
  if (!izin.ok) return NextResponse.json({ status: 'error', error: izin.pesan }, { status: izin.status });

  const sp = new URL(req.url).searchParams;
  const ringkas = await ringkasanPeringatan();
  const dasar = {
    status: 'ok' as const,
    siap: ringkas.siap,
    saluran: ringkas.saluran,
    backend: ringkas.backend,
    panel: urlPanel(),
    keadaan: ringkas.keadaan,
    catatanTanpaSaluran: ringkas.siap
      ? null
      : 'Tidak ada saluran terpasang. Pasang SAPA_ALERT_TELEGRAM_BOT_TOKEN + SAPA_ALERT_TELEGRAM_CHAT_ID, atau SAPA_ALERT_WEBHOOK_URL.',
  };

  // (a) Kirim notifikasi uji — untuk memastikan saluran benar-benar sampai.
  if (sp.get('uji') === '1') {
    const saluran = bacaSaluran();
    if (!saluran.length) return NextResponse.json({ ...dasar, uji: { dikirim: [], pesan: 'tanpa saluran' } });
    const pesan = susunPesan({
      kesehatan: await bacaKesehatan(),
      terbukaMenit: 0,
      jenis: 'uji',
      panel: urlPanel(),
      rahasia: saluran.map((s) => s.rahasia).filter((x): x is string => Boolean(x)),
    });
    const dikirim = await kirimKeSaluran(pesan, saluran);
    return NextResponse.json({ ...dasar, uji: { dikirim, pesan: dikirim.every((d) => d.ok) ? 'terkirim' : 'ada saluran gagal' } });
  }

  // (b) Pemeriksaan sesungguhnya (atau kering).
  const kering = sp.get('kering') === '1';
  const hasil = await periksaPeringatan({ kesehatan: await bacaKesehatan(), kering });
  return NextResponse.json({
    ...dasar,
    statusPeringatan: hasil.status,
    pesan: hasil.pesan,
    terbukaMenit: hasil.terbukaMenit,
    dikirim: hasil.dikirim,
    pratinjau: hasil.pratinjau ?? null,
    keadaan: hasil.keadaan,
  });
}
