-- Namn som kan se officiella ut får inte väljas. Spärren ligger i
-- databasen så att den gäller även den som anropar API:t direkt och
-- kringgår kontosidan.
--
-- hardlisthelp täcks redan av hardlist-regeln men står med för att listan
-- ska gå att läsa utan att räkna ut det.

alter table public.profiler
  add constraint visningsnamn_ej_reserverat
  check (
    position('hardlist' in lower(visningsnamn)) = 0
    and lower(visningsnamn) not in ('admin', 'moderator', 'support', 'hardlisthelp')
  );
