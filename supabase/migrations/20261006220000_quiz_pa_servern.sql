-- Dagliga quizet flyttat till servern. Frågebanken med svar ligger i ett eget
-- schema som API:t inte exponerar, och allt sajten får se går genom
-- funktionerna längst ner. Tidigare låg rätt svar i quiz-live.json och i
-- sidans källkod, och vem som helst kunde läsa dem.

create schema quiz;

-- Schemat står inte i [api] schemas i config.toml, men rättigheterna nollas
-- ändå. Skulle någon lägga till det i listan av misstag ska det inte räcka för
-- att läsa svaren.
revoke all on schema quiz from public, anon, authenticated;

/* ---------- frågebanken ---------- */

create table quiz.fragor (
  id bigint generated always as identity primary key,
  fraga text not null,
  alternativ text[] not null,
  -- Index i alternativ, från noll som i den gamla quiz.json. Visningsordningen
  -- blandas per dag i quiz.dagar, så det spelar ingen roll var rätt svar står.
  ratt smallint not null,
  facit text not null,
  musik boolean not null default false,
  -- Apples förhandslyssning, hämtad en gång när frågan läggs in. Då behöver
  -- ingenting slås upp hos iTunes när frågan väl ställs.
  ljud text,
  artist text,
  titel text,
  itunes_id bigint,
  sok text,
  latspel boolean not null default true,
  -- Frågor tas ur rotation med aktiv = false i stället för att raderas, så att
  -- gamla dagar fortfarande pekar på något.
  aktiv boolean not null default true,
  skapad timestamptz not null default now(),

  constraint alternativ_antal check (cardinality(alternativ) between 2 and 6),
  constraint ratt_inom check (ratt >= 0 and ratt < cardinality(alternativ))
);

-- Samma fråga med samma rätta svar ska inte kunna läggas in två gånger när en
-- fil laddas upp på nytt. Alla låtfrågor heter "Vilken låt är det här?", så
-- frågetexten ensam räcker inte, och två frågor om vem som gör en låt kan ha
-- samma svar men olika låtar — därför titeln också.
create unique index fragor_unik on quiz.fragor (fraga, (alternativ[ratt + 1]), (coalesce(titel, '')));

/* ---------- vilken fråga som gäller vilken dag ---------- */

create table quiz.dagar (
  datum date primary key,
  fraga_id bigint not null references quiz.fragor (id),
  -- ordning[plats] = index i alternativ. Blandas en gång per dag och sparas,
  -- så alla ser samma ordning och sidan aldrig behöver veta vilket som är rätt.
  ordning smallint[] not null,
  skapad timestamptz not null default now()
);

-- Extra låtquizdagar utöver fredagarna. Till för att testa ljudet utan att
-- vänta på veckans slut. Gäller bara om datumet läggs in innan dagens fråga
-- valts — sedan står den fast.
create table quiz.extra_latdagar (datum date primary key);

/* ---------- inloggade spelares data ---------- */
-- Alla tre refererar auth.users med on delete cascade, så kontoraderingen i
-- radera-konto tar med sig allt utan att funktionen behöver ändras.

create table quiz.hamtningar (
  anvandare uuid not null references auth.users (id) on delete cascade,
  datum date not null,
  -- 30-sekundersgränsen räknas härifrån. Raden skrivs bara första gången, så
  -- att ladda om sidan startar inte om tiden.
  hamtad timestamptz not null default now(),
  primary key (anvandare, datum)
);

create table quiz.svar (
  anvandare uuid not null references auth.users (id) on delete cascade,
  datum date not null,
  fraga_id bigint not null references quiz.fragor (id),
  -- Platsen i den blandade ordningen. Null när tiden gick ut utan svar.
  valde smallint,
  ratt boolean not null,
  plus integer not null default 0,
  svarad timestamptz not null default now(),
  -- Primärnyckeln är spärren mot dubbelsvar. Två samtidiga anrop kan inte
  -- båda komma igenom.
  primary key (anvandare, datum)
);

create index svar_datum on quiz.svar (datum);

create table quiz.konton (
  anvandare uuid primary key references auth.users (id) on delete cascade,
  poang integer not null default 0,
  svit integer not null default 0,
  basta integer not null default 0,
  antal integer not null default 0,
  ratt_antal integer not null default 0,
  senast date
);

-- Ingen roll utom ägaren kommer åt tabellerna. RLS utan policyer är ett andra
-- lås om rättigheterna någon gång skulle delas ut av misstag.
alter table quiz.fragor enable row level security;
alter table quiz.dagar enable row level security;
alter table quiz.extra_latdagar enable row level security;
alter table quiz.hamtningar enable row level security;
alter table quiz.svar enable row level security;
alter table quiz.konton enable row level security;
revoke all on all tables in schema quiz from public, anon, authenticated;
revoke all on all sequences in schema quiz from public, anon, authenticated;

/* ---------- hjälpfunktioner, bara för ägaren ---------- */

-- Dygnsgränsen går vid midnatt svensk tid oavsett var besökaren befinner sig.
create function quiz.idag() returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Stockholm')::date $$;

-- Samma rangskala som quizsidan alltid haft.
create function quiz.rang(p integer) returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p >= 10000 then 'Legend'
    when p >= 5000 then 'Oldschool'
    when p >= 2500 then 'Gabber'
    when p >= 1200 then 'Hakker'
    when p >= 500 then 'Hardhead'
    when p >= 200 then 'Frontrow'
    when p >= 50 then 'Raver'
    else 'Nybörjare'
  end
$$;

-- Väljer dagens fråga första gången någon frågar efter den och sparar valet.
-- Slumpen gör att ordningen inte går att räkna ut i förväg. Minst använda
-- frågan först gör att ingen upprepas innan resten av potten gått.
create function quiz.dagens_rad() returns quiz.dagar
language plpgsql volatile
set search_path = ''
as $$
declare
  v_datum date := quiz.idag();
  v_rad quiz.dagar;
  v_latdag boolean;
  v_id bigint;
  v_antal integer;
begin
  select * into v_rad from quiz.dagar where datum = v_datum;
  if found then return v_rad; end if;

  v_latdag := extract(isodow from v_datum) = 5
    or exists (select 1 from quiz.extra_latdagar where datum = v_datum);

  -- Låtfrågor bara på låtdagar, och bara de som har ljud.
  select f.id into v_id
  from quiz.fragor f
  where f.aktiv
    and case when v_latdag then f.musik and f.ljud is not null else not f.musik end
  order by (select count(*) from quiz.dagar d where d.fraga_id = f.id), random()
  limit 1;

  -- Saknas ljud en fredag blir det en textfråga, hellre än inget quiz alls.
  if v_id is null then
    select f.id into v_id
    from quiz.fragor f
    where f.aktiv and (not f.musik or f.ljud is not null)
    order by (select count(*) from quiz.dagar d where d.fraga_id = f.id), random()
    limit 1;
  end if;

  if v_id is null then return null; end if;

  select cardinality(alternativ) into v_antal from quiz.fragor where id = v_id;

  -- Två besökare exakt samtidigt vid midnatt: den som hinner först vinner, den
  -- andra läser vad den första sparade.
  insert into quiz.dagar (datum, fraga_id, ordning)
  values (
    v_datum, v_id,
    (select array_agg(i::smallint order by random()) from generate_series(0, v_antal - 1) i)
  )
  on conflict (datum) do nothing;

  select * into v_rad from quiz.dagar where datum = v_datum;
  return v_rad;
end
$$;

-- Frågan som sidan får se: text, alternativ i dagens ordning och ljud. Aldrig
-- vilket alternativ som är rätt.
create function quiz.fraga_json(p_dag quiz.dagar) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'fraga', f.fraga,
    'alternativ', (select jsonb_agg(f.alternativ[o + 1] order by n)
                   from unnest(p_dag.ordning) with ordinality as t(o, n)),
    'ljud', case when f.musik then f.ljud end
  )
  from quiz.fragor f where f.id = p_dag.fraga_id
$$;

-- Facit, som bara lämnas ut efter svar.
create function quiz.facit_json(p_dag quiz.dagar) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ratt_plats', array_position(p_dag.ordning, f.ratt) - 1,
    'facit', f.facit
  )
  from quiz.fragor f where f.id = p_dag.fraga_id
$$;

create function quiz.konto_json(p_anvandare uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'poang', coalesce(k.poang, 0),
    -- En missad dag bryter sviten även om inget svar sparats sedan dess.
    'svit', case when k.senast >= quiz.idag() - 1 then k.svit else 0 end,
    'basta', coalesce(k.basta, 0),
    'antal', coalesce(k.antal, 0),
    'ratt', coalesce(k.ratt_antal, 0),
    'rang', quiz.rang(coalesce(k.poang, 0)),
    'har_namn', exists (select 1 from public.profiler p where p.id = p_anvandare)
  )
  from (select 1) x
  left join quiz.konton k on k.anvandare = p_anvandare
$$;

-- Sparar ett svar och räknar poäng och svit. Samma formel som quizet alltid
-- haft: 10 + min(svit - 1, 10) * 2 för rätt svar, noll och bruten svit för fel.
-- Returnerar false om dagen redan var besvarad.
create function quiz.registrera(p_anvandare uuid, p_dag quiz.dagar, p_valde smallint, p_ratt boolean)
returns boolean
language plpgsql volatile
set search_path = ''
as $$
declare
  v_konto quiz.konton;
  v_igar boolean;
  v_svit integer;
  v_plus integer;
begin
  insert into quiz.svar (anvandare, datum, fraga_id, valde, ratt)
  values (p_anvandare, p_dag.datum, p_dag.fraga_id, p_valde, p_ratt)
  on conflict (anvandare, datum) do nothing;
  if not found then return false; end if;

  insert into quiz.konton (anvandare) values (p_anvandare)
  on conflict (anvandare) do nothing;
  select * into v_konto from quiz.konton where anvandare = p_anvandare for update;

  v_igar := exists (
    select 1 from quiz.svar
    where anvandare = p_anvandare and datum = p_dag.datum - 1
  );
  v_svit := case when not p_ratt then 0 when v_igar then v_konto.svit + 1 else 1 end;
  v_plus := case when p_ratt then 10 + least(v_svit - 1, 10) * 2 else 0 end;

  update quiz.svar set plus = v_plus
  where anvandare = p_anvandare and datum = p_dag.datum;

  update quiz.konton set
    poang = poang + v_plus,
    svit = v_svit,
    basta = greatest(basta, v_svit),
    antal = antal + 1,
    ratt_antal = ratt_antal + p_ratt::integer,
    senast = p_dag.datum
  where anvandare = p_anvandare;

  return true;
end
$$;

create function quiz.svar_json(p_anvandare uuid, p_dag quiz.dagar) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'valde', s.valde,
    'ratt', s.ratt,
    'plus', s.plus,
    'tid_ute', s.valde is null
  ) || quiz.facit_json(p_dag)
  from quiz.svar s
  where s.anvandare = p_anvandare and s.datum = p_dag.datum
$$;

/* ---------- det sajten får anropa ---------- */

-- Dagens fråga. Utloggad: frågan direkt. Inloggad: frågan först när
-- p_starta är sant, eftersom 30 sekunder börjar räknas då. Att bara besöka
-- sidan för topplistan ska inte bränna dagens fråga.
create function public.quiz_dagens(p_starta boolean default false) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_dag quiz.dagar := quiz.dagens_rad();
  v_bas jsonb;
  v_hamtad timestamptz;
  v_kvar numeric;
begin
  if v_dag.datum is null then
    return jsonb_build_object('fel', 'ingen_fraga');
  end if;

  v_bas := jsonb_build_object(
    'datum', v_dag.datum,
    'latquiz', (select musik from quiz.fragor where id = v_dag.fraga_id),
    'inloggad', v_uid is not null
  );

  if v_uid is null then
    return v_bas || quiz.fraga_json(v_dag);
  end if;

  if exists (select 1 from quiz.svar where anvandare = v_uid and datum = v_dag.datum) then
    return v_bas || quiz.fraga_json(v_dag)
      || jsonb_build_object('svar', quiz.svar_json(v_uid, v_dag), 'konto', quiz.konto_json(v_uid));
  end if;

  select hamtad into v_hamtad from quiz.hamtningar
  where anvandare = v_uid and datum = v_dag.datum;

  if v_hamtad is null and not p_starta then
    return v_bas || jsonb_build_object('startad', false, 'konto', quiz.konto_json(v_uid));
  end if;

  if v_hamtad is null then
    insert into quiz.hamtningar (anvandare, datum) values (v_uid, v_dag.datum)
    on conflict (anvandare, datum) do nothing;
    select hamtad into v_hamtad from quiz.hamtningar
    where anvandare = v_uid and datum = v_dag.datum;
  end if;

  v_kvar := 30 - extract(epoch from now() - v_hamtad);

  -- Tiden har gått ut utan svar: räknas som fel, precis som ett för sent svar.
  if v_kvar <= 0 then
    perform quiz.registrera(v_uid, v_dag, null, false);
    return v_bas || quiz.fraga_json(v_dag)
      || jsonb_build_object('svar', quiz.svar_json(v_uid, v_dag), 'konto', quiz.konto_json(v_uid));
  end if;

  return v_bas || quiz.fraga_json(v_dag) || jsonb_build_object(
    'startad', true,
    'sekunder_kvar', round(v_kvar, 1),
    'konto', quiz.konto_json(v_uid)
  );
end
$$;

-- Rättar ett svar. p_datum måste vara dagens datum, så att ett svar som
-- skickas efter midnatt inte rättas mot en fråga personen aldrig sett.
create function public.quiz_svara(p_datum date, p_plats integer) returns jsonb
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

  select ratt into v_ratt_index from quiz.fragor where id = v_dag.fraga_id;
  v_ratt := v_dag.ordning[p_plats + 1] = v_ratt_index;

  -- Utloggad: bara rättning. Poängen sköts i webbläsaren som förut.
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

    v_for_sent := now() > v_hamtad + interval '30 seconds';
    perform quiz.registrera(
      v_uid, v_dag,
      case when v_for_sent then null else p_plats::smallint end,
      v_ratt and not v_for_sent
    );
  end if;

  -- Redan besvarad dag ger samma svar som första gången, inget nytt sparas.
  return jsonb_build_object(
    'svar', quiz.svar_json(v_uid, v_dag),
    'konto', quiz.konto_json(v_uid)
  );
end
$$;

-- Topplistorna. Lämnar bara ut visningsnamn, poäng och rang — aldrig id,
-- mejl eller något annat. Konton utan visningsnamn eller utan poäng syns inte.
create function public.quiz_topplista() returns jsonb
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

-- Postgres låter alla köra nya funktioner, och Supabase delar dessutom ut
-- rättigheter till anon och authenticated. Nollställ och dela ut exakt det
-- som behövs.
revoke all on all functions in schema quiz from public, anon, authenticated;
revoke all on function public.quiz_dagens(boolean) from public, anon, authenticated;
revoke all on function public.quiz_svara(date, integer) from public, anon, authenticated;
revoke all on function public.quiz_topplista() from public, anon, authenticated;
grant execute on function public.quiz_dagens(boolean) to anon, authenticated;
grant execute on function public.quiz_svara(date, integer) to anon, authenticated;
grant execute on function public.quiz_topplista() to anon, authenticated;

/* ---------- påfyllning och kopia, bara via supabase db query ---------- */

-- Lägger in eller uppdaterar frågor från en JSON-lista i samma format som den
-- gamla data/quiz.json. Med "id" uppdateras just den frågan, annars matchas
-- frågetext, rätt svar och titel. Körs av scripts/quiz-lagg-till.mjs.
create function quiz.lagg_till(p_fragor jsonb) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_f jsonb;
  v_nya integer := 0;
  v_andrade integer := 0;
  v_ny boolean;
begin
  for v_f in select * from jsonb_array_elements(p_fragor) loop
    if v_f ? 'id' then
      update quiz.fragor set
        fraga = v_f->>'f',
        alternativ = array(select jsonb_array_elements_text(v_f->'s')),
        ratt = (v_f->>'r')::smallint,
        facit = v_f->>'fk',
        musik = coalesce(v_f->>'typ', '') = 'musik',
        ljud = v_f->>'ljud',
        artist = v_f->>'artist',
        titel = v_f->>'titel',
        itunes_id = (v_f->>'itunesId')::bigint,
        sok = v_f->>'sok',
        latspel = coalesce((v_f->>'latspel')::boolean, true),
        aktiv = coalesce((v_f->>'aktiv')::boolean, true)
      where id = (v_f->>'id')::bigint;
      if not found then
        raise exception 'Fråga med id % finns inte', v_f->>'id';
      end if;
      v_andrade := v_andrade + 1;
    else
      insert into quiz.fragor
        (fraga, alternativ, ratt, facit, musik, ljud, artist, titel, itunes_id, sok, latspel, aktiv)
      values (
        v_f->>'f',
        array(select jsonb_array_elements_text(v_f->'s')),
        (v_f->>'r')::smallint,
        v_f->>'fk',
        coalesce(v_f->>'typ', '') = 'musik',
        v_f->>'ljud',
        v_f->>'artist',
        v_f->>'titel',
        (v_f->>'itunesId')::bigint,
        v_f->>'sok',
        coalesce((v_f->>'latspel')::boolean, true),
        coalesce((v_f->>'aktiv')::boolean, true)
      )
      on conflict (fraga, (alternativ[ratt + 1]), (coalesce(titel, ''))) do update set
        alternativ = excluded.alternativ,
        ratt = excluded.ratt,
        facit = excluded.facit,
        musik = excluded.musik,
        -- Ett ljud som redan finns skrivs inte över med tomt, samma lärdom som
        -- ljud.json: en körning utan nätverk ska inte radera fungerande adresser.
        ljud = coalesce(excluded.ljud, quiz.fragor.ljud),
        artist = excluded.artist,
        titel = excluded.titel,
        itunes_id = excluded.itunes_id,
        sok = excluded.sok,
        latspel = excluded.latspel,
        aktiv = excluded.aktiv
      returning (xmax = 0) into v_ny;
      if v_ny then v_nya := v_nya + 1; else v_andrade := v_andrade + 1; end if;
    end if;
  end loop;

  return jsonb_build_object(
    'nya', v_nya,
    'andrade', v_andrade,
    'totalt', (select count(*) from quiz.fragor),
    'aktiva', (select count(*) from quiz.fragor where aktiv)
  );
end
$$;

-- Hela banken i samma format som lagg_till läser, för kopian i hardlist-privat.
create function quiz.exportera() returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'exporterad', now(),
    'fragor', coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', f.id,
      'typ', case when f.musik then 'musik' end,
      'f', f.fraga,
      's', to_jsonb(f.alternativ),
      'r', f.ratt,
      'fk', f.facit,
      'ljud', f.ljud,
      'artist', f.artist,
      'titel', f.titel,
      'itunesId', f.itunes_id,
      'sok', f.sok,
      'latspel', case when not f.latspel then false end,
      'aktiv', case when not f.aktiv then false end,
      'anvand', (select jsonb_agg(d.datum order by d.datum) from quiz.dagar d where d.fraga_id = f.id)
    )) order by f.id), '[]'::jsonb)
  )
  from quiz.fragor f
$$;

revoke all on function quiz.lagg_till(jsonb) from public, anon, authenticated;
revoke all on function quiz.exportera() from public, anon, authenticated;

/* ---------- profilerna: bara egen rad ---------- */

-- Topplistan hämtar visningsnamnen via quiz_topplista. Då behöver ingen
-- annan kunna läsa hela profiltabellen, med id och skapad-datum för alla konton.
drop policy "Alla läser profiler" on public.profiler;
revoke select on table public.profiler from anon;

create policy "Läs egen profil"
  on public.profiler for select
  to authenticated
  using ((select auth.uid()) = id);
