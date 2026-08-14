# HARDLIST

Sajt för hardstyle-, raw-, uptempo- och hardcore-releaser plus hard dance-kalender.
Öppna vilken HTML-fil som helst i webbläsaren — CSS:en ligger inbakad i varje sida,
inga sidofiler behövs.

```
index.html      releaser (kommande / nyss släppt / tidigare) + kalender med Norden-filter
events.html     festivalguider med knappväljare, 10 event
guider.html     packlista, campingregler per festival, värmeavsnitt
nyborjare.html  historik, subgenrer, artister, klassiker, slang
style.css       referenskopia — sidorna använder sin inbakade kopia
data/releases.json    skrivs av skriptet
data/artist-ids.json  cache, skrivs av skriptet
data/events.json      fyller du i själv
scripts/hamta-releaser.mjs      hämtar från Spotify
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
| Tidigare | 8–30 dagar gamla. |

Genrefiltret ändrar bara vad som visas, aldrig ordningen.

---

## Kvotskydd — läs det här

Spotifys Development Mode har en **daglig kvot per utvecklarkonto**. Bränner du
den är du utelåst i ungefär ett dygn. Skriptet har därför fyra spärrar:

| Spärr | Vad den gör |
|---|---|
| `MAX_ANROP = 100` | Hårt tak per körning. Nås det sparas resultatet och körningen avslutas. |
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

**Kalendern visar bara event med bekräftat, ej passerat datum.** Utelämnar du
`date` hamnar eventet istället i bevakningslistan under kalendern, med ett
`season`-fält istället:

```json
{ "name": "Hardstyle DNA", "region": "norden", "city": "Oslo, NO", "season": "normalt i maj" }
```

Så fort datumet släpps lägger du till `date` och eventet flyttar upp i kalendern
av sig självt.

**Viktigt:** `index.html` har en inbäddad reservkopia av eventlistan (`SEED_EVENTS`
i skriptblocket). Den används bara när `data/events.json` inte kan laddas — vilket
händer när du öppnar filen direkt från disk, eftersom webbläsaren blockerar `fetch`
mot lokala filer. På GitHub Pages vinner alltid JSON-filen. Uppdaterar du
`data/events.json` bör du klistra in samma lista i `SEED_EVENTS`, annars visar den
lokala förhandsgranskningen gammal data.

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
Platshållaradressen `hej@example.se` finns i footern och i alla tipsa-länkar.
Sök och ersätt.
