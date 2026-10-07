-- Facit för en låtfråga får länken till låten i Apple Music. Apples villkor
-- kräver att förlyssningar står intill deras märke, och sidan visar länken
-- under spelaren när frågan är besvarad.
--
-- Länken skickas först i facit, aldrig med frågan: före svaret hade den
-- avslöjat vilken låt det är. Bara facit_json ändras, allt annat är som i
-- 20261006220000_quiz_pa_servern.sql.

create or replace function quiz.facit_json(p_dag quiz.dagar) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ratt_plats', array_position(p_dag.ordning, f.ratt) - 1,
    'facit', f.facit
  ) || case
         when f.musik and f.itunes_id is not null
           then jsonb_build_object('apple', 'https://music.apple.com/se/song/' || f.itunes_id)
         else '{}'::jsonb
       end
  from quiz.fragor f where f.id = p_dag.fraga_id
$$;

revoke all on function quiz.facit_json(quiz.dagar) from public, anon, authenticated;
