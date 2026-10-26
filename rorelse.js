/* Rörelsen som delas av flera sidor: uppräkning, puls i 150 BPM, mjukt byte
   av listor, svaren i spelen och firandet av en ny rang.

   Spelens egna skript ändras inte. Det här skriptet lyssnar efter det de
   redan ritar (.q-utfall ja/nej, .q-plus, raden "till rangen", [data-svit])
   och lägger rörelsen ovanpå. Allt ligger i en funktion och bara
   window.hardlistRorelse blir globalt, eftersom rader.js och sidornas
   skript delar namnrymd.

   Med prefers-reduced-motion står allt still: siffrorna visas direkt och
   inga klasser för rörelse sätts. Rangfirandet visas ändå, utan rörelse. */
(function(){
  const TAKT = 400;
  /* Klasserna för rörelse räknas inte, annars blir varje puls ett nytt svar. */
  const RORELSE = /\b(puls|puls-en|skak|flyg-upp|blixt|slar-upp)\b/g;
  const RANGER = ['Nybörjare', 'Raver', 'Frontrow', 'Hardhead', 'Hakker', 'Gabber', 'Oldschool', 'Legend'];
  const stilla = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return true; } };
  const tal = n => Number(n).toLocaleString('sv-SE', { maximumFractionDigits: 1 });
  const lasTal = s => Number(String(s).replace(/[^\d,.-]/g, '').replace(',', '.'));

  /* Startar om en CSS-animation, så att samma klass kan spelas igen. */
  function spela(el, klass){
    if (!el || stilla()) return;
    el.classList.remove(klass);
    void el.offsetWidth;
    el.classList.add(klass);
    el.addEventListener('animationend', function klar(e){
      if (e.target !== el) return;
      el.classList.remove(klass);
      el.removeEventListener('animationend', klar);
    });
  }

  /* Räknar upp ett tal på 400 ms. Texten runt talet står kvar. Medan det
     räknas är elementet låst, så att bevakningen nedan inte tar varje nytt
     tal för ett nytt svar. */
  function raknaUpp(el, till, fore, efter){
    if (!el) return;
    const slut = (fore || '') + tal(till) + (efter || '');
    const klar = () => {
      el.textContent = slut;
      el.dataset.rSett = el.className.replace(RORELSE, '').trim() + '|' + slut + '|' + (el.dataset.svit || '');
      delete el.dataset.rLas;
    };
    if (stilla() || !(till > 0)){ klar(); return; }
    el.dataset.rLas = '1';
    const start = performance.now();
    const decimal = Math.round(till) !== till;
    const steg = nu => {
      const k = Math.min(1, (nu - start) / TAKT), e = 1 - Math.pow(1 - k, 3);
      const v = till * e;
      if (k < 1){
        el.textContent = (fore || '') + tal(decimal ? Math.round(v * 10) / 10 : Math.round(v)) + (efter || '');
        requestAnimationFrame(steg);
      } else klar();
    };
    requestAnimationFrame(steg);
  }

  /* En lista som byter innehåll tonar in i stället för att hoppa. */
  function byt(el){
    if (!el || stilla() || !el.animate) return;
    el.animate([{ opacity: .3, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 220, easing: 'cubic-bezier(.33,1,.68,1)' });
  }

  /* ---------- Spelen ---------- */

  /* Blixten tar genrens färg där spelet har en genre (fritt spel och
     rankat), annars färgen för rätt svar. Blandat har ingen genre. */
  function blixtFarg(el){
    const fs = el.closest('.fs');
    if (fs && fs.dataset.genre && fs.dataset.genre !== 'blandat'){
      const g = getComputedStyle(fs).getPropertyValue('--g').trim();
      if (g) return g;
    }
    return getComputedStyle(document.documentElement).getPropertyValue('--ratt').trim();
  }

  const SVAR = '.q-utfall, .q-plus, .fs-rang-tal, .q-nasta, [data-svit]';
  /* Svaren animeras bara som svar på något man gjort: ett tryck eller en
     tangent nyss. Ritas facit om vid en omladdning står det still. */
  let senast = 0;
  ['pointerdown', 'keydown'].forEach(h => document.addEventListener(h, () => { senast = Date.now(); }, true));
  const nyssGjort = () => Date.now() - senast < 8000;

  function svar(el){
    if (el.dataset.rLas) return;
    if (el.matches('[data-svit]')){ svit(el); return; }
    const nu = el.className.replace(RORELSE, '').trim() + '|' + el.textContent + '|' + (el.dataset.svit || '');
    if (el.dataset.rSett === nu) return;
    el.dataset.rSett = nu;
    if (!nyssGjort()) return;
    const text = el.textContent.trim();

    if (el.matches('.q-utfall.ja')){
      const ruta = el.closest('.fs-facit, .ruta, .l-kort, .q-kort, .rk-res') || el.parentElement;
      ruta.style.setProperty('--blixt', blixtFarg(el));
      spela(ruta, 'blixt');
      spela(el, 'puls');
    } else if (el.matches('.q-utfall.nej')){
      /* Quizet skakar redan det felaktiga alternativet. Två skakningar blir
         för mycket. */
      if (!el.closest('.anim')) spela(el, 'skak');
    } else if (el.matches('.q-plus') && /^\+/.test(text)){
      raknaUpp(el, lasTal(text), '+');
      spela(el, 'puls');
    } else if ((el.matches('.fs-rang-tal') && /^\+/.test(text)) ||
               (el.matches('.q-nasta') && /^\+.*till rangen/.test(text))){
      spela(el, 'flyg-upp');
      setTimeout(() => spela(el, 'puls-en'), TAKT);
    }
  }

  /* Flamman slår upp när sviten är längre än förra gången den syntes i det
     här besöket eller ett tidigare. Första gången sparas bara värdet. */
  function svit(el){
    const nyckel = 'hardlist_svit_' + (el.dataset.svitNyckel || location.pathname);
    const nu = Number(el.dataset.svit) || 0;
    let forut = null;
    try { forut = localStorage.getItem(nyckel); localStorage.setItem(nyckel, String(nu)); } catch(e){}
    if (forut !== null && nu > Number(forut)) spela(el.querySelector('.svit-flamma'), 'slar-upp');
  }

  function bevaka(){
    const kolla = rot => {
      if (!(rot instanceof Element)) return;
      if (rot.matches(SVAR)) svar(rot);
      rot.querySelectorAll(SVAR).forEach(svar);
    };
    kolla(document.body);
    new MutationObserver(lista => {
      lista.forEach(m => {
        if (m.type === 'childList'){
          m.addedNodes.forEach(kolla);
          const t = m.target instanceof Element && m.target.closest(SVAR);
          if (t) svar(t);
        } else if (m.target instanceof Element && m.target.matches(SVAR)){
          svar(m.target);
        }
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-svit'] });
  }

  /* ---------- Ny rang ---------- */

  /* Sidorna som vet kontots rang anropar rang(). Är den högre än den som
     syntes senast i den här webbläsaren visas firandet. Inget sparas på
     servern. Byter någon konto i samma webbläsare kan firandet komma för
     den andras rang, och det är priset för att inget behöver ändras i
     databasen. */
  function rang(namn){
    const ny = RANGER.indexOf(namn);
    if (ny < 0) return;
    let forut = null;
    try { forut = localStorage.getItem('hardlist_rang'); localStorage.setItem('hardlist_rang', namn); } catch(e){ return; }
    const gammal = RANGER.indexOf(forut);
    if (!(forut !== null && gammal >= 0 && ny > gammal)) return;
    /* Kom rangen av ett svar nyss får svarets egen rörelse landa först, i
       tre slag. Annars visas firandet direkt. */
    if (nyssGjort()) setTimeout(() => fira(namn), TAKT * 3);
    else fira(namn);
  }

  function fira(namn){
    if (document.querySelector('.rang-fira')) return;
    const forra = document.activeElement;
    const lager = document.createElement('div');
    lager.className = 'rang-fira';
    lager.setAttribute('role', 'dialog');
    lager.setAttribute('aria-modal', 'true');
    lager.setAttribute('aria-labelledby', 'rangFiraNamn');
    const stralar = [-34, -17, 0, 17, 34].map(v => '<i class="rang-fira-stral" style="--v:' + v + 'deg"></i>').join('');
    lager.innerHTML = '<div class="rang-fira-inne">' +
      '<span class="rang-fira-over">Ny rang</span>' +
      '<span class="rang-fira-scen" aria-hidden="true">' + stralar + '<span class="rang-fira-blixt"></span></span>' +
      '<h2 class="rang-fira-namn" id="rangFiraNamn">' + namn + '</h2>' +
      '<p class="rang-fira-text">Poängen från alla spel räknas ihop, och nu räcker de till ' + namn + '.</p>' +
      '<button class="knapp rang-fira-knapp" type="button">Fortsätt</button>' +
      '</div>';
    /* Sidan bakom görs inert, så att Tab och skärmläsaren stannar i
       firandet tills det stängs. */
    const bakom = [...document.body.children].filter(el => el !== lager && !el.inert);
    const stang = () => {
      bakom.forEach(el => { el.inert = false; });
      lager.remove();
      document.documentElement.classList.remove('rang-last');
      document.removeEventListener('keydown', tangent);
      if (forra && forra.focus) forra.focus({ preventScroll: true });
    };
    const tangent = e => { if (e.key === 'Escape') stang(); };
    lager.querySelector('button').addEventListener('click', stang);
    document.addEventListener('keydown', tangent);
    document.documentElement.classList.add('rang-last');
    document.body.appendChild(lager);
    bakom.forEach(el => { el.inert = true; });
    lager.querySelector('button').focus({ preventScroll: true });
  }

  /* ---------- Spelknappen i takt med klippet ---------- */

  /* Spelen skapar sina spelare med new Audio() utan att lägga dem i sidan,
     så deras händelser når aldrig dokumentet. Varje spelare kopplas därför
     första gången den startas. Medan ljudet går sätts .ljud-spelar på sidan,
     och spelknappen pulsar i 150 BPM. Den slutar när ljudet slutar. */
  if (typeof HTMLMediaElement !== 'undefined'){
    const kopplade = new WeakSet();
    const spelande = new Set();
    const satt = () => document.documentElement.classList.toggle('ljud-spelar', spelande.size > 0);
    const koppla = a => {
      if (kopplade.has(a)) return;
      kopplade.add(a);
      a.addEventListener('playing', () => { spelande.add(a); satt(); });
      ['pause', 'ended', 'emptied', 'error'].forEach(h => a.addEventListener(h, () => { spelande.delete(a); satt(); }));
    };
    const spela0 = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(){ koppla(this); return spela0.apply(this, arguments); };
  }

  window.hardlistRorelse = { stilla, spela, raknaUpp, byt, rang, fira };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bevaka);
  else bevaka();
})();
