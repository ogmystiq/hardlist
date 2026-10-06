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
    visaKnapp(namn ? { namn: namn } : null);
  }

  /* ---------- knappen i headern ---------- */
  function knapp(){ return document.getElementById('konto-knapp'); }

  function visaKnapp(lage){
    const a = knapp();
    if (!a) return;
    a.href = '/konto/';
    a.classList.remove('inloggad');
    if (!lage){
      a.textContent = 'Logga in';
      a.removeAttribute('title');
      return;
    }
    a.classList.add('inloggad');
    a.textContent = lage.namn || 'Välj namn';
    a.title = lage.namn ? 'Ditt konto' : 'Välj visningsnamn';
  }

  async function uppdateraKnapp(){
    if (!harSparadSession()){ sparaNamn(null); return; }
    visaKnapp({ namn: las(localStorage, NAMNNYCKEL) });
    try {
      const s = await session();
      if (!s){ sparaNamn(null); return; }
      const p = await profil(s.user.id);
      sparaNamn(p ? p.visningsnamn : null);
      if (!p) visaKnapp({ namn: null });
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
    if (location.pathname !== '/konto/') uppdateraKnapp();
  }

  window.hardlistKonto = {
    klient: klient,
    session: session,
    rpc: rpc,
    profil: profil,
    loggaIn: loggaIn,
    loggaUt: loggaUt,
    tillbaka: tillbaka,
    valjNamn: valjNamn,
    sparaNamn: sparaNamn,
    visaKnapp: visaKnapp,
    NAMNREGEL: NAMNREGEL
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', koppla);
  else koppla();
})();
