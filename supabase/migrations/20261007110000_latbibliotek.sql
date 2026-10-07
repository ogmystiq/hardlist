-- Låtbiblioteket för fritt spel.
--
-- Låtarna, och vilken låt en pågående omgång gäller, ligger i ett eget schema
-- som API:t inte exponerar. Webbläsaren får aldrig veta vilken låt det är
-- förrän den gissat. Sajten ska nå biblioteket bara genom spelfunktionerna,
-- som kommer i en senare migration — den här skapar bara tabellerna och
-- påfyllningen.
--
-- Identiteten kommer från MusicBrainz, låtarna och ljudet från iTunes. Ingen
-- data från Deezer sparas här.

create schema latbibliotek;

-- Schemat står inte i [api] schemas i config.toml, och ska aldrig göra det.
-- Rättigheterna nollas ändå, så att ett misstag där inte räcker för att läsa
-- vilken låt en omgång gäller.
revoke all on schema latbibliotek from public, anon, authenticated;

/* ---------- artisterna ---------- */

create table latbibliotek.artister (
  -- Som i artistlistan i hamta-releaser.mjs.
  namn text primary key,
  genre text not null check (genre in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno')),
  -- Ur morgonkörningens cache. Bara för spårbarhet, inga Spotify-anrop görs.
  spotify_id text,
  mbid uuid,
  -- En artist kan ha flera sidor hos Apple. Då gäller alla.
  apple_ids bigint[] not null default '{}',
  -- Hur identiteten bekräftades: Apple-länk i MusicBrainz, titlar gemensamma
  -- med artistens inspelningar i MusicBrainz, eller fastnaglad för hand.
  lage text not null check (lage in ('musicbrainz', 'inspelningar', 'fastnaglad')),
  aktiv boolean not null default true,
  senast_hamtad timestamptz,
  andrad timestamptz not null default now()
);

/* ---------- låtarna ---------- */

create table latbibliotek.latar (
  id bigint generated always as identity primary key,
  itunes_id bigint not null unique,
  itunes_artist_id bigint not null,
  artist_namn text not null references latbibliotek.artister (namn) on update cascade,
  -- Som iTunes skriver det. Visas i facit och i sökningen.
  artist text not null,
  titel text not null,
  -- Artist och titel normaliserade för sökningen, så att den slipper räkna om.
  sok text not null,
  genre text not null check (genre in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno')),
  -- Apples förlyssning. Spelas direkt från Apple, sparas aldrig som fil —
  -- Apples villkor tillåter bara strömning.
  ljud text not null,
  -- Låten i Apple Music. Visas vid förlyssningen efter gissningen.
  apple_lank text not null,
  langd_ms integer,
  -- Platsen i iTunes egen lista. Bara information: den följer inte hur känd
  -- låten är (uppmätt mot Deezers rank, median 0,19).
  itunes_ordning smallint,
  -- Svårigheten sätts av spelet: alla låtar börjar som medel och flyttas
  -- efter hur ofta spelarna gissar rätt.
  svarighet text not null default 'medel' check (svarighet in ('latt', 'medel', 'svar')),
  spelade integer not null default 0,
  ratt integer not null default 0,
  aktiv boolean not null default true,
  -- Sätts när förlyssningen inte går att spela, så att låten tas ur spel
  -- utan att raderas. Gamla omgångar pekar på den.
  trasig timestamptz,
  tillagd timestamptz not null default now(),
  kontrollerad timestamptz not null default now()
);

create index latar_spelbara on latbibliotek.latar (genre, svarighet) where aktiv and trasig is null;
create index latar_artist on latbibliotek.latar (artist_namn);

/* ---------- omgångar och hörda låtar ---------- */

create table latbibliotek.omgangar (
  id uuid primary key default gen_random_uuid(),
  -- Utan konto: null. Sådana omgångar raderas efter ett dygn, se rensa().
  anvandare uuid references auth.users (id) on delete cascade,
  lat_id bigint not null references latbibliotek.latar (id),
  -- Fritt spel nu. Rankat spel och dueller kommer senare och använder samma
  -- omgångar, med match_id för att knyta ihop dem.
  lage text not null default 'fritt' check (lage in ('fritt', 'rankat', 'duell')),
  match_id uuid,
  forsok jsonb not null default '[]',
  klar boolean not null default false,
  ratt boolean,
  skapad timestamptz not null default now(),
  avslutad timestamptz
);

create index omgangar_anonyma on latbibliotek.omgangar (skapad) where anvandare is null;
create index omgangar_konto on latbibliotek.omgangar (anvandare) where anvandare is not null;

-- Låtar ett konto redan hört, så att de inte kommer tillbaka. Raderas med
-- kontot. Utan konto håller webbläsaren listan själv.
create table latbibliotek.hort (
  anvandare uuid not null references auth.users (id) on delete cascade,
  lat_id bigint not null references latbibliotek.latar (id) on delete cascade,
  hord timestamptz not null default now(),
  primary key (anvandare, lat_id)
);

alter table latbibliotek.artister enable row level security;
alter table latbibliotek.latar enable row level security;
alter table latbibliotek.omgangar enable row level security;
alter table latbibliotek.hort enable row level security;
revoke all on all tables in schema latbibliotek from public, anon, authenticated;
revoke all on all sequences in schema latbibliotek from public, anon, authenticated;

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

-- Omgångar utan konto sparas bara medan de pågår. Anropas av spelfunktionerna.
create function latbibliotek.rensa() returns integer
language sql volatile
set search_path = ''
as $$
  with borta as (
    delete from latbibliotek.omgangar
    where anvandare is null and skapad < now() - interval '1 day'
    returning 1
  )
  select count(*)::integer from borta
$$;

/* ---------- påfyllningen, bara med servicenyckeln ---------- */

-- Anropas av scripts/latbibliotek.mjs med en egen hemlig nyckel. Lägger in
-- och uppdaterar artister och låtar. Spelets egen statistik — svårighet,
-- spelade och rätt — skrivs aldrig över, så att en ny påfyllning inte
-- nollställer det spelarna lärt biblioteket.
--
-- p: { "artister": [{ namn, genre, spotify_id, mbid, apple_ids, lage }],
--      "latar":    [{ itunes_id, itunes_artist_id, artist_namn, artist, titel,
--                     sok, genre, ljud, apple_lank, langd_ms, itunes_ordning }] }
create function public.latbibliotek_fyll(p jsonb) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_artister integer;
  v_nya integer;
  v_andrade integer;
begin
  insert into latbibliotek.artister (namn, genre, spotify_id, mbid, apple_ids, lage, senast_hamtad, andrad)
  select a.namn, a.genre, a.spotify_id, a.mbid, coalesce(a.apple_ids, '{}'), a.lage, now(), now()
  from jsonb_to_recordset(coalesce(p->'artister', '[]'))
    as a(namn text, genre text, spotify_id text, mbid uuid, apple_ids bigint[], lage text)
  on conflict (namn) do update set
    genre = excluded.genre,
    spotify_id = excluded.spotify_id,
    mbid = excluded.mbid,
    apple_ids = excluded.apple_ids,
    lage = excluded.lage,
    aktiv = true,
    senast_hamtad = now(),
    andrad = now();
  get diagnostics v_artister = row_count;

  with in_data as (
    select * from jsonb_to_recordset(coalesce(p->'latar', '[]'))
      as l(itunes_id bigint, itunes_artist_id bigint, artist_namn text, artist text, titel text,
           sok text, genre text, ljud text, apple_lank text, langd_ms integer, itunes_ordning smallint)
  ), skrivna as (
    insert into latbibliotek.latar as t
      (itunes_id, itunes_artist_id, artist_namn, artist, titel, sok, genre, ljud, apple_lank, langd_ms, itunes_ordning)
    select itunes_id, itunes_artist_id, artist_namn, artist, titel, sok, genre, ljud, apple_lank, langd_ms, itunes_ordning
    from in_data
    on conflict (itunes_id) do update set
      itunes_artist_id = excluded.itunes_artist_id,
      artist_namn = excluded.artist_namn,
      artist = excluded.artist,
      titel = excluded.titel,
      sok = excluded.sok,
      genre = excluded.genre,
      ljud = excluded.ljud,
      apple_lank = excluded.apple_lank,
      langd_ms = excluded.langd_ms,
      itunes_ordning = excluded.itunes_ordning,
      aktiv = true,
      trasig = null,
      kontrollerad = now()
    returning (xmax = 0) as ny
  )
  select count(*) filter (where ny), count(*) filter (where not ny)
  into v_nya, v_andrade
  from skrivna;

  return jsonb_build_object('artister', v_artister, 'nya_latar', v_nya, 'uppdaterade_latar', v_andrade);
end
$$;

-- Postgres låter alla köra nya funktioner, och Supabase delar dessutom ut
-- rättigheter till anon och authenticated. Bara servicenyckeln får fylla på.
revoke all on all functions in schema latbibliotek from public, anon, authenticated;
revoke all on function public.latbibliotek_fyll(jsonb) from public, anon, authenticated;
grant execute on function public.latbibliotek_fyll(jsonb) to service_role;
