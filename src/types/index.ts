// ─── Shared Types ───

export type ExecutiveAnswerType =
  | 'metric'
  | 'comparison'
  | 'distribution'
  | 'trend'
  | 'not_available'
  | 'table'
  | 'map';

export interface ExecutiveMetric {
  label: string;
  value: string | number;
  unit?: string;
  opd?: string;
  tahun?: string | null;
}

export interface ExecutiveEvidence {
  id: number | string;
  indikator: string;
  nilai: string;
  satuan: string;
  opd?: string;
  tahun?: string | null;
}

export interface ExecutiveInsight {
  tone: 'ok' | 'info' | 'warn';
  label: string;
  text: string;
}

export interface ExecutiveQuickWin {
  title: string;
  action: string;
  owner?: string;
  horizon?: string;
}

export interface ExecutiveVisual {
  type: 'metric' | 'bar' | 'line' | 'area' | 'table' | 'map' | 'none';
  title: string;
  subtitle?: string;
  data: Record<string, unknown>[];
  xKey?: string;
  series: { key: string; name: string; color: string }[];
  columns: { key: string; name: string }[];
  rows: Record<string, unknown>[];
}

export interface ExecutivePresentation {
  version: 'v1';
  answerType: ExecutiveAnswerType;
  title: string;
  lead: string;
  narrative: string;
  metrics: ExecutiveMetric[];
  visual: ExecutiveVisual;
  insights: ExecutiveInsight[];
  quickWins: ExecutiveQuickWin[];
  dataQuality: Array<{ label: string; status: 'ok' | 'warn' | 'info'; text: string }>;
  evidence: ExecutiveEvidence[];
  followUps: string[];
  provenance: {
    source: string;
    origin: 'direct' | 'splp' | 'unknown';
    fetchedAt: string;
    evidenceCount: number;
  };
}

export interface HybridResponse {
  narasi: string;
  visualisasi: {
    tipe: 'chart' | 'table' | 'map' | 'metric' | 'none';
    konfigurasi: Record<string, unknown>;
  };
  rekomendasi: string[];
  dataSource: string;
  timestamp: string;
  /** Optional presentation layer; legacy fields remain the source-compatible contract. */
  presentation?: ExecutivePresentation;
}

export interface IntentResult {
  kategori: 'tren' | 'perbandingan' | 'nilai_saat_ini' | 'rekomendasi' | 'ews' | 'umum';
  splpEndpoint?: string;
  datasetSlug?: string;
  periode?: string;
  lokasi?: string;
  butuhData: boolean;
  intentRaw: string;
  opdFilter?: string;
}

export interface SyncResult {
  slug: string;
  status: 'ok' | 'error';
  error?: string;
}

export interface EwsAlertData {
  id: string;
  pesan: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  indicator: {
    nama: string;
    satuan: string;
    dataset: { slug: string; nama: string };
  };
  createdAt: string;
}

export interface DatasetSummary {
  slug: string;
  nama: string;
  deskripsi?: string;
  lastSync?: string;
  isActive: boolean;
  recordCount?: number;
  skpd?: string;
}
