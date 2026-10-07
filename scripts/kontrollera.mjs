/* Kör listan "Innan du säger att något är klart" ur CLAUDE.md maskinellt.
   Allt på den listan har någon gång glömts bort för hand, och ett fel här
   syns först när en besökare hittar det.

   node scripts/kontrollera.mjs

   Avslutar med kod 1 om något är fel, så att det går att lita på i en kedja.
   Skriptet läser bara, det skriver aldrig någon fil. */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fel = [];
const varningar = [];
const rel = p => relative(ROOT, p).replace(/\\/g, '/');

/* Mappar som inte är sidor. Allt annat på toppnivå med en index.html räknas,
   så att en ny sida kontrolleras utan att någon behöver komma ihåg att lägga
   till den här. */
const INTE_SIDOR = new Set(['scripts', 'supabase', 'data', 'node_modules', '.git', '.github']);

async function hittaSidor(){
  const sidor = [resolve(ROOT, 'index.html'), resolve(ROOT, '404.html')];
  for (const namn of await readdir(ROOT)){
    if (INTE_SIDOR.has(namn) || namn.startsWith('.')) continue;
    const mapp = resolve(ROOT, namn);
    if (!(await stat(mapp)).isDirectory()) continue;
    const fil = resolve(mapp, 'index.html');
    if (existsSync(fil)) sidor.push(fil);
  }
  return sidor;
}

/* Skript, stilar och kommentarer byts mot mellanslag i samma längd, så att
   taggar inuti dem inte räknas som markup men positionerna står kvar. */
function baraMarkup(html){
  const tomt = s => s.replace(/[^\n]/g, ' ');
  return html
    .replace(/<!--[\s\S]*?-->/g, tomt)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, b, c) => a + tomt(b) + c)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, b, c) => a + tomt(b) + c);
}

const TOMMA = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);

function radNr(text, index){ return text.slice(0, index).split('\n').length; }

function kollaTaggar(html, fil){
  const markup = baraMarkup(html);
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g;
  let m;
  while ((m = re.exec(markup))){
    const [, slut, namnRa, sjalv] = m;
    const namn = namnRa.toLowerCase();
    if (namn === '!doctype' || TOMMA.has(namn) || sjalv) continue;
    if (!slut){ stack.push({ namn, rad: radNr(markup, m.index) }); continue; }
    const topp = stack.pop();
    if (!topp || topp.namn !== namn){
      fel.push(`${rel(fil)}:${radNr(markup, m.index)} </${namn}> stänger ` +
        (topp ? `<${topp.namn}> från rad ${topp.rad}` : 'ingenting'));
      return;
    }
  }
  for (const t of stack) fel.push(`${rel(fil)}:${t.rad} <${t.namn}> stängs aldrig`);
}

function kollaStil(html, fil){
  const block = html.match(/<style\b/gi) || [];
  const gemensam = /<link[^>]+href="\/stil\.css(\?[^"]*)?"/.test(html);
  if (gemensam && block.length > 1) fel.push(`${rel(fil)}: ${block.length} <style>-block, högst ett eget får finnas`);
  /* Alla sidor är i den nya designen. En sida utan stil.css är en ny sida
     som glömt den, eller en gammal som kommit tillbaka. */
  if (!gemensam) fel.push(`${rel(fil)}: länkar inte /stil.css`);
  for (const css of html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []) kollaCss(css.replace(/^<style[^>]*>|<\/style>$/gi, ''), rel(fil));
  if (gemensam && /monospace|JetBrains|Space Grotesk|Big Shoulders/.test(html))
    fel.push(`${rel(fil)}: gamla typsnitt eller monospace kvar, den nya designen har bara Archivo`);
  /* Typsnittet ligger på hardlist.se. Ett anrop till Google Fonts skickar
     besökarens IP-adress till Google, och det står inte på integritetssidan. */
  if (gemensam && /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html))
    fel.push(`${rel(fil)}: hämtar typsnitt från Google Fonts, ska använda /typsnitt/`);
  return gemensam;
}

function kollaCss(css, namn){
  const ren = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  let djup = 0;
  for (const tecken of ren){
    if (tecken === '{') djup++;
    if (tecken === '}' && --djup < 0){ fel.push(`${namn}: en } för mycket`); return; }
  }
  if (djup) fel.push(`${namn}: ${djup} { stängs aldrig`);
  /* iOS zoomar in på fält med mindre text än 16 px och zoomar aldrig ut igen. */
  for (const [, sel, kropp] of ren.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if (!/(^|[\s,>+~])(input|textarea|select)\b/.test(sel)) continue;
    const s = kropp.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/);
    if (s && Number(s[1]) < 16) fel.push(`${namn}: ${sel.trim()} har font-size ${s[1]}px, iOS zoomar under 16px`);
  }
}

function kollaSkript(html, fil){
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    const [, attr, kod] = m;
    if (/\bsrc=/.test(attr) || !kod.trim()) continue;
    const rad = radNr(html, m.index);
    if (/application\/ld\+json/.test(attr)){
      try { JSON.parse(kod); } catch(e){ fel.push(`${rel(fil)}:${rad} strukturerad data parsar inte: ${e.message}`); }
      continue;
    }
    try { new vm.Script(kod, { filename: rel(fil) }); }
    catch(e){ fel.push(`${rel(fil)}:${rad} JavaScript parsar inte: ${e.message}`); }
  }
}

/* Vanliga skript på samma sida delar namnrymd. Deklarerar två av dem samma
   namn på toppnivå stoppar webbläsaren hela det senare skriptet, och var
   för sig parsar båda. Gemensamma filer som /rader.js räknas med. */
async function kollaDubblaNamn(html, fil){
  const skript = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    const [, attr, kod] = m;
    if (/application\/ld\+json|type="module"/.test(attr)) continue;
    const src = (attr.match(/\bsrc="(\/(?!\/)[^"]+)"/) || [])[1];
    if (src){
      const p = resolve(ROOT, '.' + src.split('?')[0]);
      if (existsSync(p)) skript.push({ namn: src, kod: await readFile(p, 'utf8') });
    } else if (kod.trim()) skript.push({ namn: 'inbakat skript', kod });
  }
  const sedda = new Map();
  for (const s of skript){
    const ren = s.kod.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of ren.matchAll(/^(?:const|let|class|function|async function)\s+([A-Za-z_$][\w$]*)/gm)){
      const namn = m[1];
      if (sedda.has(namn) && sedda.get(namn) !== s) fel.push(`${rel(fil)}: "${namn}" deklareras både i ${sedda.get(namn).namn} och i ${s.namn}`);
      else sedda.set(namn, s);
    }
  }
}

function kollaId(html, fil){
  const markup = baraMarkup(html);
  const sedda = new Map();
  for (const m of markup.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)){
    const id = m[1];
    if (sedda.has(id)) fel.push(`${rel(fil)}:${radNr(markup, m.index)} id="${id}" finns redan på rad ${sedda.get(id)}`);
    else sedda.set(id, radNr(markup, m.index));
  }
  /* Id som skapas av skript räknas också, men bara om strängen faktiskt står
     i filen — ett id som inte finns någonstans är alltid ett fel. */
  const allaId = new Set([...html.matchAll(/\bid\s*=\s*\\?["']([^"'\\]+)\\?["']/g)].map(m => m[1]));
  for (const m of html.matchAll(/\.id\s*=\s*["']([^"']+)["']/g)) allaId.add(m[1]);
  const mal = [
    ...html.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g),
    ...html.matchAll(/(?<![\w.])\$\(\s*'([A-Za-z][\w-]*)'\s*\)/g)
  ];
  for (const m of mal){
    if (!allaId.has(m[1])) fel.push(`${rel(fil)}:${radNr(html, m.index)} letar efter id "${m[1]}", som inte finns`);
  }
}

function finnsSokvag(sokvag){
  const ren = decodeURIComponent(sokvag.split(/[?#]/)[0]);
  if (ren === '' ) return true;
  const fil = resolve(ROOT, '.' + ren);
  if (ren.endsWith('/')) return existsSync(resolve(fil, 'index.html'));
  return existsSync(fil) && !existsSync(resolve(fil, 'index.html'));
}

function kollaLankar(html, fil){
  const markup = baraMarkup(html);
  const traffar = [
    ...[...markup.matchAll(/\s(?:href|src|action)\s*=\s*"(\/(?!\/)[^"]*)"/g)].map(m => [m[1], radNr(markup, m.index)]),
    ...[...markup.matchAll(/\shref\s*=\s*"(?:https?|webcal):\/\/hardlist\.se(\/[^"]*)"/g)].map(m => [m[1], radNr(markup, m.index)]),
    ...[...html.matchAll(/fetch\(\s*["'](\/(?!\/)[^"']*)["']/g)].map(m => [m[1], radNr(html, m.index)])
  ];
  for (const [sokvag, rad] of traffar){
    if (!finnsSokvag(sokvag)) fel.push(`${rel(fil)}:${rad} länken ${sokvag} leder ingenstans`);
  }
  /* Relativa sökvägar bryts eftersom sidorna ligger i undermappar. */
  for (const m of markup.matchAll(/\s(?:href|src)\s*=\s*"(?![a-z]+:|\/|#)([^"]+)"/g)){
    fel.push(`${rel(fil)}:${radNr(markup, m.index)} relativ sökväg "${m[1]}", ska börja med /`);
  }
}

/* Byggskripten avbryter om en markör saknas, och då commitas inte
   morgonens releaser. Ordningen spelar också roll: slut före start ger
   samma avbrott. */
const MARKORER = [
  ['index.html',          '<!-- EVENTS-LD:START -->',   '<!-- EVENTS-LD:END -->'],
  ['index.html',          '/* SEED_EVENTS:START */',    '/* SEED_EVENTS:END */'],
  ['anthems/index.html',  '/* SEED_ANTHEMS:START */',   '/* SEED_ANTHEMS:END */'],
  ['latspel/index.html',  '/* SEED_LATSPEL:START */',   '/* SEED_LATSPEL:END */']
];

async function kollaMarkorer(){
  for (const [fil, start, slut] of MARKORER){
    const text = await readFile(resolve(ROOT, fil), 'utf8');
    const i = text.indexOf(start), j = text.indexOf(slut);
    if (i === -1 || j === -1 || j < i) fel.push(`${fil}: markörerna ${start} / ${slut} saknas eller står i fel ordning`);
    else if (text.indexOf(start, i + 1) !== -1) fel.push(`${fil}: ${start} står mer än en gång`);
  }
}

/* Menyn och sidfoten finns som kopior i varje sida. Det här larmar när en
   kopia glidit isär från de andra, vilket annars syns först på headern. */
function ramDelar(htmlRa){
  /* Radsluten skiljer sig mellan filer på Windows beroende på vilket verktyg
     som skrev dem, men Git gör ändå om dem vid commit. Bara innehållet räknas. */
  const html = htmlRa.replace(/\r\n/g, '\n');
  const meny = (html.match(/<nav class="meny"[\s\S]*?<\/nav>/) || [''])[0]
    .replace(/\s+aria-current="page"/g, '');
  const sidfot = (html.match(/<footer class="sidfot"[\s\S]*?<\/footer>/) || [''])[0];
  return { meny, sidfot };
}

async function kollaJson(){
  const filer = (await readdir(resolve(ROOT, 'data'))).filter(f => f.endsWith('.json')).map(f => 'data/' + f);
  filer.push('site.webmanifest');
  for (const f of filer){
    try { JSON.parse(await readFile(resolve(ROOT, f), 'utf8')); }
    catch(e){ fel.push(`${f} parsar inte: ${e.message}`); }
  }
}

async function run(){
  const sidor = await hittaSidor();
  const ramar = [];
  for (const fil of sidor){
    const html = await readFile(fil, 'utf8');
    kollaTaggar(html, fil);
    const ny = kollaStil(html, fil);
    kollaSkript(html, fil);
    await kollaDubblaNamn(html, fil);
    kollaId(html, fil);
    kollaLankar(html, fil);
    if (ny){
      const r = ramDelar(html);
      if (!r.meny) fel.push(`${rel(fil)}: använder stil.css men saknar <nav class="meny">`);
      if (!r.sidfot) fel.push(`${rel(fil)}: använder stil.css men saknar <footer class="sidfot">`);
      ramar.push({ fil, ...r });
    }
  }
  for (const r of ramar.slice(1)){
    if (r.meny !== ramar[0].meny) fel.push(`${rel(r.fil)}: menyn skiljer sig från ${rel(ramar[0].fil)}`);
    if (r.sidfot !== ramar[0].sidfot) fel.push(`${rel(r.fil)}: sidfoten skiljer sig från ${rel(ramar[0].fil)}`);
  }
  for (const f of ['stil.css']){
    if (!existsSync(resolve(ROOT, f))) continue;
    const css = await readFile(resolve(ROOT, f), 'utf8');
    kollaCss(css, f);
    for (const m of css.matchAll(/url\(\s*['"]?(\/(?!\/)[^'")]+)['"]?\s*\)/g)){
      if (!finnsSokvag(m[1])) fel.push(`${f}: url(${m[1]}) leder ingenstans`);
    }
  }
  await kollaMarkorer();
  await kollaJson();

  const nya = ramar.length;
  console.log(`Kontrollerade ${sidor.length} sidor, varav ${nya} i den nya designen.`);
  for (const v of varningar) console.log('  varning: ' + v);
  if (!fel.length){ console.log('Inga fel.'); return; }
  console.log(`${fel.length} fel:`);
  for (const f of fel) console.log('  ' + f);
  process.exit(1);
}

run().catch(err => { console.error(err.message || err); process.exit(1); });
