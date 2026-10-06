-- Skärper spärren mot officiella namn. Den första versionen släppte igenom
-- Hard-list och Admin1.
--
-- Bindestreck och understreck tas bort innan jämförelsen, så att de inte
-- kan användas för att dela upp ett spärrat ord: Hard-list, hard_list och
-- h-a-r-d-list fastnar alla, liksom Admin_1. Siffror efter admin,
-- moderator och support spärras också — Admin1 ser lika officiellt ut som
-- Admin. hardlisthelp täcks av hardlist-regeln.

alter table public.profiler
  drop constraint visningsnamn_ej_reserverat;

alter table public.profiler
  add constraint visningsnamn_ej_reserverat
  check (
    position('hardlist' in translate(lower(visningsnamn), '-_', '')) = 0
    and translate(lower(visningsnamn), '-_', '') !~ '^(admin|moderator|support)[0-9]*$'
  );
