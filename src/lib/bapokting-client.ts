// ─── Bapokting API Client — Fetch dari SPLP nasional ───
// Source: api-splp.layanan.go.id/bahan-pokok-penting-kabupaten-aceh-tengah/1.0/api/bapokting/harga
// API Key: Token JWT (bisa diperbarui via Vercel env vars)

export const SPLP_BAPOKTING_URL = 'https://api-splp.layanan.go.id/bahan-pokok-penting-kabupaten-aceh-tengah/1.0/api/bapokting/harga';
const SPLP_DTSEN_URL = 'https://api-splp.layanan.go.id/dtsen-aceh-tengah/1.0/api/dtsen-aceh-tengah';

// Cache bahan baku untuk query DTSEN
let splpCache: { data: any[] | null; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export interface BapoktingPrice {
  namaBarang: string;
  harga: number;
  satuan: string;
  kategori?: string;
  kecamatan?: string;
  keterangan?: string;
  tanggal?: string;
  updatedAt?: string;
}

export interface DtsenData {
  kecamatan: string;
  desa?: string;
  desil: string;
  desil_1?: number;
  desil_2?: number;
  desil_3?: number;
  desil_4?: number;
  desil_5?: number;
  pkh?: number;
  bpnt?: number;
  pbi_jk?: number;
  pbi_jk_non?: number;
  total_penerima?: number;
}

// Helper: ambil API key dari environment
function getSplpApiKey(): string {
  // Token JWT SPLP dari dokumen pengembangan
  return process.env.SPLP_API_KEY || 'eyJ4NXQjUzI1NiI6Ik16WXhNbUZrT0dZd01XSTBaV05tTkRjeE5HWXdZbU00WlRBM01XSTJOREF6WkdRek5HTTBaR1JsTmpKa09ERmtaRFJpT1RGa01XRmhNelUyWkdWbE5nPT0iLCJraWQiOiJnYXRld2F5X2NlcnRpZmljYXRlX2FsaWFzIiwidHlwIjoiSldUIiwiYWxnIjoiUlMyNTYifQ==.eyJzdWIiOiJkaXNrb21pbmZvX2FjZWh0ZW5nYWhrYWJAY2FyYm9uLnN1cGVyIiwiYXBwbGljYXRpb24iOnsiaWQiOjY2MTcsInV1aWQiOiI4ODhiZDQyZi02ZTYwLTRkMDAtODk4Ny0yZWJiNGY1YTUxMDEifSwiaXNzIjoiaHR0cHM6XC9cL3NwbHAubGF5YW5hbi5nby5pZDo0NDNcL29hdXRoMlwvdG9rZW4iLCJrZXl0eXBlIjoiU0FOREJPWCIsInRva2VuX3R5cGUiOiJhcGlLZXkiLCJpYXQiOjE3ODcyMTQ4MjQsImp0aSI6IjExZmM5NmQ5LTI2NWEtNDY2Zi1hNmFmLWIzMjgxMTcwZmQxNiJ9.JyDOTw3EGRAloogN4RxYjr98aelLKnGnd53R1gRD72VNjlo7-hvPsqRAQYo1JnBwGrw_NX_aGbQi-viwX4Pe3OX_9cBVCRIGukwQcFjbc_zyhahELzbPWD7drFzYN-GNE9Z1ToUi22uK88eI2psVoFMrMNNF5E3bR5rAVY7P3MHGpDXq1GiKhh7pPznBJsy1VFTqO7HHHKeyq4VybsxYW6JgMQXqB8WexXmHhc5PEDfcREt1sbl10gfE85dQouVnJznPu0w8Ks7vC_Q1uMmRBipYAhyoxioX_TkQlv2JecFRE2JA5X6HhnTnny_0GJ88SYVvVDD0Z64hSlynthtqYw==';
}

// Header auth khusus SPLP (AuthorizationSPLP), beberapa API butuh ini
function getSplpAuthHeaders(): Record<string, string> {
  const key = getSplpApiKey();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (key) {
    // DTSEN API butuh AuthorizationSPLP, bapokting bisa pakai Bearer
    headers['Authorization'] = `Bearer ${key}`;
    headers['AuthorizationSPLP'] = `Bearer ${key}`;
  }
  return headers;
}

// Fetch bapokting data dari SPLP API
export async function fetchBapoktingFromSplp(filters?: {
  tanggal?: string;
  kategori?: string;
}): Promise<BapoktingPrice[]> {
  // Gunakan cache jika tersedia
  if (splpCache && Date.now() - splpCache.timestamp < CACHE_DURATION) {
    return splpCache.data || [];
  }

  const headers = getSplpAuthHeaders();

  try {
    let url = `${SPLP_BAPOKTING_URL}?tb=data_aset&s=kecamatan&f=desil`;
    if (filters?.tanggal) {
      url += `&tanggal=${filters.tanggal}`;
    }
    if (filters?.kategori) {
      url += `&komoditi=${encodeURIComponent(filters.kategori)}`;
    }
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`SPLP API error ${res.status}`);
    }

    const data = await res.json();
    const result: BapoktingPrice[] = [];

    // SPLP API: { status, sumber, tanggal, daftar_harga: [...] }
    const arr = Array.isArray(data) ? data : (data?.daftar_harga || data?.data || []);

    for (const item of arr) {
      const harga = parseInt(item.harga_eceran || item.harga_borongan || item.harga || item.price || '0', 10);
      if (harga > 0) {
        result.push({
          namaBarang: item.komoditi || item.nama_barang || item.nama || item.barang || 'Tidak diketahui',
          harga,
          satuan: item.satuan || item.unit || 'Kg',
          kategori: item.kategori || item.kategori_bantu || undefined,
          kecamatan: item.kecamatan || undefined,
          keterangan: item.keterangan || undefined,
          tanggal: data?.tanggal || undefined,
          updatedAt: data?.tanggal || new Date().toISOString(),
        });
      }
    }

    // Update cache
    splpCache = { data: result, timestamp: Date.now() };

    return result;
  } catch (error) {
    console.error('[Bapokting SPLP] Fetch failed:', error);
    return [];
  }
}

// Fetch DTSEN aggregate data dari SPLP API
export async function fetchDtsenFromSplp(filters?: {
  kecamatan?: string;
  desa?: string;
  desil?: number;
}): Promise<DtsenData[]> {
  const headers = getSplpAuthHeaders();
  let url = `${SPLP_DTSEN_URL}?tb=data_aset&s=kecamatan&f=desil`;

  if (filters?.kecamatan) {
    url += `&kecamatan=${encodeURIComponent(filters.kecamatan)}`;
  }
  if (filters?.desa) {
    url += `&desa=${encodeURIComponent(filters.desa)}`;
  }
  if (filters?.desil !== undefined) {
    url += `&desil=${filters.desil}`;
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`SPLP DTSEN API error ${res.status}`);
    }

    const data = await res.json();
    const result: DtsenData[] = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        result.push({
          kecamatan: item.kecamatan || 'Tidak diketahui',
          desa: item.desa || item.nama_desa || undefined,
          desil: item.desil || item.desil_str || '1',
          desil_1: item.desil_1 !== undefined ? Number(item.desil_1) : undefined,
          desil_2: item.desil_2 !== undefined ? Number(item.desil_2) : undefined,
          desil_3: item.desil_3 !== undefined ? Number(item.desil_3) : undefined,
          desil_4: item.desil_4 !== undefined ? Number(item.desil_4) : undefined,
          desil_5: item.desil_5 !== undefined ? Number(item.desil_5) : undefined,
          pkh: Number(item.pkh || 0),
          bpnt: Number(item.bpnt || 0),
          pbi_jk: Number(item.pbi_jk || item.pbi_jk_buka || 0),
          pbi_jk_non: Number(item.pbi_jk_non || item['pbi-jk-non'] || 0),
          total_penerima: Number(item.total_penerima || item.total || 0),
        });
      }
    } else if (data?.data && Array.isArray(data.data)) {
      for (const item of data.data) {
        result.push({
          kecamatan: item.kecamatan || 'Tidak diketahui',
          desa: item.desa || item.nama_desa || undefined,
          desil: item.desil || item.desil_str || '1',
          desil_1: item.desil_1 !== undefined ? Number(item.desil_1) : undefined,
          desil_2: item.desil_2 !== undefined ? Number(item.desil_2) : undefined,
          desil_3: item.desil_3 !== undefined ? Number(item.desil_3) : undefined,
          desil_4: item.desil_4 !== undefined ? Number(item.desil_4) : undefined,
          desil_5: item.desil_5 !== undefined ? Number(item.desil_5) : undefined,
          pkh: Number(item.pkh || 0),
          bpnt: Number(item.bpnt || 0),
          pbi_jk: Number(item.pbi_jk || item.pbi_jk_buka || 0),
          pbi_jk_non: Number(item.pbi_jk_non || item['pbi-jk-non'] || 0),
          total_penerima: Number(item.total_penerima || item.total || 0),
        });
      }
    }

    return result;
  } catch (error) {
    console.error('[DTSEN SPLP] Fetch failed:', error);
    return [];
  }
}

// Fallback: ambil dari web scraping (original bapokting-client)
export async function fetchLatestBapoktingPrices(limit: number = 50): Promise<BapoktingPrice[]> {
  const fromApi = await fetchBapoktingFromSplp();
  
  if (fromApi.length > 0) {
    return fromApi.slice(0, limit);
  }

  // Fallback ke web scraping
  return fallbackWebScraping(limit);
}

// Original web scraping fallback
async function fallbackWebScraping(limit: number): Promise<BapoktingPrice[]> {
  const BASE_URL = 'https://cc.acehtengahkab.go.id/data-bapokting';
  const MAX_PAGES = 10; // Kurangi untuk testing

  const allPrices: BapoktingPrice[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const url = `${BASE_URL}?page=${page}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        break;
      }

      const html = await res.text();
      
      // Parse HTML table
      const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gi;
      const cellRegex = /<(td|th)[^>]*>(.*?)<\/(td|th)>/gi;
      
      let rowMatch;
      let isFirstRow = true;

      while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowHtml = rowMatch[1];

        if (isFirstRow && rowHtml.includes('No')) {
          isFirstRow = false;
          continue;
        }

        const cells: string[] = [];
        let cellMatch;

        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          const cellText = cellMatch[2].replace(/<[^>]+>/g, '').trim();
          cells.push(cellText);
        }

        if (cells.length >= 3) {
          const hargaStr = cells[2] || '';
          const harga = parseInt(hargaStr.replace(/[Rp.\s]/g, '').trim(), 10) || 0;
          
          if (harga > 0) {
            allPrices.push({
              namaBarang: cells[1] || 'Tidak diketahui',
              harga,
              satuan: cells[3] || 'Kg',
            });
          }
        }
      }

      if (allPrices.length > 0 && allPrices.length >= limit) {
        break;
      }
    } catch (error) {
      break;
    }
  }

  return allPrices.slice(0, limit);
}
