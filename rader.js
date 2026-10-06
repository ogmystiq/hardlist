/* Releaseraderna, gemensamma för startsidan och releasesidan. Ett släpp ska
   se likadant ut överallt, så raden ritas bara här.

   Laddas som vanligt skript före sidans eget, utan defer. Allt nedan blir
   då globalt för sidans skript — sidan får därför inte deklarera samma namn
   en gång till, det stoppar hela skriptet. */

const GENRER = ['hardstyle','raw','uptempo','hardcore','techno'];
const GENRE_NAMN = { hardstyle:'Hardstyle', raw:'Raw', uptempo:'Uptempo', hardcore:'Hardcore', techno:'Hard techno' };
/* Hur många dagar bakåt som visas. Måste matcha DAGAR_BAKAT (singlar) och
   DAGAR_BAKAT_ALBUM (album) i hamta-releaser.mjs, annars faller ett album
   ur listan efter en vecka trots att skriptet behåller det i 30 dagar. */
const DAGAR_VISAS = 7;
const DAGAR_VISAS_ALBUM = 30;
const MANADER_KORT = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];

/* Äldre poster i data/releases.json kan ha genren "euphoric" kvar. */
const normGenre = g => g === 'euphoric' ? 'hardstyle' : (GENRER.includes(g) ? g : 'raw');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const idag = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
/* new Date('2026-08-14') tolkas som UTC-midnatt, vilket i svensk tid lägger
   dagens släpp under "Kommande". Datumet byggs därför lokalt. */
function lasDatum(s){
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
const dagarFran = s => Math.round((lasDatum(s) - idag()) / 86400000);
const kortDatum = s => { const d = lasDatum(s); return d.getDate() + ' ' + MANADER_KORT[d.getMonth()]; };
/* Spotify skriver samarbeten med ×, sajten med kommatecken. */
const artister = s => String(s || '').split(/\s+×\s+/).join(', ');

function gransFor(r){
  const g = idag();
  g.setDate(g.getDate() - (r.typ === 'album' ? DAGAR_VISAS_ALBUM : DAGAR_VISAS));
  return g;
}

/* Spotifys eget omslag när det finns, annars bokstavsrutan. Bara bilder från
   Spotifys bildserver visas, samma krav som hämtningsskriptet ställer. */
const SPOTIFY_BILD = 'https://i.scdn.co/image/';
function omslag(r){
  const initial = esc(artister(r.artist).charAt(0).toUpperCase());
  if (typeof r.omslag === 'string' && r.omslag.startsWith(SPOTIFY_BILD)){
    return '<img class="omslag-bild" src="' + esc(r.omslag) + '" alt="" width="52" height="52" ' +
      'loading="lazy" decoding="async" referrerpolicy="no-referrer" data-initial="' + initial + '">';
  }
  return '<span class="omslag" aria-hidden="true">' + initial + '</span>';
}

/* Datumet ritas alltid. Det syns bara i listor med .med-datum, där raderna
   inte står under en dagrubrik. */
function rad(r, datumText){
  const g = normGenre(r.genre);
  const titel = r.title || r.titel || '';
  const inre =
    '<span class="rad-vanster">' +
      omslag(r) +
      '<span class="rad-mitt">' +
        '<span class="rad-titel">' + esc(titel) +
          (r.typ === 'album' ? '<span class="rad-typ">Album</span>' : '') + '</span>' +
        '<span class="rad-under">' + esc(artister(r.artist)) + '</span>' +
      '</span>' +
    '</span>' +
    '<span class="rad-genre"><span class="prick"></span>' + GENRE_NAMN[g] + '</span>' +
    '<span class="rad-datum">' + esc(datumText || '') + '</span>';
  if (!r.url) return '<div class="rad g-' + g + '">' + inre + '<span></span></div>';
  return '<a class="rad g-' + g + '" href="' + esc(r.url) + '" target="_blank" rel="noopener" ' +
    'title="Lyssna på ' + esc(titel) + '">' + inre +
    '<span class="rad-spela" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
    '</a>';
}

/* Går ett omslag inte att ladda tar bokstavsrutan över, hellre än en tom
   ruta eller webbläsarens trasiga bild. */
document.addEventListener('error', e => {
  const bild = e.target;
  if (!(bild instanceof HTMLImageElement) || !bild.classList.contains('omslag-bild')) return;
  const ruta = document.createElement('span');
  ruta.className = 'omslag';
  ruta.setAttribute('aria-hidden', 'true');
  ruta.textContent = bild.dataset.initial || '';
  bild.replaceWith(ruta);
}, true);
