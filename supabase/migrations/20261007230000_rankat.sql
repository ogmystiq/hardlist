-- Rankat spel. En match är tio låtar i vald genre, alltid på Svår, med sök
-- som i fritt spel och samma poäng per låt. Varje konto har en rating per
-- genre som börjar på 1000.
--
-- Ratingen räknas ungefär som ELO, mot låtarna: varje låt har en egen rating
-- som också börjar på 1000. För varje låt jämförs andelen av poängen man fick
-- (70 av 100 blir 0,7) med vad skillnaden i rating förväntar sig. Spelaren
-- flyttas högst 16 per låt, låten högst 8. Svåra låtar blir alltså värda mer
-- med tiden.
--
-- Gissningarna går genom fritt_spela och fritt_gissa, som redan tar emot
-- omgångar med lage rankat. Servern väljer låtarna, rättar och tar tiden.
-- Startar man en ny match räknas en påbörjad som klar, med noll på låtarna
-- som är kvar, så att ingen kan fly från en dålig match.

alter table latbibliotek.latar add column rating numeric not null default 1000;

create table latbibliotek.matcher (
  id uuid primary key default gen_random_uuid(),
  anvandare uuid not null references auth.users (id) on delete cascade,
  genre text not null check (genre in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno')),
  -- De tio låtarna, valda när matchen startar.
  latar bigint[] not null,
  klar boolean not null default false,
  poang integer,
  rating_fore numeric,
  rating_efter numeric,
  skapad timestamptz not null default now(),
  avslutad timestamptz
);

create index matcher_konto on latbibliotek.matcher (anvandare, klar);

create table latbibliotek.rating (
  anvandare uuid not null references auth.users (id) on delete cascade,
  genre text not null check (genre in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno')),
  rating numeric not null default 1000,
  matcher integer not null default 0,
  andrad timestamptz not null default now(),
  primary key (anvandare, genre)
);

create index rating_lista on latbibliotek.rating (genre, rating desc);

alter table latbibliotek.matcher enable row level security;
alter table latbibliotek.rating enable row level security;
revoke all on table latbibliotek.matcher from public, anon, authenticated;
revoke all on table latbibliotek.rating from public, anon, authenticated;

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

-- Räknar ihop en match och flyttar ratingen. Låtar som aldrig spelades klart
-- räknas som missade.
create function latbibliotek.rankat_avsluta(p_match uuid) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_m latbibliotek.matcher;
  v_fore numeric;
  v_spelare numeric;
  v_rad record;
  v_s numeric;
  v_e numeric;
  v_summa integer := 0;
  v_andring numeric := 0;
begin
  select * into v_m from latbibliotek.matcher where id = p_match for update;
  if v_m.id is null or v_m.klar then return null; end if;

  insert into latbibliotek.rating (anvandare, genre) values (v_m.anvandare, v_m.genre)
  on conflict do nothing;
  select rating into v_fore from latbibliotek.rating where anvandare = v_m.anvandare and genre = v_m.genre;
  v_spelare := v_fore;

  for v_rad in
    select l.id, l.rating, coalesce(o.poang, 0) as poang
    from unnest(v_m.latar) as m(lat_id)
    join latbibliotek.latar l on l.id = m.lat_id
    left join latbibliotek.omgangar o on o.match_id = v_m.id and o.lat_id = l.id and o.klar
  loop
    v_s := v_rad.poang / 100.0;
    v_e := 1 / (1 + power(10, (v_rad.rating - v_spelare) / 400.0));
    v_andring := v_andring + 16 * (v_s - v_e);
    -- Låten förlorar när spelaren får mycket poäng, och tvärtom.
    update latbibliotek.latar set rating = rating + 8 * (v_e - v_s) where id = v_rad.id;
    v_summa := v_summa + v_rad.poang;
  end loop;

  update latbibliotek.rating set
    rating = round(v_fore + v_andring, 1), matcher = matcher + 1, andrad = now()
  where anvandare = v_m.anvandare and genre = v_m.genre;
  update latbibliotek.matcher set
    klar = true, poang = v_summa, rating_fore = v_fore, rating_efter = round(v_fore + v_andring, 1), avslutad = now()
  where id = v_m.id;

  -- Omgångar som aldrig blev klara stängs, så att de inte går att spela vidare.
  update latbibliotek.omgangar set klar = true, ratt = false, poang = 0, avslutad = now()
  where match_id = v_m.id and not klar;

  return jsonb_build_object(
    'klar', true,
    'poang', v_summa,
    'rating_fore', v_fore,
    'rating_efter', round(v_fore + v_andring, 1),
    'andring', round(v_andring, 1)
  );
end
$$;

-- Läget i en match: vilken låt som är nästa, och poängen hittills.
create function latbibliotek.rankat_lage(p_match uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'match', m.id,
    'genre', m.genre,
    'klar', m.klar,
    'antal', cardinality(m.latar),
    'spelade', (select count(*) from latbibliotek.omgangar o where o.match_id = m.id and o.klar),
    'poang', coalesce((select sum(poang) from latbibliotek.omgangar o where o.match_id = m.id and o.klar), 0),
    'rating', (select rating from latbibliotek.rating r where r.anvandare = m.anvandare and r.genre = m.genre)
  )
  from latbibliotek.matcher m where m.id = p_match
$$;

/* ---------- det sajten får anropa ---------- */

-- Startar en match. Bara inloggade med visningsnamn.
create function public.rankat_starta(p_genre text) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_oppen uuid;
  v_latar bigint[];
  v_id uuid;
begin
  if v_uid is null or not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'inte_inloggad');
  end if;
  if p_genre is null or p_genre not in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno') then
    return jsonb_build_object('fel', 'ogiltig_genre');
  end if;

  -- En påbörjad match räknas som klar, med noll på det som är kvar.
  for v_oppen in select id from latbibliotek.matcher where anvandare = v_uid and not klar loop
    perform latbibliotek.rankat_avsluta(v_oppen);
  end loop;

  -- Tio låtar på Svår, de 75 procent mest kända. Låtar kontot redan hört
  -- väljs sist.
  select array_agg(id) into v_latar from (
    select l.id from latbibliotek.latar l
    join latbibliotek.popularitet() p on p.lat_id = l.id
    where l.genre = p_genre and p.plats <= 0.75
    order by exists (select 1 from latbibliotek.hort h where h.anvandare = v_uid and h.lat_id = l.id), random()
    limit 10
  ) x;
  if coalesce(cardinality(v_latar), 0) < 10 then
    return jsonb_build_object('fel', 'inga_latar');
  end if;

  insert into latbibliotek.matcher (anvandare, genre, latar) values (v_uid, p_genre, v_latar)
  returning id into v_id;
  insert into latbibliotek.rating (anvandare, genre) values (v_uid, p_genre) on conflict do nothing;
  return latbibliotek.rankat_lage(v_id);
end
$$;

-- Nästa låt i matchen. När alla tio är spelade räknas matchen ihop och
-- ratingen flyttas.
create function public.rankat_nasta(p_match uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m latbibliotek.matcher;
  v_o latbibliotek.omgangar;
  v_lat bigint;
  v_id uuid;
  v_slut jsonb;
begin
  select * into v_m from latbibliotek.matcher where id = p_match and anvandare = v_uid;
  if v_m.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_m.klar then return latbibliotek.rankat_lage(v_m.id) || jsonb_build_object('fel', 'klar'); end if;

  -- En pågående låt fortsätter, så att omladdning inte ger en ny chans.
  select * into v_o from latbibliotek.omgangar where match_id = v_m.id and not klar limit 1;
  if v_o.id is not null then
    return latbibliotek.rankat_lage(v_m.id) || jsonb_build_object(
      'omgang', v_o.id, 'steg', v_o.steg, 'forsok', v_o.forsok, 'startad', v_o.steg_tid is not null,
      'nummer', (select count(*) from latbibliotek.omgangar where match_id = v_m.id and klar) + 1);
  end if;

  select l into v_lat from unnest(v_m.latar) with ordinality as x(l, n)
  where not exists (select 1 from latbibliotek.omgangar o where o.match_id = v_m.id and o.lat_id = x.l)
  order by n limit 1;

  if v_lat is null then
    -- Räkna ihop först, så att läget visar den nya ratingen.
    v_slut := latbibliotek.rankat_avsluta(v_m.id);
    return latbibliotek.rankat_lage(v_m.id) || v_slut;
  end if;

  insert into latbibliotek.omgangar (anvandare, lat_id, lage, match_id, val, niva)
  values (v_uid, v_lat, 'rankat', v_m.id, v_m.genre, 'svar')
  returning id into v_id;

  return latbibliotek.rankat_lage(v_m.id) || jsonb_build_object(
    'omgang', v_id, 'steg', 0, 'forsok', '[]'::jsonb, 'startad', false,
    'nummer', (select count(*) from latbibliotek.omgangar where match_id = v_m.id and klar) + 1);
end
$$;

-- Kontots ratingar och en påbörjad match, om det finns en.
create function public.rankat_min() returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'rating', coalesce((select jsonb_object_agg(genre, jsonb_build_object('rating', rating, 'matcher', matcher))
                        from latbibliotek.rating where anvandare = auth.uid()), '{}'::jsonb),
    'oppen', (select jsonb_build_object('match', id, 'genre', genre) from latbibliotek.matcher
              where anvandare = auth.uid() and not klar order by skapad desc limit 1)
  ) end
$$;

-- Topplistan per genre. Bara konton som spelat minst en match. Lämnar bara
-- ut visningsnamn, bild, badge vid namnet, rating och antal matcher.
create function public.rankat_topplista(p_genre text) returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with rankad as (
    select r.anvandare, p.visningsnamn, r.rating, r.matcher,
      rank() over (order by r.rating desc) as plats,
      row_number() over (order by r.rating desc, lower(p.visningsnamn)) as nr
    from latbibliotek.rating r
    join public.profiler p on p.id = r.anvandare
    where r.genre = p_genre and r.matcher > 0
  )
  select jsonb_build_object(
    'genre', p_genre,
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plats', plats, 'namn', visningsnamn, 'rating', round(rating), 'matcher', matcher,
        'bild', profil.synlig_bild(anvandare), 'badge', profil.vid_namnet(anvandare)
      ) order by nr) from rankad where nr <= 50), '[]'::jsonb),
    'jag', (select jsonb_build_object('plats', plats, 'namn', visningsnamn, 'rating', round(rating), 'matcher', matcher, 'listad', nr <= 50)
            from rankad where anvandare = auth.uid())
  )
$$;

/* ---------- rättigheter ---------- */

revoke all on all functions in schema latbibliotek from public, anon, authenticated;
revoke all on function public.rankat_starta(text) from public, anon, authenticated;
revoke all on function public.rankat_nasta(uuid) from public, anon, authenticated;
revoke all on function public.rankat_min() from public, anon, authenticated;
revoke all on function public.rankat_topplista(text) from public, anon, authenticated;
grant execute on function public.rankat_starta(text) to authenticated;
grant execute on function public.rankat_nasta(uuid) to authenticated;
grant execute on function public.rankat_min() to authenticated;
grant execute on function public.rankat_topplista(text) to anon, authenticated;
