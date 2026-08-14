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
 *   GET /artists/{id}/albums       max limit är numera 10 (var 50) — vi
 *                                  bläddrar två sidor för att täcka 20 album
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* 1. SCENEN — inte en smaklista. Målet är att täcka alla stora namn   */
/*    så att sajten funkar för alla som kollar efter nya releaser.     */
/*    Genren styr färg och uppskattad BPM.                             */
/*    Giltiga: euphoric | raw | uptempo | hardcore | techno            */
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
  { name: 'Evil Activities',        genre: 'hardcore' },
  { name: 'Paul Elstak',            genre: 'hardcore' },

  /* --- hard techno / industrial ---
     Egen värld, inte en gren av hardstyle. Ligger med för att artisterna
     spelar samma festivaler och publiken överlappar. */
  { name: 'Vieze Asbak',            genre: 'techno' },

  /* --- saknades tidigare --- */
  { name: 'KELTEK',                 genre: 'euphoric' },
  { name: 'The Purge',              genre: 'raw' },
  { name: 'Jay Reeve',              genre: 'raw' },
  { name: 'Primeshock',             genre: 'euphoric' },
  { name: 'Nolz',                   genre: 'uptempo' }
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
const BPM_PER_GENRE = { euphoric: 150, raw: 155, uptempo: 200, hardcore: 190, techno: 150 };

/* --- Kvotskydd ---------------------------------------------------------
   Development Mode har en daglig kvot per utvecklarkonto. Går den sönder är
   du utelåst i ett dygn. Därför tre spärrar:

   MAX_ANROP  hårt tak på antal API-anrop per körning. Nås det sparar
              skriptet det den hunnit och slutar. Artisterna roteras mellan
              körningar så alla kommer med över tid.
              OBS: dagskvoten går sönder runt 200 anrop. Kör en gång per dygn.
   MAX_VANTAN ber Spotify oss vänta längre än så avbryts körningen direkt
              istället för att ligga och hamra på kvoten.
   PAUS       paus mellan anrop.
------------------------------------------------------------------------ */
/* Uppmätt i praktiken: dagskvoten i Development Mode tar slut runt 200 anrop.
   Taket ligger därför med marginal under det. Kör HÖGST EN GÅNG PER DYGN tills
   artist-cachen är komplett — då kostar ett helt varv bara 80 anrop. */
const MAX_ANROP    = 120;
const MAX_VANTAN   = 180;   /* längsta enskilda väntan vi accepterar, sekunder */
const TIDSBUDGET   = 8 * 60;/* hela körningen, sekunder. Under jobbets timeout. */
const PAUS         = 300;

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

const STATE_FIL = resolve(ROOT, 'data/artist-ids.json');
const REL_FIL   = resolve(ROOT, 'data/releases.json');

let state = { ids: {}, nextIndex: 0 };
let anrop = 0;
const T0 = Date.now();
const forbrukat = () => Math.round((Date.now() - T0) / 1000);

async function lasJson(fil, fallback) {
  try { return JSON.parse(await readFile(fil, 'utf8')); } catch { return fallback; }
}

async function skrivJson(fil, data) {
  await mkdir(resolve(ROOT, 'data'), { recursive: true });
  await writeFile(fil, JSON.stringify(data, null, 2) + '\n', 'utf8');
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

class Stopp extends Error {}

async function api(path, token, forsok = 0) {
  if (anrop >= MAX_ANROP) throw new Stopp(`Anropstaket (${MAX_ANROP}) nått.`);
  if (forbrukat() > TIDSBUDGET) {
    throw new Stopp(`Tidsbudgeten (${TIDSBUDGET}s) nådd. Sparar och avslutar.`);
  }
  anrop++;

  const res = await fetch('https://api.spotify.com/v1' + path, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (res.status === 429) {
    let reason = '';
    try { reason = (await res.clone().json())?.reason || ''; } catch {}
    const wait = Number(res.headers.get('retry-after') || 2);

    /* Två helt olika saker döljer sig bakom 429:

       QUOTA_EXCEEDED  dagskvoten är slut. Väntan mäts i timmar och fler
                       försök gör bara saken värre. Avbryt.
       Vanlig 429      kortvarig rate limit, ofta 1-3 minuter. Vänta ut den. */
    /* Spotify sätter inte alltid reason-fältet, så väntetiden får avgöra.
       Över en timme är det alltid dygnskvoten, aldrig en tillfällig broms. */
    if (reason === 'QUOTA_EXCEEDED' || wait > 3600) {
      const tim = (wait / 3600).toFixed(1);
      throw new Stopp(
        `KVOTEN ÄR SLUT för dygnet. Spotify ber oss vänta ${wait}s (${tim}h). ` +
        'Kör INTE igen förrän dess — varje försök är bortkastat. Kvoten delas av ' +
        'alla dina Development Mode-appar och nollställs av sig själv.'
      );
    }

    if (wait > MAX_VANTAN) {
      throw new Stopp(
        `RATE LIMIT på ${wait}s, längre än taket ${MAX_VANTAN}s. Inte kvoten — ` +
        'bara en tillfällig broms. Vänta några minuter och kör igen.'
      );
    }
    if (forbrukat() + wait > TIDSBUDGET) {
      throw new Stopp(
        `RATE LIMIT på ${wait}s ryms inte i tidsbudgeten. Sparar och avslutar. ` +
        'Kör igen om en stund — den fortsätter där den slutade.'
      );
    }
    if (forsok >= 3) throw new Error(`${path} → 429, gav upp efter 4 försök`);

    console.log(`  rate limit — väntar ${wait}s (försök ${forsok + 1})`);
    await new Promise(r => setTimeout(r, (wait + 1) * 1000));
    return api(path, token, forsok + 1);
  }

  if (res.status === 400) {
    throw new Error(`${path} → 400. Parametern godkänns inte — limit får vara max 10.`);
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

async function hittaId(name, token) {
  if (state.ids[name]) return state.ids[name];
  const data = await api(`/search?q=${encodeURIComponent(name)}&type=artist&limit=1`, token);
  const id = data.artists?.items?.[0]?.id ?? null;
  if (id) state.ids[name] = id;
  return id;
}

function relevant(dateStr) {
  if (!dateStr || dateStr.length < 7) return false;
  const d = new Date(dateStr.length === 7 ? dateStr + '-01' : dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAGAR_BAKAT);
  return d >= cutoff;
}

const nyckel = r => `${r.artist} – ${r.title}`.toLowerCase();

async function run() {
  state = await lasJson(STATE_FIL, { ids: {}, nextIndex: 0 });

  /* Tidigare fynd behålls. Delkörningar får aldrig radera det som redan finns. */
  const tidigare = await lasJson(REL_FIL, []);
  const alla = new Map(
    (Array.isArray(tidigare) ? tidigare : [])
      .filter(r => relevant(r.date))
      .map(r => [nyckel(r), r])
  );

  const token = await getToken();
  const start = state.nextIndex % ARTISTS.length;
  let klara = 0, stopp = null;

  for (let n = 0; n < ARTISTS.length; n++) {
    const i = (start + n) % ARTISTS.length;
    const { name, genre } = ARTISTS[i];

    try {
      const id = await hittaId(name, token);
      if (!id) { console.log(`✗ hittade inte ${name}`); klara++; continue; }

      const sida = await api(
        `/artists/${id}/albums?include_groups=single,album&market=SE&limit=10`,
        token
      );

      let nya = 0;
      for (const a of sida.items || []) {
        if (!relevant(a.release_date)) continue;
        const artist = (a.artists || []).map(x => x.name).join(' × ') || name;
        const rel = {
          artist,
          title: a.name,
          genre,
          bpm: OVERRIDE[`${artist} – ${a.name}`] ?? BPM_PER_GENRE[genre] ?? 150,
          date: a.release_date.length === 7 ? a.release_date + '-01' : a.release_date,
          url: a.external_urls?.spotify || ''
        };
        if (!alla.has(nyckel(rel))) { alla.set(nyckel(rel), rel); nya++; }
      }
      if (nya) console.log(`✓ ${name}: ${nya}`);
      klara++;

    } catch (err) {
      if (err instanceof Stopp) { stopp = err; break; }
      console.log(`✗ ${name}: ${err.message}`);
      klara++;
    }

    await new Promise(r => setTimeout(r, PAUS));
  }

  state.nextIndex = (start + klara) % ARTISTS.length;

  const out = [...alla.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  await skrivJson(REL_FIL, out);
  await skrivJson(STATE_FIL, state);

  console.log(
    `\n${klara}/${ARTISTS.length} artister denna körning, ${anrop} API-anrop, ` +
    `${forbrukat()}s.\n${out.length} releaser totalt i data/releases.json.`
  );
  if (klara < ARTISTS.length) {
    console.log(`Nästa körning fortsätter från artist ${state.nextIndex + 1}.`);
  }
  if (stopp) console.log('\n' + stopp.message);
}

run().catch(err => { console.error(err.message || err); process.exit(1); });
