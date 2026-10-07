-- Fritt spel med sökning i stället för flerval.
--
-- Som Dagens låt: sex försök, klipp på 0,5, 1, 2, 4, 8 och 16 sekunder, och
-- Hoppa över. Fel gissning eller Hoppa över ger nästa, längre klipp. Poängen
-- följer försöket låten klaras på: 100, 70, 50, 30, 20 och 10.
--
-- Servern väljer låten, rättar gissningarna och tar tiden. Sidan får aldrig
-- veta svaret innan låten är klar. Förslagen i sökrutan kommer från hela
-- biblioteket, så att listan inte avslöjar något.
--
-- Flervalsfunktionerna från 20261007190000_fritt_spel.sql står kvar orörda.
-- De blir Dagens låt.

/* ---------- popularitet och versioner ---------- */

-- Låtens plats bland låtarna i samma genre, från 0 (mest känd) till 1. Det
-- enda mått biblioteket har är iTunes ordning per artist, och det följer
-- popularitet dåligt. Lika ordning delas upp i en fast ordning efter id.
create function latbibliotek.popularitet() returns table (lat_id bigint, plats double precision)
language sql stable
set search_path = ''
as $$
  select id, cume_dist() over (partition by genre order by coalesce(itunes_ordning, 99), md5(id::text))
  from latbibliotek.latar
  where aktiv and trasig is null
$$;

-- Andelen av genren som ingår på varje svårighet.
create function latbibliotek.niva_andel(p_niva text) returns double precision
language sql immutable
set search_path = ''
as $$ select case p_niva when 'latt' then 0.15 when 'medel' then 0.40 when 'svar' then 0.75 else 1.0 end $$;

-- Titeln utan versionstillägg, så att samma låt som Extended Mix, Radio Edit
-- eller Original Mix räknas som samma låt. Remixer av andra artister är
-- andra låtar och står kvar.
create function latbibliotek.grundtitel(p_titel text) returns text
language sql immutable
set search_path = ''
as $$
  select regexp_replace(
    lower(
      regexp_replace(
        regexp_replace(p_titel,
          '\s*[\(\[]\s*(feat\.?|ft\.?|featuring|with)\s[^\)\]]*[\)\]]', '', 'gi'),
        '\s*(-\s*|[\(\[]\s*)((extended|radio|original|club|pro|short|full|album|single)\s+)?(mix|edit|version|cut|remaster(ed)?)\s*[\)\]]?\s*$', '', 'gi')
    ),
    '[^[:alnum:]]+', '', 'g')
$$;

-- Är gissningen samma låt som svaret? Samma låt-id, eller samma grundtitel
-- av samma artist. Artisten jämförs åt båda håll, eftersom ett samarbete kan
-- ligga under vilken som helst av artisterna.
create function latbibliotek.samma_lat(p_gissning bigint, p_svar bigint) returns boolean
language sql stable
set search_path = ''
as $$
  select p_gissning = p_svar or exists (
    select 1 from latbibliotek.latar g, latbibliotek.latar s
    where g.id = p_gissning and s.id = p_svar
      and latbibliotek.grundtitel(g.titel) = latbibliotek.grundtitel(s.titel)
      and latbibliotek.grundtitel(s.titel) <> ''
      and (g.artist_namn = s.artist_namn
        or position(lower(g.artist_namn) in lower(s.artist)) > 0
        or position(lower(s.artist_namn) in lower(g.artist)) > 0)
  )
$$;

create function latbibliotek.sok_klipp(p_steg integer) returns numeric
language sql immutable
set search_path = ''
as $$ select (array[0.5, 1, 2, 4, 8, 16])[least(greatest(p_steg, 0), 5) + 1]::numeric $$;

create function latbibliotek.sok_poang(p_steg integer) returns integer
language sql immutable
set search_path = ''
as $$ select case when p_steg between 0 and 5 then (array[100, 70, 50, 30, 20, 10])[p_steg + 1] else 0 end $$;

-- Tid att skriva en gissning efter klippet. Mer än i flerval, eftersom man
-- skriver i en sökruta.
create function latbibliotek.sok_svarstid() returns integer
language sql immutable
set search_path = ''
as $$ select 20 $$;

/* ---------- det sajten får anropa ---------- */

-- Förslag till sökrutan, från hela biblioteket. Alla ord måste finnas i
-- artist eller titel.
create function public.latspel_sok(p_text text) returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with ord as (
    select o from regexp_split_to_table(
      lower(translate(coalesce(p_text, ''), 'åäöéèüÅÄÖÉÈÜ', 'aaoeeuaaoeeu')), '[^a-z0-9]+') o
    where o <> ''
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'artist', artist, 'titel', titel) order by artist, titel), '[]'::jsonb)
  from (
    select l.id, l.artist, l.titel
    from latbibliotek.latar l
    where l.aktiv and l.trasig is null
      and exists (select 1 from ord)
      and not exists (select 1 from ord where position(o in l.sok) = 0)
    order by l.artist, l.titel
    limit 8
  ) x
$$;

-- En ny låt. p_niva: latt, medel, svar eller expert. Utan konto skickar sidan
-- med låtarna den redan spelat, eftersom servern inte sparar något om den.
create function public.fritt_ny(p_val text, p_niva text, p_horda bigint[] default '{}') returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_spara boolean;
  v_lat bigint;
  v_id uuid;
begin
  if p_val is null or p_val not in ('hardstyle', 'raw', 'uptempo', 'hardcore', 'techno', 'blandat') then
    return jsonb_build_object('fel', 'ogiltig_genre');
  end if;
  if p_niva is null or p_niva not in ('latt', 'medel', 'svar', 'expert') then
    return jsonb_build_object('fel', 'ogiltig_niva');
  end if;

  perform latbibliotek.rensa();
  v_spara := v_uid is not null and exists (select 1 from public.profiler where id = v_uid);

  -- Urvalet: genren och svårigheten. Ingen låt kommer tillbaka förrän alla i
  -- urvalet är spelade, och sedan börjar det om, så låtarna tar aldrig slut.
  create temporary table if not exists fritt_urval (id bigint) on commit drop;
  truncate fritt_urval;
  insert into fritt_urval
  select l.id from latbibliotek.latar l
  join latbibliotek.popularitet() p on p.lat_id = l.id
  where (p_val = 'blandat' or l.genre = p_val)
    and p.plats <= latbibliotek.niva_andel(p_niva);

  select u.id into v_lat from fritt_urval u
  where case when v_spara
    then not exists (select 1 from latbibliotek.hort h where h.anvandare = v_uid and h.lat_id = u.id)
    else not (u.id = any(coalesce(p_horda, '{}')))
  end
  order by random() limit 1;

  if v_lat is null then
    if v_spara then
      delete from latbibliotek.hort h using fritt_urval u where h.anvandare = v_uid and h.lat_id = u.id;
    end if;
    select u.id into v_lat from fritt_urval u order by random() limit 1;
  end if;
  if v_lat is null then
    return jsonb_build_object('fel', 'inga_latar');
  end if;

  insert into latbibliotek.omgangar (anvandare, lat_id, lage, val, niva)
  values (case when v_spara then v_uid end, v_lat, 'fritt', p_val, p_niva)
  returning id into v_id;

  return jsonb_build_object(
    'omgang', v_id,
    'sparas', v_spara,
    'klipp', jsonb_build_array(0.5, 1, 2, 4, 8, 16),
    'poang', jsonb_build_array(100, 70, 50, 30, 20, 10)
  );
end
$$;

-- En sökomgång som tillhör den som frågar. Flervalets omgångar har
-- alternativ och hör inte hit.
create function latbibliotek.sok_omgang(p_omgang uuid) returns latbibliotek.omgangar
language plpgsql stable
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar;
begin
  select * into v_o from latbibliotek.omgangar
  where id = p_omgang and lage in ('fritt', 'rankat') and alternativ is null;
  if v_o.id is null then return null; end if;
  if v_o.anvandare is not null and v_o.anvandare is distinct from auth.uid() then return null; end if;
  return v_o;
end
$$;

-- Ljudet lämnas ut här, och klockan för klippet startar.
create function public.fritt_spela(p_omgang uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.sok_omgang(p_omgang);
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then
    update latbibliotek.omgangar set steg_tid = now() where id = v_o.id;
  end if;
  return jsonb_build_object(
    'ljud', (select ljud from latbibliotek.latar where id = v_o.lat_id),
    'steg', v_o.steg,
    'sekunder', latbibliotek.sok_klipp(v_o.steg)
  );
end
$$;

-- Avslutar en omgång: sparar statistik och delar ut badges. Gemensam för
-- fritt spel och rankat.
create function latbibliotek.sok_avsluta(p_o latbibliotek.omgangar, p_ratt boolean, p_steg integer)
returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_lat latbibliotek.latar;
  v_poang integer := case when p_ratt then latbibliotek.sok_poang(p_steg) else 0 end;
  v_nya jsonb := '[]'::jsonb;
  v_konto jsonb;
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
  );
end
$$;

-- En gissning. p_lat är låten man valt i sökrutan, null betyder Hoppa över.
-- Har mer tid gått än klippet och skrivtiden räcker till, räknas gissningen
-- på ett senare försök, som om man hoppat över de klipp tiden räckte till.
create function public.fritt_gissa(p_omgang uuid, p_lat bigint) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o latbibliotek.omgangar := latbibliotek.sok_omgang(p_omgang);
  v_tid numeric;
  v_steg integer;
  v_ratt boolean;
  v_forsok jsonb;
  v_namn text;
begin
  if v_o.id is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_o.klar then return jsonb_build_object('fel', 'klar'); end if;
  if v_o.steg_tid is null then return jsonb_build_object('fel', 'inte_startad'); end if;
  if p_lat is not null and not exists (select 1 from latbibliotek.latar where id = p_lat) then
    return jsonb_build_object('fel', 'okand_lat');
  end if;

  v_tid := extract(epoch from now() - v_o.steg_tid);
  v_steg := v_o.steg;
  v_forsok := v_o.forsok;
  while v_steg < 5 and v_tid > latbibliotek.sok_klipp(v_steg) + latbibliotek.sok_svarstid() loop
    v_forsok := v_forsok || jsonb_build_array(jsonb_build_object('t', 'tid'));
    v_steg := v_steg + 1;
  end loop;

  v_ratt := p_lat is not null and latbibliotek.samma_lat(p_lat, v_o.lat_id);
  select artist || ' — ' || titel into v_namn from latbibliotek.latar where id = p_lat;
  v_forsok := v_forsok || jsonb_build_array(jsonb_build_object(
    't', case when p_lat is null then 'hopp' when v_ratt then 'ratt' else 'fel' end,
    'namn', v_namn));

  update latbibliotek.omgangar set forsok = v_forsok where id = v_o.id;

  if v_ratt then
    return latbibliotek.sok_avsluta(v_o, true, v_steg) || jsonb_build_object('forsok', v_forsok);
  end if;
  if v_steg >= 5 then
    return latbibliotek.sok_avsluta(v_o, false, v_steg) || jsonb_build_object('forsok', v_forsok);
  end if;

  update latbibliotek.omgangar set steg = v_steg + 1, steg_tid = now() where id = v_o.id;
  return jsonb_build_object(
    'klar', false,
    'ratt', false,
    'steg', v_steg + 1,
    'sekunder', latbibliotek.sok_klipp(v_steg + 1),
    'forsok', v_forsok
  );
end
$$;

/* ---------- rättigheter ---------- */

revoke all on all functions in schema latbibliotek from public, anon, authenticated;
revoke all on function public.latspel_sok(text) from public, anon, authenticated;
revoke all on function public.fritt_ny(text, text, bigint[]) from public, anon, authenticated;
revoke all on function public.fritt_spela(uuid) from public, anon, authenticated;
revoke all on function public.fritt_gissa(uuid, bigint) from public, anon, authenticated;
grant execute on function public.latspel_sok(text) to anon, authenticated;
grant execute on function public.fritt_ny(text, text, bigint[]) to anon, authenticated;
grant execute on function public.fritt_spela(uuid) to anon, authenticated;
grant execute on function public.fritt_gissa(uuid, bigint) to anon, authenticated;
