-- Svårigheten i fritt spel räknas på Deezers rank i stället för iTunes
-- ordning, som följde popularitet dåligt.
--
-- Bara själva talet sparas, inga andra Deezer-data. rank_hamtad säger när
-- låten senast prövades, så att påfyllningen inte frågar om samma låt igen.
-- Låtar som inte har fått rank än, eller som inte gick att hitta hos Deezer,
-- räknas som förut efter iTunes ordning.

alter table latbibliotek.latar
  add column deezer_rank integer,
  add column rank_hamtad timestamptz;

-- Låtens plats bland låtarna i samma genre, från 0 (mest känd) till 1. Låtar
-- med Deezers rank jämförs med varandra, låtar utan med iTunes ordning.
create or replace function latbibliotek.popularitet() returns table (lat_id bigint, plats double precision)
language sql stable
set search_path = ''
as $$
  select id,
    case when deezer_rank is not null then med_rank else utan_rank end
  from (
    select id, deezer_rank,
      cume_dist() over (partition by genre, deezer_rank is null order by deezer_rank desc, md5(id::text)) as med_rank,
      cume_dist() over (partition by genre order by coalesce(itunes_ordning, 99), md5(id::text)) as utan_rank
    from latbibliotek.latar
    where aktiv and trasig is null
  ) x
$$;

/* ---------- påfyllningen, bara med servicenyckeln ---------- */

-- Låtar som inte har prövats hos Deezer än.
create function public.latbibliotek_utan_rank(p_antal integer) returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'artist_namn', artist_namn, 'artist', artist, 'titel', titel)), '[]'::jsonb)
  from (
    select id, artist_namn, artist, titel from latbibliotek.latar
    where aktiv and trasig is null and rank_hamtad is null
    order by id limit greatest(1, least(p_antal, 500))
  ) x
$$;

-- Sparar rank för en lista låtar: [{ id, rank }]. rank null betyder att
-- låten inte fanns hos Deezer.
create function public.latbibliotek_rank(p jsonb) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_antal integer;
begin
  update latbibliotek.latar l set deezer_rank = x.rank, rank_hamtad = now()
  from jsonb_to_recordset(coalesce(p, '[]')) as x(id bigint, rank integer)
  where l.id = x.id;
  get diagnostics v_antal = row_count;
  return jsonb_build_object('sparade', v_antal);
end
$$;

revoke all on function latbibliotek.popularitet() from public, anon, authenticated;
revoke all on function public.latbibliotek_utan_rank(integer) from public, anon, authenticated;
revoke all on function public.latbibliotek_rank(jsonb) from public, anon, authenticated;
grant execute on function public.latbibliotek_utan_rank(integer) to service_role;
grant execute on function public.latbibliotek_rank(jsonb) to service_role;
