import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F5F3EC] p-8 text-center text-[#1E2420]">
      <h2 className="text-lg font-bold">Halaman tidak ditemukan</h2>
      <p className="max-w-md text-sm opacity-70">
        Alamat yang diminta tidak ada di SAPA Smart AI.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-[var(--brand-deep)] px-4 py-2 text-sm font-semibold text-white"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
