'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

type Backend = 'redis' | 'memory';

export default function AdminToggle() {
  const [aiEnabled, setAiEnabled] = useState(true);
  const [detEnabled, setDetEnabled] = useState(true);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function muat() {
    try {
      const r = await fetch('/api/admin/status', { cache: 'no-store' });
      const d = await r.json();
      setAiEnabled(d.aiEnabled);
      setDetEnabled(d.detEnabled);
      setBackend(d.backend);
    } catch {
      /* abaikan */
    }
  }

  useEffect(() => {
    muat();
  }, []);

  async function handleToggle(field: 'aiEnabled' | 'detEnabled', value: boolean) {
    setLoading(true);
    setMsg('');
    const body =
      field === 'aiEnabled'
        ? { aiEnabled: value, detEnabled }
        : { aiEnabled, detEnabled: value };
    try {
      const res = await fetch('/api/admin/toggle-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setAiEnabled(data.aiEnabled);
        setDetEnabled(data.detEnabled);
        setBackend(data.backend);
        // Baca ulang dari server: membuktikan state benar-benar tersimpan.
        await muat();
        if (!data.aiEnabled && !data.detEnabled) {
          setMsg('AI & Deterministik DIMATIKAN — layanan tidak dapat diakses');
        } else if (!data.aiEnabled) {
          setMsg('AI dimatikan — hanya jawaban deterministik');
        } else if (!data.detEnabled) {
          setMsg('Deterministik dimatikan — layanan tidak dapat diakses');
        } else {
          setMsg('AI & Deterministik AKTIF');
        }
      } else if (res.status === 401) {
        setMsg('Key salah — unauthorized');
      } else {
        setMsg(`Error: ${res.status}`);
      }
    } catch (e) {
      setMsg(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  const bothOff = !aiEnabled && !detEnabled;

  return (
    <main className={styles.main}>
      <h1>Admin Panel — AI Toggle</h1>
      <div className={styles.card}>
        <div className={styles.status}>
          <span>AI:</span>
          <span className={aiEnabled ? styles.on : styles.off}>{aiEnabled ? 'AKTIF' : 'OFF'}</span>
        </div>
        <div className={styles.status}>
          <span>Deterministik:</span>
          <span className={detEnabled ? styles.on : styles.off}>{detEnabled ? 'AKTIF' : 'OFF'}</span>
        </div>
        <div className={styles.status}>
          <span>Penyimpanan:</span>
          <span className={backend === 'redis' ? styles.on : styles.warn}>
            {backend === null ? '…' : backend === 'redis' ? 'Redis (global)' : 'Memori (per-instance)'}
          </span>
        </div>

        {backend === 'memory' && (
          <p className={styles.warning}>
            ⚠️ UPSTASH_REDIS_REST_URL / _TOKEN belum diset. State toggle hanya berlaku per-instance
            sehingga bisa tidak konsisten antar permintaan. Set keduanya untuk toggle global.
          </p>
        )}

        <input
          type="password"
          placeholder="Admin Key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className={styles.input}
        />
        <button
          onClick={() => handleToggle('aiEnabled', !aiEnabled)}
          disabled={loading || !key}
          className={styles.button}
        >
          {loading ? '...' : aiEnabled ? 'Matikan AI' : 'Aktifkan AI'}
        </button>
        <button
          onClick={() => handleToggle('detEnabled', !detEnabled)}
          disabled={loading || !key}
          className={styles.buttonAlt}
        >
          {loading ? '...' : detEnabled ? 'Matikan Deterministik' : 'Aktifkan Deterministik'}
        </button>

        {bothOff && <p className={styles.warning}>⚠️ Layanan SAPA-AI tidak dapat diakses</p>}
        {msg && <p className={styles.msg}>{msg}</p>}
      </div>
      <p className={styles.hint}>Akses panel ini hanya untuk pemilik aplikasi.</p>
    </main>
  );
}
