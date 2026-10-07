-- Fritt spel med låtbiblioteket.
--
-- Servern väljer låten och de fyra alternativen och rättar svaret. Sidan får
-- aldrig veta vilket alternativ som är rätt förrän den har svarat, och
-- ljudadressen lämnas ut först när klockan startar.
--
-- En runda: latspel_ny väljer låt och alternativ. latspel_spela lämnar ut
-- ljudet och startar klockan. latspel_langre går till nästa klipplängd och
-- startar om klockan. latspel_svara rättar.
--
-- Klipplängden kontrolleras mot tiden: den som svarar på 1 sekund måste göra
-- det inom klippet plus svarstiden. Har mer tid gått räknas poängen som för
-- den längre klipp-längd tiden räcker till. Rankat spel och dueller kommer
-- senare och använder samma omgångar, med lage och match_id.
--
-- Allt läggs till. Inga befintliga tabeller tas bort eller döps om.

/* ---------- omgångarna får det fritt spel behöver ---------- */

alter table latbibliotek.omgangar
  add column val text,
  add column niva text,
  add column alternativ bigint[],
  add column steg smallint not null default 0,
  add column steg_tid timestamptz,
  add column poang integer;

/* ---------- vad som sparas för ett konto ---------- */

-- Antal spelade och rätt per genre, efter låtens genre. Badges för genreöronen
-- räknas härifrån.
create table latbibliotek.statistik (
  anvandare uuid not null references auth.users (id) on delete cascade,
  genre text not null check (genre in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno')),
  spelade integer not null default 0,
  ratt integer not null default 0,
  primary key (anvandare, genre)
);

-- Rundor per dag, svensk tid. Maraton räknas härifrån.
create table latbibliotek.dagar (
  anvandare uuid not null references auth.users (id) on delete cascade,
  datum date not null,
  rundor integer not null default 0,
  primary key (anvandare, datum)
);

alter table latbibliotek.statistik enable row level security;
alter table latbibliotek.dagar enable row level security;
revoke all on table latbibliotek.statistik from public, anon, authenticated;
revoke all on table latbibliotek.dagar from public, anon, authenticated;

/* ---------- badges som nu delas ut ---------- */

-- Genreöronen, Hela scenen och Maraton kommer inte längre. Låtspelets andra
-- badges väntar på dueller och dagens låt. Skrivet som insert så att
-- kontrollskriptet läser flaggan.
insert into profil.katalog (id, niva, hemlig, kommer) values
  ('g-hardstyle', 3, false, false),
  ('g-raw', 3, false, false),
  ('g-uptempo', 3, false, false),
  ('g-hardcore', 3, false, false),
  ('g-techno', 3, false, false),
  ('scenen', 4, false, false),
  ('maraton', 2, false, false)
on conflict (id) do update set kommer = excluded.kommer;

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

-- Klipplängden i sekunder och poängen för varje steg.
create function latbibliotek.klipp(p_steg integer) returns integer
language sql immutable
set search_path = ''
as $$ select (array[1, 3, 7, 15])[least(greatest(p_steg, 0), 3) + 1] $$;

create function latbibliotek.poang_for(p_steg integer) returns integer
language sql immutable
set search_path = ''
as $$ select (array[100, 60, 30, 10])[least(greatest(p_steg, 0), 3) + 1] $$;

-- Tid att trycka efter att klippet spelats, plus att ljudet ska laddas.
create function latbibliotek.svarstid() returns integer
language sql immutable
set search_path = ''
as $$ select 8 $$;

-- Lätt: varje artists tio första låtar i iTunes ordning. Det är det enda mått
-- på hur kända låtarna är som biblioteket har. Svår: alla.
create function latbibliotek.i_poolen(l latbibliotek.latar, p_val text, p_niva text) returns boolean
language sql stable
set search_path = ''
as $$
  select l.aktiv and l.trasig is null
    and (p_val = 'blandat' or l.genre = p_val)
    and (p_niva = 'svar' or coalesce(l.itunes_ordning, 99) < 10)
$$;

-- Badges efter en runda. Anropas i ett eget exception-block, så att ett fel
-- här aldrig stoppar svaret.
create function latbibliotek.dela_ut(p_anvandare uuid, p_genre text) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_ut jsonb := '[]'::jsonb;
  v_id text;
  v_ids text[] := '{}';
begin
  if (select ratt from latbibliotek.statistik where anvandare = p_anvandare and genre = p_genre) >= 50 then
    v_ids := array_append(v_ids, ('g-' || p_genre)::text);
  end if;
  if (select rundor from latbibliotek.dagar where anvandare = p_anvandare and datum = quiz.idag()) >= 100 then
    v_ids := array_append(v_ids, 'maraton'::text);
  end if;

  foreach v_id in array v_ids loop
    if profil.ge(p_anvandare, v_id, now(), true) then
      v_ut := v_ut || jsonb_build_array(jsonb_build_object('id', v_id, 'forst', profil.forst(v_id)));
    end if;
  end loop;

  -- Hela scenen när alla fem genreöronen är tagna.
  if (select count(*) from profil.badges where anvandare = p_anvandare
      and badge in ('g-hardstyle', 'g-raw', 'g-uptempo', 'g-hardcore', 'g-techno')) = 5
     and profil.ge(p_anvandare, 'scenen', now(), true) then
    v_ut := v_ut || jsonb_build_array(jsonb_build_object('id', 'scenen', 'forst', profil.forst('scenen')));
  end if;
  return v_ut;
end
$$;

/* ---------- det sajten får anropa ---------- */

-- En ny runda. p_val: hardstyle, raw, uptempo, hardcore, techno eller
-- blandat. p_niva: latt eller svar. Utan konto skickar sidan med de låtar den
-- redan spelat, eftersom servern inte sparar något om den.
create function public.latspel_ny(p_val text, p_niva text, p_horda bigint[] default '{}') returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_spara boolean;
  v_lat latbibliotek.latar;
  v_fel bigint[];
  v_alla bigint[];
  v_id uuid;
begin
  if p_val is null or p_val not in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno', 'blandat') then
    return jsonb_build_object('fel', 'ogiltig_genre');
  end if;
  if p_niva is null or p_niva not in ('latt', 'svar') then
    return jsonb_build_object('fel', 'ogiltig_niva');
  end if;

  perform latbibliotek.rensa();
  -- Bara konton med visningsnamn sparas, som i quizet.
  v_spara := v_uid is not null and exists (select 1 from public.profiler where id = v_uid);

  -- Ingen låt kommer tillbaka förrän alla i urvalet är spelade.
  select * into v_lat from latbibliotek.latar l
  where latbibliotek.i_poolen(l, p_val, p_niva)
    and case when v_spara
      then not exists (select 1 from latbibliotek.hort h where h.anvandare = v_uid and h.lat_id = l.id)
      else not (l.id = any(coalesce(p_horda, '{}')))
    end
  order by random() limit 1;

  if v_lat.id is null then
    if v_spara then
      delete from latbibliotek.hort h
      using latbibliotek.latar l
      where h.anvandare = v_uid and h.lat_id = l.id and latbibliotek.i_poolen(l, p_val, p_niva);
    end if;
    select * into v_lat from latbibliotek.latar l
    where latbibliotek.i_poolen(l, p_val, p_niva)
    order by random() limit 1;
  end if;
  if v_lat.id is null then
    return jsonb_build_object('fel', 'inga_latar');
  end if;

  -- Tre fel alternativ i samma genre, från tre andra artister. En artist som
  -- är med på rätt låt, som D-Block & S-te-Fan på Ghost Stories, blir aldrig
  -- ett fel alternativ.
  select array_agg(id) into v_fel from (
    select id from (
      select distinct on (c.artist_namn) c.id
      from latbibliotek.latar c
      where c.aktiv and c.trasig is null and c.genre = v_lat.genre
        and c.artist_namn <> v_lat.artist_namn
        and position(lower(c.artist_namn) in lower(v_lat.artist)) = 0
        and position(lower(v_lat.artist_namn) in lower(c.artist)) = 0
        and lower(c.titel) <> lower(v_lat.titel)
      order by c.artist_namn, random()
    ) x
    order by random() limit 3
  ) y;
  if coalesce(cardinality(v_fel), 0) < 3 then
    return jsonb_build_object('fel', 'inga_latar');
  end if;

  select array_agg(i order by random()) into v_alla from unnest(v_fel || v_lat.id) i;

  insert into latbibliotek.omgangar (anvandare, lat_id, lage, val, niva, alternativ)
  values (case when v_spara then v_uid end, v_lat.id, 'fritt', p_val, p_niva, v_alla)
  returning id into v_id;

  return jsonb_build_object(
    'omgang', v_id,
    'sparas', v_spara,
    'klipp', jsonb_build_array(1, 3, 7, 15),
    'alternativ', (
      select jsonb_agg(jsonb_build_object('artist', l.artist, 'titel', l.titel) order by n)
      from unnest(v_alla) with ordinality as a(id, n)
      join latbibliotek.latar l on l.id = a.id
    )
  );
end
$$;

-- Hämtar omgången och kontrollerar att den tillhör den som frågar.
create function latbibliotek.min_omgang(p_omgang uuid) returns latbibliotek.omgangar
language plpgsql stable
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar;
  v_uid uuid := auth.uid();
begin
  select * into v_o from latbibliotek.omgangar where id = p_omgang and lage = 'fritt';
  if v_o.id is null then return null; end if;
  -- En omgång utan konto kan spelas av den som har id:t, en med konto bara
  -- av kontot.
  if v_o.anvandare is not null and v_o.anvandare is distinct from v_uid then return null; end if;
  return v_o;
end
$$;

-- Ljudet lämnas ut här, och klockan startar. Anropas av sidan när ljudet ska
-- börja spela, efter ett tryck.
create function public.latspel_spela(p_omgang uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.min_omgang(p_omgang);
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then
    update latbibliotek.omgangar set steg_tid = now() where id = v_o.id;
  end if;
  return jsonb_build_object(
    'ljud', (select ljud from latbibliotek.latar where id = v_o.lat_id),
    'steg', v_o.steg,
    'sekunder', latbibliotek.klipp(v_o.steg)
  );
end
$$;

-- Nästa klipplängd. Klockan startar om, eftersom klippet spelas från början.
create function public.latspel_langre(p_omgang uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.min_omgang(p_omgang);
  v_steg integer;
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then return jsonb_build_object('fel', 'inte_startad'); end if;
  v_steg := least(v_o.steg + 1, 3);
  update latbibliotek.omgangar set steg = v_steg, steg_tid = now() where id = v_o.id;
  return jsonb_build_object(
    'steg', v_steg,
    'sekunder', latbibliotek.klipp(v_steg),
    'poang', latbibliotek.poang_for(v_steg)
  );
end
$$;

-- Rättar. p_plats är platsen i alternativen, från 0.
create function public.latspel_svara(p_omgang uuid, p_plats integer) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.min_omgang(p_omgang);
  v_lat latbibliotek.latar;
  v_tid numeric;
  v_steg integer;
  v_ratt boolean;
  v_poang integer;
  v_nya jsonb := '[]'::jsonb;
  v_konto jsonb;
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then return jsonb_build_object('fel', 'inte_startad'); end if;
  if p_plats is null or p_plats < 0 or p_plats >= cardinality(v_o.alternativ) then
    return jsonb_build_object('fel', 'ogiltigt_svar');
  end if;

  select * into v_lat from latbibliotek.latar where id = v_o.lat_id;

  -- Har mer tid gått än klippet och svarstiden räcker till, räknas svaret
  -- som på den längre klipplängd som tiden räcker till.
  v_tid := extract(epoch from now() - v_o.steg_tid);
  v_steg := v_o.steg;
  while v_steg < 3 and v_tid > latbibliotek.klipp(v_steg) + latbibliotek.svarstid() loop
    v_steg := v_steg + 1;
  end loop;

  v_ratt := v_o.alternativ[p_plats + 1] = v_o.lat_id;
  v_poang := case when v_ratt then latbibliotek.poang_for(v_steg) else 0 end;

  update latbibliotek.omgangar set
    klar = true, ratt = v_ratt, poang = v_poang, avslutad = now(),
    forsok = jsonb_build_array(jsonb_build_object('plats', p_plats, 'steg', v_o.steg, 'raknat', v_steg, 'sekunder', round(v_tid, 1)))
  where id = v_o.id;

  -- Bibliotekets egen statistik, för svårigheten längre fram.
  update latbibliotek.latar set spelade = spelade + 1, ratt = ratt + v_ratt::integer where id = v_lat.id;

  if v_o.anvandare is not null then
    insert into latbibliotek.hort (anvandare, lat_id) values (v_o.anvandare, v_lat.id)
    on conflict (anvandare, lat_id) do update set hord = now();
    insert into latbibliotek.statistik (anvandare, genre, spelade, ratt)
    values (v_o.anvandare, v_lat.genre, 1, v_ratt::integer)
    on conflict (anvandare, genre) do update set
      spelade = latbibliotek.statistik.spelade + 1,
      ratt = latbibliotek.statistik.ratt + v_ratt::integer;
    insert into latbibliotek.dagar (anvandare, datum, rundor) values (v_o.anvandare, quiz.idag(), 1)
    on conflict (anvandare, datum) do update set rundor = latbibliotek.dagar.rundor + 1;

    begin
      v_nya := latbibliotek.dela_ut(v_o.anvandare, v_lat.genre);
    exception when others then
      raise warning 'Badgeutdelningen i låtspelet misslyckades: %', sqlerrm;
      v_nya := '[]'::jsonb;
    end;

    select jsonb_build_object(
      'genre', v_lat.genre,
      'ratt_genre', coalesce((select ratt from latbibliotek.statistik where anvandare = v_o.anvandare and genre = v_lat.genre), 0),
      'rundor_idag', coalesce((select rundor from latbibliotek.dagar where anvandare = v_o.anvandare and datum = quiz.idag()), 0)
    ) into v_konto;
  end if;

  return jsonb_build_object(
    'ratt', v_ratt,
    'ratt_plats', array_position(v_o.alternativ, v_o.lat_id) - 1,
    'poang', v_poang,
    'sekunder', latbibliotek.klipp(v_steg),
    'lat', jsonb_build_object('id', v_lat.id, 'artist', v_lat.artist, 'titel', v_lat.titel, 'apple', v_lat.apple_lank, 'genre', v_lat.genre),
    'konto', v_konto,
    'nya_badges', v_nya
  );
end
$$;

-- Det sparade för den inloggade: rätt per genre och rundor i dag.
create function public.latspel_min() returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'genrer', coalesce((select jsonb_object_agg(genre, jsonb_build_object('spelade', spelade, 'ratt', ratt))
                        from latbibliotek.statistik where anvandare = auth.uid()), '{}'::jsonb),
    'rundor_idag', coalesce((select rundor from latbibliotek.dagar where anvandare = auth.uid() and datum = quiz.idag()), 0)
  ) end
$$;

/* ---------- rättigheter ---------- */

revoke all on all functions in schema latbibliotek from public, anon, authenticated;
revoke all on function public.latspel_ny(text, text, bigint[]) from public, anon, authenticated;
revoke all on function public.latspel_spela(uuid) from public, anon, authenticated;
revoke all on function public.latspel_langre(uuid) from public, anon, authenticated;
revoke all on function public.latspel_svara(uuid, integer) from public, anon, authenticated;
revoke all on function public.latspel_min() from public, anon, authenticated;
grant execute on function public.latspel_ny(text, text, bigint[]) to anon, authenticated;
grant execute on function public.latspel_spela(uuid) to anon, authenticated;
grant execute on function public.latspel_langre(uuid) to anon, authenticated;
grant execute on function public.latspel_svara(uuid, integer) to anon, authenticated;
grant execute on function public.latspel_min() to authenticated;
