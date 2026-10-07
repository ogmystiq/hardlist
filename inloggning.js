/* Inloggning för hela hardlist.se. Laddas av varje sida.

   Supabase-klienten väger över 200 kB. De flesta besökare loggar aldrig in,
   så den hämtas bara när någon redan har en session sparad, trycker på
   Logga in, eller öppnar kontosidan. Övriga sidvisningar kostar ingenting.

   URL och publishable key är gjorda för att ligga öppet i sajtens kod —
   det är Row Level Security i databasen som skyddar datan, inte nyckeln. */
(function(){
  const PROJEKT_URL = 'https://oxblifknwwtehiscukeu.supabase.co';
  const PUBLIK_NYCKEL = 'sb_publishable_7abp-46Q7xtpWuJn-L7WuA_9vOKVNFo';

  /* Låst version med integritetskontroll. Byts filen ut på CDN:en vägrar
     webbläsaren köra den, hellre det än att köra okänd kod på sajten. */
  const BIBLIOTEK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
  const BIBLIOTEK_SRI = 'sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok';

  const SESSIONSNYCKEL = 'sb-oxblifknwwtehiscukeu-auth-token';
  // Namnet sparas lokalt så knappen visar rätt direkt, utan att blinka
  // "Logga in" medan klienten laddas.
  const NAMNNYCKEL = 'hardlist-visningsnamn';
  // Profilbilden sparas lokalt av samma skäl, med tidpunkten då den lästes,
  // så att servern bara behöver frågas igen när det gått en stund.
  const BILDNYCKEL = 'hardlist-profilbild';
  const BILD_GILTIG_MS = 10 * 60 * 1000;
  const BILD_BORJAN = PROJEKT_URL + '/storage/v1/object/public/profilbilder/';
  // sessionStorage: ska bara överleva rundturen via Google, inte längre.
  const TILLBAKANYCKEL = 'hardlist-tillbaka';

  const NAMNREGEL = /^[A-Za-zÅÄÖåäö0-9_-]{3,20}$/;

  function las(lager, nyckel){ try { return lager.getItem(nyckel); } catch(e){ return null; } }
  function skriv(lager, nyckel, varde){
    try { varde == null ? lager.removeItem(nyckel) : lager.setItem(nyckel, varde); } catch(e){}
  }

  let klientLofte = null;
  function klient(){
    if (klientLofte) return klientLofte;
    klientLofte = new Promise(function(ok, fel){
      if (window.supabase && window.supabase.createClient) return ok();
      const s = document.createElement('script');
      s.src = BIBLIOTEK;
      s.integrity = BIBLIOTEK_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = ok;
      s.onerror = function(){ klientLofte = null; fel(new Error('Kunde inte ladda inloggningen')); };
      document.head.appendChild(s);
    }).then(function(){
      return window.supabase.createClient(PROJEKT_URL, PUBLIK_NYCKEL, {
        auth: {
          // PKCE: Google skickar tillbaka en engångskod i stället för själva
          // nyckeln i adressfältet, där den kan hamna i historik och loggar.
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    });
    return klientLofte;
  }

  function harSparadSession(){ return !!las(localStorage, SESSIONSNYCKEL); }

  /* Badgesens utseende och popuper hämtas först när en sida har något att
     visa, så att de flesta sidvisningar slipper dem. Ändras badges.js eller
     badges.css ska datumet ändras här och i sidorna som laddar dem direkt. */
  const BADGE_VERSION = '2026-10-07e';
  let badgeLofte = null;
  function badges(){
    if (window.hardlistBadges) return Promise.resolve(window.hardlistBadges);
    if (badgeLofte) return badgeLofte;
    badgeLofte = new Promise(function(ok, fel){
      if (!document.querySelector('link[href^="/badges.css"]')){
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = '/badges.css?v=' + BADGE_VERSION;
        document.head.appendChild(l);
      }
      const s = document.createElement('script');
      s.src = '/badges.js?v=' + BADGE_VERSION;
      s.onload = function(){ ok(window.hardlistBadges); };
      s.onerror = function(){ badgeLofte = null; fel(new Error('Kunde inte ladda badges')); };
      document.head.appendChild(s);
    });
    return badgeLofte;
  }

  async function session(){
    const k = await klient();
    const { data } = await k.auth.getSession();
    return data.session;
  }

  /* Anrop till databasfunktionerna, till exempel quizet. Utan sparad session
     räcker vanlig fetch med den publika nyckeln, så att den som aldrig loggar
     in inte behöver ladda klienten bara för att svara på dagens fråga. */
  async function rpc(namn, arg){
    if (harSparadSession()){
      const k = await klient();
      const { data, error } = await k.rpc(namn, arg || {});
      if (error) throw error;
      return data;
    }
    const r = await fetch(PROJEKT_URL + '/rest/v1/rpc/' + namn, {
      method: 'POST',
      headers: { apikey: PUBLIK_NYCKEL, 'Content-Type': 'application/json' },
      body: JSON.stringify(arg || {})
    });
    if (!r.ok) throw new Error('status ' + r.status);
    return r.json();
  }

  async function profil(anvandarId){
    const k = await klient();
    const { data, error } = await k.from('profiler')
      .select('visningsnamn, skapad')
      .eq('id', anvandarId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // Bara egna sökvägar. En adress utifrån här skulle göra inloggningen till
  // en öppen vidarebefordran.
  function sakerSokvag(s){
    return typeof s === 'string' && s.charAt(0) === '/' && s.charAt(1) !== '/' && s.charAt(1) !== '\\';
  }

  async function loggaIn(){
    const har = location.pathname + location.search + location.hash;
    if (location.pathname !== '/konto/' && sakerSokvag(har)) skriv(sessionStorage, TILLBAKANYCKEL, har);
    const k = await klient();
    const { error } = await k.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + '/konto/' }
    });
    if (error) throw error;
  }

  /* Till kontosidan för att välja visningsnamn, och tillbaka hit efteråt.
     Samma återvägsnyckel som efter Google, så kontosidan skickar tillbaka
     utan att behöva veta varifrån personen kom. */
  function valjNamn(){
    const har = location.pathname + location.search + location.hash;
    if (location.pathname !== '/konto/' && sakerSokvag(har)) skriv(sessionStorage, TILLBAKANYCKEL, har);
    location.href = '/konto/';
  }

  function tillbaka(){
    const s = las(sessionStorage, TILLBAKANYCKEL);
    skriv(sessionStorage, TILLBAKANYCKEL, null);
    return sakerSokvag(s) ? s : null;
  }

  async function loggaUt(){
    const k = await klient();
    await k.auth.signOut({ scope: 'local' });
    sparaNamn(null);
  }

  function sparaNamn(namn){
    skriv(localStorage, NAMNNYCKEL, namn);
    if (!namn) skriv(localStorage, BILDNYCKEL, null);
    visaKnapp(namn ? { namn: namn, bild: sparadBild().url } : null);
  }

  /* Bara adresser i den egna bucketen visas, aldrig något annat som råkar
     ligga i webbläsarens lagring. */
  function sparadBild(){
    try {
      const b = JSON.parse(las(localStorage, BILDNYCKEL) || 'null');
      if (b && (b.url === null || (typeof b.url === 'string' && b.url.indexOf(BILD_BORJAN) === 0))) return b;
    } catch(e){}
    return { url: null, tid: 0 };
  }
  function sparaBild(url){
    skriv(localStorage, BILDNYCKEL, JSON.stringify({ url: url || null, tid: Date.now() }));
    const namn = las(localStorage, NAMNNYCKEL);
    if (namn) visaKnapp({ namn: namn, bild: url || null });
  }

  /* ---------- knappen i headern ---------- */
  function knapp(){ return document.getElementById('konto-knapp'); }

  function visaKnapp(lage){
    const a = knapp();
    if (!a) return;
    a.href = '/konto/';
    a.classList.remove('inloggad', 'med-bild');
    // Nya designen har bild och namn i egna delar, gamla sidor bara text.
    // Båda måste fungera tills alla sidor är ombyggda.
    const namnDel = a.querySelector('.konto-namn');
    const bildDel = a.querySelector('.konto-bild');
    const text = !lage ? 'Logga in' : (lage.namn || 'Välj namn');
    if (namnDel) namnDel.textContent = text; else a.textContent = text;
    if (bildDel){
      bildDel.textContent = lage && lage.namn ? lage.namn.charAt(0).toUpperCase() : '';
      // Profilbilden i stället för initialen när det finns en.
      if (lage && lage.namn && lage.bild && lage.bild.indexOf(BILD_BORJAN) === 0){
        const img = document.createElement('img');
        img.src = lage.bild;
        img.alt = '';
        img.width = 36; img.height = 36;
        img.onerror = function(){ bildDel.textContent = lage.namn.charAt(0).toUpperCase(); };
        bildDel.textContent = '';
        bildDel.appendChild(img);
      }
    }
    if (!lage){
      a.removeAttribute('title');
      return;
    }
    a.classList.add('inloggad');
    if (bildDel && lage.namn) a.classList.add('med-bild');
    a.title = lage.namn ? 'Ditt konto' : 'Välj visningsnamn';
  }

  async function uppdateraKnapp(){
    if (!harSparadSession()){ sparaNamn(null); return; }
    visaKnapp({ namn: las(localStorage, NAMNNYCKEL), bild: sparadBild().url });
    try {
      const s = await session();
      if (!s){ sparaNamn(null); return; }
      const p = await profil(s.user.id);
      sparaNamn(p ? p.visningsnamn : null);
      if (!p){ visaKnapp({ namn: null }); return; }
      // Bilden frågas efter högst var tionde minut. Kontosidan sparar den
      // direkt när den byts.
      if (Date.now() - sparadBild().tid > BILD_GILTIG_MS){
        const min = await rpc('profil_min');
        if (min && !min.fel) sparaBild(min.bild_egen || null);
      }
    } catch(e){
      // Nätet borta eller Supabase nere: behåll det sparade namnet hellre än
      // att påstå att personen är utloggad.
    }
  }

  function koppla(){
    const a = knapp();
    if (a){
      a.addEventListener('click', function(e){
        // Inloggad, eller redan på kontosidan: vanlig länk.
        if (a.classList.contains('inloggad') || location.pathname === '/konto/') return;
        e.preventDefault();
        a.setAttribute('aria-busy', 'true');
        loggaIn().catch(function(){
          // Går inte klienten att ladda tar kontosidan över och visar felet.
          location.href = '/konto/';
        });
      });
    }
    // Kontosidan sköter knappen själv, annars krockar två samtidiga
    // inläsningar av samma session när Google precis skickat tillbaka koden.
    if (location.pathname !== '/konto/') uppdateraKnapp().then(visaOsedda);
    else setTimeout(visaOsedda, 1500);
  }

  /* Badges som popupen inte har visat än, till exempel de som delades ut
     när månaden tog slut. Varje badge visas en gång och markeras som sedd
     direkt, så att den inte kommer igen på nästa sida. Ett fel här ska
     aldrig synas, då kommer popupen nästa gång i stället. */
  let oseddaKollad = false;
  async function visaOsedda(){
    if (oseddaKollad || !harSparadSession()) return;
    oseddaKollad = true;
    try {
      const lista = await rpc('profil_osedda');
      if (!Array.isArray(lista) || !lista.length) return;
      // Utseendet först, så att inget markeras som sett utan att ha visats.
      const B = await badges();
      await rpc('profil_sedda', { p_ids: lista.map(function(x){ return x.id; }) });
      B.visaNya(lista);
    } catch(e){}
  }

  window.hardlistKonto = {
    // Utan att ladda klienten: finns en sparad inloggning i webbläsaren?
    // Startsidan frågar bara quizservern om kontot när svaret är ja.
    inloggad: harSparadSession,
    klient: klient,
    session: session,
    rpc: rpc,
    profil: profil,
    badges: badges,
    loggaIn: loggaIn,
    loggaUt: loggaUt,
    tillbaka: tillbaka,
    valjNamn: valjNamn,
    sparaNamn: sparaNamn,
    sparaBild: sparaBild,
    visaKnapp: visaKnapp,
    NAMNREGEL: NAMNREGEL
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', koppla);
  else koppla();
})();
