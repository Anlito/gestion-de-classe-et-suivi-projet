import { readCSV, parseRosterCSV, suggestStudent, grade, importProblems, parseBulletin, extractMeta, annualBulletinRows } from '../js/pronote-import.js';
export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); };
test('Import : CSV BOM, guillemets et lignes multiples', () => eq(readCSV('\uFEFFÉlèves;Note\r\n"EXEMPLE Camille";"Texte; avec ""citation""\nseconde ligne"')[1], ['EXEMPLE Camille', 'Texte; avec "citation"\nseconde ligne']));
test('Import : homonymes source marqués ambigus', () => eq(parseRosterCSV('Élèves;\nNOM Prénom;\nNOM Prénom;').rows.map(r => r.ambiguous), [true, true]));
test('Import : colonnes incohérentes refusées', () => { let rejected = false; try { parseRosterCSV('Élèves;Classe\nEXEMPLE Camille;4D;surplus'); } catch { rejected = true; } eq(rejected, true); });
test('Import : correspondance accents et ordre des noms', () => eq(suggestStudent('Camille EXÉMPLE', [{ id: 'a', nom: 'EXEMPLE', prenom: 'Camille' }]), 'a'));
test('Import : aucun choix automatique entre homonymes', () => eq(suggestStudent('EXEMPLE Camille', [{ id: 'a', nom: 'EXEMPLE', prenom: 'Camille' }, { id: 'b', nom: 'EXEMPLE', prenom: 'Camille' }]), ''));
test('Import : zéro, non noté et absence de moyenne distincts', () => eq([grade('0').value, grade('N.Not').status, grade('').status], [0, 'not_graded', 'missing']));
test('Import : bulletin d’une autre année bloqué', () => eq(importProblems({ profile: 'bulletin', year: '2025–2026', trimester: 1, rows: [{}] }, ['a'], { name: '4D' }, '2026–2027', [{ id: 'a' }]).length, 1));
test('Import : association double au même élève bloquée', () => eq(importProblems({ profile: 'roster', rows: [{}, {}] }, ['a', 'a'], { name: '4D' }, '2026–2027', [{ id: 'a' }]).length, 1));
test('Import TEST : écarts de classe et année acceptés explicitement', () => eq(importProblems({ profile: 'bulletin', year: '2025–2026', sourceClass: '4D', trimester: 1, rows: [{}] }, ['a'], { name: '5e B' }, '2026–2027', [{ id: 'a' }], { testMode: true }), []));
test('Import TEST : trimestre inconnu toujours bloqué', () => eq(importProblems({ profile: 'bulletin', year: '2025–2026', sourceClass: '4D', trimester: null, rows: [{}] }, ['a'], { name: '5e B' }, '2026–2027', [{ id: 'a' }], { testMode: true }).length, 1));
test('Import TEST : élève extérieur à la classe toujours refusé', () => eq(importProblems({ profile: 'bulletin', year: '2025–2026', trimester: 1, rows: [{}] }, ['autre'], { name: '5e B' }, '2026–2027', [{ id: 'a' }], { testMode: true }).length, 2));
function competencyPage(programme = false) {
  const items = [], put = (text, x, y, fontName = 'normal') => items.push({ text, x, y, width: 15, height: 6, fontName });
  put('Année scolaire : 2024/2025', 28, 85); put('Bulletin du Trimestre 1', 290, 45); put('6 G', 290, 105);
  put('Matières', 50, 135); put('Compétences évaluées', programme ? 225 : 148, 135); put('Détail des évaluations', 345, 135); put('Pos.', 410, 135); put('Appréciations', 476, 135);
  if (programme) put('Éléments du programme travaillés', 90, 135);
  put('FRANCAIS', 29.5, 155, 'bold'); put('FICTIF', 29.5, 164); put('Mme Exemple', 29.5, 173);
  put('Écrire', programme ? 195 : 100, 163); put('3', 412, 164); put('\uE9AC', 411, 165);
  put('Première ligne légèrement décalée.', 426, 153.5); put('Deuxième ligne.', 426, 163);
  put('MATHEMATIQUES', 29.5, 205, 'bold'); put('M. Exemple', 29.5, 214); put('Calculer', programme ? 195 : 100, 214); put('4', 412, 214);
  put('Avis de mathématiques.', 426, 203.5); put('Très bonne maîtrise', 40, 260); put('Aucune absence - Retards : 0', 29.5, 275); put('Appréciation globale :', 29.5, 290); put('Conclusion fictive.', 130, 290); put('Le chef d’établissement', 420, 310);
  return { number: 1, width: 595, height: 842, items };
}
test('Bulletin : trimestre avant ou après son numéro', () => eq([extractMeta([competencyPage()]).trimester, extractMeta([{ items: [{ text: 'Bulletin du 2e Trimestre', x: 0, y: 0 }] }]).trimester], [1, 2]));
test('Bulletin compétences : classe espacée et aucune moyenne inventée', () => { const r = parseBulletin([competencyPage()]); eq([r.layout, r.sourceClass, r.rows[0].subjects.map(s => s.studentResults)], ['competences', '6 G', [[], []]]); });
test('Bulletin compétences : niveaux numériques distincts des pictogrammes', () => eq(parseBulletin([competencyPage()]).rows[0].subjects.map(s => s.mastery.value), [3, 4]));
test('Bulletin compétences : nom de professeur majuscule sans fausse matière', () => { const s = parseBulletin([competencyPage()]).rows[0].subjects; eq(s.length, 2); eq(s[0].teacher, 'FICTIF Mme Exemple'); });
test('Bulletin compétences : première ligne décalée et limite entre deux avis', () => eq(parseBulletin([competencyPage()]).rows[0].subjects.map(s => s.appreciation), ['Première ligne légèrement décalée.\nDeuxième ligne.', 'Avis de mathématiques.']));
test('Bulletin compétences avec programme : libellés et conclusion conservés', () => { const r = parseBulletin([competencyPage(true)]); eq([r.layout, r.rows[0].subjects[0].competenciesRaw, r.rows[0].generalAppreciation], ['competences-programme', 'Écrire', 'Conclusion fictive.']); });
function numericPage(number = 1) {
  const items = [], put = (text, x, y, fontName = 'normal') => items.push({ text, x, y, width: 15, height: 6, fontName });
  put('Année scolaire : 2026/2027', 28, 85); put('Bulletin du 2ème Trimestre', 290, 45); put('5 B', 290, 105);
  for (const [text,x,y] of [['Matières',62,135],['Nb.',128,132],['Evol.',143,135],['T1',173,135],['Élève',198,140],['Clas.',220,140],['-',245,140],['+',263,140],['Éléments du programme',280,135],['Appréciations',472,135]]) put(text,x,y,'bold');
  put(number === 1 ? 'FRANCAIS' : 'RAPPORT DE STAGE',29.5,155,'bold'); put('Mme Fictif',70,166); put('9,40',180,155); put('0',205,155,'bold'); put('12,00 5,00 19,00',220,155); put('1/2',131,155);
  if (number === 1) put('Avis complet.',423,153.5);
  if (number === 2) { put('NR : moyenne non représentative.',28,260); put('Intentions d’orientation / Avis provisoires du conseil de classe',28,275); put('Voie fictive : avis réservé.',40,285); put('Appréciation globale :',29.5,310); put('Conclusion fictive.',130,310); put('Mentions :',29.5,330); put('Encouragements',75,330); put('Le chef d’établissement',420,350); }
  return { number, width:595, height:842, items };
}
test('Bulletin détaillé : T1 distinct de T2 et zéro préservé', () => { const s = parseBulletin([numericPage()]).rows[0].subjects[0]; eq([s.previousResults[0].results[0].value,s.studentResults[0].value,s.classResults[0].value], [9.4,0,12]); });
test('Bulletin détaillé : cellules fusionnées classe/minimum/maximum séparées', () => eq(parseBulletin([numericPage()]).rows[0].subjects[0].rangeRaw,'5,00 19,00'));
test('Bulletin multipage : matière de page 2 sans avis conservée', () => { const r = parseBulletin([numericPage(),numericPage(2)]); eq([r.rows[0].subjects.length,r.rows[0].subjects[1].appreciation,r.rows[0].subjects[1].sourcePage],[2,null,2]); });
test('Bulletin multipage : orientation et mention séparées de la conclusion', () => { const r = parseBulletin([numericPage(),numericPage(2)]).rows[0]; eq([r.generalAppreciation,r.orientationRaw.includes('avis réservé'),r.mentionsRaw.includes('Encouragements')],['Conclusion fictive.',true,true]); });
test('Bulletin NR : marqueur courant distinct du rappel précédent', () => { const p = numericPage(); p.items.push({text:'N.R.',x:185,y:154,width:8,height:6,fontName:'normal'}); eq(parseBulletin([p]).rows[0].subjects[0].nonRepresentative,true); });
test('Bulletin positions sous Moyennes : aucune conversion en note', () => { const p=competencyPage(); p.items=p.items.filter(i=>!['Compétences évaluées','Détail des évaluations','Pos.','Écrire','Calculer'].includes(i.text)); p.items.push({text:'Élève',x:127,y:140},{text:'Clas.',x:149,y:140},{text:'\uE9AC',x:130,y:164}); p.items.filter(i=>i.x===412).forEach(i=>{i.x=131;}); const r=parseBulletin([p]); eq([r.layout,r.rows[0].subjects[0].mastery.value,r.rows[0].subjects[0].studentResults],['positions',3,[]]); });
test('Bulletin mixte : positionnement et moyenne peuvent coexister', () => { const p=numericPage(); p.items.push({text:'Pos.',x:145,y:135},{text:'3',x:147,y:165}); const s=parseBulletin([p]).rows[0].subjects[0]; eq([s.mastery.value,s.studentResults[0].value],[3,0]); });
test('Suivi annuel : T1 T2 T3 distincts, zéro et N.Not préservés', () => { const make=(trimester,raw)=>({trimester,updatedAt:trimester,payload:{subjects:[{subject:'Français',teacher:'Mme Fictif',studentResults:[grade(raw)]}]}}); eq(annualBulletinRows([make(1,'0'),make(2,'N.Not'),make(3,'12,00')])[0].periods.map(p=>p.text),['0','N.Not','12,00']); });
test('Suivi annuel : enseignants et lignes répétées ne sont pas fusionnés', () => { const source={trimester:1,payload:{subjects:[{subject:'Sciences',teacher:'A'},{subject:'Sciences',teacher:'B'},{subject:'Sciences',teacher:'A'}]}}; const rows=annualBulletinRows([source]); eq([rows.length,rows.every(r=>r.periods[1]===null && r.periods[2]===null)],[3,true]); });
