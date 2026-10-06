# HARDLIST

Releaser, event och spel för den hårda scenen i Norden. Ligger på
[hardlist.se](https://hardlist.se), publicerad med GitHub Pages från `main`.

Nya släpp hämtas varje morgon från Deezer och Spotify. Kalendern, guiderna och
anthem-arkivet bygger på tre datafiler som skrivs för hand. Quizet och kontona
ligger i Supabase.

**Arbetsreglerna står i [`CLAUDE.md`](CLAUDE.md)** — vad som får ändras för
hand, Spotifys gränser, hur quizet fungerar och designreglerna. Läs den innan
du ändrar något. Den här filen beskriver bara vad som finns var.

---

## Sidorna

Varje sida är en `index.html` i egen mapp, så att adresserna saknar filändelse.

| Adress | Innehåll |
|---|---|
| `/` | Idag: dagens fråga, dagens låt, topplistan, nytt den här veckan, snart |
| `/releaser/` | Alla släpp, grupperade per dag, med genrefilter och sökning |
| `/events/` | Kalendern, festivalguiderna och en karta över ett festivalområde |
| `/guider/` | Campingguiden: packlista och regler per festival |
| `/spel/` | Ingång till quizet och låtspelet |
| `/quiz/` | Dagens fråga, rättas på servern, topplista med konto |
| `/latspel/` | Känn igen dagens låt på sex klipp, och dueller |
| `/scenen/` | Ingång till nybörjarguiden och anthem-arkivet |
| `/nyborjare/` | Stilarna, artisterna, klassikerna och slangen |
| `/anthems/` | Festivalernas anthems år för år |
| `/konto/` | Inloggning med Google, visningsnamn, radera kontot |
| `/integritet/` | Vad som sparas och var |
| `404.html` | Felsidan |

Gemensamt för alla sidor:

```
stil.css          all gemensam stil — ändra ?v= i alla sidor när den ändras
ram.js            statusraden i sidfoten, läser data/status.json
inloggning.js     inloggningen, laddar Supabase bara när den behövs
rader.js          releaseraden, delad av startsidan och /releaser/
typsnitt/         Archivo med licens, så att inget hämtas från Google
```

## Datafilerna

**Tre filer skrivs för hand.** Allt annat i `data/` skrivs av skript — rör det
inte, se `CLAUDE.md`.

### `data/events.json` — kalendern och bevakningslistan

```json
{
  "name": "Sana Duri",
  "date": "2027-01-30",
  "dateEnd": "2027-01-31",
  "region": "norden",
  "genrer": ["hardstyle", "raw"],
  "city": "Mölndal, SE",
  "venue": "Åby Arena",
  "lineup": "En eller två meningar om eventet.",
  "url": "https://arrangorens-biljettsida",
  "urlText": "Biljetter",
  "arrangor": "Arrangören"
}
```

- `region` är `norden` eller `europa` och styr filtret. Norden är förvalt.
- `genrer` är en lista med `hardstyle`, `raw`, `uptempo`, `hardcore` och
  `techno`. Tom lista hellre än gissad — ett event utan genre syns bara när
  ingen genre är vald.
- `dateEnd` för event med flera dagar. Eventet står kvar i kalendern tills
  sista dagen passerat.
- Utan `date` hamnar eventet i bevakningslistan. Sätt då `season`, till
  exempel `"normalt i maj"`, och lägg till `date` när datumet släpps.
- `urlText` när knappen ska säga något annat än Biljetter, till exempel
  Förhandsanmälan. Leta alltid upp biljettlänken: arrangörens egen
  biljettsida först, sen officiell leverantör, sen startsidan.

### `data/anthems.json` — anthem-arkivet

En post per festival med namn, ort, intro, en not och en lista med år, titel
och artist.

### `data/kommande.json` — förhandssläpp

```json
[{ "artist": "D-Sturb", "titel": "Låttitel", "datum": "2026-11-13", "genre": "raw", "lank": "https://pre-save-länk" }]
```

Visas under Kommande på releasesidan. Passerade datum försvinner av sig
själva. Filen kan inte byggas automatiskt — Spotify lämnar inte ut osläppt
material.

**Kör bygget efter varje ändring i datafilerna:** `node scripts/bygg-metadata.mjs`.
Det skriver om reservkopiorna i sidorna, den strukturerade datan för Google,
`kalender.ics`, `releaser.xml` och datumen i `sitemap.xml`. Morgonkörningen
gör samma sak.

## Morgonkörningen

`.github/workflows/releaser.yml` körs varje dag 05:07 UTC. Den hämtar nya släpp
(`scripts/hamta-releaser.mjs`), bygger metadata och committar resultatet.
Hur Deezer, Spotify och rotationen samspelar står i `CLAUDE.md`.

Singlar ligger kvar i en vecka och album i en månad. Fönstren står som
`DAGAR_BAKAT` och `DAGAR_BAKAT_ALBUM` i hämtningsskriptet och som `DAGAR_VISAS`
och `DAGAR_VISAS_ALBUM` i `rader.js`. Ändras de ska paren ändras tillsammans.

`data/status.json` visar hur senaste körningen gick: när, hur många släpp, hur
många som har omslag, och om något avbröts. Sidfoten läser den.

### Sätta upp Spotify

1. Kontot som äger appen måste ha Spotify Premium.
2. developer.spotify.com → Dashboard → Create app. Redirect URI
   `http://127.0.0.1:8888` (fältet används inte, men måste fyllas i). Kryssa i
   Web API och spara.
3. I GitHub: Settings → Secrets and variables → Actions. Lägg in `SPOTIFY_ID`
   och `SPOTIFY_SECRET`. Skicka aldrig nyckeln till någon.
4. Settings → Actions → General → Workflow permissions: Read and write.

Kör inte workflowen manuellt flera gånger samma dag — se `CLAUDE.md`.

## Quizet och kontona

Frågebanken, svaren och kontona ligger i Supabase, inte i repot, eftersom repot
är publikt. Databasens struktur står i `supabase/migrations/`. Nya migrationer
körs med `npx supabase db push`. Hur frågor läggs till står i `CLAUDE.md`.

## Prova lokalt

```
node scripts/lokal-server.mjs      visar sajten som GitHub Pages gör, port 8080
node scripts/kontrollera.mjs       kontrollerar alla sidor innan något pushas
```

Servern skriver ut en adress för mobilen på samma wifi. Inloggningen fungerar
lokalt på `localhost:8080`, som är godkänd i Supabase.

## Byta mailadress

`hardlisthelp@gmail.com` står i sidfoten på alla sidor, i tipsa- och
rättelselänkarna och på integritetssidan. Sök och ersätt i alla
`index.html` och `404.html`.
