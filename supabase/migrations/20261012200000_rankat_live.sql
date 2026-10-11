-- Live-matcher i rankat.
--
-- Man ställer sig i kö i en genre. Servern parar ihop två spelare som är
-- inne samtidigt och har ungefär samma rating: ±100 från början, och 20 till
-- för varje sekund den som väntat längst har väntat, högst ±400. Båda får
-- samma tio låtar med samma alternativ i samma stund och ser varandras poäng
-- under matchen. Var och en spelar i egen takt.
--
-- Hittar sidan ingen på 30 sekunder startar den en vanlig match som förut,
-- mot en sparad match eller en skuggmotståndare (rankat_starta).
--
-- Matchen räknas ihop för var och en när båda är klara. Den som ger upp, eller
-- inte gör något på två minuter medan den andra väntar, förlorar, och den
-- andra vinner. Ratingen räknas som förut, mot motståndarens rating när
-- matchen startade.
--
-- Sidan frågar servern med några sekunders mellanrum, i stället för Realtime.
-- Då avgör servern allt, och inget schema behöver öppnas för API:t.
--
-- Bara nytt läggs till och funktioner ersätts.

/* ---------- tabeller ---------- */

alter table latbibliotek.matcher drop constraint matcher_mot_typ_check;
alter table latbibliotek.matcher add constraint matcher_mot_typ_check
  check (mot_typ in ('spelare', 'skugga', 'live'));
-- Samma för båda matcherna i en live-match.
alter table latbibliotek.matcher add column live uuid;
create index matcher_live on latbibliotek.matcher (live) where live is not null;

-- Kön. En rad per konto som letar motståndare. senast uppdateras varje gång
-- sidan frågar, så att den som stängt sidan försvinner ur kön.
create table latbibliotek.ko (
  anvandare uuid primary key references auth.users (id) on delete cascade,
  genre text not null check (genre in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno')),
  rating numeric not null,
  skapad timestamptz not null default now(),
  senast timestamptz not null default now(),
  -- Matchen när någon annan har parat ihop sig med kontot.
  match uuid references latbibliotek.matcher (id) on delete set null
);

alter table latbibliotek.ko enable row level security;
revoke all on table latbibliotek.ko from public, anon, authenticated;

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

-- Hur länge en väntande spelare får vara borta innan den andra vinner.
create function latbibliotek.rankat_borta() returns interval
language sql immutable
set search_path = ''
as $$ select interval '120 seconds' $$;

-- Senaste gången någon gjorde något i matchen.
create function latbibliotek.rankat_senast(p_match uuid) returns timestamptz
language sql stable
set search_path = ''
as $$
  select greatest(m.skapad, max(o.skapad), max(o.steg_tid), max(o.avslutad))
  from latbibliotek.matcher m
  left join latbibliotek.omgangar o on o.match_id = m.id
  where m.id = p_match
  group by m.skapad
$$;

-- Hur långt motståndaren i en live-match har kommit. Bara antal och poäng,
-- aldrig vilka svar.
create function latbibliotek.rankat_mot_live(p_m latbibliotek.matcher) returns jsonb
language sql stable
set search_path = ''
as $$
  select case when p_m.mot_typ = 'live' then (
    select jsonb_build_object(
      'spelade', (select count(*) from latbibliotek.omgangar o where o.match_id = x.id and o.klar),
      'poang', (select coalesce(sum(o.poang), 0) from latbibliotek.omgangar o where o.match_id = x.id and o.klar),
      'klar', x.klar or (select count(*) from latbibliotek.omgangar o where o.match_id = x.id and o.klar) >= cardinality(x.latar),
      'avbruten', x.klar and x.avbruten
    )
    from latbibliotek.matcher x where x.id = p_m.mot_match
  ) end
$$;

-- Motståndaren som sajten får se.
create or replace function latbibliotek.rankat_mot(p_m latbibliotek.matcher) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'skugga', p_m.mot_typ = 'skugga',
    'live', p_m.mot_typ = 'live',
    'namn', case when p_m.mot_typ = 'skugga' then null
                 else coalesce((select visningsnamn from public.profiler where id = p_m.mot_anvandare), 'En tidigare spelare') end,
    'rating', round(p_m.mot_rating)
  ) || latbibliotek.rankat_titel(p_m.mot_rating)
$$;

-- Läget i en match, med motståndarens framsteg i en live-match.
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
    'mot_live', latbibliotek.rankat_mot_live(m),
    'jag', latbibliotek.rankat_rating_json(m.anvandare, m.genre)
  )
  from latbibliotek.matcher m where m.id = p_match
$$;

-- Som förut, och i en live-match: motståndarens poäng hämtas från hens låtar
-- när matchen räknas ihop, och har motståndaren gett upp vinner man.
create or replace function latbibliotek.rankat_avsluta(p_match uuid, p_gav_upp boolean) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_m latbibliotek.matcher;
  v_mot latbibliotek.matcher;
  v_lat integer[];
  v_summa integer;
  v_avbruten boolean;
  v_mot_avbruten boolean := false;
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
  select * into v_m from latbibliotek.matcher where id = p_match;
  if v_m.id is null or v_m.klar then return null; end if;
  -- Båda sidor av en live-match räknas aldrig ihop samtidigt.
  if v_m.live is not null then perform pg_advisory_xact_lock(hashtext('live:' || v_m.live::text)); end if;
  select * into v_m from latbibliotek.matcher where id = p_match for update;
  if v_m.klar then return null; end if;

  update latbibliotek.omgangar set klar = true, ratt = false, poang = 0, avslutad = now(),
    forsok = forsok || jsonb_build_array(jsonb_build_object('t', 'avbruten'))
  where match_id = v_m.id and not klar;

  select array_agg(coalesce(o.poang, 0) order by x.n) into v_lat
  from unnest(v_m.latar) with ordinality as x(id, n)
  left join latbibliotek.omgangar o on o.match_id = v_m.id and o.lat_id = x.id;
  v_summa := (select coalesce(sum(p), 0) from unnest(v_lat) p);

  -- Live: motståndarens poäng så här långt. Är hen inte klar räknas resten
  -- som noll, men då är hen antingen klar, uppgiven eller borta.
  if v_m.mot_typ = 'live' then
    select * into v_mot from latbibliotek.matcher where id = v_m.mot_match;
    select array_agg(coalesce(o.poang, 0) order by x.n) into v_m.mot_latpoang
    from unnest(v_m.latar) with ordinality as x(id, n)
    left join latbibliotek.omgangar o on o.match_id = v_m.mot_match and o.lat_id = x.id and o.klar;
    v_m.mot_poang := (select coalesce(sum(p), 0) from unnest(v_m.mot_latpoang) p);
    v_mot_avbruten := coalesce(v_mot.klar and v_mot.avbruten, true);
    update latbibliotek.matcher set mot_poang = v_m.mot_poang, mot_latpoang = v_m.mot_latpoang where id = v_m.id;
  end if;

  v_avbruten := p_gav_upp or (select count(*) from latbibliotek.omgangar where match_id = v_m.id) < cardinality(v_m.latar);
  v_resultat := case
    when v_avbruten then 'forlust'
    when v_mot_avbruten then 'vinst'
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

  -- Badges får aldrig stoppa en match. En match som räknas ihop från den
  -- andra spelarens anrop är alltid en förlust, så popupen behöver aldrig
  -- vänta på någon annan.
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

/* ---------- det sajten får anropa ---------- */

-- Kön. Anropas av sidan med några sekunders mellanrum medan den letar.
-- Svarar status ko, eller status match med läget i den nya matchen.
create function public.rankat_ko(p_genre text) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_k latbibliotek.ko;
  v_p latbibliotek.ko;
  v_r numeric;
  v_ra numeric;
  v_pr numeric;
  v_pra numeric;
  v_oppen uuid;
  v_niva text;
  v_latar bigint[];
  v_alt jsonb;
  v_live uuid := gen_random_uuid();
  v_a uuid;
  v_b uuid;
begin
  if v_uid is null then return jsonb_build_object('fel', 'inte_inloggad'); end if;
  if not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'visningsnamn_saknas');
  end if;
  if p_genre is null or p_genre not in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno') then
    return jsonb_build_object('fel', 'ogiltig_genre');
  end if;

  -- En kö åt gången, så att ingen paras ihop med två.
  perform pg_advisory_xact_lock(hashtext('rankatko'));

  select * into v_k from latbibliotek.ko where anvandare = v_uid;
  if v_k.match is not null then
    delete from latbibliotek.ko where anvandare = v_uid;
    if exists (select 1 from latbibliotek.matcher where id = v_k.match and not klar) then
      return latbibliotek.rankat_lage(v_k.match) || jsonb_build_object('status', 'match');
    end if;
    v_k := null;
  end if;

  insert into latbibliotek.rating (anvandare, genre) values (v_uid, p_genre), (v_uid, 'alla')
  on conflict do nothing;
  select rating into v_r from latbibliotek.rating where anvandare = v_uid and genre = p_genre;
  select rating into v_ra from latbibliotek.rating where anvandare = v_uid and genre = 'alla';

  if v_k.anvandare is null or v_k.genre <> p_genre then
    insert into latbibliotek.ko (anvandare, genre, rating) values (v_uid, p_genre, v_r)
    on conflict (anvandare) do update set genre = excluded.genre, rating = excluded.rating,
      skapad = now(), senast = now(), match = null
    returning * into v_k;
  else
    update latbibliotek.ko set senast = now(), rating = v_r where anvandare = v_uid returning * into v_k;
  end if;

  -- Den som inte frågat på en stund har stängt sidan. En ihopparning som
  -- aldrig hämtades städas bort efter en timme, matchen finns kvar ändå.
  delete from latbibliotek.ko
  where (senast < now() - interval '10 seconds' and match is null) or senast < now() - interval '1 hour';

  select * into v_p from latbibliotek.ko k
  where k.anvandare <> v_uid and k.genre = p_genre and k.match is null
    and k.senast > now() - interval '6 seconds'
    and abs(k.rating - v_r) <= least(400, 100 + 20 * extract(epoch from now() - least(k.skapad, v_k.skapad)))
  order by abs(k.rating - v_r), k.skapad
  limit 1;

  if v_p.anvandare is null then
    return jsonb_build_object(
      'status', 'ko',
      'vantat', round(extract(epoch from now() - v_k.skapad)::numeric),
      'i_kon', (select count(*) from latbibliotek.ko k where k.genre = p_genre and k.match is null
                and k.senast > now() - interval '6 seconds' and k.anvandare <> v_uid)
    );
  end if;

  -- Paras ihop. En påbörjad match hos någon av dem räknas som uppgiven, som
  -- när man startar en ny.
  for v_oppen in select id from latbibliotek.matcher where anvandare in (v_uid, v_p.anvandare) and not klar loop
    perform latbibliotek.rankat_avsluta(v_oppen, true);
  end loop;

  insert into latbibliotek.rating (anvandare, genre) values (v_p.anvandare, p_genre), (v_p.anvandare, 'alla')
  on conflict do nothing;
  select rating into v_pr from latbibliotek.rating where anvandare = v_p.anvandare and genre = p_genre;
  select rating into v_pra from latbibliotek.rating where anvandare = v_p.anvandare and genre = 'alla';

  v_niva := case when (v_r + v_pr) / 2 >= 1300 then 'expert' else 'svar' end;
  v_latar := latbibliotek.rankat_latar(v_uid, p_genre, v_niva);
  if coalesce(cardinality(v_latar), 0) < 10 then
    return jsonb_build_object('fel', 'inga_latar');
  end if;
  select jsonb_agg(to_jsonb(latbibliotek.rankat_alternativ(id)) order by n) into v_alt
  from unnest(v_latar) with ordinality as x(id, n);
  if exists (select 1 from jsonb_array_elements(v_alt) as a(v) where a.v = 'null'::jsonb) then
    return jsonb_build_object('fel', 'inga_latar');
  end if;

  insert into latbibliotek.matcher (anvandare, genre, latar, niva, alternativ, live,
    mot_typ, mot_anvandare, mot_rating, mot_alla)
  values (v_uid, p_genre, v_latar, v_niva, v_alt, v_live, 'live', v_p.anvandare, v_pr, v_pra)
  returning id into v_a;
  insert into latbibliotek.matcher (anvandare, genre, latar, niva, alternativ, live,
    mot_typ, mot_anvandare, mot_rating, mot_alla)
  values (v_p.anvandare, p_genre, v_latar, v_niva, v_alt, v_live, 'live', v_uid, v_r, v_ra)
  returning id into v_b;
  update latbibliotek.matcher set rot = v_a, mot_match = case when id = v_a then v_b else v_a end
  where id in (v_a, v_b);

  update latbibliotek.ko set match = v_b where anvandare = v_p.anvandare;
  delete from latbibliotek.ko where anvandare = v_uid;
  return latbibliotek.rankat_lage(v_a) || jsonb_build_object('status', 'match');
end
$$;

-- Lämna kön. Har någon hunnit para ihop sig med kontot kommer matchen
-- tillbaka i stället, så att den inte blir hängande.
create function public.rankat_ko_lamna() returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_match uuid;
begin
  if v_uid is null then return jsonb_build_object('fel', 'inte_inloggad'); end if;
  perform pg_advisory_xact_lock(hashtext('rankatko'));
  delete from latbibliotek.ko where anvandare = v_uid returning match into v_match;
  if v_match is not null and exists (select 1 from latbibliotek.matcher where id = v_match and not klar) then
    return latbibliotek.rankat_lage(v_match) || jsonb_build_object('status', 'match');
  end if;
  return jsonb_build_object('status', 'lamnad');
end
$$;

-- Motståndarens framsteg i en live-match. Bara antal låtar och poäng.
create function public.rankat_motstandare(p_match uuid) returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select latbibliotek.rankat_mot_live(m) from latbibliotek.matcher m
  where m.id = p_match and m.anvandare = auth.uid()
$$;

-- Som förut, men en live-match som någon hunnit para ihop sig med när sidan
-- gav upp kön kommer tillbaka i stället för att räknas som uppgiven.
create or replace function public.rankat_starta(p_genre text) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ko uuid;
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

  perform pg_advisory_xact_lock(hashtext('rankatko'));
  perform pg_advisory_xact_lock(hashtext('rankat:' || v_uid::text));

  delete from latbibliotek.ko where anvandare = v_uid returning match into v_ko;
  if v_ko is not null and exists (select 1 from latbibliotek.matcher where id = v_ko and not klar) then
    return latbibliotek.rankat_lage(v_ko) || jsonb_build_object('status', 'match');
  end if;

  for v_oppen in select id from latbibliotek.matcher where anvandare = v_uid and not klar loop
    perform latbibliotek.rankat_avsluta(v_oppen, true);
  end loop;

  insert into latbibliotek.rating (anvandare, genre) values (v_uid, p_genre), (v_uid, 'alla')
  on conflict do nothing;
  select rating into v_r from latbibliotek.rating where anvandare = v_uid and genre = p_genre;
  select rating into v_ra from latbibliotek.rating where anvandare = v_uid and genre = 'alla';

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
    return latbibliotek.rankat_lage(v_id) || jsonb_build_object('status', 'match');
  end if;

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
  return latbibliotek.rankat_lage(v_id) || jsonb_build_object('status', 'match');
end
$$;

-- Som förut. I en live-match väntar den som är klar först på motståndaren
-- (svaret har vantar: true, och sidan frågar igen). Har motståndaren inte
-- gjort något på två minuter förlorar hen, och matchen räknas ihop.
create or replace function public.rankat_nasta(p_match uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m latbibliotek.matcher;
  v_mot latbibliotek.matcher;
  v_o latbibliotek.omgangar;
  v_lat bigint;
  v_n integer;
begin
  select * into v_m from latbibliotek.matcher where id = p_match and anvandare = v_uid;
  if v_m.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_m.live is not null then perform pg_advisory_xact_lock(hashtext('live:' || v_m.live::text)); end if;
  select * into v_m from latbibliotek.matcher where id = p_match for update;
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
    if v_m.mot_typ = 'live' then
      select * into v_mot from latbibliotek.matcher where id = v_m.mot_match;
      if v_mot.id is not null and not v_mot.klar
         and (select count(*) from latbibliotek.omgangar o where o.match_id = v_mot.id and o.klar) < cardinality(v_mot.latar) then
        if latbibliotek.rankat_senast(v_mot.id) < now() - latbibliotek.rankat_borta() then
          perform latbibliotek.rankat_avsluta(v_mot.id, true);
        else
          return latbibliotek.rankat_lage(v_m.id) || jsonb_build_object('vantar', true);
        end if;
      end if;
    end if;
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

-- Som förut, med hur många som letar en live-match i varje genre just nu.
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
    'i_kon', (select coalesce(jsonb_object_agg(genre, antal), '{}'::jsonb) from (
                select genre, count(*) as antal from latbibliotek.ko
                where match is null and senast > now() - interval '6 seconds' and anvandare <> auth.uid()
                group by genre) k),
    'oppen', (select jsonb_build_object('match', m.id, 'genre', m.genre, 'live', m.mot_typ = 'live',
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

/* ---------- rättigheter ---------- */

revoke all on all functions in schema latbibliotek from public, anon, authenticated;
revoke all on function public.rankat_ko(text) from public, anon, authenticated;
revoke all on function public.rankat_ko_lamna() from public, anon, authenticated;
revoke all on function public.rankat_motstandare(uuid) from public, anon, authenticated;
revoke all on function public.rankat_starta(text) from public, anon, authenticated;
revoke all on function public.rankat_nasta(uuid) from public, anon, authenticated;
revoke all on function public.rankat_min() from public, anon, authenticated;
grant execute on function public.rankat_ko(text) to authenticated;
grant execute on function public.rankat_ko_lamna() to authenticated;
grant execute on function public.rankat_motstandare(uuid) to authenticated;
grant execute on function public.rankat_starta(text) to authenticated;
grant execute on function public.rankat_nasta(uuid) to authenticated;
grant execute on function public.rankat_min() to authenticated;
