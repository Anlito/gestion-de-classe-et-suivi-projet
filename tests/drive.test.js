// Tests de la saisie de l'identifiant client Google (js/drive.js). Identifiants FICTIFS.
import { extractClientId, validClientId } from '../js/drive.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };
const ID = '123456789012-abcdef0123456789ghijklmnopqrstuv.apps.googleusercontent.com';

test('Identifiant collé tel quel', () => { eq(extractClientId(ID), ID); eq(validClientId(ID), true); });
test('Espaces, retour à la ligne, espace insécable autour', () => eq(extractClientId('  ' + ID + '\n'), ID));
test('Caractère invisible (copier-coller) au milieu', () => eq(extractClientId(ID.slice(0, 20) + '​' + ID.slice(20)), ID));
test('Majuscules ajoutées par le clavier', () => eq(extractClientId('123456789012-ABCdef0123456789ghijklmnopqrstuv.Apps.GoogleUserContent.com'), ID));
test('Espace ajouté après un point par le clavier', () => eq(extractClientId(ID.replace('.apps.', '. apps. ')), ID));
test('Texte autour (« ID client : … »)', () => eq(extractClientId('ID client : ' + ID + ' (copié)'), ID));
test('Code secret ou texte sans identifiant : refusé', () => { eq(extractClientId('GOCSPX-abcdef123456'), null); eq(extractClientId(''), null); });
