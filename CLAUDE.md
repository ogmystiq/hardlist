# CLAUDE.md — arbetsregler för HARDLIST

Läs hela den här filen innan du ändrar något. Reglerna nedan kommer ur konkreta
misstag som redan kostat tid, inte ur allmänna principer.

**Språk:** all kod, alla kommentarer, alla commit-meddelanden och all text på
sajten skrivs på svenska. Kommentarer förklarar *varför*, aldrig vad koden gör.

**Ägare:** Jonathan H (Jonte). Sajten ligger på hardlist.se, repot är
`ogmystiq/hardlist`, publicerad med GitHub Pages från `main`.

---

## Vad sajten är

En automatiserad sida för hardstyle-scenen i Norden. Nya släpp hämtas dagligen
från Spotify, kalendern listar rave i Norden och Europa, och det finns guider,
ett anthem-arkiv och ett dagligt quiz.

Bärande idé: **allt utom fyra datafiler ska sköta sig självt.**

Menyn har fem val, och varje sida hör till ett av dem:

| Meny | Sidor |
|---|---|
| Hem | `/` — idag-vyn: dagens fråga, dagens låt, topplistan, nytt, snart |
| Releaser | `/releaser/` |
| Event | `/events/` (kalendern och festivalguiderna), `/guider/` (camping) |
| Spel | `/spel/`, `/quiz/`, `/latspel/` |
| Scenen | `/scenen/`, `/nyborjare/`, `/anthems/` |

Konto, integritet och 404 hör inte till något menyval.

---

## Filstruktur

Rena adresser utan filändelse. Varje sida är en `index.html` i egen mapp.

```
index.html              →  hardlist.se/
releaser/index.html     →  hardlist.se/releaser/
events/index.html       →  hardlist.se/events/
guider/index.html       →  hardlist.se/guider/
spel/index.html         →  hardlist.se/spel/
quiz/index.html         →  hardlist.se/quiz/
latspel/index.html      →  hardlist.se/latspel/
scenen/index.html       →  hardlist.se/scenen/
nyborjare/index.html    →  hardlist.se/nyborjare/
anthems/index.html      →  hardlist.se/anthems/
konto/index.html        →  hardlist.se/konto/
integritet/index.html   →  hardlist.se/integritet/
404.html                →  egen felsida
CNAME                   →  RADERA ALDRIG. Utan den slutar domänen fungera.

stil.css                →  all gemensam stil, se nedan
ram.js                  →  statusraden i sidfoten, läser data/status.json
inloggning.js           →  inloggningen, laddas av varje sida
rader.js                →  releaseraden, delad av startsidan och /releaser/
ljud.js                 →  avstängningen av iTunes-ljud och raden om förlyssningen
typsnitt/               →  Archivo, ligger här i stället för hos Google Fonts
```

Alla länkar och alla `fetch()` måste vara **absoluta** (`/events/`,
`/data/releases.json`). Relativa sökvägar bryts eftersom sidorna ligger i
undermappar.

Gamla adresser fortsätter fungera: `/#releaser` och `/#kommande` leder till
`/releaser/`, `/#events` till `/events/#kalender`.

---

## Stilen och den gemensamma koden

All gemensam stil ligger i `stil.css`, som varje sida laddar. En sida får
dessutom ha **högst ett** eget `<style>`-block för det som bara finns där.

- **Ändrar du `stil.css`: ändra datumet i `?v=` i alla sidor.** GitHub Pages
  låter webbläsare spara filen i tio minuter, och utan nytt datum kan någon
  få ny markup med gammal stil. Ändras den flera gånger samma dag, lägg till
  en bokstav: `?v=2026-10-08b`.
- **Menyn och sidfoten finns som kopior i varje sida.** De måste vara
  identiska — kontrollskriptet larmar annars. Ändrar du dem, ändra i alla.
- **`rader.js` och sidans eget skript delar namnrymd.** Deklarerar sidan ett
  namn som redan finns i `rader.js` stoppas hela sidans skript. Även det
  larmar kontrollskriptet för.
- **Typsnittet ligger i `/typsnitt/`**, så att ingen sidvisning går till
  Google. Licensen (SIL Open Font License) ligger bredvid.

Referensen för utseendet är designfilen Jonte har godkänt (`hardlist-design.md`,
inte i repot). Det viktigaste ur den:

- Färgerna och genrefärgerna står som variabler överst i `stil.css`. Rosa är
  den enda färgen för huvudknappar, alltid med mörk text.
- Ett typsnitt, Archivo. Rubriker och stora siffror i det smala snittet.
- Inga etiketter i VERSALER, inget monospace, inga tunna ramar runt allt,
  inga "A · B · C"-rader med mittpunkter och inga pilar i knapptexter.
- Högst en nivå yta: en ruta i en ruta blir rader med luft emellan.
- Rörelse bara som svar på något man gör, aldrig när sidan laddas.
- Synligt fokus: 2 px cyan ring med 2 px avstånd.

---

## Filer du får redigera för hand

Exakt fyra:

```
data/events.json        kalender och bevakningslista
data/anthems.json       anthem-arkivet
data/kommande.json      kommande släpp, pre-save-länkar
data/installningar.json avstängningen av ljud från iTunes, se nedan
```

### Stänga av ljudet från iTunes

All förlyssning på sajten kommer från iTunes: låtspelet, fredagens låtfråga
och senare fritt spel. Apples villkor tillåter förlyssningar för att
marknadsföra deras butik, inte som underhållning i sig. Vi använder dem ändå,
och om Apple hör av sig ska ljudet kunna stängas av på en minut.

Öppna `data/installningar.json` på GitHub, tryck på pennan och ändra till:

```json
{
  "itunesLjud": false
}
```

Tryck Commit changes. Inom ungefär tio minuter (GitHub Pages cache) visar
låtspelet "Låtspelet är pausat" och fredagens låtfråga "Dagens låtfråga är
pausad". Inget ljud laddas. Sätt tillbaka `true` för att slå på igen.

- **Allt annat än exakt `true` räknas som av** — även ett stavfel eller en
  fil som inte går att läsa. En avstängning ska hålla även när något strular.
- Kör inte bygget efter den här ändringen, det behövs inte.
- En låtfråga som någon redan öppnat när ljudet stängs av kan inte besvaras,
  och servern räknar den då som fel när tiden gått ut.

Vid varje förlyssning står "Förhandslyssning från iTunes" med en länk till
Apple Music, som Apples villkor kräver (`ljud.js`). Före svaret går länken
till Apple Music i allmänhet, efter svaret till låten — annars hade länken
avslöjat svaret. Apples officiella märke ska in bredvid när filen finns.

Quizfrågorna ligger i databasen, inte i repot. Se **Quizet** nedan.

Varje event i `data/events.json` har fältet `genrer`, en lista med något av
`hardstyle`, `raw`, `uptempo`, `hardcore` och `techno` (visas som Hard techno).
Kalendern visar dem som färgprickar och filtrerar på dem. Ett event med tom
lista syns bara när ingen genre är vald, så hellre tom än gissad.

`data/kommande.json` går inte att bygga automatiskt. Spotify har ingen
endpoint för osläppt material — allt skriptet kan hämta är redan utgivet.
Försök inte ersätta filen med ett script eller en workflow; den är och
förblir handskriven.

## Filer du ALDRIG får skriva eller ladda upp

```
data/releases.json      data/artist-ids.json     kalender.ics
releaser.xml            data/streckkoder.json    data/latspel.json
```

De byggs av GitHub Actions. Skriver du en tom eller ofullständig version
raderas serverns riktiga innehåll.

**Det har hänt två gånger.** Första gången försvann hela releaselistan, andra
gången 47 ljudadresser till quizet. Skripten har numera spärrar som vägrar
skriva över större data med mindre, men rör dem inte alls.

Samma sak gäller reservkopiorna i sidorna. Rör dem aldrig för hand, och flytta
aldrig deras markörer — saknas en markör stoppar byggskriptet, och då commitas
inte morgonens releaser:

| Reservkopia | Fylls av |
|---|---|
| `SEED_EVENTS` och JSON-LD (`EVENTS-LD`) i `index.html` | `bygg-metadata.mjs`, ur `data/events.json` |
| `SEED_ANTHEMS` i `anthems/index.html` | `bygg-metadata.mjs`, ur `data/anthems.json` |
| `SEED_LATSPEL` i `latspel/index.html` | ingen — står still tills låtspelet byggs om, se **Låtspelet** |

---

## Spotify — hårda gränser, uppmätta i praktiken

| Sak | Läge |
|---|---|
| Dagskvot i Development Mode | tar slut runt **200 anrop**. Kör högst en gång per dygn. |
| `MAX_ANROP` | 170 per körning |
| Artistlista | 313 namn. Ett helt rotationsvarv tar tre dygn med full cache, längre de dagar bekräftelserna tar många anrop. |
| `preview_url` | död sedan nov 2024, returnerar alltid null |
| `popularity` | borttaget feb 2026 |
| `followers` | **borttaget ur söksvaret**. Se nedan. |
| `/artists/{id}/albums` | max `limit=10` sedan feb 2026 |
| Extended Quota Mode | omöjligt, kräver företag och 250 000 användare |
| Premium på kontot | krävs sedan mars 2026 |

**Kör aldrig workflowen flera gånger samma dag.** Varje misslyckat försök
räknas som ett anrop och gör återhämtningen långsammare, inte snabbare.

Vid 429: väntetid över en timme betyder dygnskvot, avbryt. Kortare betyder
tillfällig broms.

---

## Morgonkörningen: Deezer hittar, Spotify bekräftar

**Den kör inte klockan 07:07.** Schemat säger 05:07 UTC, men GitHub köar
schemalagda jobb, och i praktiken startar den mellan ungefär 12 och 14
svensk tid. Boten pushar utan att hämta först, så **pusha inte till `main`
mellan 11:30 och 15:00 svensk tid** — då kan dagens releaser gå förlorade.
Kolla Actions om du är osäker på om dagens körning är klar.

Rotationen hinner bara en del av listan per dygn. Deezer har ingen dygnskvot,
så varje morgon:

1. **Deezer-radar** (`scripts/deezer-radar.mjs`) går igenom hela listan och
   tar med alla Deezer-artister med exakt samma namn. Släpp inom fönstret som
   inte redan finns i `data/releases.json` blir kandidater. Högst tio minuter.
2. **Spotify bekräftar** varje kandidat genom att söka på skivans UPC. Den
   godkänns bara om en artist på skivan har samma Spotify-ID som skriptet
   använder för någon i listan — fastnaglat ID vinner över cachen. Ger UPC:n
   ingen träff görs ett anrop mot artistens egen diskografi efter samma titel.
   Datum efter idag prövas nästa dag. Högst `BEKRAFTA_TAK` anrop, och de
   räknas mot `MAX_ANROP`.
   Avvisas för gott bara när Spotify har skivan med fel artist, eller när
   skivan saknas helt och släppet är äldre än ett dygn. Ett nytt släpp kan
   saknas i Spotifys sökindex första dygnet.
3. **Rotationen** kör som förut med anropen som är kvar. Den fångar samarbeten
   som Deezer listar under någon annan.

Prövade streckkoder sparas i `data/streckkoder.json` så ingen skiva kollas
två gånger. Antal fynd, bekräftade och avvisade står i `data/status.json`.

Torrkörning utan att skriva filer eller köra rotationen:
`node scripts/hamta-releaser.mjs --torrkorning`

Samma sak utan ett enda Spotify-anrop, för dagar när kvoten är slut. Visar
fynden och vad bekräftelsen skulle kosta:
`node scripts/hamta-releaser.mjs --bara-deezer`

Namnmatchningen på Deezer räcker inte för att välja rätt artist — Emphasis
heter likadant som en helt annan artist även på Spotify. Det är ID-jämförelsen
som skyddar, aldrig namnet.

---

## Så väljs rätt artist

Tre spärrar i ordning:

1. **Exakt namnmatchning.** Spotify rankar efter popularitet, inte namnlikhet —
   en sökning på Killshot gav Eminem, Malice gav GACKT, Requiem gav Mozart.
2. **Genretagg** när flera heter exakt likadant.
3. **Följartröskel** `MIN_FOLJARE = 2000` — men **vilande**, eftersom Spotify
   slutat lämna ut fältet.

Missar första sökningen görs ett andra försök med ordet hardstyle tillagt.

**Lärdom värd att minnas:** jag byggde en gång en spärr på `followers` utan att
kontrollera att fältet fanns. Resultatet var att 170 artister avvisades med
"0 följare". **Verifiera att ett API-fält faktiskt returneras innan du bygger
logik på det.**

---

## CACHE_VERSION

Höjs den kastas alla cachade artist-ID:n, och uppbyggnaden tar cirka fyra dygn
eftersom varje artist då kostar två anrop i stället för ett.

**Releaselistan ska aldrig kastas vid en versionshöjning.** En tidigare version
tömde den, vilket gav flera dygn med nästan tom sajt. Sjudagarsfönstret rensar
gammalt ändå.

Höj bara versionen när matchningslogiken verkligen ändrats.

---

## Quizet

En fråga per dygn, samma för alla. **Allt avgörs på servern** (Supabase):
vilken fråga som gäller, rättningen, poängen och topplistan. Sidan får dagens
fråga och alternativen, aldrig vilket som är rätt — facit kommer först efter
svar. Fram till oktober 2026 låg alla svar öppet i `data/quiz-live.json` och
`SEED_QUIZ`. Lägg aldrig tillbaka svar i något som sajten publicerar.

- **Dygnsgräns** vid midnatt svensk tid. Servern väljer dagens fråga slumpvis
  första gången någon frågar efter den och sparar valet i `quiz.dagar`, med
  alternativen blandade. Minst använda frågan väljs först, så ingen upprepas
  förrän potten är slut. Textfrågor och låtfrågor är skilda pottar.
- **Utan konto:** servern rättar och visar facit men sparar ingenting. Inga
  poäng, ingen svit, ingen rang — varken på servern eller i webbläsaren.
  `localStorage` minns bara dagens svar (`hardlist_quiz_svar`) så att facit
  står kvar vid omladdning. Överst visas en knapp för att logga in. Gamla
  poäng i `hardlist_quiz_v1` raderas när sidan laddas.
- **Med konto:** kräver visningsnamn. Utan namn ger `quiz_dagens` ingen fråga
  och ingen starttid, och `quiz_svara` vägrar rätta. Sidan skickar till
  `/konto/` och tillbaka med `hardlistKonto.valjNamn()`. Ett svar per konto och dygn. 30 sekunder från första gången
  kontot hämtade frågan — sidan hämtar den först när man trycker på "Visa
  dagens fråga", så att bara titta på topplistan inte bränner dagen. För sent
  eller inget svar räknas som fel.
- **Poäng:** grundpoäng + min(svit − 1, 10) × 2 för rätt svar. Grundpoängen
  är 10 för en textfråga och 20 för en låtfråga (fredag, eller en extrainsatt
  låtdag) — det avgörs av frågans `musik`-flagga i `quiz.registrera`. Fel svar
  ger noll och bryter sviten, en missad dag också. Rangskalan finns bara i `quiz.rang` i
  databasen.
- **Topplistan** (`quiz_topplista`) lämnar bara ut visningsnamn, poäng och
  rang. Totalt och innevarande månad, topp 50.
- Allt om ett konto raderas med kontot (`on delete cascade`).

Tabellerna ligger i schemat `quiz`, som API:t inte exponerar. Sajten når dem
bara genom `quiz_dagens`, `quiz_svara` och `quiz_topplista`. Lägg aldrig till
`quiz` i `[api] schemas` i `supabase/config.toml`.

**Frågebanken finns inte i repot.** Repot är publikt — allt som committas går
att läsa för vem som helst, också i historiken.

### Lägga till frågor

1. Skriv frågorna i en fil **utanför repot**, till exempel
   `C:\Users\jonte\hardlist-privat\nya.json`. Samma format som förut:

   ```json
   { "fragor": [
     { "f": "Frågan?", "s": ["Rätt svar", "Fel", "Fel", "Fel"], "r": 0,
       "fk": "Förklaringen som visas efter svar." },
     { "typ": "musik", "artist": "Artistnamn", "titel": "Låttitel",
       "itunesId": 123456789, "f": "Vilken låt är det här?",
       "s": ["Låttitel", "Annan låt", "Tredje låt", "Fjärde låt"],
       "r": 0, "fk": "Artistnamn — Låttitel." }
   ] }
   ```

   `r` är numret på rätt alternativ räknat från 0. Ordningen spelar ingen
   roll, servern blandar varje dag.
2. Prova först: `node scripts/quiz-lagg-till.mjs C:\Users\jonte\hardlist-privat\nya.json --torrkorning`
3. Skicka in: samma kommando utan `--torrkorning`. Kopian uppdateras
   automatiskt efteråt.

Skriptet går via `npx supabase db query --linked`, så det kräver att du är
inloggad i Supabase-CLI:t (`npx supabase login`). Ingen hemlig nyckel behövs.

Samma fråga med samma rätta svar och titel läggs inte in två gånger — den
uppdateras i stället. Vill du ändra en befintlig fråga: kopiera den ur kopian
med sitt `id`, ändra, och skicka in. Ta en fråga ur rotation med
`"aktiv": false` — radera aldrig, gamla dagar pekar på den.

### Kopian av banken

`C:\Users\jonte\hardlist-privat\quiz-bank.json` är en kopia av hela banken,
med svar, ljud och vilka datum varje fråga använts. Uppdateras av
`quiz-lagg-till.mjs`, eller för sig:

`node scripts/quiz-exportera.mjs`

Kör den efter ändringar som gjorts direkt i databasen. Mappen får aldrig
flyttas in i repot.

### Låtfrågor

**Låtquiz på fredagar.** Musikfrågor spelar 30 sekunder från **Apples iTunes
Search API** — gratis, ingen inloggning, lagligt. Spotify går inte att använda
eftersom `preview_url` är död. Ljudadressen hämtas en gång när frågan läggs
in och sparas i databasen. Ingenting slås upp när frågan ställs.

**Fast iTunes-ID vinner över söksträngen.** Sökningens första träff kan byta
låt när Apple ändrar rankningen — så spelade quizet en gång Upchurch i stället
för Miss K8. Därför har varje låtfråga fältet `itunesId`:

- `"itunesId": 1234567` — ljudet hämtas med lookup på just den inspelningen.
- `"itunesId": null` — ingen säker inspelning finns. Frågan får inget ljud och
  visas aldrig, hellre det än fel låt på en fredag.
- fältet saknas — skriptet söker på `sok`. Bara för nya frågor tills rätt ID
  är framletat.

Söksträngar ska vara **bara artist och titel**. Lägger du till genrenamn hittar
iTunes ingenting — "Showtek FTS hardstyle" misslyckades, "Showtek FTS" fungerade.

Ett ID godkänns bara när `artistName` innehåller frågans artist och `trackName`
är titeln — ingen remix, ingen annan version. Skriptet kontrollerar det och
lämnar frågan utan ljud om det inte stämmer.

**Extra låtdagar för test:** lägg in datumet i `quiz.extra_latdagar` innan
någon hämtat dagens fråga — sedan står frågan fast. Startsidan och kontosidan
frågar efter dagens fråga åt inloggade besökare, så i praktiken låses den
strax efter midnatt. Lägg in datumet **dagen innan**:
`npx supabase db query --linked "insert into quiz.extra_latdagar values ('2026-10-09')"`

**Ljud och volym:** använd aldrig Web Audio för att styra volymen. Det kräver
CORS på ljudfilen, och misslyckas det blir det helt tyst i stället för dämpat —
ett svårare problem än det skulle lösa. Testa i stället om `audio.volume` biter
(iOS ignorerar den) och visa texten "Volym styrs med knapparna på telefonen" när
den inte gör det.

### Låtspelet

Låtspelets lista (`data/latspel.json`, `SEED_LATSPEL`) byggdes ur den gamla
`data/quiz.json` och byggs inte längre — den står still tills låtspelet
byggts om. Den kopplar ljudadress till artist och titel, så en fredagsfråga
vars låt finns i listan går att slå upp. Nya låtfrågor ska därför inte läggas
till i låtspelets lista förrän deras fredag har passerat.

---

## Faktakorrigeringar från Jonte

Han kan scenen. **Hans korrigeringar väger tyngre än research.**

- **Nedlagda av Q-dance, får aldrig listas som aktiva:** Qlimax (sista nov 2024),
  Qapital, The Qontinent, Q-BASE, Impaqt, EPIQ, alla X-Qlusive.
- **Vieze Asbak** är industrial och hard techno, inte uptempo. Kallas memetechno.
- **Fantasm** är hard techno.
- **REBiRTH** ligger i Helvoirt, inte Haaksbergen.
- **Defqon.1 2026** ställdes in efter första dagen, Nederländernas första kod röd
  för värme. Nästa: 24–27 juni 2027. Många behöll sina biljetter.
- **Klassikerlistan** ska vara gamla låtar alla kan, inte nya artister.
- **Snabbaste vägen ut från mainstage** är bakom scenen.

**Verifiera alltid biljettlänkar.** Prioritering: arrangörens egen biljettsida,
sen officiell leverantör, sen startsidan. Är biljetterna inte släppta, sätt
`urlText` så knappen inte lovar något som inte finns.

---

## Ton och design

Mörkt, hårt, kompromisslöst. Passar ämnet.

- **Gör den inte "vänligare".** Mjuka, rundade, generiska drag gör att den ser
  ut som vilken sida som helst och tappar trovärdighet i scenen.
- **Inga påhittade emblem eller certifikat.** Det som bygger förtroende är att
  säga vem som ligger bakom, hur ofta sidan uppdateras, och att den saknar
  annonser och cookies. Allt tre är sant. Skriv inte "ingen spårning":
  sajten räknar sidvisningar med GoatCounter, utan cookies och utan att
  känna igen besökare, och det står på integritetssidan.
- **Inget cringe.** Inga hjärtan, inga "made with love", inga utropstecken.
- Fem genrefärger: hardstyle (cyan), raw (rosa), uptempo (gul), hardcore
  (lila) och hard techno (grå). I koden heter de `hardstyle`, `raw`,
  `uptempo`, `hardcore` och `techno`. Äldre data kan ha `euphoric`, som
  räknas som hardstyle.
- **Färg betyder genre, aldrig dekoration.** Undantagen är exakt dessa:
  - Defqon-scenerna heter färger (RED, BLUE, BLACK, INDIGO, UV, MAGENTA,
    GREEN, PINK, GOLD) och får en prick i sin egen färg i Defqon-guidens
    scenlista. BLACK har en ljus ring så den syns mot bakgrunden.
  - I spelen: rätt svar i cyan, fel svar i rosa och klockans sista tio
    sekunder i rosa.

  Färgen står aldrig ensam — alltid tillsammans med ikon eller text. Inga fler
  undantag.
- BPM visas inte — Spotify lämnar inte ut den, och att gissa och presentera det
  som fakta är sämre än att utelämna.

**Skriv aldrig ut siffror eller påståenden du inte kan belägga.** Bättre att
säga "många" än att hitta på en procentsats.

---

## Innan du säger att något är klart

**Kör kontrollskriptet:** `node scripts/kontrollera.mjs`

Det går igenom alla 13 sidor och larmar för:

- obalanserade taggar, JavaScript som inte parsar, och mer än ett eget
  `<style>`-block
- `getElementById`-mål som inte finns, och dubbletter av id
- JSON-filer som inte parsar
- brutna interna länkar, relativa sökvägar och `url()` i `stil.css` som leder
  ingenstans
- obalanserade klamrar i CSS:en, och inmatningsfält under 16 px
- saknade eller felvända markörer för byggskriptet
- meny eller sidfot som skiljer sig mellan sidorna
- två skript på samma sida som deklarerar samma namn
- gamla typsnitt, monospace eller anrop till Google Fonts

Det kan inte se hur sidan ser ut. Titta själv, på mobil och dator:
`node scripts/lokal-server.mjs` visar sajten som GitHub Pages gör, med rena
adresser och felsidan, och skriver ut adressen för mobilen på samma wifi.
Mobilen: inget bredare än 360 px och tryckytor minst 44 px.

**Kör bygget efter varje ändring i datafilerna:**
`node scripts/bygg-metadata.mjs`

---

## Arbetssätt

Jonte vill ha **ett steg i taget**, inte allt på en gång. Han bygger i GitHubs
webbgränssnitt och har inte programmeringsvana — förklara vad som ska klickas,
inte vad koden gör.

Han ställer bra kontrollfrågor. Tar han upp något som verkar fel, **kolla efter
i stället för att försvara.** Han har haft rätt varje gång.

Säg när något inte går. Att lova en funktion som kräver en server, eller att
ranka på ordet "hardstyle" mot sajter med tio års historik, hjälper ingen.
