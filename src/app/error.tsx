'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F5F3EC] p-8 text-center text-[#1E2420]">
      <h2 className="text-lg font-bold">Terjadi kesalahan</h2>
      <p className="max-w-md text-sm opacity-70">
        {error.message || 'Gagal memuat halaman. Coba lagi.'}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-[var(--brand-deep)] px-4 py-2 text-sm font-semibold text-white"
      >
        Coba lagi
      </button>
    </div>
  );
}
