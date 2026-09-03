'use client';

import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import QueryBar from '@/components/QueryBar';
// Recharts-heavy: dynamic ssr:false agar tidak masuk bundle awal home
const DefaultDashboard = dynamic(() => import('@/components/SapaStats'), {
  ssr: false,
  loading: () => <p className="text-sm text-[#767D6F]">Memuat dashboard…</p>,
});
const AIResponseRenderer = dynamic(() => import('@/components/AIResponseRenderer'), {
  ssr: false,
  loading: () => <p className="text-sm text-[#767D6F]">Memuat jawaban…</p>,
});
import KpiPanel from '@/components/KpiPanel';
import { HybridResponse } from '@/types';

type DashboardMode = 'default' | 'ai-response';

export default function DashboardPage() {
  const [mode, setMode] = useState<DashboardMode>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<HybridResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [liveNarasi, setLiveNarasi] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveNarasiRef = useRef('');

  const handleQuery = useCallback(async (query: string) => {
    // Abort previous request if any
    abortRef.current?.abort();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

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
      timeoutRef.current = setTimeout(() => controller.abort(), 65000);

      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }

      // Non-stream JSON mode (current /api/query returns JSON directly)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        // Map JSON -> HybridResponse for renderer
        const hybrid: HybridResponse = {
          narasi: json.answer || json.narasi || 'Tidak ada jawaban.',
          visualisasi: json.visualisasi || (json.aggregated ? { tipe: 'table', konfigurasi: {}, data: json.aggregated } : { tipe: 'none', konfigurasi: {} }),
          rekomendasi: json.rekomendasi || [],
          dataSource: json.source || 'SAPA SPLP',
          timestamp: json.timestamp || new Date().toISOString(),
        };
        // Simpan ke riwayat lokal untuk /dashboard/laporan tab Riwayat
        try {
          const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`, query, answer: hybrid.narasi, source: hybrid.dataSource, matched: json.matched ?? 0, count: json.count ?? 0, timestamp: new Date().toISOString() };
          const key = 'sapa-ai-history';
          const cur = JSON.parse(localStorage.getItem(key) || '[]');
          const next = [item, ...cur].slice(0, 50);
          localStorage.setItem(key, JSON.stringify(next));
          window.dispatchEvent(new CustomEvent('sapa-history-update', { detail: item } as any));
        } catch {}
        setAiResponse(hybrid);
        setStatusText(null);
        liveNarasiRef.current = '';
        setLiveNarasi('');
        return;
      }

      // SSE stream reader (fallback if server sends event-stream)
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming tidak tersedia');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: HybridResponse | null = null;
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const eventBlock of events) {
          const eventLines = eventBlock.split('\n');
          let eventName = 'message';
          let eventData = '';

          for (const line of eventLines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) eventData += line.slice(5).trim();
          }

          if (!eventData) continue;

          try {
            const payload = JSON.parse(eventData);
            if (eventName === 'status') {
              setStatusText(payload.status ?? null);
            } else if (eventName === 'narasi') {
              liveNarasiRef.current = payload.text ?? '';
              setLiveNarasi(liveNarasiRef.current);
            } else if (eventName === 'result') {
              finalResult = payload as HybridResponse;
            } else if (eventName === 'error') {
              streamError = payload.error ?? 'Terjadi kesalahan';
            }
          } catch {
            // Skip malformed JSON (partial chunks)
          }
        }
      }

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (streamError) throw new Error(streamError);

      if (finalResult) {
        setAiResponse(finalResult);
      } else if (liveNarasiRef.current) {
        // Fallback: narasi streaming tanpa JSON lengkap — build minimal response
        setAiResponse({
          narasi: liveNarasiRef.current,
          visualisasi: { tipe: 'none', konfigurasi: {} },
          rekomendasi: [],
          dataSource: 'SAPA Aceh Tengah',
          timestamp: new Date().toISOString(),
        });
      } else {
        throw new Error('AI tidak mengembalikan respons');
      }

      setStatusText(null);
      liveNarasiRef.current = '';
      setLiveNarasi('');
    } catch (err: any) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const errMsg = err?.name === 'AbortError'
        ? 'AI membutuhkan waktu terlalu lama (65 detik). Coba pertanyaan yang lebih singkat.'
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
      {/* Query Bar — ALWAYS visible */}
      <QueryBar onQuery={handleQuery} isLoading={isLoading} onReset={handleReset} isDefaultMode={mode === 'default'} />

      {/* Content Area — switches between default and AI response */}
      {mode === 'default' && (
        <>
          <KpiPanel />
          <DefaultDashboard />
        </>
      )}

      {mode === 'ai-response' && !isLoading && error && (
        <div className="bg-[var(--surface-card)] border border-[#C6C3B4] rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-sm text-[#B3261E] mb-4">{error}</p>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-[#1B4332] text-[var(--on-brand)] text-sm rounded-lg hover:bg-[#2D6A4F]"
          >
            Kembali ke Beranda
          </button>
        </div>
      )}

      {mode === 'ai-response' && !isLoading && aiResponse && (
        <AIResponseRenderer response={aiResponse} onFollowUp={handleQuery} />
      )}

      {mode === 'ai-response' && isLoading && (
        <div className="bg-[#E9E6DA] border border-[#C6C3B4] rounded-2xl p-12 text-center">
          <div className="w-12 h-12 border-4 border-[#1B4332]/30 border-t-[#1B4332] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#767D6F]">{statusText ?? 'AI sedang menganalisis data SAPA...'}</p>
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
            <p className="text-[10px] text-[#4B5249] mt-1">Menyusun jawaban...</p>
          )}
        </div>
      )}
    </div>
  );
}
