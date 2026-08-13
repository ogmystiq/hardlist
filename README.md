# HARDLIST

Sajt för hardstyle-, raw-, uptempo- och hardcore-releaser plus rave i Norden.
Öppna `index.html` i webbläsaren så funkar allt direkt — CSS:en ligger inbakad
i varje sida, inga externa filer behövs.

```
index.html      releaser (kommande / nyss släppt / tidigare) + kalender
events.html     festivalguider med väljare
guider.html     packlista och campingregler
nyborjare.html  subgenrer, artister, klassiker, slang
style.css       referenskopia — sidorna använder sin inbakade kopia
data/releases.json   skrivs av skriptet
data/events.json     fyller du i själv
scripts/hamta-releaser.mjs      hämtar från Spotify
.github/workflows/releaser.yml  kör skriptet varje fredag
```

Releaserna sorteras **alltid efter datum**, aldrig efter genre:

| Grupp | Vad som hamnar där |
|---|---|
| Kommande | Releasedatum i framtiden. Visas som "Imorgon", "Om 1 vecka". |
| Nyss släppt | De senaste 7 dagarna. |
| Tidigare | Äldre än 7 dagar, upp till 30. |

Genrefiltret ändrar bara vad som visas, aldrig ordningen.

**Ändrar du CSS** gör du det i `<style>`-blocket högst upp i en sida och
kopierar till de andra tre. `style.css` finns kvar som referenskopia.

---

## Vad du behöver göra

### 0. Krav: Spotify Premium

Sedan mars 2026 måste kontot som äger appen ha ett **aktivt Premium-abonnemang**.
Har du bara gratisversionen slutar API:et fungera. Löper Premium ut slutar sajten
uppdateras, och börjar igen när du förnyar. Det finns ingen väg runt det.

### 1. Spotify-nycklar

developer.spotify.com → logga in med ditt vanliga Spotify → Dashboard →
Create app. Namn och beskrivning: vad som helst.

Redirect URI: skriv `http://127.0.0.1:8888` och tryck Add.
`http://localhost` går **inte** längre — Spotify slutade acceptera det 2025 och
dashboarden svarar "This redirect URI is not secure". Portnumret måste vara med;
bara `http://127.0.0.1` godkänns inte heller. Vilket portnummer spelar ingen roll.

Fältet är obligatoriskt men används aldrig av den här sajten — skriptet kör
client credentials-flödet, som inte har någon redirect alls.

Kryssa i "Web API" och spara. Kopiera Client ID och Client Secret.

Själva utvecklarkontot är gratis, men se kravet ovan om Premium.
Du kan ha upp till 25 appar per konto, och de delar samma API-kvot.

**Skicka aldrig din Client Secret till någon — inte till mig heller.**
Den läggs direkt i GitHub: Settings → Secrets and variables → Actions →
New repository secret. Två stycken: `SPOTIFY_ID` och `SPOTIFY_SECRET`.

Vill du testa lokalt först:

```bash
SPOTIFY_ID=xxx SPOTIFY_SECRET=yyy node scripts/hamta-releaser.mjs
```

### 2. Artistlistan

Ligger överst i `scripts/hamta-releaser.mjs`. 74 namn är redan inlagda och
täcker scenens stora artister över alla fyra subgenrer. Lägg till fler när nya
slår igenom och sätt genre (`euphoric` / `raw` / `uptempo` / `hardcore`).

### 3. Events

Det finns ingen API som samlar nordiska hardstyle-event. `data/events.json`
fyller du i för hand:

```json
{
  "name": "Sana Duri",
  "date": "2026-09-12",
  "city": "Uppsala",
  "venue": "Studenternas IP",
  "lineup": "Project One m.fl.",
  "url": "https://biljettlank"
}
```

`date: null` betyder att datumet inte är släppt än — eventet visas ändå.
Passerade event försvinner automatiskt.

---

## Om kommande releaser

Skriptet tar med allt som har ett framtida releasedatum på Spotify. Men Spotify
listar bara en låt i förväg om artisten har en **pre-save igång**. Släpp som
bara annonserats på Instagram syns inte.

Praktiskt betyder det:

- Ungefär en till två veckors framförhållning på de artister som kör pre-saves.
- Stora namn och stora labels gör det nästan alltid. Mindre artister sällan.
- Vill du ha mer täckning är enda vägen att lägga till rader för hand i
  `data/releases.json` — men skriptet skriver över filen varje fredag, så det
  försvinner. Behöver du permanenta manuella rader får sajten läsa två filer.
  Säg till så bygger jag det.

Beatport har bättre pre-order-data men ingen öppen API — den kräver
partnergodkännande.

## Om Spotifys regeländringar 2026

Spotify stramade åt utvecklarplattformen i februari och mars 2026. Kontrollerat
mot deras migreringsguide — de två endpoints sajten använder finns kvar:

| Endpoint | Status |
|---|---|
| `GET /search?type=artist` | Finns kvar. Max `limit` sänkt från 50 till 10 — skriptet använder 1. |
| `GET /artists/{id}/albums` | Oförändrad. |

Det som togs bort och som sajten alltså **inte** får bygga på i framtiden:
`/browse/new-releases`, `/artists/{id}/top-tracks`, batch-hämtning av flera
artister eller album i ett anrop, samt fälten `label` och `popularity`.

Sedan juli 2026 räknas API-kvoten per utvecklarkonto istället för per app, och
429-svar innehåller ett `reason`-fält. Skriptet skiljer nu på rate limit (väntar
och försöker igen, max fem gånger) och slut kvot (avbryter direkt med
förklaring, eftersom fler försök ändå inte hjälper).

---

## Guiderna

`events.html`, `guider.html` och `nyborjare.html` är vanlig HTML. Skriv rakt i
filerna.

Verifierat mot arrangörernas egna sidor: Defqon.1, Decibel Outdoor, Intents.
Inte verifierat, står uttryckligen i texten: Rebirth, Reverze, Dominator,
One Vision.

Rutter och genvägar inne på områdena är **inte** påhittade — de står inte med.
Q-dance släpper en officiell interaktiv karta inför varje Defqon.1, och
sidan hänvisar dit istället. Insidertipsen får komma från besökare.

**Regler och stagenamn ändras varje år.** Gå igenom guiderna en gång per säsong.

---

## Lägga upp den

1. Skapa ett repo på GitHub, ladda upp allt.
2. Lägg in `SPOTIFY_ID` och `SPOTIFY_SECRET` som repository secrets.
3. Settings → Pages → Source: `main` / root.
4. Actions → "Hämta releaser" → Run workflow (första gången manuellt).

Sen uppdateras releaserna själv varje fredag morgon. Domän är valfritt —
`.se` kostar runt 100 kr/år.

## Byta namn

"HARDLIST" står i `<title>`, `.logo` och footern på alla fyra sidor.
Sök och ersätt.
