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

Bärande idé: **allt utom tre datafiler ska sköta sig självt.**

---

## Filstruktur

Rena adresser utan filändelse. Varje sida är en `index.html` i egen mapp.

```
index.html              →  hardlist.se/
events/index.html       →  hardlist.se/events/
guider/index.html       →  hardlist.se/guider/
nyborjare/index.html    →  hardlist.se/nyborjare/
anthems/index.html      →  hardlist.se/anthems/
quiz/index.html         →  hardlist.se/quiz/
404.html                →  egen felsida
CNAME                   →  RADERA ALDRIG. Utan den slutar domänen fungera.
```

Alla länkar och alla `fetch()` måste vara **absoluta** (`/events/`,
`/data/quiz-live.json`). Relativa sökvägar bryts eftersom sidorna ligger i
undermappar.

---

## CSS ligger inbakad i varje sida

`style.css` är **bara en referenskopia**. Sidorna använder ett `<style>`-block
högst upp i filen.

Ändrar du CSS: redigera `style.css`, och inlina sedan om i **alla sju** sidorna.
Glömmer du en sida ser den annorlunda ut än resten — det har hänt, och det syns
direkt på headern.

Kontrollera alltid att klammerparenteserna balanserar efteråt.

---

## Filer du får redigera för hand

Exakt fyra:

```
data/events.json     kalender och bevakningslista
data/quiz.json       quizfrågor
data/anthems.json    anthem-arkivet
data/kommande.json   kommande släpp, pre-save-länkar
```

`data/kommande.json` går inte att bygga automatiskt. Spotify har ingen
endpoint för osläppt material — allt skriptet kan hämta är redan utgivet.
Försök inte ersätta filen med ett script eller en workflow; den är och
förblir handskriven.

## Filer du ALDRIG får skriva eller ladda upp

```
data/releases.json      data/artist-ids.json     data/ljud.json
data/quiz-live.json     kalender.ics             releaser.xml
```

De byggs av GitHub Actions. Skriver du en tom eller ofullständig version
raderas serverns riktiga innehåll.

**Det har hänt två gånger.** Första gången försvann hela releaselistan, andra
gången 47 ljudadresser till quizet. Skripten har numera spärrar som vägrar
skriva över större data med mindre, men rör dem inte alls.

Samma sak gäller `SEED_QUIZ` i `quiz/index.html` och `SEED_EVENTS` i
`index.html`. De är reservkopior som byggskriptet fyller. Kör du bygget utan
nätverk skrivs de tomma.

---

## Spotify — hårda gränser, uppmätta i praktiken

| Sak | Läge |
|---|---|
| Dagskvot i Development Mode | tar slut runt **200 anrop**. Kör högst en gång per dygn. |
| `MAX_ANROP` | 170 per körning |
| Artistlista | 332 namn. Ett helt varv tar två dygn med full cache. |
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

En fråga per dygn, samma för alla, vald utifrån datumet. Poängen sparas i
`localStorage` och kan bara öka. Fel svar ger noll poäng men bryter sviten.

**Låtquiz på fredagar.** Musikfrågor spelar 30 sekunder från **Apples iTunes
Search API** — gratis, ingen inloggning, lagligt. Spotify går inte att använda
eftersom `preview_url` är död.

Söksträngen i `data/quiz.json` skickas **aldrig** till webbläsaren, den skulle
avslöja svaret. Byggskriptet skriver `data/quiz-live.json` utan den.

Söksträngar ska vara **bara artist och titel**. Lägger du till genrenamn hittar
iTunes ingenting — "Showtek FTS hardstyle" misslyckades, "Showtek FTS" fungerade.

`EXTRA_LATDAGAR` i `quiz/index.html` tvingar låtquiz på angivna datum. Används
för test. Passerade datum gör ingenting.

**Ljud och volym:** använd aldrig Web Audio för att styra volymen. Det kräver
CORS på ljudfilen, och misslyckas det blir det helt tyst i stället för dämpat —
ett svårare problem än det skulle lösa. Testa i stället om `audio.volume` biter
(iOS ignorerar den) och visa texten "Volym styrs med knapparna på telefonen" när
den inte gör det.

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
  annonser och spårning. Allt tre är sant.
- **Inget cringe.** Inga hjärtan, inga "made with love", inga utropstecken.
- Fem genrefärger: euphoric, raw, uptempo, hardcore, techno.
- BPM visas inte — Spotify lämnar inte ut den, och att gissa och presentera det
  som fakta är sämre än att utelämna.

**Skriv aldrig ut siffror eller påståenden du inte kan belägga.** Bättre att
säga "många" än att hitta på en procentsats.

---

## Innan du säger att något är klart

- Alla sju HTML-filer: balanserade taggar, ett `<style>`-block, giltig JS
- Alla `getElementById`-mål finns i markup
- Inga dubbletter av id
- JSON-filerna parsar
- Inga brutna interna länkar
- Klamrarna i `style.css` balanserar
- Mobilen: inget bredare än 360 px, tryckytor minst 44 px, `font-size: 16px` på
  inmatningsfält så iOS inte zoomar

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
