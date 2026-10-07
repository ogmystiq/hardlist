-- Påskägget: den som trycker fram rätt takt på felsidan tar badgen.
--
-- Takten ligger bara i profil.hemligheter, som läggs in direkt i
-- produktionen och aldrig i en migration. Repot är publikt, och en takt i en
-- fil hade gått att läsa sig till på GitHub. Sidan vet inte vilken takt som
-- är rätt, den skickar bara trycken hit.

create table profil.hemligheter (
  namn text primary key,
  varde text not null
);

-- Försöken räknas per konto och dygn, svensk tid, så att takten inte går att
-- leta fram genom att prova sig fram från konsolen.
create table profil.hitta_forsok (
  anvandare uuid not null references auth.users (id) on delete cascade,
  datum date not null,
  antal integer not null default 0,
  primary key (anvandare, datum)
);

alter table profil.hemligheter enable row level security;
alter table profil.hitta_forsok enable row level security;
revoke all on table profil.hemligheter from public, anon, authenticated;
revoke all on table profil.hitta_forsok from public, anon, authenticated;

-- p_tider: åtta tidpunkter i millisekunder. De sju mellanrummen jämförs med
-- takten: medelvärdet får avvika högst 2,5 procent och varje mellanrum högst
-- 12 procent. Fel svar säger bara att det var fel, aldrig hur nära det var.
create function public.profil_hitta(p_tider integer[]) returns jsonb
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

  v_medel := (p_tider[8] - p_tider[1]) / 7.0;
  if abs(v_medel - v_slag) / v_slag > 0.025 then
    return jsonb_build_object('ratt', false);
  end if;
  for v_i in 1..7 loop
    v_d := p_tider[v_i + 1] - p_tider[v_i];
    if v_d <= 0 or abs(v_d - v_slag) / v_slag > 0.12 then
      return jsonb_build_object('ratt', false);
    end if;
  end loop;

  -- Rätt. sedd = true, eftersom sidan visar firandet direkt.
  if profil.ge(v_uid, 'paskagg', now(), true) then
    v_nya := jsonb_build_array(jsonb_build_object('id', 'paskagg', 'forst', profil.forst('paskagg')));
  end if;
  return jsonb_build_object('ratt', true, 'nya_badges', v_nya);
end
$$;

revoke all on function public.profil_hitta(integer[]) from public, anon, authenticated;
grant execute on function public.profil_hitta(integer[]) to authenticated;
