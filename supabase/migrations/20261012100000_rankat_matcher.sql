-- Rankat blir ett val inne i fritt spel, med motståndare.
--
-- Den första versionen (20261007230000_rankat.sql) räknade rating mot
-- låtarna och gissade med sökrutan. Nu möter man en annan spelare:
--
-- Matchen: tio låtar i vald genre, på Svår under 1 300 i rating och på Expert
-- från 1 300. Varje låt är flerval som Dagens låt, med fyra alternativ och
-- klipp på 0,5, 1, 3, 7 och 15 sekunder. Ett svar per låt. Rätt ger 100, 70,
-- 40, 20 eller 10 efter klippet, fel eller att tiden går ut ger 0. Varje klipp
-- har klippets längd plus tolv sekunder på sig, mätt på servern från att
-- ljudet lämnades ut. Sökrutan används inte, så den kan inte kolla låtar.
--
-- Motståndaren, asynkront: servern letar upp en annan spelares färdiga match
-- i samma genre, spelad med en rating nära ens egen (±100, sedan ±200, ±300
-- och ±400), och ger samma tio låtar med samma alternativ. Poängen jämförs
-- när man är klar. Finns ingen spelas matchen mot en skuggmotståndare på
-- ungefär samma rating, vars poäng räknas fram när matchen startar. Ingen
-- behöver vänta, och den som spelade först påverkas aldrig.
--
-- Rating: 1 000 från början, per genre och totalt. Elo med K 32, och K 48 de
-- fem första matcherna. Aldrig under 0. Ger man upp, eller startar en ny match
-- mitt i en annan, räknas den som förlust och ger inga poäng till rangen.
--
-- Poäng till rangen: vinst 8, oavgjort 4, förlust 2, högst 20 per dygn.
--
-- Bara nytt läggs till och funktioner ersätts. Tabellerna från första
-- versionen byggs på.

/* ---------- tabeller ---------- */

alter table latbibliotek.matcher
  add column niva text not null default 'svar' check (niva in ('svar', 'expert')),
  -- Fyra alternativ per låt, i den ordning alla som spelar låtarna ser dem.
  add column alternativ jsonb,
  -- Matchen vars låtar används. Samma för alla som spelar samma tio låtar, så
  -- att ingen får samma låtar två gånger.
  add column rot uuid,
  add column latpoang integer[],
  add column mot_typ text check (mot_typ in ('spelare', 'skugga')),
  add column mot_match uuid references latbibliotek.matcher (id) on delete set null,
  add column mot_anvandare uuid references auth.users (id) on delete set null,
  add column mot_rating numeric,
  add column mot_alla numeric,
  add column mot_poang integer,
  add column mot_latpoang integer[],
  add column resultat text check (resultat in ('vinst', 'forlust', 'oavgjort')),
  -- Uppgiven eller övergiven. Används aldrig som motståndare.
  add column avbruten boolean not null default false,
  add column alla_fore numeric,
  add column alla_efter numeric,
  add column rang_plus numeric;

-- Matcher från första versionen gick aldrig att spela från sajten. De räknas
-- som avbrutna, och deras låtar stängs.
update latbibliotek.omgangar set klar = true, ratt = false, poang = 0, avslutad = now()
where lage = 'rankat' and not klar;
update latbibliotek.matcher set klar = true, avbruten = true, avslutad = coalesce(avslutad, now())
where alternativ is null;

create index matcher_mall on latbibliotek.matcher (genre, rating_fore)
  where klar and not avbruten and alternativ is not null;
create index matcher_rot on latbibliotek.matcher (anvandare, rot);

-- Totalen ligger som genren alla.
alter table latbibliotek.rating drop constraint rating_genre_check;
alter table latbibliotek.rating add constraint rating_genre_check
  check (genre in ('alla', 'hardstyle', 'raw', 'uptempo', 'hardcore', 'techno'));
alter table latbibliotek.rating
  add column vinster integer not null default 0,
  add column forluster integer not null default 0,
  add column oavgjorda integer not null default 0,
  add column svit integer not null default 0,
  add column basta_svit integer not null default 0;
-- Den gamla ratingen räknades mot låtarna och betyder inget här.
update latbibliotek.rating set rating = 1000, matcher = 0, andrad = now();

create index rating_alla on latbibliotek.rating (genre, rating desc) where matcher >= 5;

-- Poäng till rangen från rankat. En rad per match.
alter table quiz.spelpoang drop constraint spelpoang_spel_check;
alter table quiz.spelpoang add constraint spelpoang_spel_check
  check (spel in ('lat', 'fritt', 'rankat'));

-- Duellanten och Obesegrad delas ut från rankat. Skrivet som insert, som i
-- Dagens låt, så att kontrollskriptet ser ändringen.
insert into profil.katalog (id, niva, hemlig, kommer) values
  ('duell', 2, false, false),
  ('obesegrad', 4, false, false)
on conflict (id) do update set kommer = excluded.kommer;

/* ---------- poäng till rangen ---------- */

create function quiz.rankat_tak() returns numeric
language sql immutable
set search_path = ''
as $$ select 20::numeric $$;

-- Som förut, med taket för rankat bredvid taket för fritt spel.
create or replace function quiz.ge_spelpoang(p_anvandare uuid, p_omgang uuid, p_spel text, p_plus numeric)
returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_idag date := quiz.idag();
  v_ge numeric;
  v_tak numeric;
begin
  -- Två omgångar som slutar samtidigt får inte båda se samma kvarvarande tak.
  perform pg_advisory_xact_lock(hashtext('spelpoang:' || p_anvandare::text));

  select poang into v_ge from quiz.spelpoang where omgang = p_omgang;
  if found then
    return jsonb_build_object('rang_plus', trim_scale(v_ge), 'rang_tak', v_ge < p_plus);
  end if;

  v_ge := p_plus;
  v_tak := case p_spel when 'fritt' then quiz.fritt_tak() when 'rankat' then quiz.rankat_tak() end;
  if v_tak is not null then
    v_ge := least(p_plus, greatest(0, v_tak - coalesce((
      select sum(poang) from quiz.spelpoang
      where anvandare = p_anvandare and spel = p_spel and datum = v_idag
    ), 0)));
  end if;

  if v_ge > 0 then
    insert into quiz.spelpoang (omgang, anvandare, spel, datum, poang)
    values (p_omgang, p_anvandare, p_spel, v_idag, v_ge);
  end if;
  return jsonb_build_object('rang_plus', trim_scale(v_ge), 'rang_tak', v_ge < p_plus);
end
$$;

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

-- Tid att svara efter klippet, plus att ljudet ska laddas.
create function latbibliotek.rankat_svarstid() returns integer
language sql immutable
set search_path = ''
as $$ select 12 $$;

-- Titeln efter rating. Samma gränser och namn som i fritt-spel/index.html,
-- topplista/index.html och profilvy.js, där färgerna ligger.
create function latbibliotek.rankat_titel(p_rating numeric) returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object('niva', niva, 'titel', titel)
  from (values
    (1, 'Intro', -1000000), (2, 'Kick', 900), (3, 'Build-up', 1100), (4, 'Reverse bass', 1300),
    (5, 'Screech', 1500), (6, 'Distortion', 1700), (7, 'Drop', 1900), (8, 'Endshow', 2100)
  ) as t(niva, titel, grans)
  where grans <= coalesce(p_rating, 1000)
  order by grans desc
  limit 1
$$;

create function latbibliotek.rankat_k(p_matcher integer) returns integer
language sql immutable
set search_path = ''
as $$ select case when coalesce(p_matcher, 0) < 5 then 48 else 32 end $$;

-- En rating som sajten får se. Placering så länge kontot har färre än fem
-- matcher i genren.
create function latbibliotek.rankat_rating_json(p_anvandare uuid, p_genre text) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'rating', round(coalesce(r.rating, 1000)),
    'matcher', coalesce(r.matcher, 0),
    'vinster', coalesce(r.vinster, 0),
    'forluster', coalesce(r.forluster, 0),
    'oavgjorda', coalesce(r.oavgjorda, 0),
    'svit', coalesce(r.svit, 0),
    'basta_svit', coalesce(r.basta_svit, 0),
    'placering', coalesce(r.matcher, 0) < 5,
    'kvar_placering', greatest(0, 5 - coalesce(r.matcher, 0))
  ) || latbibliotek.rankat_titel(coalesce(r.rating, 1000))
  from (select 1) x
  left join latbibliotek.rating r on r.anvandare = p_anvandare and r.genre = p_genre
$$;

-- Titeln vid namnet i topplistan: totalratingen, efter fem matcher.
create function latbibliotek.rankat_namn(p_anvandare uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object('rating', round(r.rating)) || latbibliotek.rankat_titel(r.rating)
  from latbibliotek.rating r
  where r.anvandare = p_anvandare and r.genre = 'alla' and r.matcher >= 5
$$;

-- Tre fel alternativ och det rätta, blandade. Som i Dagens låt.
create function latbibliotek.rankat_alternativ(p_lat bigint) returns bigint[]
language plpgsql volatile
set search_path = ''
as $$
declare
  v_lat latbibliotek.latar;
  v_fel bigint[];
begin
  select * into v_lat from latbibliotek.latar where id = p_lat;
  select array_agg(id) into v_fel from (
    select id from (
      select distinct on (c.artist_namn) c.id
      from latbibliotek.latar c
      where c.aktiv and c.trasig is null and c.genre = v_lat.genre
        and c.artist_namn <> v_lat.artist_namn
        and position(lower(c.artist_namn) in lower(v_lat.artist)) = 0
        and position(lower(v_lat.artist_namn) in lower(c.artist)) = 0
        and latbibliotek.grundtitel(c.titel) <> latbibliotek.grundtitel(v_lat.titel)
      order by c.artist_namn, random()
    ) x
    order by random() limit 3
  ) y;
  if coalesce(cardinality(v_fel), 0) < 3 then return null; end if;
  return (select array_agg(i order by random()) from unnest(v_fel || v_lat.id) i);
end
$$;

-- Tio låtar till en ny match. Låtar kontot redan haft i rankat väljs sist.
create function latbibliotek.rankat_latar(p_anvandare uuid, p_genre text, p_niva text) returns bigint[]
language sql volatile
set search_path = ''
as $$
  select array_agg(id) from (
    select l.id from latbibliotek.latar l
    join latbibliotek.popularitet() p on p.lat_id = l.id
    where l.genre = p_genre and p.plats <= latbibliotek.niva_andel(p_niva)
    order by exists (
      select 1 from latbibliotek.matcher m
      where m.anvandare = p_anvandare and l.id = any(m.latar)
    ), random()
    limit 10
  ) x
$$;

-- Skuggmotståndarens poäng. För varje låt: chansen att klara den följer
-- skillnaden mellan skuggans rating och låtens (Elo, 400), och hur tidigt
-- den klaras följer skuggans rating mot 1 000. På 1 000 mot en låt på 1 000
-- klaras hälften av låtarna, på något av de tre första klippen.
create function latbibliotek.rankat_skugga(p_latar bigint[], p_rating numeric) returns integer[]
language sql volatile
set search_path = ''
as $$
  select array_agg(
    case when random() < 1 / (1 + power(10, (coalesce(l.rating, 1000) - p_rating) / 400.0))
      then latbibliotek.dag_poang(least(4, floor(
        (1 - 1 / (1 + power(10, (1000 - p_rating) / 400.0))) * 5 * random())::integer))
      else 0
    end order by x.n)
  from unnest(p_latar) with ordinality as x(id, n)
  join latbibliotek.latar l on l.id = x.id
$$;

-- Motståndaren som sajten får se: namn, rating och titel. Aldrig poängen
-- förrän matchen är klar.
create function latbibliotek.rankat_mot(p_m latbibliotek.matcher) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'skugga', p_m.mot_typ = 'skugga',
    'namn', case when p_m.mot_typ = 'skugga' then null
                 else coalesce((select visningsnamn from public.profiler where id = p_m.mot_anvandare), 'En tidigare spelare') end,
    'rating', round(p_m.mot_rating)
  ) || latbibliotek.rankat_titel(p_m.mot_rating)
$$;

-- Läget i en match.
create or replace function latbibliotek.rankat_lage(p_match uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'match', m.id,
    'genre', m.genre,
    'niva', m.niva,
    'klar', m.klar,
    'antal', cardinality(m.latar),
    'spelade', (select count(*) from latbibliotek.omgangar o where o.match_id = m.id and o.klar),
    'nummer', least(cardinality(m.latar),
      (select count(*) from latbibliotek.omgangar o where o.match_id = m.id and o.klar) + 1),
    'poang', coalesce((select sum(poang) from latbibliotek.omgangar o where o.match_id = m.id and o.klar), 0),
    'klipp', jsonb_build_array(0.5, 1, 3, 7, 15),
    'poang_klipp', jsonb_build_array(100, 70, 40, 20, 10),
    'svarstid', latbibliotek.rankat_svarstid(),
    'mot', latbibliotek.rankat_mot(m),
    'jag', latbibliotek.rankat_rating_json(m.anvandare, m.genre)
  )
  from latbibliotek.matcher m where m.id = p_match
$$;

-- Resultatet av en klar match. Låtarna visas bara för de låtar man faktiskt
-- hörde, så att en uppgiven match inte avslöjar resten.
create function latbibliotek.rankat_resultat(p_match uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'klar', true,
    'resultat', m.resultat,
    'avbruten', m.avbruten,
    'poang', m.poang,
    'mot_poang', m.mot_poang,
    'mot', latbibliotek.rankat_mot(m),
    'rating_fore', round(m.rating_fore),
    'rating_efter', round(m.rating_efter),
    'andring', round(m.rating_efter) - round(m.rating_fore),
    'alla_fore', round(m.alla_fore),
    'alla_efter', round(m.alla_efter),
    'titel_fore', latbibliotek.rankat_titel(m.rating_fore),
    'titel_efter', latbibliotek.rankat_titel(m.rating_efter),
    'rang_plus', coalesce(trim_scale(m.rang_plus), 0),
    'jag', latbibliotek.rankat_rating_json(m.anvandare, m.genre),
    'latar', (
      select jsonb_agg(jsonb_build_object(
        'nummer', x.n,
        'poang', coalesce(m.latpoang[x.n], 0),
        'mot_poang', coalesce(m.mot_latpoang[x.n], 0),
        'hord', o.steg_tid is not null,
        'artist', case when o.steg_tid is not null then l.artist end,
        'titel', case when o.steg_tid is not null then l.titel end
      ) order by x.n)
      from unnest(m.latar) with ordinality as x(id, n)
      join latbibliotek.latar l on l.id = x.id
      left join latbibliotek.omgangar o on o.match_id = m.id and o.lat_id = x.id
    )
  )
  from latbibliotek.matcher m where m.id = p_match and m.klar
$$;

-- Räknar ihop en match och flyttar ratingen. p_gav_upp: uppgiven, eller
-- lämnad för en ny match. Då är det förlust, oavsett poängen, och inga poäng
-- till rangen. Bara den som spelar nu får ändrad rating.
drop function latbibliotek.rankat_avsluta(uuid);
create function latbibliotek.rankat_avsluta(p_match uuid, p_gav_upp boolean) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_m latbibliotek.matcher;
  v_lat integer[];
  v_summa integer;
  v_avbruten boolean;
  v_resultat text;
  v_s numeric;
  v_g latbibliotek.rating;
  v_a latbibliotek.rating;
  v_ny_g numeric;
  v_ny_a numeric;
  v_rad record;
  v_bas numeric;
  v_rang jsonb := jsonb_build_object('rang_plus', 0, 'rang_tak', false);
  v_nya jsonb := '[]'::jsonb;
begin
  select * into v_m from latbibliotek.matcher where id = p_match for update;
  if v_m.id is null or v_m.klar then return null; end if;

  -- Låtar som inte blev klara stängs med noll.
  update latbibliotek.omgangar set klar = true, ratt = false, poang = 0, avslutad = now(),
    forsok = forsok || jsonb_build_array(jsonb_build_object('t', 'avbruten'))
  where match_id = v_m.id and not klar;

  select array_agg(coalesce(o.poang, 0) order by x.n) into v_lat
  from unnest(v_m.latar) with ordinality as x(id, n)
  left join latbibliotek.omgangar o on o.match_id = v_m.id and o.lat_id = x.id;
  v_summa := (select coalesce(sum(p), 0) from unnest(v_lat) p);

  v_avbruten := p_gav_upp or (select count(*) from latbibliotek.omgangar where match_id = v_m.id) < cardinality(v_m.latar);
  v_resultat := case
    when v_avbruten then 'forlust'
    when v_summa > v_m.mot_poang then 'vinst'
    when v_summa = v_m.mot_poang then 'oavgjort'
    else 'forlust' end;
  v_s := case v_resultat when 'vinst' then 1 when 'oavgjort' then 0.5 else 0 end;

  insert into latbibliotek.rating (anvandare, genre) values (v_m.anvandare, v_m.genre), (v_m.anvandare, 'alla')
  on conflict do nothing;
  select * into v_g from latbibliotek.rating where anvandare = v_m.anvandare and genre = v_m.genre for update;
  select * into v_a from latbibliotek.rating where anvandare = v_m.anvandare and genre = 'alla' for update;

  v_ny_g := greatest(0, round(v_g.rating + latbibliotek.rankat_k(v_g.matcher) *
    (v_s - 1 / (1 + power(10, (v_m.mot_rating - v_g.rating) / 400.0)))));
  v_ny_a := greatest(0, round(v_a.rating + latbibliotek.rankat_k(v_a.matcher) *
    (v_s - 1 / (1 + power(10, (coalesce(v_m.mot_alla, v_m.mot_rating) - v_a.rating) / 400.0)))));

  update latbibliotek.rating set
    rating = case when genre = 'alla' then v_ny_a else v_ny_g end,
    matcher = matcher + 1,
    vinster = vinster + (v_resultat = 'vinst')::integer,
    forluster = forluster + (v_resultat = 'forlust')::integer,
    oavgjorda = oavgjorda + (v_resultat = 'oavgjort')::integer,
    svit = case when v_resultat = 'vinst' then svit + 1 else 0 end,
    basta_svit = greatest(basta_svit, case when v_resultat = 'vinst' then svit + 1 else 0 end),
    andrad = now()
  where anvandare = v_m.anvandare and genre in (v_m.genre, 'alla');

  -- Låtarna lär sig hur svåra de är, så att skuggmotståndaren blir rimligare
  -- med tiden. Bara låtar som spelades klart i en match som inte avbröts.
  if not v_avbruten then
    for v_rad in
      select l.id, l.rating, coalesce(o.poang, 0) as poang
      from unnest(v_m.latar) as x(id)
      join latbibliotek.latar l on l.id = x.id
      join latbibliotek.omgangar o on o.match_id = v_m.id and o.lat_id = l.id
    loop
      update latbibliotek.latar set rating = rating + 4 *
        (1 / (1 + power(10, (v_rad.rating - v_g.rating) / 400.0)) - v_rad.poang / 100.0)
      where id = v_rad.id;
    end loop;
  end if;

  -- Poäng till rangen. Uppgivna matcher ger inget, annars kunde man starta
  -- och ge upp för att samla förlustpoäng.
  v_bas := case when v_avbruten then 0 else case v_resultat when 'vinst' then 8 when 'oavgjort' then 4 else 2 end end;
  if v_bas > 0 then
    begin
      v_rang := quiz.ge_spelpoang(v_m.anvandare, v_m.id, 'rankat', v_bas);
    exception when others then
      raise warning 'Poängen till rangen i rankat misslyckades: %', sqlerrm;
    end;
  end if;

  update latbibliotek.matcher set
    klar = true, avbruten = v_avbruten, resultat = v_resultat,
    poang = v_summa, latpoang = v_lat,
    rating_fore = v_g.rating, rating_efter = v_ny_g,
    alla_fore = v_a.rating, alla_efter = v_ny_a,
    rang_plus = coalesce((v_rang->>'rang_plus')::numeric, 0),
    avslutad = now()
  where id = v_m.id;

  -- Badges får aldrig stoppa en match.
  begin
    if v_resultat = 'vinst' then
      if profil.ge(v_m.anvandare, 'duell', now(), true) then
        v_nya := v_nya || jsonb_build_array(jsonb_build_object('id', 'duell', 'forst', profil.forst('duell')));
      end if;
      if v_a.svit + 1 >= 10 and profil.ge(v_m.anvandare, 'obesegrad', now(), true) then
        v_nya := v_nya || jsonb_build_array(jsonb_build_object('id', 'obesegrad', 'forst', profil.forst('obesegrad')));
      end if;
    end if;
    if v_bas > 0 then v_nya := v_nya || quiz.legend_badge(v_m.anvandare); end if;
  exception when others then
    raise warning 'Badgeutdelningen i rankat misslyckades: %', sqlerrm;
    v_nya := '[]'::jsonb;
  end;

  return latbibliotek.rankat_resultat(v_m.id) || jsonb_build_object(
    'rang_tak', coalesce((v_rang->>'rang_tak')::boolean, false),
    'nya_badges', v_nya
  );
end
$$;

-- En pågående låt i en pågående match, som tillhör den som frågar. Låses, så
-- att två svar samtidigt inte båda rättas.
create function latbibliotek.rankat_omgang(p_omgang uuid) returns latbibliotek.omgangar
language plpgsql volatile
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar;
begin
  select o.* into v_o from latbibliotek.omgangar o
  join latbibliotek.matcher m on m.id = o.match_id
  where o.id = p_omgang and o.lage = 'rankat' and o.anvandare = auth.uid() and not m.klar
  for update of o;
  return v_o;
end
$$;

create function latbibliotek.rankat_frist(p_o latbibliotek.omgangar) returns timestamptz
language sql immutable
set search_path = ''
as $$
  select p_o.steg_tid + make_interval(secs => latbibliotek.dag_klipp(p_o.steg) + latbibliotek.rankat_svarstid())
$$;

create function latbibliotek.rankat_kvar(p_o latbibliotek.omgangar) returns numeric
language sql stable
set search_path = ''
as $$ select greatest(0, round(extract(epoch from latbibliotek.rankat_frist(p_o) - now())::numeric, 1)) $$;

-- Facit för en låt, när den är klar.
create function latbibliotek.rankat_facit(p_o latbibliotek.omgangar) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'klar', true,
    'ratt', coalesce(p_o.ratt, false),
    'tid_ute', coalesce(p_o.forsok->0->>'t', '') = 'tid',
    'poang', coalesce(p_o.poang, 0),
    'ratt_plats', array_position(p_o.alternativ, p_o.lat_id) - 1,
    'valde', (p_o.forsok->0->>'plats')::integer,
    'sekunder', latbibliotek.dag_klipp(p_o.steg),
    'lat', jsonb_build_object('artist', l.artist, 'titel', l.titel, 'apple', l.apple_lank),
    'poang_match', (select coalesce(sum(poang), 0) from latbibliotek.omgangar where match_id = p_o.match_id and klar),
    'spelade', (select count(*) from latbibliotek.omgangar where match_id = p_o.match_id and klar),
    'sista', (select count(*) from latbibliotek.omgangar where match_id = p_o.match_id and klar)
             >= (select cardinality(latar) from latbibliotek.matcher where id = p_o.match_id)
  )
  from latbibliotek.latar l where l.id = p_o.lat_id
$$;

-- Tiden gick ut: låten stängs med noll.
create function latbibliotek.rankat_tid_ute(p_o latbibliotek.omgangar) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar;
begin
  update latbibliotek.omgangar set klar = true, ratt = false, poang = 0, avslutad = now(),
    forsok = jsonb_build_array(jsonb_build_object('t', 'tid', 'steg', p_o.steg))
  where id = p_o.id
  returning * into v_o;
  update latbibliotek.latar set spelade = spelade + 1 where id = v_o.lat_id;
  return latbibliotek.rankat_facit(v_o);
end
$$;

-- Alternativen visas först när klockan går, så att ingen kan läsa dem i lugn
-- och ro innan låten startar.
create function latbibliotek.rankat_alt_json(p_o latbibliotek.omgangar) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object('artist', l.artist, 'titel', l.titel) order by a.n)
  from unnest(p_o.alternativ) with ordinality as a(id, n)
  join latbibliotek.latar l on l.id = a.id
$$;

/* ---------- det sajten får anropa ---------- */

-- Startar en match. Bara inloggade med visningsnamn. En påbörjad match
-- räknas som uppgiven.
create or replace function public.rankat_starta(p_genre text) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_oppen uuid;
  v_r numeric;
  v_ra numeric;
  v_mall latbibliotek.matcher;
  v_bredd integer;
  v_niva text;
  v_latar bigint[];
  v_alt jsonb;
  v_mot_rating numeric;
  v_mot_alla numeric;
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('fel', 'inte_inloggad'); end if;
  if not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'visningsnamn_saknas');
  end if;
  if p_genre is null or p_genre not in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno') then
    return jsonb_build_object('fel', 'ogiltig_genre');
  end if;

  -- Två starter samtidigt från samma konto ska inte ge två matcher.
  perform pg_advisory_xact_lock(hashtext('rankat:' || v_uid::text));

  for v_oppen in select id from latbibliotek.matcher where anvandare = v_uid and not klar loop
    perform latbibliotek.rankat_avsluta(v_oppen, true);
  end loop;

  insert into latbibliotek.rating (anvandare, genre) values (v_uid, p_genre), (v_uid, 'alla')
  on conflict do nothing;
  select rating into v_r from latbibliotek.rating where anvandare = v_uid and genre = p_genre;
  select rating into v_ra from latbibliotek.rating where anvandare = v_uid and genre = 'alla';

  -- En annan spelares färdiga match, så nära i rating som möjligt. Aldrig
  -- låtar kontot redan haft i en match, och aldrig låtar som tagits bort.
  foreach v_bredd in array array[100, 200, 300, 400] loop
    select m.* into v_mall from latbibliotek.matcher m
    where m.genre = p_genre and m.klar and not m.avbruten and m.alternativ is not null
      and m.anvandare <> v_uid
      and abs(m.rating_fore - v_r) <= v_bredd
      and not exists (
        select 1 from latbibliotek.matcher x
        where x.anvandare = v_uid and x.rot = coalesce(m.rot, m.id)
      )
      and not exists (
        select 1 from unnest(m.latar) as u(id)
        join latbibliotek.latar l on l.id = u.id
        where not l.aktiv or l.trasig is not null
      )
    order by abs(m.rating_fore - v_r), random()
    limit 1;
    exit when v_mall.id is not null;
  end loop;

  if v_mall.id is not null then
    insert into latbibliotek.matcher (anvandare, genre, latar, niva, alternativ, rot,
      mot_typ, mot_match, mot_anvandare, mot_rating, mot_alla, mot_poang, mot_latpoang)
    values (v_uid, p_genre, v_mall.latar, v_mall.niva, v_mall.alternativ, coalesce(v_mall.rot, v_mall.id),
      'spelare', v_mall.id, v_mall.anvandare, v_mall.rating_fore, v_mall.alla_fore, v_mall.poang, v_mall.latpoang)
    returning id into v_id;
    return latbibliotek.rankat_lage(v_id);
  end if;

  -- Ingen i närheten: en skuggmotståndare på ungefär samma rating.
  v_niva := case when v_r >= 1300 then 'expert' else 'svar' end;
  v_latar := latbibliotek.rankat_latar(v_uid, p_genre, v_niva);
  if coalesce(cardinality(v_latar), 0) < 10 then
    return jsonb_build_object('fel', 'inga_latar');
  end if;
  select jsonb_agg(to_jsonb(latbibliotek.rankat_alternativ(id)) order by n) into v_alt
  from unnest(v_latar) with ordinality as x(id, n);
  if exists (select 1 from jsonb_array_elements(v_alt) as a(v) where a.v = 'null'::jsonb) then
    return jsonb_build_object('fel', 'inga_latar');
  end if;

  v_mot_rating := greatest(0, round(v_r + random() * 100 - 50));
  v_mot_alla := greatest(0, round(v_ra + random() * 100 - 50));

  insert into latbibliotek.matcher (anvandare, genre, latar, niva, alternativ,
    mot_typ, mot_rating, mot_alla, mot_latpoang)
  values (v_uid, p_genre, v_latar, v_niva, v_alt,
    'skugga', v_mot_rating, v_mot_alla, latbibliotek.rankat_skugga(v_latar, v_mot_rating))
  returning id into v_id;
  update latbibliotek.matcher set rot = v_id,
    mot_poang = (select coalesce(sum(p), 0) from unnest(mot_latpoang) p)
  where id = v_id;
  return latbibliotek.rankat_lage(v_id);
end
$$;

-- Nästa låt i matchen. En låt som redan pågår fortsätter, så att omladdning
-- inte ger en ny chans. När alla tio är spelade räknas matchen ihop.
create or replace function public.rankat_nasta(p_match uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m latbibliotek.matcher;
  v_o latbibliotek.omgangar;
  v_lat bigint;
  v_n integer;
begin
  select * into v_m from latbibliotek.matcher where id = p_match and anvandare = v_uid for update;
  if v_m.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_m.klar then return latbibliotek.rankat_lage(v_m.id) || latbibliotek.rankat_resultat(v_m.id); end if;

  select * into v_o from latbibliotek.omgangar where match_id = v_m.id and not klar limit 1 for update;
  if v_o.id is not null then
    if v_o.steg_tid is not null and now() > latbibliotek.rankat_frist(v_o) then
      perform latbibliotek.rankat_tid_ute(v_o);
    else
      return latbibliotek.rankat_lage(v_m.id) || jsonb_build_object(
        'omgang', v_o.id, 'steg', v_o.steg, 'startad', v_o.steg_tid is not null,
        'kvar', case when v_o.steg_tid is not null then latbibliotek.rankat_kvar(v_o) end,
        'alternativ', case when v_o.steg_tid is not null then latbibliotek.rankat_alt_json(v_o) end);
    end if;
  end if;

  select x.id, x.n into v_lat, v_n from unnest(v_m.latar) with ordinality as x(id, n)
  where not exists (select 1 from latbibliotek.omgangar o where o.match_id = v_m.id and o.lat_id = x.id)
  order by x.n limit 1;

  if v_lat is null then
    return latbibliotek.rankat_lage(v_m.id) || latbibliotek.rankat_avsluta(v_m.id, false);
  end if;

  insert into latbibliotek.omgangar (anvandare, lat_id, lage, match_id, val, niva, alternativ)
  values (v_uid, v_lat, 'rankat', v_m.id, v_m.genre, v_m.niva,
    array(select jsonb_array_elements_text(v_m.alternativ->(v_n - 1))::bigint))
  returning * into v_o;

  return latbibliotek.rankat_lage(v_m.id) || jsonb_build_object(
    'omgang', v_o.id, 'steg', 0, 'startad', false);
end
$$;

-- Ljudet lämnas ut och klockan för klippet startar. Att spela klippet igen
-- startar inte om klockan.
create function public.rankat_spela(p_omgang uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.rankat_omgang(p_omgang);
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is not null and now() > latbibliotek.rankat_frist(v_o) then
    return latbibliotek.rankat_tid_ute(v_o);
  end if;
  if v_o.steg_tid is null then
    update latbibliotek.omgangar set steg_tid = now() where id = v_o.id returning * into v_o;
  end if;
  return jsonb_build_object(
    'ljud', (select ljud from latbibliotek.latar where id = v_o.lat_id),
    'steg', v_o.steg,
    'sekunder', latbibliotek.dag_klipp(v_o.steg),
    'poang', latbibliotek.dag_poang(v_o.steg),
    'kvar', latbibliotek.rankat_kvar(v_o),
    'alternativ', latbibliotek.rankat_alt_json(v_o)
  );
end
$$;

-- Ett längre klipp. Klockan börjar om för det nya klippet.
create function public.rankat_langre(p_omgang uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.rankat_omgang(p_omgang);
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then return jsonb_build_object('fel', 'inte_startad'); end if;
  if now() > latbibliotek.rankat_frist(v_o) then return latbibliotek.rankat_tid_ute(v_o); end if;
  if v_o.steg >= 4 then return jsonb_build_object('fel', 'sista_klippet'); end if;
  update latbibliotek.omgangar set steg = steg + 1, steg_tid = now() where id = v_o.id returning * into v_o;
  return jsonb_build_object(
    'steg', v_o.steg,
    'sekunder', latbibliotek.dag_klipp(v_o.steg),
    'poang', latbibliotek.dag_poang(v_o.steg),
    'kvar', latbibliotek.rankat_kvar(v_o)
  );
end
$$;

-- Svaret. Ett svar per låt. Efter fristen räknas det som att tiden gick ut.
create function public.rankat_svara(p_omgang uuid, p_plats integer) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.rankat_omgang(p_omgang);
  v_ratt boolean;
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then return jsonb_build_object('fel', 'inte_startad'); end if;
  if p_plats is null or p_plats < 0 or p_plats >= cardinality(v_o.alternativ) then
    return jsonb_build_object('fel', 'ogiltigt_svar');
  end if;
  if now() > latbibliotek.rankat_frist(v_o) then return latbibliotek.rankat_tid_ute(v_o); end if;

  v_ratt := v_o.alternativ[p_plats + 1] = v_o.lat_id;
  update latbibliotek.omgangar set
    klar = true, ratt = v_ratt, avslutad = now(),
    poang = case when v_ratt then latbibliotek.dag_poang(v_o.steg) else 0 end,
    forsok = jsonb_build_array(jsonb_build_object('plats', p_plats, 'steg', v_o.steg,
      'sekunder', round(extract(epoch from now() - v_o.steg_tid)::numeric, 1)))
  where id = v_o.id
  returning * into v_o;
  update latbibliotek.latar set spelade = spelade + 1, ratt = ratt + v_ratt::integer where id = v_o.lat_id;
  return latbibliotek.rankat_facit(v_o);
end
$$;

-- Ge upp: förlust, inga poäng till rangen.
create function public.rankat_ge_upp(p_match uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_m latbibliotek.matcher;
begin
  select * into v_m from latbibliotek.matcher where id = p_match and anvandare = auth.uid();
  if v_m.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_m.klar then return latbibliotek.rankat_lage(v_m.id) || latbibliotek.rankat_resultat(v_m.id); end if;
  return latbibliotek.rankat_lage(v_m.id) || latbibliotek.rankat_avsluta(v_m.id, true);
end
$$;

-- Kontots ratingar, en påbörjad match och de senaste matcherna.
create or replace function public.rankat_min() returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'har_namn', exists (select 1 from public.profiler where id = auth.uid()),
    'alla', latbibliotek.rankat_rating_json(auth.uid(), 'alla'),
    'genrer', (select jsonb_object_agg(g, latbibliotek.rankat_rating_json(auth.uid(), g))
               from unnest(array['hardstyle', 'raw', 'uptempo', 'hardcore', 'techno']) g),
    'oppen', (select jsonb_build_object('match', m.id, 'genre', m.genre,
                'spelade', (select count(*) from latbibliotek.omgangar o where o.match_id = m.id and o.klar))
              from latbibliotek.matcher m
              where m.anvandare = auth.uid() and not m.klar order by m.skapad desc limit 1),
    'rang_idag', coalesce((select trim_scale(sum(poang)) from quiz.spelpoang
                           where anvandare = auth.uid() and spel = 'rankat' and datum = quiz.idag()), 0),
    'rang_tak', quiz.rankat_tak(),
    'senaste', coalesce((
      select jsonb_agg(r order by s desc) from (
        select m.avslutad as s, jsonb_build_object(
          'genre', m.genre, 'resultat', m.resultat, 'avbruten', m.avbruten,
          'poang', m.poang, 'mot_poang', m.mot_poang,
          'andring', round(m.rating_efter) - round(m.rating_fore),
          'mot', latbibliotek.rankat_mot(m), 'datum', (m.avslutad at time zone 'Europe/Stockholm')::date
        ) as r
        from latbibliotek.matcher m
        where m.anvandare = auth.uid() and m.klar and m.alternativ is not null
        order by m.avslutad desc limit 5
      ) x
    ), '[]'::jsonb)
  ) end
$$;

-- Topplistan per genre, eller totalt med alla. Man syns efter fem matcher.
-- Lämnar bara ut visningsnamn, bild, badge vid namnet, rating, titel och
-- antal matcher och vinster.
create or replace function public.rankat_topplista(p_genre text) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_genre is null or p_genre not in ('alla', 'hardstyle', 'raw', 'uptempo', 'hardcore', 'techno') then
    return jsonb_build_object('fel', 'ogiltig_genre');
  end if;
  return (
    with rankad as (
      select r.anvandare, p.visningsnamn, r.rating, r.matcher, r.vinster,
        rank() over (order by round(r.rating) desc) as plats,
        row_number() over (order by r.rating desc, lower(p.visningsnamn)) as nr
      from latbibliotek.rating r
      join public.profiler p on p.id = r.anvandare
      where r.genre = p_genre and r.matcher >= 5
    )
    select jsonb_build_object(
      'genre', p_genre,
      'lista', coalesce((
        select jsonb_agg(jsonb_build_object(
          'plats', plats, 'namn', visningsnamn, 'rating', round(rating), 'matcher', matcher, 'vinster', vinster,
          'bild', profil.synlig_bild(anvandare), 'badge', profil.vid_namnet(anvandare)
        ) || latbibliotek.rankat_titel(rating) order by nr) from rankad where nr <= 50), '[]'::jsonb),
      'jag', (select jsonb_build_object('plats', plats, 'namn', visningsnamn, 'rating', round(rating),
                'matcher', matcher, 'vinster', vinster, 'listad', nr <= 50,
                'bild', profil.synlig_bild(anvandare), 'badge', profil.vid_namnet(anvandare))
                || latbibliotek.rankat_titel(rating)
              from rankad where anvandare = auth.uid()),
      'placering', case when auth.uid() is not null then
        latbibliotek.rankat_rating_json(auth.uid(), p_genre) end
    )
  );
end
$$;

/* ---------- topplistan och profilen ---------- */

-- Som förut, med titeln från rankat vid namnet för den som spelat minst fem
-- matcher.
create or replace function profil.topplista_spel(p_uid uuid, p_spel text) returns jsonb
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
            'bild', profil.synlig_bild(r.anvandare), 'badge', profil.vid_namnet(r.anvandare),
            'rankat', latbibliotek.rankat_namn(r.anvandare)
          ) order by r.nr)
          from rankad r where r.nr <= 50
        ), '[]'::jsonb),
        'jag', (
          select jsonb_build_object(
            'plats', r.plats, 'namn', r.visningsnamn, 'poang', trim_scale(round(r.summa, 1)),
            'rang', quiz.rang(quiz.total(r.anvandare)), 'listad', r.nr <= 50,
            'bild', profil.synlig_bild(r.anvandare), 'badge', profil.vid_namnet(r.anvandare),
            'rankat', latbibliotek.rankat_namn(r.anvandare)
          )
          from rankad r where r.anvandare = p_uid
        )
      )
    ));
  end loop;
  return v_resultat || jsonb_build_object('manad_datum', v_manad);
end
$$;

-- p_spel: alla, fraga, lat, fritt eller rankat.
create or replace function public.topplista(p_spel text default 'alla') returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_spel is null or p_spel not in ('alla', 'fraga', 'lat', 'fritt', 'rankat') then
    return jsonb_build_object('fel', 'ogiltigt_spel');
  end if;
  return profil.topplista_spel(auth.uid(), p_spel);
end
$$;

-- Rankat på profilen: totalen och varje genre. Null om kontot aldrig spelat.
create function profil.rankat_json(p_anvandare uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select case when exists (select 1 from latbibliotek.rating where anvandare = p_anvandare and matcher > 0)
  then jsonb_build_object(
    'alla', latbibliotek.rankat_rating_json(p_anvandare, 'alla'),
    'genrer', (select jsonb_object_agg(g, latbibliotek.rankat_rating_json(p_anvandare, g))
               from unnest(array['hardstyle', 'raw', 'uptempo', 'hardcore', 'techno']) g
               where exists (select 1 from latbibliotek.rating where anvandare = p_anvandare and genre = g and matcher > 0))
  ) end
$$;

-- Profilen med statistik och rankat. Kraschar någon av delarna visas
-- profilen ändå, utan den.
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
  begin
    v_p := v_p || jsonb_build_object('rankat', profil.rankat_json(v_id), 'poang_rankat', quiz.total(v_id, 'rankat'));
  exception when others then
    raise warning 'Rankat på profilen misslyckades: %', sqlerrm;
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
  begin
    v_p := v_p || jsonb_build_object('rankat', profil.rankat_json(v_uid), 'poang_rankat', quiz.total(v_uid, 'rankat'));
  exception when others then
    raise warning 'Rankat på profilen misslyckades: %', sqlerrm;
  end;
  return v_p;
end
$$;

/* ---------- rättigheter ---------- */

revoke all on all functions in schema latbibliotek from public, anon, authenticated;
revoke all on all functions in schema quiz from public, anon, authenticated;
revoke all on all functions in schema profil from public, anon, authenticated;
revoke all on function public.rankat_starta(text) from public, anon, authenticated;
revoke all on function public.rankat_nasta(uuid) from public, anon, authenticated;
revoke all on function public.rankat_spela(uuid) from public, anon, authenticated;
revoke all on function public.rankat_langre(uuid) from public, anon, authenticated;
revoke all on function public.rankat_svara(uuid, integer) from public, anon, authenticated;
revoke all on function public.rankat_ge_upp(uuid) from public, anon, authenticated;
revoke all on function public.rankat_min() from public, anon, authenticated;
revoke all on function public.rankat_topplista(text) from public, anon, authenticated;
revoke all on function public.topplista(text) from public, anon, authenticated;
revoke all on function public.profil_visa(text) from public, anon, authenticated;
revoke all on function public.profil_min() from public, anon, authenticated;
grant execute on function public.rankat_starta(text) to authenticated;
grant execute on function public.rankat_nasta(uuid) to authenticated;
grant execute on function public.rankat_spela(uuid) to authenticated;
grant execute on function public.rankat_langre(uuid) to authenticated;
grant execute on function public.rankat_svara(uuid, integer) to authenticated;
grant execute on function public.rankat_ge_upp(uuid) to authenticated;
grant execute on function public.rankat_min() to authenticated;
grant execute on function public.rankat_topplista(text) to anon, authenticated;
grant execute on function public.topplista(text) to anon, authenticated;
grant execute on function public.profil_visa(text) to anon, authenticated;
grant execute on function public.profil_min() to authenticated;
