/* Gemensamt för quiz-lagg-till.mjs och quiz-exportera.mjs.

   Frågebanken ligger i schemat quiz, som API:t inte exponerar. Därför går
   påfyllning och export genom Supabase-CLI:t (supabase db query --linked),
   som loggar in med ditt Supabase-konto. Ingen hemlig nyckel behöver ligga
   på disk eller i repot. */

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Utanför repot, så att svaren aldrig kan råka committas och publiceras.
export const PRIVAT = resolve(ROOT, '..', 'hardlist-privat');
export const KOPIA = join(PRIVAT, 'quiz-bank.json');

/* Kör SQL mot den länkade databasen och returnerar raderna. SQL:en skrivs till
   en temporär fil i stället för att skickas som argument — en hel frågebank
   är för lång för en kommandorad i Windows. Filen innehåller svaren och tas
   bort direkt efteråt. */
export function kor(sql){
  const mapp = mkdtempSync(join(tmpdir(), 'hardlist-quiz-'));
  const fil = join(mapp, 'fraga.sql');
  writeFileSync(fil, sql, 'utf8');
  try {
    const r = spawnSync('npx',
      ['--yes', 'supabase', 'db', 'query', '--linked', '--agent', 'no', '--output-format', 'json', '-f', `"${fil}"`],
      // shell krävs för att Windows ska hitta npx.cmd.
      { cwd: ROOT, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0){
      throw new Error('supabase db query misslyckades:\n' + (r.stderr || r.stdout || '').trim());
    }
    const ut = JSON.parse(r.stdout);
    return Array.isArray(ut) ? ut : ut.rows;
  } finally {
    try { unlinkSync(fil); } catch(e){}
    try { rmdirSync(mapp); } catch(e){}
  }
}

/* JSON in i SQL som en enda sträng. Med standard_conforming_strings är
   apostrofen det enda tecken som behöver dubblas. */
export function jsonLiteral(v){
  return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
}

export function exportera(){
  const rader = kor('select quiz.exportera() as bank;');
  const bank = rader[0].bank;
  writeFileSync(KOPIA, JSON.stringify(bank, null, 2) + '\n', 'utf8');
  return bank;
}
