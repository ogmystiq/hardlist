/**
 * HARDLIST — bygger om allt som härleds ur data/events.json
 *
 * Kör:  node scripts/bygg-metadata.mjs
 * Körs automatiskt av workflowen varje natt, före commit.
 *
 * Eventdatan finns på tre ställen och måste hållas i synk:
 *
 *   data/events.json   sanningen — den enda fil du redigerar för hand
 *   SEED_EVENTS        reservkopia i index.html, används när sidan öppnas
 *                      lokalt och webbläsaren blockerar fetch mot filer
 *   JSON-LD            strukturerad data för Google, ger rika sökresultat
 *                      med datum och plats direkt i sökningen
 *
 * Det här skriptet skriver de två sista utifrån den första, så du aldrig
 * behöver kopiera något manuellt. Det uppdaterar också sitemapens datum.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAN  = 'https://hardlist.se';

const EVENTS  = resolve(ROOT, 'data/events.json');
const INDEX   = resolve(ROOT, 'index.html');
const SITEMAP = resolve(ROOT, 'sitemap.xml');

/* Byter ut allt mellan två markörer. Saknas markörerna avbryter vi hellre
   än att gissa — en trasig index.html är värre än inaktuell metadata. */
function ersatt(text, start, slut, nytt, filnamn) {
  const i = text.indexOf(start);
  const j = text.indexOf(slut);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(
      `Hittade inte markörerna ${start} / ${slut} i ${filnamn}. ` +
      'Filen har ändrats för hand — lägg tillbaka markörerna och kör igen.'
    );
  }
  return text.slice(0, i + start.length) + '\n' + nytt + '\n' + text.slice(j);
}

function eventLd(e) {
  const delar = e.city.split(',').map(s => s.trim());
  const stad  = delar[0];
  const land  = delar.length > 1 ? delar[delar.length - 1] : 'SE';

  const ld = {
    '@type': 'MusicEvent',
    name: e.name,
    startDate: e.date,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: e.venue || stad,
      address: { '@type': 'PostalAddress', addressLocality: stad, addressCountry: land }
    },
    image: DOMAN + '/og-image.png',
    description: (e.lineup || '').slice(0, 300) || ('Hard dance-event i ' + stad)
  };
  if (e.url) ld.url = e.url;
  return ld;
}

async function run() {
  const events = JSON.parse(await readFile(EVENTS, 'utf8'));
  if (!Array.isArray(events)) throw new Error('data/events.json är inte en lista.');

  /* Bara event med bekräftat datum hör hemma i strukturerad data. Google
     kräver startDate, och ett påhittat datum är värre än inget event. */
  const daterade = events
    .filter(e => e.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': DOMAN + '/#site', url: DOMAN + '/', name: 'HARDLIST',
        inLanguage: 'sv-SE',
        description: 'Nya hardstyle-, raw-, uptempo-, hardcore- och hard techno-releaser i datumordning, plus varje rave i Norden.',
        publisher: { '@id': DOMAN + '/#person' } },
      { '@type': 'Person', '@id': DOMAN + '/#person', name: 'Jonathan H' },
      { '@type': 'ItemList', name: 'Kommande hard dance-event i Norden',
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: daterade.length,
        itemListElement: daterade.map((e, i) => ({
          '@type': 'ListItem', position: i + 1, item: eventLd(e)
        })) }
    ]
  };

  let html = await readFile(INDEX, 'utf8');

  html = ersatt(html, '<!-- EVENTS-LD:START -->', '<!-- EVENTS-LD:END -->',
    '<script type="application/ld+json">\n' +
    JSON.stringify(ld, null, 2) + '\n</script>', 'index.html');

  html = ersatt(html, '/* SEED_EVENTS:START */', '/* SEED_EVENTS:END */',
    'const SEED_EVENTS = ' + JSON.stringify(events, null, 2)
      .split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n') + ';', 'index.html');

  await writeFile(INDEX, html, 'utf8');

  /* Sitemapens lastmod ska spegla att sajten faktiskt uppdaterats. */
  const idag = new Date().toISOString().slice(0, 10);
  let sm = await readFile(SITEMAP, 'utf8');
  sm = sm.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${idag}</lastmod>`);
  await writeFile(SITEMAP, sm, 'utf8');

  console.log(
    `Metadata byggd: ${events.length} event i SEED_EVENTS, ` +
    `${daterade.length} med datum i strukturerad data. Sitemap satt till ${idag}.`
  );
}

run().catch(err => { console.error(err.message || err); process.exit(1); });
