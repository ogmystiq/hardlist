/* Statusraden i sidfoten, gemensam för alla sidor.

   Siffrorna läses ur data/status.json i stället för att stå i markupen,
   så att de aldrig kan bli inaktuella. Går filen inte att läsa står den
   allmänna texten ur markupen kvar. Antalet är listans storlek (artister),
   inte antalet cachade ID:n (cachade). Cachen kan vara större än listan,
   och det var därför den gamla sidfoten kunde visa "331 av 316". */
(function(){
  const ruta = document.getElementById('sidfotStatus');
  if (!ruta) return;

  // Morgonkörningen går efter svensk tid, så "idag" måste räknas likadant
  // oavsett var besökaren befinner sig.
  const ZON = 'Europe/Stockholm';
  const dag = d => d.toLocaleDateString('sv-SE', { timeZone: ZON });

  fetch('/data/status.json', { cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(st){
      if (!st || !st.uppdaterad) return;
      const d = new Date(st.uppdaterad);
      if (isNaN(d)) return;
      const nar = dag(d) === dag(new Date()) ? 'idag'
                : dag(d) === dag(new Date(Date.now() - 864e5)) ? 'igår'
                : 'den ' + d.toLocaleDateString('sv-SE', { timeZone: ZON, day: 'numeric', month: 'long' });
      const klocka = d.toLocaleTimeString('sv-SE', { timeZone: ZON, hour: '2-digit', minute: '2-digit' });
      let text = 'Releaserna uppdaterades ' + nar + ' ' + klocka + '.';
      if (Number.isFinite(st.artister)) text += ' ' + st.artister + ' artister bevakas.';
      ruta.textContent = text;
    })
    .catch(function(){});
})();
