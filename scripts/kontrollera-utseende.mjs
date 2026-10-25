/* Kontrollerar det som kontrollera.mjs inte kan se: hur sidorna faktiskt
   ritas i en webbläsare. Tre saker, på mobil (360 px) och dator (1440 px):

   - att ingen sida går att rulla i sidled
   - att knappar och länkar går att träffa med tummen, minst 44 px höga.
     Bara på mobil, som CLAUDE.md säger: på dator pekar man med musen.
   - att texten syns mot sin bakgrund, med WCAG:s krav på kontrast

   Kräver att den lokala servern redan kör, i ett annat fönster:

     node scripts/lokal-server.mjs
     node scripts/kontrollera-utseende.mjs
     node scripts/kontrollera-utseende.mjs --port 3000 --bilder C:\Users\jonte\hardlist-bilder

   Med --bilder sparas en skärmbild per sida och bredd i den mappen. Mappen
   måste ligga utanför repot, så att bilderna aldrig committas av misstag.

   Avslutar med kod 1 om något är fel. Skriptet skriver aldrig i repot. */

import { readdir, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const arg = namn => { const i = process.argv.indexOf(namn); return i > 0 ? process.argv[i + 1] : null; };
const PORT = Number(arg('--port')) || 8080;
const BAS = 'http://localhost:' + PORT;
const BILDER = arg('--bilder') ? resolve(arg('--bilder')) : null;

const BREDDER = [{ namn: 'mobil', bredd: 360, hojd: 780, tryck: true }, { namn: 'dator', bredd: 1440, hojd: 900, tryck: false }];
const MIN_HOJD = 44;

/* Samma regel som i kontrollera.mjs: varje mapp på toppnivå med en
   index.html är en sida, så att en ny sida kommer med av sig själv. */
const INTE_SIDOR = new Set(['scripts', 'supabase', 'data', 'node_modules', 'docs', '.git', '.github', '.claude']);

/* Kända avvikelser som är avsiktliga. Varje rad behöver en motivering, och
   listan ska krympa, inte växa. Nyckeln är sida, bredd och vad som larmar. */
const UNDANTAG = new Map([
]);

async function hittaSidor(){
  const sidor = ['/'];
  for (const namn of (await readdir(ROOT)).sort()){
    if (INTE_SIDOR.has(namn) || namn.startsWith('.')) continue;
    if (!(await stat(resolve(ROOT, namn))).isDirectory()) continue;
    if (existsSync(resolve(ROOT, namn, 'index.html'))) sidor.push('/' + namn + '/');
  }
  /* Felsidan nås genom en adress som inte finns, som på GitHub Pages. */
  sidor.push('/finns-inte-' + Date.now() + '/');
  return sidor;
}

/* Körs i sidan. Returnerar en lista med problem, varje som en kort text. */
function granskaSidan({ MIN_HOJD, tryck }){
  const problem = [];
  const vy = document.documentElement.clientWidth;
  const bredd = document.documentElement.scrollWidth;
  if (bredd > vy) problem.push('sidan går att rulla i sidled: ' + bredd + ' px på ' + vy + ' px');

  const synlig = el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    for (let e = el; e; e = e.parentElement){
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    /* Utanför sidan med avsikt, som länken "Hoppa till innehållet". */
    if (r.bottom < 0 || r.right < 0 || r.left > document.documentElement.scrollWidth) return false;
    return true;
  };
  const kort = el => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);

  /* Tryckytor. En länk mitt i löptext räknas inte: WCAG undantar den, och
     den kan inte bli högre utan att raden glesnar. Löptext är att det står
     annan text bredvid länken i samma element. */
  const iLoptext = a => [...a.parentElement.childNodes].some(n =>
    n !== a && n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  if (tryck) for (const el of document.querySelectorAll('a[href], button, [role=tab], [role=button], input:not([type=hidden]), select, summary')){
    if (!synlig(el)) continue;
    const s = getComputedStyle(el);
    if (el.tagName === 'A' && s.display === 'inline' && iLoptext(el)) continue;
    if (el.closest('.dold')) continue;
    const h = el.getBoundingClientRect().height;
    if (h < MIN_HOJD - 0.5) problem.push('tryckyta ' + Math.round(h) + ' px hög: "' + kort(el) + '"');
  }

  /* Kontrast. Bakgrunden är den närmaste förälderns fyllda färg, med
     genomskinliga lager lagda ovanpå varandra. Bilder och gradienter syns
     inte för skriptet, så text på dem kontrolleras inte. */
  const tolka = c => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const d = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: d[0], g: d[1], b: d[2], a: d.length > 3 ? d[3] : 1 };
  };
  const lagg = (over, under) => ({
    r: over.r * over.a + under.r * (1 - over.a),
    g: over.g * over.a + under.g * (1 - over.a),
    b: over.b * over.a + under.b * (1 - over.a), a: 1,
  });
  const ljus = c => {
    const k = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * k(c.r) + 0.7152 * k(c.g) + 0.0722 * k(c.b);
  };
  const bakgrund = el => {
    const lager = [];
    for (let e = el; e; e = e.parentElement){
      const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none' && s.backgroundImage.includes('url(')) return null;
      /* Huvudknappens färg ligger i ett ::before-lager bakom texten, för att
         fasningen inte ska klippa fokusringen. Täcker lagret hela elementet
         räknas det som elementets bakgrund. */
      const fore = getComputedStyle(e, '::before');
      const foreFarg = tolka(fore.backgroundColor);
      const tacker = fore.content !== 'none' && fore.position === 'absolute' &&
        ['top', 'right', 'bottom', 'left'].every(k => fore[k] === '0px');
      let c = tolka(s.backgroundColor);
      if (tacker && foreFarg && foreFarg.a > 0 && (!c || c.a === 0)) c = foreFarg;
      if (c && c.a > 0) lager.push(c);
      if (c && c.a >= 1) break;
    }
    let ut = tolka(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    if (ut.a < 1) ut = lagg(ut, { r: 255, g: 255, b: 255, a: 1 });
    for (let i = lager.length - 1; i >= 0; i--) ut = lagg(lager[i], ut);
    return ut;
  };
  const sett = new Set();
  const gang = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = gang.nextNode(); n; n = gang.nextNode()){
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || sett.has(el) || el.closest('script, style, noscript, .dold, [aria-hidden=true]')) continue;
    sett.add(el);
    if (!synlig(el)) continue;
    const s = getComputedStyle(el);
    let farg = tolka(s.color);
    if (!farg) continue;
    let opak = 1;
    for (let e = el; e; e = e.parentElement) opak *= Number(getComputedStyle(e).opacity);
    farg = { ...farg, a: farg.a * opak };
    const bg = bakgrund(el);
    if (!bg) continue;
    const fg = lagg(farg, bg);
    const [l1, l2] = [ljus(fg), ljus(bg)].sort((a, b) => b - a);
    const kvot = (l1 + 0.05) / (l2 + 0.05);
    const px = parseFloat(s.fontSize), vikt = Number(s.fontWeight) || 400;
    /* WCAG: stor text (24 px, eller 18,66 px i fetstil) klarar sig med 3:1. */
    const krav = (px >= 24 || (px >= 18.66 && vikt >= 700)) ? 3 : 4.5;
    if (kvot < krav) problem.push('kontrast ' + kvot.toFixed(2) + ':1, kräver ' + krav + ':1: "' + kort(el) + '"');
  }
  return problem;
}

const { chromium } = require('playwright');
const sidor = await hittaSidor();
if (BILDER){
  const r = relative(ROOT, BILDER);
  if (!r.startsWith('..') && !isAbsolute(r)){
    console.error('--bilder måste vara en mapp utanför repot, så att bilderna inte committas.');
    process.exit(1);
  }
  await mkdir(BILDER, { recursive: true });
}

const webblasare = await chromium.launch();
const fel = [];
let granskade = 0;
try {
  const prov = await fetch(BAS + '/').catch(() => null);
  if (!prov){
    console.error('Ingen server på ' + BAS + '. Starta node scripts/lokal-server.mjs först.');
    process.exit(1);
  }
  for (const b of BREDDER){
    const ctx = await webblasare.newContext({ viewport: { width: b.bredd, height: b.hojd } });
    const sida = await ctx.newPage();
    for (const adress of sidor){
      const namn = adress.startsWith('/finns-inte') ? '/404' : adress;
      /* Sidorna hämtar data i bakgrunden. Tystnar nätet inte, granska ändå
         det som hunnit ritas: en sida som aldrig blir klar är också ett svar. */
      /* Laddas sidan om mitt i granskningen, eller svarar servern inte en
         gång, försöker skriptet igen innan det räknas som ett fel. */
      let problem = null;
      for (let forsok = 0; forsok < 2 && !problem; forsok++){
        try {
          await sida.goto(BAS + adress, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
          await sida.evaluate(() => document.fonts.ready);
          await sida.waitForTimeout(300);
          problem = await sida.evaluate(granskaSidan, { MIN_HOJD, tryck: b.tryck });
        } catch(e){
          if (forsok) problem = ['sidan gick inte att granska: ' + e.message.split('\n')[0]];
        }
      }
      for (const p of problem){
        const nyckel = namn + ' ' + b.namn + ' ' + p;
        if (!UNDANTAG.has(nyckel)) fel.push(namn + ' (' + b.namn + '): ' + p);
      }
      granskade++;
      if (BILDER){
        const fil = (namn.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'start') + '-' + b.namn + '.png';
        await sida.screenshot({ path: resolve(BILDER, fil), fullPage: true });
      }
    }
    await ctx.close();
  }
} finally {
  await webblasare.close();
}

console.log('Granskade ' + sidor.length + ' sidor på ' + BREDDER.length + ' bredder (' + granskade + ' visningar).');
if (fel.length){
  for (const f of fel) console.log('FEL  ' + f);
  console.log(fel.length + ' fel.');
  process.exit(1);
}
console.log('Inga fel.');
