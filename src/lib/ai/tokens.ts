// ─── Narasi ber-token — inti rancangan anti-halusinasi ───
//
// Model TIDAK pernah menulis angka: ia menulis {{1945}} dan kode yang menggantinya
// dengan nilai asli dari evidence. Karena itu:
//   • tidak ada angka hasil karangan, tidak ada pergeseran desimal;
//   • format angka otomatis konsisten dengan tampilan SAPA (9.610, 31,4);
//   • token yang tidak dikenal dibuang (bukan dibiarkan tampil ke publik).
//
// Bentuk token:  {{511}}        → "31,4 Persen"
//                {{511|t}}      → "31,4 Persen (2025)"

export interface TokenEvidence {
  id: number | string;
  nilai: string;
  satuan?: string | null;
  tahun?: string | null;
}

const TOKEN_RE = /\{\{\s*([A-Za-z0-9_:.-]+?)\s*(?:\|\s*(t)\s*)?\}\}/g;

function renderToken(item: TokenEvidence, withYear: boolean): string {
  const nilai = String(item.nilai ?? '').trim();
  const satuan = String(item.satuan ?? '').trim();
  const dasar = satuan ? `${nilai} ${satuan}` : nilai;
  if (!withYear) return dasar;
  const tahun = String(item.tahun ?? '').trim();
  if (/^\d{4}$/.test(tahun)) return `${dasar} (${tahun})`;
  return `${dasar} (tahun tidak tercantum)`;
}

export interface EjectResult {
  text: string;
  /** Token yang merujuk evidence yang tidak ada — menandai model mengarang referensi. */
  unknown: string[];
  replaced: number;
}

/** Ganti semua {{id}} dengan nilai evidence. Token tak dikenal dihapus. */
export function ejectTokens(text: string, evidence: TokenEvidence[]): EjectResult {
  const map = new Map<string, TokenEvidence>();
  for (const e of evidence) map.set(String(e.id), e);

  const unknown: string[] = [];
  let replaced = 0;
  const out = text.replace(TOKEN_RE, (_full, id: string, flagTahun?: string) => {
    const item = map.get(String(id));
    if (!item) {
      unknown.push(String(id));
      return '';
    }
    replaced++;
    return renderToken(item, flagTahun === 't');
  });

  return { text: out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim(), unknown, replaced };
}

/**
 * Ejector aman untuk streaming: potongan yang mengandung awalan token
 * ("{{", "{{5", "{{51") ditahan sampai lengkap, supaya tidak bocor ke layar.
 */
export function createStreamEjector(evidence: TokenEvidence[]) {
  const map = new Map<string, TokenEvidence>();
  for (const e of evidence) map.set(String(e.id), e);
  let buffer = '';

  const proses = (teks: string, akhir: boolean): string => {
    buffer += teks;
    // Cari awalan token terakhir yang belum lengkap.
    const idx = buffer.lastIndexOf('{{');
    let aman: string;
    let sisa: string;
    if (idx >= 0 && !buffer.slice(idx).includes('}}')) {
      aman = buffer.slice(0, idx);
      sisa = buffer.slice(idx);
    } else {
      aman = buffer;
      sisa = '';
    }
    if (akhir) {
      // Akhir aliran: token yang belum lengkap dibuang.
      aman = buffer;
      sisa = '';
    }
    const unknown: string[] = [];
    const hasil = aman.replace(TOKEN_RE, (_full, id: string, flagTahun?: string) => {
      const item = map.get(String(id));
      if (!item) {
        unknown.push(String(id));
        return '';
      }
      return renderToken(item, flagTahun === 't');
    });
    void unknown;
    buffer = sisa;
    return hasil;
  };

  return {
    push(chunk: string): string {
      return proses(chunk, false);
    },
    flush(): string {
      return proses('', true);
    },
  };
}
