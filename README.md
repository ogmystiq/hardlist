# HARDLIST

Sajt för hardstyle-, raw-, uptempo- och hardcore-releaser plus hard dance-kalender.
Öppna vilken HTML-fil som helst i webbläsaren — CSS:en ligger inbakad i varje sida,
inga sidofiler behövs.

```
index.html      releaser + kalender med Norden-filter
quiz.html       dagens fråga, poäng sparas lokalt i webbläsaren
anthems.html    varje Defqon-anthem år för år
404.html        egen felsida
events.html     festivalguider med knappväljare, 10 event
guider.html     packlista, campingregler per festival, värmeavsnitt
nyborjare.html  historik, subgenrer, artister, klassiker, slang
style.css       referenskopia — sidorna använder sin inbakade kopia
data/releases.json    skrivs av skriptet
data/artist-ids.json  cache, skrivs av skriptet
data/events.json      fyller du i själv
scripts/hamta-releaser.mjs      hämtar från Spotify
scripts/bygg-metadata.mjs       bygger allt härlett: SEED-kopior, JSON-LD,
                                kalender.ics, releaser.xml, sitemap-datum
data/quiz.json                  quizfrågor — lägg till fler här
data/quiz-live.json             genereras — klientversionen utan facit
data/ljud.json                  genereras — cache av ljudadresser
data/anthems.json               anthem-arkivet
kalender.ics                    genereras — prenumererbar kalender
releaser.xml                    genereras — RSS på releaserna
.github/workflows/releaser.yml  kör skriptet varje fredag
```

**Ändrar du CSS** gör du det i `<style>`-blocket högst upp i en sida och kopierar
till de andra tre. `style.css` finns kvar som referens.

---

## Releaser sorteras alltid efter datum

| Grupp | Innehåll |
|---|---|
| Kommande | Releasedatum i framtiden. Visas som "Imorgon", "Om 1 vecka". |
| Nyss släppt | De senaste 7 dagarna. |

**Inget äldre än en vecka visas.** Skriptet rensar bort det ur
`data/releases.json` vid varje körning, och sidan filtrerar dessutom bort det
vid rendering ifall filen skulle vara gammal.

Vill du ha en längre svans ändrar du på **två** ställen, och de måste matcha:
`DAGAR_BAKAT` i `scripts/hamta-releaser.mjs` och `DAGAR_VISAS` i `index.html`.

Genrefiltret ändrar bara vad som visas, aldrig ordningen.

---

## Kvotskydd — läs det här

Spotifys Development Mode har en **daglig kvot per utvecklarkonto**. Bränner du
den är du utelåst i ungefär ett dygn.

**Uppmätt i praktiken: kvoten tar slut runt 200 anrop per dygn.** Två körningar
à 100 anrop räckte.

Därför kör workflowen **dagligen med rotation** istället för en gång i veckan.
Varje körning tar upp till `MAX_ANROP` anrop och fortsätter där förra slutade:

| Artister | Anrop per varv (cachat) | Varv tar |
|---|---|---|
| 333 (nu) | 333 | 2 dygn |
| 500 | 500 | 3 dygn |
| 700 | 700 | 5 dygn |

Eftersom sajten bara visar sju dagar bakåt hinner varje artist kollas minst två
gånger inom fönstret även vid 500 namn. Ingenting missas.

Uppbyggnaden av cachen kostar dubbelt (sökning + albumanrop), så första veckan
efter att du lagt till många namn går åt till att beta av listan.

**Extended Quota Mode är inte ett alternativ.** Sedan maj 2025 tar Spotify bara
emot ansökningar från organisationer, med krav på registrerat företag och
250 000 månatliga användare.

Skriptet har fyra spärrar:

| Spärr | Vad den gör |
|---|---|
| `MAX_ANROP = 170` | Hårt tak per körning. Nås det sparas resultatet och körningen avslutas. |
| Rotation | Nästa körning fortsätter på nästa artist. Alla täcks över några körningar. |
| Sammanslagning | Delkörningar raderar aldrig tidigare fynd. Gammalt läses in, nytt läggs till, allt äldre än 30 dagar rensas. |
| `MAX_VANTAN = 30` | Ber Spotify oss vänta längre än 30 s avbryts körningen istället för att hamra på kvoten. |

Plus `timeout-minutes: 12` i workflowen, så inget jobb kan hänga.

**Artist-ID:n cachas** i `data/artist-ids.json`. Första körningen kostar 2 anrop
per artist, därefter 1. Med 80 artister betyder det två körningar första gången
och sedan en. Lägger du till artister växer kvotbehovet linjärt.

---

## Setup

### 0. Krav: Spotify Premium

Sedan mars 2026 måste kontot som äger appen ha ett **aktivt Premium-abonnemang**.
Utan det slutar API:et fungera.

### 1. Spotify-nycklar

developer.spotify.com → Dashboard → Create app.

Redirect URI: `http://127.0.0.1:8888` och tryck Add.
`http://localhost` godkänns **inte** längre — Spotify tog bort okrypterade
HTTP-URI:er utom loopback-adresser, och portnumret måste vara med.
Fältet används aldrig av den här sajten; skriptet kör client credentials-flödet.

Kryssa i "Web API", spara, kopiera Client ID och Client Secret.

**Skicka aldrig din Client Secret till någon.** Den läggs i GitHub:
Settings → Secrets and variables → Actions → New repository secret.
Två stycken, exakt dessa namn: `SPOTIFY_ID` och `SPOTIFY_SECRET`.

Sätt även Settings → Actions → General → Workflow permissions till
**Read and write permissions**.

### 2. Kör

Actions → "Hämta releaser" → Run workflow. Kör en andra gång efter några
minuter så att resten av artistlistan hämtas.

### 3. Publicera

Settings → Pages → Deploy from a branch → `main` / root.

### 4. Events

Ingen API samlar hard dance-event. `data/events.json` fyller du i för hand:

```json
{
  "name": "Sana Duri",
  "date": "2026-09-12",
  "region": "norden",
  "city": "Uppsala, SE",
  "venue": "Studenternas IP",
  "lineup": "Project One m.fl.",
  "url": "https://biljettlank"
}
```

`region` är `norden` eller `europa` och styr filtret. Norden är förvalt — det är
sajtens poäng.

**Leta alltid upp biljettlänken** när du lägger in ett event. Prioriteringen är:

1. Arrangörens egen biljettsida (`decibeloutdoor.com/tickets`)
2. Officiell biljettleverantör (Ticketmaster, Tickster, Paylogic)
3. Arrangörens startsida

Är biljetterna inte släppta än, länka till förhandsanmälan och sätt `urlText`
så knappen säger rätt sak istället för att lova något som inte finns:

```json
{ "url": "https://www.reverze.be/pre-registration", "urlText": "Förhandsanmälan" }
```

Utelämnas `urlText` står det Biljetter. Utelämnas `url` helt visas
"Biljettlänk saknas", vilket är sämre än att inte ha eventet alls.

**Kalendern visar bara event med bekräftat, ej passerat datum.** Utelämnar du
`date` hamnar eventet istället i bevakningslistan under kalendern, med ett
`season`-fält istället:

```json
{ "name": "Hardstyle DNA", "region": "norden", "city": "Oslo, NO", "season": "normalt i maj" }
```

Så fort datumet släpps lägger du till `date` och eventet flyttar upp i kalendern
av sig självt.

**Du redigerar bara `data/events.json`.** Två kopior härleds ur den automatiskt:

| Kopia | Vad den gör |
|---|---|
| `SEED_EVENTS` i `index.html` | Reservdata när sidan öppnas direkt från disk, där webbläsaren blockerar `fetch` mot lokala filer. På servern vinner alltid JSON-filen. |
| JSON-LD i `index.html` | Strukturerad data för Google. Ger rika sökresultat med datum och plats. Bara event med bekräftat `date` tas med. |

`scripts/bygg-metadata.mjs` skriver båda utifrån JSON-filen och uppdaterar
sitemapens datum. Workflowen kör det varje natt, så du behöver inte göra något.

Vill du se ändringen direkt istället för att vänta till nästa natt kan du köra
`node scripts/bygg-metadata.mjs` lokalt, eller trycka Run workflow i Actions.

Skriptet skriver bara mellan markörerna `<!-- EVENTS-LD:START/END -->` och
`/* SEED_EVENTS:START/END */` i `index.html`. Tar du bort dem avbryter det med
ett felmeddelande istället för att skriva sönder filen.

**21 event ligger inne** — 5 med bekräftat datum, 16 under bevakning.

Bästa källan för svenska event är communityt **hardstylesverige.com/pages/events**
— de listar allt och tar emot tips. Kolla den några gånger per år.

---

## Om kommande releaser

Skriptet tar med allt med framtida releasedatum. Men Spotify listar bara en låt i
förväg om artisten har en **pre-save igång**. Släpp som bara annonserats på
Instagram syns inte. Praktiskt ger det 1–2 veckors framförhållning på de stora
namnen, mindre på små artister. Beatport har bättre pre-order-data men ingen
öppen API.

---

## Spotifys regeländringar 2026

| Endpoint | Status |
|---|---|
| `GET /search?type=artist` | Finns kvar. Max `limit` sänkt från 50 till 10 — skriptet använder 1. |
| `GET /artists/{id}/albums` | Finns kvar. Max `limit` sänkt till 10 (default 5). Skriptet använder 10. |

Borttaget i februari 2026 och får alltså inte användas framåt:
`/browse/new-releases`, `/artists/{id}/top-tracks`, batch-hämtning av flera
artister eller album i ett anrop, samt fälten `label` och `popularity`.

Sedan juli 2026 räknas kvoten per utvecklarkonto istället för per app, och
429-svar innehåller ett `reason`-fält.

---

## Nordiska event i kalendern

Hämtade från Hardstyle Sveriges egen eventlista, arrangörernas sidor och
biljettleverantörer:

**I kalendern med bekräftat datum:**

| Event | Ort | Datum |
|---|---|---|
| Sana Duri — The New Beginning | Studenternas IP, Uppsala | 12 sep 2026, kl 11–23.30 |
| Holy Priest | Berns, Stockholm | 12 sep 2026, kl 23 |
| Monday Bar Halloween Cruise | Stockholm | 6–7 nov 2026 |

**Under bevakning** — årliga, nästa datum ej annonserat: Lumaniac (Kristianstad,
mars), Hardstyle Reaction (Platens Bar, Linköping, maj), Swedish Rave Society
(Hamnplan 1, Örebro, maj), Monday Bar Summer Cruise (Stockholm–Tallinn, juni),
One Vision Festival (Kristianstad, augusti), Hardstyle DNA (Bjerke Travbane,
Oslo, maj), Soundvault Festival (Suvilahti, Helsingfors, maj) och Ascend
(Norrköping).

Sana Duri 2026 är Nordens största hardstyle-satsning hittills: Shuffle Group och
All Things Live räknar med runt 10 000 besökare, och lineupen har Project One,
Brennan Heart, Showtek, Rebelion vs Vertile, Rooler vs Warface och Radical
Redemption bland andra.

## Om CACHE_VERSION

Höjs den i `scripts/hamta-releaser.mjs` kastas alla cachade artist-ID:n och
byggs upp igen. Det kostar dubbelt så många anrop per artist, alltså **ungefär
fyra dygn** innan hela listan är genomsökt igen.

**Releaselistan rörs inte.** Den behålls och rensas som vanligt av
sjudagarsfönstret. En tidigare version tömde den, vilket gav flera dygn med
nästan tom sajt — gör inte om det.

Höj bara versionen när matchningslogiken faktiskt ändrats.

## Hur rätt artist väljs

Tre spärrar, i den här ordningen:

1. **Exakt namnmatchning.** Spotify rankar sökträffar efter popularitet, inte
   efter hur väl namnet stämmer — en sökning på Killshot gav Eminem. Bara
   artister vars namn stämmer tecken för tecken godtas.
2. **Genretagg.** Finns flera med exakt samma namn väljs den som är taggad
   hardstyle, hardcore, uptempo, frenchcore eller hard techno.
3. **Följartröskel.** `MIN_FOLJARE = 2000`, men **vilande**. Spotify slutade
   lämna ut `followers` i söksvaret, samma väg som `popularity` tog i februari
   2026. Kontrollen körs bara när fältet finns, annars avvisades varje artist i
   listan. Den vaknar av sig själv om Spotify återinför fältet.

**Konsekvens:** två artister med exakt samma namn går inte längre att skilja
automatiskt. Spotifys egen ordning används, vilket nästan alltid ger rätt akt.
Dyker en fel artist upp i flödet: naglafast rätt Spotify-ID med `id`-fältet på
raden i artistlistan, eller ta bort namnet om akten inte finns där.

Missar första sökningen görs ett andra försök med ordet hardstyle tillagt. Det
löser enordsnamn som Requiem och Pavo, som annars drunknar bland Mozart och
Pavarotti.

Hittas ingen godkänd artist hoppas den över och loggas med `⚠ HOPPAR ÖVER`.
Det är den enda raden i loggen som kräver åtgärd.

## Musikfrågor i quizet

En fråga kan spela upp 30 sekunder musik istället för att ställa en textfråga.
Lägg till den så här i `data/quiz.json`:

```json
{
  "typ": "musik",
  "sok": "Headhunterz Dragonborn",
  "f": "Vilken låt är det här?",
  "s": ["Dragonborn", "Scrap Attack", "The Sacrifice", "Rock Civilization"],
  "r": 0,
  "fk": "Headhunterz — Dragonborn."
}
```

**Musikfrågor visas bara på fredagar.** Det är den globala släppdagen för ny
musik, så det följer sajtens egen rytm. Övriga dagar kommer textfrågor. Finns
inga ljudfrågor tillgängliga faller fredagen tillbaka på en textfråga.

`sok` är söksträngen mot **Apples iTunes Search API**, som är gratis, kräver
ingen inloggning och lämnar ut 30-sekunders förhandslyssningar lagligt. Skriptet
slår upp den, sparar adressen i `data/ljud.json` och slår aldrig upp samma sträng
igen.

**Spotify går inte att använda för det här.** Fältet `preview_url` slutade
fungera för nya appar i november 2024 och returnerar alltid null. Det finns
lösningar som skrapar Spotifys embed-spelare, men de bryter mot villkoren.

**Söksträngen skickas aldrig till webbläsaren.** Den skulle avslöja svaret.
Byggskriptet skriver en separat `data/quiz-live.json` där `sok` är borttagen och
ersatt av den färdiga ljudadressen. Adressen innehåller inget låtnamn.

Hittas ingen förhandslyssning **utelämnas frågan helt** istället för att visas
med en trasig spelare. Loggen skriver ut vilka som misslyckades — testa då en
enklare söksträng, gärna bara artist och låttitel.

## Filer som genereras automatiskt

`scripts/bygg-metadata.mjs` skriver dessa vid varje körning. **Redigera dem aldrig
för hand** — ändringarna skrivs över nästa natt.

| Fil | Källa | Vad den gör |
|---|---|---|
| `kalender.ics` | `data/events.json` | Prenumererbar kalender. Folk lägger in den en gång i Google eller Apple Kalender och får nya event automatiskt. Bara event med bekräftat datum. |
| `releaser.xml` | `data/releases.json` | RSS-flöde med de 50 senaste släppen. |
| `data/quiz-live.json` | `data/quiz.json` | Quizet som webbläsaren läser, utan söksträngar. |
| `data/ljud.json` | iTunes Search API | Cache av ljudadresser. Slås bara upp en gång per låt. |
| `SEED_EVENTS` / `SEED_QUIZ` / `SEED_ANTHEMS` | respektive JSON | Reservdata när sidan öppnas utan server. |
| JSON-LD i `index.html` | `data/events.json` | Strukturerad data för Google. |

Flerdagarsevent: sätt `dateEnd` till sista dagen i `data/events.json`, så blir
kalenderposten rätt lång. Saknas fältet räknas eventet som endags.

## Faktakontroll av guiderna

**Verifierat mot arrangör eller etablerad källa:**

- Defqon.1: Walibi Holland i Biddinghuizen, slutet av juni, fyra dagar.
  2026-upplagan ("Sacred Oath") ställdes in efter första dagen efter
  Nederländernas första kod röd för värme någonsin. Helgbiljett 339,95 euro 2026.
- Decibel Outdoor: Beekse Bergen, Hilvarenbeek, mitten av augusti, 30+ scener.
- Intents 2026: 5–7 juni, Oisterwijk, "Rise of Titans".
- Dominator 2026: 17–18 juli, Eersel, "Fatal Fortune", 10 scener.
- Masters of Hardcore 2026: 28 mars, Brabanthallen, 's-Hertogenbosch.
- Harmony of Hardcore 2026: 23 maj, De Roost i Erp, "The Awakening".
- Reverze: Antwerpen, AFAS Dome + Lotto Arena. Nästa 26–27 februari 2027.
- Alkohol- och campingregler: Defqon.1, Decibel, Intents.
- Hardstyles historia, subgenredefinitioner, klassikerlistan.

**Står uttryckligen som overifierat på sidan:**
Rebirth, Supremacy, One Vision, Q-BASE, samt camping- och dryckesregler för
Dominator och Harmony of Hardcore.

**Nedlagt — finns inte kvar:** Qlimax (sista upplagan november 2024), Qapital,
The Qontinent och alla X-Qlusive-event. Sidan varnar för gamla guider som
fortfarande listar dem.

**Rutter inne på områdena finns medvetet inte med.** Q-dance släpper en officiell
interaktiv karta inför varje edition, och sidan hänvisar dit. Insidertips ska
komma från besökare via kontaktlänken.

Regler, datum och stagenamn ändras varje år. Gå igenom guiderna en gång per säsong.

---

## Byta namn och mailadress

"HARDLIST" står i `<title>`, `.logo` och footern på alla fyra sidor.
Platshållaradressen `hardlisthelp@gmail.com` finns i footern och i alla tipsa-länkar.
Sök och ersätt.
