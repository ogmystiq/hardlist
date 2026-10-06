/* Visar sajten lokalt som GitHub Pages gör: /quiz skickas till /quiz/,
   mappar ger sin index.html och okända adresser får 404.html med status 404.
   En vanlig filserver gör inget av det, och då går varken rena adresser
   eller felsidan att prova innan något pushas.

   node scripts/lokal-server.mjs        (port 8080)
   node scripts/lokal-server.mjs 3000

   Lyssnar på hela nätverket så att sajten går att öppna i mobilen på samma
   wifi. Adressen skrivs ut när servern startat. */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8080;

const TYPER = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.xml':'application/xml; charset=utf-8',
  '.ics':'text/calendar; charset=utf-8', '.txt':'text/plain; charset=utf-8',
  '.png':'image/png', '.ico':'image/x-icon', '.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json',
  '.woff2':'font/woff2'
};

async function arFil(p){ try { return (await stat(p)).isFile(); } catch { return false; } }
async function arMapp(p){ try { return (await stat(p)).isDirectory(); } catch { return false; } }

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://lokal');
  let sokvag;
  try { sokvag = decodeURIComponent(url.pathname); } catch { sokvag = '/'; }
  const fil = resolve(ROOT, '.' + sokvag);
  // Inget utanför repot, och inget ur mappar som aldrig publiceras.
  const inom = fil === ROOT || fil.startsWith(ROOT + sep);
  const dolt = /[\\/]\.(git|github)([\\/]|$)/.test(fil);

  let svar = null, status = 200;
  if (inom && !dolt){
    if (await arFil(fil)) svar = fil;
    else if (await arMapp(fil)){
      if (!sokvag.endsWith('/')){
        res.writeHead(301, { Location: sokvag + '/' + url.search });
        return res.end();
      }
      if (await arFil(resolve(fil, 'index.html'))) svar = resolve(fil, 'index.html');
    }
  }
  if (!svar){ svar = resolve(ROOT, '404.html'); status = 404; }

  const data = await readFile(svar);
  res.writeHead(status, {
    'Content-Type': TYPER[extname(svar)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  res.end(data);
  console.log(status, sokvag);
}).on('error', err => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${PORT} används redan av något annat. Prova: node scripts/lokal-server.mjs ${PORT + 10}`);
  process.exit(1);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Datorn:  http://localhost:${PORT}/`);
  for (const lista of Object.values(networkInterfaces())){
    for (const a of lista || []){
      if (a.family === 'IPv4' && !a.internal) console.log(`Mobilen: http://${a.address}:${PORT}/`);
    }
  }
});
