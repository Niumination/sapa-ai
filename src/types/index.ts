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
  /**
   * Mutu sitasi per klaim (FR-19). Opsional karena presentasi tersimpan dari
   * versi sebelumnya tidak memilikinya — UI wajib menanganinya sebagai "tidak tahu",
   * bukan sebagai "nol klaim".
   */
  citations?: {
    totalKlaim: number;
    bersitasi: number;
    tanpaSitasi: string[];
  };
  provenance: {
    source: string;
    origin: 'direct' | 'splp' | 'unknown';
    /** Waktu korpus SPLP ditarik (FR-25). */
    fetchedAt: string;
    /** Waktu JAWABAN disusun — dibedakan dari `fetchedAt` agar label UI tidak menyesatkan. */
    disusunPada?: string;
    /** Tahun data yang muncul pada bukti jawaban (urut menurun). */
    dataYears?: string[];
    /** Sidik versi korpus (DS-03); null bila tidak tersedia. */
    fingerprint?: string | null;
    /** Jumlah bukti yang MENOPANG jawaban (sebelum bentuk memotong baris). */
    evidenceCount: number;
    /** FR-18: jumlah baris yang benar-benar dipajang bentuk (≤ `evidenceCount`). */
    evidenceDisajikan?: number;
  };
  buckets: Record<string, ExecutiveEvidence[]>;
  bucketSummary: string;
  /** FR-18: bentuk jawaban yang dipakai panel ini + catatan kejujurannya. */
  bentuk?: import('@/services/bentuk-jawaban').BentukJawaban;
  /** FR-18: porsi tiap baris bukti (0–100) — hanya bila totalnya ADA di bukti. */
  porsi?: Record<string, number>;
}

/** Ringkasan metadata AI yang ikut dikirim ke UI (label kejujuran sumber). */
export interface AiMetaSummary {
  used: boolean;
  shadow: boolean;
  model: string | null;
  grounded: 'pass' | 'replaced' | 'skipped';
  reason?: string;
  error?: string;
}


export interface HybridResponse {
  narasi: string;
  visualisasi: {
    tipe: 'chart' | 'table' | 'map' | 'metric' | 'none';
    konfigurasi: Record<string, unknown>;
  };
  rekomendasi: string[];
  dataSource: string;
  /** Waktu JAWABAN disusun (ISO). */
  timestamp: string;
  /**
   * Waktu korpus SPLP DITARIK (ISO). Berbeda dari `timestamp`.
   * Diisi rute; ditampilkan sebagai "Data SPLP ditarik" — bukan "diakses".
   * Opsional supaya respons lama (riwayat tersimpan, klien lama) tetap sah.
   */
  dataFetchedAt?: string;
  /** Sidik versi korpus (8 heks) — pembeda cache & jejak audit (DS-03). */
  dataFingerprint?: string;
  /** Tahun data pada bukti jawaban, urut menurun. Kosong = tidak ada bukti bertahun. */
  dataYears?: string[];
  /**
   * Niat pertanyaan hasil router deterministik (FR-18). Additif: respons lama
   * tidak memilikinya, dan UI wajib memperlakukannya sebagai "tidak tahu".
   */
  niat?: string;
  /** Pertanyaan asli — dipakai membentuk jawaban (arah peringkat). Additif. */
  query?: string;
  /**
   * Baris bukti SPLP yang menopang jawaban (id, indikator, nilai, satuan, OPD,
   * tahun) — dikirim rute apa adanya. Panel memakai baris INI sebagai baris
   * bukti; sebelumnya baris diturunkan dari `visualisasi` sehingga id menjadi
   * sintetis dan tahun hilang pada visual grafik.
   */
  evidence?: import('@/services/grounding').EvidenceItem[];
  /** Bentuk jawaban yang dituntut niat (FR-18). Additif. */
  bentuk?: import('@/services/bentuk-jawaban').BentukJawaban;
  /**
   * FR-18: urutan id bukti SETELAH ditata bentuk — inilah urutan yang dipajang
   * panel. Rute mengirimnya supaya urutan yang dilihat pengguna dapat diperiksa
   * lewat HTTP (dan klien lain tidak perlu meniru logikanya). Additif.
   */
  urutanBukti?: Array<number | string>;
  /** FR-18: porsi tiap id bukti (0–100) — hanya bila totalnya ADA di bukti. Additif. */
  porsi?: Record<string, number>;
  /** Optional presentation layer; legacy fields remain the source-compatible contract. */
  presentation?: ExecutivePresentation;
  /** Metadata AI — dipakai UI untuk label "dirangkai AI" vs "dihitung deterministik". */
  ai?: AiMetaSummary;
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
