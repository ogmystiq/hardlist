/**
 * HARDLIST — låtbiblioteket för fritt spel.
 *
 * Två lägen:
 *
 *   --rapport  skriver ingenting, varken i repot eller i databasen.
 *              node scripts/latbibliotek.mjs --rapport --itunes 300 --ut rapport.json --cache mb.json
 *
 *   --fyll     bygger låtar enligt väg B och skickar dem till databasen med
 *              den hemliga nyckeln, se lasNyckel(). --torr skickar ingenting.
 *              node scripts/latbibliotek.mjs --fyll --antal 20 --ut provlyssning.html --prov 30
 *
 *              Artister där MusicBrainz eller Apple pekar utanför scenen stoppas
 *              och listas, se stoppet nedan.
 *
 * Rapporten nedan jämförde två vägar. Väg B är vald: ingen Deezer-data sparas.
 *
 * Jämför två vägar till samma bibliotek:
 *
 *   A, med Deezer   rätt Deezer-artist → artistens egna skivor → varje spårs
 *                   rank → skivans streckkod → iTunes på streckkoden, samma
 *                   plats på skivan, titel och artist.
 *   B, utan Deezer  rätt Apple Music-artist → artistens låtar direkt från
 *                   iTunes, där förlyssningen följer med. Popularitet ur
 *                   iTunes egen ordning.
 *
 * Identiteten tas i båda vägarna från MusicBrainz, via det Spotify-ID som
 * morgonkörningen redan cachat. Inga Spotify-anrop, så dygnskvoten är orörd.
 *
 * Rör aldrig morgonkörningen. Artistlistan läses ur hamta-releaser.mjs utan
 * att filen ändras, och radarns namnfunktioner lånas utan att den ändras.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normNamn, normTitel } from './deezer-radar.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };

const RAPPORT = process.argv.includes('--rapport');
const ITUNES_STICKPROV = Number(arg('--itunes')) || 300;
const UT = arg('--ut');
const CACHE = arg('--cache');
/* --vag B hoppar över Deezer-vägen helt. */
const BARA_B = arg('--vag') === 'B';

/* Så många låtar per artist räknas, de största först. */
const PER_ARTIST = 40;
/* Väg A läser bara artistens mest spelade skivor. Ett anrop per skiva. */
const MAX_SKIVOR = 25;

const DEEZER_MELLANRUM = 200;      /* Deezers spärr: 50 anrop per 5 s */
const DEEZER_PAUS = 6000;
const ITUNES_MELLANRUM = 3100;     /* Apple anger ungefär 20 anrop i minuten */
const MB_MELLANRUM = 1100;         /* MusicBrainz tillåter ett anrop per sekund */
const MAX_FORSOK = 6;
const UA = { 'User-Agent': 'HARDLIST/1.0 ( hardlisthelp@gmail.com )', Accept: 'application/json' };

const DANCE = new Set([113, 106]);
const DANCE_ANDEL = 0.5;
const MIN_SEK = 90;
const MAX_SEK = 600;
const MIXORD = /\b(mixed|continuous mix|dj mix|full mix|megamix|minimix|liveset|live set)\b/i;

/* Samma som i deezer-radar.mjs — ändras den där ska den ändras här. */
const ALIAS = { 'Paul Elstak': 'DJ Paul Elstak' };

/* ---------- gemensamt ---------- */

function lasArtister() {
  const text = readFileSync(resolve(ROOT, 'scripts/hamta-releaser.mjs'), 'utf8');
  const a = text.indexOf('const ARTISTS');
  const b = text.indexOf('];', a);
  if (a < 0 || b < 0) throw new Error('Hittar inte ARTISTS i hamta-releaser.mjs.');
  const re = /\{\s*name:\s*(["'])((?:(?!\1).)*)\1\s*,\s*genre:\s*'(\w+)'(?:\s*,\s*id:\s*'(\w+)')?\s*\}/;
  const ut = [];
  for (const rad of text.slice(a, b).split('\n')) {
    if (/^\s*\/\//.test(rad)) continue;
    const m = rad.match(re);
    if (m) ut.push({ namn: m[2], genre: m[3], fastSpotify: m[4] || null });
    else if (/name:/.test(rad)) throw new Error('Kunde inte tolka raden: ' + rad.trim());
  }
  const status = JSON.parse(readFileSync(resolve(ROOT, 'data/status.json'), 'utf8'));
  if (status.artister && status.artister !== ut.length) {
    throw new Error(`Läste ${ut.length} artister men status.json säger ${status.artister}. Listans form har ändrats.`);
  }
  /* Fastnaglat ID vinner över cachen, som i morgonkörningen. */
  const cache = JSON.parse(readFileSync(resolve(ROOT, 'data/artist-ids.json'), 'utf8')).ids || {};
  for (const a of ut) a.spotify = a.fastSpotify || cache[a.namn] || null;
  return ut;
}

const vanta = ms => new Promise(r => setTimeout(r, ms));
const rakna = { deezer: 0, itunes: 0, musicbrainz: 0 };
const senast = { deezer: 0, itunes: 0, musicbrainz: 0 };

async function i_takt(tjanst, mellanrum) {
  const kvar = senast[tjanst] + mellanrum - Date.now();
  if (kvar > 0) await vanta(kvar);
  senast[tjanst] = Date.now();
  rakna[tjanst]++;
}

async function deezer(path, forsok = 0) {
  await i_takt('deezer', DEEZER_MELLANRUM);
  let res;
  try { res = await fetch('https://api.deezer.com' + path); }
  catch (e) { if (forsok < MAX_FORSOK) { await vanta(DEEZER_PAUS); return deezer(path, forsok + 1); } throw e; }
  if (res.status === 429 || res.status >= 500) {
    if (forsok >= MAX_FORSOK) throw new Error(`${path} → HTTP ${res.status}`);
    await vanta(DEEZER_PAUS);
    return deezer(path, forsok + 1);
  }
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const d = await res.json();
  if (d?.error) {
    if (d.error.code === 4 && forsok < MAX_FORSOK) { await vanta(DEEZER_PAUS); return deezer(path, forsok + 1); }
    throw new Error(`${path} → Deezer-fel ${d.error.code}: ${d.error.message}`);
  }
  return d;
}

async function itunes(fraga, typ = 'lookup', forsok = 0) {
  await i_takt('itunes', ITUNES_MELLANRUM);
  let res;
  try { res = await fetch('https://itunes.apple.com/' + typ + '?' + fraga + '&country=se'); }
  catch (e) { if (forsok < MAX_FORSOK) { await vanta(30000); return itunes(fraga, typ, forsok + 1); } throw e; }
  /* Apple svarar 403 eller 429 när takten är för hög. Längre paus, inte fler anrop. */
  if (res.status === 403 || res.status === 429 || res.status >= 500) {
    if (forsok >= MAX_FORSOK) throw new Error(`iTunes ${fraga} → HTTP ${res.status}`);
    await vanta(60000);
    return itunes(fraga, typ, forsok + 1);
  }
  if (!res.ok) throw new Error(`iTunes ${fraga} → HTTP ${res.status}`);
  return res.json();
}

/* MusicBrainz svarar 503 eller stänger anslutningen när takten blir för hög.
   Längre väntan för varje försök, som deras dokumentation ber om. */
async function musicbrainz(path, forsok = 0) {
  await i_takt('musicbrainz', MB_MELLANRUM);
  let res = null;
  try { res = await fetch('https://musicbrainz.org/ws/2/' + path, { headers: UA }); } catch {}
  if (!res || res.status === 503) {
    if (forsok >= MAX_FORSOK) throw new Error(`MusicBrainz ${path} svarar inte`);
    await vanta(3000 * (forsok + 1));
    return musicbrainz(path, forsok + 1);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`MusicBrainz ${path} → HTTP ${res.status}`);
  return res.json();
}

/* Artistens Deezer- och Apple-sidor enligt MusicBrainz, via Spotify-ID:t.
   En artist kan ha flera sidor hos samma tjänst — då gäller alla. */
async function lankar(spotifyId) {
  const u = await musicbrainz(`url?resource=${encodeURIComponent('https://open.spotify.com/artist/' + spotifyId)}&inc=artist-rels&fmt=json`);
  const mb = u?.relations?.find(r => r.artist)?.artist;
  if (!mb) return { mbid: null, deezer: [], apple: [] };
  /* Taggarna och beskrivningen följer med i samma anrop. De behövs för
     stoppet nedan, och kostar inget extra. */
  const a = await musicbrainz(`artist/${mb.id}?inc=url-rels+tags+genres&fmt=json`);
  const url = (a?.relations || []).map(r => r.url?.resource || '');
  const deezer = [...new Set(url.map(x => (x.match(/deezer\.com\/(?:\w+\/)?artist\/(\d+)/) || [])[1]).filter(Boolean).map(Number))];
  const apple = [...new Set(url.filter(x => /music\.apple\.com|itunes\.apple\.com/.test(x))
    .map(x => (x.match(/\/(?:id)?(\d{5,})(?:[?/#]|$)/) || [])[1]).filter(Boolean).map(Number))];
  const taggar = [...new Set([...(a?.genres || []), ...(a?.tags || [])].map(t => t.name.toLowerCase()))];
  return { mbid: mb.id, mbNamn: mb.name, beskr: a?.disambiguation || '', taggar, deezer, apple };
}

/* ---------- stoppet mot fel artist ---------- */

/* MusicBrainz kan koppla vårt Spotify-ID till en annan artist med samma
   namn. Så fick Nosferatu ett brittiskt gothrockbands låtar i första
   provbiblioteket. Därför stoppas en artist när MusicBrainz eller Apple
   pekar utanför scenen, och hamnar på en lista för Jonte i stället. */
const SCEN = /hardstyle|hardcore|raw ?style|uptempo|frenchcore|gabber|gabba|terror|speedcore|jumpstyle|hard ?dance|techno|schranz|euphoric/i;
const UTANFOR = /\bband\b|rapper|singer|\brock\b|\bpop\b|\bgoth|metal|punk|jazz|folk|country|composer|hip.?hop|\brap\b|psytrance|psychedelic|big room|electro house|\bedm\b|indie/i;

/* Spotify-sidan är kontrollerad av Jonte och är rätt, men MusicBrainz har
   kopplat den till en annan artist. MusicBrainz används aldrig för dem. */
const FEL_I_MUSICBRAINZ = new Set(['Nosferatu', 'Outsiders', 'Ghost Stories']);

/* Apple-sidor valda för hand, när MusicBrainz inte kan användas. Outsiders
   och Ghost Stories saknas: ingen sida med deras namn i iTunes var tydligt
   rätt artist, och hellre inga låtar än fel låtar. */
const FAST_APPLE = {
  /* Hardcore, med Destination Thunderdome (Official Thunderdome 2024 Anthem). */
  'Nosferatu': [6516983]
};

function utanforEnligtMusicbrainz(l) {
  const kallor = [...(l.taggar || []), l.beskr || ''].filter(Boolean);
  if (kallor.some(t => SCEN.test(t))) return null;
  const ut = kallor.filter(t => UTANFOR.test(t));
  return ut.length ? 'MusicBrainz: ' + ut.slice(0, 3).join(', ') : null;
}

/* Apples egen genre på låtarna. Scenen hamnar under Dance, Hardcore,
   Techno eller Elektroniskt — en sida där de flesta låtarna är något
   annat är fel sida, även när MusicBrainz inte säger något. */
const APPLE_SCEN = /dance|hardcore|techno|elektron|electronic|hardstyle/i;
function utanforEnligtApple(latar) {
  if (latar.length < 5) return null;
  const scen = latar.filter(t => APPLE_SCEN.test(t.genre || '')).length;
  if (scen / latar.length >= 0.5) return null;
  const g = {};
  for (const t of latar) g[t.genre] = (g[t.genre] || 0) + 1;
  return 'Apple: ' + Object.entries(g).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ');
}

/* Vilka Apple-sidor en artist ska hämtas från, eller varför den stoppas. */
async function valjApple(a) {
  if (FAST_APPLE[a.namn]) return { lage: 'fastnaglad', ids: FAST_APPLE[a.namn] };
  if (FEL_I_MUSICBRAINZ.has(a.namn)) return { lage: 'fel artist i MusicBrainz, ingen Apple-sida vald', ids: [] };
  const stopp = utanforEnligtMusicbrainz(a.lankar);
  if (stopp) return { lage: 'stoppad', skal: stopp, ids: [] };
  if (a.lankar.apple.length) return { lage: 'musicbrainz', ids: a.lankar.apple };
  const b = await bekraftaApple(a);
  return b.ids.length ? { ...b, lage: 'inspelningar' } : b;
}

/* Gamla cacheposter saknar taggarna, och hämtas då om. */
const harTaggar = l => l && Array.isArray(l.taggar);

/* iTunes skriver gästartister och ordningen i anthem-titlar annorlunda än
   Deezer: "Stay with Me (feat. X)" mot "Stay With Me", "2022 Anthem" mot
   "Anthem 2022". Gäster och ordning räknas bort, allt annat måste stämma —
   "Struggle To Survive (2023 Rmx)" är fortfarande en annan version. */
function titelLika(a, b) {
  const ord = t => String(t)
    .replace(/[\(\[]\s*(?:feat\.?|ft\.?|featuring|with)\s[^\)\]]*[\)\]]/gi, ' ')
    .replace(/\s(?:feat\.?|ft\.?|featuring)\s.*$/i, ' ')
    .normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(' ');
  return ord(a) === ord(b);
}

/* ---------- väg A: Deezer ---------- */

async function valjDeezer(a, l) {
  if (l.deezer.length) return { lage: 'musicbrainz', ids: l.deezer };
  const sokNamn = ALIAS[a.namn] || a.namn;
  const d = await deezer(`/search/artist?q=${encodeURIComponent(sokNamn)}&limit=50`);
  const exakta = (d.data || []).filter(k => normNamn(k.name) === normNamn(sokNamn));
  if (!exakta.length) return { lage: 'saknas', ids: [] };
  const info = [];
  for (const k of exakta) {
    const s = await deezer(`/artist/${k.id}/albums?limit=100`);
    const skivor = s.data || [];
    info.push({ id: k.id, fans: k.nb_fan, dance: skivor.length ? skivor.filter(x => DANCE.has(x.genre_id)).length / skivor.length : 0 });
  }
  const dance = info.filter(k => k.dance >= DANCE_ANDEL).sort((x, y) => y.fans - x.fans);
  if (dance.length === 1) return { lage: 'saker', ids: [dance[0].id] };
  /* Den största hard dance-kandidaten, men bara om den är överlägsen. Deezer
     har ofta splittrade dubblettsidor för samma artist. */
  if (dance.length > 1 && dance[0].fans >= 1000 && dance[0].fans >= 10 * Math.max(1, dance[1].fans)) {
    return { lage: 'dominant', ids: [dance[0].id] };
  }
  return { lage: 'osaker', ids: [], kandidater: info };
}

async function lattarDeezer(ids) {
  const egna = new Set(ids);
  const skivor = [];
  for (const id of ids) {
    let path = `/artist/${id}/albums?limit=100`;
    while (path) {
      const d = await deezer(path);
      skivor.push(...(d.data || []).filter(s => s.record_type !== 'compile'));
      path = d.next ? d.next.replace('https://api.deezer.com', '') : null;
    }
  }
  const unikaSkivor = [...new Map(skivor.map(s => [s.id, s])).values()]
    .sort((x, y) => (y.fans || 0) - (x.fans || 0)).slice(0, MAX_SKIVOR);
  const spar = [];
  for (const s of unikaSkivor) {
    const d = await deezer(`/album/${s.id}/tracks?limit=100`);
    for (const t of d.data || []) {
      /* Bara låtar där vår artist är huvudartist. */
      if (!egna.has(t.artist?.id)) continue;
      if (t.duration < MIN_SEK || t.duration > MAX_SEK || MIXORD.test(t.title)) continue;
      spar.push({ deezerId: t.id, titel: t.title, rank: t.rank, isrc: t.isrc, plats: t.track_position, skiva: t.disk_number, albumId: s.id });
    }
  }
  const per = new Map();
  for (const t of spar) {
    const k = normTitel(t.titel);
    if (!per.has(k) || per.get(k).rank < t.rank) per.set(k, t);
  }
  return [...per.values()].sort((x, y) => y.rank - x.rank).slice(0, PER_ARTIST);
}

async function provaUpc(t, artistNamn) {
  const al = await deezer(`/album/${t.albumId}`);
  if (!al.upc) return { utfall: 'ingen streckkod på Deezer' };
  const it = await itunes('upc=' + encodeURIComponent(al.upc) + '&entity=song');
  const spar = (it.results || []).filter(x => x.wrapperType === 'track');
  if (!it.resultCount) return { utfall: 'iTunes hittar inte streckkoden' };
  if (!spar.length) return { utfall: 'iTunes har skivan men inga spår' };
  const p = spar.find(x => x.trackNumber === t.plats && (x.discNumber || 1) === (t.skiva || 1));
  if (!p) return { utfall: 'ingen låt på samma plats' };
  if (!titelLika(p.trackName, t.titel)) return { utfall: 'annan titel på samma plats', deezer: t.titel, itunes: p.trackName };
  if (!normNamn(p.artistName).includes(normNamn(artistNamn))) return { utfall: 'annan artist på samma plats', itunes: p.artistName };
  if (!p.previewUrl) return { utfall: 'ingen förlyssning' };
  return { utfall: 'godkänd' };
}

/* ---------- väg B: utan Deezer ---------- */

/* iTunes ger högst 200 låtar per artist, i en ordning som ser ut som
   popularitet. Hur väl den stämmer mäts mot Deezers rank i rapporten. */
async function lattarItunes(appleIds) {
  const egna = new Set(appleIds);
  const ut = [];
  for (const id of appleIds) {
    const d = await itunes('id=' + id + '&entity=song&limit=200');
    for (const x of d.results || []) {
      if (x.wrapperType !== 'track' || !egna.has(x.artistId) || !x.previewUrl) continue;
      const sek = (x.trackTimeMillis || 0) / 1000;
      if (sek < MIN_SEK || sek > MAX_SEK || MIXORD.test(x.trackName)) continue;
      ut.push({
        itunesId: x.trackId, itunesArtistId: x.artistId, artist: x.artistName, titel: x.trackName,
        ljud: x.previewUrl, langdMs: x.trackTimeMillis || null, ordning: ut.length,
        genre: x.primaryGenreName || ''
      });
    }
  }
  const per = new Map();
  for (const t of ut) { const k = normTitel(t.titel); if (!per.has(k)) per.set(k, t); }
  return [...per.values()].slice(0, PER_ARTIST);
}

/* Artister som MusicBrainz inte länkar till Apple Music. Sök artisten på
   exakt namn i iTunes — aldrig en låt — och godkänn en kandidat bara när
   flera av dess låttitlar också finns som inspelningar hos samma artist i
   MusicBrainz. MusicBrainz-artisten är redan bunden via Spotify-ID:t, så en
   träff bekräftas av en oberoende källa. Utan MusicBrainz-artist finns inget
   att bekräfta mot, och artisten listas för hand. */
/* En kandidat klarar provet med minst 5 gemensamma titlar, eller minst 20 %
   av sina egna låtar (dock minst 3). Den måste dessutom ha klart fler än
   den bästa kandidat som inte klarar provet — minst dubbelt så många — annars
   är det en gissning. Wolv var exemplet: 3 av 4 mot 2 av 78. Klarar flera
   kandidater provet är det oftast samma artist på flera iTunes-sidor, och då
   används alla. */
const MIN_GEMENSAMMA = 5;
const MIN_ANDEL = 0.2;
const MIN_FOR_ANDEL = 3;

export function avgorKandidater(prov) {
  const klarar = k => k.gemensamma >= MIN_GEMENSAMMA ||
    (k.gemensamma >= MIN_FOR_ANDEL && k.latar > 0 && k.gemensamma / k.latar >= MIN_ANDEL);
  const godkanda = prov.filter(klarar);
  const basteUnderkand = Math.max(0, ...prov.filter(k => !klarar(k)).map(k => k.gemensamma));
  const svagaste = Math.min(...godkanda.map(k => k.gemensamma));
  if (!godkanda.length) return { lage: 'för få gemensamma titlar', ids: [] };
  if (basteUnderkand > 0 && svagaste < 2 * basteUnderkand) return { lage: 'inte klart fler än tvåan', ids: [] };
  return { lage: godkanda.length > 1 ? 'bekräftad, flera sidor' : 'bekräftad via inspelningar', ids: godkanda.map(k => k.id) };
}

async function inspelningar(mbid) {
  const titlar = new Set();
  for (let offset = 0; offset < 500; offset += 100) {
    const d = await musicbrainz(`recording?artist=${mbid}&limit=100&offset=${offset}&fmt=json`);
    const lista = d?.recordings || [];
    for (const r of lista) titlar.add(normTitel(r.title));
    if (lista.length < 100) break;
  }
  return titlar;
}

async function bekraftaApple(a) {
  if (!a.lankar.mbid) return { lage: 'finns inte i MusicBrainz', ids: [] };
  const s = await itunes('term=' + encodeURIComponent(a.namn) + '&entity=musicArtist&limit=25', 'search');
  const kandidater = (s.results || []).filter(x => normNamn(x.artistName) === normNamn(a.namn));
  if (!kandidater.length) return { lage: 'inget exakt namn i iTunes', ids: [] };
  const mb = await inspelningar(a.lankar.mbid);
  if (!mb.size) return { lage: 'inga inspelningar i MusicBrainz', ids: [] };
  const prov = [];
  for (const k of kandidater.slice(0, 5)) {
    const d = await itunes('id=' + k.artistId + '&entity=song&limit=200');
    const titlar = new Set((d.results || []).filter(x => x.wrapperType === 'track' && x.artistId === k.artistId).map(x => normTitel(x.trackName)));
    const gemensamma = [...titlar].filter(t => mb.has(t)).length;
    prov.push({ id: k.artistId, latar: titlar.size, gemensamma });
  }
  return { ...avgorKandidater(prov), prov };
}

/* Spearmans rangkorrelation mellan iTunes ordning och Deezers rank för
   samma låtar. 1 betyder samma ordning, 0 ingen koppling alls. */
function spearman(par) {
  const n = par.length;
  if (n < 5) return null;
  const rang = v => { const s = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = []; s.forEach(([, i], k) => { r[i] = k; }); return r; };
  const a = rang(par.map(p => p[0])), b = rang(par.map(p => p[1]));
  const d2 = a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
  return 1 - 6 * d2 / (n * (n * n - 1));
}

/* ---------- rapporten ---------- */

async function rapport() {
  const T0 = Date.now();
  const artister = lasArtister();
  const mbCache = CACHE && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  console.log(`${artister.length} artister. ${artister.filter(a => a.spotify).length} har Spotify-ID i cachen.\n`);

  console.log('MusicBrainz: Spotify-ID → Deezer och Apple Music');
  for (const [i, a] of artister.entries()) {
    if (!a.spotify) { a.lankar = { mbid: null, deezer: [], apple: [] }; continue; }
    if (!harTaggar(mbCache[a.spotify])) {
      try { mbCache[a.spotify] = await lankar(a.spotify); }
      catch (e) { mbCache[a.spotify] = { mbid: null, deezer: [], apple: [], fel: e.message }; }
      if (CACHE) writeFileSync(CACHE, JSON.stringify(mbCache));
    }
    a.lankar = mbCache[a.spotify];
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${artister.length}`);
  }

  if (!BARA_B) console.log('\nVäg A: Deezer');
  for (const [i, a] of artister.entries()) {
    if (BARA_B) { a.A = { lage: 'hoppas över', ids: [], latar: [] }; continue; }
    try {
      a.A = await valjDeezer(a, a.lankar);
      a.A.latar = a.A.ids.length ? await lattarDeezer(a.A.ids) : [];
    } catch (e) { a.A = { lage: 'fel', fel: e.message, latar: [] }; }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${artister.length}, ${rakna.deezer} Deezer-anrop`);
  }

  console.log('\nVäg B: iTunes direkt');
  for (const [i, a] of artister.entries()) {
    try {
      a.B = await valjApple(a);
      a.B.latar = a.B.ids.length ? await lattarItunes(a.B.ids) : [];
      const fel = a.B.lage !== 'fastnaglad' && utanforEnligtApple(a.B.latar);
      if (fel) a.B = { lage: 'stoppad', skal: fel, ids: [], latar: [] };
    } catch (e) { a.B = { lage: 'fel', fel: e.message, latar: [] }; }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${artister.length}, ${rakna.itunes} iTunes-anrop`);
  }

  /* Stickprov för väg A: en låt per skiva, spridd över artisterna. */
  const urval = [];
  const setSkivor = new Set();
  for (let varv = 0; urval.length < ITUNES_STICKPROV && varv < PER_ARTIST; varv++) {
    for (const a of artister) {
      const t = a.A.latar[varv];
      if (t && !setSkivor.has(t.albumId) && urval.length < ITUNES_STICKPROV) { setSkivor.add(t.albumId); urval.push({ t, a }); }
    }
  }
  console.log(`\nVäg A, stickprov mot iTunes: ${urval.length} skivor`);
  const utfallA = {};
  const underkanda = [];
  for (const [i, { t, a }] of urval.entries()) {
    let u;
    try { u = await provaUpc(t, a.namn); } catch (e) { u = { utfall: 'fel: ' + e.message }; }
    utfallA[u.utfall] = (utfallA[u.utfall] || 0) + 1;
    if (u.utfall !== 'godkänd') underkanda.push({ artist: a.namn, titel: t.titel, ...u });
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${urval.length}`);
  }
  const andelA = urval.length ? (utfallA['godkänd'] || 0) / urval.length : 0;

  /* Hur väl iTunes ordning stämmer med Deezers rank, artist för artist. */
  const rho = [];
  for (const a of artister) {
    if (!a.A.latar.length || !a.B.latar.length) continue;
    const dz = new Map(a.A.latar.map(t => [normTitel(t.titel), t.rank]));
    const par = a.B.latar.filter(t => dz.has(normTitel(t.titel))).map(t => [-t.ordning, dz.get(normTitel(t.titel))]);
    const r = spearman(par);
    if (r !== null) rho.push(r);
  }
  rho.sort((x, y) => x - y);

  const sammanstall = (vag, lagen) => {
    const per = {};
    for (const a of artister) per[a[vag].lage] = (per[a[vag].lage] || 0) + 1;
    const latar = artister.reduce((s, a) => s + a[vag].latar.length, 0);
    const perGenre = {};
    for (const a of artister) perGenre[a.genre] = (perGenre[a.genre] || 0) + a[vag].latar.length;
    const utan = artister.filter(a => !a[vag].latar.length);
    return { lagen: per, latar, perGenre, artisterMedLatar: artister.length - utan.length, artisterUtanLatar: utan.length, utanLatarExempel: utan.slice(0, 40).map(a => a.namn) };
  };
  const A = sammanstall('A');
  const B = sammanstall('B');
  const ut = {
    skapad: new Date().toISOString(),
    artister: artister.length,
    musicbrainz: {
      medSpotifyId: artister.filter(a => a.spotify).length,
      iMusicBrainz: artister.filter(a => a.lankar.mbid).length,
      medDeezer: artister.filter(a => a.lankar.deezer.length).length,
      medApple: artister.filter(a => a.lankar.apple.length).length,
      fel: artister.filter(a => a.lankar.fel).length
    },
    A: { ...A, itunes: { stickprov: urval.length, utfall: utfallA, godkandAndel: Math.round(andelA * 1000) / 10 }, uppskattadeLatar: Math.round(A.latar * andelA) },
    B,
    iTunesOrdningMotDeezerRank: rho.length ? {
      artister: rho.length,
      median: Math.round(rho[Math.floor(rho.length / 2)] * 100) / 100,
      andelOver05: Math.round(rho.filter(r => r >= 0.5).length / rho.length * 100) + ' %'
    } : null,
    attNagla: {
      A: artister.filter(a => a.A.lage === 'osaker' || a.A.lage === 'saknas').map(a => a.namn),
      B: artister.filter(a => !a.B.ids?.length).map(a => ({ namn: a.namn, orsak: a.B.lage, prov: a.B.prov || null }))
    },
    bekraftadeViaInspelningar: artister.filter(a => a.B.lage === 'bekräftad via inspelningar')
      .map(a => ({ namn: a.namn, appleId: a.B.ids[0], prov: a.B.prov })),
    underkandaA: underkanda,
    anrop: rakna,
    minuter: Math.round((Date.now() - T0) / 6000) / 10
  };
  console.log('\n================ RAPPORT ================');
  console.log(JSON.stringify({ ...ut, underkandaA: underkanda.length, attNagla: { A: ut.attNagla.A.length, B: ut.attNagla.B.length } }, null, 2));
  if (UT) { writeFileSync(UT, JSON.stringify(ut, null, 2)); console.log('\nHela rapporten: ' + UT); }
}

/* ---------- påfyllning ---------- */

const PROJEKT_URL = 'https://oxblifknwwtehiscukeu.supabase.co';
/* Den hemliga nyckeln. I GitHub kommer den som hemlighet, på datorn ur en
   fil utanför repot. Den skrivs aldrig ut och läggs aldrig i repot. */
const NYCKELFIL = 'C:\\Users\\jonte\\hardlist-privat\\latbibliotek-nyckel.txt';
const PER_ANROP = 200;

function lasNyckel() {
  if (process.env.LATBIBLIOTEK_NYCKEL) return process.env.LATBIBLIOTEK_NYCKEL.trim();
  /* Avgränsaren räknas med: hardlist-privat börjar också med "hardlist",
     men ligger utanför repot. */
  const fil = resolve(NYCKELFIL).toLowerCase();
  if (fil === ROOT.toLowerCase() || fil.startsWith(ROOT.toLowerCase() + sep)) {
    throw new Error('Nyckelfilen ligger i repot. Flytta den.');
  }
  if (!existsSync(NYCKELFIL)) throw new Error(`Ingen nyckel. Lägg den i ${NYCKELFIL}.`);
  const k = readFileSync(NYCKELFIL, 'utf8').trim();
  /* Supabase hemliga nycklar börjar så. En publik nyckel här vore ett misstag. */
  if (!k.startsWith('sb_secret_')) throw new Error('Filen innehåller inte en hemlig nyckel (sb_secret_…).');
  return k;
}

async function skickaTillDatabasen(nyckel, payload) {
  const res = await fetch(PROJEKT_URL + '/rest/v1/rpc/latbibliotek_fyll', {
    method: 'POST',
    headers: { apikey: nyckel, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: payload })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Databasen svarade ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/* Normaliserad artist och titel, som sökningen i spelet matchar mot. */
const sokText = (artist, titel) => String(artist + ' ' + titel)
  .normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* Första påfyllningen tar ett litet urval: lika många artister ur varje
   genre, och i varje genre en som bekräftats via inspelningar om det finns,
   så att båda vägarna till identiteten provas. Stoppade artister hoppas över
   och listas. */
async function valjUrval(artister, antal) {
  const perGenre = Math.max(1, Math.round(antal / GENRER_ORDNING.length));
  const urval = [], stoppade = [];
  const prova = async a => {
    const B = await valjApple(a);
    if (B.lage === 'stoppad' || FEL_I_MUSICBRAINZ.has(a.namn)) stoppade.push({ namn: a.namn, skal: B.skal || B.lage });
    return B.ids.length ? { ...a, B } : null;
  };
  for (const g of GENRER_ORDNING) {
    const iGenre = artister.filter(a => a.genre === g && (a.lankar.mbid || FAST_APPLE[a.namn]));
    const valda = [];
    for (const a of iGenre.filter(a => a.lankar.apple.length || FAST_APPLE[a.namn])) {
      if (valda.length >= perGenre - 1) break;
      const v = await prova(a);
      if (v) valda.push(v);
    }
    for (const a of iGenre.filter(a => !a.lankar.apple.length && !FAST_APPLE[a.namn])) {
      const v = await prova(a);
      if (v) { valda.push(v); break; }
    }
    /* Ingen bekräftad via inspelningar i genren: fyll ut med en till med Apple-länk. */
    for (const a of iGenre.filter(a => a.lankar.apple.length && !valda.some(v => v.namn === a.namn))) {
      if (valda.length >= perGenre) break;
      const v = await prova(a);
      if (v) valda.push(v);
    }
    urval.push(...valda);
  }
  return { urval: urval.slice(0, antal), stoppade };
}
const GENRER_ORDNING = ['hardstyle', 'raw', 'uptempo', 'hardcore', 'techno'];

async function fyll() {
  const antal = Number(arg('--antal')) || 20;
  const torr = process.argv.includes('--torr');
  const nyckel = torr ? null : lasNyckel();
  const artister = lasArtister();
  const mbCache = CACHE && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  for (const a of artister) {
    if (!a.spotify) { a.lankar = { mbid: null, deezer: [], apple: [] }; continue; }
    if (!harTaggar(mbCache[a.spotify])) mbCache[a.spotify] = await lankar(a.spotify);
    a.lankar = mbCache[a.spotify];
  }
  if (CACHE) writeFileSync(CACHE, JSON.stringify(mbCache));

  const { urval, stoppade } = await valjUrval(artister, antal);
  console.log(`${urval.length} artister: ${urval.map(a => `${a.namn} (${a.genre}, ${a.B.lage})`).join(', ')}\n`);

  const latar = new Map();
  const godkanda = [];
  for (const a of urval) {
    const egna = await lattarItunes(a.B.ids);
    /* En fastnaglad sida är vald för hand och prövas inte igen. */
    const fel = a.B.lage !== 'fastnaglad' && utanforEnligtApple(egna);
    if (fel) { stoppade.push({ namn: a.namn, skal: fel }); console.log(`  ${a.namn}: stoppad, ${fel}`); continue; }
    godkanda.push(a);
    for (const t of egna) {
      if (latar.has(t.itunesId)) continue;
      latar.set(t.itunesId, {
        itunes_id: t.itunesId, itunes_artist_id: t.itunesArtistId, artist_namn: a.namn,
        artist: t.artist, titel: t.titel, sok: sokText(t.artist, t.titel), genre: a.genre,
        ljud: t.ljud, apple_lank: 'https://music.apple.com/se/song/' + t.itunesId,
        langd_ms: t.langdMs, itunes_ordning: t.ordning
      });
    }
    console.log(`  ${a.namn}: ${egna.length} låtar`);
  }
  const artistRader = godkanda.map(a => ({
    namn: a.namn, genre: a.genre, spotify_id: a.spotify, mbid: FEL_I_MUSICBRAINZ.has(a.namn) ? null : a.lankar.mbid,
    apple_ids: a.B.ids, lage: a.B.lage === 'inspelningar' || a.B.lage === 'fastnaglad' ? a.B.lage : 'musicbrainz'
  }));
  const rader = [...latar.values()];
  console.log(`\n${rader.length} låtar från ${artistRader.length} artister.`);
  if (stoppade.length) {
    console.log(`\nStoppade, Jonte får avgöra (${stoppade.length}):`);
    for (const s of stoppade) console.log(`  ${s.namn}: ${s.skal}`);
  }

  if (UT) skrivLyssning(rader, UT, Number(arg('--prov')) || 20);
  if (torr) { console.log('Torrkörning: ingenting skickat till databasen.'); return; }

  let nya = 0, uppdaterade = 0;
  /* Artisterna först, eftersom låtarna pekar på dem. */
  await skickaTillDatabasen(nyckel, { artister: artistRader, latar: [] });
  for (let i = 0; i < rader.length; i += PER_ANROP) {
    const svar = await skickaTillDatabasen(nyckel, { artister: [], latar: rader.slice(i, i + PER_ANROP) });
    nya += svar.nya_latar; uppdaterade += svar.uppdaterade_latar;
  }
  console.log(`Databasen: ${nya} nya låtar, ${uppdaterade} uppdaterade, ${artistRader.length} artister.`);
}

/* En sida att provlyssna på: slumpade låtar med Apples förlyssning och
   länk, så att någon kan höra att låten stämmer med titeln. Bara lokalt. */
function skrivLyssning(rader, fil, antal = 20) {
  const urval = [...rader].sort(() => Math.random() - 0.5).slice(0, antal);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  writeFileSync(fil, `<!doctype html><meta charset="utf-8"><title>Provlyssning</title>
<body style="font-family:system-ui;background:#100C17;color:#F6F2FB;max-width:760px;margin:24px auto;padding:0 16px">
<h1>Provlyssna ${urval.length} slumpade låtar</h1><p>Stämmer låten med titeln och artisten? Notera numret på de som inte gör det.</p><ol>` +
    urval.map(r => `<li style="margin:14px 0"><b>${esc(r.artist)} — ${esc(r.titel)}</b> <small>(${r.genre}, listad under ${esc(r.artist_namn)})</small><br>
<audio controls preload="none" src="${esc(r.ljud)}"></audio> <a style="color:#3DDCF0" href="${esc(r.apple_lank)}">Apple Music</a></li>`).join('') +
    `</ol></body>`);
  console.log('Provlyssning: ' + fil);
}

if (RAPPORT) rapport().catch(err => { console.error(err.message || err); process.exit(1); });
else if (process.argv.includes('--fyll')) fyll().catch(err => { console.error(err.message || err); process.exit(1); });
else {
  console.log('node scripts/latbibliotek.mjs --rapport   eller   --fyll [--antal 20] [--torr] [--prov 30]');
  process.exit(1);
}
