'use client';

import { useState, useEffect } from 'react';

interface AdminInfo {
  username: string;
  nama: string;
  role: string;
}

export default function AkunPage() {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [passwordLama, setPasswordLama] = useState('');
  const [passwordBaru, setPasswordBaru] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.admin) setAdmin(d.admin);
        else window.location.href = '/login';
      })
      .catch(() => (window.location.href = '/login'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (passwordBaru !== konfirmasi) {
      setMsg({ ok: false, text: 'Konfirmasi password tidak cocok.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordLama, passwordBaru }),
      });
      const d = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: d.message ?? 'Password berhasil diganti.' });
        setPasswordLama(''); setPasswordBaru(''); setKonfirmasi('');
      } else {
        setMsg({ ok: false, text: d.error ?? 'Gagal mengganti password.' });
      }
    } catch {
      setMsg({ ok: false, text: 'Terjadi kesalahan jaringan.' });
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const roleLabel: Record<string, string> = {
    ADMIN: 'Administrator',
    SUPERADMIN: 'Super Admin',
    DTSEN_ANALYST: 'Analis DTSEN',
    DTSEN_LOOKUP: 'Operator DTSEN (lookup NIK)',
    DTSEN_ROOT: 'Root DTSEN (identitas lengkap)',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '720px', margin: '0 auto', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8A6E1D', marginBottom: '4px' }}>
          👤 Akun & Keamanan
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1E2420', margin: '0 0 6px' }}>Pengaturan Akun</h1>
        <p style={{ color: '#767D6F', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Kelola password dan sesi login Anda.
        </p>
      </div>

      {/* Info Akun */}
      {admin && (
        <div style={{ background: '#FFFFFF', border: '1px solid #C6C3B4', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1B4332', margin: '0 0 14px' }}>Informasi Akun</h2>
          <div style={{ display: 'grid', gap: '10px', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E9E6DA', paddingBottom: '8px' }}>
              <span style={{ color: '#767D6F' }}>Username</span>
              <span style={{ fontWeight: 600, color: '#1E2420' }}>{admin.username}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E9E6DA', paddingBottom: '8px' }}>
              <span style={{ color: '#767D6F' }}>Nama</span>
              <span style={{ fontWeight: 600, color: '#1E2420' }}>{admin.nama}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#767D6F' }}>Role</span>
              <span style={{ fontWeight: 600, color: '#1B4332' }}>{roleLabel[admin.role] ?? admin.role}</span>
            </div>
          </div>
        </div>
      )}

      {/* Ganti Password */}
      <form onSubmit={handleSubmit} style={{ background: '#FFFFFF', border: '1px solid #C6C3B4', borderRadius: '16px', padding: '20px' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1B4332', margin: '0 0 14px' }}>Ganti Password</h2>

        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: '10px', marginBottom: '14px', fontSize: '0.85rem',
            background: msg.ok ? '#DCE8DE' : '#FDE8E8', color: msg.ok ? '#1B4332' : '#B3261E',
            border: `1px solid ${msg.ok ? '#2D6A4F' : '#B3261E'}`,
          }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'grid', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4B5249', marginBottom: '6px' }}>
              Password Lama *
            </label>
            <input
              type="password"
              value={passwordLama}
              onChange={(e) => setPasswordLama(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #C6C3B4', fontSize: '0.9rem', background: '#F5F3EC' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4B5249', marginBottom: '6px' }}>
              Password Baru (min. 8 karakter) *
            </label>
            <input
              type="password"
              value={passwordBaru}
              onChange={(e) => setPasswordBaru(e.target.value)}
              required
              minLength={8}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #C6C3B4', fontSize: '0.9rem', background: '#F5F3EC' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4B5249', marginBottom: '6px' }}>
              Konfirmasi Password Baru *
            </label>
            <input
              type="password"
              value={konfirmasi}
              onChange={(e) => setKonfirmasi(e.target.value)}
              required
              minLength={8}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #C6C3B4', fontSize: '0.9rem', background: '#F5F3EC' }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: '18px', padding: '10px 24px', borderRadius: '10px',
            background: '#1B4332', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.9rem',
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Menyimpan...' : '💾 Simpan Password Baru'}
        </button>
      </form>

      {/* Logout */}
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button
          onClick={handleLogout}
          style={{
            padding: '10px 24px', borderRadius: '10px', background: '#B3261E', color: '#fff',
            border: 'none', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
          }}
        >
          🚪 Logout
        </button>
      </div>
    </div>
  );
}
