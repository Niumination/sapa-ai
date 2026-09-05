// ─── Provider tiruan OpenAI-compatible (untuk uji lokal, bukan produksi) ───
// Dipakai untuk menguji jalur AI sapa-ai tanpa menghabiskan kuota:
//   node scripts/mock-llm-server.mjs  →  http://127.0.0.1:8787/v1/chat/completions
//
// Perilaku: membaca evidence dari payload, lalu menjawab dengan TOKEN {{id}}.
// Bila env MOCK_MODE=halu, sengaja menulis angka karangan (12,7 / 2019) untuk
// menguji bahwa grounding menolaknya.

import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 8787);

function bacaBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
  });
}

function susunJawaban(body) {
  const user = body?.messages?.find((m) => m.role === 'user')?.content ?? '{}';
  let payload = {};
  try {
    // Ekstraksi objek JSON seimbang (bukan lastIndexOf — bisa kena {{id}} di akhir).
    const mulai = user.indexOf('{');
    let kedalaman = 0;
    let dalamString = false;
    let lolos = false;
    let akhir = -1;
    for (let i = mulai; i < user.length; i++) {
      const ch = user[i];
      if (dalamString) {
        if (lolos) lolos = false;
        else if (ch === '\\') lolos = true;
        else if (ch === '"') dalamString = false;
        continue;
      }
      if (ch === '"') dalamString = true;
      else if (ch === '{') kedalaman++;
      else if (ch === '}') {
        kedalaman--;
        if (kedalaman === 0) { akhir = i; break; }
      }
    }
    if (akhir > 0) payload = JSON.parse(user.slice(mulai, akhir + 1));
  } catch {}
  const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
  const pertama = evidence[0];

  if (process.env.MOCK_MODE === 'halu') {
    return {
      narasi: 'Prevalensi mencapai 12,7 persen pada 2019 menurut catatan terakhir.',
      rekomendasi: ['Tindak lanjuti ke OPD terkait.'],
      followUps: ['Bagaimana tren tahun berikutnya?'],
      visualHint: 'metric',
      confidence: 'rendah',
    };
  }
  if (!pertama) {
    return { narasi: 'Data tidak tersedia pada evidence yang diberikan.', rekomendasi: [], followUps: [], visualHint: 'none', confidence: 'rendah' };
  }
  return {
    narasi: `Berdasarkan data SAPA, ${pertama.indikator} tercatat {{${pertama.id}}} pada {{${pertama.id}|t}} (sumber: ${pertama.opd}).`,
    rekomendasi: ['Koordinasikan dengan OPD pengampu untuk verifikasi data terbaru.'],
    followUps: ['Bagaimana tren indikator ini?'],
    visualHint: 'metric',
    confidence: 'tinggi',
  };
}

const server = http.createServer(async (req, res) => {
  if (!req.url?.endsWith('/chat/completions') || req.method !== 'POST') {
    res.writeHead(404).end('{"error":"not found"}');
    return;
  }
  const body = await bacaBody(req);
  const jawaban = susunJawaban(body);
  const teks = JSON.stringify(jawaban);

  if (body?.stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    // Potong kecil-kecil agar uji ejector streaming benar-benar bekerja.
    const potongan = teks.match(/[\s\S]{1,24}/g) ?? [];
    for (const p of potongan) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      choices: [{ message: { content: teks }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 800, completion_tokens: 90 },
    }),
  );
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-llm] siap di http://127.0.0.1:${PORT}/v1/chat/completions`);
});
