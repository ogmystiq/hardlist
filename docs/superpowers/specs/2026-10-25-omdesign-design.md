# Omdesign av HARDLIST: design

Fas 1 är klar och Jontes svar är inbyggda. CLAUDE.md gäller före alla skills.
Planen ligger i `docs/superpowers/plans/2026-10-25-omdesign.md`. Skärmbilder
av den valda riktningen ligger i `docs/superpowers/bilder/`, se Skärmbilder sist.

## Syfte

Sajten ska se snyggare, modernare och mer premium ut, utan att bli "vänligare".
Premiumkänslan i förebilderna (songspot.co, q-dance.com, defqon1.com, ra.co,
boilerroom.tv) kommer från svart bakgrund, stora rubriker, få ytor och luft.
Deras versaler och loggor tas inte med.

Första skärmen på startsidan ska få folk att vilja stanna. Den ska se
intressant ut direkt och visa att sajten lever (Jonte).

**Mål**
- Varje sida har en tydlig viktordning.
- Första mobilskärmen visar det viktigaste.
- Det finns ett enda sätt att visa "valt".
- Bakgrunden ger en känsla utan att dra uppmärksamhet.
- Genreriggen är HARDLIST:s kännetecken, och resten hålls tyst.

**Inte mål**
- Nya funktioner.
- Nya texter, utöver det layouten kräver.
- Ändringar i `supabase/`, RPC-anrop, quizfrågor, reservkopior, byggmarkörer eller filer som boten genererar.

**Det som gör omdesignen misslyckad, även om den fungerar**
- Den blir mjuk och rundad som vilken sida som helst.
- Färg används som dekoration.
- Något rör sig när sidan laddas.
- Riggen visar något som inte stämmer med listan under den.

## Beslut

| Fråga | Beslut |
|---|---|
| Riktning | A, Svart scen, med C:s fasade huvudknappar. Riggen är kännetecknet. |
| Startsidans ordning | Riggen överst som blickfång, sedan Dagens fråga och Dagens låt som en tunn rad direkt under, sedan releaserna och sist topplistan och eventen. |
| Archivo bred till små etiketter | Ja |
| Filterknappar | Fyllda, inga ramar |
| Var designen ligger | `docs/superpowers/`, committad |

## Tillvägagångssätt

| Riktning | Vad den ger | Vad den kostar |
|---|---|---|
| **A, Svart scen (vald)** | Lugnast och mest exklusiv. Innehållet kommer först. | Ser lätt generisk ut utan riggen, eftersom helsvart med en accentfärg är vanligt. |
| B, Laserljus | Närmast dagens sajt. | Löser minst av granskningen, eftersom ytorna fortfarande har samma tyngd. |
| C, Stål | Hårdast och mest egen. | Klippta hörn på alla ytor blir tungt i listor. |

Jonte valde A med C:s fasade huvudknappar.

## Genreriggen

Riggen ser ut som en ljusrigg över en scen. En vågrät bom löper överst, och
under den hänger fem lampor i fast ordning: Hardstyle, Raw, Uptempo, Hardcore
och Hard techno. Varje lampa lyser nedåt i sin genres färg. Ljuskäglans längd
visar hur många släpp genren fått de senaste sju dagarna.

**Siffrorna**
- Riggen räknar exakt samma släpp som "Senaste sju dagarna" på releasesidan: datum från idag minus sex dagar till och med idag, i svensk tid, både singlar och album. Släpp med datum efter idag räknas inte.
- Genren normaliseras på samma sätt som i `rader.js` (`normGenre`). En räkning finns bara på ett ställe, och både startsidan och releasesidan använder den.
- Data kommer ur `data/releases.json`, samma hämtning som listan. Det finns ingen reserv, och ingen ska läggas till: påhittade släpp är sämre än ett ärligt fel.
- Riggen räknar veckan, och listan följer sina regler som i dag (`gransFor` i `rader.js`). Album syns i listan i 30 dagar, och startsidan visar högst sex rader (`NYTT_ANTAL`). Listans regler ändras inte. När en lampa är vald står det därför över listan: "Raw, 11 släpp de senaste sju dagarna." och en länk "Alla på releasesidan". Ett album som är äldre än sju dagar har etiketten Album, som i dag. *Mitt beslut.*

**När releaserna inte går att hämta:** riggen visar bommen men inga lampor
och ingen siffra, aldrig nollor, eftersom noll vore fel. Där står
"Releaserna gick inte att hämta.", samma text som listan har i dag, och
knappen "Försök igen", som hämtar på nytt. *Mitt beslut.*

**Ljusets längd**
- Längden är antalet delat med det största av veckans största genreantal och 6, så att en lugn vecka också ser lugn ut. Med 21 släpp lyser Raw (11) fullt. Med tre släpp når ingen lampa mer än halva längden.
- En genre med ett släpp lyser alltid minst 12 procent, så att den syns.
- En genre med noll släpp är släckt: bara lampan syns, utan kägla, och siffran 0 står under.
- Varje lampa har sitt namn och sitt antal i text under sig, så färgen står aldrig ensam.

**Texterna**
- Stort antal: "21" i det smala snittet, vikt 900, med "släpp de senaste sju dagarna" bredvid.
- Raden som visar att sajten lever: "Uppdaterad idag 06:14", ur `data/status.json` (`uppdaterad`). Är den inte från idag står datumet: "Uppdaterad 24 oktober". Raden följer samma regel som sidfotens statusrad i `ram.js`, som inte heller tittar på `avbrott`. Ett avbrott betyder att kvoten tog slut under körningen, inte att inget uppdaterades. *Mitt beslut.*
- Under står "Senast in:", följt av titel och artister för ett enda släpp, det första i listan. Raden blir aldrig mer än en rad och kortas med tre punkter. *Mitt beslut.*
- En vecka utan släpp: alla lampor släckta och "Inga släpp de senaste sju dagarna." Det står ingen tid för nästa hämtning, eftersom den inte kan lovas.

**Som filter**
- Lamporna är knappar (`aria-pressed`) som filtrerar releaselistan, precis som dagens filterknappar. På startsidan står den tunna spelraden mellan riggen och listan.
- En vald lampa får en vit ring runt lampan, och de andras käglor dämpas. Käglans längd ändras aldrig, så att den alltid visar antalet. *Mitt beslut.*
- "Visa alla" syns bredvid siffran bara när en lampa är vald. Med sex knappar i bredd hade lamporna blivit för smala på 360 px. *Mitt beslut.*
- Dämpningen händer bara när man trycker, och står still med `prefers-reduced-motion`.
- En släckt lampa (noll släpp) går att välja och visar då "Inga släpp i Uptempo den här veckan."
- Valet är samma som releasesidans filter. Startsidan sparar det inte, precis som i dag.

**Storlek**
- Mobil: hela bredden, ungefär 380 px hög inklusive siffran och texterna. Käglan är högst 132 px, så att rubriken för releaserna syns på första skärmen. Lamporna är minst 56 px breda med tryckytor på minst 44 px.
- Dator: hela innehållsbredden, ungefär 340 px hög.
- Ingen rörelse när sidan laddas och inget som blinkar.

## Startsidan

**Mobil**, uppifrån:
1. Toppen med logga och Logga in.
2. Riggen.
3. Dagens fråga och Dagens låt som en tunn rad, två rutor sida vid sida med 2 px glipa. Hela rutan är länken, utan rosa knapp och utan stor siffra, eftersom konturerna krockade med texten (Jonte). Fritt spel står som en smal rad under.
4. Releaserna, filtrerade av riggen.
5. Topplistan.
6. Eventen.
7. Sidfoten och bottenmenyn.

**Dator:** riggen över hela bredden, och den tunna raden med Dagens fråga, Dagens låt och Fritt spel direkt under. Sedan releaserna till vänster, och topplistan och eventen i en spalt till höger. Spalten till höger är mitt beslut: på dator syns allt samtidigt, så ordningen spelar mindre roll där.

Rutorna i den tunna raden har en kort rad under rubriken. Den ersätts av
samma lägen som sidan visar i dag, till exempel "Du har svarat idag. Ny fråga
i morgon." (`fragaText`) och "Rätt på 1 s idag. Ny låt i morgon." (`latText`).
Texten kortas inte. Rutan växer på höjden i stället. Det som i dag sätts med
`satKnapp` blir rutans länktext, och id:na står kvar, så att skriptet inte
behöver ändras mer än nödvändigt.

## UX-granskningen, sammanfattad

Den tidigare granskningen stämmer i alla tolv punkter. Mätningen hittade inga
knappar under 44 px, bara länkar inne i löptext. Poängtrappan har kontrast
5,1:1, men texten är för liten.

Det som saknades:
1. Det finns fyra olika sätt att visa "valt".
2. Genren visas tre gånger på releasesidan.
3. Två rosa knappar står sida vid sida på startsidan.
4. Sidfoten på mobil tar nästan en hel skärm.
5. Bottenmenyn visar för svagt var man är.
6. Felrader säger inte vad man gör härnäst.
7. Spelsidorna och guiderna lämnar halva datorskärmen tom.

## Designsystemet

UI UX Pro Max föreslog stilen Dark Mode (OLED). Typsnitten och färgerna den
föreslog togs inte med, se konflikterna. Värdena läggs i tre lager:
grundvärden, betydelser och komponenter. Sidornas CSS använder bara
betydelserna.

| Betydelse | Värde | Används till |
|---|---|---|
| `--bg` | #070708 | Sidan |
| `--yta` | #111114 | Rutor, bara en nivå |
| `--yta-2` | #1A1A1F | Hovring och fyllda ovalda knappar |
| `--linje` | vitt 14 % | Linjer mellan rader |
| `--text` | #F4F4F6 | Text, rubriker och fyllningen i valt läge |
| `--text-2` | #B4B4BE | Brödtext och metadata (9,6:1) |
| `--text-3` | #8A8A95 | Datum och källrad (5,6:1) |
| `--mork-text` | #0B0B0D | Text på rosa och på valt läge |
| `--rosa` | #FF3B6B | Bara huvudknappar |
| Genrefärgerna | Oförändrade | Bara genre: riggen, prickar och omslagsrutor |
| `--horn` | 3 px | Knappar, filter och valrutor |
| `--horn-stor` | 4 px | Rutor |
| `--glipa` | 2 px | Mellan spelrutor och valrutor |
| Fasning | 10 px | Bara huvudknappar |

**Gamla namn:** `--natt`, `--yta`, `--yta-2` och `--text*` behålls och får de
nya värdena (`--natt` blir samma som `--bg`). `profilstat.css` läser dem och
följer då med i den nya färgskalan, vilket är meningen. `badges.css` använder
egna färger och påverkas inte. Varken `badges.js`, `badges.css` eller
`profilstat.css` ändras för hand. *Mitt beslut.*

**Typografi:** bara Archivo, ur `/typsnitt/`.
- Rubriker i det smala snittet (62 %) med vikt 900. h1 är 50 px på mobil och 72 px på dator. Sektionsrubriker är 32 px och rutrubriker 34 px.
- Brödtexten är 16 px och metadata 14 px. Ingen text är mindre än 13 px.
- Små etiketter ovanför val, som "Genre" och "Svårighet", står i det breda snittet (118 %), 13 px och vikt 650, med stor bokstav bara först.
- Siffror i listor har jämn bredd (`tabular-nums`).

**Komponenter**
- **Valt läge:** fyllt med `--text` och `--mork-text`. Gäller filter, lägesväljare, valrutor, svårighet. Lampan i riggen visar valt med en vit ring i stället, se Som filter.
- **Ovalda knappar:** fyllda med `--yta` eller `--yta-2`, utan ram.
- **Huvudknapp:** rosa med 10 px fasning uppe till vänster och nere till höger. Fasningen ligger på ett `::before`-lager, så att fokusringen aldrig klipps.
- **Sektionshuvud:** en vit linje på 4 px över, rubriken och en "Alla …"-länk till höger. Bara över sidans sektioner, aldrig inne i rutor.
- **Spelruta:** rubrik, en mening och en knapp, med den konturerade siffran ("30" eller "0,5") uppe till höger. Bara i de stora spelrutorna på `/spel/`, aldrig i den tunna raden på startsidan och aldrig bakom text.
- **Skivomslag:** Spotifys omslag ur `data/releases.json` (fältet `omslag`, alla 26 släpp har det den 25 oktober 2026). `rader.js` visar dem redan, och bokstavsrutan tar bara över när adressen saknas eller bilden inte laddar (`omslag()` och felhanteraren i `rader.js`). Den logiken ändras inte. Spotifys villkor gäller: aldrig beskuret och inget ovanpå. Bilden får 3 px hörn (`--horn`), högst 4 px. Bokstavsrutan får samma storlek och samma hörn, så att reserven inte ser ut som ett annat element. Skisserna och skärmbilderna i fas 1 visar bokstavsrutor, eftersom sessionen som tog dem inte nådde i.scdn.co. På hardlist.se visas omslagen.
- **Poängtrappan:** staplar där höjden är poängen, med klipplängd och försök under.
- **Bakgrund:** en stillastående strålkastare uppifrån, utan rutnät och utan brus.
- **Fokus:** 2 px cyan ring med 2 px avstånd, som i dag.
- **Fel och tomma lägen:** en rad som säger vad som hänt och vad man gör, och en knapp om det finns något att göra, till exempel "Försök igen".

## Varje sida

| Sida | Ändras |
|---|---|
| Start | Som ovan. |
| Releaser | Samma rigg, lägre (ungefär 180 px). Sökrutan direkt under och källraden sist i listan. Första släppet ska synas på första mobilskärmen. |
| Event | Region och genre som två grupper med egna etiketter. "Biljetter" bara på nästa event, de andra raderna är länkar. |
| Guider | En innehållsspalt med en kolumn för rubrikerna bredvid på dator. |
| Spel | Tre lika spelrutor med 2 px glipa och resten som rader. |
| Fritt spel och Dagens låt | Poängtrappan som staplar, och två spalter på dator. Spellogiken ändras inte. |
| Quiz | Samma rubrikrad och knappar. Klockans sista tio sekunder i rosa, som i dag. |
| Topplistan | Perioden som en lägesväljare (Månaden och Totalt), och spelet som fyllda filterknappar under. De två ska se olika ut. |
| Badges | Bara ramen och rubrikraden. `badges.js` och `badges.css` ändras inte. |
| Scenen, Nybörjare och Anthems | Textsidor som guiderna. |
| Konto och profil | Samma rubrikrad som andra sidor, utan bakåtpil. |
| Integritet och 404 | Ramen och textstilen. Påskäggets logik och ledtråd ändras inte. |

## Begränsningar

- Menyn och sidfoten finns som kopior i varje sida och måste vara identiska.
- `rader.js` delar namnrymd med sidornas skript. Nya delade namn måste kollas mot alla sidor som laddar den.
- `stil.css` ändras, och då byts `?v=` i alla sidor.
- En sida får ha högst ett eget `<style>`-block.
- Delningsbilder och ikonfiler ändras inte.
- Mobil: inget bredare än 360 px och tryckytor på minst 44 px.

## Konflikter mellan skills och CLAUDE.md

| Skill säger | CLAUDE.md säger | Beslut |
|---|---|---|
| ui-ux-pro-max: andra typsnitt, från Google Fonts | Bara Archivo, och inga anrop till Google | Archivo |
| ui-ux-pro-max: grön eller guld som accentfärg | Rosa är enda färgen för huvudknappar | Rosa |
| ui-ux-pro-max: sektioner tonar in när man rullar | Rörelse bara som svar på något man gör | Ingen rörelse |
| design-system: aldrig råa färgvärden i komponenter | Inget emot | Ett lager med betydelser i `stil.css` |
| frontend-design: undvik etiketter ovanför innehåll | Inget emot | Etiketterna står kvar, eftersom valen behöver dem |

## Lämnat till den som bygger

- Exakta mellanrum inom de värden som står här.
- Hur riggens kägla ritas (gradient, SVG eller båda), så länge den är stillastående, inte klipper fokusringen och klarar 360 px.
- Hur skärmbilderna i kontrollen tas.

## Skärmbilder

Riktning A med Jontes svar inbyggda. Skisserna själva ligger inte i repot.

- Startsidan på 360 px: `bilder/start-mobil.jpg`
- Startsidan på dator: `bilder/start-dator.jpg`
- Riggens lägen på 360 px, från vänster: vanlig vecka, lugn vecka (tre släpp), Raw vald och hämtningen misslyckad: `bilder/start-riggens-lagen-mobil.jpg`
- Fritt spel på 360 px och dator: `bilder/fritt-spel-mobil.jpg` och `bilder/fritt-spel-dator.jpg`

De stora siffrorna 30 och 0,5 i den tunna raden syns i bilderna men är borttagna
efter Jontes svar. Bokstavsrutorna syns i stället för omslagen, eftersom
sessionen inte nådde i.scdn.co. Namn och poäng i topplistan är exempel. Allt
annat är riktiga data
från 25 oktober 2026.
