import type { Metadata } from 'next';
import Link from 'next/link';
import { getAiConfig } from '@/lib/ai/env';
import { pengungkapanAi } from '@/lib/keterbukaan-ai';
import { getAiRuntimeStatus } from '@/services/answer-compose';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Keterbukaan penggunaan AI — SAPA Smart AI',
  description:
    'Keterbukaan penggunaan kecerdasan artifisial pada layanan SAPA: apa yang dikerjakan AI, apa yang tidak, siapa penanggung jawabnya, dan cara melapor bila ada kekeliruan.',
};

/**
 * Halaman keterbukaan penggunaan AI (CMP-02, rujukan SE Menkominfo 9/2023).
 *
 * Halaman ini menyatakan keadaan yang SEBENARNYA saat dibuka: bila AI mati,
 * halaman menyebut mati. Teksnya berasal dari satu modul (`@/lib/keterbukaan-ai`)
 * yang sama dengan `/api/keterbukaan`, sehingga versi manusia dan versi mesin
 * tidak dapat berbeda.
 */
export default async function HalamanKeterbukaan() {
  const status = await getAiRuntimeStatus().catch(() => null);
  const cfg = getAiConfig();
  let hosPenyedia: string | null = null;
  try {
    hosPenyedia = cfg.baseUrl ? new URL(cfg.baseUrl).host : null;
  } catch {
    hosPenyedia = null;
  }

  const keterbukaan = pengungkapanAi(
    status
      ? {
          keadaan: status.state === 'active' ? 'aktif' : status.state === 'shadow' ? 'bayangan' : 'mati',
          penyedia: status.provider ?? null,
          model: status.model ?? null,
          hosPenyedia,
          alasan: status.reason ?? null,
          terjangkau: status.reachable ?? null,
          gagalBerturut: status.health?.gagalBerturut ?? 0,
          sebabTerakhir: status.health?.sebab ?? null,
          saklarAi: status.toggles?.aiEnabled ?? true,
        }
      : null,
  );

  const nadaKeadaan =
    keterbukaan.ringkas.keadaan === 'aktif'
      ? 'bg-[#E6F0E9] border-[#1B4332] text-[#14352A]'
      : keterbukaan.ringkas.keadaan === 'bayangan'
        ? 'bg-[#F3EFDC] border-[#8A6D1B] text-[#5A4712]'
        : 'bg-[#F0EEE6] border-[#767D6F] text-[#3A4038]';

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <p className="text-xs uppercase tracking-wide text-[#767D6F]">
        Pemerintah Kabupaten Aceh Tengah · SAPA Smart AI
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-[#1F241F]">Keterbukaan penggunaan AI</h1>
      <p className="mt-2 text-sm text-[#4B5249]">
        Halaman ini menjelaskan peran kecerdasan artifisial pada layanan jawaban SAPA: bagian mana
        yang dihitung tanpa AI, apa yang dikerjakan model bahasa, siapa yang bertanggung jawab atas
        isi jawaban, serta cara mengecek dan melaporkan kekeliruan.
      </p>

      <section
        aria-labelledby="judul-keadaan"
        className={`mt-6 rounded-xl border-l-4 p-4 ${nadaKeadaan}`}
      >
        <h2 id="judul-keadaan" className="text-sm font-semibold">
          Keadaan layanan saat halaman ini dibuka
        </h2>
        <p className="mt-1 text-sm">{keterbukaan.kalimatKeadaan}</p>
        <p className="mt-2 text-xs">
          {keterbukaan.ringkas.penyedia ?? 'tidak dicantumkan'}
          {' · '}
          {keterbukaan.ringkas.model ?? 'model belum diatur'}
          {keterbukaan.ringkas.hosPenyedia ? ` · hos ${keterbukaan.ringkas.hosPenyedia}` : ''}
          {' · saklar operator: '}
          {keterbukaan.ringkas.saklarAi ? 'AI diizinkan' : 'AI dimatikan operator'}
        </p>
      </section>

      {keterbukaan.bagian.map((bagian) => (
        <section key={bagian.id} aria-labelledby={`judul-${bagian.id}`} className="mt-8">
          <h2 id={`judul-${bagian.id}`} className="text-lg font-semibold text-[#1F241F]">
            {bagian.judul}
          </h2>
          <ul className="mt-2 space-y-2">
            {bagian.isi.map((paragraf, i) => (
              <li key={i} className="text-sm text-[#3A4038] leading-relaxed">
                {paragraf}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-8 text-xs text-[#767D6F]">
        Versi teks {keterbukaan.versi} · ditinjau {keterbukaan.ditinjauPada} · tinjauan berikutnya{' '}
        {keterbukaan.tinjauanBerikutnya}. Versi mesin halaman ini tersedia di{' '}
        <Link className="underline" href="/api/keterbukaan">
          /api/keterbukaan
        </Link>
        .
      </p>
      <p className="mt-3 text-xs">
        <Link className="underline text-[#1B4332]" href="/dashboard">
          ← Kembali ke dasbor SAPA
        </Link>
        {' · '}
        <Link className="underline text-[#1B4332]" href="/dashboard/status">
          Status sistem
        </Link>
      </p>
    </main>
  );
}
