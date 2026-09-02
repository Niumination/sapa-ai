// ─── Shared Types ───

export interface HybridResponse {
  narasi: string;
  visualisasi: {
    tipe: 'chart' | 'table' | 'map' | 'metric' | 'none';
    konfigurasi: Record<string, any>;
    data?: any; // Bapokting response raw data
  };
  rekomendasi: string[];
  dataSource: string;
  timestamp: string;
  analysis?: string; // WP5 — insight terukur + caveat ringkas (opsional)
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
