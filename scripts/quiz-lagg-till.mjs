/* Lägger in nya quizfrågor från en fil, eller uppdaterar befintliga, och
   uppdaterar sedan kopian i hardlist-privat.

   node scripts/quiz-lagg-till.mjs C:\Users\jonte\hardlist-privat\nya.json
   node scripts/quiz-lagg-till.mjs nya.json --torrkorning

   Filen har samma format som den gamla data/quiz.json: antingen
   { "fragor": [ ... ] } eller bara listan. Med "id" uppdateras den frågan,
   annars läggs den till — eller uppdateras om samma fråga med samma rätta
   svar redan finns.

   Låtfrågor utan "ljud" får sitt ljud från iTunes här, en gång. Sedan ligger
   adressen i databasen och ingenting slås upp när frågan ställs. */

import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRIVAT, KOPIA, kor, jsonLiteral, exportera } from './quiz-databas.mjs';

const args = process.argv.slice(2);
const TORR = args.includes('--torrkorning');
const fil = args.find(a => !a.startsWith('--'));
if (!fil){
  console.error('Ange filen med frågor: node scripts/quiz-lagg-till.mjs <fil.json>');
  process.exit(1);
}

const innehall = JSON.parse(readFileSync(resolve(fil), 'utf8'));
const fragor = Array.isArray(innehall) ? innehall : innehall.fragor;
if (!Array.isArray(fragor) || !fragor.length){
  console.error('Filen innehåller inga frågor.');
  process.exit(1);
}

/* ---------- kontroll innan något skickas ---------- */
const fel = [];
fragor.forEach((q, i) => {
  const vem = `Fråga ${i + 1}${q.f ? ' ("' + String(q.f).slice(0, 40) + '")' : ''}`;
  if (typeof q.f !== 'string' || !q.f.trim()) fel.push(`${vem}: "f" saknas`);
  if (!Array.isArray(q.s) || q.s.length < 2 || q.s.length > 6 || q.s.some(x => typeof x !== 'string' || !x.trim()))
    fel.push(`${vem}: "s" ska vara 2–6 svarsalternativ`);
  else if (new Set(q.s.map(x => x.trim().toLowerCase())).size !== q.s.length)
    fel.push(`${vem}: två alternativ är likadana`);
  if (!Number.isInteger(q.r) || !Array.isArray(q.s) || q.r < 0 || q.r >= q.s.length)
    fel.push(`${vem}: "r" ska peka på ett av alternativen, räknat från 0`);
  if (typeof q.fk !== 'string' || !q.fk.trim()) fel.push(`${vem}: "fk" (förklaringen) saknas`);
  if (q.typ === 'musik' && (!q.artist || !q.titel)) fel.push(`${vem}: låtfrågor behöver "artist" och "titel"`);
  if (q.typ !== undefined && q.typ !== 'musik') fel.push(`${vem}: "typ" kan bara vara "musik" eller utelämnas`);
});
if (fel.length){
  console.error('Inget skickades. Rätta först:\n  ' + fel.join('\n  '));
  process.exit(1);
}

/* ---------- ljud till låtfrågorna ---------- */
const lika = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/* Ett fast iTunes-ID godkänns bara när artist och titel stämmer — ingen
   remix, ingen annan version. Hellre utan ljud än fel låt en fredag. */
async function hamtaLjud(q){
  const url = q.itunesId
    ? 'https://itunes.apple.com/lookup?entity=song&id=' + encodeURIComponent(q.itunesId)
    : 'https://itunes.apple.com/search?media=music&entity=song&limit=1&term=' + encodeURIComponent(q.sok || '');
  const r = await fetch(url);
  if (!r.ok) throw new Error('iTunes svarade ' + r.status);
  const traff = (await r.json()).results?.find(x => x.previewUrl);
  if (!traff) return { ljud: null, varning: 'ingen träff hos iTunes' };
  const ratt = String(traff.artistName).toLowerCase().includes(String(q.artist).toLowerCase())
    && lika(traff.trackName, q.titel);
  if (!ratt) return { ljud: null, varning: `iTunes gav "${traff.artistName} — ${traff.trackName}"` };
  return { ljud: traff.previewUrl, varning: q.itunesId ? null : 'sökning utan fast itunesId, kontrollera att det är rätt inspelning' };
}

for (const q of fragor){
  if (q.typ !== 'musik' || q.ljud) continue;
  if ('itunesId' in q && !q.itunesId){ q.ljud = null; continue; }
  if (!q.itunesId && !q.sok){
    console.warn(`  ${q.artist} — ${q.titel}: varken itunesId eller sok, ingen ljud. Frågan visas inte.`);
    continue;
  }
  try {
    const { ljud, varning } = await hamtaLjud(q);
    q.ljud = ljud;
    if (!ljud) console.warn(`  ${q.artist} — ${q.titel}: ${varning}. Frågan visas inte förrän ljudet är rätt.`);
    else if (varning) console.warn(`  ${q.artist} — ${q.titel}: ${varning}.`);
  } catch(e){
    console.warn(`  ${q.artist} — ${q.titel}: ${e.message}. Kör igen senare för att få ljud.`);
  }
}

const musik = fragor.filter(q => q.typ === 'musik');
console.log(`${fragor.length} frågor i filen, varav ${musik.length} låtfrågor ` +
  `(${musik.filter(q => q.ljud).length} med ljud).`);

if (TORR){
  console.log('Torrkörning — inget skickades till databasen.');
  process.exit(0);
}

/* ---------- in i databasen ---------- */
// Femtio åt gången håller varje anrop litet nog för Management API:t.
const summa = { nya: 0, andrade: 0 };
let sista;
for (let i = 0; i < fragor.length; i += 50){
  const del = fragor.slice(i, i + 50);
  sista = kor(`select quiz.lagg_till(${jsonLiteral(del)}) as resultat;`)[0].resultat;
  summa.nya += sista.nya;
  summa.andrade += sista.andrade;
}
console.log(`Databasen: ${summa.nya} nya, ${summa.andrade} uppdaterade. ` +
  `Banken har nu ${sista.totalt} frågor, ${sista.aktiva} aktiva.`);

mkdirSync(PRIVAT, { recursive: true });
exportera();
console.log(`Kopian uppdaterad: ${KOPIA}`);
