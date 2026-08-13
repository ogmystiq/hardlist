/**
 * HARDLIST — hämtar nya releaser från Spotify och skriver data/releases.json
 *
 * Kör:  SPOTIFY_ID=xxx SPOTIFY_SECRET=yyy node scripts/hamta-releaser.mjs
 * Kräver Node 18+ (inbyggd fetch). Inga npm-paket.
 *
 * VIKTIGT: sedan mars 2026 kräver Spotify att den som äger appen har ett
 * aktivt Premium-abonnemang. Löper det ut slutar appen fungera direkt, och
 * börjar fungera igen när du förnyar.
 *
 * Endpoints som används (båda finns kvar efter februari 2026-migreringen):
 *   GET /search?type=artist        max limit är numera 10, vi använder 1
 *   GET /artists/{id}/albums       oförändrad
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* 1. SCENEN — inte en smaklista. Målet är att täcka alla stora namn   */
/*    så att sajten funkar för alla som kollar efter nya releaser.     */
/*    Genren styr färg och uppskattad BPM.                             */
/*    Giltiga: euphoric | raw | uptempo | hardcore                     */
/* ------------------------------------------------------------------ */
const ARTISTS = [
  /* --- euphoric / melodic hardstyle --- */
  { name: 'Headhunterz',            genre: 'euphoric' },
  { name: 'Wildstylez',             genre: 'euphoric' },
  { name: 'Brennan Heart',          genre: 'euphoric' },
  { name: 'Da Tweekaz',             genre: 'euphoric' },
  { name: 'Coone',                  genre: 'euphoric' },
  { name: 'Atmozfears',             genre: 'euphoric' },
  { name: 'D-Block & S-te-Fan',     genre: 'euphoric' },
  { name: 'Sound Rush',             genre: 'euphoric' },
  { name: 'Devin Wild',             genre: 'euphoric' },
  { name: 'Refuzion',               genre: 'euphoric' },
  { name: 'Audiotricz',             genre: 'euphoric' },
  { name: 'Code Black',             genre: 'euphoric' },
  { name: 'Noisecontrollers',       genre: 'euphoric' },
  { name: 'Frontliner',             genre: 'euphoric' },
  { name: 'Bass Modulators',        genre: 'euphoric' },
  { name: 'Wasted Penguinz',        genre: 'euphoric' },
  { name: 'Sub Sonik',              genre: 'euphoric' },
  { name: 'Hard Driver',            genre: 'euphoric' },
  { name: 'Sephyx',                 genre: 'euphoric' },
  { name: 'Toneshifterz',           genre: 'euphoric' },
  { name: 'Psyko Punkz',            genre: 'euphoric' },
  { name: 'Zatox',                  genre: 'euphoric' },

  /* --- raw / rawstyle --- */
  { name: 'Rebelion',               genre: 'raw' },
  { name: 'Sub Zero Project',       genre: 'raw' },
  { name: 'Warface',                genre: 'raw' },
  { name: 'D-Sturb',                genre: 'raw' },
  { name: 'Act of Rage',            genre: 'raw' },
  { name: 'Radical Redemption',     genre: 'raw' },
  { name: 'Ran-D',                  genre: 'raw' },
  { name: 'Adaro',                  genre: 'raw' },
  { name: 'Rooler',                 genre: 'raw' },
  { name: 'Malice',                 genre: 'raw' },
  { name: 'Frequencerz',            genre: 'raw' },
  { name: 'B-Front',                genre: 'raw' },
  { name: 'Phuture Noize',          genre: 'raw' },
  { name: 'Digital Punk',           genre: 'raw' },
  { name: 'Delete',                 genre: 'raw' },
  { name: 'Deluzion',               genre: 'raw' },
  { name: 'E-Force',                genre: 'raw' },
  { name: 'Killshot',               genre: 'raw' },
  { name: 'Rejecta',                genre: 'raw' },
  { name: 'Riot Shift',             genre: 'raw' },
  { name: 'Unresolved',             genre: 'raw' },
  { name: 'Restrained',             genre: 'raw' },
  { name: 'Crypsis',                genre: 'raw' },
  { name: 'Regain',                 genre: 'raw' },
  { name: 'Aversion',               genre: 'raw' },
  { name: 'Never Surrender',        genre: 'raw' },
  { name: 'Vertile',                genre: 'raw' },
  { name: 'Requiem',                genre: 'raw' },

  /* --- uptempo --- */
  { name: 'Yoshiko',                genre: 'uptempo' },
  { name: 'Vieze Asbak',            genre: 'uptempo' },
  { name: 'Sickmode',               genre: 'uptempo' },
  { name: 'Bloodlust',              genre: 'uptempo' },
  { name: 'Kill The Bass',          genre: 'uptempo' },
  { name: 'Deadly Guns',            genre: 'uptempo' },
  { name: 'Tha Watcher',            genre: 'uptempo' },
  { name: 'Hyrule War',             genre: 'uptempo' },
  { name: 'Dr. Donk',               genre: 'uptempo' },
  { name: 'Fraw',                   genre: 'uptempo' },

  /* --- hardcore / frenchcore --- */
  { name: 'Angerfist',              genre: 'hardcore' },
  { name: 'Dr. Peacock',            genre: 'hardcore' },
  { name: 'Partyraiser',            genre: 'hardcore' },
  { name: 'N-Vitral',               genre: 'hardcore' },
  { name: 'Miss K8',                genre: 'hardcore' },
  { name: 'Neophyte',               genre: 'hardcore' },
  { name: 'Mad Dog',                genre: 'hardcore' },
  { name: 'Nosferatu',              genre: 'hardcore' },
  { name: 'Tha Playah',             genre: 'hardcore' },
  { name: 'Furyan',                 genre: 'hardcore' },
  { name: 'Destructive Tendencies', genre: 'hardcore' },
  { name: 'Sefa',                   genre: 'hardcore' },
  { name: 'Billx',                  genre: 'hardcore' },
  { name: 'Evil Activities',        genre: 'hardcore' }
];

/* Hur många dagar bakåt som hämtas. Sajten delar sen upp i:
     Kommande     — releasedatum i framtiden
     Nyss släppt  — de senaste 7 dagarna
     Tidigare     — resten upp till DAGAR_BAKAT
   Sätt till 7 om du bara vill ha kommande + nyss släppt. */
const DAGAR_BAKAT = 30;

/* Uppskattad BPM per genre. Spotify slutade ge ut BPM till nya appar
   i november 2024, så den här siffran är en gissning per genre.
   Vill du ha exakt BPM: skriv in den i OVERRIDE nedan. */
const BPM_PER_GENRE = { euphoric: 150, raw: 155, uptempo: 200, hardcore: 190 };

/* Manuell BPM för enskilda spår: "Artist – Titel": BPM */
const OVERRIDE = {
  // 'Yoshiko – Some Track': 203
};

/* ------------------------------------------------------------------ */

const ID = process.env.SPOTIFY_ID;
const SECRET = process.env.SPOTIFY_SECRET;

if (!ID || !SECRET) {
  console.error('Saknar SPOTIFY_ID / SPOTIFY_SECRET. Sätt dem som miljövariabler och kör igen.');
  process.exit(1);
}

async function getToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${ID}:${SECRET}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error(`Token misslyckades: ${res.status}`);
  return (await res.json()).access_token;
}

async function api(path, token, forsok = 0) {
  const res = await fetch('https://api.spotify.com/v1' + path, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (res.status === 429) {
    /* Sedan juli 2026 skiljer Spotify på rate limit och kvot i 429-svaret.
       Rate limit går över av sig själv. Kvoten gör det inte — då är det
       meningslöst att fortsätta försöka. */
    let reason = '';
    try { reason = (await res.clone().json())?.reason || ''; } catch {}

    if (reason === 'QUOTA_EXCEEDED') {
      throw new Error(
        'KVOTEN ÄR SLUT för ditt utvecklarkonto. Kvoten delas mellan alla dina ' +
        'Development Mode-appar. Kör mer sällan eller korta ner ARTISTS-listan.'
      );
    }
    if (forsok >= 5) throw new Error(`${path} → 429, gav upp efter 5 försök`);

    const wait = Number(res.headers.get('retry-after') || 2);
    console.log(`  rate limit — väntar ${wait}s`);
    await new Promise(r => setTimeout(r, (wait + 1) * 1000));
    return api(path, token, forsok + 1);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${path} → ${res.status}. Kontrollera nycklarna, och att kontot som äger ` +
      'appen har aktivt Spotify Premium (krav sedan mars 2026).'
    );
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function findArtistId(name, token) {
  const q = encodeURIComponent(name);
  const data = await api(`/search?q=${q}&type=artist&limit=1`, token);
  return data.artists?.items?.[0]?.id ?? null;
}

/* Tar med allt som släpps framåt i tiden plus det som släppts
   de senaste DAGAR_BAKAT dagarna. */
function isRelevant(dateStr) {
  if (!dateStr || dateStr.length < 7) return false;
  const d = new Date(dateStr.length === 7 ? dateStr + '-01' : dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAGAR_BAKAT);
  return d >= cutoff;
}

async function run() {
  const token = await getToken();
  const out = [];
  const seen = new Set();

  for (const { name, genre } of ARTISTS) {
    try {
      const id = await findArtistId(name, token);
      if (!id) { console.log(`✗ hittade inte ${name}`); continue; }

      const albums = await api(
        `/artists/${id}/albums?include_groups=single,album&market=SE&limit=10`,
        token
      );

      let hits = 0;
      for (const a of albums.items || []) {
        if (!isRelevant(a.release_date)) continue;

        const artist = (a.artists || []).map(x => x.name).join(' × ') || name;
        const key = `${artist} – ${a.name}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          artist,
          title: a.name,
          genre,
          bpm: OVERRIDE[`${artist} – ${a.name}`] ?? BPM_PER_GENRE[genre] ?? 150,
          date: a.release_date.length === 7 ? a.release_date + '-01' : a.release_date,
          url: a.external_urls?.spotify || ''
        });
        hits++;
      }
      if (hits) console.log(`✓ ${name}: ${hits}`);
    } catch (err) {
      if (/KVOTEN ÄR SLUT/.test(err.message)) throw err;   // ingen idé att fortsätta
      console.log(`✗ ${name}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 100)); // var snäll mot API:et
  }

  out.sort((a, b) => (a.date < b.date ? 1 : -1));

  await mkdir(resolve(ROOT, 'data'), { recursive: true });
  await writeFile(
    resolve(ROOT, 'data/releases.json'),
    JSON.stringify(out, null, 2) + '\n',
    'utf8'
  );

  console.log(`\nKlart — ${out.length} releaser skrivna till data/releases.json`);
}

run().catch(err => { console.error(err); process.exit(1); });
