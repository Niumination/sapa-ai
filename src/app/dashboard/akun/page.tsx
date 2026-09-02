'use client';

export default function AkunPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--brand)]">Tentang Aplikasi</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">SAPA Smart AI — Aceh Tengah • Mode publik tanpa login</p>
      </div>

      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-[var(--brand)]">🔓 Akses Publik</h2>
        <p className="text-sm text-[var(--text-body)]">Aplikasi ini berjalan <strong>tanpa autentikasi</strong>. Semua fitur dashboard, analitik, GIS, laporan, dan AI Smart Query dapat diakses siapa saja. Tidak ada manajemen akun atau reset password di versi publik.</p>
        <p className="text-xs text-[var(--text-muted)]">Versi terbatas dari <code className="px-1 py-0.5 bg-[var(--surface-muted)] rounded">cc-acehtengah</code> yang di-strip menjadi SAPA-only untuk transparansi data.</p>
      </div>

      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-[var(--brand)]">📚 Sumber Data</h2>
        <ul className="text-sm text-[var(--text-body)] space-y-2 list-disc list-inside">
          <li><strong>SAPA Aceh Tengah</strong> — <a href="https://sapa.acehtengahkab.go.id" target="_blank" rel="noopener noreferrer" className="text-[var(--brand)] underline">sapa.acehtengahkab.go.id</a> via SPLP API <code className="text-xs">api-splp.layanan.go.id/sapa/1.0/api/daftar_data</code></li>
          <li><strong>Regulasi:</strong> Satu Data Indonesia — 38 OPD pengampu, 1790+ indikator</li>
          <li><strong>Pembaruan:</strong> Real-time per request (tanpa cache lokal), deterministik</li>
        </ul>
      </div>

      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-[var(--brand)]">🔗 Tautan</h2>
        <div className="flex flex-wrap gap-3">
          <a href="https://github.com/Niumination/sapa-ai" target="_blank" rel="noopener noreferrer" className="px-4 py-2 text-sm rounded-xl bg-[var(--brand)] text-white hover:bg-[var(--brand-soft)]">GitHub — Niumination/sapa-ai</a>
          <a href="/dashboard" className="px-4 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)]">← Kembali ke Dashboard</a>
          <a href="/dashboard/status" className="px-4 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)]">Status Sumber Data</a>
        </div>
        <p className="text-xs text-[var(--text-muted)]">Deploy: Vercel (auto dari <code>main</code>) • Stack: Next.js 16 + React 19 + Tailwind • Build: SPLP-only</p>
      </div>

      <div className="bg-[var(--brand-tint)] border border-[var(--brand)]/20 rounded-2xl p-4 text-sm text-[var(--text-body)]">
        <strong>Butuh akses terbatas (DTSEN/Bapokting)?</strong> Gunakan instance <code className="px-1 py-0.5 bg-white/60 rounded">cc-acehtengah</code> dengan role-gated auth, bukan sapa-ai publik.
      </div>
    </div>
  );
}
