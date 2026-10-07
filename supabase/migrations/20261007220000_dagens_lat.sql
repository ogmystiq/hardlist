-- Dagens låt blir flerval, och avgörs på servern.
--
-- Samma låt och samma fyra alternativ för alla, ny varje dygn vid midnatt
-- svensk tid, som dagens fråga. Ingen låt blir dagens låt två gånger förrän
-- alla i urvalet har varit det. Ett försök per konto och dag.
--
-- Klippen är 0,5, 1, 3, 7 och 15 sekunder. Sidan får ljudet först när
-- klockan startar och får aldrig veta vilket alternativ som är rätt förrän
-- den har svarat. Halv sekund och Radar räknas på rätt svar på första klippet.
--
-- Utmaningen mot en kompis ligger kvar i sidan som förut.

alter table latbibliotek.omgangar drop constraint omgangar_lage_check;
alter table latbibliotek.omgangar add constraint omgangar_lage_check
  check (lage in ('fritt', 'rankat', 'duell', 'dag'));

/* ---------- dagens låt ---------- */

create table latbibliotek.dagens (
  datum date primary key,
  lat_id bigint not null references latbibliotek.latar (id),
  -- De fyra alternativen i den ordning alla ser dem.
  alternativ bigint[] not null,
  skapad timestamptz not null default now()
);

-- Ett försök per konto och dag. Omgången följer med, så att den som laddar
-- om sidan fortsätter där den var.
create table latbibliotek.dag_forsok (
  anvandare uuid not null references auth.users (id) on delete cascade,
  datum date not null,
  omgang uuid not null references latbibliotek.omgangar (id) on delete cascade,
  primary key (anvandare, datum)
);

alter table latbibliotek.dagens enable row level security;
alter table latbibliotek.dag_forsok enable row level security;
revoke all on table latbibliotek.dagens from public, anon, authenticated;
revoke all on table latbibliotek.dag_forsok from public, anon, authenticated;

insert into profil.katalog (id, niva, hemlig, kommer) values
  ('halv', 3, false, false),
  ('tio', 4, false, false)
on conflict (id) do update set kommer = excluded.kommer;

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

create function latbibliotek.dag_klipp(p_steg integer) returns numeric
language sql immutable
set search_path = ''
as $$ select (array[0.5, 1, 3, 7, 15])[least(greatest(p_steg, 0), 4) + 1]::numeric $$;

create function latbibliotek.dag_poang(p_steg integer) returns integer
language sql immutable
set search_path = ''
as $$ select (array[100, 70, 40, 20, 10])[least(greatest(p_steg, 0), 4) + 1] $$;

-- Väljer dagens låt första gången någon frågar efter den och sparar valet.
-- Urvalet är de 40 procent mest kända låtarna, så att dagens låt går att
-- känna igen för fler än de som kan allt.
create function latbibliotek.dagens_rad() returns latbibliotek.dagens
language plpgsql volatile
set search_path = ''
as $$
declare
  v_datum date := quiz.idag();
  v_rad latbibliotek.dagens;
  v_lat latbibliotek.latar;
  v_fel bigint[];
  v_alla bigint[];
begin
  select * into v_rad from latbibliotek.dagens where datum = v_datum;
  if found then return v_rad; end if;

  select l.* into v_lat from latbibliotek.latar l
  join latbibliotek.popularitet() p on p.lat_id = l.id
  where p.plats <= 0.40
  order by (select count(*) from latbibliotek.dagens d where d.lat_id = l.id), random()
  limit 1;
  if v_lat.id is null then return null; end if;

  -- Tre fel alternativ, som i flervalet i fritt spel.
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
  select array_agg(i order by random()) into v_alla from unnest(v_fel || v_lat.id) i;

  -- Två besökare exakt samtidigt vid midnatt: den som hinner först vinner.
  insert into latbibliotek.dagens (datum, lat_id, alternativ) values (v_datum, v_lat.id, v_alla)
  on conflict (datum) do nothing;
  select * into v_rad from latbibliotek.dagens where datum = v_datum;
  return v_rad;
end
$$;

create function latbibliotek.dag_omgang(p_omgang uuid) returns latbibliotek.omgangar
language plpgsql stable
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar;
begin
  select * into v_o from latbibliotek.omgangar where id = p_omgang and lage = 'dag';
  if v_o.id is null then return null; end if;
  if v_o.anvandare is not null and v_o.anvandare is distinct from auth.uid() then return null; end if;
  return v_o;
end
$$;

-- Det som visas efter svaret. Läggs bara till när omgången är klar.
create function latbibliotek.dag_facit(p_o latbibliotek.omgangar) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ratt', p_o.ratt,
    'ratt_plats', array_position(p_o.alternativ, p_o.lat_id) - 1,
    'valde', (p_o.forsok->0->>'plats')::integer,
    'poang', p_o.poang,
    'sekunder', latbibliotek.dag_klipp(coalesce((p_o.forsok->0->>'raknat')::integer, p_o.steg)),
    'lat', jsonb_build_object('artist', l.artist, 'titel', l.titel, 'apple', l.apple_lank, 'ljud', l.ljud)
  )
  from latbibliotek.latar l where l.id = p_o.lat_id
$$;

-- Kontots siffror för dagens låt.
create function latbibliotek.dag_konto(p_anvandare uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'spelade', count(*) filter (where o.klar),
    'ratt', count(*) filter (where o.ratt),
    'forsta_klippet', count(*) filter (where o.ratt and (o.forsok->0->>'raknat')::integer = 0)
  )
  from latbibliotek.dag_forsok f
  join latbibliotek.omgangar o on o.id = f.omgang
  where f.anvandare = p_anvandare
$$;

/* ---------- det sajten får anropa ---------- */

-- Dagens låt. Inloggad med visningsnamn: samma omgång hela dagen, och är den
-- klar följer facit med. Utan konto: en ny omgång, och sidan minns själv
-- att dagen är spelad.
create function public.dag_lat() returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_spara boolean;
  v_dag latbibliotek.dagens := latbibliotek.dagens_rad();
  v_o latbibliotek.omgangar;
  v_id uuid;
begin
  if v_dag.datum is null then return jsonb_build_object('fel', 'inga_latar'); end if;
  perform latbibliotek.rensa();
  v_spara := v_uid is not null and exists (select 1 from public.profiler where id = v_uid);

  if v_spara then
    select o.* into v_o from latbibliotek.dag_forsok f
    join latbibliotek.omgangar o on o.id = f.omgang
    where f.anvandare = v_uid and f.datum = v_dag.datum;
  end if;

  if v_o.id is null then
    insert into latbibliotek.omgangar (anvandare, lat_id, lage, alternativ)
    values (case when v_spara then v_uid end, v_dag.lat_id, 'dag', v_dag.alternativ)
    returning * into v_o;
    if v_spara then
      insert into latbibliotek.dag_forsok (anvandare, datum, omgang) values (v_uid, v_dag.datum, v_o.id)
      on conflict (anvandare, datum) do nothing;
      -- Två flikar samtidigt: den som hann först gäller.
      select o.* into v_o from latbibliotek.dag_forsok f
      join latbibliotek.omgangar o on o.id = f.omgang
      where f.anvandare = v_uid and f.datum = v_dag.datum;
    end if;
  end if;

  return jsonb_build_object(
    'datum', v_dag.datum,
    'omgang', v_o.id,
    'sparas', v_spara,
    'klipp', jsonb_build_array(0.5, 1, 3, 7, 15),
    'poang', jsonb_build_array(100, 70, 40, 20, 10),
    'steg', v_o.steg,
    'startad', v_o.steg_tid is not null,
    'klar', v_o.klar,
    'alternativ', (
      select jsonb_agg(jsonb_build_object('artist', l.artist, 'titel', l.titel) order by n)
      from unnest(v_o.alternativ) with ordinality as a(id, n)
      join latbibliotek.latar l on l.id = a.id
    )
  ) || case when v_o.klar then jsonb_build_object('facit', latbibliotek.dag_facit(v_o)) else '{}'::jsonb end
    || case when v_spara then jsonb_build_object('konto', latbibliotek.dag_konto(v_uid)) else '{}'::jsonb end;
end
$$;

create function public.dag_spela(p_omgang uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.dag_omgang(p_omgang);
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then
    update latbibliotek.omgangar set steg_tid = now() where id = v_o.id;
  end if;
  return jsonb_build_object(
    'ljud', (select ljud from latbibliotek.latar where id = v_o.lat_id),
    'steg', v_o.steg,
    'sekunder', latbibliotek.dag_klipp(v_o.steg)
  );
end
$$;

create function public.dag_langre(p_omgang uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.dag_omgang(p_omgang);
  v_steg integer;
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then return jsonb_build_object('fel', 'inte_startad'); end if;
  v_steg := least(v_o.steg + 1, 4);
  update latbibliotek.omgangar set steg = v_steg, steg_tid = now() where id = v_o.id;
  return jsonb_build_object('steg', v_steg, 'sekunder', latbibliotek.dag_klipp(v_steg), 'poang', latbibliotek.dag_poang(v_steg));
end
$$;

-- Rättar. Har mer tid gått än klippet och svarstiden räcker till, räknas
-- svaret på den längre klipplängd tiden räcker till, som i fritt spel.
create function public.dag_svara(p_omgang uuid, p_plats integer) returns jsonb
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
  end if;

  v_ut := latbibliotek.dag_facit(v_o) || jsonb_build_object('nya_badges', v_nya);
  if v_o.anvandare is not null then
    v_ut := v_ut || jsonb_build_object('konto', latbibliotek.dag_konto(v_o.anvandare));
  end if;
  return v_ut;
end
$$;

/* ---------- rättigheter ---------- */

revoke all on all functions in schema latbibliotek from public, anon, authenticated;
revoke all on function public.dag_lat() from public, anon, authenticated;
revoke all on function public.dag_spela(uuid) from public, anon, authenticated;
revoke all on function public.dag_langre(uuid) from public, anon, authenticated;
revoke all on function public.dag_svara(uuid, integer) from public, anon, authenticated;
grant execute on function public.dag_lat() to anon, authenticated;
grant execute on function public.dag_spela(uuid) to anon, authenticated;
grant execute on function public.dag_langre(uuid) to anon, authenticated;
grant execute on function public.dag_svara(uuid, integer) to anon, authenticated;
