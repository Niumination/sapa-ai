'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function AdminToggle() {
  const [aiEnabled, setAiEnabled] = useState(true);
  const [detEnabled, setDetEnabled] = useState(true);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/admin/status')
      .then((r) => r.json())
      .then((d) => {
        setAiEnabled(d.aiEnabled);
        setDetEnabled(d.detEnabled);
      })
      .catch(() => {});
  }, []);

  async function handleToggle(field: 'aiEnabled' | 'detEnabled', value: boolean) {
    setLoading(true);
    setMsg('');
    const body = field === 'aiEnabled'
      ? { aiEnabled: value, detEnabled }
      : { aiEnabled, detEnabled: value };
    try {
      const res = await fetch('/api/admin/toggle-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': key,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setAiEnabled(data.aiEnabled);
        setDetEnabled(data.detEnabled);
        if (!data.aiEnabled && !data.detEnabled) {
          setMsg('AI & Deterministik DIMATIKAN — layanan tidak dapat diakses');
        } else if (!data.aiEnabled) {
          setMsg('AI dimatikan — hanya jawaban deterministik');
        } else if (!data.detEnabled) {
          setMsg('Deterministik dimatikan — hanya jawaban AI');
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
          <span className={aiEnabled ? styles.on : styles.off}>
            {aiEnabled ? 'AKTIF' : 'OFF'}
          </span>
        </div>
        <div className={styles.status}>
          <span>Deterministik:</span>
          <span className={detEnabled ? styles.on : styles.off}>
            {detEnabled ? 'AKTIF' : 'OFF'}
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
          onClick={() => handleToggle('aiEnabled', !aiEnabled)}
          disabled={loading || !key}
          className={styles.button}
        >
          {loading ? '...' : aiEnabled ? 'Matikan AI' : 'Aktifkan AI'}
        </button>
        <button
          onClick={() => handleToggle('detEnabled', !detEnabled)}
          disabled={loading || !key}
          className={styles.button}
          style={{ background: detEnabled ? '#444' : '#00aa44', marginTop: '0.5rem' }}
        >
          {loading ? '...' : detEnabled ? 'Matikan Deterministik' : 'Aktifkan Deterministik'}
        </button>
        {bothOff && (
          <p className={styles.warning}>
            ⚠️ Layanan SAPA-AI tidak dapat diakses
          </p>
        )}
        {msg && <p className={styles.msg}>{msg}</p>}
      </div>
      <p className={styles.hint}>
        Akses panel ini hanya untuk pemilik aplikasi.
      </p>
    </main>
  );
}
