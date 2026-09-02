'use client';

import Sidebar from '@/components/Sidebar';
import React, { useState, useEffect } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [currentTime, setCurrentTime] = useState('');
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    // @hotfix 29-Agu-2026: tombol Akun/Logout hanya tampil saat SESI AKTIF.
    // Sebelumnya tombol selalu render → setelah logout (client-side redirect)
    // tombol masih terlihat sebentar/setelah navigasi. Cek /api/auth/me di mount.
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.authenticated && d?.admin) {
          setIsAuthed(true);
          setAdminName(d.admin.username ?? null);
        }
      })
      .catch(() => {});
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F3EC] text-[#1E2420]">
      {/* Sidebar */}
      <div className="hidden md:block h-full flex-shrink-0 print:hidden">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {/* Header — dark forest, matches cc.acehtengahkab.go.id */}
        <header className="bg-[var(--brand-deep)] border-b border-[var(--brand)] px-4 flex h-[61px] items-center justify-between flex-shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            {/* Official Logo */}
            <img
              src="/logo-aceh-tengah.png"
              alt="Lambang Aceh Tengah"
              className="w-9 h-9 rounded-lg object-contain flex-shrink-0"
            />
            <div>
              <h1 className="text-sm font-bold tracking-wide text-white">
                SAPA Smart AI
              </h1>
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                Aceh Tengah · Diskominfo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {/* Live Clock */}
            <div className="text-right">
              <p className="font-mono text-xs text-[#C6C3B4]">
                {mounted ? currentTime : '--:--:--'}
              </p>
              <p className="text-[10px] text-[#767D6F]">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2D6A4F]/30 border border-[#2D6A4F]/50">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#52B788] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#52B788]" />
              </span>
              <span className="text-[11px] font-medium text-[#52B788]">Online</span>
            </div>

            {/* SAPA Badge */}
            <div className="px-3 py-1.5 rounded-full bg-[#D9C284]/15 border border-[#D9C284]/30">
              <span className="text-[11px] font-medium text-[#D9C284]">
                📡 SAPA Connected
              </span>
            </div>

            {/* Akun & Logout — @hotfix 29-Agu: hanya tampil saat SESI AKTIF.
                Publik (belum login) melihat tombol LOGIN sebagai gantinya. */}
            {isAuthed ? (
              <div className="flex items-center gap-2 border-l border-[#2D6A4F]/40 pl-3">
                {adminName && (
                  <span className="hidden lg:inline text-[11px] font-medium text-[#C6C3B4] max-w-[110px] truncate" title={adminName}>
                    👤 {adminName}
                  </span>
                )}
                <a
                  href="/dashboard/akun"
                  title="Pengaturan akun"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#2D6A4F]/30 hover:bg-[#2D6A4F]/50 border border-[#2D6A4F]/50 transition-colors"
                >
                  <span className="text-sm">👤</span>
                  <span className="text-[11px] font-medium text-[#52B788]">Akun</span>
                </a>
                <button
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    // @hotfix 29-Agu: setelah logout → kembali ke DASHBOARD (publik),
                    // bukan ke halaman login.
                    window.location.href = '/dashboard';
                  }}
                  title="Keluar"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#B3261E]/30 hover:bg-[#B3261E]/50 border border-[#B3261E]/50 transition-colors"
                >
                  <span className="text-sm">🚪</span>
                  <span className="text-[11px] font-medium text-[#E58B7F]">Logout</span>
                </button>
              </div>
            ) : (
              <a
                href="/login"
                title="Masuk sebagai admin"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2D6A4F]/30 hover:bg-[#2D6A4F]/50 border border-[#2D6A4F]/50 transition-colors"
              >
                <span className="text-sm">🔐</span>
                <span className="text-[11px] font-medium text-[#52B788]">Login</span>
              </a>
            )}
          </div>
        </header>

        {/* Content — light background */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#F5F3EC]">
          {children}
        </main>
      </div>
    </div>
  );
}
