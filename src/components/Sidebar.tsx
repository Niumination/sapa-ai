'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { LogoMark } from '@/components/brand/Logo';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Beranda', icon: '📊', desc: 'Overview SAPA', public: true },
  { href: '/dashboard/analytics', label: 'Analitik', icon: '📈', desc: 'Tren & Analitik', public: true },
  { href: '/dashboard/gis', label: 'Peta GIS', icon: '🗺️', desc: 'Peta Interaktif', public: true },
  { href: '/dashboard/laporan', label: 'Laporan AI', icon: '📋', desc: 'Laporan & Riwayat', public: false },
  { href: '/dashboard/status', label: 'Status Sumber', icon: '🗂️', desc: 'Sumber & relasi data', public: false },
  { href: '/dashboard/admin/dtsen', label: 'Admin DTSEN', icon: '🔐', desc: 'Rilis data terbatas', public: false },
  { href: '/dashboard/akun', label: 'Akun', icon: '👤', desc: 'Password & sesi', public: false },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    // @hotfix 29-Agu-2026: publik hanya lihat Beranda/Analitik/GIS (public: true).
    // Semua akun yang login melihat SEMUA halaman (termasuk Laporan/Status/Admin DTSEN/Akun).
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsAuthed(!!(d?.authenticated && d?.admin)))
      .catch(() => setIsAuthed(false));
  }, []);

  const visibleItems = NAV_ITEMS.filter((item) => item.public || isAuthed);

  return (
    <aside
      className={`flex flex-col h-full border-r border-[var(--border-strong)] bg-[var(--surface-card)] transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-56'
      }`}
    >
      {/* Header — Hamburger + Logo */}
      <div className={`bg-[var(--brand-deep)] flex h-[61px] items-center ${collapsed ? 'px-2' : 'px-4'}`}>
        <div className="flex items-center gap-2.5">
          {/* Hamburger Button */}
          <button
            onClick={onToggle}
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 bg-[var(--brand)] hover:bg-[var(--brand-soft)] text-[var(--on-brand-muted)] hover:text-[var(--on-brand)] border border-[var(--brand-soft)]"
            title={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="2" y="7" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="2" y="11" width="12" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <LogoMark size={30} className="flex-shrink-0 rounded-lg" />
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-white tracking-tight truncate">Aceh Tengah</h1>
                <p className="text-[10px] text-[var(--text-muted)] font-medium">SAPA Smart AI</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-4 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        <p className={`text-[9px] font-bold text-[#767D6F] uppercase tracking-widest mb-2 ${collapsed ? 'text-center px-0' : 'px-3'}`}>
          {collapsed ? '•' : 'Navigasi'}
        </p>
        {visibleItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-xl text-sm transition-all duration-200 ${
                collapsed ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-[#DCE8DE] text-[#1B4332] border border-[#2D6A4F]/20'
                  : 'text-[#4B5249] hover:bg-[#E9E6DA] hover:text-[#1B4332] border border-transparent'
              }`}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {!collapsed && (
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${isActive ? 'text-[#1B4332]' : 'text-[#4B5249]'}`}>
                    {item.label}
                  </p>
                  <p className="text-[10px] text-[#767D6F] truncate">{item.desc}</p>
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status */}
      <div className={`border-t border-[#C6C3B4] ${collapsed ? 'px-2 py-3' : 'px-4 py-4 space-y-2'}`}>
        {!collapsed && <p className="text-[9px] font-bold text-[#767D6F] uppercase tracking-widest">Sistem</p>}
        <div className="space-y-1.5">
          <StatusRow label="SAPA" status="●" color="text-[#2D6A4F]" collapsed={collapsed} />
          <StatusRow label="AI" status="●" color="text-[#1B4332]" collapsed={collapsed} />
        </div>
        {!collapsed && <p className="text-[10px] text-[#767D6F] pt-2">Diskominfo Aceh Tengah</p>}
      </div>
    </aside>
  );
}

function StatusRow({ label, status, color, collapsed }: { label: string; status: string; color: string; collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="flex justify-center" title={`${label}: Active`}>
        <span className={`w-2 h-2 rounded-full ${color.replace('text-', 'bg-')}`} />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-[#767D6F]">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${color.replace('text-', 'bg-')}`} />
        <span className={`font-medium ${color}`}>Active</span>
      </div>
    </div>
  );
}
