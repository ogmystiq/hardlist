-- Grundaren: en badge som bara Jonte har, i en egen nivå över de extremt
-- sällsynta. Nivå 5 är Unik.
--
-- Allt som räknar med nivån sorterar efter den, och vid_namnet väljer den
-- högsta, så inget annat behöver ändras för att 5 ska fungera.

alter table profil.katalog drop constraint katalog_niva_check;
alter table profil.katalog add constraint katalog_niva_check check (niva between 1 and 5);

insert into profil.katalog (id, niva, hemlig, kommer) values
  ('grundaren', 5, false, false);

-- Det finns bara en. Databasen vägrar att dela ut den till ett andra konto,
-- också om någon kör profil.dela_ut med fel namn.
create unique index badges_grundaren_bara_en
  on profil.badges (badge)
  where badge = 'grundaren';

-- Till Jontes konto. sedd = false, så att firandet visas nästa gång sajten
-- öppnas.
select profil.dela_ut('mystiq', 'grundaren');
