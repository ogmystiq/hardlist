-- Rundor utan konto ska vara borta efter ett dygn, som integritetssidan
-- säger. rensa() körs redan när någon startar en ny runda, men spelar ingen
-- blir de annars kvar. Det här jobbet rensar varje natt ändå.

select cron.schedule('hardlist-latspel-rensa', '20 2 * * *', $$select latbibliotek.rensa()$$);
