// demo.js — Données de démonstration ENTIÈREMENT FICTIVES (noms inventés, « photos » dessinées).
import * as db from './db.js';
import { schoolYearFor, MOTIFS } from './model.js';
import { todayISO } from './ui.js';
import { normClasse } from './ical.js';

const PRENOMS = ['Inès', 'Noah', 'Chloé', 'Yanis', 'Léna', 'Mathis', 'Jade', 'Enzo', 'Manon', 'Adam', 'Louise', 'Rayan', 'Lina', 'Hugo', 'Zoé',
  'Nathan', 'Maëlys', 'Lucas', 'Sarah', 'Tom', 'Emma', 'Ilyes', 'Camille', 'Théo', 'Anaïs', 'Sacha', 'Romane', 'Kylian', 'Alice', 'Bilal',
  'Eva', 'Axel', 'Nina', 'Liam', 'Jules', 'Rose', 'Gabin', 'Lou', 'Malo', 'Agathe', 'Nolan', 'Clara', 'Timéo', 'Mila', 'Evan', 'Lana',
  'Maxime', 'Yasmine', 'Sofiane', 'Margaux', 'Aaron', 'Léonie', 'Robin', 'Capucine', 'Ethan', 'Alix', 'Samuel', 'Elsa', 'Mohamed', 'Juliette'];
const NOMS = ['ARNAUD', 'BAILLY', 'BENOÎT', 'BERTRAND', 'BOUCHER', 'CARON', 'CHEVALIER', 'COLIN', 'DA SILVA', 'DELMAS', 'DUPRÉ', 'FAURE',
  'FONTAINE', 'GARNIER', 'GAUTHIER', 'GIRARD', 'GUÉRIN', 'HAMEL', 'JOLY', 'LAMBERT', 'LEBRUN', 'LEMAIRE', 'MARCHAND', 'MOREL', 'NICOLAS',
  'PERRIN', 'ROCHE', 'ROUSSEL', 'SCHMITT', 'VIDAL', 'VINCENT', 'WEBER', 'ZIMMER', 'BRUNET', 'LEROY', 'MARTINEZ', 'PICARD', 'RENAUD',
  'TESSIER', 'AUBERT', 'BARBIER', 'COSTA', 'DUMONT', 'ÉTIENNE', 'FERRAND', 'GILLET', 'HUBERT', 'JACOB', 'LACROIX', 'MEUNIER'];

const K = (code, label, pronote = '') => ({ id: db.uid(), code, label, pronote });
const PROJECTS = {
  lanceur: ['Lanceur', 'Concevoir et construire un lanceur de balle en groupe, tester sa portée sur piste et rédiger le dossier de conception.', 8,
    () => [K('C1', 'Présentation'), K('C2', 'Test & construction', 'Réaliser un prototype'), K('C3', 'Dossier', 'Communiquer une solution'), K('C4', 'Comportement & rangement')]],
  theatre: ["Théâtre d'ombre augmenté", 'Créer un théâtre d’ombre animé par une carte programmable : décor, éclairage piloté et scénario.', 12,
    () => ['Cahier des charges', 'Croquis du décor', 'Chaîne d’information', 'Programme', 'Câblage', 'Essais', 'Présentation orale'].map((l, i) => K('D' + (i + 1), l))],
  domotique: ['Maison domotique', 'Équiper une maquette de maison de capteurs et programmer l’éclairage et l’alarme.', 10,
    () => [K('C1', 'Analyse du besoin'), K('C2', 'Programme'), K('C3', 'Câblage'), K('C4', 'Essais'), K('C5', 'Comportement & rangement')]],
  porte: ['Porte-clés', 'Dessiner un porte-clés personnalisé en DAO et le fabriquer à la découpeuse laser.', 9,
    () => [K('C1', 'Croquis'), K('C2', 'Dessin DAO'), K('C3', 'Fabrication'), K('C4', 'Comportement & rangement')]],
  eolienne: ['Éolienne', 'Étudier la chaîne d’énergie d’une éolienne et mesurer la tension produite selon la vitesse du vent.', 5,
    () => [K('C1', 'Chaîne d’énergie'), K('C2', 'Mesures'), K('C3', 'Bilan')]],
  robot: ['Robot suiveur', 'Programmer un robot qui suit une ligne noire et s’arrête devant un obstacle.', 6,
    () => [K('C1', 'Algorigramme'), K('C2', 'Programme'), K('C3', 'Capteurs'), K('C4', 'Essais sur piste'), K('C5', 'Comportement & rangement')]],
  boite: ['Boîte à crayons', 'Fabriquer une boîte à crayons en bois : traçage, découpe, assemblage.', 4, () => [K('C1', 'Traçage'), K('C2', 'Découpe'), K('C3', 'Assemblage')]],
  lampe: ['Lampe de poche', 'Réaliser le circuit électrique d’une lampe de poche et son boîtier.', 8,
    () => [K('C1', 'Schéma électrique'), K('C2', 'Soudure'), K('C3', 'Boîtier'), K('C4', 'Comportement & rangement')]],
  serre: ['Mini-serre', 'Construire une mini-serre et mesurer température et humidité.', 6,
    () => [K('C1', 'Plan'), K('C2', 'Construction'), K('C3', 'Mesures'), K('C4', 'Comportement & rangement')]],
};

// [nom, niveau, SEGPA, effectif, [[projet, statut, séances faites]]]
const CLASSES = [
  ['6e SEGPA', '6e', true, 14, [['boite', 'cours', 3]]],
  ['5e SEGPA', '5e', true, 15, [['porte', 'cours', 2]]],
  ['4e SEGPA', '4e', true, 13, [['lampe', 'cours', 5]]],
  ['3e SEGPA', '3e', true, 12, [['serre', 'cours', 1]]],
  ['5e A', '5e', false, 28, [['domotique', 'cours', 3]]],
  ['5e B', '5e', false, 27, [['domotique', 'cours', 2]]],
  ['5e C', '5e', false, 29, [['domotique', 'cours', 3]]],
  ['4e A', '4e', false, 29, [['eolienne', 'fini', 5], ['lanceur', 'cours', 3], ['porte', 'avenir', 0]]],
  ['4e B', '4e', false, 30, [['eolienne', 'fini', 5], ['lanceur', 'cours', 4], ['robot', 'cours', 1], ['porte', 'avenir', 0]]],
  ['4e C', '4e', false, 28, [['eolienne', 'fini', 5], ['lanceur', 'cours', 3]]],
  ['3e E', '3e', false, 27, [['theatre', 'cours', 3]]],
  ['3e F', '3e', false, 28, [['theatre', 'cours', 2]]],
  ['3e G', '3e', false, 29, [['theatre', 'cours', 3]]],
];

const JOURNAL = ['Présentation du projet et du cahier des charges. Constitution des groupes.', 'Recherche d’idées, premiers croquis.',
  'Choix des solutions par groupe, liste du matériel.', 'Début de la réalisation. Rangement à revoir en fin d’heure.',
  'Suite de la réalisation, premiers essais.', 'Essais et corrections. Deux groupes en retard.', 'Finitions et préparation de la présentation.',
  'Présentations orales et auto-évaluation.'];

function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

function drawPhoto(r) {
  const c = document.createElement('canvas');
  c.width = 240; c.height = 360;
  const g = c.getContext('2d');
  const hue = Math.floor(r() * 360);
  g.fillStyle = `hsl(${hue} 40% 88%)`; g.fillRect(0, 0, 240, 360);
  g.fillStyle = `hsl(${hue} 25% 68%)`;
  g.beginPath(); g.arc(120, 150, 60, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(10, 360); g.bezierCurveTo(16, 268, 66, 232, 120, 232); g.bezierCurveTo(174, 232, 224, 268, 230, 360); g.closePath(); g.fill();
  const bin = atob(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

// Dates de séances : deux par semaine environ, la dernière il y a `lastAgo` jours.
function seanceDates(k, lastAgo) {
  const out = [];
  let d = new Date(); d.setDate(d.getDate() - lastAgo);
  for (let i = 0; i < k; i++) { out.unshift(todayISO(d)); d = new Date(d); d.setDate(d.getDate() - (i % 2 ? 4 : 3)); }
  return out;
}

// Emploi du temps FICTIF d'un collège imaginaire : chaque classe de démonstration a 2 heures de technologie
// par semaine, toute l'année, avec vacances, un cours de vie de classe et une réunion (masquée par défaut).
const CRENEAUX = [['08:15', '09:10'], ['09:11', '10:06'], ['10:22', '11:17'], ['11:18', '12:13'], ['13:54', '14:49'], ['15:05', '16:00'], ['16:14', '17:09']];
function demoPlanning(put, classes, students = null, r = null) {
  const y = +schoolYearFor().slice(0, 4);
  const iso = (yy, m, d) => `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const jours = [
    [iso(y, 10, 17), iso(y, 11, 1), 'vacances', 'Vacances'], [iso(y, 11, 11), iso(y, 11, 11), 'ferie', 'Férié'],
    [iso(y, 12, 19), iso(y + 1, 1, 3), 'vacances', 'Vacances'], [iso(y + 1, 2, 20), iso(y + 1, 3, 7), 'vacances', 'Vacances'],
    [iso(y + 1, 4, 17), iso(y + 1, 5, 2), 'vacances', 'Vacances'], [iso(y + 1, 5, 8), iso(y + 1, 5, 8), 'ferie', 'Férié'],
  ];
  const off = d => jours.some(([du, au]) => d >= du && d <= au);
  const pronoteName = c => c.name.replace(/^(\d)e /, '$1 ');
  const etab = put('etablissements', {
    name: 'COLLEGE DES TILLEULS', initiales: 'TL', color: '#3d7dd8', importedAt: new Date().toISOString(),
    classes: Object.fromEntries(classes.map(c => [normClasse(pronoteName(c)), { name: pronoteName(c), classId: c.id }])),
  });
  for (const [du, au, type, label] of jours) put('jours', { etabId: etab.id, du, au, type, label });
  // Créneaux de la semaine (jour 1 = lundi … 5 = vendredi) : chaque classe en a deux, des jours différents.
  const slots = [];
  for (let d = 1; d <= 5; d++) for (const t of CRENEAUX) slots.push([d, t]);
  const weekly = [];
  classes.forEach((c, k) => {
    weekly.push({ c, slot: slots[(k * 2) % slots.length], matiere: 'TECHNOLOGIE' });
    weekly.push({ c, slot: slots[(k * 2 + 17) % slots.length], matiere: 'TECHNOLOGIE' });
  });
  weekly.push({ c: classes.find(c => c.name === '5e A'), slot: [4, CRENEAUX[6]], matiere: 'VIE DE CLASSE' });
  weekly.push({ c: null, slot: [2, ['17:15', '18:30']], matiere: 'COORDINATION/CONCERTATION' });
  const today = todayISO();
  const near = [];
  for (let day = new Date(y, 8, 1, 12); day < new Date(y + 1, 6, 4, 12); day.setDate(day.getDate() + 1)) {
    const date = todayISO(day), wd = day.getDay();
    if (wd === 0 || wd === 6 || off(date)) continue;
    for (const { c, slot: [d, [debut, fin]], matiere } of weekly) {
      if (d !== wd) continue;
      const rec = put('cours', { etabId: etab.id, date, debut, fin, classe: c ? pronoteName(c) : '', salle: c ? 'Techno 1' : 'Salle des profs',
        matiere, statut: 'normal', statutLabel: '', source: 'pronote' });
      if (c && matiere === 'TECHNOLOGIE' && date > today && date <= todayISO(new Date(Date.now() + 9 * 864e5))) near.push(rec);
    }
  }
  // Appels fictifs sur les cours passés (pour les statistiques de présence) : quelques absences et retards.
  if (students && r) {
    const past = put.data.cours.filter(c => c.classe && c.date < today && c.date >= iso(y, 9, 1));
    for (const c of past) {
      const cls = classes.find(k => pronoteName(k) === c.classe);
      if (!cls) continue;
      const at = new Date(c.date + 'T' + c.debut + ':00');
      at.setMinutes(at.getMinutes() + 3);
      const ap = put('appels', { classId: cls.id, date: c.date, at: at.toISOString(), n: 1, coursId: c.id, assignmentId: null, seanceId: null, seanceN: null, label: 'cours de ' + c.debut });
      for (const s of students.get(cls.id) || []) {
        const x = r();
        const base = { studentId: s.id, classId: cls.id, appelId: ap.id, date: c.date, at: ap.at, trimester: 1, assignmentId: null, seanceId: null, seanceN: null, seanceLabel: '' };
        if (x < 0.05) put('absences', base); else if (x < 0.08) put('retards', base);
      }
    }
  }
  // Quelques statuts Pronote dans les jours qui viennent.
  const set = (rec, statut, statutLabel) => { if (rec) Object.assign(rec, { statut, statutLabel }); };
  set(near[1], 'annule', 'Annulé');
  set(near[4], 'classe_absente', 'Classe absente');
  set(near[7], 'sortie', 'Sortie pédagogique');
  set(near[10], 'salle', 'Changement de salle');
  if (near[1]) put('cours', { ...near[1], id: undefined, debut: '16:14', fin: '17:09', statut: 'deplace', statutLabel: 'Déplacé' });
  // Événements hors Pronote, cette semaine et la suivante.
  const lundi = new Date(); lundi.setHours(12, 0, 0, 0); lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  const jour = n => { const d = new Date(lundi); d.setDate(d.getDate() + n); return todayISO(d); };
  put('evenements', { date: jour(1), debut: '17:30', fin: '18:30', type: 'reunion', titre: 'Conseil pédagogique', lieu: 'Salle des professeurs' });
  put('evenements', { date: jour(3), debut: '16:30', fin: '19:00', type: 'parents', titre: '', lieu: 'Salle 12', classId: (classes.find(c => c.name === '5e A') || {}).id, note: 'Prévoir les bulletins' });
  put('evenements', { date: jour(12), debut: '09:00', fin: '12:00', type: 'portes', titre: '', lieu: 'Atelier techno' });
}

export async function loadDemo() {
  const r = rng(20262027);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const now = Date.now();
  const data = Object.fromEntries(db.STORES.map(s => [s, []]));
  const put = (s, rec) => { rec.id = rec.id || db.uid(); rec.updatedAt = now; data[s].push(rec); return rec; };
  put.data = data;
  const studentsByClass = new Map();

  put('meta', { id: 'schoolYear', value: schoolYearFor() });
  put('meta', { id: 'trimester', value: 1 });
  put('meta', { id: 'trimesterStarts', value: { 1: todayISO(new Date(now - 40 * 864e5)) } });

  const proj = {};
  for (const [k, [title, desc, nSeances, crit]] of Object.entries(PROJECTS)) proj[k] = put('projects', { title, desc, nSeances, criteria: crit() });

  const allClasses = [];
  for (const [name, level, segpa, eff, assigns] of CLASSES) {
    const cls = put('classes', { name, level, segpa, year: schoolYearFor() });
    allClasses.push(cls);
    const students = [];
    const noms = NOMS.map(n => [r(), n]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const prenoms = PRENOMS.map(n => [r(), n]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    for (let i = 0; i < eff; i++) {
      const prenom = prenoms[i], nom = noms[i];
      const missing = i === 4 || i === eff - 3;
      let photoId = null;
      if (!missing) photoId = put('photos', { blob: drawPhoto(r) }).id;
      students.push(put('students', { classId: cls.id, nom, prenom, photoId }));
    }

    studentsByClass.set(cls.id, students);
    const seanceLabels = [];
    let lastAgo = 2;
    for (const [pk, status, done] of assigns) {
      const p = proj[pk];
      const a = put('assignments', { classId: cls.id, projectId: p.id, status, endedAt: null });
      const dates = status === 'fini' ? seanceDates(done, 30) : seanceDates(done, lastAgo);
      if (status === 'cours') lastAgo += 1;
      if (status === 'fini') a.endedAt = dates[dates.length - 1];
      dates.forEach((date, i) => {
        put('seances', { assignmentId: a.id, n: i + 1, date, text: JOURNAL[Math.min(i, JOURNAL.length - 1)] });
        if (status === 'cours') seanceLabels.push({ date, n: i + 1, a: a.id, label: 'Séance ' + (i + 1) + ' · ' + p.title });
      });
      if (status === 'avenir') continue;
      // Groupes de 4 (le Robot suiveur n'a que 4 groupes : il reste des élèves sans groupe).
      const shuffled = pk === 'robot' ? students.slice(0, 16) : students;
      const groups = [];
      const k = Math.ceil(shuffled.length / 4);
      for (let i = 0; i < k; i++) groups.push(shuffled.slice(Math.round(i * shuffled.length / k), Math.round((i + 1) * shuffled.length / k)));
      groups.forEach((m, gi) => {
        const levels = {};
        p.criteria.forEach((c, ci) => {
          const evaluated = status === 'fini' || ci < Math.min(2, done - 1);
          if (evaluated && r() > 0.1) levels[c.id] = 1 + Math.floor(r() * 4 * 0.75 + r() * 1.2);
        });
        for (const k of Object.keys(levels)) levels[k] = Math.max(1, Math.min(4, levels[k]));
        put('groups', { assignmentId: a.id, code: 'G' + String(gi + 1).padStart(2, '0'), members: m.map(s => s.id), comment: '', levels });
      });
      // Exemple d'ajustement individuel et de changement de groupe (4e B, Lanceur).
      if (name === '4e B' && pk === 'lanceur') {
        const absent = groups[5][0], moved = groups[1][3];
        put('evals', { assignmentId: a.id, studentId: absent.id, carried: {}, adj: { [p.criteria[1].id]: 1 }, motif: 'Absent', precision: 'Absent pendant les tests (fictif)' });
        put('groupChanges', { assignmentId: a.id, studentId: moved.id, from: 'G03', to: 'G02', at: new Date(dates[2] + 'T10:00').toISOString(), seanceN: 3 });
      }
    }

    // Observations du trimestre 1.
    for (const s of students) {
      const nNeg = Math.floor(r() * r() * 6), nPos = Math.floor(r() * 6);
      for (const [type, n] of [['neg', nNeg], ['pos', nPos]]) {
        for (let i = 0; i < n; i++) {
          const sl = seanceLabels.length ? pick(seanceLabels) : null;
          const date = sl ? sl.date : todayISO(new Date(now - Math.floor(r() * 20) * 864e5));
          const at = new Date(date + 'T' + String(8 + Math.floor(r() * 9)).padStart(2, '0') + ':' + String(Math.floor(r() * 60)).padStart(2, '0') + ':00').toISOString();
          put('observations', {
            studentId: s.id, classId: cls.id, type, motif: r() < 0.5 ? pick(MOTIFS[type]) : '', at, trimester: 1, origin: 'tap',
            assignmentId: sl ? sl.a : null, seanceN: sl ? sl.n : null, seanceLabel: sl ? sl.label : '',
          });
        }
      }
      if (r() < 0.15 && seanceLabels.length) {
        const sl = pick(seanceLabels);
        put('absences', { studentId: s.id, classId: cls.id, date: sl.date, at: new Date(sl.date + 'T08:05').toISOString(), trimester: 1,
          assignmentId: sl.a, seanceN: sl.n, seanceLabel: sl.label });
      }
      if (r() < 0.12) put('notes', { studentId: s.id, text: pick(['Travaille mieux en binôme.', 'À placer devant, consignes écrites au tableau.', 'Très investi dans le projet.', 'Oublie souvent son matériel.']), at: new Date(now - Math.floor(r() * 15) * 864e5).toISOString() });
    }
  }
  demoPlanning(put, allClasses, studentsByClass, r);
  await db.replaceAll(data);
}
