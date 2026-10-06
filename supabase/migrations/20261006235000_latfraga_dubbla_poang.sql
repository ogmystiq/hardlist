-- Låtfrågan ger dubbla grundpoäng: 20 i stället för 10 för rätt svar, med
-- svitbonusen ovanpå som vanligt. Den är svårare än en textfråga, och kommer
-- bara en gång i veckan.
--
-- Låtfråga avgörs av frågans musik-flagga, inte av veckodagen. Fredagens
-- fråga är en låtfråga, och en extrainsatt låtdag i quiz.extra_latdagar ger
-- samma poäng som en fredag.
--
-- Bara grundpoängen ändras. Allt annat i funktionen är som i
-- 20261006220000_quiz_pa_servern.sql.

create or replace function quiz.registrera(p_anvandare uuid, p_dag quiz.dagar, p_valde smallint, p_ratt boolean)
returns boolean
language plpgsql volatile
set search_path = ''
as $$
declare
  v_konto quiz.konton;
  v_igar boolean;
  v_svit integer;
  v_grund integer;
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
  v_grund := case
    when coalesce((select musik from quiz.fragor where id = p_dag.fraga_id), false) then 20
    else 10
  end;
  v_plus := case when p_ratt then v_grund + least(v_svit - 1, 10) * 2 else 0 end;

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

-- Som alla funktioner i schemat quiz: bara de publika quiz-funktionerna får
-- anropa den, aldrig sajten direkt.
revoke all on function quiz.registrera(uuid, quiz.dagar, smallint, boolean) from public, anon, authenticated;
