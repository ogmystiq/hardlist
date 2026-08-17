/**
 * HARDLIST — hämtar nya releaser från Spotify och skriver data/releases.json
 *
 * Kör:  SPOTIFY_ID=xxx SPOTIFY_SECRET=yyy node scripts/hamta-releaser.mjs
 * Kräver Node 18+ (inbyggd fetch). Inga npm-paket.
 *
 * VIKTIGT: sedan mars 2026 kräver Spotify att den som äger appen har ett
 * aktivt Premium-abonnemang. Löper det ut slutar appen fungera direkt, och
 * börjar fungera igen när du förnyar.
 *
 * Endpoints som används (båda finns kvar efter februari 2026-migreringen):
 *   GET /search?type=artist        max limit är numera 10, vi använder 1
 *   GET /artists/{id}/albums       max limit är numera 10 (var 50) — vi
 *                                  bläddrar två sidor för att täcka 20 album
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* 1. SCENEN — inte en smaklista. Målet är att täcka alla stora namn   */
/*    så att sajten funkar för alla som kollar efter nya releaser.     */
/*    Genren styr färg och uppskattad BPM.                             */
/*    Giltiga: euphoric | raw | uptempo | hardcore | techno            */
/* ------------------------------------------------------------------ */
const ARTISTS = [
  /* --- euphoric / melodic hardstyle --- */
  { name: 'Headhunterz',            genre: 'euphoric' },
  { name: 'Wildstylez',             genre: 'euphoric' },
  { name: 'Brennan Heart',          genre: 'euphoric' },
  { name: 'Da Tweekaz',             genre: 'euphoric' },
  { name: 'Coone',                  genre: 'euphoric' },
  { name: 'Atmozfears',             genre: 'euphoric' },
  { name: 'D-Block & S-te-Fan',     genre: 'euphoric' },
  { name: 'Sound Rush',             genre: 'euphoric' },
  { name: 'Devin Wild',             genre: 'euphoric' },
  { name: 'Refuzion',               genre: 'euphoric' },
  { name: 'Audiotricz',             genre: 'euphoric' },
  { name: 'Code Black',             genre: 'euphoric' },
  { name: 'Noisecontrollers',       genre: 'euphoric' },
  { name: 'Frontliner',             genre: 'euphoric' },
  { name: 'Bass Modulators',        genre: 'euphoric' },
  { name: 'Wasted Penguinz',        genre: 'euphoric' },
  { name: 'Sub Sonik',              genre: 'euphoric' },
  { name: 'Hard Driver',            genre: 'euphoric' },
  { name: 'Sephyx',                 genre: 'euphoric' },
  { name: 'Toneshifterz',           genre: 'euphoric' },
  { name: 'Psyko Punkz',            genre: 'euphoric' },
  { name: 'Zatox',                  genre: 'euphoric' },

  /* --- raw / rawstyle --- */
  { name: 'Rebelion',               genre: 'raw' },
  { name: 'Sub Zero Project',       genre: 'raw' },
  { name: 'Warface',                genre: 'raw' },
  { name: 'D-Sturb',                genre: 'raw' },
  { name: 'Act of Rage',            genre: 'raw' },
  { name: 'Radical Redemption',     genre: 'raw' },
  { name: 'Ran-D',                  genre: 'raw' },
  { name: 'Adaro',                  genre: 'raw' },
  { name: 'Rooler',                 genre: 'raw' },
  { name: 'Malice',                 genre: 'raw' },
  { name: 'Frequencerz',            genre: 'raw' },
  { name: 'B-Front',                genre: 'raw' },
  { name: 'Phuture Noize',          genre: 'raw' },
  { name: 'Digital Punk',           genre: 'raw' },
  { name: 'Delete',                 genre: 'raw' },
  { name: 'Deluzion',               genre: 'raw' },
  { name: 'E-Force',                genre: 'raw' },
  { name: 'Killshot',               genre: 'raw' },
  { name: 'Rejecta',                genre: 'raw' },
  { name: 'Riot Shift',             genre: 'raw' },
  { name: 'Unresolved',             genre: 'raw' },
  { name: 'Restrained',             genre: 'raw' },
  { name: 'Crypsis',                genre: 'raw' },
  { name: 'Regain',                 genre: 'raw' },
  { name: 'Aversion',               genre: 'raw' },
  { name: 'Never Surrender',        genre: 'raw' },
  { name: 'Vertile',                genre: 'raw' },
  { name: 'Requiem',                genre: 'raw' },

  /* --- uptempo --- */
  { name: 'Yoshiko',                genre: 'uptempo' },
  { name: 'Sickmode',               genre: 'uptempo' },
  { name: 'Bloodlust',              genre: 'uptempo' },
  { name: 'Deadly Guns',            genre: 'uptempo' },
  { name: 'Tha Watcher',            genre: 'uptempo' },
  { name: 'Hyrule War',             genre: 'uptempo' },
  { name: 'Dr. Donk',               genre: 'uptempo' },
  { name: 'Fraw',                   genre: 'uptempo' },

  /* --- hardcore / frenchcore --- */
  { name: 'Angerfist',              genre: 'hardcore' },
  { name: 'Dr. Peacock',            genre: 'hardcore' },
  { name: 'Partyraiser',            genre: 'hardcore' },
  { name: 'N-Vitral',               genre: 'hardcore' },
  { name: 'Miss K8',                genre: 'hardcore' },
  { name: 'Neophyte',               genre: 'hardcore' },
  { name: 'DJ Mad Dog',                genre: 'hardcore' },
  { name: 'Nosferatu',              genre: 'hardcore' },
  { name: 'Tha Playah',             genre: 'hardcore' },
  { name: 'Furyan',                 genre: 'hardcore' },
  { name: 'Destructive Tendencies', genre: 'hardcore' },
  { name: 'Sefa',                   genre: 'hardcore' },
  { name: 'Billx',                  genre: 'hardcore' },
  { name: 'Evil Activities',        genre: 'hardcore' },
  { name: 'Paul Elstak',            genre: 'hardcore' },

  /* --- hard techno / industrial ---
     Egen värld, inte en gren av hardstyle. Ligger med för att artisterna
     spelar samma festivaler och publiken överlappar. */
  { name: 'Vieze Asbak',            genre: 'techno' },

  /* --- saknades tidigare --- */
  { name: 'KELTEK',                 genre: 'euphoric' },
  { name: 'The Purge',              genre: 'raw' },
  { name: 'Jay Reeve',              genre: 'raw' },
  { name: 'Primeshock',             genre: 'euphoric' },
  { name: 'Nolz',                   genre: 'uptempo' },

  /* --- fler euphoric --- */
  { name: 'Showtek',                    genre: 'euphoric' },
  { name: 'Technoboy',                  genre: 'euphoric' },
  { name: 'Tuneboy',                    genre: 'euphoric' },
  { name: 'DJ Isaac',                   genre: 'euphoric' },
  { name: 'The Prophet',                genre: 'euphoric' },
  { name: 'Zany',                       genre: 'euphoric' },
  { name: 'Deepack',                    genre: 'euphoric' },
  { name: 'Donkey Rollers',             genre: 'euphoric' },
  { name: 'Pavo',                       genre: 'euphoric' },
  { name: 'Builder',                    genre: 'euphoric' },
  { name: 'Alpha²',                     genre: 'euphoric' },
  { name: 'Max Enforcer',               genre: 'euphoric' },
  { name: 'JDX',                        genre: 'euphoric' },
  { name: 'Aftershock',                 genre: 'euphoric' },
  { name: 'Ecstatic',                   genre: 'euphoric' },
  { name: 'Galactixx',                  genre: 'euphoric' },
  { name: 'Level One',                  genre: 'euphoric' },
  { name: 'Rebourne',                   genre: 'euphoric' },
  { name: 'Bass Chaserz',               genre: 'euphoric' },
  { name: 'Envine',                     genre: 'euphoric' },
  { name: 'Dailucia',                   genre: 'euphoric' },
  { name: 'The Pitcher',                genre: 'euphoric' },
  { name: 'Ummet Ozcan',                genre: 'euphoric' },
  { name: 'Bioweapon',                  genre: 'euphoric' },

  /* --- fler raw --- */
  { name: 'Titan',                      genre: 'raw' },
  { name: 'Chapter V',                  genre: 'raw' },
  { name: 'Nightcraft',                 genre: 'raw' },
  { name: 'Outsiders',                  genre: 'raw' },
  { name: 'Scarra',                     genre: 'raw' },
  { name: 'Imperatorz',                 genre: 'raw' },
  { name: 'Deetox',                     genre: 'raw' },
  { name: 'Gunz for Hire',              genre: 'raw' },
  { name: 'Minus Militia',              genre: 'raw' },
  { name: 'Chain Reaction',             genre: 'raw' },
  { name: 'Sogma',                      genre: 'raw' },
  { name: 'Cryex',                      genre: 'raw' },
  { name: 'So Juice',                   genre: 'raw' },
  { name: 'Exproz',                     genre: 'raw' },
  { name: 'Kronos',                     genre: 'raw' },
  { name: 'The Saints',                 genre: 'raw' },
  { name: 'Villain',                    genre: 'raw' },
  { name: 'D-Charged',                  genre: 'raw' },
  { name: 'Dimitri K',                  genre: 'raw' },
  { name: 'Sovereign',                  genre: 'raw' },
  { name: 'Hyperspace',                 genre: 'raw' },

  /* --- fler uptempo --- */
  { name: 'Ncrypta',                    genre: 'uptempo' },
  { name: 'BOMBSQUAD',                  genre: 'uptempo' },
  { name: 'MC Nolz',                    genre: 'uptempo' },

  /* --- fler hardcore --- */
  { name: 'Broken Minds',               genre: 'hardcore' },
  { name: 'Meccano Twins',              genre: 'hardcore' },
  { name: 'Art of Fighters',            genre: 'hardcore' },
  { name: 'Tommyknocker',               genre: 'hardcore' },
  { name: 'Amnesys',                    genre: 'hardcore' },
  { name: 'Unexist',                    genre: 'hardcore' },
  { name: 'Re-Style',                   genre: 'hardcore' },
  { name: 'Hellsystem',                 genre: 'hardcore' },
  { name: 'DJ Promo',                   genre: 'hardcore' },
  { name: 'Ophidian',                   genre: 'hardcore' },
  { name: 'Catscan',                    genre: 'hardcore' },
  { name: 'Rudeboy',                    genre: 'hardcore' },
  { name: 'D-Fence',                    genre: 'hardcore' },
  { name: 'Andy The Core',              genre: 'hardcore' },
  { name: 'Radium',                     genre: 'hardcore' },
  { name: 'The Melodyst',               genre: 'hardcore' },
  { name: 'The Sickest Squad',          genre: 'hardcore' },
  { name: 'Akira',                      genre: 'hardcore' },
  { name: 'Alienn',                     genre: 'hardcore' },
  { name: 'Drokz',                      genre: 'hardcore' },
  { name: 'Deathmachine',               genre: 'hardcore' },

  /* --- fler techno --- */
  { name: 'Lil Texas',                  genre: 'techno' },
  { name: 'Rebekah',                    genre: 'techno' },
  { name: 'Nico Moreno',                genre: 'techno' },
  { name: 'Sara Landry',                genre: 'techno' },
  { name: 'Hi-Lo',                      genre: 'techno' },

  /* --- euphoric, omgång 2 --- */
  { name: 'Scope DJ',                    genre: 'euphoric' },
  { name: 'A-lusion',                    genre: 'euphoric' },
  { name: 'DJ Duro',                     genre: 'euphoric' },
  { name: 'Hardheadz',                   genre: 'euphoric' },
  { name: 'Demi Kanon',                  genre: 'euphoric' },
  { name: 'A-RIZE',                      genre: 'euphoric' },
  { name: 'Ghost Stories',               genre: 'euphoric' },
  { name: 'Lady Faith',                  genre: 'euphoric' },
  { name: 'High Resistance',             genre: 'euphoric' },
  { name: 'Betavoice',                   genre: 'euphoric' },
  { name: 'Retrospect',                  genre: 'euphoric' },
  { name: 'Crystal Lake',                genre: 'euphoric' },
  { name: 'Emphasis',                    genre: 'euphoric' },
  { name: 'Audiofreq',                   genre: 'euphoric' },
  { name: 'Dr. Rude',                    genre: 'euphoric' },
  { name: 'Fenix',                       genre: 'euphoric' },

  /* --- raw, omgång 2 --- */
  { name: 'ANDY SVGE',                   genre: 'raw' },
  { name: 'ERABREAK',                    genre: 'raw' },
  { name: 'Thyron',                      genre: 'raw' },
  { name: 'Wolv',                        genre: 'raw' },
  { name: 'Disarray',                    genre: 'raw' },
  { name: 'Michael Phase',               genre: 'raw' },
  { name: 'Crossfight',                  genre: 'raw' },
  { name: 'Sledgehammers',               genre: 'raw' },
  { name: 'Sasha F',                     genre: 'raw' },
  { name: 'Avoc',                        genre: 'raw' },
  { name: 'Retaliation',                 genre: 'raw' },
  { name: 'JNXD',                        genre: 'raw' },
  { name: 'Inflame',                     genre: 'raw' },
  { name: 'Mirage',                      genre: 'raw' },
  { name: 'Brutalizer',                  genre: 'raw' },
  { name: 'Flux Overload',               genre: 'raw' },
  { name: 'Miss M',                      genre: 'raw' },
  { name: "D'Ort",                       genre: 'raw' },
  { name: 'Doris',                       genre: 'raw' },

  /* --- uptempo, omgång 2 --- */
  { name: 'JOSHA',                       genre: 'uptempo' },
  { name: 'Cybergore',                   genre: 'uptempo' },

  /* --- hardcore, omgång 2 --- */
  { name: 'Pinotello',                   genre: 'hardcore' },
  { name: 'Da Mouth Of Madness',         genre: 'hardcore' },
  { name: 'Endymion',                    genre: 'hardcore' },

  /* --- techno, omgång 2 --- */
  { name: 'Fantasm',                     genre: 'techno' },
  { name: 'Holy Priest',                 genre: 'techno' },
  { name: 'Kruelty',                     genre: 'techno' },
  { name: 'Winson',                      genre: 'techno' },
  { name: 'Novah',                       genre: 'techno' },
  { name: 'Nicolas Julian',              genre: 'techno' },
  { name: 'New Beat Order',              genre: 'techno' },
  { name: 'ZAPRAVKA',                    genre: 'techno' },
  { name: 'Samuel Moriero',              genre: 'techno' },
  { name: 'Jowi',                        genre: 'techno' },
  { name: 'JAZZY',                       genre: 'techno' },

  /* --- euphoric, omgång 3 --- */
  { name: 'TAC Team',                      genre: 'euphoric' },
  { name: 'Wildfyre',                      genre: 'euphoric' },
  { name: 'Xense',                         genre: 'euphoric' },
  { name: 'Zero Days',                     genre: 'euphoric' },
  { name: 'Aztech',                        genre: 'euphoric' },
  { name: 'Crisis Era',                    genre: 'euphoric' },
  { name: 'Firelite',                      genre: 'euphoric' },
  { name: 'Final Form',                    genre: 'euphoric' },
  { name: 'Focuz',                         genre: 'euphoric' },
  { name: 'The Vision',                    genre: 'euphoric' },
  { name: 'Digital Madness',               genre: 'euphoric' },
  { name: 'Clockartz',                     genre: 'euphoric' },
  { name: 'Adrenalize',                    genre: 'euphoric' },
  { name: 'Degos & Re-Done',               genre: 'euphoric' },
  { name: 'MERYLL',                        genre: 'euphoric' },
  { name: 'Drean',                         genre: 'euphoric' },
  { name: 'Serzo',                         genre: 'euphoric' },
  { name: 'Caelum',                        genre: 'euphoric' },
  { name: 'Boray',                         genre: 'euphoric' },
  { name: 'Max Alexander',                 genre: 'euphoric' },
  { name: 'LePrince',                      genre: 'euphoric' },
  { name: 'Snowflake',                     genre: 'euphoric' },
  { name: 'Alee',                          genre: 'euphoric' },
  { name: 'Neon Future',                   genre: 'euphoric' },
  { name: 'Bright Visions',                genre: 'euphoric' },
  { name: 'B-Freqz',                       genre: 'euphoric' },
  { name: 'NeoBallisticz',                 genre: 'euphoric' },
  { name: 'Hypnose',                       genre: 'euphoric' },
  { name: 'Distinction',                   genre: 'euphoric' },
  { name: 'Mark Vayne',                    genre: 'euphoric' },
  { name: 'Phyric',                        genre: 'euphoric' },
  { name: 'TNT',                           genre: 'euphoric' },

  /* --- raw, omgång 3 --- */
  { name: 'Toza',                          genre: 'raw' },
  { name: 'The Straikerz',                 genre: 'raw' },
  { name: 'Adjuzt',                        genre: 'raw' },
  { name: 'Dual Damage',                   genre: 'raw' },
  { name: 'Vexxed',                        genre: 'raw' },
  { name: 'DEEZL',                         genre: 'raw' },
  { name: 'GLDY LX',                       genre: 'raw' },
  { name: 'Mish',                          genre: 'raw' },
  { name: 'Omnya',                         genre: 'raw' },
  { name: 'Infliction',                    genre: 'raw' },
  { name: 'Levenkhan',                     genre: 'raw' },
  { name: 'Tharken',                       genre: 'raw' },
  { name: 'Satirized',                     genre: 'raw' },
  { name: 'The Dope Doctor',               genre: 'raw' },
  { name: 'Vasto',                         genre: 'raw' },
  { name: 'Livid',                         genre: 'raw' },
  { name: 'Kenai',                         genre: 'raw' },
  { name: 'Karbyde',                       genre: 'raw' },
  { name: 'T-Junction',                    genre: 'raw' },
  { name: 'Unfused',                       genre: 'raw' },
  { name: 'Sakyra',                        genre: 'raw' },
  { name: 'Trespassed',                    genre: 'raw' },
  { name: 'Major Conspiracy',              genre: 'raw' },
  { name: 'Akimbo',                        genre: 'raw' },
  { name: 'Code Crime',                    genre: 'raw' },
  { name: 'Epidemic',                      genre: 'raw' },
  { name: 'Decim8',                        genre: 'raw' },
  { name: 'Re-Mind',                       genre: 'raw' },
  { name: 'Invictuz',                      genre: 'raw' },
  { name: 'Hardphonix',                    genre: 'raw' },
  { name: 'Arzadous',                      genre: 'raw' },
  { name: 'GVBRX',                         genre: 'raw' },
  { name: 'Anklebreaker',                  genre: 'raw' },
  { name: 'Bass Prototype',                genre: 'raw' },
  { name: 'Invector',                      genre: 'raw' },
  { name: 'AlexSo',                        genre: 'raw' },
  { name: 'Vazooka',                       genre: 'raw' },
  { name: 'Jonjo',                         genre: 'raw' },
  { name: 'Rab-Beat',                      genre: 'raw' },
  { name: 'SL Complex',                    genre: 'raw' },
  { name: 'Yhimself',                      genre: 'raw' },
  { name: 'Baq',                           genre: 'raw' },
  { name: 'D-Attack',                      genre: 'raw' },
  { name: 'MasterOfTime',                  genre: 'raw' },
  { name: 'Tigaiko',                       genre: 'raw' },
  { name: 'Minoz',                         genre: 'raw' },
  { name: 'Murdock',                       genre: 'raw' },
  { name: 'TWSTD',                         genre: 'raw' },
  { name: 'Outbreak',                      genre: 'raw' },
  { name: 'Stormerz',                      genre: 'raw' },
  { name: 'Danny Scandal',                 genre: 'raw' },
  { name: 'Barber',                        genre: 'raw' },

  /* --- uptempo, omgång 3 --- */
  { name: 'Lekkerfaces',                   genre: 'uptempo' },
  { name: 'Krowdexx',                      genre: 'uptempo' },
  { name: 'Anderex',                       genre: 'uptempo' },
  { name: 'Luminite',                      genre: 'uptempo' },
  { name: 'Mutilator',                     genre: 'uptempo' },
  { name: 'Dither',                        genre: 'uptempo' },
  { name: 'Irradiate',                     genre: 'uptempo' },
  { name: 'GPF',                           genre: 'uptempo' },
  { name: 'Odium',                         genre: 'uptempo' },
  { name: 'Rawframez',                     genre: 'uptempo' },
  { name: 'Unproven',                      genre: 'uptempo' },
  { name: 'EQUAL2',                        genre: 'uptempo' },
  { name: 'Hysta',                         genre: 'uptempo' },
  { name: 'Neroz',                         genre: 'uptempo' },
  { name: 'Sins Of Insanity',              genre: 'uptempo' },
  { name: 'I Giocatori',                   genre: 'uptempo' },
  { name: 'Murda',                         genre: 'uptempo' },
  { name: 'Maxtreme',                      genre: 'uptempo' },
  { name: 'TNYA',                          genre: 'uptempo' },
  { name: 'Geck-O',                        genre: 'uptempo' },

  /* --- hardcore, omgång 3 --- */
  { name: 'Anime',                         genre: 'hardcore' },
  { name: 'Bloodfire',                     genre: 'hardcore' },
  { name: 'Bodyshock',                     genre: 'hardcore' },
  { name: 'Chaos Project',                 genre: 'hardcore' },
  { name: 'Djipe',                         genre: 'hardcore' },
  { name: 'F. Noize',                      genre: 'hardcore' },
  { name: 'Hardbouncer',                   genre: 'hardcore' },
  { name: 'I:gor',                         genre: 'hardcore' },
  { name: 'Korsakoff',                     genre: 'hardcore' },
  { name: 'Kurwastyle Project',            genre: 'hardcore' },
  { name: 'LunaKorpz',                     genre: 'hardcore' },
  { name: 'Noisekick',                     genre: 'hardcore' },
  { name: 'Paranoizer',                    genre: 'hardcore' },
  { name: 'Spitnoise',                     genre: 'hardcore' },
  { name: 'TerrorClown',                   genre: 'hardcore' },
  { name: 'The Dark Horror',               genre: 'hardcore' },
  { name: 'The Destroyer',                 genre: 'hardcore' },
  { name: 'The Viper',                     genre: 'hardcore' },
  { name: 'Tieum',                         genre: 'hardcore' },
  { name: 'Cryogenic',                     genre: 'hardcore' },
  { name: 'Jean Marie',                    genre: 'hardcore' },
  { name: 'GridKiller',                    genre: 'hardcore' },
  { name: 'The Darkraver',                 genre: 'hardcore' },
  { name: 'DJ Vince',                      genre: 'hardcore' }
];

/* Hur många dagar bakåt som hämtas och behålls. Sajten visar två grupper:
     Kommande     — releasedatum i framtiden
     Nyss släppt  — de senaste DAGAR_BAKAT dagarna
   Allt äldre rensas automatiskt ur data/releases.json vid varje körning.
   Höj till 14 eller 30 om du vill ha en längre svans. */
const DAGAR_BAKAT = 7;

/* Uppskattad BPM per genre. Spotify slutade ge ut BPM till nya appar
   i november 2024, så den här siffran är en gissning per genre.
   Vill du ha exakt BPM: skriv in den i OVERRIDE nedan. */
const BPM_PER_GENRE = { euphoric: 150, raw: 155, uptempo: 200, hardcore: 190, techno: 150 };

/* --- Kvotskydd ---------------------------------------------------------
   Development Mode har en daglig kvot per utvecklarkonto. Går den sönder är
   du utelåst i ett dygn. Därför tre spärrar:

   MAX_ANROP  hårt tak på antal API-anrop per körning. Nås det sparar
              skriptet det den hunnit och slutar. Artisterna roteras mellan
              körningar så alla kommer med över tid.
              OBS: dagskvoten går sönder runt 200 anrop. Workflowen kör därför
              DAGLIGEN med rotation istället för en gång i veckan. Ett helt varv
              tar ceil(antal artister / MAX_ANROP) dygn — med 333 artister alltså
              två dygn, väl inom sjudagarsfönstret sajten visar.
   MAX_VANTAN ber Spotify oss vänta längre än så avbryts körningen direkt
              istället för att ligga och hamra på kvoten.
   PAUS       paus mellan anrop.
------------------------------------------------------------------------ */
/* Uppmätt i praktiken: dagskvoten i Development Mode tar slut runt 200 anrop.
   Taket ligger därför med marginal under det. Kör HÖGST EN GÅNG PER DYGN tills
   artist-cachen är komplett — då kostar ett helt varv bara 80 anrop. */
const MAX_ANROP    = 170;
/* Minsta antal följare för att en namnträff ska godtas — men bara när Spotify
   faktiskt lämnar ut siffran. Sedan de tog bort fältet ur söksvaret ligger
   kontrollen vilande. Den vaknar av sig själv om fältet återkommer. */
const MIN_FOLJARE  = 2000;
const MAX_VANTAN   = 180;   /* längsta enskilda väntan vi accepterar, sekunder */
const TIDSBUDGET   = 8 * 60;/* hela körningen, sekunder. Under jobbets timeout. */
const PAUS         = 300;

/* Manuell BPM för enskilda spår: "Artist – Titel": BPM */
const OVERRIDE = {
  // 'Yoshiko – Some Track': 203
};

/* ------------------------------------------------------------------ */

const ID = process.env.SPOTIFY_ID;
const SECRET = process.env.SPOTIFY_SECRET;

if (!ID || !SECRET) {
  console.error('Saknar SPOTIFY_ID / SPOTIFY_SECRET. Sätt dem som miljövariabler och kör igen.');
  process.exit(1);
}

const STATE_FIL  = resolve(ROOT, 'data/artist-ids.json');
const REL_FIL    = resolve(ROOT, 'data/releases.json');
const STATUS_FIL = resolve(ROOT, 'data/status.json');

/* Höjs när cachen måste kastas.
   1 → sparade felmatchningar (Killshot → Eminem, Malice → GACKT)
   2 → krävde exakt namnmatchning, men godtog vem som helst med rätt namn
   3 → kräver dessutom MIN_FOLJARE, efter att en okänd "Kill The Bass" med
       180 följare kommit in i flödet */
const CACHE_VERSION = 3;

let state = { version: CACHE_VERSION, ids: {}, nextIndex: 0 };
let anrop = 0;
const T0 = Date.now();
const forbrukat = () => Math.round((Date.now() - T0) / 1000);

/* Rå sekundsiffra säger ingenting. 1905 låter lite, men är en halvtimme. */
function lasbarTid(sek){
  if (sek < 90) return `${sek} sekunder`;
  if (sek < 5400) return `${Math.round(sek / 60)} minuter`;
  return `${(sek / 3600).toFixed(1)} timmar`;
}

async function lasJson(fil, fallback) {
  try { return JSON.parse(await readFile(fil, 'utf8')); } catch { return fallback; }
}

async function skrivJson(fil, data) {
  await mkdir(resolve(ROOT, 'data'), { recursive: true });
  await writeFile(fil, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function getToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${ID}:${SECRET}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error(`Token misslyckades: ${res.status}`);
  return (await res.json()).access_token;
}

class Stopp extends Error {}

async function api(path, token, forsok = 0) {
  if (anrop >= MAX_ANROP) throw new Stopp(`Anropstaket (${MAX_ANROP}) nått.`);
  if (forbrukat() > TIDSBUDGET) {
    throw new Stopp(`Tidsbudgeten (${TIDSBUDGET}s) nådd. Sparar och avslutar.`);
  }
  anrop++;

  const res = await fetch('https://api.spotify.com/v1' + path, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (res.status === 429) {
    let reason = '';
    try { reason = (await res.clone().json())?.reason || ''; } catch {}
    const wait = Number(res.headers.get('retry-after') || 2);

    /* Två helt olika saker döljer sig bakom 429:

       QUOTA_EXCEEDED  dagskvoten är slut. Väntan mäts i timmar och fler
                       försök gör bara saken värre. Avbryt.
       Vanlig 429      kortvarig rate limit, ofta 1-3 minuter. Vänta ut den. */
    /* Spotify sätter inte alltid reason-fältet, så väntetiden får avgöra.
       Över en timme är det alltid dygnskvoten, aldrig en tillfällig broms. */
    if (reason === 'QUOTA_EXCEEDED' || wait > 3600) {
      throw new Stopp(
        `KVOTEN ÄR SLUT för dygnet. Spotify ber oss vänta ${lasbarTid(wait)}. ` +
        'Kör INTE igen förrän dess — varje försök är bortkastat. Kvoten delas av ' +
        'alla dina Development Mode-appar och nollställs av sig själv.'
      );
    }

    if (wait > MAX_VANTAN) {
      const langBroms = wait > 600;
      throw new Stopp(
        `BROMSAD av Spotify i ${lasbarTid(wait)}, längre än taket ${MAX_VANTAN}s. ` +
        (langBroms
          ? 'Så lång broms betyder i praktiken att dygnskvoten är förbrukad. ' +
            'Kör INTE manuellt igen idag — låt morgondagens schemalagda körning ta vid.'
          : 'Tillfälligt. Vänta ut den och kör igen.')
      );
    }
    if (forbrukat() + wait > TIDSBUDGET) {
      throw new Stopp(
        `Bromsen på ${lasbarTid(wait)} ryms inte i tidsbudgeten. Sparar och avslutar. ` +
        'Nästa körning fortsätter där den slutade.'
      );
    }
    if (forsok >= 3) throw new Error(`${path} → 429, gav upp efter 4 försök`);

    console.log(`  rate limit — väntar ${wait}s (försök ${forsok + 1})`);
    await new Promise(r => setTimeout(r, (wait + 1) * 1000));
    return api(path, token, forsok + 1);
  }

  if (res.status === 400) {
    throw new Error(`${path} → 400. Parametern godkänns inte — limit får vara max 10.`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${path} → ${res.status}. Kontrollera nycklarna, och att kontot som äger ` +
      'appen har aktivt Spotify Premium (krav sedan mars 2026).'
    );
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

const normalisera = t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '');

/* Genretaggar som betyder att artisten hör hemma i den här scenen. */
const HARD_GENRER = /hardstyle|hardcore|gabber|uptempo|frenchcore|hard techno|rawstyle|jumpstyle|terror|hard dance|hardtechno/i;

/* Spotify rankar sökträffar efter popularitet, inte efter hur väl namnet
   stämmer. "Killshot" gav Eminem, "Malice" gav GACKT, "Yoshiko" gav Yoshiko Sai.
   Därför: hämta tio träffar och kräv EXAKT namnmatchning. Hittas ingen sådan
   hoppas artisten över helt — bättre att sakna en artist än att fylla flödet
   med låtar från fel person. */
async function hittaId(post, token) {
  const { name, id, sok } = post;
  if (id) return id;                       // manuellt fastnaglat Spotify-ID
  if (state.ids[name]) return state.ids[name];

  async function sok10(q){
    const d = await api(`/search?q=${encodeURIComponent(q)}&type=artist&limit=10`, token);
    return d.artists?.items || [];
  }
  const exaktaAv = lista => lista.filter(a => normalisera(a.name) === normalisera(name));

  let traffar = await sok10(sok || name);
  let exakta = exaktaAv(traffar);

  /* Enordsnamn som Requiem och Pavo drunknar bland Mozart och Pavarotti.
     Då — och bara då — görs ett andra försök med genreordet tillagt. Det
     kostar ett extra anrop, men bara för de artister som faktiskt missar. */
  if (!exakta.length && !sok) {
    traffar = await sok10(name + ' hardstyle');
    exakta = exaktaAv(traffar);
    if (exakta.length) console.log(`  · "${name}" hittades först på andra försöket`);
  }

  if (!exakta.length) {
    console.log(`  ⚠ HOPPAR ÖVER "${name}" — ingen exakt träff. ` +
                `Närmast: ${traffar.slice(0, 3).map(a => a.name).join(', ')}. ` +
                'Sätt sok eller id på artisten i listan om den finns på Spotify.');
    return null;
  }

  /* Spotify slutade lämna ut followers i söksvaret, samma väg som popularity
     tog i februari 2026. Fältet får därför bara användas när det faktiskt
     finns — annars avvisas varje artist i listan. */
  const harFoljare = a => typeof a.followers?.total === 'number';
  const foljare = a => a.followers?.total ?? 0;
  const kanRakna = exakta.some(harFoljare);

  const rankade = kanRakna
    ? [...exakta].sort((a, b) => foljare(b) - foljare(a))
    : exakta;                      // utan siffror: behåll Spotifys egen ordning
  const traff = rankade.find(a => (a.genres || []).some(g => HARD_GENRER.test(g)))
                || rankade[0];

  if (kanRakna && foljare(traff) < MIN_FOLJARE) {
    console.log(`  ⚠ HOPPAR ÖVER "${name}" — namnet stämmer men artisten har bara ` +
                `${foljare(traff)} följare. Troligen fel person, eller så finns ` +
                'akten inte på Spotify under det namnet.');
    return null;
  }

  if (exakta.length > 1) {
    const valdGenre = (traff.genres || []).find(g => HARD_GENRER.test(g));
    console.log(`  · "${name}" finns i ${exakta.length} exemplar, valde ` +
                (valdGenre ? `den taggad "${valdGenre}"`
                           : `den med flest följare (${foljare(traff).toLocaleString('sv')})`));
  }

  state.ids[name] = traff.id;
  return traff.id;
}

function relevant(dateStr) {
  if (!dateStr || dateStr.length < 7) return false;
  const d = new Date(dateStr.length === 7 ? dateStr + '-01' : dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAGAR_BAKAT);
  /* Nollställ klockslaget. Annars beror fönstret på vilken tid workflowen
     råkar köra, och en låt som är exakt DAGAR_BAKAT dagar gammal faller ur. */
  cutoff.setHours(0, 0, 0, 0);
  return d >= cutoff;
}

const nyckel = r => `${r.artist} – ${r.title}`.toLowerCase();

async function run() {
  state = await lasJson(STATE_FIL, { version: CACHE_VERSION, ids: {}, nextIndex: 0 });

  if (state.version !== CACHE_VERSION) {
    console.log(`Cachen är från version ${state.version || 1}, nollställer artist-ID:n. ` +
                'Releaselistan behålls — gamla felmatchningar åldras ut inom en vecka.');
    state = { version: CACHE_VERSION, ids: {}, nextIndex: 0 };
  }

  /* Tidigare fynd behålls. Delkörningar får aldrig radera det som redan finns. */
  /* Behåll alltid tidigare releaser. Sjudagarsfönstret rensar dem av sig
     själv, och att tömma listan vid en cachenollställning gav flera dygn med
     nästan tom sajt medan rotationen hann varva. Enstaka felmatchningar
     försvinner när de blir äldre än en vecka. */
  const tidigare = await lasJson(REL_FIL, []);
  const alla = new Map(
    (Array.isArray(tidigare) ? tidigare : [])
      .filter(r => relevant(r.date))
      .map(r => [nyckel(r), r])
  );

  const token = await getToken();
  const start = state.nextIndex % ARTISTS.length;
  let klara = 0, stopp = null;

  for (let n = 0; n < ARTISTS.length; n++) {
    const i = (start + n) % ARTISTS.length;
    const { name, genre } = ARTISTS[i];

    try {
      const id = await hittaId(ARTISTS[i], token);
      if (!id) { console.log(`✗ hittade inte ${name}`); klara++; continue; }

      const sida = await api(
        `/artists/${id}/albums?include_groups=single,album&market=SE&limit=10`,
        token
      );

      let nya = 0;
      for (const a of sida.items || []) {
        if (!relevant(a.release_date)) continue;
        const artist = (a.artists || []).map(x => x.name).join(' × ') || name;
        const rel = {
          artist,
          title: a.name,
          genre,
          bpm: OVERRIDE[`${artist} – ${a.name}`] ?? BPM_PER_GENRE[genre] ?? 150,
          date: a.release_date.length === 7 ? a.release_date + '-01' : a.release_date,
          url: a.external_urls?.spotify || ''
        };
        if (!alla.has(nyckel(rel))) { alla.set(nyckel(rel), rel); nya++; }
      }
      if (nya) console.log(`✓ ${name}: ${nya}`);
      klara++;

    } catch (err) {
      if (err instanceof Stopp) { stopp = err; break; }
      console.log(`✗ ${name}: ${err.message}`);
      klara++;
    }

    await new Promise(r => setTimeout(r, PAUS));
  }

  state.nextIndex = (start + klara) % ARTISTS.length;

  const out = [...alla.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  await skrivJson(REL_FIL, out);
  await skrivJson(STATE_FIL, state);

  /* Hälsostämpel. Sajten visar den i sidfoten, så en workflow som tyst slutat
     fungera syns direkt istället för att sajten bara ser normal ut. */
  await skrivJson(STATUS_FIL, {
    uppdaterad: new Date().toISOString(),
    artister: ARTISTS.length,
    cachade: Object.keys(state.ids).length,
    releaser: out.length,
    anrop,
    avbrott: stopp ? stopp.message : null
  });

  console.log(
    `\n${klara}/${ARTISTS.length} artister denna körning, ${anrop} API-anrop, ` +
    `${forbrukat()}s.\n${out.length} releaser totalt i data/releases.json.`
  );
  if (klara < ARTISTS.length) {
    console.log(`Nästa körning fortsätter från artist ${state.nextIndex + 1}.`);
  }
  if (stopp) console.log('\n' + stopp.message);
}

run().catch(err => { console.error(err.message || err); process.exit(1); });
