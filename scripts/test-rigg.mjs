/* Test för genreriggen i rigg.js. Riggen är startsidans blickfång och visar
   riktiga siffror, så räkningen får aldrig glida isär från releasesidans
   "Senaste sju dagarna", och den får aldrig visa nollor när hämtningen
   misslyckats.

   node scripts/test-rigg.mjs

   Laddar rader.js och rigg.js som webbläsaren gör, i en sandlåda med ett
   fast datum, och avslutar med kod 1 om något test fallerar. Skriver aldrig
   någon fil. */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IDAG = '2026-10-25T10:00:00+01:00';

/* Ett Date där "nu" alltid är IDAG, så att testet ger samma svar varje dag. */
const FAST = Date.parse(IDAG);
class FastDatum extends Date {
  constructor(...a){ super(...(a.length ? a : [FAST])); }
  static now(){ return FAST; }
}

async function ladda(){
  const window = {};
  const document = { addEventListener(){}, getElementById(){ return null; } };
  const ctx = vm.createContext({ window, document, Date: FastDatum, Intl, console, HTMLImageElement: class {} });
  for (const fil of ['rader.js', 'rigg.js']){
    vm.runInContext(await readFile(resolve(ROOT, fil), 'utf8'), ctx, { filename: fil });
  }
  return window.hardlistRigg;
}

let fel = 0, ok = 0;
function lika(namn, fick, vantat){
  const a = JSON.stringify(fick), b = JSON.stringify(vantat);
  if (a === b){ ok++; return; }
  fel++; console.log('FEL  ' + namn + '\n     fick   ' + a + '\n     väntat ' + b);
}
function nara(namn, fick, vantat){
  if (Math.abs(fick - vantat) < 0.001){ ok++; return; }
  fel++; console.log('FEL  ' + namn + ': fick ' + fick + ', väntat ' + vantat);
}
function sant(namn, varde){
  if (varde){ ok++; return; }
  fel++; console.log('FEL  ' + namn);
}

const R = await ladda();
const releaser = JSON.parse(await readFile(resolve(ROOT, 'data/releases.json'), 'utf8'));

/* Räkningen. Siffrorna är veckan till och med 25 oktober 2026, samma som
   releasesidan visade den dagen. */
const r = R.rakna(releaser);
lika('rakna på releases.json, summan', r.summa, 21);
lika('rakna på releases.json, per genre', r.antal, { hardstyle: 4, raw: 11, uptempo: 1, hardcore: 3, techno: 2 });
lika('ett släpp i morgon räknas inte', R.rakna([{ genre: 'raw', date: '2026-10-26' }]).summa, 0);
lika('ett släpp för sju dagar sedan räknas inte', R.rakna([{ genre: 'raw', date: '2026-10-18' }]).summa, 0);
lika('ett släpp för sex dagar sedan räknas', R.rakna([{ genre: 'raw', date: '2026-10-19' }]).summa, 1);
lika('ett album räknas som en singel', R.rakna([{ genre: 'raw', date: '2026-10-25', typ: 'album' }]).summa, 1);
lika('euphoric räknas som hardstyle', R.rakna([{ genre: 'euphoric', date: '2026-10-24' }]).antal.hardstyle, 1);
lika('tom lista', R.rakna([]), { summa: 0, antal: { hardstyle: 0, raw: 0, uptempo: 0, hardcore: 0, techno: 0 } });

/* Ljusets längd: delat med veckans största antal, men aldrig med mindre än 6. */
const vecka = r.antal;
nara('langd för veckans största genre', R.langd(11, vecka), 1);
nara('langd för en genre med ett släpp', R.langd(1, vecka), 0.12);
nara('langd för en genre utan släpp', R.langd(0, vecka), 0);
nara('langd en lugn vecka', R.langd(2, { raw: 2, hardstyle: 1 }), 1 / 3);
nara('langd en vecka med ett enda släpp', R.langd(1, { raw: 1 }), 1 / 6);

/* Ritningen. */
const vanlig = R.markup({ releaser, status: { uppdaterad: '2026-10-25T05:14:13.682Z' } });
lika('fem lampor', (vanlig.match(/class="rigg-lampa/g) || []).length, 5);
sant('lamporna står i fast ordning', /hardstyle[\s\S]*raw[\s\S]*uptempo[\s\S]*hardcore[\s\S]*techno/.test(vanlig.replace(/--g:var\(--[a-z]+\)/g, '')));
sant('summan står stort', vanlig.includes('<span class="rigg-antal">21</span>'));
sant('uppdaterad idag med svensk tid', vanlig.includes('Uppdaterad idag 06:14'));
sant('senast in är det nyaste släppet', /Senast in: Quiet Children, Radical Redemption, Bössels/.test(vanlig));
sant('ingen lampa vald från början', !vanlig.includes('aria-pressed="true"'));
sant('Visa alla syns inte utan val', /rigg-alla"[^>]*hidden/.test(vanlig));

const vald = R.markup({ releaser, vald: 'raw' });
sant('vald lampa är tryckt', /data-genre="raw"[^>]*aria-pressed="true"/.test(vald));
sant('Visa alla syns med val', !/rigg-alla"[^>]*hidden/.test(vald));

const tom = R.markup({ releaser: [] });
lika('en tom vecka har fem släckta lampor', (tom.match(/data-av/g) || []).length, 5);
sant('en tom vecka säger det', tom.includes('Inga släpp de senaste sju dagarna.'));

const trasig = R.markup({ fel: true });
sant('fel: ingen lampa', !trasig.includes('rigg-lampa'));
sant('fel: ingen siffra', !trasig.includes('rigg-antal'));
sant('fel: säger vad som hänt', trasig.includes('Releaserna gick inte att hämta.'));
sant('fel: knappen Försök igen', /<button[^>]*data-genre="forsok"[^>]*>Försök igen<\/button>/.test(trasig));

lika('igår', R.uppdateradText({ uppdaterad: '2026-10-24T05:14:00Z' }), 'Uppdaterad igår 07:14');
lika('äldre', R.uppdateradText({ uppdaterad: '2026-10-20T05:14:00Z' }), 'Uppdaterad den 20 oktober 07:14');
lika('utan status', R.uppdateradText(null), '');

console.log(ok + ' rätt, ' + fel + ' fel.');
process.exit(fel ? 1 : 0);
