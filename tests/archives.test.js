// Tests des noms d'archives (js/backup.js) : une archive par année scolaire, même nom sur tous les appareils.
import { archiveId, archiveFileName, nextSchoolYear } from '../js/backup.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };

test('Identifiant d’archive : tiret long ou court, même résultat', () => { eq(archiveId('2025–2026'), 'annee-2025-2026'); eq(archiveId('2025-2026'), 'annee-2025-2026'); });
test('Nom du fichier d’archive dans Drive', () => eq(archiveFileName('2025–2026'), 'carnet-archive-2025-2026.json'));
test('Année suivante', () => eq(nextSchoolYear('2025–2026'), '2026–2027'));
