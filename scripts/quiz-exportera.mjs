/* Hämtar hela frågebanken ur databasen och skriver kopian
   C:\Users\jonte\hardlist-privat\quiz-bank.json.

   node scripts/quiz-exportera.mjs */

import { mkdirSync } from 'node:fs';
import { PRIVAT, KOPIA, exportera } from './quiz-databas.mjs';

mkdirSync(PRIVAT, { recursive: true });
const bank = exportera();
const aktiva = bank.fragor.filter(f => f.aktiv !== false);
console.log(`Kopian uppdaterad: ${KOPIA}`);
console.log(`  ${bank.fragor.length} frågor, varav ${aktiva.length} aktiva och ` +
  `${aktiva.filter(f => f.typ === 'musik' && f.ljud).length} låtfrågor med ljud.`);
