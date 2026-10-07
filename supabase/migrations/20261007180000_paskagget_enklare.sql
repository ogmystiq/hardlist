-- Påskägget blir enklare. Även med metronom låg trycken från en mobil några
-- procent fel i snitt, så nu räknas bara medelvärdet: takten det ger får
-- avvika högst 6,7 procent från rätt takt. Avvikelsen räknas i takt och inte
-- i mellanrummens längd, så att gränsen är lika stor åt båda hållen. De
-- enskilda mellanrummen kontrolleras inte alls.
--
-- Fel svar säger om takten var för snabb eller för långsam, och om den låg
-- inom 15 procent. Takten själv ligger kvar bara i profil.hemligheter.
--
-- Sidan skickar sex tryck. Åtta godtas också, så att en sida som ligger
-- kvar i någons cache inte slutar fungera.

create or replace function public.profil_hitta(p_tider integer[]) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_antal integer;
  v_n integer;
  v_bpm numeric;
  v_medel numeric;
  v_avvik numeric;
  v_i integer;
  v_mellan integer[] := '{}';
  v_ratt boolean;
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

  v_n := cardinality(p_tider);
  if p_tider is null or v_n not in (6, 8) or array_position(p_tider, null) is not null then
    return jsonb_build_object('ratt', false);
  end if;
  for v_i in 1..v_n - 1 loop
    if p_tider[v_i + 1] <= p_tider[v_i] then
      return jsonb_build_object('ratt', false);
    end if;
    v_mellan := v_mellan || (p_tider[v_i + 1] - p_tider[v_i]);
  end loop;

  select varde::numeric into v_bpm from profil.hemligheter where namn = 'paskagg_bpm';
  if v_bpm is null or v_bpm <= 0 then
    return jsonb_build_object('ratt', false);
  end if;
  v_medel := (p_tider[v_n] - p_tider[1])::numeric / (v_n - 1);
  -- Positivt betyder att trycken gick fortare än takten.
  v_avvik := (60000 / v_medel - v_bpm) / v_bpm;
  v_ratt := abs(v_avvik) <= 0.067;

  insert into profil.hitta_logg (anvandare, mellanrum, ratt) values (v_uid, v_mellan, v_ratt);

  if not v_ratt then
    return jsonb_build_object(
      'ratt', false,
      'takt', case when v_avvik > 0 then 'for_snabb' else 'for_langsam' end,
      'nastan', abs(v_avvik) <= 0.15
    );
  end if;

  -- Rätt. sedd = true, eftersom sidan visar firandet direkt.
  if profil.ge(v_uid, 'paskagg', now(), true) then
    v_nya := jsonb_build_array(jsonb_build_object('id', 'paskagg', 'forst', profil.forst('paskagg')));
  end if;
  return jsonb_build_object('ratt', true, 'nya_badges', v_nya);
end
$$;
