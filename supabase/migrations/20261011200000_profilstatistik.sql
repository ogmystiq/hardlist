-- Statistik per spel på profilen.
--
-- Allt räknas ur det som redan sparas, ingen ny datainsamling:
--   Dagens fråga  quiz.konton (antal, rätt, svit, bästa svit) och poängen.
--   Dagens låt    dag_forsok och omgångarna: spelade, rätt, vilket klipp svaret
--                 räknades på, svit av dagar i rad med rätt.
--   Fritt spel    omgångarna med läge fritt: spelade, rätt, rätt per svårighet
--                 och mest spelade genre.
-- Plats i topplistan: nu totalt, och bästa månadsplats ur månadsbilderna
-- (profil.manader) och innevarande månad.
--
-- Bara aggregat. Ingenting om en enskild dag, och aldrig vilket alternativ som
-- var rätt, så statistiken kan visas för alla som ser profilen.
--
-- Bara nytt läggs till och funktioner ersätts.

create function profil.statistik(p_anvandare uuid) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_idag date := quiz.idag();
  v_konto quiz.konton;
  v_fraga jsonb;
  v_lat jsonb;
  v_fritt jsonb;
  v_basta_lat integer;
  v_nu_lat integer;
  v_klipp integer[] := array[0, 0, 0, 0, 0];
  v_oftast integer;
  v_spelade integer;
  v_ratt integer;
  v_niva jsonb;
  v_genre text;
  v_genre_n integer;
  v_plats_total integer;
  v_plats_manad integer;
  v_manad date;
  v_r record;
begin
  select * into v_konto from quiz.konton where anvandare = p_anvandare;

  v_fraga := jsonb_build_object(
    'spelade', coalesce(v_konto.antal, 0),
    'ratt', coalesce(v_konto.ratt_antal, 0),
    -- En missad dag bryter sviten även om inget svar sparats sedan dess.
    'svit', case when v_konto.senast >= v_idag - 1 then v_konto.svit else 0 end,
    'basta', coalesce(v_konto.basta, 0),
    'poang', quiz.total(p_anvandare, 'fraga')
  );

  /* Dagens låt */
  select count(*) filter (where o.klar), count(*) filter (where o.ratt)
  into v_spelade, v_ratt
  from latbibliotek.dag_forsok f
  join latbibliotek.omgangar o on o.id = f.omgang
  where f.anvandare = p_anvandare;

  for v_r in
    select (o.forsok->0->>'raknat')::integer as klipp, count(*)::integer as antal
    from latbibliotek.dag_forsok f
    join latbibliotek.omgangar o on o.id = f.omgang
    where f.anvandare = p_anvandare and o.ratt and (o.forsok->0->>'raknat') is not null
    group by 1
  loop
    if v_r.klipp between 0 and 4 then v_klipp[v_r.klipp + 1] := v_r.antal; end if;
  end loop;
  -- Vid lika många vinner det kortaste klippet.
  select i - 1 into v_oftast from generate_subscripts(v_klipp, 1) i
  where v_klipp[i] > 0 order by v_klipp[i] desc, i limit 1;

  -- Dagar i rad med rätt. Är dagens låt spelad och fel är sviten bruten.
  with d as (
    select distinct f.datum
    from latbibliotek.dag_forsok f
    join latbibliotek.omgangar o on o.id = f.omgang
    where f.anvandare = p_anvandare and o.ratt
  ),
  g as (select datum, datum - (row_number() over (order by datum))::integer as grupp from d),
  ol as (select count(*)::integer as langd, max(datum) as slut from g group by grupp)
  select coalesce(max(langd), 0), coalesce(max(langd) filter (where slut >= v_idag - 1), 0)
  into v_basta_lat, v_nu_lat from ol;
  if exists (
    select 1 from latbibliotek.dag_forsok f
    join latbibliotek.omgangar o on o.id = f.omgang
    where f.anvandare = p_anvandare and f.datum = v_idag and o.klar and not o.ratt
  ) then
    v_nu_lat := 0;
  end if;

  v_lat := jsonb_build_object(
    'spelade', coalesce(v_spelade, 0),
    'ratt', coalesce(v_ratt, 0),
    'svit', v_nu_lat,
    'basta', v_basta_lat,
    'poang', quiz.total(p_anvandare, 'lat'),
    'klipp', to_jsonb(v_klipp),
    'oftast', v_oftast
  );

  /* Fritt spel */
  select count(*) filter (where klar), count(*) filter (where ratt)
  into v_spelade, v_ratt
  from latbibliotek.omgangar where anvandare = p_anvandare and lage = 'fritt';

  select jsonb_build_object(
    'latt', count(*) filter (where ratt and niva = 'latt'),
    'medel', count(*) filter (where ratt and niva = 'medel'),
    'svar', count(*) filter (where ratt and niva = 'svar'),
    'expert', count(*) filter (where ratt and niva = 'expert')
  ) into v_niva
  from latbibliotek.omgangar where anvandare = p_anvandare and lage = 'fritt';

  select l.genre, count(*)::integer into v_genre, v_genre_n
  from latbibliotek.omgangar o
  join latbibliotek.latar l on l.id = o.lat_id
  where o.anvandare = p_anvandare and o.lage = 'fritt' and o.klar
  group by l.genre order by count(*) desc, l.genre limit 1;

  v_fritt := jsonb_build_object(
    'spelade', coalesce(v_spelade, 0),
    'ratt', coalesce(v_ratt, 0),
    'poang', quiz.total(p_anvandare, 'fritt'),
    'niva', v_niva,
    'genre', v_genre,
    'genre_spelade', v_genre_n
  );

  /* Plats i topplistan */
  select plats::integer into v_plats_total from (
    select a.anvandare, rank() over (order by sum(a.poang) desc) as plats
    from quiz.alla_poang a
    join public.profiler p on p.id = a.anvandare
    group by a.anvandare
    having sum(a.poang) > 0
  ) x where anvandare = p_anvandare;

  select plats, manad into v_plats_manad, v_manad from (
    select plats, manad from profil.manader where anvandare = p_anvandare
    union all
    select profil.manadsplats(p_anvandare), date_trunc('month', v_idag)::date
  ) y where plats is not null order by plats, manad desc limit 1;

  return jsonb_build_object(
    'fraga', v_fraga,
    'lat', v_lat,
    'fritt', v_fritt,
    'plats_total', v_plats_total,
    'basta_manad_plats', v_plats_manad,
    'basta_manad', v_manad
  );
end
$$;

-- Profilen med statistik. Kraschar statistiken visas profilen ändå, utan den.
create or replace function public.profil_visa(p_namn text) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_p jsonb;
begin
  select id into v_id from public.profiler where lower(visningsnamn) = lower(p_namn);
  if v_id is null then return null; end if;
  v_p := profil.profil_json(v_id, auth.uid());
  begin
    v_p := v_p || jsonb_build_object('statistik', profil.statistik(v_id));
  exception when others then
    raise warning 'Profilstatistiken misslyckades: %', sqlerrm;
  end;
  return v_p;
end
$$;

create or replace function public.profil_min() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inst profil.installningar;
  v_p jsonb;
begin
  if v_uid is null then return jsonb_build_object('fel', 'inte_inloggad'); end if;
  if not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'visningsnamn_saknas');
  end if;
  select * into v_inst from profil.installningar where anvandare = v_uid;
  v_p := profil.profil_json(v_uid, v_uid) || jsonb_build_object(
    'bild_egen', profil.bild_url(v_inst.bild),
    'bild_dold', coalesce(v_inst.bild_status = 'dold', false),
    'badge_val', v_inst.badge
  );
  begin
    v_p := v_p || jsonb_build_object('statistik', profil.statistik(v_uid));
  exception when others then
    raise warning 'Profilstatistiken misslyckades: %', sqlerrm;
  end;
  return v_p;
end
$$;

revoke all on all functions in schema profil from public, anon, authenticated;
revoke all on function public.profil_visa(text) from public, anon, authenticated;
revoke all on function public.profil_min() from public, anon, authenticated;
grant execute on function public.profil_visa(text) to anon, authenticated;
grant execute on function public.profil_min() to authenticated;
