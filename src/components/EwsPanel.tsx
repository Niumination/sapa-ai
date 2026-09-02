'use client';

import { useEffect, useState } from 'react';
import { EwsAlertData } from '@/types';

const SEVERITY_STYLES: Record<string, { bg: string; dot: string; text: string }> = {
  CRITICAL: { bg: 'bg-[#FBE3DE] border-[#B3261E]/20', dot: 'bg-red-500', text: 'text-[#B3261E]' },
  WARNING: { bg: 'bg-[#F3DCC9] border-[#A15C38]/20', dot: 'bg-amber-500', text: 'text-[#1B4332]' },
  INFO: { bg: 'bg-[#DCE8DE] border-[#C6C3B4]', dot: 'bg-blue-500', text: 'text-[#1B4332]' },
};

export default function EwsPanel() {
  const [alerts, setAlerts] = useState<EwsAlertData[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/ews');
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setReady(data.ready ?? false);
    } catch {
      setAlerts([]);
      setReady(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="text-xs text-[#4B5249] p-3 text-center animate-pulse">
        Memuat alert...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-[#767D6F] uppercase tracking-wider">
          ⚠️ EWS
        </h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E9E6DA] text-[#767D6F] border border-[#C6C3B4]">
          {alerts.length} aktif
        </span>
      </div>

      {ready === false ? (
        <div className="text-center py-6">
          <div className="w-10 h-10 rounded-full bg-[#F3DCC9] flex items-center justify-center mx-auto mb-2">
            <span className="text-[#A15C38] text-lg">⏸</span>
          </div>
          <p className="text-[11px] text-[#767D6F]">
            EWS belum aktif — snapshot warehouse belum dibuat.
          </p>
          <p className="text-[10px] text-[#A15C38] mt-1">
            Jalankan POST /api/setup atau tunggu cron harian 22:00 UTC.
          </p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-6">
          <div className="w-10 h-10 rounded-full bg-[#DCE8DE] flex items-center justify-center mx-auto mb-2">
            <span className="text-[#2D6A4F] text-lg">✓</span>
          </div>
          <p className="text-[11px] text-[#767D6F]">
            Semua indikator dalam batas normal
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {alerts.map((alert) => {
            const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.INFO;
            return (
              <div
                key={alert.id}
                className={`rounded-xl border p-3 ${style.bg} transition-all duration-200 hover:scale-[1.02]`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${style.dot} ${alert.severity === 'CRITICAL' ? 'animate-pulse' : ''}`} />
                  <span className={`text-[10px] font-bold ${style.text} uppercase tracking-wider`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="text-[11px] text-[#4B5249] leading-relaxed">
                  {alert.pesan}
                </p>
                <p className="text-[10px] text-[#4B5249] mt-1.5">
                  {alert.indicator.nama} — {alert.indicator.dataset.nama}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
