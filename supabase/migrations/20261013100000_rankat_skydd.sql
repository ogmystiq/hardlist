-- Skydd i rankat efter granskningen av 20261012100000 och 20261012200000.
--
-- Servern avgör redan tid, poäng och rättning, och inga tabeller är öppna.
-- Det som saknades var skydd mot att två konton hjälper varandra:
--
-- 1. Samma två konton möts högst två gånger per dygn, live och asynkront. Annars
--    kan en person med två konton låta det ena lära sig svaren (facit visas efter
--    varje låt) och sedan slå det på samma tio låtar, om och om igen, och
--    pumpa rating, vinster, Duellen och Obesegrad.
-- 2. En färdig match kan användas som motståndare högst fem gånger. En match
--    spelad med avsikt på noll poäng kunde annars matas ut till alla som
--    letade motståndare, och ge dem varsin vinst.
-- 3. En match där alla låtar redan var besvarade räknas som den blev även när
--    den lämnas för en ny. Förut blev den en förlust, oavsett poängen.
--
-- Poäng till rangen från rankat är fortfarande högst 20 per dygn, och
-- rangskalan är orörd.
--
-- Bara nytt läggs till och funktioner ersätts.

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

-- Har de två redan mötts två gånger det senaste dygnet? En live-match räknas
-- en gång, från vardera sidan. Mötet kan ha gått i båda riktningarna.
create function latbibliotek.rankat_for_ofta(p_a uuid, p_b uuid) returns boolean
language sql stable
set search_path = ''
as $$
  select count(*) >= 2
  from latbibliotek.matcher m
  where m.skapad > now() - interval '24 hours'
    and m.mot_typ in ('spelare', 'live')
    and ((m.anvandare = p_a and m.mot_anvandare = p_b)
      or (m.mot_typ = 'spelare' and m.anvandare = p_b and m.mot_anvandare = p_a))
$$;

-- Hur många gånger en färdig match får vara motståndare.
create function latbibliotek.rankat_max_ateranvandning() returns integer
language sql immutable
set search_path = ''
as $$ select 5 $$;

/* ---------- funktioner som ersätts ---------- */

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
  v_klara integer;
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

  -- Hur många låtar som var besvarade innan resten stängdes.
  select count(*) into v_klara from latbibliotek.omgangar where match_id = v_m.id and klar;

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

  -- Att ge upp räknas bara om det finns något kvar att ge upp. En match där alla
  -- låtar är besvarade räknas som den blev, också när den lämnas för en ny.
  v_avbruten := (p_gav_upp and v_klara < cardinality(v_m.latar))
    or (select count(*) from latbibliotek.omgangar where match_id = v_m.id) < cardinality(v_m.latar);
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

create or replace function public.rankat_ko(p_genre text) returns jsonb
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
    and not latbibliotek.rankat_for_ofta(v_uid, k.anvandare)
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
      and not latbibliotek.rankat_for_ofta(v_uid, m.anvandare)
      and (select count(*) from latbibliotek.matcher x where x.mot_match = m.id and x.mot_typ = 'spelare') < latbibliotek.rankat_max_ateranvandning()
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

/* ---------- rättigheter ---------- */

revoke all on all functions in schema latbibliotek from public, anon, authenticated;
revoke all on function public.rankat_ko(text) from public, anon, authenticated;
revoke all on function public.rankat_starta(text) from public, anon, authenticated;
grant execute on function public.rankat_ko(text) to authenticated;
grant execute on function public.rankat_starta(text) to authenticated;
