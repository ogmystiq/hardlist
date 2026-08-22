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
 *   GET /search?type=artist        max limit är numera 10 — vi hämtar alla tio
 *                                  träffarna för att kunna kräva exakt namnmatch
 *   GET /artists/{id}/albums       max limit är numera 10 (var 50), och svaret
 *                                  är grupperat per typ, INTE datumsorterat
 *                                  totalt — testat 18 aug: en artist med sju
 *                                  album fick alla sju album först, sen tre
 *                                  singlar. En artist med tio eller fler album
 *                                  skulle alltså aldrig visa en enda singel,
 *                                  hur ny den än är, om single och album
 *                                  frågades i samma anrop.
 *
 *                                  Därför två separata frågor med varsin
 *                                  include_groups, se huvudrotationen och
 *                                  albumrotationen nedan.
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
  { name: 'Headhunterz',            genre: 'hardstyle' },
  { name: 'Wildstylez',             genre: 'hardstyle' },
  { name: 'Brennan Heart',          genre: 'hardstyle' },
  { name: 'Da Tweekaz',             genre: 'hardstyle' },
  { name: 'Coone',                  genre: 'hardstyle' },
  { name: 'Atmozfears',             genre: 'hardstyle' },
  { name: 'D-Block & S-te-Fan',     genre: 'hardstyle' },
  { name: 'Sound Rush',             genre: 'hardstyle' },
  { name: 'Devin Wild',             genre: 'hardstyle' },
  { name: 'Refuzion',               genre: 'hardstyle' },
  { name: 'Audiotricz',             genre: 'hardstyle' },
  { name: 'Code Black',             genre: 'hardstyle' },
  { name: 'Noisecontrollers',       genre: 'hardstyle' },
  { name: 'Frontliner',             genre: 'hardstyle' },
  { name: 'Bass Modulators',        genre: 'hardstyle' },
  { name: 'Wasted Penguinz',        genre: 'hardstyle' },
  { name: 'Sub Sonik',              genre: 'hardstyle' },
  { name: 'Hard Driver',            genre: 'hardstyle' },
  { name: 'Sephyx',                 genre: 'hardstyle' },
  { name: 'Toneshifterz',           genre: 'hardstyle' },
  { name: 'Psyko Punkz',            genre: 'hardstyle' },
  { name: 'Zatox',                  genre: 'hardstyle' },

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
  { name: 'Frequencerz',            genre: 'raw' },
  { name: 'B-Front',                genre: 'raw' },
  { name: 'Phuture Noize',          genre: 'raw' },
  { name: 'Digital Punk',           genre: 'raw' },
  { name: 'Delete',                 genre: 'raw' },
  { name: 'Deluzion',               genre: 'raw', id: '3r40SMXcvhhDUE1xhU8MSB' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'E-Force',                genre: 'raw' },
  { name: 'Killshot',               genre: 'raw' },
  { name: 'Rejecta',                genre: 'raw' },
  { name: 'Riot Shift',             genre: 'raw' },
  { name: 'Unresolved',             genre: 'raw' },
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
  { name: 'Nosferatu',              genre: 'hardcore', id: '0S6b11xqvO6XOWZSukSjiY' }, // pinnat — automatisk sökning hittade fel artist
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
  { name: 'KELTEK',                 genre: 'hardstyle' },
  { name: 'The Purge',              genre: 'raw' },
  { name: 'Jay Reeve',              genre: 'raw' },
  { name: 'Primeshock',             genre: 'hardstyle' },
  { name: 'Nolz',                   genre: 'uptempo' },

  /* --- fler euphoric --- */
  { name: 'Showtek',                    genre: 'hardstyle' },
  { name: 'Technoboy',                  genre: 'hardstyle' },
  { name: 'Tuneboy',                    genre: 'hardstyle' },
  { name: 'DJ Isaac',                   genre: 'hardstyle' },
  { name: 'The Prophet',                genre: 'hardstyle' },
  { name: 'Zany',                       genre: 'hardstyle' },
  { name: 'Deepack',                    genre: 'hardstyle' },
  { name: 'Donkey Rollers',             genre: 'hardstyle' },
  { name: 'Pavo',                       genre: 'hardstyle' },
  { name: 'Builder',                    genre: 'hardstyle' },
  { name: 'Alpha²',                     genre: 'hardstyle' },
  { name: 'Max Enforcer',               genre: 'hardstyle' },
  { name: 'JDX',                        genre: 'hardstyle' },
  { name: 'Aftershock',                 genre: 'hardstyle', id: '6KlY7jizsLWQcXR1F2Sn9j' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Ecstatic',                   genre: 'hardstyle' },
  { name: 'Galactixx',                  genre: 'hardstyle' },
  { name: 'Level One',                  genre: 'hardstyle' },
  { name: 'Rebourne',                   genre: 'hardstyle' },
  { name: 'Bass Chaserz',               genre: 'hardstyle' },
  { name: 'Envine',                     genre: 'hardstyle' },
  { name: 'Dailucia',                   genre: 'hardstyle' },
  { name: 'The Pitcher',                genre: 'hardstyle' },
  { name: 'Ummet Ozcan',                genre: 'hardstyle' },
  { name: 'Bioweapon',                  genre: 'hardstyle' },

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
  { name: 'Chain Reaction',             genre: 'raw', id: '2voeq1SXqaRk45wpKHJhgz' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Sogma',                      genre: 'raw' },
  { name: 'Cryex',                      genre: 'raw' },
  { name: 'So Juice',                   genre: 'raw' },
  { name: 'Exproz',                     genre: 'raw' },
  { name: 'Kronos',                     genre: 'raw', id: '2B3mYtzGes0f92Yfn4mVQD' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'The Saints',                 genre: 'raw' },
  { name: 'Villain',                    genre: 'raw', id: '7iajTuviby3038TmfrpvZ3' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'D-Charged',                  genre: 'raw' },
  { name: 'Dimitri K',                  genre: 'raw' },
  { name: 'Sovereign King',             genre: 'raw', id: '4Ub0mdQEa3RhAfwWgVXp46' }, // döpt om från "Sovereign" + pinnat — det kortare namnet gav fel artist

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
  { name: 'D-Fence',                    genre: 'hardcore' },
  { name: 'Andy The Core',              genre: 'hardcore' },
  { name: 'Radium',                     genre: 'hardcore', id: '5YG7cC1VX7Nh7AjUOf6PcG' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'The Melodyst',               genre: 'hardcore' },
  { name: 'The Sickest Squad',          genre: 'hardcore' },
  { name: 'Drokz',                      genre: 'hardcore' },
  { name: 'Deathmachine',               genre: 'hardcore' },

  /* --- fler techno --- */
  { name: 'Lil Texas',                  genre: 'techno' },
  { name: 'Rebekah',                    genre: 'techno' },
  { name: 'Nico Moreno',                genre: 'techno' },
  { name: 'Sara Landry',                genre: 'techno' },
  { name: 'Hi-Lo',                      genre: 'techno' },

  /* --- euphoric, omgång 2 --- */
  { name: 'Scope DJ',                    genre: 'hardstyle' },
  { name: 'A-lusion',                    genre: 'hardstyle' },
  { name: 'DJ Duro',                     genre: 'hardstyle' },
  { name: 'Hardheadz',                   genre: 'hardstyle' },
  { name: 'Demi Kanon',                  genre: 'hardstyle' },
  { name: 'A-RIZE',                      genre: 'hardstyle' },
  { name: 'Ghost Stories',               genre: 'hardstyle' },
  { name: 'Lady Faith',                  genre: 'hardstyle' },
  { name: 'High Resistance',             genre: 'hardstyle' },
  { name: 'Betavoice',                   genre: 'hardstyle' },
  { name: 'Retrospect',                  genre: 'hardstyle', id: '3SpBPLBqsJo9sW5KQUXm8q' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Crystal Lake',                genre: 'hardstyle', id: '1VfMvNSQzxakpBBo9yzudk' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Emphasis',                    genre: 'hardstyle', id: '6Eo58FM6qYycr3oP9BIeca' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Audiofreq',                   genre: 'hardstyle' },
  { name: 'Dr. Rude',                    genre: 'hardstyle' },
  { name: 'Fenix',                       genre: 'hardstyle', id: '7kBTFueiOHgnbxQB4IedXI' }, // pinnat — automatisk sökning hittade fel artist

  /* --- raw, omgång 2 --- */
  { name: 'ANDY SVGE',                   genre: 'raw' },
  { name: 'ERABREAK',                    genre: 'raw' },
  { name: 'Thyron',                      genre: 'raw' },
  { name: 'Wolv',                        genre: 'raw' },
  { name: 'Disarray',                    genre: 'raw', id: '717HuchTIxNX4TLjDPclE3' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Michael Phase',               genre: 'raw' },
  { name: 'Crossfight',                  genre: 'raw' },
  { name: 'Sledgehammers',               genre: 'raw' },
  { name: 'Sasha F',                     genre: 'raw' },
  { name: 'Avoc',                        genre: 'raw' },
  { name: 'Retaliation',                 genre: 'raw', id: '33WbKYUz0YIPwtO0HKTJX7' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'JNXD',                        genre: 'raw' },
  { name: 'Inflame',                     genre: 'raw' },
  { name: 'Brutalizer',                  genre: 'raw', id: '6416cEVN24ELoGBIrpTsUe' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Flux Overload',               genre: 'raw' },
  { name: 'Miss M',                      genre: 'raw' },
  { name: "D'Ort",                       genre: 'raw' },
  { name: 'Doris',                       genre: 'raw' },

  /* --- uptempo, omgång 2 --- */
  { name: 'Cybergore',                   genre: 'uptempo' },

  /* --- hardcore, omgång 2 --- */
  { name: 'Pinotello',                   genre: 'hardcore' },
  { name: 'Da Mouth Of Madness',         genre: 'hardcore' },
  { name: 'Endymion',                    genre: 'hardcore' },

  /* --- techno, omgång 2 --- */
  { name: 'Fantasm',                     genre: 'techno' },
  { name: 'Holy Priest',                 genre: 'techno' },
  { name: 'Kruelty',                     genre: 'techno', id: '30sKm4Zacgq8mC0l7vNmuD' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Winson',                      genre: 'techno' },
  { name: 'Novah',                       genre: 'techno' },
  { name: 'Nicolas Julian',              genre: 'techno' },
  { name: 'ZAPRAVKA',                    genre: 'techno' },
  { name: 'Samuel Moriero',              genre: 'techno' },
  { name: 'Jowi',                        genre: 'techno' },
  { name: 'JAZZY',                       genre: 'techno', id: '0xGI8ZVWgiCWicV1lD1Hrk' }, // pinnat — automatisk sökning hittade fel artist

  /* --- euphoric, omgång 3 --- */
  { name: 'TAC Team',                      genre: 'hardstyle' },
  { name: 'Wildfyre',                      genre: 'hardstyle' },
  { name: 'Xense',                         genre: 'hardstyle' },
  { name: 'Zero Days',                     genre: 'hardstyle' },
  { name: 'Aztech',                        genre: 'hardstyle', id: '5BwHAtNpcEoDlIQqaBCBvc' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Crisis Era',                    genre: 'hardstyle' },
  { name: 'Firelite',                      genre: 'hardstyle' },
  { name: 'The Vision',                    genre: 'hardstyle', id: '1DV44qE0qBvaYO1q1cXT0f' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Digital Madness',               genre: 'hardstyle' },
  { name: 'Clockartz',                     genre: 'hardstyle' },
  { name: 'Adrenalize',                    genre: 'hardstyle' },
  { name: 'Degos & Re-Done',               genre: 'hardstyle' },
  { name: 'MERYLL',                        genre: 'hardstyle' },
  { name: 'Drean',                         genre: 'hardstyle' },
  { name: 'Serzo',                         genre: 'hardstyle' },
  { name: 'Caelum',                        genre: 'hardstyle', id: '4rurguPt7zC7a60LfcPDUM' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Boray',                         genre: 'hardstyle' },
  { name: 'Max Alexander',                 genre: 'hardstyle' },
  { name: 'Snowflake',                     genre: 'hardstyle', id: '1rPM4GwuDLiRsMX0rfNNg5' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Alee',                          genre: 'hardstyle', id: '07E7avQ9K8W8Gr6BCx8aU9' }, // pinnat — verifierat via hardstyle.com
  { name: 'Neon Future',                   genre: 'hardstyle' },
  { name: 'Bright Visions',                genre: 'hardstyle' },
  { name: 'B-Freqz',                       genre: 'hardstyle' },
  { name: 'NeoBallisticz',                 genre: 'hardstyle' },
  { name: 'Hypnose',                       genre: 'hardstyle' },
  { name: 'Distinction',                   genre: 'hardstyle' },
  { name: 'Mark Vayne',                    genre: 'hardstyle' },
  { name: 'Phyric',                        genre: 'hardstyle' },
  { name: 'TNT',                           genre: 'hardstyle' },

  /* --- raw, omgång 3 --- */
  { name: 'Toza',                          genre: 'raw' },
  { name: 'The Straikerz',                 genre: 'raw' },
  { name: 'Adjuzt',                        genre: 'raw' },
  { name: 'Dual Damage',                   genre: 'raw' },
  { name: 'Vexxed',                        genre: 'raw', id: '49QBXRxNfA7BBLMqRIB8jY' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'DEEZL',                         genre: 'raw' },
  { name: 'GLDY LX',                       genre: 'raw' },
  { name: 'Mish',                          genre: 'raw' },
  { name: 'Infliction',                    genre: 'raw' },
  { name: 'Levenkhan',                     genre: 'raw' },
  { name: 'Tharken',                       genre: 'raw' },
  { name: 'Satirized',                     genre: 'raw' },
  { name: 'The Dope Doctor',               genre: 'raw' },
  { name: 'Vasto',                         genre: 'raw', id: '35l9BKzdhvLy5HOC50NECa' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Livid',                         genre: 'raw', id: '3GvnEADrxf9LST8avbLuMe' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Kenai',                         genre: 'raw', id: '4bdnTbi7xnUA1rwBgSO3d7' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Karbyde',                       genre: 'raw' },
  { name: 'T-Junction',                    genre: 'raw' },
  { name: 'Unfused',                       genre: 'raw' },
  { name: 'Sakyra',                        genre: 'raw' },
  { name: 'Trespassed',                    genre: 'raw' },
  { name: 'Major Conspiracy',              genre: 'raw' },
  { name: 'Code Crime',                    genre: 'raw' },
  { name: 'Decim8',                        genre: 'raw' },
  { name: 'Re-Mind',                       genre: 'raw' },
  { name: 'Invictuz',                      genre: 'raw' },
  { name: 'Hardphonix',                    genre: 'raw' },
  { name: 'Arzadous',                      genre: 'raw' },
  { name: 'GVBRX',                         genre: 'raw' },
  { name: 'Anklebreaker',                  genre: 'raw' },
  { name: 'Bass Prototype',                genre: 'raw' },
  { name: 'Invector',                      genre: 'raw' },
  { name: 'AlexSo',                        genre: 'raw', id: '1zMyfwOOmRRq0yjIxpN3kN' }, // pinnat — automatisk sökning hittade fel artist
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
  { name: 'TWSTD',                         genre: 'raw', id: '2AXbtYVmNaN2RMv4Z0T24f' }, // pinnat — automatisk sökning hittade fel artist
  { name: 'Outbreak',                      genre: 'raw', id: '5tlPrdBVJtoK1uWzzFs4M1' }, // pinnat — automatisk sökning hittade fel artist, lågt lyssnarantal på nya ID:t, dubbelkolla manuellt
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

/* Albumrotationen (se nedan) varvar hela artistlistan mycket långsammare än
   singelrotationen — några veckor i stället för ett par dygn. Ett fönster på
   sju dagar skulle hinna åldra ut ett album innan turen ens kommit till
   artisten igen. Fönstret måste därför vara minst lika långt som varvet.
   ALBUM_ANROP_PER_KORNING nedan styr varvtakten — höjs den kan detta sänkas. */
const DAGAR_BAKAT_ALBUM = 30;

/* Uppskattad BPM per genre. Spotify slutade ge ut BPM till nya appar
   i november 2024, så den här siffran är en gissning per genre.
   Vill du ha exakt BPM: skriv in den i OVERRIDE nedan. */
const BPM_PER_GENRE = { hardstyle: 150, raw: 155, uptempo: 200, hardcore: 190, techno: 150 };

/* --- Kvotskydd ---------------------------------------------------------
   Development Mode har en daglig kvot per utvecklarkonto. Går den sönder är
   du utelåst i ett dygn. Därför tre spärrar:

   MAX_ANROP  hårt yttertak på antal API-anrop per körning, delat mellan
              singel- och albumrotationen. Nås det sparar skriptet det den
              hunnit och slutar. Artisterna roteras mellan körningar så alla
              kommer med över tid.
              OBS: dagskvoten går sönder runt 200 anrop. Workflowen kör därför
              DAGLIGEN med rotation istället för en gång i veckan. Ett helt
              singelvarv tar ceil(antal artister / (MAX_ANROP -
              ALBUM_ANROP_PER_KORNING)) dygn — med 333 artister och nuvarande
              tak alltså tre dygn, väl inom sjudagarsfönstret sajten visar.
   MAX_VANTAN ber Spotify oss vänta längre än så avbryts körningen direkt
              istället för att ligga och hamra på kvoten.
   PAUS       paus mellan anrop.
------------------------------------------------------------------------ */
/* Uppmätt i praktiken: dagskvoten i Development Mode tar slut runt 200 anrop.
   Taket ligger därför med marginal under det. Kör HÖGST EN GÅNG PER DYGN tills
   artist-cachen är komplett — då kostar ett helt varv bara 80 anrop. */
const MAX_ANROP    = 170;
/* Fast liten andel av MAX_ANROP som går till albumrotationen (se run()).
   Resten (MAX_ANROP - ALBUM_ANROP_PER_KORNING) är singelrotationens eget
   tak, så den håller sin varvtakt oavsett hur albumrotationen går. Ett helt
   albumvarv över 333 artister tar ceil(333 / ALBUM_ANROP_PER_KORNING) ≈ 17
   körningar — några veckor vid daglig körning, därav DAGAR_BAKAT_ALBUM. */
const ALBUM_ANROP_PER_KORNING = 20;
/* Minsta antal följare för att en namnträff ska godtas — men bara när Spotify
   faktiskt lämnar ut siffran. Sedan de tog bort fältet ur söksvaret ligger
   kontrollen vilande. Den vaknar av sig själv om fältet återkommer. */
const MIN_FOLJARE  = 2000;
const MAX_VANTAN   = 600;   /* längsta enskilda väntan vi accepterar, sekunder */
const TIDSBUDGET   = 780;   /* hela körningen, sekunder. 120s marginal under jobbets timeout-minutes (15 min = 900s). */
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

/* Genretaggar som betyder att artisten hör hemma i den här scenen.
   OBS: "hardcore" ensamt är en fälla — Spotify taggar även hardcore-PUNK,
   post-hardcore, metalcore och deathcore-band med genrer som innehåller
   ordet "hardcore" (t.ex. "post-hardcore", "melodic hardcore"), trots att de
   inte har något med elektronisk hardcore att göra. Det här slank igenom
   Livid (powerviolence), Akimbo och Outbreak (hardcore-punk/metalcore) —
   se CACHE_VERSION-historiken. HARDCORE_UNDANTAG nedan filtrerar bort de
   punk/metal-varianterna innan HARD_GENRER får nappa på ordet i dem. */
const HARD_GENRER = /hardstyle|hardcore|gabber|uptempo|frenchcore|hard techno|rawstyle|jumpstyle|terror|hard dance|hardtechno/i;
const HARDCORE_UNDANTAG = /hardcore punk|post[- ]?hardcore|melodic hardcore|christian hardcore|metalcore|deathcore|beatdown|youth crew|screamo/i;
const arHardGenre = g => HARD_GENRER.test(g) && !HARDCORE_UNDANTAG.test(g);

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
  const traff = rankade.find(a => (a.genres || []).some(arHardGenre))
                || rankade[0];

  if (kanRakna && foljare(traff) < MIN_FOLJARE) {
    console.log(`  ⚠ HOPPAR ÖVER "${name}" — namnet stämmer men artisten har bara ` +
                `${foljare(traff)} följare. Troligen fel person, eller så finns ` +
                'akten inte på Spotify under det namnet.');
    return null;
  }

  if (exakta.length > 1) {
    const valdGenre = (traff.genres || []).find(arHardGenre);
    console.log(`  · "${name}" finns i ${exakta.length} exemplar, valde ` +
                (valdGenre ? `den taggad "${valdGenre}"`
                 : kanRakna ? `den med flest följare (${foljare(traff).toLocaleString('sv')})`
                 : 'den Spotify rankar först'));
  }

  state.ids[name] = traff.id;
  return traff.id;
}

function relevant(dateStr, dagarBakat = DAGAR_BAKAT) {
  if (!dateStr || dateStr.length < 7) return false;
  const d = new Date(dateStr.length === 7 ? dateStr + '-01' : dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dagarBakat);
  /* Nollställ klockslaget. Annars beror fönstret på vilken tid workflowen
     råkar köra, och en release som är exakt dagarBakat dagar gammal faller ur. */
  cutoff.setHours(0, 0, 0, 0);
  return d >= cutoff;
}

const nyckel = r => `${r.artist} – ${r.title}`.toLowerCase();

/* Ett sparat fynd vet sitt eget fönster via typ — annars skulle ett album
   (30 dagars fönster) hinna åldras bort med sjudagarsfiltret innan
   albumrotationen kommer tillbaka till artisten. Äldre poster utan typ-fält
   (från innan den här ändringen) får det snävare 7-dagarsfönstret, samma
   som de redan hade. */
const fonster = r => r.typ === 'album' ? DAGAR_BAKAT_ALBUM : DAGAR_BAKAT;

/* Delad av bägge rotationerna: bygger releaseposter ur ett /albums-svar och
   lägger de relevanta i alla-kartan. typ ('single'/'album') avgör både
   vilket fönster som gäller nu och vilket fönster posten ska bedömas mot
   nästa körning, via fonster() ovan. */
function samlaIn(items, name, genre, typ, dagarBakat, alla) {
  let nya = 0;
  for (const a of items) {
    if (!relevant(a.release_date, dagarBakat)) continue;
    const artist = (a.artists || []).map(x => x.name).join(' × ') || name;
    const rel = {
      artist,
      title: a.name,
      genre,
      bpm: OVERRIDE[`${artist} – ${a.name}`] ?? BPM_PER_GENRE[genre] ?? 150,
      date: a.release_date.length === 7 ? a.release_date + '-01' : a.release_date,
      url: a.external_urls?.spotify || '',
      typ
    };
    if (!alla.has(nyckel(rel))) { alla.set(nyckel(rel), rel); nya++; }
  }
  return nya;
}

async function run() {
  state = await lasJson(STATE_FIL, { version: CACHE_VERSION, ids: {}, nextIndex: 0, albumIndex: 0 });

  if (state.version !== CACHE_VERSION) {
    console.log(`Cachen är från version ${state.version || 1}, nollställer artist-ID:n. ` +
                'Releaselistan behålls — gamla felmatchningar åldras ut inom en vecka.');
    state = { version: CACHE_VERSION, ids: {}, nextIndex: 0, albumIndex: 0 };
  }
  /* Äldre state-filer (från innan albumrotationen fanns) saknar fältet —
     utan den här raden blir det undefined och (start2 % ARTISTS.length) NaN. */
  if (typeof state.albumIndex !== 'number') state.albumIndex = 0;

  /* Tidigare fynd behålls. Delkörningar får aldrig radera det som redan finns. */
  /* Behåll alltid tidigare releaser. Respektive fönster (se fonster() ovan)
     rensar dem av sig själv, och att tömma listan vid en cachenollställning
     gav flera dygn med nästan tom sajt medan rotationen hann varva. Enstaka
     felmatchningar försvinner när de blir äldre än sitt fönster. */
  const tidigare = await lasJson(REL_FIL, []);
  const alla = new Map(
    (Array.isArray(tidigare) ? tidigare : [])
      .filter(r => relevant(r.date, fonster(r)))
      .map(r => [nyckel(r), r])
  );

  const token = await getToken();

  /* --- Singelrotation — huvudspåret, ett anrop per artist -----------------
     Eget tak strax under MAX_ANROP så albumrotationen alltid har sin andel
     kvar. Varvtakten över hela ARTISTS är densamma som innan albumrotationen
     fanns, bara taket är lite lägre. */
  const HUVUD_TAK = MAX_ANROP - ALBUM_ANROP_PER_KORNING;
  const start = state.nextIndex % ARTISTS.length;
  let klara = 0, stopp = null;

  for (let n = 0; n < ARTISTS.length; n++) {
    if (anrop >= HUVUD_TAK) break;   // lämnar plats åt albumrotationen nedan
    const i = (start + n) % ARTISTS.length;
    const { name, genre } = ARTISTS[i];

    try {
      const id = await hittaId(ARTISTS[i], token);
      if (!id) { console.log(`✗ hittade inte ${name}`); klara++; continue; }

      const sida = await api(
        `/artists/${id}/albums?include_groups=single&market=SE&limit=10`,
        token
      );
      const nya = samlaIn(sida.items || [], name, genre, 'single', DAGAR_BAKAT, alla);
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

  /* --- Albumrotation — långsamt sidospår, egen positionspekare ------------
     Bara artister som redan har ett cachat Spotify-ID kollas, så ett
     albumanrop aldrig drar med sig en extra sökning. Artister utan cache
     hittas ändå förr eller senare av singelrotationen ovan, som söker vid
     behov. Hoppar skriptet över quotan (stopp satt) provas albumrotationen
     inte alls den körningen — den skulle ändå bara slå i samma vägg direkt. */
  let albumKlara = 0, albumTraffar = 0;
  if (!stopp) {
    const start2 = state.albumIndex % ARTISTS.length;
    let n2 = 0, albumAnrop = 0;

    while (n2 < ARTISTS.length && albumAnrop < ALBUM_ANROP_PER_KORNING &&
           anrop < MAX_ANROP && forbrukat() < TIDSBUDGET) {
      const i = (start2 + n2) % ARTISTS.length;
      const { name, genre } = ARTISTS[i];
      n2++;

      const id = state.ids[name];
      if (!id) continue;   // ännu ej cachad — huvudrotationen tar den förr eller senare

      try {
        const sida = await api(
          `/artists/${id}/albums?include_groups=album&market=SE&limit=10`,
          token
        );
        albumAnrop++;
        const nya = samlaIn(sida.items || [], name, genre, 'album', DAGAR_BAKAT_ALBUM, alla);
        albumTraffar += nya;
        if (nya) console.log(`✓ (album) ${name}: ${nya}`);
        albumKlara++;
      } catch (err) {
        if (err instanceof Stopp) { stopp = err; break; }
        console.log(`✗ (album) ${name}: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, PAUS));
    }

    state.albumIndex = (start2 + n2) % ARTISTS.length;
  }

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
    albumAnrop: albumKlara,
    albumIndex: state.albumIndex,
    avbrott: stopp ? stopp.message : null
  });

  console.log(
    `\n${klara}/${ARTISTS.length} artister denna körning (singlar), ` +
    `${albumKlara} albumkollade (${albumTraffar} nya), ${anrop} API-anrop, ` +
    `${forbrukat()}s.\n${out.length} releaser totalt i data/releases.json.`
  );
  if (klara < ARTISTS.length) {
    console.log(`Nästa körning fortsätter singelrotationen från artist ${state.nextIndex + 1}.`);
  }
  console.log(`Albumrotationen fortsätter från artist ${state.albumIndex + 1}.`);
  if (stopp) console.log('\n' + stopp.message);
}

run().catch(err => { console.error(err.message || err); process.exit(1); });
