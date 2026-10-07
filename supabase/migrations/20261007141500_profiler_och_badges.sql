-- Profiler och badges.
--
-- Samma mönster som quizet: tabellerna ligger i schemat profil, som API:t inte
-- exponerar, och sajten når dem bara genom security definer-funktionerna i
-- public längst ner. Servern delar ut alla badges, så att ingen kan dela ut en
-- till sig själv från webbläsaren.
--
-- Migrationen lägger bara till. quiz_svara och quiz_topplista får nya fält,
-- men allt de returnerade förut finns kvar, och badgedelen ligger i egna
-- exception-block: kraschar den räknas svaret och topplistan som förut.

create schema profil;

-- Schemat står inte i [api] schemas i config.toml och ska aldrig göra det.
-- Rättigheterna nollas ändå, som för quiz.
revoke all on schema profil from public, anon, authenticated;

/* ---------- katalogen ---------- */

-- Samma id:n som i /badges.js. kontrollera.mjs jämför listorna.
-- niva: 1 vanlig, 2 ovanlig, 3 sällsynt, 4 extremt sällsynt. Används för att
-- välja badgen vid namnet när man inte valt själv.
create table profil.katalog (
  id text primary key,
  niva smallint not null check (niva between 1 and 4),
  hemlig boolean not null default false,
  -- Hör till låtspelet, som inte sparar resultat än. Delas inte ut.
  kommer boolean not null default false
);

insert into profil.katalog (id, niva, hemlig, kommer) values
  ('forsta', 1, false, false),
  ('afterparty', 1, false, false),
  ('v7', 2, false, false),
  ('fredag', 2, false, false),
  ('fredagsfeber', 2, false, false),
  ('hundra', 2, false, false),
  ('v30', 3, false, false),
  ('perfekt', 3, false, false),
  ('blixt', 3, false, false),
  ('speedcore', 3, false, false),
  ('bpm200', 3, false, false),
  ('aterfodd', 3, false, false),
  ('v100', 4, false, false),
  ('v365', 4, false, false),
  ('gehor', 4, false, false),
  ('topp10', 2, false, false),
  ('pallen', 3, false, false),
  ('etta', 4, false, false),
  ('dynasti', 4, false, false),
  ('veteran', 4, false, false),
  ('legend', 4, false, false),
  ('halv', 3, false, true),
  ('maraton', 2, false, true),
  ('duell', 2, false, true),
  ('anthem', 3, false, true),
  ('tio', 4, false, true),
  ('obesegrad', 4, false, true),
  ('g-hardstyle', 3, false, true),
  ('g-raw', 3, false, true),
  ('g-uptempo', 3, false, true),
  ('g-hardcore', 3, false, true),
  ('g-techno', 3, false, true),
  ('scenen', 4, false, true),
  ('start', 1, false, false),
  ('ansikte', 1, false, false),
  ('tipsaren', 2, false, false),
  ('faktakollen', 2, false, false),
  ('midnatt', 3, true, false),
  ('paskagg', 4, true, false);

/* ---------- tagna badges ---------- */

create table profil.badges (
  anvandare uuid not null references auth.users (id) on delete cascade,
  badge text not null references profil.katalog (id),
  tagen timestamptz not null default now(),
  -- false tills popupen har visats. Bakåtutdelade får false, så att de som
  -- redan spelar får popupen vid nästa besök.
  sedd boolean not null default false,
  primary key (anvandare, badge)
);

create index badges_badge on profil.badges (badge);

/* ---------- månadsplaceringar ---------- */

-- En ögonblicksbild när månaden är slut, så att Residenten och Veteranen kan
-- räknas på flera månader bakåt.
create table profil.manader (
  manad date not null,
  anvandare uuid not null references auth.users (id) on delete cascade,
  plats integer not null,
  poang integer not null,
  primary key (manad, anvandare)
);

-- Vilka månader som har fått sin ögonblicksbild. Egen tabell, så att en månad
-- utan en enda spelare inte räknas om varje natt.
create table profil.manad_klar (
  manad date primary key,
  skapad timestamptz not null default now()
);

/* ---------- profilbild och badge vid namnet ---------- */

-- Egen tabell i stället för kolumner i public.profiler. Den tabellen går att
-- läsa för sin egen rad via API:t, och sökvägen till en dold bild ska inte gå
-- att läsa alls.
create table profil.installningar (
  anvandare uuid primary key references auth.users (id) on delete cascade,
  bild text,
  -- synlig, dold efter rapport, eller godkänd av Jonte. Godkänd döljs inte av
  -- nya rapporter.
  bild_status text check (bild_status in ('synlig', 'dold', 'godkand')),
  -- null: automatiskt, den sällsyntaste man har. 'ingen': bortvald.
  badge text,
  andrad timestamptz not null default now()
);

create table profil.bildrapporter (
  agare uuid not null references auth.users (id) on delete cascade,
  rapportor uuid not null references auth.users (id) on delete cascade,
  sokvag text not null,
  skapad timestamptz not null default now(),
  primary key (agare, rapportor, sokvag)
);

alter table profil.katalog enable row level security;
alter table profil.badges enable row level security;
alter table profil.manader enable row level security;
alter table profil.manad_klar enable row level security;
alter table profil.installningar enable row level security;
alter table profil.bildrapporter enable row level security;
revoke all on all tables in schema profil from public, anon, authenticated;

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

-- Bucketen är publik, så adressen går att bygga utan anrop.
create function profil.bild_url(p_sokvag text) returns text
language sql immutable
set search_path = ''
as $$
  select case when p_sokvag is null then null
    else 'https://oxblifknwwtehiscukeu.supabase.co/storage/v1/object/public/profilbilder/' || p_sokvag end
$$;

-- Bilden som andra får se: ingen alls när den är dold efter en rapport.
create function profil.synlig_bild(p_anvandare uuid) returns text
language sql stable
set search_path = ''
as $$
  select profil.bild_url(i.bild)
  from profil.installningar i
  where i.anvandare = p_anvandare and i.bild is not null
    and i.bild_status in ('synlig', 'godkand')
$$;

-- Badgen vid namnet. Vald och tagen: den. 'ingen': ingen. Annars den
-- sällsyntaste man har, efter nivå och sedan hur få som har den, och den
-- senast tagna vid lika.
create function profil.vid_namnet(p_anvandare uuid) returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_val text;
  v_id text;
begin
  select badge into v_val from profil.installningar where anvandare = p_anvandare;
  if v_val = 'ingen' then return null; end if;
  if v_val is not null and exists (
    select 1 from profil.badges where anvandare = p_anvandare and badge = v_val
  ) then
    return v_val;
  end if;

  select b.badge into v_id
  from profil.badges b
  join profil.katalog k on k.id = b.badge
  where b.anvandare = p_anvandare
  order by k.niva desc,
    (select count(*) from profil.badges x where x.badge = b.badge),
    b.tagen desc
  limit 1;
  return v_id;
end
$$;

-- Delar ut en badge. Sant bara när den är ny.
create function profil.ge(p_anvandare uuid, p_badge text, p_tagen timestamptz, p_sedd boolean)
returns boolean
language plpgsql volatile
set search_path = ''
as $$
begin
  insert into profil.badges (anvandare, badge, tagen, sedd)
  values (p_anvandare, p_badge, coalesce(p_tagen, now()), p_sedd)
  on conflict (anvandare, badge) do nothing;
  return found;
end
$$;

-- Ingen annan har den. Räknas efter utdelningen, så den nya står själv.
create function profil.forst(p_badge text) returns boolean
language sql stable
set search_path = ''
as $$ select count(*) = 1 from profil.badges where badge = p_badge $$;

-- Rangskalan i quiz.rang, med gränserna utskrivna så att profilen kan visa
-- nästa rang och hur långt det är kvar. Ändras quiz.rang ska den ändras här.
create function profil.rang_json(p_poang integer) returns jsonb
language sql immutable
set search_path = ''
as $$
  with skala(namn, grans) as (values
    ('Nybörjare', 0), ('Raver', 50), ('Frontrow', 200), ('Hardhead', 500),
    ('Hakker', 1200), ('Gabber', 2500), ('Oldschool', 5000), ('Legend', 10000)
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

-- Platsen i innevarande månad, räknad som månadens topplista i
-- quiz_topplista: rank() på poängen, bara konton med namn och fler än 0 poäng.
create function profil.manadsplats(p_anvandare uuid) returns integer
language sql stable
set search_path = ''
as $$
  with summor as (
    select s.anvandare, sum(s.plus) as summa
    from quiz.svar s
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

-- Fredagar i rad med rätt på låtfrågan, räknat bakåt från senaste fredagen.
-- Är det fredag idag och dagens låtfråga inte besvarad än, räknas från förra.
create function profil.fredagar_i_rad(p_anvandare uuid) returns integer
language plpgsql stable
set search_path = ''
as $$
declare
  v_dag date := quiz.idag();
  v_fredag date;
  v_antal integer := 0;
begin
  v_fredag := v_dag - ((extract(isodow from v_dag)::integer - 5 + 7) % 7);
  if v_fredag = v_dag and not exists (
    select 1 from quiz.svar where anvandare = p_anvandare and datum = v_dag
  ) then
    v_fredag := v_fredag - 7;
  end if;
  while exists (
    select 1 from quiz.svar s join quiz.fragor f on f.id = s.fraga_id
    where s.anvandare = p_anvandare and s.datum = v_fredag and s.ratt and f.musik
  ) loop
    v_antal := v_antal + 1;
    v_fredag := v_fredag - 7;
  end loop;
  return v_antal;
end
$$;

-- Månader i rad, bakåt från senaste färdiga månaden, med plats högst p_plats.
create function profil.manader_i_rad(p_anvandare uuid, p_plats integer) returns integer
language plpgsql stable
set search_path = ''
as $$
declare
  v_manad date;
  v_antal integer := 0;
begin
  select max(manad) into v_manad from profil.manad_klar;
  while v_manad is not null and exists (
    select 1 from profil.manader
    where manad = v_manad and anvandare = p_anvandare and plats <= p_plats
  ) loop
    v_antal := v_antal + 1;
    v_manad := (v_manad - interval '1 month')::date;
  end loop;
  return v_antal;
end
$$;

-- Hela profilen. p_tittare är den som tittar, null för utloggad.
create function profil.profil_json(p_anvandare uuid, p_tittare uuid) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_profil public.profiler;
  v_konto quiz.konton;
  v_inst profil.installningar;
  v_svit integer;
  v_poang integer;
  v_spelare integer;
begin
  select * into v_profil from public.profiler where id = p_anvandare;
  if not found then return null; end if;
  select * into v_konto from quiz.konton where anvandare = p_anvandare;
  select * into v_inst from profil.installningar where anvandare = p_anvandare;

  v_poang := coalesce(v_konto.poang, 0);
  -- Som i quiz.konto_json: en missad dag bryter sviten även om inget svar
  -- sparats sedan dess.
  v_svit := case when v_konto.senast >= quiz.idag() - 1 then v_konto.svit else 0 end;
  v_spelare := (select count(*) from public.profiler);

  return jsonb_build_object(
    'namn', v_profil.visningsnamn,
    'bild', profil.synlig_bild(p_anvandare),
    'badge', profil.vid_namnet(p_anvandare),
    'poang', v_poang,
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

/* ---------- utdelning vid svar på dagens fråga ---------- */

-- Anropas av quiz_svara direkt efter quiz.registrera, i samma transaktion.
-- Returnerar de nya som [{ id, forst }]. De markeras som sedda direkt,
-- eftersom sidan visar dem i svaret.
create function profil.dela_ut_svar(p_anvandare uuid, p_datum date, p_basta_fore integer)
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

  if v_k.poang >= 10000 then v_ids := array_append(v_ids, 'legend'::text); end if;

  foreach v_id in array v_ids loop
    if profil.ge(p_anvandare, v_id, v_s.svarad, true) then
      v_ut := v_ut || jsonb_build_array(jsonb_build_object('id', v_id, 'forst', profil.forst(v_id)));
    end if;
  end loop;
  return v_ut;
end
$$;

/* ---------- när profilen skapas ---------- */

-- Från dag ett: profilen skapad före 1 november 2026, svensk tid. Får aldrig
-- stoppa att profilen skapas, därför exception-blocket.
create function profil.ny_profil() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.skapad < timestamptz '2026-11-01 00:00:00 Europe/Stockholm' then
      perform profil.ge(new.id, 'start', new.skapad, false);
    end if;
  exception when others then
    raise warning 'Badgen start kunde inte delas ut: %', sqlerrm;
  end;
  return new;
end
$$;

create trigger ny_profil_badge
  after insert on public.profiler
  for each row execute function profil.ny_profil();

/* ---------- när månaden är slut ---------- */

-- Körs varje natt strax efter midnatt. pg_cron går i UTC och sommartiden
-- flyttar midnatt, därför varje natt i stället för en gång i månaden. Saknar
-- förra månaden en ögonblicksbild skapas den och badges delas ut.
create function profil.manadsjobb() returns text
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
  select v_manad, anvandare, rank() over (order by summa desc), summa
  from (
    select s.anvandare, sum(s.plus)::integer as summa
    from quiz.svar s
    join public.profiler p on p.id = s.anvandare
    where s.datum >= v_manad and s.datum < (v_manad + interval '1 month')::date
    group by s.anvandare
  ) x
  where summa > 0;

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

select cron.schedule('hardlist-manadsbadges', '10 22,23 * * *', $$select profil.manadsjobb()$$);

/* ---------- för hand, av Jonte i SQL Editor ---------- */

-- select profil.dela_ut('nattraver', 'faktakollen');
create function profil.dela_ut(p_namn text, p_badge text) returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiler where lower(visningsnamn) = lower(p_namn);
  if v_id is null then raise exception 'Ingen profil heter %', p_namn; end if;
  if not exists (select 1 from profil.katalog where id = p_badge and not kommer) then
    raise exception 'Ingen badge med id %', p_badge;
  end if;
  if profil.ge(v_id, p_badge, now(), false) then
    return p_namn || ' fick ' || p_badge || '. Popupen visas vid nästa besök.';
  end if;
  return p_namn || ' hade redan ' || p_badge || '.';
end
$$;

-- Rapporterade bilder, för granskningen.
create view profil.rapporterade_bilder as
  select p.visningsnamn as namn, i.bild_status as status,
    profil.bild_url(i.bild) as lank,
    count(r.*) as rapporter, max(r.skapad) as senast
  from profil.bildrapporter r
  join profil.installningar i on i.anvandare = r.agare and i.bild = r.sokvag
  join public.profiler p on p.id = r.agare
  group by p.visningsnamn, i.bild_status, i.bild
  order by max(r.skapad) desc;

revoke all on profil.rapporterade_bilder from public, anon, authenticated;

-- Bilden syns igen, och nya rapporter döljer den inte.
create function profil.godkann_bild(p_namn text) returns text
language plpgsql volatile
set search_path = ''
as $$
begin
  update profil.installningar i set bild_status = 'godkand', andrad = now()
  from public.profiler p
  where p.id = i.anvandare and lower(p.visningsnamn) = lower(p_namn) and i.bild is not null;
  if not found then raise exception 'Ingen bild för %', p_namn; end if;
  return 'Bilden för ' || p_namn || ' är godkänd.';
end
$$;

-- Profilen blir utan bild direkt. Filen går inte att radera från SQL, Storage
-- spärrar det, så funktionen lämnar ut sökvägen att ta bort i Storage.
create function profil.ta_bort_bild(p_namn text) returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_id uuid;
  v_bild text;
begin
  select id into v_id from public.profiler where lower(visningsnamn) = lower(p_namn);
  select bild into v_bild from profil.installningar where anvandare = v_id;
  if v_bild is null then raise exception 'Ingen bild för %', p_namn; end if;
  update profil.installningar set bild = null, bild_status = null, andrad = now()
  where anvandare = v_id;
  return 'Bilden är borttagen från profilen. Radera filen i Storage, bucketen profilbilder: ' || v_bild;
end
$$;

/* ---------- det sajten får anropa ---------- */

-- Den offentliga profilen. Null när namnet inte finns.
create function public.profil_visa(p_namn text) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiler where lower(visningsnamn) = lower(p_namn);
  if v_id is null then return null; end if;
  return profil.profil_json(v_id, auth.uid());
end
$$;

-- Samma för den inloggade, plus det bara ägaren ska veta.
create function public.profil_min() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inst profil.installningar;
begin
  if v_uid is null then return jsonb_build_object('fel', 'inte_inloggad'); end if;
  if not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'visningsnamn_saknas');
  end if;
  select * into v_inst from profil.installningar where anvandare = v_uid;
  return profil.profil_json(v_uid, v_uid) || jsonb_build_object(
    'bild_egen', profil.bild_url(v_inst.bild),
    'bild_dold', coalesce(v_inst.bild_status = 'dold', false),
    'badge_val', v_inst.badge
  );
end
$$;

-- null: automatiskt. 'ingen': ingen badge. Annars måste den vara tagen.
create function public.profil_valj_badge(p_id text) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'inte_inloggad');
  end if;
  if p_id is not null and p_id <> 'ingen' and not exists (
    select 1 from profil.badges where anvandare = v_uid and badge = p_id
  ) then
    return jsonb_build_object('fel', 'inte_tagen');
  end if;
  insert into profil.installningar (anvandare, badge) values (v_uid, p_id)
  on conflict (anvandare) do update set badge = excluded.badge, andrad = now();
  return jsonb_build_object('badge', profil.vid_namnet(v_uid), 'badge_val', p_id);
end
$$;

-- Sparas efter att sidan laddat upp filen till Storage. Servern kontrollerar
-- att filen finns och ligger i den egna mappen. Svaret innehåller den gamla
-- bilden, som sidan sedan tar bort.
create function public.profil_satt_bild(p_sokvag text) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_gammal text;
  v_nya jsonb := '[]'::jsonb;
begin
  if v_uid is null or not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'inte_inloggad');
  end if;
  if p_sokvag is null or p_sokvag !~ ('^' || v_uid::text || '/[0-9]+\.(webp|jpg)$')
     or not exists (select 1 from storage.objects where bucket_id = 'profilbilder' and name = p_sokvag) then
    return jsonb_build_object('fel', 'ogiltig_bild');
  end if;

  select bild into v_gammal from profil.installningar where anvandare = v_uid;
  insert into profil.installningar (anvandare, bild, bild_status)
  values (v_uid, p_sokvag, 'synlig')
  on conflict (anvandare) do update set bild = excluded.bild, bild_status = 'synlig', andrad = now();

  if profil.ge(v_uid, 'ansikte', now(), true) then
    v_nya := jsonb_build_array(jsonb_build_object('id', 'ansikte', 'forst', profil.forst('ansikte')));
  end if;

  return jsonb_build_object(
    'bild', profil.bild_url(p_sokvag),
    'gammal', case when v_gammal is distinct from p_sokvag then v_gammal end,
    'nya_badges', v_nya
  );
end
$$;

-- En rapport per person och bild. Döljer bilden direkt om Jonte inte redan
-- har godkänt den.
create function public.profil_rapportera_bild(p_namn text) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_agare uuid;
  v_bild text;
begin
  if v_uid is null or not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'inte_inloggad');
  end if;
  select id into v_agare from public.profiler where lower(visningsnamn) = lower(p_namn);
  if v_agare is null then return jsonb_build_object('fel', 'finns_inte'); end if;
  if v_agare = v_uid then return jsonb_build_object('fel', 'egen'); end if;
  select bild into v_bild from profil.installningar where anvandare = v_agare;
  if v_bild is null then return jsonb_build_object('fel', 'ingen_bild'); end if;

  insert into profil.bildrapporter (agare, rapportor, sokvag) values (v_agare, v_uid, v_bild)
  on conflict do nothing;
  update profil.installningar set bild_status = 'dold', andrad = now()
  where anvandare = v_agare and bild_status = 'synlig';
  return jsonb_build_object('rapporterad', true);
end
$$;

-- Badges som popupen inte har visat än.
create function public.profil_osedda() returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.badge, 'forst', profil.forst(b.badge)) order by b.tagen), '[]'::jsonb)
  from profil.badges b
  where b.anvandare = auth.uid() and not b.sedd
$$;

create function public.profil_sedda(p_ids text[]) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return jsonb_build_object('fel', 'inte_inloggad'); end if;
  update profil.badges set sedd = true
  where anvandare = auth.uid() and badge = any(p_ids);
  return jsonb_build_object('ok', true);
end
$$;

/* ---------- quiz_svara: samma som förut, plus nya_badges ---------- */

-- Allt utom de två exception-blocken är som i
-- 20261006230000_quiz_kraver_visningsnamn.sql.
create or replace function public.quiz_svara(p_datum date, p_plats integer) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_dag quiz.dagar := quiz.dagens_rad();
  v_ratt_index smallint;
  v_ratt boolean;
  v_hamtad timestamptz;
  v_for_sent boolean;
  v_ny boolean := false;
  v_basta_fore integer;
  v_nya jsonb := '[]'::jsonb;
begin
  if v_dag.datum is null then
    return jsonb_build_object('fel', 'ingen_fraga');
  end if;
  if p_datum is distinct from v_dag.datum then
    return jsonb_build_object('fel', 'ny_dag');
  end if;
  if p_plats is null or p_plats < 0 or p_plats >= cardinality(v_dag.ordning) then
    return jsonb_build_object('fel', 'ogiltigt_svar');
  end if;

  -- Före rättningen, så att ett konto utan namn inte ens får veta om svaret
  -- var rätt.
  if v_uid is not null and not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'visningsnamn_saknas');
  end if;

  select ratt into v_ratt_index from quiz.fragor where id = v_dag.fraga_id;
  v_ratt := v_dag.ordning[p_plats + 1] = v_ratt_index;

  -- Utloggad: bara rättning och facit. Inga poäng räknas utan konto.
  if v_uid is null then
    return jsonb_build_object('svar', jsonb_build_object(
      'valde', p_plats, 'ratt', v_ratt, 'tid_ute', false
    ) || quiz.facit_json(v_dag));
  end if;

  if not exists (select 1 from quiz.svar where anvandare = v_uid and datum = v_dag.datum) then
    select hamtad into v_hamtad from quiz.hamtningar
    where anvandare = v_uid and datum = v_dag.datum;
    -- Den som aldrig hämtat frågan har ingen starttid att räkna från. Sidan
    -- hämtar alltid först, så det här är bara direktanrop mot API:t.
    if v_hamtad is null then
      return jsonb_build_object('fel', 'inte_startad');
    end if;

    -- Återfödd behöver bästa sviten före svaret.
    begin
      select basta into v_basta_fore from quiz.konton where anvandare = v_uid;
    exception when others then
      v_basta_fore := 0;
    end;

    v_for_sent := now() > v_hamtad + interval '30 seconds';
    v_ny := quiz.registrera(
      v_uid, v_dag,
      case when v_for_sent then null else p_plats::smallint end,
      v_ratt and not v_for_sent
    );

    -- Badges får aldrig stoppa ett svar. Kraschar utdelningen rullas bara
    -- den tillbaka, och svaret räknas som vanligt.
    if v_ny then
      begin
        v_nya := profil.dela_ut_svar(v_uid, v_dag.datum, coalesce(v_basta_fore, 0));
      exception when others then
        raise warning 'Badgeutdelningen misslyckades: %', sqlerrm;
        v_nya := '[]'::jsonb;
      end;
    end if;
  end if;

  -- Redan besvarad dag ger samma svar som första gången, inget nytt sparas.
  return jsonb_build_object(
    'svar', quiz.svar_json(v_uid, v_dag),
    'konto', quiz.konto_json(v_uid),
    'nya_badges', v_nya
  );
end
$$;

/* ---------- quiz_topplista: samma som förut, plus bild och badge ---------- */

-- Topplistan med bild och badge vid namnet på varje rad. Annars samma fråga
-- som quiz_topplista i 20261006220000_quiz_pa_servern.sql.
create function profil.topplista(p_uid uuid) returns jsonb
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
        select k.anvandare, k.poang as summa, k.poang as total
        from quiz.konton k
        where v_period = 'total'
        union all
        select s.anvandare, sum(s.plus)::integer, k.poang
        from quiz.svar s
        join quiz.konton k on k.anvandare = s.anvandare
        where v_period = 'manad' and s.datum >= v_manad
        group by s.anvandare, k.poang
      ),
      rankad as (
        select p.anvandare, pr.visningsnamn, p.summa, p.total,
          rank() over (order by p.summa desc) as plats,
          row_number() over (order by p.summa desc, lower(pr.visningsnamn)) as nr
        from poang p
        join public.profiler pr on pr.id = p.anvandare
        where p.summa > 0
      )
      select jsonb_build_object(
        'lista', coalesce((
          select jsonb_agg(jsonb_build_object(
            'plats', r.plats, 'namn', r.visningsnamn, 'poang', r.summa, 'rang', quiz.rang(r.total),
            'bild', profil.synlig_bild(r.anvandare), 'badge', profil.vid_namnet(r.anvandare)
          ) order by r.nr)
          from rankad r where r.nr <= 50
        ), '[]'::jsonb),
        'jag', (
          select jsonb_build_object(
            'plats', r.plats, 'namn', r.visningsnamn, 'poang', r.summa,
            'rang', quiz.rang(r.total), 'listad', r.nr <= 50,
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

-- Försöker med bild och badge. Kraschar det blir det topplistan exakt som
-- förut, så att den aldrig går sönder för profilernas skull.
create or replace function public.quiz_topplista() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_manad date := date_trunc('month', quiz.idag())::date;
  v_resultat jsonb := '{}'::jsonb;
  v_period text;
begin
  begin
    return profil.topplista(v_uid);
  exception when others then
    raise warning 'Topplistan med profiler misslyckades: %', sqlerrm;
  end;

  foreach v_period in array array['total', 'manad'] loop
    v_resultat := v_resultat || jsonb_build_object(v_period, (
      with poang as (
        select k.anvandare, k.poang as summa, k.poang as total
        from quiz.konton k
        where v_period = 'total'
        union all
        select s.anvandare, sum(s.plus)::integer, k.poang
        from quiz.svar s
        join quiz.konton k on k.anvandare = s.anvandare
        where v_period = 'manad' and s.datum >= v_manad
        group by s.anvandare, k.poang
      ),
      rankad as (
        select p.anvandare, pr.visningsnamn, p.summa, p.total,
          rank() over (order by p.summa desc) as plats,
          row_number() over (order by p.summa desc, lower(pr.visningsnamn)) as nr
        from poang p
        join public.profiler pr on pr.id = p.anvandare
        where p.summa > 0
      )
      select jsonb_build_object(
        'lista', coalesce((
          select jsonb_agg(jsonb_build_object(
            'plats', r.plats, 'namn', r.visningsnamn, 'poang', r.summa, 'rang', quiz.rang(r.total)
          ) order by r.nr)
          from rankad r where r.nr <= 50
        ), '[]'::jsonb),
        'jag', (
          select jsonb_build_object(
            'plats', r.plats, 'namn', r.visningsnamn, 'poang', r.summa,
            'rang', quiz.rang(r.total), 'listad', r.nr <= 50
          )
          from rankad r where r.anvandare = v_uid
        )
      )
    ));
  end loop;
  return v_resultat;
end
$$;

/* ---------- profilbilder i Storage ---------- */

-- Publik bucket: bilderna visas med vanlig adress. Högst 300 kB, och bara
-- WebP och JPEG, som sidan gör om bilden till.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profilbilder', 'profilbilder', true, 307200, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- Bara ägaren lägger upp, läser listan över och tar bort filer i sin egen
-- mapp. Att visa en bild kräver ingen policy, bucketen är publik.
create policy "Profilbild: lägg upp i egen mapp"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profilbilder' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Profilbild: läs egen mapp"
  on storage.objects for select to authenticated
  using (bucket_id = 'profilbilder' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Profilbild: ta bort i egen mapp"
  on storage.objects for delete to authenticated
  using (bucket_id = 'profilbilder' and (storage.foldername(name))[1] = (select auth.uid())::text);

/* ---------- rättigheter ---------- */

revoke all on all functions in schema profil from public, anon, authenticated;
revoke all on function public.profil_visa(text) from public, anon, authenticated;
revoke all on function public.profil_min() from public, anon, authenticated;
revoke all on function public.profil_valj_badge(text) from public, anon, authenticated;
revoke all on function public.profil_satt_bild(text) from public, anon, authenticated;
revoke all on function public.profil_rapportera_bild(text) from public, anon, authenticated;
revoke all on function public.profil_osedda() from public, anon, authenticated;
revoke all on function public.profil_sedda(text[]) from public, anon, authenticated;
grant execute on function public.profil_visa(text) to anon, authenticated;
grant execute on function public.profil_min() to authenticated;
grant execute on function public.profil_valj_badge(text) to authenticated;
grant execute on function public.profil_satt_bild(text) to authenticated;
grant execute on function public.profil_rapportera_bild(text) to authenticated;
grant execute on function public.profil_osedda() to authenticated;
grant execute on function public.profil_sedda(text[]) to authenticated;

/* ---------- bakåt: det som redan är förtjänat ---------- */

-- Datumet då villkoret uppfylldes när det går att räkna ut, annars nu.
-- sedd = false, så att de som redan spelar får popupen vid nästa besök.

-- Svitöar: dagar i rad med rätt svar, som sviten räknas i quiz.registrera.
create temporary table rattsvit as
with r as (
  select anvandare, datum, svarad,
    datum - (row_number() over (partition by anvandare order by datum))::integer as grupp
  from quiz.svar where ratt
)
select anvandare, datum, svarad, grupp,
  row_number() over (partition by anvandare, grupp order by datum) as pos,
  count(*) over (partition by anvandare, grupp) as langd
from r;

insert into profil.badges (anvandare, badge, tagen)
select id, 'start', skapad from public.profiler
where skapad < timestamptz '2026-11-01 00:00:00 Europe/Stockholm'
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select anvandare, 'forsta', min(svarad) from quiz.svar where ratt group by anvandare
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select anvandare, 'afterparty', min(svarad) from quiz.svar
where extract(isodow from svarad at time zone 'Europe/Stockholm') in (6, 7)
  and extract(hour from svarad at time zone 'Europe/Stockholm') between 3 and 5
group by anvandare
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select anvandare, 'midnatt', min(svarad) from quiz.svar
where extract(hour from svarad at time zone 'Europe/Stockholm') = 0
  and extract(minute from svarad at time zone 'Europe/Stockholm') = 0
group by anvandare
on conflict do nothing;

-- Svitbadges räknas på bästa sviten i quiz.konton.
insert into profil.badges (anvandare, badge, tagen)
select k.anvandare, m.badge,
  coalesce((select min(r.svarad) from rattsvit r where r.anvandare = k.anvandare and r.pos = m.mal), now())
from quiz.konton k
cross join (values ('v7', 7), ('v30', 30), ('v100', 100), ('v365', 365)) as m(badge, mal)
where k.basta >= m.mal
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select r.anvandare, 'aterfodd', min(r.svarad) from rattsvit r
where r.pos = 30 and exists (
  select 1 from rattsvit t
  where t.anvandare = r.anvandare and t.datum < r.datum and t.grupp <> r.grupp and t.langd >= 30
)
group by r.anvandare
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select anvandare, 'perfekt', min(svarad) from rattsvit
where datum = (date_trunc('month', datum) + interval '1 month - 1 day')::date
  and pos >= extract(day from datum)
group by anvandare
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select anvandare, m.badge, svarad
from (
  select anvandare, svarad, row_number() over (partition by anvandare order by datum) as n
  from quiz.svar where ratt
) x
join (values ('hundra', 100), ('bpm200', 200)) as m(badge, mal) on x.n = m.mal
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select s.anvandare, 'blixt', min(s.svarad) from quiz.svar s
join quiz.hamtningar h on h.anvandare = s.anvandare and h.datum = s.datum
where s.ratt and s.svarad - h.hamtad < interval '3 seconds'
group by s.anvandare
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select anvandare, 'speedcore', svarad
from (
  select s.anvandare, s.svarad, row_number() over (partition by s.anvandare order by s.datum) as n
  from quiz.svar s
  join quiz.hamtningar h on h.anvandare = s.anvandare and h.datum = s.datum
  where s.ratt and s.svarad - h.hamtad < interval '5 seconds'
) x
where n = 10
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select anvandare, m.badge, svarad
from (
  select s.anvandare, s.svarad, row_number() over (partition by s.anvandare order by s.datum) as n
  from quiz.svar s join quiz.fragor f on f.id = s.fraga_id
  where s.ratt and f.musik
) x
join (values ('fredag', 10), ('gehor', 50)) as m(badge, mal) on x.n = m.mal
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select anvandare, 'fredagsfeber', min(svarad)
from (
  select anvandare, svarad,
    row_number() over (partition by anvandare, grupp order by datum) as pos
  from (
    select s.anvandare, s.datum, s.svarad,
      s.datum - 7 * (row_number() over (partition by s.anvandare order by s.datum))::integer as grupp
    from quiz.svar s join quiz.fragor f on f.id = s.fraga_id
    where s.ratt and f.musik and extract(isodow from s.datum) = 5
  ) y
) x
where pos = 5
group by anvandare
on conflict do nothing;

insert into profil.badges (anvandare, badge, tagen)
select anvandare, 'legend', min(svarad)
from (
  select anvandare, svarad, sum(plus) over (partition by anvandare order by datum) as summa
  from quiz.svar
) x
where summa >= 10000
group by anvandare
on conflict do nothing;

drop table rattsvit;
