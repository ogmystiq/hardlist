-- Påskägget gick inte att ta i mobilen. Tryck på en skärm är ojämnare än
-- klick med en mus, så gränserna blir vidare: varje mellanrum får avvika
-- högst 20 procent och medelvärdet högst 3 procent. Takten ändras inte.
--
-- Varje försök sparas också med sina sju mellanrum, så att det går att se
-- hur trycken såg ut om det fortfarande inte går. Tabellen ligger i schemat
-- profil, som API:t inte når.

create table profil.hitta_logg (
  id bigint generated always as identity primary key,
  anvandare uuid not null references auth.users (id) on delete cascade,
  skapad timestamptz not null default now(),
  mellanrum integer[] not null,
  ratt boolean not null
);

alter table profil.hitta_logg enable row level security;
revoke all on table profil.hitta_logg from public, anon, authenticated;
revoke all on sequence profil.hitta_logg_id_seq from public, anon, authenticated;

-- Som i 20261007170000_paskagget.sql, med de nya gränserna och loggen.
create or replace function public.profil_hitta(p_tider integer[]) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_antal integer;
  v_bpm numeric;
  v_slag numeric;
  v_medel numeric;
  v_d numeric;
  v_i integer;
  v_mellan integer[] := '{}';
  v_ratt boolean := true;
  v_nya jsonb := '[]'::jsonb;
begin
  if v_uid is null or not exists (select 1 from public.profiler where id = v_uid) then
    return jsonb_build_object('fel', 'inte_inloggad');
  end if;

  -- Varje anrop räknas, också de som är fel på andra sätt.
  insert into profil.hitta_forsok (anvandare, datum, antal) values (v_uid, quiz.idag(), 1)
  on conflict (anvandare, datum) do update set antal = profil.hitta_forsok.antal + 1
  returning antal into v_antal;
  if v_antal > 20 then
    return jsonb_build_object('ratt', false);
  end if;

  if p_tider is null or cardinality(p_tider) <> 8 or array_position(p_tider, null) is not null then
    return jsonb_build_object('ratt', false);
  end if;

  select varde::numeric into v_bpm from profil.hemligheter where namn = 'paskagg_bpm';
  if v_bpm is null or v_bpm <= 0 then
    return jsonb_build_object('ratt', false);
  end if;
  v_slag := 60000 / v_bpm;

  for v_i in 1..7 loop
    v_mellan := v_mellan || (p_tider[v_i + 1] - p_tider[v_i]);
  end loop;

  v_medel := (p_tider[8] - p_tider[1]) / 7.0;
  if abs(v_medel - v_slag) / v_slag > 0.03 then
    v_ratt := false;
  end if;
  foreach v_d in array v_mellan loop
    if v_d <= 0 or abs(v_d - v_slag) / v_slag > 0.20 then
      v_ratt := false;
    end if;
  end loop;

  insert into profil.hitta_logg (anvandare, mellanrum, ratt) values (v_uid, v_mellan, v_ratt);

  if not v_ratt then
    return jsonb_build_object('ratt', false);
  end if;

  -- Rätt. sedd = true, eftersom sidan visar firandet direkt.
  if profil.ge(v_uid, 'paskagg', now(), true) then
    v_nya := jsonb_build_array(jsonb_build_object('id', 'paskagg', 'forst', profil.forst('paskagg')));
  end if;
  return jsonb_build_object('ratt', true, 'nya_badges', v_nya);
end
$$;
