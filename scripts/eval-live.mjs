import fs from 'fs';
import path from 'path';
import https from 'https';

const BASE = process.env.BASE || 'https://cc-acehtengah.vercel.app';
const GOLDEN_PATH = path.join(process.cwd(), 'data', 'golden-queries.json');
const OUT = path.join(process.cwd(), '..', '..', '..', '..', '..', '..', 'tmp', 'eval-live');
fs.mkdirSync(OUT, { recursive: true });

const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
const queries = Array.isArray(golden) ? golden : (golden.queries || []);

function request(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() })); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  console.log(`BASE=${BASE}`);
  console.log(`queries=${queries.length}`);
  let ok = 0, fail = 0;
  for (const q of queries.slice(0, 5)) {
    const id = q.id || q.query || 'unknown';
    const t0 = Date.now();
    try {
      const res = await request(`${BASE}/api/query`, { query: q.question, sessionId: `eval-${Date.now()}` });
      const ms = Date.now() - t0;
      if (res.status === 200) { ok++; console.log(`OK ${id} ${ms}ms`); } else { fail++; console.log(`FAIL ${id} status=${res.status} ${ms}ms body=${res.body.slice(0,120)}`); }
    } catch (e) { fail++; console.log(`ERR ${id} ${e.message}`); }
    await sleep(7000);
  }
  console.log(`result: ${ok} ok, ${fail} fail`);
}

run();
