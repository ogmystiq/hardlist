-- Ett inloggat konto måste ha visningsnamn för att spela. Utan namn hamnar
-- poängen på ett konto som aldrig kan synas i topplistan, och ett konto utan
-- namn kunde svara. Spärren ligger här och inte bara på sidan, så att den
-- gäller även den som anropar API:t direkt.
--
-- Utan namn får kontot varken frågan eller någon starttid — de 30 sekunderna
-- börjar inte förrän namnet är valt och frågan öppnas.

create or replace function public.quiz_dagens(p_starta boolean default false) returns jsonb
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

  if not exists (select 1 from public.profiler where id = v_uid) then
    return v_bas || jsonb_build_object('krav', 'visningsnamn', 'konto', quiz.konto_json(v_uid));
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
