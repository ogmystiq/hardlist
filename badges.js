/* Badges på hardlist.se: hur de ser ut, deras texter, och popuperna när man
   får en ny. Här avgörs aldrig vem som har en badge. Det gör servern, så att
   ingen kan dela ut en till sig själv från webbläsaren.

   Allt nås genom window.hardlistBadges, så att inget namn här krockar med
   rader.js eller sidans eget skript. Stilen ligger i /badges.css. */
(function(){
  'use strict';

  // Illustrationerna, ritade i en 64x64-ruta: [färgnyckel, bana, linjebredd, rörelse].
  // Linjebredd 0 betyder fylld yta. Nyckeln m är ett urtag och får ytans färg,
  // x får genrens färg. Byggs ur designens ikoner.py, ändra dem inte för hand.
  var ILLU = {"trumma": [["v", "M4 40H14L18.5 9L23.5 56L27.5 22L31.5 48L34.5 30L37.5 43L40.5 34L43.5 41L46.5 37.5L49 39.5L60 40", 5, ""], ["r", "M14.3 9a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0 -8.4 0z", 0, ""]], "soluppgang": [["g", "M14 46a18 18 0 0 1 36 0z", 0, ""], ["g", "M33.6 24.0L33.6 16.0L30.4 16.0L30.4 24.0zM44.4 27.7L48.4 20.8L45.6 19.2L41.6 26.1zM22.4 26.1L18.4 19.2L15.6 20.8L19.6 27.7zM51.9 36.4L58.8 32.4L57.2 29.6L50.3 33.6zM13.7 33.6L6.8 29.6L5.2 32.4L12.1 36.4z", 0, ""], ["v", "M4 46h56v4H4z", 0, ""], ["v", "M8 56h48v3H8z", 0, ""], ["v", "M15 8a7 7 0 1 0 7 10 5.6 5.6 0 1 1-7-10z", 0, ""]], "flamma": [["r", "M33 3c2 9 15 15 15 32a16 16 0 0 1-32 0c0-8 3-13 7-16 0 5 2 9 5 10-2-10 2-19 5-26z", 0, "a-flamma"], ["g", "M32 27c2 5 8 9 8 17a8 8 0 0 1-16 0c0-4 2-7 4-9 1 3 2 5 4 5-1-5 0-9 0-13z", 0, "a-flamma2"]], "lurar": [["v", "M9 40v-8a23 23 0 0 1 46 0v8h-6v-8a17 17 0 0 0-34 0v8z", 0, ""], ["v", "M7 37h13v20H11a4 4 0 0 1-4-4zM44 37h13v16a4 4 0 0 1-4 4h-9z", 0, ""], ["c", "M11 41h5v12h-5zM48 41h5v12h-5z", 0, ""]], "vinyl": [["v", "M7 32a25 25 0 1 0 50 0a25 25 0 1 0 -50 0z", 0, ""], ["m", "M11 32a21 21 0 1 0 42 0a21 21 0 1 0 -42 0zM12 32a20 20 0 1 1 40 0a20 20 0 1 1 -40 0z", 0, ""], ["m", "M15.5 32a16.5 16.5 0 1 0 33.0 0a16.5 16.5 0 1 0 -33.0 0zM16.5 32a15.5 15.5 0 1 1 31.0 0a15.5 15.5 0 1 1 -31.0 0z", 0, ""], ["r", "M23 32a9 9 0 1 0 18 0a9 9 0 1 0 -18 0z", 0, ""], ["m", "M29.8 32a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0z", 0, ""]], "sko": [["r", "M8 40C3 30 9 24 8 13c6 5 8 11 9 15 1-6 4-11 3-19 7 7 9 15 8 22 2-3 4-6 4-10 6 7 6 14 3 19z", 0, "a-flamma"], ["g", "M14 39c-2-5 0-9 0-14 3 3 4 6 5 9 1-3 2-5 2-9 3 4 4 9 3 14z", 0, "a-flamma2"], ["v", "M13 47v-5c0-3 2-5 5-5h9c2 0 3-1.5 4-3l4-7c1-2 3-2 4.5-.5L47 33c2 2 5 3 8 3.5 4 .7 6 3 6 6.5V47z", 0, ""], ["m", "M13 46.5h48v2H13z", 0, ""], ["v", "M13 49h48v2c0 2-1.5 3.5-3.5 3.5h-41C14.5 54.5 13 53 13 51z", 0, ""], ["m", "M35.6 32a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0zM39.6 35a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0zM43.6 38a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0z", 0, ""]], "biljett": [["v", "M6 18h52v10a4 4 0 0 0 0 8v10H6V36a4 4 0 0 0 0-8z", 0, ""], ["c", "M6 18h52v5H6z", 0, ""], ["m", "M19 26h2v4h-2zM19 33h2v4h-2zM19 40h2v4h-2z", 0, ""], ["m", "M29 35.5l3.2-3.2 4.3 4.3 9-9 3.2 3.2-12.2 12.2z", 0, ""]], "blixt": [["c", "M37 3 13 37h15l-5 24 28-36H36z", 0, "a-blixt"], ["v", "M49 6l5-5 2.5 2.5-5 5zM53 17h8v3.5h-8zM7 50l-5 5-2.5-2.5 5-5z", 0, ""]], "skalle": [["v", "M32 6c-12 0-21 8-21 20 0 7 3 11 7 14v8a3 3 0 0 0 3 3h3v-5h4v5h8v-5h4v5h3a3 3 0 0 0 3-3v-8c4-3 7-7 7-14 0-12-9-20-21-20z", 0, ""], ["l", "M18 27a6 6 0 1 0 12 0a6 6 0 1 0 -12 0zM34 27a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z", 0, "a-puls"], ["m", "M32 34l-3.5 6h7z", 0, ""]], "brinnandeskalle": [["r", "M13 31C8 21 14 15 13 4c6 6 8 11 9 15 1-6 4-10 4-17 6 7 8 13 7 19 2-3 4-7 4-11 7 8 7 15 6 21 2-2 3-5 3-9 6 7 6 14 4 20z", 0, "a-flamma"], ["g", "M20 29c-1-5 2-9 2-14 3 4 4 7 4 10 1-3 3-5 3-9 3 5 5 9 4 13 1-2 2-3 2-6 3 4 3 7 2 9z", 0, "a-flamma2"], ["v", "M32 21c-10 0-17 7-17 16 0 6 2 9 6 11v6a2 2 0 0 0 2 2h3v-4h3v4h6v-4h3v4h3a2 2 0 0 0 2-2v-6c4-2 6-5 6-11 0-9-7-16-17-16z", 0, ""], ["r", "M21.0 36a4.5 4.5 0 1 0 9.0 0a4.5 4.5 0 1 0 -9.0 0zM34.0 36a4.5 4.5 0 1 0 9.0 0a4.5 4.5 0 1 0 -9.0 0z", 0, "a-puls"], ["m", "M32 42l-2.6 4.5h5.2z", 0, ""]], "ora": [["v", "M31 7c-11 0-18 8-18 18 0 6 2 9 5 12 2 2 3 4 3 7 0 6 4 11 11 11 6 0 10-4 11-9l-6-1c-.6 2.5-2.4 4-5 4-3 0-5-2-5-5 0-5-2-8-5-11-2-2-3-4-3-8 0-7 5-12 12-12s12 5 12 12h6c0-10-7-18-18-18z", 0, ""], ["v", "M31 18c-4.5 0-8 3-8 7.5h5.5c0-1.4 1.1-2.4 2.5-2.4s2.5 1 2.5 2.4c0 2-2.5 3.5-2.5 6h5.5c0-3.3 2.5-4 2.5-7 0-4.5-3.5-6.5-8-6.5z", 0, ""], ["c", "M52 21.5a15 15 0 0 1 0 21l-3.6-3.6a10 10 0 0 0 0-13.8zM58 15.5a23.5 23.5 0 0 1 0 33l-3.6-3.6a18.5 18.5 0 0 0 0-25.8z", 0, "a-puls"]], "staket": [["r", "M9 16a5 5 0 1 0 10 0a5 5 0 1 0 -10 0zM20.5 13a5.5 5.5 0 1 0 11.0 0a5.5 5.5 0 1 0 -11.0 0zM33.5 15a5 5 0 1 0 10 0a5 5 0 1 0 -10 0zM45.9 17a4.6 4.6 0 1 0 9.2 0a4.6 4.6 0 1 0 -9.2 0z", 0, ""], ["r", "M41.5 12.5l4.3-9 2.8 1.3-4.3 9zM44.7 3.6a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0zM20.5 12l-3.6-8.5-2.8 1.2 3.6 8.5zM12.4 3.6a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0z", 0, ""], ["v", "M5 22h54v5H5zM5 44h54v5H5zM7 22h4v34H7zM53 22h4v34h-4zM17 27h3.5v17H17zM26.5 27H30v17h-3.5zM34 27h3.5v17H34zM43.5 27H47v17h-3.5zM3 54h13v3.5H3zM48 54h13v3.5H48z", 0, ""]], "mixer": [["v", "M9 11h46a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V15a4 4 0 0 1 4-4z", 0, ""], ["m", "M11 32a13 13 0 1 0 26 0a13 13 0 1 0 -26 0z", 0, ""], ["v", "M14 32a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM16 32a8 8 0 1 1 16 0a8 8 0 1 1 -16 0z", 0, ""], ["c", "M20.5 32a3.5 3.5 0 1 0 7.0 0a3.5 3.5 0 1 0 -7.0 0z", 0, ""], ["c", "M43 27h10v6H43z", 0, ""], ["r", "M43 37h10v6H43z", 0, ""], ["m", "M47 15h2v8h-2z", 0, ""]], "krona": [["v", "M6 20l13 11 13-19 13 19 13-11-6 27H12z", 0, ""], ["v", "M12 49h40v7H12z", 0, ""], ["c", "M28.4 36a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0z", 0, "a-glimt"], ["r", "M17.2 39a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0z", 0, "a-glimt2"], ["g", "M41.2 39a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0z", 0, "a-glimt3"], ["g", "M3 19a3 3 0 1 0 6 0a3 3 0 1 0 -6 0zM29 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0zM55 19a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z", 0, "a-puls"]], "hogtalare": [["v", "M13 4h38v26H13zM13 34h38v26H13z", 0, ""], ["m", "M16.5 17a7.5 7.5 0 1 0 15.0 0a7.5 7.5 0 1 0 -15.0 0zM32.5 17a7.5 7.5 0 1 0 15.0 0a7.5 7.5 0 1 0 -15.0 0zM22 47a10 10 0 1 0 20 0a10 10 0 1 0 -20 0z", 0, ""], ["c", "M21.4 17a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0zM37.4 17a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0z", 0, "a-bank"], ["r", "M28.4 47a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0z", 0, "a-bank"]], "stjarna": [["g", "M33.5 8.0L33.5 2.0L30.5 2.0L30.5 8.0zM56.2 26.7L61.9 24.8L61.0 22.0L55.3 23.8zM8.7 23.8L3.0 22.0L2.1 24.8L7.8 26.7zM16.1 52.3L12.6 57.2L15.0 59.0L18.5 54.1zM45.5 54.1L49.0 59.0L51.4 57.2L47.9 52.3z", 0, "a-puls"], ["v", "M32 6l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 44.8l-15.2 8 2.9-16.9-12.3-12 17-2.5z", 0, ""], ["g", "M27 31a5 5 0 1 0 10 0a5 5 0 1 0 -10 0z", 0, ""]], "stoppur": [["v", "M28 4h8v5h-8zM30.5 9h3v6h-3z", 0, ""], ["v", "M10 36a22 22 0 1 0 44 0a22 22 0 1 0 -44 0zM14.5 36a17.5 17.5 0 1 1 35.0 0a17.5 17.5 0 1 1 -35.0 0z", 0, ""], ["r", "M32 36V18.5a17.5 17.5 0 0 1 8.75 2.35z", 0, ""], ["v", "M29 36a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z", 0, ""], ["v", "M30.6 36h2.8v-13h-2.8z", 0, ""]], "glowsticks": [["c", "M13.5 45.5l29-29 5 5-29 29z", 0, ""], ["r", "M21.5 16.5l5-5 29 29-5 5z", 0, ""], ["v", "M10 49l3.5-3.5 5 5L15 54zM47 16.5l3.5-3.5 5 5-3.5 3.5zM47 47.5l3.5 3.5 5-5-3.5-3.5zM17 11.5 13.5 8l-5 5 3.5 3.5z", 0, ""], ["v", "M39.0 33.3L43.0 33.3L43.0 30.7L39.0 30.7zM33.3 25.0L33.3 21.0L30.7 21.0L30.7 25.0zM25.0 30.7L21.0 30.7L21.0 33.3L25.0 33.3zM30.7 39.0L30.7 43.0L33.3 43.0L33.3 39.0z", 0, ""]], "radar": [["v", "M7 32a25 25 0 1 0 50 0a25 25 0 1 0 -50 0zM10.5 32a21.5 21.5 0 1 1 43.0 0a21.5 21.5 0 1 1 -43.0 0z", 0, ""], ["v", "M19 32a13 13 0 1 0 26 0a13 13 0 1 0 -26 0zM21.5 32a10.5 10.5 0 1 1 21.0 0a10.5 10.5 0 1 1 -21.0 0z", 0, ""], ["c", "M32 32V10.5a21.5 21.5 0 0 1 18.6 10.75z", 0, "a-svep"], ["r", "M40 22a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z", 0, "a-puls"], ["v", "M29 32a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z", 0, ""]], "knytnave": [["v", "M17 20a4.5 4.5 0 0 1 9 0v10h-9zM26 15a4.5 4.5 0 0 1 9 0v15h-9zM35 17a4.5 4.5 0 0 1 9 0v13h-9zM44 21a4.5 4.5 0 0 1 9 0v10h-9zM17 29h36v10c0 7-5 11-11 11H28c-6 0-11-4-11-11zM12 32a4.5 4.5 0 0 1 4.5-4.5H31v6.5H19v8h-7zM26 48h16v12H26z", 0, "a-pump"], ["m", "M25.5 19v11h1.2V19zM34.5 16v14h1.2V16zM43.5 19v11h1.2V19z", 0, "a-pump"], ["r", "M26 51h16v4.5H26z", 0, "a-pump"]], "vag-hardstyle": [["x", "M3 33c7 0 7-13 14.5-13S25 33 32 33s7-13 14.5-13S54 33 61 33v6c-7 0-7-13-14.5-13S39 39 32 39s-7-13-14.5-13S10 39 3 39z", 0, ""], ["v", "M3 46h58v3H3z", 0, ""]], "vag-raw": [["x", "M3 38l6-12 5 18 6-26 5 30 6-28 5 24 6-20 5 16 6-12 6 8v8l-5-7-6 12-5-16-6 20-5-24-6 28-5-30-6 26-5-18-6 12z", 0, ""], ["v", "M3 52h58v3H3z", 0, ""]], "vag-uptempo": [["x", "M5 16l15 16-15 16h9l15-16-15-16zM23 16l15 16-15 16h9l15-16-15-16zM41 16l15 16-15 16h9l15-16-15-16z", 0, ""]], "vag-hardcore": [["x", "M3 34h5l3-24 3.5 44 3.5-34 3 22 3-14h4l3-24 3.5 44 3.5-34 3 22 3-14h4l3-24 3.5 44 3-26h-.5z", 0, ""], ["v", "M3 58h58v2.5H3z", 0, ""]], "vag-techno": [["x", "M32.0 12.0L36.2 5.3L40.3 6.3L41.1 14.2L43.8 15.8L51.1 12.9L53.8 16.1L49.8 22.9L51.0 25.8L58.7 27.8L59.0 32.0L51.8 35.1L51.0 38.2L56.1 44.3L53.8 47.9L46.1 46.1L43.8 48.2L44.3 56.1L40.3 57.7L35.1 51.8L32.0 52.0L27.8 58.7L23.7 57.7L22.9 49.8L20.2 48.2L12.9 51.1L10.2 47.9L14.2 41.1L13.0 38.2L5.3 36.2L5.0 32.0L12.2 28.9L13.0 25.8L7.9 19.7L10.2 16.1L17.9 17.9L20.2 15.8L19.7 7.9L23.7 6.3L28.9 12.2zM24 32a8 8 0 1 1 16 0a8 8 0 1 1 -16 0z", 0, ""], ["v", "M28.5 32a3.5 3.5 0 1 0 7.0 0a3.5 3.5 0 1 0 -7.0 0z", 0, ""]], "totem": [["v", "M14 4h4.5v56H14z", 0, ""], ["c", "M18.5 8H58l-7 5.5H18.5z", 0, "a-vaj"], ["r", "M18.5 13.5H51l7 5.5H18.5z", 0, "a-vaj"], ["g", "M18.5 19H58l-7 5.5H18.5z", 0, "a-vaj"], ["l", "M18.5 24.5H51l7 5.5H18.5z", 0, "a-vaj"], ["s", "M18.5 30H58l-7 5.5H18.5z", 0, "a-vaj"], ["v", "M12.85 4a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0z", 0, ""]], "armband": [["v", "M7 30c0-8 11-14 25-14s25 6 25 14-11 14-25 14S7 38 7 30zm6.5 0c0 4.5 8.5 8 18.5 8s18.5-3.5 18.5-8-8.5-8-18.5-8-18.5 3.5-18.5 8z", 0, ""], ["r", "M25 39h14v18l-7-4.5-7 4.5z", 0, ""], ["c", "M28 42h8v3h-8z", 0, ""]], "megafon": [["v", "M8 25h9l25-13v38L17 37H8z", 0, ""], ["v", "M19 37h7l3.5 14h-7z", 0, ""], ["g", "M48 20l7-5 2.2 3-7 5zM48 29.5h9.5v4H48zM48 43l7 5-2.2 3-7-5z", 0, ""]], "lupp": [["v", "M8 27a19 19 0 1 0 38 0a19 19 0 1 0 -38 0zM13 27a14 14 0 1 1 28 0a14 14 0 1 1 -28 0z", 0, ""], ["v", "M39.5 42.5l4-4 16 16-4 4z", 0, ""], ["c", "M19 27.5l3-3 4 4 8-8 3 3-11 11z", 0, ""]], "matare": [["v", "M7 46a25 25 0 0 1 50 0h-6.5a18.5 18.5 0 0 0-37 0z", 0, ""], ["g", "M21.7 42.0L17.3 40.8L16.7 43.1L21.1 44.3zM25.1 37.4L21.9 34.2L20.2 35.9L23.4 39.1zM30.3 35.1L29.1 30.7L26.8 31.3L28.0 35.7zM36.0 35.7L37.2 31.3L34.9 30.7L33.7 35.1zM40.6 39.1L43.8 35.9L42.1 34.2L38.9 37.4zM42.9 44.3L47.3 43.1L46.7 40.8L42.3 42.0z", 0, ""], ["r", "M30.2 47.8l17.6-17.6 3.4 3.4-17.6 17.6z", 0, "a-nal"], ["v", "M27.4 46a4.6 4.6 0 1 0 9.2 0a4.6 4.6 0 1 0 -9.2 0z", 0, ""], ["r", "M40 6c1.5 3 5 5 5 9a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.4 2 2.7-.6-2.6 0-4.7.5-6.7z", 0, "a-flamma"]], "metronom": [["v", "M24.5 6h15l9.5 46h-34z", 0, ""], ["m", "M28 12h8l6.5 32h-21z", 0, ""], ["v", "M13 50h38v8H13z", 0, ""], ["r", "M30.6 46l13-30 2.7 1.2-13 30z", 0, "a-pendel"], ["g", "M38.5 24.5l6.2 2.7-2.4 5.4-6.2-2.7z", 0, "a-pendel"]], "termometer": [["v", "M20 11a7 7 0 0 1 14 0v25.5a12 12 0 1 1-14 0z", 0, ""], ["m", "M23.5 11a3.5 3.5 0 0 1 7 0v27.5a8.5 8.5 0 1 1-7 0z", 0, ""], ["r", "M25.4 24h3.2v16.5a6 6 0 1 1-3.2 0z", 0, "a-stig"], ["r", "M48 12c2 4 8 7 8 13a8 8 0 0 1-16 0c0-4 2-6 3.5-7.5.3 2.3 1.4 3.7 2.8 4.2C45.4 18 46.8 15 48 12z", 0, "a-flamma"], ["g", "M48 22c1 2 3.5 3.5 3.5 6.5a3.5 3.5 0 0 1-7 0c0-2 1-3 1.7-3.8.4 1 1 1.5 1.6 1.7-.4-1.6-.2-3 .2-4.4z", 0, "a-flamma2"]], "fenix": [["r", "M29 33C21 30 11 30 4 21c8 2.5 14 2.5 18.5.5C16 18 12 13 10 6c6 6 13 9.5 19 10.5zM35 33c8-3 18-3 25-12-8 2.5-14 2.5-18.5.5C48 18 52 13 54 6c-6 6-13 9.5-19 10.5z", 0, "a-flamma"], ["g", "M29 30c-5-1.5-10-2-14-6 4 .5 8 .3 11-1-3-2-5-4.5-6-8 4 3 7 5 10 6zM35 30c5-1.5 10-2 14-6-4 .5-8 .3-11-1 3-2 5-4.5 6-8-4 3-7 5-10 6z", 0, "a-flamma2"], ["v", "M32 14a5.5 5.5 0 0 1 5.5 5.5c0 3.5-1.2 6-2.3 9l3.3 14.5L32 55l-6.5-12 3.3-14.5c-1.1-3-2.3-5.5-2.3-9A5.5 5.5 0 0 1 32 14z", 0, ""], ["g", "M37.2 18.5l5 1.5-5 1.6z", 0, ""], ["m", "M32.5 18.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0z", 0, ""], ["r", "M27 52l5 9 5-9-5 4z", 0, "a-flamma"]], "kamera": [["v", "M8 18h12l4-6h16l4 6h12a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4z", 0, ""], ["m", "M19 35a13 13 0 1 0 26 0a13 13 0 1 0 -26 0z", 0, ""], ["v", "M22 35a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM24.5 35a7.5 7.5 0 1 1 15.0 0a7.5 7.5 0 1 1 -15.0 0z", 0, ""], ["c", "M28 35a4 4 0 1 0 8 0a4 4 0 1 0 -8 0z", 0, ""], ["r", "M48 23h7v5h-7z", 0, "a-puls"]], "bomber": [["v", "M22 10l-11 7-7 31 9 3 5-21v31h28V30l5 21 9-3-7-31-11-7-5 5h-10z", 0, ""], ["g", "M27 10l5 7 5-7z", 0, ""], ["g", "M30.8 17h2.4v44h-2.4z", 0, ""], ["m", "M18 56h28v2H18zM5.5 45l8.5 3-.6 1.9L5 47zM58.5 45l-8.5 3 .6 1.9 8.4-2.9z", 0, ""], ["r", "M38 26h6v4h-6z", 0, ""]], "scen": [["v", "M5 8h54v5H5zM7 13h4v37H7zM53 13h4v37h-4zM3 50h58v7H3z", 0, ""], ["c", "M17 13l-7 37h9z", 0, "a-puls"], ["r", "M32 13l-5 37h10z", 0, "a-puls2"], ["g", "M47 13l7 37h-9z", 0, "a-puls"], ["v", "M14.4 15a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0zM29.4 15a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0zM44.4 15a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0z", 0, ""]], "burk": [["v", "M20 12h24l2 4v38l-2 4H20l-2-4V16z", 0, ""], ["m", "M18 18h28v2.5H18zM18 51h28v2.5H18z", 0, ""], ["v", "M25 6h14l2 5H23z", 0, ""], ["c", "M34.5 22 24 38h7l-3 12 11-17h-7l3-11z", 0, "a-blixt"]], "tag": [["v", "M14 10a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v36a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6z", 0, ""], ["m", "M19 9h26v16H19z", 0, ""], ["g", "M18.5 41a3.5 3.5 0 1 0 7.0 0a3.5 3.5 0 1 0 -7.0 0zM38.5 41a3.5 3.5 0 1 0 7.0 0a3.5 3.5 0 1 0 -7.0 0z", 0, "a-puls"], ["v", "M19 52l-7 9h6l5-7zM45 52l7 9h-6l-5-7zM8 60h48v3H8z", 0, ""], ["c", "M24 13h16v8H24z", 0, ""]], "agg": [["v", "M32 4c11 0 20 17 20 31 0 13-9 23-20 23S12 48 12 35C12 21 21 4 32 4z", 0, ""], ["m", "M13 31l7 5 6-6 6 6 6-6 6 6 7-5v4l-7 5-6-6-6 6-6-6-6 6-7-5z", 0, ""], ["l", "M21.6 44a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0zM35.6 44a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0z", 0, "a-puls"]], "fraga": [["v", "M21 22a11 11 0 1 1 18 8.5c-3.5 2.6-4.5 4-4.5 7.5v3h-7v-3.5c0-5.5 2.6-8 6-10.5a4 4 0 1 0-5.5-5z", 0, ""], ["v", "M26.5 52a4.5 4.5 0 1 0 9.0 0a4.5 4.5 0 1 0 -9.0 0z", 0, ""]]};

  // grupp: fraga, topp, latspel, sarskild eller hemlig.
  // mal och enhet: visas som framsteg, "23 av 100 dagar", innan badgen är tagen.
  // kommer: hör till låtspelet, som inte sparar resultat än. Visas halvt genomskinlig.
  var BADGES = [
    {
      "id": "forsta",
      "grupp": "fraga",
      "namn": "Första kicken",
      "text": "Svara rätt på dagens fråga för första gången.",
      "niva": "Vanlig",
      "illu": "trumma"
    },
    {
      "id": "afterparty",
      "grupp": "fraga",
      "namn": "Afterparty",
      "text": "Svara på dagens fråga mellan tre och sex en helgnatt.",
      "niva": "Vanlig",
      "illu": "soluppgang"
    },
    {
      "id": "v7",
      "grupp": "fraga",
      "namn": "Uppvärmd",
      "text": "Rätt sju dagar i rad.",
      "niva": "Ovanlig",
      "illu": "flamma",
      "mal": 7,
      "enhet": "dagar"
    },
    {
      "id": "fredag",
      "grupp": "fraga",
      "namn": "Fredagsörat",
      "text": "Rätt på tio låtfrågor.",
      "niva": "Ovanlig",
      "illu": "lurar",
      "mal": 10,
      "enhet": "låtfrågor"
    },
    {
      "id": "fredagsfeber",
      "grupp": "fraga",
      "namn": "Fredagsfeber",
      "text": "Rätt på låtfrågan fem fredagar i rad.",
      "niva": "Ovanlig",
      "illu": "termometer",
      "mal": 5,
      "enhet": "fredagar i rad"
    },
    {
      "id": "hundra",
      "grupp": "fraga",
      "namn": "Hundra rätt",
      "text": "Hundra rätta svar totalt, i vilken ordning som helst.",
      "niva": "Ovanlig",
      "illu": "vinyl",
      "mal": 100,
      "enhet": "rätta svar"
    },
    {
      "id": "v30",
      "grupp": "fraga",
      "namn": "Hakken",
      "text": "Rätt 30 dagar i rad, tills skorna brinner.",
      "niva": "Sällsynt",
      "illu": "sko",
      "mal": 30,
      "enhet": "dagar"
    },
    {
      "id": "perfekt",
      "grupp": "fraga",
      "namn": "Perfekt månad",
      "text": "Rätt varje dag under en hel kalendermånad.",
      "niva": "Sällsynt",
      "illu": "biljett"
    },
    {
      "id": "blixt",
      "grupp": "fraga",
      "namn": "Strobe",
      "text": "Rätt svar inom tre sekunder.",
      "niva": "Sällsynt",
      "illu": "blixt"
    },
    {
      "id": "speedcore",
      "grupp": "fraga",
      "namn": "Speedcore",
      "text": "Rätt svar inom fem sekunder, tio gånger.",
      "niva": "Sällsynt",
      "illu": "matare",
      "mal": 10,
      "enhet": "snabba svar"
    },
    {
      "id": "bpm200",
      "grupp": "fraga",
      "namn": "200 BPM",
      "text": "200 rätta svar totalt.",
      "niva": "Sällsynt",
      "illu": "metronom",
      "mal": 200,
      "enhet": "rätta svar"
    },
    {
      "id": "aterfodd",
      "grupp": "fraga",
      "namn": "Återfödd",
      "text": "Bygg en ny svit på 30 dagar efter att ha tappat en lika lång.",
      "niva": "Sällsynt",
      "illu": "fenix"
    },
    {
      "id": "v100",
      "grupp": "fraga",
      "namn": "Terror",
      "text": "Rätt 100 dagar i rad.",
      "niva": "Extremt sällsynt",
      "illu": "skalle",
      "mal": 100,
      "enhet": "dagar"
    },
    {
      "id": "v365",
      "grupp": "fraga",
      "namn": "Hardcore till döden",
      "text": "Rätt varje dag i ett helt år.",
      "niva": "Extremt sällsynt",
      "illu": "brinnandeskalle",
      "mal": 365,
      "enhet": "dagar"
    },
    {
      "id": "gehor",
      "grupp": "fraga",
      "namn": "Absolut gehör",
      "text": "Rätt på 50 låtfrågor.",
      "niva": "Extremt sällsynt",
      "illu": "ora",
      "mal": 50,
      "enhet": "låtfrågor"
    },
    {
      "id": "topp10",
      "grupp": "topp",
      "namn": "Vid staketet",
      "text": "Topp tio på månadens topplista.",
      "niva": "Ovanlig",
      "illu": "staket"
    },
    {
      "id": "pallen",
      "grupp": "topp",
      "namn": "I båset",
      "text": "Topp tre på månadens topplista.",
      "niva": "Sällsynt",
      "illu": "mixer"
    },
    {
      "id": "etta",
      "grupp": "topp",
      "namn": "Headliner",
      "text": "Etta på månadens topplista.",
      "niva": "Extremt sällsynt",
      "illu": "krona"
    },
    {
      "id": "dynasti",
      "grupp": "topp",
      "namn": "Residenten",
      "text": "Etta på månadens topplista tre månader i rad.",
      "niva": "Extremt sällsynt",
      "illu": "hogtalare",
      "mal": 3,
      "enhet": "månader i rad"
    },
    {
      "id": "veteran",
      "grupp": "topp",
      "namn": "Veteranen",
      "text": "Topp tio på månadens topplista varje månad i ett helt år.",
      "niva": "Extremt sällsynt",
      "illu": "bomber",
      "mal": 12,
      "enhet": "månader"
    },
    {
      "id": "legend",
      "grupp": "topp",
      "namn": "Legend",
      "text": "Nå rangen Legend, 10 000 poäng.",
      "niva": "Extremt sällsynt",
      "illu": "stjarna",
      "mal": 10000,
      "enhet": "poäng"
    },
    {
      "id": "halv",
      "grupp": "latspel",
      "namn": "Halv sekund",
      "text": "Känn igen dagens låt på första klippet.",
      "niva": "Sällsynt",
      "illu": "stoppur",
      "kommer": true
    },
    {
      "id": "maraton",
      "grupp": "latspel",
      "namn": "Maraton",
      "text": "Spela 100 låtar i fritt spel samma dag.",
      "niva": "Ovanlig",
      "illu": "burk",
      "kommer": true
    },
    {
      "id": "duell",
      "grupp": "latspel",
      "namn": "Duellanten",
      "text": "Vinn tio dueller.",
      "niva": "Ovanlig",
      "illu": "glowsticks",
      "kommer": true
    },
    {
      "id": "anthem",
      "grupp": "latspel",
      "namn": "Anthemkännaren",
      "text": "Känn igen 25 anthems från Defqon.1, Qlimax och Decibel.",
      "niva": "Sällsynt",
      "illu": "scen",
      "kommer": true
    },
    {
      "id": "tio",
      "grupp": "latspel",
      "namn": "Radar",
      "text": "Känn igen dagens låt på första klippet tio gånger.",
      "niva": "Extremt sällsynt",
      "illu": "radar",
      "kommer": true
    },
    {
      "id": "obesegrad",
      "grupp": "latspel",
      "namn": "Obesegrad",
      "text": "Vinn tio dueller i rad.",
      "niva": "Extremt sällsynt",
      "illu": "knytnave",
      "kommer": true
    },
    {
      "id": "g-hardstyle",
      "grupp": "latspel",
      "namn": "Hardstyleörat",
      "text": "Känn igen 50 hardstylelåtar i fritt spel.",
      "niva": "Sällsynt",
      "illu": "vag-hardstyle",
      "genre": "hardstyle",
      "kommer": true
    },
    {
      "id": "g-raw",
      "grupp": "latspel",
      "namn": "Rawörat",
      "text": "Känn igen 50 rawlåtar i fritt spel.",
      "niva": "Sällsynt",
      "illu": "vag-raw",
      "genre": "raw",
      "kommer": true
    },
    {
      "id": "g-uptempo",
      "grupp": "latspel",
      "namn": "Uptempoörat",
      "text": "Känn igen 50 uptempolåtar i fritt spel.",
      "niva": "Sällsynt",
      "illu": "vag-uptempo",
      "genre": "uptempo",
      "kommer": true
    },
    {
      "id": "g-hardcore",
      "grupp": "latspel",
      "namn": "Hardcoreörat",
      "text": "Känn igen 50 hardcorelåtar i fritt spel.",
      "niva": "Sällsynt",
      "illu": "vag-hardcore",
      "genre": "hardcore",
      "kommer": true
    },
    {
      "id": "g-techno",
      "grupp": "latspel",
      "namn": "Technoörat",
      "text": "Känn igen 50 hard technolåtar i fritt spel.",
      "niva": "Sällsynt",
      "illu": "vag-techno",
      "genre": "techno",
      "kommer": true
    },
    {
      "id": "scenen",
      "grupp": "latspel",
      "namn": "Hela scenen",
      "text": "Ta alla fem genreöron.",
      "niva": "Extremt sällsynt",
      "illu": "totem",
      "kommer": true
    },
    {
      "id": "start",
      "grupp": "sarskild",
      "namn": "Från dag ett",
      "text": "Skaffade konto i oktober 2026. Går bara att få då.",
      "niva": "Vanlig",
      "illu": "armband"
    },
    {
      "id": "ansikte",
      "grupp": "sarskild",
      "namn": "Ansiktet utåt",
      "text": "Lägg upp en profilbild.",
      "niva": "Vanlig",
      "illu": "kamera"
    },
    {
      "id": "tipsaren",
      "grupp": "sarskild",
      "namn": "Tipsaren",
      "text": "Tipsade om ett event som kom med i kalendern. Delas ut av HARDLIST.",
      "niva": "Ovanlig",
      "illu": "megafon"
    },
    {
      "id": "faktakollen",
      "grupp": "sarskild",
      "namn": "Faktakollen",
      "text": "Rättade en uppgift på sajten. Delas ut av HARDLIST.",
      "niva": "Ovanlig",
      "illu": "lupp"
    },
    {
      "id": "midnatt",
      "grupp": "hemlig",
      "namn": "Midnattståget",
      "text": "Svara på dagens fråga under första minuten efter midnatt.",
      "niva": "Sällsynt",
      "illu": "tag",
      "hemlig": true
    },
    {
      "id": "paskagg",
      "grupp": "hemlig",
      "namn": "Påskägget",
      "text": "Hittade den gömda grejen på sajten.",
      "niva": "Extremt sällsynt",
      "illu": "agg",
      "hemlig": true
    }
  ];

  var GRUPPER = [
    {
      "id": "fraga",
      "namn": "Dagens fråga",
      "under": "Räknas från dagens fråga, som redan sparas på kontot."
    },
    {
      "id": "topp",
      "namn": "Topplistan och rang",
      "under": "Placeringarna delas ut när månaden är slut."
    },
    {
      "id": "latspel",
      "namn": "Låtspelet",
      "under": "Kommer med nya låtspelet och fritt spel, när resultaten sparas på kontot."
    },
    {
      "id": "sarskild",
      "namn": "Särskilda",
      "under": "Från dag ett kan bara tas i oktober 2026. Två delas ut för hand."
    },
    {
      "id": "hemlig",
      "namn": "Hemliga",
      "under": "Syns som ett frågetecken för alla tills de är tagna."
    }
  ];

  var NIVAER = [
    {
      "namn": "Vanlig",
      "text": "Rund.",
      "niva": "Vanlig",
      "illu": "trumma",
      "tagen": true
    },
    {
      "namn": "Ovanlig",
      "text": "Rund med ljus kant.",
      "niva": "Ovanlig",
      "illu": "flamma",
      "tagen": true
    },
    {
      "namn": "Sällsynt",
      "text": "Sexkantig med vit ram. Genreöronen får sin genres färg.",
      "niva": "Sällsynt",
      "illu": "sko",
      "tagen": true
    },
    {
      "namn": "Extremt sällsynt",
      "text": "Taggig stjärna i scenens alla fem genrefärger. Snurrar sakta och rör sig hela tiden.",
      "niva": "Extremt sällsynt",
      "illu": "brinnandeskalle",
      "tagen": true
    },
    {
      "namn": "Inte tagen än",
      "text": "Samma form och bild, men grå. Visar hur långt du har kvar.",
      "niva": "Extremt sällsynt",
      "illu": "skalle",
      "tagen": false
    }
  ];

  var FORM_HEX = 'polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)';
  var FORM_STJARNA = 'polygon(50.0% 0.0%, 60.2% 11.8%, 75.0% 6.7%, 77.9% 22.1%, 93.3% 25.0%, 88.2% 39.8%, 100.0% 50.0%, 88.2% 60.2%, 93.3% 75.0%, 77.9% 77.9%, 75.0% 93.3%, 60.2% 88.2%, 50.0% 100.0%, 39.8% 88.2%, 25.0% 93.3%, 22.1% 77.9%, 6.7% 75.0%, 11.8% 60.2%, 0.0% 50.0%, 11.8% 39.8%, 6.7% 25.0%, 22.1% 22.1%, 25.0% 6.7%, 39.8% 11.8%)';
  // Badgesen är ett eget undantag från färgregeln, se CLAUDE.md: de extremt
  // sällsynta bär scenens alla fem genrefärger och illustrationerna får
  // använda färgerna fritt.
  var SCENEN = 'conic-gradient(#3DDCF0 0deg 72deg, #FF3B6B 72deg 144deg, #FFB224 144deg 216deg, #A47BFF 216deg 288deg, #A9A9BC 288deg 360deg)';
  var GENREFARG = { hardstyle: '#3DDCF0', raw: '#FF3B6B', uptempo: '#FFB224', hardcore: '#A47BFF', techno: '#A9A9BC' };
  var FARG = { v: '#F6F2FB', r: '#FF3B6B', g: '#FFB224', c: '#3DDCF0', l: '#A47BFF', s: '#A9A9BC' };
  var ILLU_PCT = { 'Vanlig': 72, 'Ovanlig': 64, 'Sällsynt': 62, 'Extremt sällsynt': 56 };
  var RANG = { 'Vanlig': 0, 'Ovanlig': 1, 'Sällsynt': 2, 'Extremt sällsynt': 3 };
  // En hemlig badge som inte är tagen visar bara ett frågetecken.
  var HEMLIG = { namn: 'Hemlig', text: 'Ingen vet vad som krävs förrän någon har tagit den.', illu: 'fraga' };

  function hitta(id){
    for (var i = 0; i < BADGES.length; i++) if (BADGES[i].id === id) return BADGES[i];
    return null;
  }

  function esc(s){
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Formen visar nivån: rund, rund med ljus kant, sexkant med ram och taggig
  // stjärna. En badge som inte är tagen behåller formen men blir grå.
  function utseende(b, tagen){
    var p = !!tagen && !b.kommer;
    var u = { form: 'none', radie: '50%', inset: '0', inre: 'transparent', inreForm: 'none', inreRadie: '50%', inreKant: 'none', ros: false, lev: false, glod: '', opacitet: b.kommer ? 0.5 : 1 };
    if (b.niva === 'Vanlig') {
      u.yttre = p ? '#251D31' : '#1E1828'; u.yta = u.yttre;
    } else if (b.niva === 'Ovanlig') {
      u.yttre = p ? '#B9AFC9' : '#2A2236'; u.inset = '6%'; u.inre = p ? '#251D31' : '#1A1424'; u.yta = u.inre;
    } else if (b.niva === 'Sällsynt') {
      u.form = FORM_HEX; u.radie = '0'; u.yttre = p ? (GENREFARG[b.genre] || '#F6F2FB') : '#2A2236';
      u.inset = '8%'; u.inre = p ? '#1A1424' : '#16111D'; u.inreForm = FORM_HEX; u.inreRadie = '0'; u.yta = u.inre;
    } else {
      u.form = FORM_STJARNA; u.radie = '0'; u.yttre = p ? SCENEN : '#2A2236'; u.inset = '16%';
      u.inre = p ? '#100C17' : '#16111D'; u.inreKant = p ? 'inset 0 0 0 1.5px rgba(246,242,251,0.9)' : 'none';
      u.ros = p; u.lev = p; u.glod = p ? SCENEN : ''; u.yta = u.inre;
    }
    var dold = b.hemlig && !tagen;
    u.delar = (ILLU[dold ? HEMLIG.illu : b.illu] || []).map(function(del){
      var k = del[0], f = k === 'm' ? u.yta : (k === 'x' ? GENREFARG[b.genre] : FARG[k]);
      if (!p && k !== 'm') f = k === 'v' ? '#6E6480' : '#4A4158';
      return { d: del[1], fyll: del[2] ? 'none' : f, linje: del[2] ? f : 'none', bredd: del[2] || 0, rorelse: p ? (del[3] || '') : '' };
    });
    u.illuPct = ILLU_PCT[b.niva] || 72;
    u.namn = dold ? HEMLIG.namn : b.namn;
    u.text = dold ? HEMLIG.text : b.text;
    return u;
  }

  // En badge i valfri storlek, som HTML. Den är dekoration: knappen eller
  // länken runt den bär namnet för skärmläsare.
  function medaljHtml(b, tagen, px){
    var u = utseende(b, tagen);
    var h = '<span class="bm' + (u.lev ? ' bm-lev' : '') + '" aria-hidden="true" style="width:' + px + 'px;height:' + px + 'px' + (u.opacitet !== 1 ? ';opacity:' + u.opacitet : '') + '">';
    // Oskärpan sitter på det yttre elementet och formen på det inre. Sitter
    // båda på samma element klipper clip-path bort den mjuka kanten.
    if (u.glod) h += '<span class="bm-glod" style="filter:blur(' + Math.max(3, Math.floor(px / 10)) + 'px)"><span style="background:' + u.glod + ';clip-path:' + u.form + '"></span></span>';
    h += '<span class="bm-yttre' + (u.ros ? ' bm-ros' : '') + '" style="background:' + u.yttre + ';clip-path:' + u.form + ';border-radius:' + u.radie + '"></span>';
    if (u.inre !== 'transparent') h += '<span class="bm-inre" style="inset:' + u.inset + ';background:' + u.inre + ';clip-path:' + u.inreForm + ';border-radius:' + u.inreRadie + ';box-shadow:' + u.inreKant + '"></span>';
    h += '<svg viewBox="0 0 64 64" style="width:' + u.illuPct + '%;height:' + u.illuPct + '%">';
    u.delar.forEach(function(d){
      h += '<path' + (d.rorelse ? ' class="bm-' + d.rorelse + '"' : '') + ' d="' + d.d + '" fill="' + d.fyll + '" stroke="' + d.linje + '"' + (d.bredd ? ' stroke-width="' + d.bredd + '" stroke-linejoin="round" stroke-linecap="round"' : '') + '></path>';
    });
    return h + '</svg></span>';
  }

  function medalj(b, tagen, px){
    var t = document.createElement('template');
    t.innerHTML = medaljHtml(b, tagen, px);
    return t.content.firstChild;
  }

  // Valet "Ingen badge" i listan där man väljer badge vid namnet.
  function ingenHtml(px){
    return '<span class="bm" aria-hidden="true" style="width:' + px + 'px;height:' + px + 'px"><span class="bm-yttre" style="background:#1E1828;border-radius:50%"></span>'
      + '<svg viewBox="0 0 64 64" style="width:50%;height:50%"><path d="M18 18L46 46M46 18L18 46" fill="none" stroke="#7A7090" stroke-width="6" stroke-linecap="round"></path></svg></span>';
  }

  /* ---------- Popuperna när man får en ny badge ---------- */

  var ko = [];
  var visar = false;
  var meddelande = null;

  // Skärmläsare får beskedet genom en region som redan finns i sidan. En
  // region som läggs in samtidigt som texten läses ofta inte upp.
  function las(text){
    if (!meddelande) {
      meddelande = document.createElement('div');
      meddelande.className = 'bm-dold';
      meddelande.setAttribute('aria-live', 'polite');
      document.body.appendChild(meddelande);
    }
    meddelande.textContent = '';
    setTimeout(function(){ meddelande.textContent = text; }, 50);
  }

  // lista: [{ id: 'v7', forst: false }, ...] som servern skickar.
  // forst betyder att ingen annan har badgen, och ger raden "Ingen annan har den än."
  // De extremt sällsynta får var sitt firande. Upp till två andra får var sin
  // liten popup, fler än så samlas i en enda.
  function visaNya(lista){
    var stora = [], sma = [];
    (lista || []).forEach(function(n){
      var b = hitta(n.id);
      if (!b) return;
      (b.niva === 'Extremt sällsynt' ? stora : sma).push({ b: b, forst: !!n.forst });
    });
    stora.forEach(function(x){ ko.push({ typ: 'fira', b: x.b, forst: x.forst }); });
    if (sma.length > 2) ko.push({ typ: 'samlad', lista: sma });
    else sma.forEach(function(x){ ko.push({ typ: 'liten', b: x.b }); });
    if (!visar) nasta();
  }

  function nasta(){
    var x = ko.shift();
    if (!x) { visar = false; return; }
    visar = true;
    if (x.typ === 'fira') fira(x.b, x.forst);
    else liten(x);
  }

  var PIL = '<svg class="bm-toast-pil" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8E84A0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>';

  function liten(x){
    var b, namn, text;
    if (x.typ === 'samlad') {
      // Den sällsyntaste får synas i den samlade popupen.
      b = x.lista.map(function(y){ return y.b; }).sort(function(p, q){ return RANG[q.niva] - RANG[p.niva]; })[0];
      namn = x.lista.length + ' nya badges';
      text = 'Se dem på din profil.';
    } else {
      b = x.b; namn = b.namn; text = b.text;
    }
    var a = document.createElement('a');
    a.className = 'bm-toast';
    a.href = '/konto/#badges';
    a.innerHTML = '<span class="bm-svep" aria-hidden="true"></span>'
      + '<span class="bm-pop bm-lev">' + medaljHtml(b, true, 52) + '</span>'
      + '<span class="bm-toast-text"><span class="bm-toast-over">Ny badge</span><span class="bm-toast-namn">' + esc(namn) + '</span><span class="bm-toast-under">' + esc(text) + '</span></span>'
      + PIL;
    document.body.appendChild(a);
    las('Ny badge: ' + namn + '. ' + text);
    // Tas bort på tid och inte vid animationens slut, så att den försvinner
    // även för den som har stängt av animationer.
    setTimeout(function(){ a.remove(); nasta(); }, 5200);
  }

  var LASRAR = [[150, '#3DDCF0'], [185, '#FF3B6B'], [215, '#FFB224'], [145, '#A47BFF'], [200, '#A9A9BC'], [170, '#3DDCF0'], [230, '#FF3B6B'], [128, '#FFB224']]
    .map(function(l){ return '<span class="bm-laser" style="--v:' + l[0] + 'deg;background:linear-gradient(to bottom,' + l[1] + ',transparent 75%);transform:rotate(' + l[0] + 'deg)"></span>'; }).join('');

  function fira(b, forst){
    var forut = document.activeElement;
    var lager = document.createElement('div');
    lager.className = 'bm-fira';
    lager.setAttribute('role', 'dialog');
    lager.setAttribute('aria-modal', 'true');
    lager.setAttribute('aria-labelledby', 'bmFiraNamn');
    lager.innerHTML = '<div class="bm-fira-inne">'
      + '<span class="bm-fira-over bm-textin">Ny badge</span>'
      + '<span class="bm-fira-medalj">' + LASRAR + '<span class="bm-blixtut"></span><span class="bm-intro bm-lev">' + medaljHtml(b, true, 164) + '</span></span>'
      + '<h2 class="bm-fira-namn bm-textin" id="bmFiraNamn">' + esc(b.namn) + '</h2>'
      + '<span class="bm-fira-niva bm-textin2">' + esc(b.niva) + '</span>'
      + '<p class="bm-fira-text bm-textin2">' + esc(b.text) + (forst ? ' Ingen annan har den än.' : '') + '</p>'
      + '<div class="bm-fira-knappar bm-textin2"><a class="bm-knapp bm-knapp-rosa" href="/konto/#badges">Visa på profilen</a><button class="bm-knapp" type="button">Fortsätt</button></div>'
      + '</div>';
    var fortsatt = lager.querySelector('button');
    var lank = lager.querySelector('a');
    function stang(){
      document.removeEventListener('keydown', tangent, true);
      document.documentElement.classList.remove('bm-last');
      lager.remove();
      if (forut && forut.focus) forut.focus({ preventScroll: true });
      nasta();
    }
    function tangent(e){
      if (e.key === 'Escape') { e.preventDefault(); stang(); }
      // Fokus stannar i firandet så länge det är öppet.
      else if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === fortsatt ? lank : fortsatt).focus();
      }
    }
    fortsatt.addEventListener('click', stang);
    document.addEventListener('keydown', tangent, true);
    document.documentElement.classList.add('bm-last');
    document.body.appendChild(lager);
    fortsatt.focus({ preventScroll: true });
  }

  window.hardlistBadges = {
    BADGES: BADGES,
    GRUPPER: GRUPPER,
    NIVAER: NIVAER,
    HEMLIG: HEMLIG,
    hitta: hitta,
    utseende: utseende,
    medaljHtml: medaljHtml,
    medalj: medalj,
    ingenHtml: ingenHtml,
    visaNya: visaNya
  };
})();
