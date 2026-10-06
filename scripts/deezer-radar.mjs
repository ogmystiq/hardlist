/**
 * HARDLIST — Deezer-radar. Hittar nya släpp som Spotify sedan får bekräfta.
 *
 * Används av hamta-releaser.mjs, körs inte för sig. Ingen nyckel behövs.
 *
 * Deezer har ingen dygnskvot, bara en spärr på 50 anrop per 5 sekunder. Därför
 * kan hela artistlistan gås igenom varje morgon, vilket Spotify inte tillåter.
 * Deezer avgör aldrig vilken artist som är rätt — alla med exakt samma namn
 * tas med, och Spotify sållar bort fel person via sitt fastnaglade ID.
 *
 * Uppmätt 6 okt 2026:
 *   /artist/{id}/albums  är grupperat per typ, INTE datumsorterat. Angerfists
 *                        nyaste singel låg på plats 13. Alla sidor hämtas.
 *   /album/{id}          ger upc och contributors.
 */

const MIN_MELLANRUM = 200;   /* ms — max 5 anrop per sekund */
const KVOTPAUS = 6000;       /* Deezers spärr gäller 50 anrop per 5 s */
const MAX_FORSOK = 5;

/* Namn som skiljer sig mellan vår lista och Deezer. Vänster: namnet i
   hamta-releaser.mjs. Höger: vad artisten heter på Deezer. */
const ALIAS = {
  'Paul Elstak': 'DJ Paul Elstak'
};

/* Accenterna skalas av först. Annars blir Dréan "dran" och Drean "drean",
   och en uppenbar träff missas. */
export const normNamn = t => String(t).normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

const MIXTILLAGG = [
  'extended mix', 'extended version', 'extended edit', 'extended',
  'radio edit', 'radio mix', 'radio version', 'original mix', 'club mix', 'pro mix'
];
const mixRe = new RegExp(
  `\\s*(?:[\\(\\[]\\s*(?:${MIXTILLAGG.join('|')})\\s*[\\)\\]]|-\\s*(?:${MIXTILLAGG.join('|')})\\s*$)`,
  'gi'
);
/* Deezer och Spotify skriver samma släpp med och utan "(Extended Mix)". Utan
   att skala bort tilläggen räknas ett släpp vi redan har som nytt. */
export const normTitel = t => String(t).replace(mixRe, '')
  .normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/* Spotify räknar EP som singel och hämtar aldrig samlingsskivor. Samma
   uppdelning här, så fönstren blir desamma. */
const typAv = recordType =>
  recordType === 'album' ? 'album' : recordType === 'compile' ? null : 'single';

/**
 * Går igenom hela artistlistan på Deezer och returnerar släpp inom fönstret.
 * Varje släpp: { deezerId, titel, datum, typ, upc, artister, fran }
 *   artister  namnen Deezer anger på skivan
 *   fran      namnen i vår lista som skivan hittades under
 *
 * budgetSek  tar radarn längre tid än så avbryts den och returnerar det den
 *            hunnit, så Spotify-delen alltid får sin tid.
 */
export async function deezerRadar({ artister, relevant, dagarBakat, dagarBakatAlbum, budgetSek }) {
  const T0 = Date.now();
  let anrop = 0, senast = 0, avbrott = null;
  const vanta = ms => new Promise(r => setTimeout(r, ms));

  async function api(path, forsok = 0) {
    const kvar = senast + MIN_MELLANRUM - Date.now();
    if (kvar > 0) await vanta(kvar);
    senast = Date.now();
    anrop++;

    const res = await fetch('https://api.deezer.com' + path);
    if (res.status === 429 || res.status >= 500) {
      if (forsok >= MAX_FORSOK) throw new Error(`${path} → HTTP ${res.status}, gav upp`);
      await vanta(KVOTPAUS);
      return api(path, forsok + 1);
    }
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    const d = await res.json();

    /* Deezer lägger felet i kroppen och svarar ändå HTTP 200. Kod 4 är
       kvotspärren och går över av sig själv; allt annat är ett riktigt fel. */
    if (d?.error) {
      if (d.error.code === 4 && forsok < MAX_FORSOK) {
        await vanta(KVOTPAUS);
        return api(path, forsok + 1);
      }
      throw new Error(`${path} → Deezer-fel ${d.error.code}: ${d.error.message}`);
    }
    return d;
  }

  async function allaSkivor(id) {
    const ut = [];
    let path = `/artist/${id}/albums?limit=100`;
    while (path) {
      const d = await api(path);
      ut.push(...(d.data || []));
      path = d.next ? d.next.replace('https://api.deezer.com', '') : null;
    }
    return ut;
  }

  const releaser = new Map();   // deezer album-id → släpp
  let utanTraff = 0, fel = 0;

  for (const [i, { name }] of artister.entries()) {
    if ((Date.now() - T0) / 1000 > budgetSek) {
      avbrott = `Deezer-radarn nådde sin tidsbudget (${budgetSek}s) efter ${i} av ${artister.length} artister.`;
      break;
    }
    try {
      const sokNamn = ALIAS[name] || name;
      const d = await api(`/search/artist?q=${encodeURIComponent(sokNamn)}&limit=50`);
      const exakta = (d.data || []).filter(a => normNamn(a.name) === normNamn(sokNamn));
      if (!exakta.length) { utanTraff++; continue; }

      for (const kandidat of exakta) {
        for (const s of await allaSkivor(kandidat.id)) {
          const typ = typAv(s.record_type);
          if (!typ) continue;
          /* continue, inte break: singlar och album har olika fönster. */
          if (!relevant(s.release_date, typ === 'album' ? dagarBakatAlbum : dagarBakat)) continue;
          if (releaser.has(s.id)) { releaser.get(s.id).fran.add(name); continue; }
          releaser.set(s.id, { deezerId: s.id, titel: s.title, datum: s.release_date, typ, fran: new Set([name]) });
        }
      }
    } catch (err) {
      fel++;
      console.log(`  ✗ Deezer ${name}: ${err.message}`);
    }
    if ((i + 1) % 50 === 0) console.log(`  Deezer: ${i + 1}/${artister.length} artister, ${anrop} anrop`);
  }

  /* UPC finns bara på själva skivan, inte i artistens skivlista. */
  for (const r of releaser.values()) {
    if (avbrott && (Date.now() - T0) / 1000 > budgetSek + 60) break;
    try {
      const a = await api(`/album/${r.deezerId}`);
      r.upc = a.upc ? String(a.upc) : null;
      r.artister = [...new Set([a.artist?.name, ...(a.contributors || []).map(c => c.name)].filter(Boolean))];
    } catch (err) {
      r.upc = null;
      r.artister = [];
      console.log(`  ✗ Deezer album ${r.deezerId}: ${err.message}`);
    }
  }

  const ut = [...releaser.values()]
    .filter(r => r.upc)
    .map(r => ({ ...r, fran: [...r.fran] }));

  return {
    releaser: ut,
    utanUpc: releaser.size - ut.length,
    utanTraff, fel, anrop, avbrott,
    sekunder: Math.round((Date.now() - T0) / 1000)
  };
}
