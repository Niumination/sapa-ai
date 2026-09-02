'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LogoMark } from '@/components/brand/Logo';

function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/dashboard/laporan';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login gagal');
        setLoading(false);
        return;
      }

      window.location.href = from;
    } catch {
      setError('Gagal menghubungi server');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #0f1a12 0%, #1a2e1f 30%, #2d1810 70%, #1a1210 100%)',
      }}>

      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,0.03) 35px, rgba(255,255,255,0.03) 36px)',
          }} />
      </div>

      <div className="relative w-full max-w-md px-6">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <LogoMark size={72} className="mx-auto mb-4 drop-shadow-[0_6px_18px_rgba(212,168,83,0.25)]" />
          <h1 className="text-2xl font-bold text-[#D4A853] tracking-wide">
            SAPA SMART AI
          </h1>
          <p className="text-[11px] text-[var(--text-muted)]">SAPA Smart AI Aceh Tengah</p>
          <div className="w-16 h-0.5 bg-[#D4A853]/30 mx-auto mt-4" />
        </div>

        {/* Login Card */}
        <div className="bg-[#1E2420]/80 backdrop-blur-xl rounded-2xl border border-[#2D3B30] p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-1">
            🔒 Akses Terbatas
          </h2>
          <p className="text-[#9CA3AF] text-sm mb-6">
            Masuk untuk melihat laporan AI
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[#9CA3AF] text-sm mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#111611] border border-[#2D3B30] rounded-lg px-4 py-3 text-white placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853] focus:ring-1 focus:ring-[#D4A853]/50 transition-colors"
                placeholder="Masukkan username"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[#9CA3AF] text-sm mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#111611] border border-[#2D3B30] rounded-lg px-4 py-3 text-white placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853] focus:ring-1 focus:ring-[#D4A853]/50 transition-colors"
                placeholder="Masukkan password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-[#D4A853] hover:bg-[#C49A43] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-all duration-200 shadow-lg shadow-[#D4A853]/20 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Memverifikasi...
                </span>
              ) : 'Masuk'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[#6B7280] text-xs mt-6">
          © 2026 Diskominfo Aceh Tengah
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f1a12' }}>
        <div className="text-[#D4A853] text-lg">Memuat...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
