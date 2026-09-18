'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function AdminToggle() {
  const [enabled, setEnabled] = useState(true);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/admin/status')
      .then((r) => r.json())
      .then((d) => setEnabled(d.aiEnabled))
      .catch(() => {});
  }, []);

  async function handleToggle() {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/toggle-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': key,
        },
        body: JSON.stringify({ aiEnabled: !enabled }),
      });
      if (res.ok) {
        setEnabled(!enabled);
        setMsg(`AI ${!enabled ? 'AKTIF' : 'NONAKTIF'} — toggle berhasil`);
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

  return (
    <main className={styles.main}>
      <h1>Admin Panel — AI Toggle</h1>
      <div className={styles.card}>
        <div className={styles.status}>
          <span>Status AI:</span>
          <span className={enabled ? styles.on : styles.off}>
            {enabled ? 'AKTIF' : 'NONAKTIF'}
          </span>
        </div>
        <input
          type="password"
          placeholder="Admin Key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className={styles.input}
        />
        <button
          onClick={handleToggle}
          disabled={loading || !key}
          className={styles.button}
        >
          {loading ? '...' : enabled ? 'Matikan AI' : 'Aktifkan AI'}
        </button>
        {msg && <p className={styles.msg}>{msg}</p>}
      </div>
      <p className={styles.hint}>
        Akses panel ini hanya untuk pemilik aplikasi.
      </p>
    </main>
  );
}
