/* Genreriggen: veckans släpp som en ljusrigg i genrefärgerna, HARDLIST:s
   kännetecken överst på startsidan och, lägre, på releasesidan.

   Laddas efter rader.js och använder dess GENRER, GENRE_NAMN, normGenre,
   dagarFran och esc. Allt ligger i en funktion och bara window.hardlistRigg
   blir globalt, eftersom rader.js och sidornas skript delar namnrymd.

   Siffrorna ska alltid vara sanna. Räkningen finns bara här, så att
   startsidan och releasesidans "Senaste sju dagarna" aldrig kan visa olika,
   och när hämtningen misslyckats ritas inga nollor, bara felet. */
(function(){
  /* "Senaste sju dagarna" är idag och de sex dagarna före, singlar och
     album lika. Listans egna regler, där album syns i 30 dagar, gäller bara
     listan. */
  const VECKA = 6;
  /* En lugn vecka ska se lugn ut: ljuset delas med veckans största antal,
     men aldrig med mindre än sex. Ett enda släpp syns alltid lite. */
  const MINSTA_TAK = 6;
  const MINSTA_LJUS = 0.12;
  const ZON = 'Europe/Stockholm';

  function rakna(releaser){
    const antal = {};
    GENRER.forEach(g => { antal[g] = 0; });
    let summa = 0;
    (releaser || []).forEach(r => {
      const n = dagarFran(r.date);
      /* Skrivet så att ett släpp utan läsbart datum (NaN) inte räknas. */
      if (!(n >= -VECKA && n <= 0)) return;
      antal[normGenre(r.genre)]++;
      summa++;
    });
    return { summa, antal };
  }

  function langd(n, antal){
    if (!n) return 0;
    const storst = Math.max(MINSTA_TAK, ...GENRER.map(g => (antal && antal[g]) || 0));
    return Math.max(MINSTA_LJUS, n / storst);
  }

  /* Samma regel som sidfotens statusrad i ram.js, så att de två aldrig
     säger olika. Ett avbrott i status.json ändrar den inte: det betyder att
     kvoten tog slut under körningen, inte att inget uppdaterades. */
  function uppdateradText(st){
    if (!st || !st.uppdaterad) return '';
    const d = new Date(st.uppdaterad);
    if (isNaN(d)) return '';
    const dag = x => x.toLocaleDateString('sv-SE', { timeZone: ZON });
    const nar = dag(d) === dag(new Date()) ? 'idag'
              : dag(d) === dag(new Date(Date.now() - 864e5)) ? 'igår'
              : 'den ' + d.toLocaleDateString('sv-SE', { timeZone: ZON, day: 'numeric', month: 'long' });
    const klocka = d.toLocaleTimeString('sv-SE', { timeZone: ZON, hour: '2-digit', minute: '2-digit' });
    return 'Uppdaterad ' + nar + ' ' + klocka;
  }

  /* Det nyaste släppet som redan kommit ut. Vid samma datum vinner det som
     står först i listan, som i releaseraderna. */
  function senast(releaser){
    let basta = null;
    (releaser || []).forEach(r => {
      if (dagarFran(r.date) > 0) return;
      if (!basta || r.date > basta.date) basta = r;
    });
    return basta;
  }

  function markup(o){
    o = o || {};
    const bom = '<div class="rigg-bom" aria-hidden="true"></div>';
    /* Medan Försök igen hämtar syns det att något händer. Raden kan ta
       fokus, så att den som tryckte inte tappar sin plats på sidan. */
    if (o.laddar){
      return '<div class="rigg rigg-fel' + (o.kompakt ? ' rigg-kompakt' : '') + '">' + bom +
        '<p class="rigg-besked" role="status" tabindex="-1" data-fokus="laddar">Hämtar releaserna.</p></div>';
    }
    if (o.fel){
      return '<div class="rigg rigg-fel' + (o.kompakt ? ' rigg-kompakt' : '') + '">' + bom +
        '<p class="rigg-besked">Releaserna gick inte att hämta. ' +
        '<button class="chip rigg-forsok" type="button" data-genre="forsok">Försök igen</button></p></div>';
    }
    const { summa, antal } = rakna(o.releaser);
    const vald = GENRER.includes(o.vald) ? o.vald : null;
    const lampor = GENRER.map(g => {
      const n = antal[g];
      return '<button class="rigg-lampa" type="button" data-genre="' + g + '"' + (n ? '' : ' data-av') +
        ' style="--g:var(--' + g + ');--l:' + langd(n, antal).toFixed(3) + '"' +
        ' aria-pressed="' + (vald === g) + '" aria-label="' + GENRE_NAMN[g] + ', ' + n + ' släpp">' +
        '<span class="rigg-huvud" aria-hidden="true"></span>' +
        '<span class="rigg-kagla" aria-hidden="true"></span>' +
        '<b aria-hidden="true">' + n + '</b>' +
        '<span class="rigg-namn" aria-hidden="true">' + GENRE_NAMN[g] + '</span>' +
        '</button>';
    }).join('');
    const nytt = senast(o.releaser);
    const upp = uppdateradText(o.status);
    const lever = summa
      ? '<p class="rigg-lever">' +
          (upp ? '<span><i class="rigg-puls" aria-hidden="true"></i><b>' + upp + '</b></span>' : '') +
          (nytt ? '<span>Senast in: ' + esc(nytt.title || nytt.titel || '') + ', ' + esc(artister(nytt.artist)) + '</span>' : '') +
        '</p>'
      : '<p class="rigg-lever"><span>Inga släpp de senaste sju dagarna.</span></p>';
    return '<div class="rigg' + (vald ? ' har-val' : '') + (o.kompakt ? ' rigg-kompakt' : '') + '">' +
      '<div class="rigg-topp">' +
        '<span class="rigg-antal">' + summa + '</span>' +
        '<span class="rigg-text">släpp de senaste sju dagarna</span>' +
        '<button class="chip rigg-alla" type="button" data-genre="alla"' + (vald ? '' : ' hidden') + '>Visa alla</button>' +
      '</div>' +
      '<div class="rigg-ram">' + bom +
        '<div class="rigg-lampor" role="group" aria-label="Visa genre">' + lampor + '</div>' +
      '</div>' +
      lever +
    '</div>';
  }

  /* Ritar om hela riggen varje gång. Klicket fångas på behållaren, och
     valj får genren, 'alla' eller 'forsok'. Fokus står kvar på samma knapp
     efter omritningen. Finns den inte längre, som Visa alla efter ett tryck
     eller Försök igen när hämtningen lyckats, går fokus till första lampan,
     annars till det som står där i stället. Utan det kastades den som
     använder tangentbord eller skärmläsare upp till sidans början. */
  function rita(el, o){
    if (!el) return;
    const aktiv = document.activeElement;
    const nyckel = aktiv && el.contains(aktiv) ? (aktiv.dataset.genre || aktiv.dataset.fokus || null) : null;
    el.innerHTML = markup(o);
    if (nyckel){
      const mal = el.querySelector('[data-genre="' + nyckel + '"]:not([hidden])') ||
        el.querySelector('.rigg-lampa, .rigg-forsok, [data-fokus]');
      if (mal) mal.focus({ preventScroll: true });
    }
    el.onclick = e => {
      const k = e.target.closest('[data-genre]');
      if (k && o && typeof o.valj === 'function') o.valj(k.dataset.genre);
    };
  }

  window.hardlistRigg = { rakna, langd, markup, rita, uppdateradText };
})();
