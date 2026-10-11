/* Profilens delar, delade av /konto/ och /profil/: huvudet med bild och
   namn, rangen, siffrorna, badge-rutnätet och arken som glider upp nerifrån.

   Allt nås genom window.hardlistProfil, så att inget namn krockar med sidans
   eget skript. Kräver /badges.js. Servern avgör vem som har vilken badge,
   här ritas bara det den svarar. */
(function(){
  'use strict';
  const B = window.hardlistBadges;

  function esc(s){
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Poäng kan ha en decimal, till exempel 0,4 från fritt spel.
  function tal(n){ return Number(n || 0).toLocaleString('sv-SE', { maximumFractionDigits: 1 }); }
  function datum(iso){
    try { return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch(e){ return ''; }
  }
  function manad(iso){
    try { return new Date(iso).toLocaleDateString('sv-SE', { month: 'long', timeZone: 'Europe/Stockholm' }); }
    catch(e){ return ''; }
  }
  function manadAr(iso){
    try { return new Date(iso).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric', timeZone: 'Europe/Stockholm' }); }
    catch(e){ return ''; }
  }
  function initial(namn){ return String(namn || '?').charAt(0).toUpperCase(); }

  /* Bilden, eller initialen när det inte finns någon. */
  function bildHtml(url, namn){
    return url
      ? '<img src="' + esc(url) + '" alt="" width="512" height="512" decoding="async">'
      : esc(initial(namn));
  }

  /* ---------- arket ---------- */

  let oppet = null;

  /* Ett ark som glider upp nerifrån. Fokus stannar i arket, Escape och
     fonden stänger, och fokus går tillbaka dit det var. */
  function ark(etikett, html, koppla){
    if (oppet) oppet();
    const forut = document.activeElement;
    const lager = document.createElement('div');
    lager.className = 'ark-lager';
    lager.innerHTML = '<button class="ark-fond" type="button" aria-label="Stäng"></button>' +
      '<div class="ark" role="dialog" aria-modal="true" aria-label="' + esc(etikett) + '">' +
      '<span class="ark-greppe" aria-hidden="true"></span>' + html + '</div>';
    const ruta = lager.querySelector('.ark');

    function stang(){
      document.removeEventListener('keydown', tangent, true);
      document.documentElement.classList.remove('ark-last');
      lager.remove();
      oppet = null;
      if (forut && forut.focus) forut.focus({ preventScroll: true });
    }
    function tangent(e){
      if (e.key === 'Escape'){ e.preventDefault(); stang(); return; }
      if (e.key !== 'Tab') return;
      const fokus = Array.prototype.filter.call(
        ruta.querySelectorAll('button, a[href], input, [tabindex="0"]'),
        function(el){ return !el.disabled && el.offsetParent !== null; }
      );
      if (!fokus.length) return;
      const forsta = fokus[0], sista = fokus[fokus.length - 1];
      if (e.shiftKey && document.activeElement === forsta){ e.preventDefault(); sista.focus(); }
      else if (!e.shiftKey && document.activeElement === sista){ e.preventDefault(); forsta.focus(); }
    }

    lager.querySelector('.ark-fond').addEventListener('click', stang);
    lager.querySelectorAll('[data-stang]').forEach(function(k){ k.addEventListener('click', stang); });
    document.addEventListener('keydown', tangent, true);
    document.documentElement.classList.add('ark-last');
    document.body.appendChild(lager);
    oppet = stang;
    if (koppla) koppla(ruta, stang);
    const forsta = ruta.querySelector('[data-forst]') || ruta.querySelector('button, a[href]');
    if (forsta) forsta.focus({ preventScroll: true });
    return stang;
  }

  /* ---------- badges ---------- */

  function tagenMap(p){
    const m = {};
    (p.badges || []).forEach(function(x){ m[x.id] = x.tagen; });
    return m;
  }

  /* En unik badge, som Grundaren, finns bara på den profil som har den och
     står då först. Sedan tagna i den ordning de togs, påbörjade, inte
     påbörjade, hemliga och sist de som kommer senare. */
  function ordning(p){
    const tagna = tagenMap(p);
    const fr = p.framsteg || {};
    const grupp = function(b){
      if (b.unik) return -1;
      if (tagna[b.id]) return 0;
      if (b.kommer) return 4;
      if (b.hemlig) return 3;
      return b.mal && fr[b.id] > 0 ? 1 : 2;
    };
    return B.BADGES.filter(function(b){ return !b.unik || tagna[b.id]; })
      .map(function(b, i){ return { b: b, g: grupp(b), i: i }; })
      .sort(function(x, y){
        if (x.g !== y.g) return x.g - y.g;
        if (x.g === 0) return String(tagna[x.b.id]).localeCompare(String(tagna[y.b.id]));
        return x.i - y.i;
      })
      .map(function(x){ return x.b; });
  }

  function framsteg(p, b){
    const v = (p.framsteg || {})[b.id];
    return typeof v === 'number' && b.mal ? Math.min(v, b.mal) : null;
  }

  /* "4 % av spelarna har den." bara på riktiga siffror från servern. */
  function andelText(p, b, tagen){
    if (b.kommer || b.unik || (b.hemlig && !tagen)) return '';
    const a = (p.andelar || {})[b.id];
    if (!a) return '';
    if (!a.antal) return 'Ingen har tagit den än.';
    if (a.andel < 1) return 'Under 1 % av spelarna har den.';
    return a.andel + ' % av spelarna har den.';
  }

  function badgeArk(p, id){
    const b = B.hitta(id);
    if (!b) return;
    const tagen = tagenMap(p)[id];
    const u = B.utseende(b, !!tagen);
    const v = tagen ? null : framsteg(p, b);
    let status;
    if (tagen) status = 'Tagen ' + datum(tagen) + '.';
    else if (b.kommer) status = 'Kommer med nya låtspelet och fritt spel.';
    else if (b.hemlig) status = 'Hemlig. Visas när du har tagit den.';
    else status = 'Inte tagen än.';
    const andel = andelText(p, b, !!tagen);
    const stapel = v === null ? '' :
      '<div class="pf-stapel-rad"><div class="pf-stapel"><i style="width:' + Math.round(100 * v / b.mal) + '%"></i></div>' +
      '<span>' + tal(v) + ' av ' + tal(b.mal) + ' ' + esc(b.enhet || '') + '</span></div>';
    ark(u.namn,
      '<div class="ark-badge bm-yta">' + B.medaljHtml(b, !!tagen, 76) +
        '<span class="ark-badge-namn"><span class="ark-rubrik">' + esc(u.namn) + '</span>' +
        '<span class="ark-niva">' + esc(b.hemlig && !tagen ? 'Hemlig' : b.niva) + '</span></span></div>' +
      '<p class="ark-text">' + esc(u.text) + '</p>' + stapel +
      '<div class="ark-fakta"><span>' + esc(status) + '</span>' + (andel ? '<span>' + esc(andel) + '</span>' : '') + '</div>' +
      '<button class="knapp knapp-sek ark-knapp" type="button" data-stang data-forst>Stäng</button>'
    );
  }

  /* Rutnätet. "2 av 7" under en badge som inte är tagen, "Snart" under en
     som kommer senare. */
  function rutnat(el, p){
    const tagna = tagenMap(p);
    el.innerHTML = ordning(p).map(function(b){
      const tagen = !!tagna[b.id];
      const u = B.utseende(b, tagen);
      const v = tagen ? null : framsteg(p, b);
      const under = b.kommer ? 'Snart' : (v !== null ? tal(v) + ' av ' + tal(b.mal) : '');
      const etikett = u.namn + (tagen ? ', tagen' : (b.kommer ? ', kommer senare' : ', inte tagen'));
      return '<button class="pf-badge bm-yta' + (tagen ? ' tagen' : '') + '" type="button" data-badge="' + esc(b.id) + '" aria-label="' + esc(etikett) + '">' +
        B.medaljHtml(b, tagen, 58) +
        '<span class="pf-badge-namn">' + esc(u.namn) + '</span>' +
        (under ? '<span class="pf-badge-under">' + esc(under) + '</span>' : '') +
        '</button>';
    }).join('');
    el.querySelectorAll('[data-badge]').forEach(function(k){
      k.addEventListener('click', function(){ badgeArk(p, k.getAttribute('data-badge')); });
    });
  }

  /* Unika räknas inte, varken bland de tagna eller i totalen. */
  function antalTagna(p){
    const giltiga = (p.badges || []).filter(function(x){ const b = B.hitta(x.id); return b && !b.unik; });
    return giltiga.length + ' av ' + B.BADGES.filter(function(b){ return !b.unik; }).length;
  }

  /* ---------- huvudet, rangen och siffrorna ---------- */

  /* opt.egen: knapparna Byt bild och Badge vid namnet, och kameran på bilden.
     opt.bytBild och opt.valjBadge anropas när de trycks. */
  function huvud(el, p, opt){
    opt = opt || {};
    const b = p.badge && B.hitta(p.badge);
    const bild = opt.egen ? (p.bild_egen || p.bild) : p.bild;
    const namnTagg = opt.namnTagg || 'h1';
    const bildDel = '<span class="pf-bild-inre">' + bildHtml(bild, p.namn) + '</span>';
    el.innerHTML =
      (opt.egen
        ? '<button class="pf-bild" type="button" data-bild aria-label="Byt profilbild">' + bildDel +
          '<span class="pf-kamera" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span></button>'
        : '<span class="pf-bild">' + bildDel + '</span>') +
      '<div class="pf-namnrad"><' + namnTagg + ' class="pf-namn">' + esc(p.namn) + '</' + namnTagg + '>' +
        (b ? '<button class="pf-badgeknapp bm-yta" type="button" data-namnbadge aria-label="Badge vid namnet: ' + esc(b.namn) + '">' + B.medaljHtml(b, true, 32) + '</button>' : '') +
      '</div>' +
      '<span class="pf-rang">' + esc(p.rang) + ', ' + tal(p.poang) + ' poäng</span>' +
      '<div class="pf-chips">' +
        (p.plats ? '<span class="pf-chip">Plats ' + tal(p.plats) + ' i ' + esc(manad(p.manad)) + '</span>' : '') +
        '<span class="pf-chip pf-chip-svag">Med sedan ' + esc(manadAr(p.sedan)) + '</span>' +
      '</div>' +
      (opt.egen
        ? '<div class="pf-knappar"><button class="pf-pill" type="button" data-bild>Byt bild</button>' +
          '<button class="pf-pill" type="button" data-valj>Badge vid namnet</button></div>'
        : '');
    el.querySelectorAll('[data-bild]').forEach(function(k){ k.addEventListener('click', function(){ if (opt.bytBild) opt.bytBild(); }); });
    const valj = el.querySelector('[data-valj]');
    if (valj) valj.addEventListener('click', function(){ if (opt.valjBadge) opt.valjBadge(); });
    const nb = el.querySelector('[data-namnbadge]');
    if (nb) nb.addEventListener('click', function(){
      if (opt.egen && opt.valjBadge) opt.valjBadge(); else badgeArk(p, p.badge);
    });
  }

  /* Rangen som huvudsak: stor rang, poängen, nästa rang som mål och en tjock
     förloppsrad. Placeringarna är två små siffror med etikett. */
  function plats(p){
    const s = p.statistik;
    if (!s || (!s.plats_total && !s.basta_manad_plats)) return '';
    const ruta = function(etikett, varde, under){
      return '<div class="pn-plats-ruta"><dd>' + tal(varde) + '</dd><dt>' + etikett + '</dt>' +
        (under ? '<small>' + esc(under) + '</small>' : '') + '</div>';
    };
    return '<dl class="pn-plats">' +
      (s.plats_total ? ruta('Totalt plats', s.plats_total) : '') +
      (s.basta_manad_plats ? ruta('Bästa månadsplats', s.basta_manad_plats, manad(s.basta_manad)) : '') +
      '</dl>';
  }

  function nasta(el, p){
    el.className = 'pf-nasta pn';
    const hogsta = !p.nasta_rang;
    const spann = hogsta ? 1 : Math.max(1, p.nasta_grans - p.rang_fran);
    const andel = hogsta ? 100 : Math.max(0, Math.min(100, Math.round(100 * (p.poang - p.rang_fran) / spann)));
    el.innerHTML =
      '<div class="pn-huvud">' +
        '<div class="pn-rang"><span class="pf-etikett">Rang</span>' +
          '<span class="pn-namn">' + esc(p.rang) + '</span>' +
          '<span class="pn-poang">' + tal(p.poang) + ' poäng</span></div>' +
        plats(p) +
      '</div>' +
      '<div class="pn-mal">' +
        '<p class="pn-text">' + (hogsta
          ? 'Högsta rangen.'
          : '<b>' + tal(p.kvar) + ' poäng</b> kvar till ' + esc(p.nasta_rang)) + '</p>' +
        '<div class="pn-stapel" role="img" aria-label="' + (hogsta ? 'Högsta rangen nådd' : andel + ' procent av vägen till ' + esc(p.nasta_rang)) + '"><i style="width:' + andel + '%"></i></div>' +
        (hogsta ? '' : '<div class="pn-grans"><span>' + esc(p.rang) + ' ' + tal(p.rang_fran) + '</span><span>' + esc(p.nasta_rang) + ' ' + tal(p.nasta_grans) + '</span></div>') +
      '</div>';
  }

  /* Statistik per spel, ett kort vardera. Allt räknas på servern ur det som
     redan sparas, och visar aldrig något om dagens fråga eller låt. */
  const FLAMMA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>';
  const SPELIKON = {
    fraga: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg>',
    lat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    fritt: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
  };
  const KLIPPTEXT = ['0,5 s', '1 s', '3 s', '7 s', '15 s'];
  const GENRENAMN = { hardstyle: 'Hardstyle', raw: 'Raw', uptempo: 'Uptempo', hardcore: 'Hardcore', techno: 'Hard techno' };

  function proc(ratt, spelade){ return spelade ? Math.round(100 * ratt / spelade) : 0; }

  /* Träffprocenten som en ring. Stillastående, ritad med dasharray. */
  function ring(ratt, spelade){
    const pr = proc(ratt, spelade);
    return '<div class="ps-ring" role="img" aria-label="Träff ' + (spelade ? pr + ' procent' : 'saknas') + '">' +
      '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ps-ring-spar" cx="18" cy="18" r="15.915" fill="none" stroke-width="4"/>' +
      (spelade && pr > 0 ? '<circle class="ps-ring-fyll" cx="18" cy="18" r="15.915" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + pr + ' 100" transform="rotate(-90 18 18)"/>' : '') +
      '</svg><b>' + (spelade ? pr : '–') + '<small>%</small></b><span>Träff</span></div>';
  }

  function stora(spelade, ratt){
    const siffra = function(etikett, varde){ return '<div class="ps-siffra"><b>' + tal(varde) + '</b><span>' + etikett + '</span></div>'; };
    return '<div class="ps-rad-stor">' + siffra('Spelade', spelade) + siffra('Rätt', ratt) + ring(ratt, spelade) + '</div>';
  }

  /* Sviten: tydlig markering med flamma från tre dagar, bästa svit under. */
  function svit(nu, basta){
    const het = nu >= 3;
    return '<div class="ps-svit">' +
      '<span class="ps-svit-nu' + (het ? ' het' : '') + '">' + (het ? FLAMMA : '') + 'Svit ' + tal(nu) + (nu === 1 ? ' dag' : ' dagar') + '</span>' +
      '<span class="ps-svit-basta">Bästa svit ' + tal(basta) + (basta === 1 ? ' dag' : ' dagar') + '</span></div>';
  }

  function kort(typ, namn, poang, innehall, tomt){
    return '<section class="ps-kort ps-' + typ + (tomt ? ' ps-tomt' : '') + '" aria-label="' + namn + '">' +
      '<header class="ps-topp"><h3>' + SPELIKON[typ] + namn + '</h3>' +
      '<span class="ps-pill">' + tal(poang) + ' p till rangen</span></header>' +
      (tomt ? '<p class="ps-tom">Inte spelad än.</p>' : innehall) + '</section>';
  }

  function siffror(el, p){
    const s = p.statistik;
    el.className = 'ps';
    if (!s){ el.innerHTML = ''; return; }
    const f = s.fraga, l = s.lat, t = s.fritt;

    const kFraga = kort('fraga', 'Dagens fråga', f.poang,
      stora(f.spelade, f.ratt) + svit(f.svit, f.basta), !f.spelade);

    const max = Math.max.apply(null, l.klipp || [0]);
    const kLat = kort('lat', 'Dagens låt', l.poang,
      stora(l.spelade, l.ratt) + svit(l.svit, l.basta) +
      (l.oftast == null ? '' :
        '<p class="ps-rubrik">Rätt efter klipp, oftast ' + KLIPPTEXT[l.oftast] + '</p>' +
        '<ol class="ps-diagram" aria-label="Antal rätt per klipp">' + l.klipp.map(function(n, i){
          const h = n ? Math.max(8, Math.round(100 * n / max)) : 3;
          return '<li' + (n === max && n > 0 ? ' class="ps-mest"' : '') + '><b>' + tal(n) + '</b>' +
            '<i style="height:' + h + 'px"></i><span>' + KLIPPTEXT[i] + '</span></li>';
        }).join('') + '</ol>'), !l.spelade);

    const n = t.niva || {};
    const nivaMax = Math.max(1, n.latt || 0, n.medel || 0, n.svar || 0, n.expert || 0);
    const genre = t.genre && GENRENAMN[t.genre] ? t.genre : null;
    const kFritt = kort('fritt', 'Fritt spel', t.poang,
      stora(t.spelade, t.ratt) +
      '<p class="ps-rubrik">Rätta låtar per svårighet</p>' +
      '<ul class="ps-staplar" aria-label="Rätta låtar per svårighet">' +
        [['Lätt', n.latt], ['Medel', n.medel], ['Svår', n.svar], ['Expert', n.expert]].map(function(r){
          const v = r[1] || 0;
          return '<li><span>' + r[0] + '</span><div class="ps-spar"><i style="width:' + Math.round(100 * v / nivaMax) + '%"></i></div><b>' + tal(v) + '</b></li>';
        }).join('') + '</ul>' +
      (genre
        ? '<div class="ps-genre g-' + genre + '"><p class="ps-rubrik">Mest spelade genre</p>' +
          '<span class="ps-genrepill"><span class="ps-prick" aria-hidden="true"></span>' + GENRENAMN[genre] + '</span>' +
          '<div class="ps-spar"><i style="width:' + proc(t.genre_spelade, t.spelade) + '%"></i></div>' +
          '<p class="ps-rad">' + tal(t.genre_spelade) + ' av ' + tal(t.spelade) + ' låtar</p></div>'
        : ''), !t.spelade);

    el.innerHTML = kFraga + kLat + kFritt;
  }

  window.hardlistProfil = {
    esc: esc, tal: tal, datum: datum, manad: manad, initial: initial, bildHtml: bildHtml,
    ark: ark, badgeArk: badgeArk, rutnat: rutnat, antalTagna: antalTagna,
    huvud: huvud, nasta: nasta, siffror: siffror
  };
})();
