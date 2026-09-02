'use client';

import Sidebar from '@/components/Sidebar';
import React, { useState, useEffect } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [currentTime, setCurrentTime] = useState('');
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
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
        {/* Header — dark forest */}
        <header className="bg-[var(--brand-deep)] border-b border-[var(--brand)] px-4 flex h-[61px] items-center justify-between flex-shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <img
              src="/logo-aceh-tengah.png"
              alt="Lambang Aceh Tengah"
              className="w-9 h-9 rounded-lg object-contain flex-shrink-0"
            />
            <div>
              <h1 className="text-sm font-bold tracking-wide text-white">SAPA Smart AI</h1>
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Aceh Tengah · Diskominfo</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="text-right">
              <p className="font-mono text-xs text-[#C6C3B4]">{mounted ? currentTime : '--:--:--'}</p>
              <p className="text-[10px] text-[#767D6F]">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2D6A4F]/30 border border-[#2D6A4F]/50">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#52B788] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#52B788]" />
              </span>
              <span className="text-[11px] font-medium text-[#52B788]">Online</span>
            </div>

            <div className="px-3 py-1.5 rounded-full bg-[#D9C284]/15 border border-[#D9C284]/30">
              <span className="text-[11px] font-medium text-[#D9C284]">📡 SAPA Connected</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-[#F5F3EC]">{children}</main>
      </div>
    </div>
  );
}
