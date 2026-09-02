import { z } from 'zod';

const SPLP_CONFIG = {
  baseUrl: process.env.SPLP_BASE_URL ?? '',
  token: process.env.SPLP_TOKEN ?? '',
  timeout: 30000,
};

const SPLPResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  data: z.any(),
  meta: z
    .object({
      total: z.number().optional(),
      page: z.number().optional(),
      checksum: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export type SPLPResponse = z.infer<typeof SPLPResponseSchema>;

export async function fetchFromSplp(endpoint: string, params?: Record<string, string>) {
  if (!SPLP_CONFIG.baseUrl || !SPLP_CONFIG.token) {
    throw new Error('SPLP_CONFIG tidak lengkap — cek SPLP_BASE_URL dan SPLP_TOKEN');
  }

  const url = new URL(`${SPLP_CONFIG.baseUrl}/api/v1/${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${SPLP_CONFIG.token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(SPLP_CONFIG.timeout),
  });

  if (!res.ok) {
    throw new Error(`SPLP error ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  return SPLPResponseSchema.parse(json);
}

// ─── Mapping dataset SAPA → endpoint SPLP ───
export const SAPA_DATASET_MAP: Record<string, string> = {
  kemiskinan: 'sapa/dataset/kemiskinan',
  stunting: 'sapa/dataset/stunting',
  inflasi: 'sapa/dataset/inflasi-pangan',
  anggaran: 'sapa/dataset/realisasi-anggaran',
  kepegawaian: 'sapa/dataset/kepegawaian',
  bansos: 'sapa/dataset/bantuan-sosial',
  pendidikan: 'sapa/dataset/pendidikan',
  kesehatan: 'sapa/dataset/kesehatan',
};

export type DatasetSlug = keyof typeof SAPA_DATASET_MAP;
