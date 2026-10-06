-- Profiler för inloggade användare. En rad per konto, skapas först när
-- användaren väljer visningsnamn — inloggningen ensam lämnar inget här.

create table public.profiler (
  -- Kaskaden gör att raden försvinner när inloggningen raderas, så
  -- kontoraderingen kan inte lämna en föräldralös profil efter sig.
  id uuid primary key references auth.users (id) on delete cascade,
  visningsnamn text not null,
  skapad timestamptz not null default now(),

  -- Bara a–ö, siffror, bindestreck och understreck. Övriga Unicode-bokstäver
  -- släpps inte in eftersom kyrilliska och grekiska tecken kan se exakt ut
  -- som latinska och användas för att utge sig för att vara någon annan.
  constraint visningsnamn_format
    check (visningsnamn ~ '^[A-Za-zÅÄÖåäö0-9_-]{3,20}$')
);

-- Unikt oberoende av versaler, annars kan Jonte och jonte stå bredvid
-- varandra i en topplista.
create unique index profiler_visningsnamn_unik
  on public.profiler (lower(visningsnamn));

comment on table public.profiler is
  'Visningsnamn för hardlist.se. Raderas via Edge Function radera-konto.';

alter table public.profiler enable row level security;

-- Supabase delar som standard ut alla rättigheter till anon och
-- authenticated. Nollställ och dela ut exakt det som behövs, så att
-- ingen kan sätta ett eget skapad-datum eller flytta en profil till ett
-- annat id även om en policy skulle släppa igenom det.
revoke all on table public.profiler from anon, authenticated;
grant select on table public.profiler to anon, authenticated;
grant insert (id, visningsnamn) on table public.profiler to authenticated;
grant update (visningsnamn) on table public.profiler to authenticated;

-- Visningsnamnen ska synas i topplistor, även för den som inte är inloggad.
create policy "Alla läser profiler"
  on public.profiler for select
  to anon, authenticated
  using (true);

create policy "Skapa egen profil"
  on public.profiler for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Ändra egen profil"
  on public.profiler for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Ingen delete-policy: radering går bara via Edge Function, som tar bort
-- inloggningen och låter kaskaden ta resten.
