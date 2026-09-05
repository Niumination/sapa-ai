'use client';

import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import QueryBar from '@/components/QueryBar';
const DefaultDashboard = dynamic(() => import('@/components/SapaStats'), {
  ssr: false,
  loading: () => <p className="text-sm text-[#767D6F]">Memuat dashboard…</p>,
});
const AIResponseRenderer = dynamic(() => import('@/components/AIResponseRenderer'), {
  ssr: false,
  loading: () => <p className="text-sm text-[#767D6F]">Memuat jawaban…</p>,
});
import KpiPanel from '@/components/KpiPanel';
import type { AiMetaSummary, HybridResponse } from '@/types';

const TopOpdWidget = dynamic(() => import('@/components/TopOpdWidget'), {
  ssr: false,
  loading: () => <p className="text-sm text-[#767D6F]">Memuat Top OPD…</p>,
});

type DashboardMode = 'default' | 'ai-response';

// Klien memutus lebih dulu daripada platform (Vercel Hobby mematikan fungsi 60 s),
// supaya pesan error yang tampil selalu benar — bukan "timeout" palsu.
const CLIENT_TIMEOUT_MS = 45_000;

function simpanRiwayat(query: string, hybrid: HybridResponse, matched: number, count: number) {
  try {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      query,
      answer: hybrid.narasi,
      source: hybrid.dataSource,
      matched,
      count,
      timestamp: new Date().toISOString(),
    };
    const key = 'sapa-ai-history';
    const cur = JSON.parse(localStorage.getItem(key) || '[]');
    const next = [item, ...cur].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('sapa-history-update', { detail: item } as any));
  } catch {}
}

export default function DashboardClient({ initialKpiData }: { initialKpiData?: { kpis: any[]; source: string } | null }) {
  const [mode, setMode] = useState<DashboardMode>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<HybridResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [liveNarasi, setLiveNarasi] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveNarasiRef = useRef('');
  const genRef = useRef(0);

  const handleQuery = useCallback(async (query: string) => {
    abortRef.current?.abort();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const gen = ++genRef.current;
    try {
      setIsLoading(true);
      setError(null);
      setAiResponse(null);
      liveNarasiRef.current = '';
      setLiveNarasi('');
      setStatusText('Menganalisis pertanyaan...');
      setMode('ai-response');
      const controller = new AbortController();
      abortRef.current = controller;
      timeoutRef.current = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

      const res = await fetch('/api/query/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      const selesai = (hybrid: HybridResponse, json: any) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        simpanRiwayat(query, hybrid, json.matched ?? 0, json.count ?? 0);
        setAiResponse(hybrid);
        setStatusText(null);
        liveNarasiRef.current = '';
        setLiveNarasi('');
      };
      const keHybrid = (json: any): HybridResponse => ({
        narasi: json.answer || json.narasi || 'Tidak ada jawaban.',
        visualisasi:
          json.visualisasi || (json.aggregated ? { tipe: 'table', konfigurasi: {}, data: json.aggregated } : { tipe: 'none', konfigurasi: {} }),
        rekomendasi: json.rekomendasi || [],
        dataSource: json.source || 'SAPA SPLP',
        timestamp: json.timestamp || new Date().toISOString(),
        ai: json.ai as AiMetaSummary | undefined,
      });

      // Jalur utama: SSE (status → token → result).
      if (contentType.includes('text/event-stream')) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error('Streaming tidak tersedia');
        const decoder = new TextDecoder();
        let buffer = '';
        let hasil: any = null;
        let streamError: string | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const block of events) {
            let eventName = 'message';
            let data = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (!data) continue;
            try {
              const payload = JSON.parse(data);
              if (eventName === 'status') setStatusText(payload.status ?? null);
              else if (eventName === 'token') {
                liveNarasiRef.current += payload.text ?? '';
                setLiveNarasi(liveNarasiRef.current);
              } else if (eventName === 'result') hasil = payload;
              else if (eventName === 'error') streamError = payload.error ?? 'Terjadi kesalahan';
            } catch {}
          }
        }
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (streamError) throw new Error(streamError);
        if (!hasil) throw new Error('Tidak ada hasil dari server');
        selesai(keHybrid(hasil), hasil);
        return;
      }

      // Cadangan: JSON biasa (bila SSE tidak tersedia).
      const json = await res.json();
      selesai(keHybrid(json), json);
    } catch (err: any) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (gen !== genRef.current) return;
      const errMsg =
        err?.name === 'AbortError'
          ? `Permintaan melewati batas ${CLIENT_TIMEOUT_MS / 1000} detik. Coba pertanyaan yang lebih singkat.`
          : `Terjadi kesalahan: ${err?.message ?? 'Unknown'}`;
      setError(errMsg);
      setMode('ai-response');
      setAiResponse(null);
      liveNarasiRef.current = '';
      setLiveNarasi('');
      setStatusText(null);
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, []);

  const handleReset = useCallback(() => {
    genRef.current++;
    abortRef.current?.abort();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMode('default');
    setAiResponse(null);
    setError(null);
    liveNarasiRef.current = '';
    setLiveNarasi('');
    setStatusText(null);
  }, []);

  return (
    <div className="space-y-5">
      <QueryBar onQuery={handleQuery} isLoading={isLoading} onReset={handleReset} isDefaultMode={mode === 'default'} />
      {mode === 'default' && (
        <>
          <KpiPanel initialData={initialKpiData ?? null} />
          <TopOpdWidget />
          <DefaultDashboard />
        </>
      )}
      {mode === 'ai-response' && !isLoading && error && (
        <div className="bg-[var(--surface-card)] border border-[#C6C3B4] rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-sm text-[#B3261E] mb-4">{error}</p>
          <button onClick={handleReset} className="px-4 py-2 bg-[#1B4332] text-[var(--on-brand)] text-sm rounded-lg hover:bg-[#2D6A4F]">
            Kembali ke Beranda
          </button>
        </div>
      )}
      {mode === 'ai-response' && !isLoading && aiResponse && <AIResponseRenderer response={aiResponse} onFollowUp={handleQuery} />}
      {mode === 'ai-response' && isLoading && (
        <div className="bg-[#E9E6DA] border border-[#C6C3B4] rounded-2xl p-12 text-center">
          <div className="w-12 h-12 border-4 border-[#1B4332]/30 border-t-[#1B4332] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#767D6F]">{statusText ?? 'Menyusun jawaban...'}</p>
          {liveNarasi ? (
            <div className="mt-4 max-w-2xl mx-auto text-left">
              <div className="bg-[var(--surface-card)] border border-[#C6C3B4] rounded-xl p-4">
                <p className="text-sm text-[#4B5249] leading-relaxed whitespace-pre-wrap">
                  {liveNarasi}
                  <span className="inline-block w-2 h-4 bg-[#1B4332] ml-0.5 animate-pulse" />
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-[#4B5249] mt-1">Angka diambil langsung dari data SAPA.</p>
          )}
        </div>
      )}
    </div>
  );
}
