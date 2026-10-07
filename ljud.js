/* Ljud från iTunes: avstängningen och raden om var förlyssningen kommer från.
   Laddas av låtspelet och quizet, och av allt annat som spelar förlyssningar.

   Avstängningen ligger i data/installningar.json och ändras för hand på
   GitHub, se CLAUDE.md. Går filen inte att läsa räknas ljudet som avstängt —
   en avstängning ska hålla även när något annat strular, hellre en pausad
   omgång än ljud som inte borde spelas. */
(function(){
  const ALLMAN_LANK = 'https://music.apple.com/se/';

  const tillatet = fetch('/data/installningar.json', { cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){ return !!(d && d.itunesLjud === true); })
    .catch(function(){ return false; });

  /* Apples villkor kräver att förlyssningar står intill deras märke och
     säger varifrån de kommer. Före svaret länkar raden till Apple Music i
     allmänhet — en länk till själva låten hade avslöjat svaret. */
  /* Märket är Apples eget, från deras marknadsföringsverktyg, och används
     som det är. Det är själva länken, så ingen textlänk behövs bredvid. */
  function kalla(lank){
    const href = typeof lank === 'string' && /^https:\/\/music\.apple\.com\//.test(lank) ? lank : ALLMAN_LANK;
    return '<div class="itunes-kalla">' +
      '<a class="apple-marke" href="' + href.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener">' +
        '<img src="/bilder/apple-music.svg" alt="Lyssna på Apple Music" width="141" height="41"></a>' +
      '<span>Förhandslyssning från iTunes</span></div>';
  }

  window.hardlistLjud = { tillatet: tillatet, kalla: kalla };
})();
