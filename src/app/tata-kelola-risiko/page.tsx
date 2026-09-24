import type { Metadata } from 'next';
import Link from 'next/link';
import { REGISTER_RISIKO, ringkasRegister, tingkatRisiko, type Tingkat } from '@/lib/tata-kelola-risiko';

export const metadata: Metadata = {
  title: 'Tata kelola risiko AI — SAPA Smart AI',
  description:
    'Daftar risiko penggunaan AI pada layanan SAPA beserta pemilik (peran), kendali, bukti, dan tindak lanjutnya. Rujukan ISO/IEC 42001 & NIST AI RMF.',
};

/**
 * Halaman tata kelola risiko AI (CMP-03).
 *
 * Menampilkan register yang SAMA dengan `/api/tata-kelola-risiko`. Sengaja terbuka:
 * risiko AI pada layanan publik lebih baik dibaca publik — termasuk pemiliknya —
 * daripada disimpan di dokumen internal yang tidak pernah ditinjau.
 */
const nadaTingkat: Record<Tingkat, string> = {
  tinggi: 'bg-[#F6E3E1] text-[#7A1D14] border-[#B3261E]',
  sedang: 'bg-[#F3EFDC] text-[#5A4712] border-[#8A6D1B]',
  rendah: 'bg-[#E6F0E9] text-[#14352A] border-[#1B4332]',
};

export default function HalamanTataKelolaRisiko() {
  const ringkas = ringkasRegister();
  const daftar = REGISTER_RISIKO.map((r) => ({ ...r, tingkat: tingkatRisiko(r.kemungkinan, r.dampak) })).sort(
    (a, b) => ({ tinggi: 0, sedang: 1, rendah: 2 })[a.tingkat] - ({ tinggi: 0, sedang: 1, rendah: 2 })[b.tingkat],
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <p className="text-xs uppercase tracking-wide text-[#767D6F]">
        Pemerintah Kabupaten Aceh Tengah · SAPA Smart AI
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-[#1F241F]">Tata kelola risiko AI</h1>
      <p className="mt-2 text-sm text-[#4B5249]">
        Setiap risiko di bawah ini punya <strong>pemilik berupa peran</strong> (bukan nama orang, supaya
        tidak basi saat pegawai mutasi), <strong>kendali</strong> yang nyata, <strong>bukti</strong> yang
        menunjuk berkas/uji di repositori, dan <strong>tindak lanjut</strong> bertanggal. Rujukan tata
        kelola: ISO/IEC 42001 dan NIST AI RMF (Govern · Map · Measure · Manage).
      </p>

      <section aria-labelledby="judul-ringkas" className="mt-6 rounded-xl border border-[#C6C3B4] p-4">
        <h2 id="judul-ringkas" className="text-sm font-semibold text-[#1F241F]">
          Ringkasan register
        </h2>
        <ul className="mt-2 space-y-1 text-sm text-[#3A4038]">
          <li>
            {ringkas.jumlah} risiko · tingkat: {ringkas.perTingkat.tinggi} tinggi · {ringkas.perTingkat.sedang}{' '}
            sedang · {ringkas.perTingkat.rendah} rendah
          </li>
          <li>
            Fungsi NIST terwakili: {ringkas.perFungsiNist.govern} govern · {ringkas.perFungsiNist.map} map ·{' '}
            {ringkas.perFungsiNist.measure} measure · {ringkas.perFungsiNist.manage} manage
          </li>
          <li>
            Versi register {ringkas.versi} · ditinjau {ringkas.ditinjauPada} · tinjauan berikutnya{' '}
            {ringkas.tinjauanBerikutnya}
          </li>
        </ul>
      </section>

      {daftar.map((r) => (
        <section key={r.id} aria-labelledby={`judul-${r.id}`} className="mt-6 rounded-xl border border-[#DCD8C8] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`judul-${r.id}`} className="text-base font-semibold text-[#1F241F]">
              {r.id} · {r.judul}
            </h2>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${nadaTingkat[r.tingkat]}`}>
              risiko {r.tingkat}
            </span>
            <span className="rounded-full border border-[#C6C3B4] px-2 py-0.5 text-[11px] text-[#4B5249]">
              {r.kategori}
            </span>
          </div>

          <p className="mt-2 text-sm text-[#3A4038]">
            <strong>Pemilik:</strong> {r.pemilik.peran} — {r.pemilik.tanggungJawab}
          </p>

          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-[#1B4332]">
              Kendali ({r.kendali.length}) · bukti ({r.bukti.length}) · tindak lanjut ({r.tindakLanjut.length}) ·
              tinjauan berikutnya {r.tinjauanBerikutnya}
            </summary>
            <div className="mt-2 space-y-3 text-sm text-[#3A4038]">
              <div>
                <p className="font-medium">Kendali</p>
                <ul className="ml-4 list-disc">
                  {r.kendali.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium">Bukti</p>
                <ul className="ml-4 list-disc">
                  {r.bukti.map((b, i) => (
                    <li key={i}>
                      <code className="text-[12px]">{b.rujukan}</code> — {b.keterangan}{' '}
                      <span className="text-[#767D6F]">({b.jenis})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium">Tindak lanjut</p>
                <ul className="ml-4 list-disc">
                  {r.tindakLanjut.map((t, i) => (
                    <li key={i}>
                      {t.tanggal} · {t.status} — {t.catatan}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </section>
      ))}

      <p className="mt-8 text-xs text-[#767D6F]">
        Versi mesin halaman ini tersedia di{' '}
        <Link className="underline" href="/api/tata-kelola-risiko">
          /api/tata-kelola-risiko
        </Link>{' '}
        (dipakai uji otomatis; setiap rujukan bukti diperiksa ada atau tidak).
      </p>
      <p className="mt-3 text-xs">
        <Link className="underline text-[#1B4332]" href="/keterbukaan">
          Keterbukaan penggunaan AI
        </Link>
        {' · '}
        <Link className="underline text-[#1B4332]" href="/dashboard">
          ← Kembali ke dasbor SAPA
        </Link>
      </p>
    </main>
  );
}
