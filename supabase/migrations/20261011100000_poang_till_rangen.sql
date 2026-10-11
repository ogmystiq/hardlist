-- Alla poäng räknas till rangen och topplistan.
--
-- Förut räknades bara dagens fråga. Nu ger också Dagens låt och fritt spel
-- poäng till rangen, med egna regler:
--   Dagens fråga  som förut.
--   Dagens låt    20, 15, 10, 7 eller 5 beroende på vilket klipp låten klaras
--                 på. Fel svar ger 0.
--   Fritt spel    0,2 på Lätt, 0,4 på Medel, 0,7 på Svår och 1 på Expert per
--                 rätt låt, högst 10 poäng per konto och dygn, svensk tid.
-- Spelpoängen i spelen (100, 70 och så vidare) är en annan sak och ändras inte.
--
-- Rangerna dubblas, så att det fortfarande tar ungefär ett år av perfekt spel
-- att nå Legend: Raver 100, Frontrow 400, Hardhead 1 000, Hakker 2 400,
-- Gabber 5 000, Oldschool 10 000 och Legend 20 000.
--
-- Bara nytt läggs till och funktioner ersätts. Inga befintliga tabeller
-- ändras. Det som redan spelats i Dagens låt och fritt spel räknas in sist i
-- filen, med samma regler och samma tak per dygn.

/* ---------- poäng från spelen ---------- */

-- Poäng till rangen från Dagens låt (lat) och fritt spel (fritt). En rad per
-- omgång, så att samma omgång aldrig ger poäng två gånger. Ingen främmande
-- nyckel mot omgångarna: de raderas, poängen ska stå kvar.
create table quiz.spelpoang (
  omgang uuid primary key,
  anvandare uuid not null references auth.users (id) on delete cascade,
  spel text not null check (spel in ('lat', 'fritt')),
  datum date not null,
  poang numeric(4, 1) not null check (poang > 0),
  skapad timestamptz not null default now()
);

create index spelpoang_konto on quiz.spelpoang (anvandare, datum);

alter table quiz.spelpoang enable row level security;
revoke all on table quiz.spelpoang from public, anon, authenticated;

-- Alla poäng på ett ställe: dagens fråga (fraga), Dagens låt (lat) och fritt
-- spel (fritt). Totalen, månaden och topplistorna räknas härifrån.
create view quiz.alla_poang as
select anvandare, datum, 'fraga'::text as spel, plus::numeric as poang from quiz.svar
union all
select anvandare, datum, spel, poang from quiz.spelpoang;

revoke all on table quiz.alla_poang from public, anon, authenticated;

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

create function quiz.fritt_tak() returns numeric
language sql immutable
set search_path = ''
as $$ select 10::numeric $$;

-- Poäng till rangen för rätt svar i Dagens låt, efter klippet svaret räknas på.
create function latbibliotek.dag_rang(p_steg integer) returns integer
language sql immutable
set search_path = ''
as $$ select (array[20, 15, 10, 7, 5])[least(greatest(p_steg, 0), 4) + 1] $$;

-- Poäng till rangen för en rätt låt i fritt spel, efter svårighet.
create function latbibliotek.fritt_rang(p_niva text) returns numeric
language sql immutable
set search_path = ''
as $$ select case p_niva when 'latt' then 0.2 when 'medel' then 0.4 when 'svar' then 0.7 else 1.0 end $$;

-- Summan av alla poäng för ett konto, eller bara ett spel (fraga, lat, fritt).
create function quiz.total(p_anvandare uuid, p_spel text default null) returns numeric
language sql stable
set search_path = ''
as $$
  select trim_scale(coalesce(sum(poang), 0))
  from quiz.alla_poang
  where anvandare = p_anvandare and (p_spel is null or spel = p_spel)
$$;

-- Rangskalan. Ändras den ska profil.rang_json och badges.js ändras med.
create function quiz.rang(p numeric) returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p >= 20000 then 'Legend'
    when p >= 10000 then 'Oldschool'
    when p >= 5000 then 'Gabber'
    when p >= 2400 then 'Hakker'
    when p >= 1000 then 'Hardhead'
    when p >= 400 then 'Frontrow'
    when p >= 100 then 'Raver'
    else 'Nybörjare'
  end
$$;

create or replace function quiz.rang(p integer) returns text
language sql immutable
set search_path = ''
as $$ select quiz.rang(p::numeric) $$;

-- Ger poäng för en avslutad, rätt besvarad omgång. Samma omgång ger poäng en
-- gång. Fritt spel stoppas av dygnstaket. Det som returneras läggs på svaret
-- till sidan: rang_plus är poängen som gavs, rang_tak om taket hindrade.
create function quiz.ge_spelpoang(p_anvandare uuid, p_omgang uuid, p_spel text, p_plus numeric)
returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_idag date := quiz.idag();
  v_ge numeric;
begin
  -- Två omgångar som slutar samtidigt får inte båda se samma kvarvarande tak.
  perform pg_advisory_xact_lock(hashtext('spelpoang:' || p_anvandare::text));

  select poang into v_ge from quiz.spelpoang where omgang = p_omgang;
  if found then
    return jsonb_build_object('rang_plus', trim_scale(v_ge), 'rang_tak', v_ge < p_plus);
  end if;

  v_ge := p_plus;
  if p_spel = 'fritt' then
    v_ge := least(p_plus, greatest(0, quiz.fritt_tak() - coalesce((
      select sum(poang) from quiz.spelpoang
      where anvandare = p_anvandare and spel = 'fritt' and datum = v_idag
    ), 0)));
  end if;

  if v_ge > 0 then
    insert into quiz.spelpoang (omgang, anvandare, spel, datum, poang)
    values (p_omgang, p_anvandare, p_spel, v_idag, v_ge);
  end if;
  return jsonb_build_object('rang_plus', trim_scale(v_ge), 'rang_tak', v_ge < p_plus);
end
$$;

-- Legend vid 20 000 poäng, oavsett vilket spel som gav de sista. Returnerar de
-- nya badgesen som [{ id, forst }], som i dela_ut_svar.
create function quiz.legend_badge(p_anvandare uuid) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
begin
  if quiz.total(p_anvandare) >= 20000 and profil.ge(p_anvandare, 'legend', now(), true) then
    return jsonb_build_array(jsonb_build_object('id', 'legend', 'forst', profil.forst('legend')));
  end if;
  return '[]'::jsonb;
end
$$;

-- Dagens fråga svarar som förut, men poäng och nivå räknas på alla spel.
create or replace function quiz.konto_json(p_anvandare uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'poang', quiz.total(p_anvandare),
    -- En missad dag bryter sviten även om inget svar sparats sedan dess.
    'svit', case when k.senast >= quiz.idag() - 1 then k.svit else 0 end,
    'basta', coalesce(k.basta, 0),
    'antal', coalesce(k.antal, 0),
    'ratt', coalesce(k.ratt_antal, 0),
    'rang', quiz.rang(quiz.total(p_anvandare)),
    'har_namn', exists (select 1 from public.profiler p where p.id = p_anvandare)
  )
  from (select 1) x
  left join quiz.konton k on k.anvandare = p_anvandare
$$;

-- Rangskalan med gränserna utskrivna så att profilen kan visa nästa rang och
-- hur långt det är kvar. Ändras quiz.rang ska den ändras här.
create or replace function profil.rang_json(p_poang numeric) returns jsonb
language sql immutable
set search_path = ''
as $$
  with skala(namn, grans) as (values
    ('Nybörjare', 0), ('Raver', 100), ('Frontrow', 400), ('Hardhead', 1000),
    ('Hakker', 2400), ('Gabber', 5000), ('Oldschool', 10000), ('Legend', 20000)
  ),
  nu as (select * from skala where grans <= greatest(p_poang, 0) order by grans desc limit 1),
  nasta as (select * from skala where grans > greatest(p_poang, 0) order by grans limit 1)
  select jsonb_build_object(
    'rang', (select namn from nu),
    'rang_fran', (select grans from nu),
    'nasta_rang', (select namn from nasta),
    'nasta_grans', (select grans from nasta),
    'kvar', (select grans from nasta) - greatest(p_poang, 0)
  )
$$;

create or replace function profil.rang_json(p_poang integer) returns jsonb
language sql immutable
set search_path = ''
as $$ select profil.rang_json(p_poang::numeric) $$;

/* ---------- profil, badges, månadsplats och spelen ---------- */

create or replace function profil.profil_json(p_anvandare uuid, p_tittare uuid) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_profil public.profiler;
  v_konto quiz.konton;
  v_inst profil.installningar;
  v_svit integer;
  v_poang numeric;
  v_spelare integer;
begin
  select * into v_profil from public.profiler where id = p_anvandare;
  if not found then return null; end if;
  select * into v_konto from quiz.konton where anvandare = p_anvandare;
  select * into v_inst from profil.installningar where anvandare = p_anvandare;

  -- Poängen från alla spel, se quiz.total.
  v_poang := quiz.total(p_anvandare);
  -- Som i quiz.konto_json: en missad dag bryter sviten även om inget svar
  -- sparats sedan dess.
  v_svit := case when v_konto.senast >= quiz.idag() - 1 then v_konto.svit else 0 end;
  v_spelare := (select count(*) from public.profiler);

  return jsonb_build_object(
    'namn', v_profil.visningsnamn,
    'bild', profil.synlig_bild(p_anvandare),
    'badge', profil.vid_namnet(p_anvandare),
    'poang', trim_scale(round(v_poang, 1)),
    'poang_fraga', quiz.total(p_anvandare, 'fraga'),
    'poang_lat', quiz.total(p_anvandare, 'lat'),
    'poang_fritt', quiz.total(p_anvandare, 'fritt'),
    'plats', profil.manadsplats(p_anvandare),
    'manad', date_trunc('month', quiz.idag())::date,
    'sedan', v_profil.skapad,
    'svit', coalesce(v_svit, 0),
    'basta', coalesce(v_konto.basta, 0),
    'besvarade', coalesce(v_konto.antal, 0),
    'ratt_andel', case when coalesce(v_konto.antal, 0) > 0
      then round(100.0 * v_konto.ratt_antal / v_konto.antal)::integer end,
    'egen', p_tittare is not null and p_tittare = p_anvandare,
    'har_bild', v_inst.bild is not null and v_inst.bild_status in ('synlig', 'godkand'),
    'rapporterad', p_tittare is not null and v_inst.bild is not null and exists (
      select 1 from profil.bildrapporter r
      where r.agare = p_anvandare and r.rapportor = p_tittare and r.sokvag = v_inst.bild
    ),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.badge, 'tagen', b.tagen) order by b.tagen)
      from profil.badges b where b.anvandare = p_anvandare
    ), '[]'::jsonb),
    'framsteg', jsonb_build_object(
      'v7', coalesce(v_svit, 0), 'v30', coalesce(v_svit, 0),
      'v100', coalesce(v_svit, 0), 'v365', coalesce(v_svit, 0),
      'fredag', (select count(*) from quiz.svar s join quiz.fragor f on f.id = s.fraga_id
                 where s.anvandare = p_anvandare and s.ratt and f.musik),
      'fredagsfeber', profil.fredagar_i_rad(p_anvandare),
      'hundra', coalesce(v_konto.ratt_antal, 0),
      'speedcore', (select count(*) from quiz.svar s
                    join quiz.hamtningar h on h.anvandare = s.anvandare and h.datum = s.datum
                    where s.anvandare = p_anvandare and s.ratt
                      and s.svarad - h.hamtad < interval '5 seconds'),
      'dynasti', profil.manader_i_rad(p_anvandare, 1),
      'veteran', profil.manader_i_rad(p_anvandare, 10),
      'legend', v_poang
    ) || jsonb_build_object(
      'gehor', (select count(*) from quiz.svar s join quiz.fragor f on f.id = s.fraga_id
                where s.anvandare = p_anvandare and s.ratt and f.musik),
      'bpm200', coalesce(v_konto.ratt_antal, 0)
    ),
    -- Andel profiler som har varje badge, avrundad till heltal. antal behövs
    -- för att skilja "under 1 %" från "ingen har tagit den än".
    'andelar', coalesce((
      select jsonb_object_agg(k.id, jsonb_build_object(
        'antal', coalesce(n.antal, 0),
        'andel', case when v_spelare > 0 then round(100.0 * coalesce(n.antal, 0) / v_spelare)::integer else 0 end
      ))
      from profil.katalog k
      left join (select badge, count(*) as antal from profil.badges group by badge) n on n.badge = k.id
      where not k.kommer
    ), '{}'::jsonb)
  ) || profil.rang_json(v_poang);
end
$$;

create or replace function profil.dela_ut_svar(p_anvandare uuid, p_datum date, p_basta_fore integer)
returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_k quiz.konton;
  v_s quiz.svar;
  v_hamtad timestamptz;
  v_tid numeric;
  v_lokal timestamp;
  v_musik boolean;
  v_sista date;
  v_ids text[] := '{}';
  v_id text;
  v_ut jsonb := '[]'::jsonb;
begin
  select * into v_s from quiz.svar where anvandare = p_anvandare and datum = p_datum;
  if not found then return v_ut; end if;
  select * into v_k from quiz.konton where anvandare = p_anvandare;
  select hamtad into v_hamtad from quiz.hamtningar where anvandare = p_anvandare and datum = p_datum;
  v_tid := extract(epoch from v_s.svarad - v_hamtad);
  v_lokal := v_s.svarad at time zone 'Europe/Stockholm';
  v_musik := coalesce((select musik from quiz.fragor where id = v_s.fraga_id), false);
  v_sista := (date_trunc('month', p_datum) + interval '1 month - 1 day')::date;

  -- Rätt eller fel spelar ingen roll för de två tidsbadgesen.
  if extract(isodow from v_lokal) in (6, 7) and extract(hour from v_lokal) between 3 and 5 then
    v_ids := array_append(v_ids, 'afterparty'::text);
  end if;
  if extract(hour from v_lokal) = 0 and extract(minute from v_lokal) = 0 then
    v_ids := array_append(v_ids, 'midnatt'::text);
  end if;

  if v_s.ratt then
    v_ids := array_append(v_ids, 'forsta'::text);
    if v_k.svit >= 7 then v_ids := array_append(v_ids, 'v7'::text); end if;
    if v_k.svit >= 30 then v_ids := array_append(v_ids, 'v30'::text); end if;
    if v_k.svit >= 100 then v_ids := array_append(v_ids, 'v100'::text); end if;
    if v_k.svit >= 365 then v_ids := array_append(v_ids, 'v365'::text); end if;
    if v_k.svit = 30 and p_basta_fore >= 30 then v_ids := array_append(v_ids, 'aterfodd'::text); end if;
    if p_datum = v_sista and v_k.svit >= extract(day from v_sista) then
      v_ids := array_append(v_ids, 'perfekt'::text);
    end if;
    if v_k.ratt_antal >= 100 then v_ids := array_append(v_ids, 'hundra'::text); end if;
    if v_k.ratt_antal >= 200 then v_ids := array_append(v_ids, 'bpm200'::text); end if;
    if v_tid < 3 then v_ids := array_append(v_ids, 'blixt'::text); end if;
    if v_tid < 5 and (
      select count(*) from quiz.svar s
      join quiz.hamtningar h on h.anvandare = s.anvandare and h.datum = s.datum
      where s.anvandare = p_anvandare and s.ratt and s.svarad - h.hamtad < interval '5 seconds'
    ) >= 10 then
      v_ids := array_append(v_ids, 'speedcore'::text);
    end if;
    if v_musik then
      if (select count(*) from quiz.svar s join quiz.fragor f on f.id = s.fraga_id
          where s.anvandare = p_anvandare and s.ratt and f.musik) >= 10 then
        v_ids := array_append(v_ids, 'fredag'::text);
      end if;
      if (select count(*) from quiz.svar s join quiz.fragor f on f.id = s.fraga_id
          where s.anvandare = p_anvandare and s.ratt and f.musik) >= 50 then
        v_ids := array_append(v_ids, 'gehor'::text);
      end if;
      -- Bara fredagar räknas, inte extra låtdagar.
      if extract(isodow from p_datum) = 5 and (
        select count(*) from quiz.svar s join quiz.fragor f on f.id = s.fraga_id
        where s.anvandare = p_anvandare and s.ratt and f.musik
          and s.datum in (p_datum - 7, p_datum - 14, p_datum - 21, p_datum - 28)
      ) = 4 then
        v_ids := array_append(v_ids, 'fredagsfeber'::text);
      end if;
    end if;
  end if;

  if quiz.total(p_anvandare) >= 20000 then v_ids := array_append(v_ids, 'legend'::text); end if;

  foreach v_id in array v_ids loop
    if profil.ge(p_anvandare, v_id, v_s.svarad, true) then
      v_ut := v_ut || jsonb_build_array(jsonb_build_object('id', v_id, 'forst', profil.forst(v_id)));
    end if;
  end loop;
  return v_ut;
end
$$;

create or replace function profil.manadsplats(p_anvandare uuid) returns integer
language sql stable
set search_path = ''
as $$
  with summor as (
    select s.anvandare, sum(s.poang) as summa
    from quiz.alla_poang s
    join public.profiler p on p.id = s.anvandare
    where s.datum >= date_trunc('month', quiz.idag())::date
    group by s.anvandare
  ),
  rankad as (
    select anvandare, rank() over (order by summa desc) as plats
    from summor where summa > 0
  )
  select plats::integer from rankad where anvandare = p_anvandare
$$;

create or replace function profil.manadsjobb() returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_manad date := (date_trunc('month', quiz.idag()) - interval '1 month')::date;
  v_r record;
begin
  if exists (select 1 from profil.manad_klar where manad = v_manad) then
    return 'redan klar: ' || v_manad;
  end if;

  insert into profil.manader (manad, anvandare, plats, poang)
  select v_manad, anvandare, rank() over (order by exakt desc), summa
  from (
    select s.anvandare, round(sum(s.poang))::integer as summa, sum(s.poang) as exakt
    from quiz.alla_poang s
    join public.profiler p on p.id = s.anvandare
    where s.datum >= v_manad and s.datum < (v_manad + interval '1 month')::date
    group by s.anvandare
  ) x
  where exakt > 0;

  insert into profil.manad_klar (manad) values (v_manad);

  for v_r in select anvandare, plats from profil.manader where manad = v_manad loop
    if v_r.plats <= 10 then perform profil.ge(v_r.anvandare, 'topp10', now(), false); end if;
    if v_r.plats <= 3 then perform profil.ge(v_r.anvandare, 'pallen', now(), false); end if;
    if v_r.plats = 1 then perform profil.ge(v_r.anvandare, 'etta', now(), false); end if;
    if profil.manader_i_rad(v_r.anvandare, 1) >= 3 then
      perform profil.ge(v_r.anvandare, 'dynasti', now(), false);
    end if;
    if profil.manader_i_rad(v_r.anvandare, 10) >= 12 then
      perform profil.ge(v_r.anvandare, 'veteran', now(), false);
    end if;
  end loop;

  return 'klar: ' || v_manad;
end
$$;

create or replace function latbibliotek.sok_avsluta(p_o latbibliotek.omgangar, p_ratt boolean, p_steg integer)
returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_lat latbibliotek.latar;
  v_poang integer := case when p_ratt then latbibliotek.sok_poang(p_steg) else 0 end;
  v_nya jsonb := '[]'::jsonb;
  v_konto jsonb;
  v_rang jsonb := '{}'::jsonb;
begin
  select * into v_lat from latbibliotek.latar where id = p_o.lat_id;
  update latbibliotek.omgangar set klar = true, ratt = p_ratt, poang = v_poang, avslutad = now()
  where id = p_o.id;
  update latbibliotek.latar set spelade = spelade + 1, ratt = ratt + p_ratt::integer where id = v_lat.id;

  if p_o.anvandare is not null then
    insert into latbibliotek.hort (anvandare, lat_id) values (p_o.anvandare, v_lat.id)
    on conflict (anvandare, lat_id) do update set hord = now();
    insert into latbibliotek.statistik (anvandare, genre, spelade, ratt)
    values (p_o.anvandare, v_lat.genre, 1, p_ratt::integer)
    on conflict (anvandare, genre) do update set
      spelade = latbibliotek.statistik.spelade + 1,
      ratt = latbibliotek.statistik.ratt + p_ratt::integer;
    insert into latbibliotek.dagar (anvandare, datum, rundor) values (p_o.anvandare, quiz.idag(), 1)
    on conflict (anvandare, datum) do update set rundor = latbibliotek.dagar.rundor + 1;

    begin
      v_nya := latbibliotek.dela_ut(p_o.anvandare, v_lat.genre);
    exception when others then
      raise warning 'Badgeutdelningen i låtspelet misslyckades: %', sqlerrm;
      v_nya := '[]'::jsonb;
    end;

    -- Poäng till rangen bara i fritt spel och bara för rätt låt. Får aldrig
    -- stoppa svaret, därför eget exception-block.
    if p_ratt and p_o.lage = 'fritt' then
      begin
        v_rang := quiz.ge_spelpoang(p_o.anvandare, p_o.id, 'fritt', latbibliotek.fritt_rang(p_o.niva));
        v_nya := v_nya || coalesce(quiz.legend_badge(p_o.anvandare), '[]'::jsonb);
      exception when others then
        raise warning 'Poäng till rangen i fritt spel misslyckades: %', sqlerrm;
        v_rang := '{}'::jsonb;
      end;
    end if;

    select jsonb_build_object(
      'genre', v_lat.genre,
      'ratt_genre', coalesce((select ratt from latbibliotek.statistik where anvandare = p_o.anvandare and genre = v_lat.genre), 0),
      'rundor_idag', coalesce((select rundor from latbibliotek.dagar where anvandare = p_o.anvandare and datum = quiz.idag()), 0)
    ) into v_konto;
  end if;

  return jsonb_build_object(
    'klar', true,
    'ratt', p_ratt,
    'poang', v_poang,
    'lat', jsonb_build_object('id', v_lat.id, 'artist', v_lat.artist, 'titel', v_lat.titel, 'apple', v_lat.apple_lank, 'genre', v_lat.genre, 'ljud', v_lat.ljud),
    'konto', v_konto,
    'nya_badges', v_nya
  ) || v_rang;
end
$$;

create or replace function public.dag_svara(p_omgang uuid, p_plats integer) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.dag_omgang(p_omgang);
  v_tid numeric;
  v_steg integer;
  v_ratt boolean;
  v_poang integer;
  v_nya jsonb := '[]'::jsonb;
  v_ut jsonb;
  v_rang jsonb := '{}'::jsonb;
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then return jsonb_build_object('fel', 'inte_startad'); end if;
  if p_plats is null or p_plats < 0 or p_plats >= cardinality(v_o.alternativ) then
    return jsonb_build_object('fel', 'ogiltigt_svar');
  end if;

  v_tid := extract(epoch from now() - v_o.steg_tid);
  v_steg := v_o.steg;
  while v_steg < 4 and v_tid > latbibliotek.dag_klipp(v_steg) + latbibliotek.svarstid() loop
    v_steg := v_steg + 1;
  end loop;

  v_ratt := v_o.alternativ[p_plats + 1] = v_o.lat_id;
  v_poang := case when v_ratt then latbibliotek.dag_poang(v_steg) else 0 end;

  update latbibliotek.omgangar set
    klar = true, ratt = v_ratt, poang = v_poang, avslutad = now(),
    forsok = jsonb_build_array(jsonb_build_object('plats', p_plats, 'steg', v_o.steg, 'raknat', v_steg, 'sekunder', round(v_tid, 1)))
  where id = v_o.id
  returning * into v_o;

  update latbibliotek.latar set spelade = spelade + 1, ratt = ratt + v_ratt::integer where id = v_o.lat_id;

  if v_o.anvandare is not null then
    -- Badges får aldrig stoppa ett svar.
    begin
      if v_ratt and v_steg = 0 and profil.ge(v_o.anvandare, 'halv', now(), true) then
        v_nya := v_nya || jsonb_build_array(jsonb_build_object('id', 'halv', 'forst', profil.forst('halv')));
      end if;
      if (latbibliotek.dag_konto(v_o.anvandare)->>'forsta_klippet')::integer >= 10
         and profil.ge(v_o.anvandare, 'tio', now(), true) then
        v_nya := v_nya || jsonb_build_array(jsonb_build_object('id', 'tio', 'forst', profil.forst('tio')));
      end if;
    exception when others then
      raise warning 'Badgeutdelningen i dagens låt misslyckades: %', sqlerrm;
      v_nya := '[]'::jsonb;
    end;

    -- Poäng till rangen får inte heller stoppa ett svar.
    if v_ratt then
      begin
        v_rang := quiz.ge_spelpoang(v_o.anvandare, v_o.id, 'lat', latbibliotek.dag_rang(v_steg));
        v_nya := v_nya || coalesce(quiz.legend_badge(v_o.anvandare), '[]'::jsonb);
      exception when others then
        raise warning 'Poäng till rangen i dagens låt misslyckades: %', sqlerrm;
        v_rang := '{}'::jsonb;
      end;
    end if;
  end if;

  v_ut := latbibliotek.dag_facit(v_o) || jsonb_build_object('nya_badges', v_nya) || v_rang;
  if v_o.anvandare is not null then
    v_ut := v_ut || jsonb_build_object('konto', latbibliotek.dag_konto(v_o.anvandare));
  end if;
  return v_ut;
end
$$;

-- Facit i Dagens låt, nu också med poängen till rangen. Den som laddar om
-- sidan efter att ha svarat ser alltså samma sak som direkt efter svaret.
create or replace function latbibliotek.dag_facit(p_o latbibliotek.omgangar) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ratt', p_o.ratt,
    'ratt_plats', array_position(p_o.alternativ, p_o.lat_id) - 1,
    'valde', (p_o.forsok->0->>'plats')::integer,
    'poang', p_o.poang,
    'rang_plus', (select trim_scale(s.poang) from quiz.spelpoang s where s.omgang = p_o.id),
    'sekunder', latbibliotek.dag_klipp(coalesce((p_o.forsok->0->>'raknat')::integer, p_o.steg)),
    'lat', jsonb_build_object('artist', l.artist, 'titel', l.titel, 'apple', l.apple_lank, 'ljud', l.ljud)
  )
  from latbibliotek.latar l where l.id = p_o.lat_id
$$;

/* ---------- topplistan ---------- */

-- Topplistan för alla spel eller ett (fraga, lat, fritt). Totalt och
-- innevarande månad, topp 50, med bild och badge vid namnet. Rangen räknas
-- alltid på poängen från alla spel, oavsett vilket spel listan visar.
create function profil.topplista_spel(p_uid uuid, p_spel text) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_manad date := date_trunc('month', quiz.idag())::date;
  v_resultat jsonb := '{}'::jsonb;
  v_period text;
begin
  foreach v_period in array array['total', 'manad'] loop
    v_resultat := v_resultat || jsonb_build_object(v_period, (
      with poang as (
        select a.anvandare, sum(a.poang) as summa
        from quiz.alla_poang a
        where (p_spel = 'alla' or a.spel = p_spel)
          and (v_period = 'total' or a.datum >= v_manad)
        group by a.anvandare
      ),
      rankad as (
        select p.anvandare, pr.visningsnamn, p.summa,
          rank() over (order by p.summa desc) as plats,
          row_number() over (order by p.summa desc, lower(pr.visningsnamn)) as nr
        from poang p
        join public.profiler pr on pr.id = p.anvandare
        where p.summa > 0
      )
      select jsonb_build_object(
        'lista', coalesce((
          select jsonb_agg(jsonb_build_object(
            'plats', r.plats, 'namn', r.visningsnamn, 'poang', trim_scale(round(r.summa, 1)),
            'rang', quiz.rang(quiz.total(r.anvandare)),
            'bild', profil.synlig_bild(r.anvandare), 'badge', profil.vid_namnet(r.anvandare)
          ) order by r.nr)
          from rankad r where r.nr <= 50
        ), '[]'::jsonb),
        'jag', (
          select jsonb_build_object(
            'plats', r.plats, 'namn', r.visningsnamn, 'poang', trim_scale(round(r.summa, 1)),
            'rang', quiz.rang(quiz.total(r.anvandare)), 'listad', r.nr <= 50,
            'bild', profil.synlig_bild(r.anvandare), 'badge', profil.vid_namnet(r.anvandare)
          )
          from rankad r where r.anvandare = p_uid
        )
      )
    ));
  end loop;
  return v_resultat || jsonb_build_object('manad_datum', v_manad);
end
$$;

-- quiz_topplista använder den här. Faller den, faller quiz_topplista tillbaka
-- på sin gamla fråga, som förut.
create or replace function profil.topplista(p_uid uuid) returns jsonb
language sql stable
set search_path = ''
as $$ select profil.topplista_spel(p_uid, 'alla') $$;

-- Den egna sidan /topplista/. p_spel: alla, fraga, lat eller fritt.
create function public.topplista(p_spel text default 'alla') returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_spel is null or p_spel not in ('alla', 'fraga', 'lat', 'fritt') then
    return jsonb_build_object('fel', 'ogiltigt_spel');
  end if;
  return profil.topplista_spel(auth.uid(), p_spel);
end
$$;

/* ---------- det som redan spelats ---------- */

-- Dagens låt: poäng efter klippet svaret räknades på.
insert into quiz.spelpoang (omgang, anvandare, spel, datum, poang)
select o.id, o.anvandare, 'lat',
  (coalesce(o.avslutad, o.skapad) at time zone 'Europe/Stockholm')::date,
  latbibliotek.dag_rang(coalesce((o.forsok->0->>'raknat')::integer, 4))
from latbibliotek.omgangar o
where o.lage = 'dag' and o.klar and o.ratt and o.anvandare is not null
on conflict (omgang) do nothing;

-- Fritt spel: poäng efter svårighet, med taket per dygn i den ordning
-- låtarna klarades. Allt efter taket är noll, så ett tak räknat på det som
-- skulle ha getts blir detsamma som ett räknat på det som getts.
insert into quiz.spelpoang (omgang, anvandare, spel, datum, poang)
select id, anvandare, 'fritt', dag, ge
from (
  select id, anvandare, dag,
    least(grund, greatest(0, quiz.fritt_tak() - coalesce(sum(grund) over (
      partition by anvandare, dag order by tid, id
      rows between unbounded preceding and 1 preceding
    ), 0))) as ge
  from (
    select o.id, o.anvandare, coalesce(o.avslutad, o.skapad) as tid,
      (coalesce(o.avslutad, o.skapad) at time zone 'Europe/Stockholm')::date as dag,
      latbibliotek.fritt_rang(o.niva) as grund
    from latbibliotek.omgangar o
    where o.lage = 'fritt' and o.klar and o.ratt and o.anvandare is not null and o.niva is not null
  ) a
) b
where ge > 0
on conflict (omgang) do nothing;

/* ---------- rättigheter ---------- */

revoke all on all functions in schema quiz from public, anon, authenticated;
revoke all on all functions in schema profil from public, anon, authenticated;
revoke all on all functions in schema latbibliotek from public, anon, authenticated;
revoke all on function public.topplista(text) from public, anon, authenticated;
grant execute on function public.topplista(text) to anon, authenticated;
