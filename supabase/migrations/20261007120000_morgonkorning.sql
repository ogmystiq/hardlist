-- Startar morgonkörningen av releaser 05:07 UTC.
--
-- GitHubs eget schema köar jobbet, och i praktiken startar det först mellan
-- 12 och 14 svensk tid. En workflow_dispatch via API:t startar direkt.
-- Schemat i workflowen ligger kvar som reserv, och spärren där gör att två
-- starter samma dygn aldrig kostar mer än en körning.
--
-- Tokenen ligger i Vault under namnet github_token och läses först när
-- anropet görs. Den får aldrig stå här eller någon annanstans i repot.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Eget schema, eftersom funktioner i public kan anropas av vem som helst
-- genom API:t. Schemat står inte i [api] schemas i config.toml.
create schema if not exists morgonkorning;
revoke all on schema morgonkorning from public, anon, authenticated;

create or replace function morgonkorning.starta_releaser()
returns bigint
language plpgsql
as $$
declare
  token text;
begin
  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'github_token';

  -- Utan token avbryter vi med fel, så att det syns i cron.job_run_details
  -- i stället för att ett anrop utan inloggning nekas i tysthet.
  if token is null or token = '' then
    raise exception 'Hittar ingen github_token i Vault. Morgonkörningen startades inte.';
  end if;

  -- pg_net skickar anropet i bakgrunden. GitHubs svar hamnar i
  -- net._http_response, 204 betyder att körningen är startad.
  return net.http_post(
    url := 'https://api.github.com/repos/ogmystiq/hardlist/actions/workflows/releaser.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || token,
      'X-GitHub-Api-Version', '2022-11-28',
      -- GitHub nekar anrop utan User-Agent.
      'User-Agent', 'hardlist-morgonkorning',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function morgonkorning.starta_releaser() from public, anon, authenticated;

-- Med samma namn ersätter cron.schedule ett befintligt jobb, så migrationen
-- kan köras om utan att det blir två starter varje morgon.
select cron.schedule(
  'hardlist-releaser',
  '7 5 * * *',
  $$select morgonkorning.starta_releaser()$$
);
