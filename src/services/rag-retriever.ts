// ─── RAG: Retrieval-Augmented Generation ───
// Qdrant optional — graceful fallback jika offline.
// Tanpa Qdrant, LLM tetap jalan tanpa konteks regulasi.

export interface RegulationContext {
  judul: string;
  pasal?: string;
  konten: string;
  relevansi: number;
}

export async function retrieveContext(
  query: string,
  kategori?: string,
): Promise<RegulationContext[]> {
  const qdrantUrl = process.env.QDRANT_URL;
  if (!qdrantUrl) return []; // Qdrant belum dikonfigurasi — skip silently

  try {
    // Dynamic import embedQuery hanya jika Qdrant tersedia
    // (embedQuery sekarang dihapus dari llm-client, jadi skip)
    // RAG via Qdrant bisa ditambahkan lagi nanti saat vector DB ready.
    return [];
  } catch {
    return [];
  }
}
