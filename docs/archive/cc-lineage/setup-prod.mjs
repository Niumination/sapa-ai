import https from 'https';
import readline from 'readline';

const BASE = 'https://cc-acehtengah.vercel.app';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('ADMIN_SETUP_TOKEN: ', async (token) => {
  rl.close();
  if (!token || token.length < 16) { console.log('TOKEN_TOO_SHORT'); process.exit(1); }
  const endpoints = ['/api/setup','/api/setup/admin','/api/cron/sync-sapa'];
  for (const p of endpoints) {
    await new Promise((resolve, reject) => {
      const body = JSON.stringify({});
      const req = https.request({ hostname: 'cc-acehtengah.vercel.app', path: p, method: 'POST', headers: { 'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'x-setup-token':token } }, (res) => { const c=[]; res.on('data',d=>c.push(d)); res.on('end',()=>{ console.log(p+' status='+res.statusCode+' body='+Buffer.concat(c).toString()); resolve(); }); });
      req.on('error', reject);
      req.write(body); req.end();
    });
  }
});
