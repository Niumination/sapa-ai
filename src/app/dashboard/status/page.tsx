'use client';
import { useState, useEffect } from 'react';

export default function StatusPage() {
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    fetch('/api/sapa')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setStatus(d); setBusy(false); })
      .catch(() => { setError('Gagal memuat status sumber.'); setBusy(false); });
  }, []);

  if (busy) return <div className="p-6 text-sm text-[#767D6F]">Memuat status sumber...</div>;
  if (error) return <div className="p-6 text-sm text-[#B3261E]">{error}</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-[#1B4332]">Status Sumber Data</h1>
      <div className="bg-[#FFFFFF] border border-[#C6C3B4] rounded-2xl p-5 space-y-2">
        <p className="text-sm text-[#4B5249]">Sumber data aktif: <strong>SAPA SPLP</strong></p>
        <p className="text-sm text-[#4B5249]">Status: <strong className="text-[#2D6A4F]">Online</strong></p>
        <p className="text-sm text-[#4B5249]">Mode: <strong>Publik — tanpa login</strong></p>
      </div>
    </div>
  );
}
