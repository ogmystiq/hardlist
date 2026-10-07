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
  function tal(n){ return Number(n || 0).toLocaleString('sv-SE'); }
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

  /* Tagna först i den ordning de togs, sedan påbörjade, inte påbörjade,
     hemliga och sist de som kommer senare. */
  function ordning(p){
    const tagna = tagenMap(p);
    const fr = p.framsteg || {};
    const grupp = function(b){
      if (tagna[b.id]) return 0;
      if (b.kommer) return 4;
      if (b.hemlig) return 3;
      return b.mal && fr[b.id] > 0 ? 1 : 2;
    };
    return B.BADGES.map(function(b, i){ return { b: b, g: grupp(b), i: i }; })
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
    if (b.kommer || (b.hemlig && !tagen)) return '';
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

  function antalTagna(p){
    const giltiga = (p.badges || []).filter(function(x){ return B.hitta(x.id); });
    return giltiga.length + ' av ' + B.BADGES.length;
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

  /* Nästa rang och poängen kvar. Vid Legend finns ingen nästa. */
  function nasta(el, p){
    if (!p.nasta_rang){
      el.innerHTML = '<div class="pf-nasta-topp"><span class="pf-nasta-namn"><span class="pf-etikett">Rang</span>' +
        '<span class="pf-stor">' + esc(p.rang) + '</span></span><span class="pf-nasta-kvar">Högsta rangen</span></div>';
      return;
    }
    const spann = Math.max(1, p.nasta_grans - p.rang_fran);
    const andel = Math.max(0, Math.min(100, Math.round(100 * (p.poang - p.rang_fran) / spann)));
    el.innerHTML = '<div class="pf-nasta-topp"><span class="pf-nasta-namn"><span class="pf-etikett">Nästa rang</span>' +
      '<span class="pf-stor">' + esc(p.nasta_rang) + '</span></span>' +
      '<span class="pf-nasta-kvar">' + tal(p.kvar) + ' poäng kvar</span></div>' +
      '<div class="pf-stapel" role="img" aria-label="' + andel + ' procent av vägen till ' + esc(p.nasta_rang) + '"><i style="width:' + andel + '%"></i></div>';
  }

  function siffror(el, p){
    const ruta = function(etikett, varde){
      return '<div class="pf-siffra"><span class="pf-etikett">' + etikett + '</span><span class="pf-stor">' + varde + '</span></div>';
    };
    el.innerHTML = ruta('Svit', tal(p.svit)) + ruta('Bästa svit', tal(p.basta)) +
      ruta('Rätt svar', p.ratt_andel == null ? '–' : p.ratt_andel + ' %');
  }

  window.hardlistProfil = {
    esc: esc, tal: tal, datum: datum, manad: manad, initial: initial, bildHtml: bildHtml,
    ark: ark, badgeArk: badgeArk, rutnat: rutnat, antalTagna: antalTagna,
    huvud: huvud, nasta: nasta, siffror: siffror
  };
})();
