-- Täpper ett hål i profil_satt_bild. Den godtog vilken fil som helst i den
-- egna mappen. En bild som dolts efter en rapport, eller tagits bort med
-- profil.ta_bort_bild, ligger kvar i Storage, och kunde därför göras synlig
-- igen genom att anropa funktionen med samma sökväg från konsolen.
--
-- Nu godtas bara en fil som laddades upp de senaste tio minuterna, och aldrig
-- en sökväg som någon har rapporterat. Sidan anropar funktionen direkt efter
-- uppladdningen, så tio minuter räcker med god marginal.
--
-- Bara profil_satt_bild ersätts. Allt annat i den är som i
-- 20261007141500_profiler_och_badges.sql, och rättigheterna står kvar.

create or replace function public.profil_satt_bild(p_sokvag text) returns jsonb
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
     or not exists (
       select 1 from storage.objects
       where bucket_id = 'profilbilder' and name = p_sokvag
         and created_at > now() - interval '10 minutes'
     )
     or exists (select 1 from profil.bildrapporter where sokvag = p_sokvag) then
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
