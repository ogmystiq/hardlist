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
const QUIZ    = resolve(ROOT, 'data/quiz.json');
const RELEASER= resolve(ROOT, 'data/releases.json');
const INDEX   = resolve(ROOT, 'index.html');
const QUIZSIDA= resolve(ROOT, 'quiz.html');
const ANTHEMS = resolve(ROOT, 'data/anthems.json');
const ANTSIDA = resolve(ROOT, 'anthems.html');
const SITEMAP = resolve(ROOT, 'sitemap.xml');
const ICS     = resolve(ROOT, 'kalender.ics');
const RSS     = resolve(ROOT, 'releaser.xml');

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

  /* Samma sak för quizet: frågorna finns i data/quiz.json och speglas in i
     quiz.html som reservkopia. */
  const quiz = JSON.parse(await readFile(QUIZ, 'utf8'));
  let qhtml = await readFile(QUIZSIDA, 'utf8');
  qhtml = ersatt(qhtml, '/* SEED_QUIZ:START */', '/* SEED_QUIZ:END */',
    'const SEED_QUIZ = ' + JSON.stringify(quiz.fragor) + ';', 'quiz.html');
  await writeFile(QUIZSIDA, qhtml, 'utf8');

  /* Anthem-arkivet speglas in på samma sätt. */
  const anthems = JSON.parse(await readFile(ANTHEMS, 'utf8'));
  let ahtml = await readFile(ANTSIDA, 'utf8');
  ahtml = ersatt(ahtml, '/* SEED_ANTHEMS:START */', '/* SEED_ANTHEMS:END */',
    'const SEED_ANTHEMS = ' + JSON.stringify(anthems) + ';', 'anthems.html');
  await writeFile(ANTSIDA, ahtml, 'utf8');

  /* --- kalender.ics: prenumererbar kalender ur samma eventdata ---
     Google Kalender och Apple Kalender läser om filen med jämna mellanrum,
     så nya event dyker upp hos prenumeranterna av sig själva. */
  const icsEsc = t => String(t).replace(/\\/g,'\\\\').replace(/;/g,'\\;')
                               .replace(/,/g,'\\,').replace(/\n/g,'\\n');
  const icsDatum = d => d.replace(/-/g, '');
  const nu = new Date().toISOString().replace(/[-:]/g,'').slice(0,15) + 'Z';

  /* RFC 5545 tillåter max 75 oktetter per rad. Längre rader viks med CRLF
     följt av ett mellanslag, annars vägrar strikta kalenderklienter läsa filen. */
  const vik = rad => {
    const bytes = Buffer.from(rad, 'utf8');
    if (bytes.length <= 73) return rad;
    const delar = [];
    let i = 0;
    while (i < bytes.length) {
      let n = Math.min(73, bytes.length - i);
      /* Klipp aldrig mitt i ett tecken. */
      while (n > 1 && (bytes[i + n] & 0xC0) === 0x80) n--;
      delar.push(bytes.slice(i, i + n).toString('utf8'));
      i += n;
    }
    return delar.join('\r\n ');
  };

  const vevent = daterade.map(e => {
    /* Heldagsevent. DTEND är exklusiv, så slutdagen är dagen efter. */
    const start = icsDatum(e.date);
    /* dateEnd i events.json = sista dagen. Saknas den är eventet endags. */
    const sista = e.dateEnd || e.date;
    const slutD = new Date(sista); slutD.setDate(slutD.getDate() + 1);
    const slut = icsDatum(slutD.toISOString().slice(0,10));
    return [
      'BEGIN:VEVENT',
      'UID:' + e.date + '-' + e.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '@hardlist.se',
      'DTSTAMP:' + nu,
      'DTSTART;VALUE=DATE:' + start,
      'DTEND;VALUE=DATE:' + slut,
      'SUMMARY:' + icsEsc(e.name),
      'LOCATION:' + icsEsc((e.venue ? e.venue + ', ' : '') + e.city),
      'DESCRIPTION:' + icsEsc((e.lineup || '') + (e.url ? '\n' + e.url : '')),
      e.url ? 'URL:' + e.url : null,
      'END:VEVENT'
    ].filter(Boolean).map(vik).join('\r\n');
  }).join('\r\n');

  await writeFile(ICS, [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HARDLIST//Kalender//SV',
    'X-WR-CALNAME:HARDLIST — rave i Norden & Europa',
    'X-WR-CALDESC:Bekräftade hard dance-event. Uppdateras automatiskt.',
    'REFRESH-INTERVAL;VALUE=DURATION:P1D',
    vevent,
    'END:VCALENDAR', ''
  ].join('\r\n'), 'utf8');

  /* --- releaser.xml: RSS-flöde ur senaste releaser --- */
  let releaser = [];
  try { releaser = JSON.parse(await readFile(RELEASER, 'utf8')); } catch(e){}
  const xmlEsc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                               .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const items = (Array.isArray(releaser) ? releaser : [])
    .slice(0, 50)
    .map(r => [
      '  <item>',
      '    <title>' + xmlEsc(r.artist + ' — ' + r.title) + '</title>',
      r.url ? '    <link>' + xmlEsc(r.url) + '</link>' : null,
      '    <guid isPermaLink="false">' + xmlEsc(r.artist + '|' + r.title + '|' + r.date) + '</guid>',
      '    <pubDate>' + new Date(r.date + 'T08:00:00Z').toUTCString() + '</pubDate>',
      '    <category>' + xmlEsc(r.genre || '') + '</category>',
      '  </item>'
    ].filter(Boolean).join('\n')).join('\n');

  await writeFile(RSS,
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"><channel>\n' +
    '  <title>HARDLIST — nya releaser</title>\n' +
    '  <link>' + DOMAN + '/</link>\n' +
    '  <description>Nya släpp inom hardstyle, raw, uptempo, hardcore och hard techno.</description>\n' +
    '  <language>sv-SE</language>\n' +
    items + '\n</channel></rss>\n', 'utf8');

  /* Sitemapens lastmod ska spegla att sajten faktiskt uppdaterats. */
  const idag = new Date().toISOString().slice(0, 10);
  let sm = await readFile(SITEMAP, 'utf8');
  sm = sm.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${idag}</lastmod>`);
  await writeFile(SITEMAP, sm, 'utf8');

  console.log(
    `Metadata byggd: ${events.length} event i SEED_EVENTS, ` +
    `${daterade.length} med datum i strukturerad data, ` +
    `${quiz.fragor.length} quizfrågor, ${daterade.length} event i kalender.ics, ` +
    `RSS med senaste releaser, ${anthems.defqon.ar.length} anthems. Sitemap satt till ${idag}.`
  );
}

run().catch(err => { console.error(err.message || err); process.exit(1); });
