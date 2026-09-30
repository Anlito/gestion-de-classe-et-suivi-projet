// ical.js — Lecture d'un emploi du temps exporté par Pronote (format iCal, .ics), entièrement sur l'appareil.
//
// Ce que Pronote met dans le fichier (constaté sur les exports 2026-2027) :
// - un VEVENT par cours de l'année, déjà daté (pas de répétition RRULE, l'alternance A/B est appliquée) ;
// - lignes longues repliées (la suite commence par une espace), échappements \, \; \n et codes HTML (&lt; &gt;) ;
// - heures en UTC (suffixe Z) : converties ici en heure de Paris (changement d'heure compris) ;
// - DESCRIPTION : « Matière : », « Classe : » ou « Groupe : », « Salle : », « Professeur : »… ;
// - CATEGORIES : « Cours », « Cours - Cours annulé », « Jours fériés », « Agenda »…
//   Un « Cours déplacé » est le NOUVEAU créneau (le cours a lieu) ; l'ancien apparaît en « Cours annulé ».
//
// Seul le nécessaire est gardé : date, heures, établissement, classe ou groupe, salle, matière, statut.
// Les noms des professeurs, les résumés et les descriptions complètes ne sont jamais conservés.
// Les événements « Agenda » et « Sessions de stage » sont ignorés : le planning ne montre que les cours
// (plus les vacances et jours fériés, qui coupent les alertes).

// Statuts d'un cours, d'après CATEGORIES « Cours - … ».
export const STATUTS = {
  normal: { label: '', alerte: true },
  deplace: { label: 'Déplacé', alerte: true },
  modifie: { label: 'Modifié', alerte: true },
  maintenu: { label: 'Maintenu', alerte: true },
  salle: { label: 'Changement de salle', alerte: true },
  annule: { label: 'Annulé', alerte: false },
  classe_absente: { label: 'Classe absente', alerte: false },
  sortie: { label: 'Sortie pédagogique', alerte: false },
  abs_perso: { label: 'Absence personnelle', alerte: false },
  autre: { label: 'Modifié', alerte: true },
};
const CATEGORIE_STATUT = {
  'cours annulé': 'annule',
  'classe absente': 'classe_absente',
  'cours déplacé': 'deplace',
  'cours modifié': 'modifie',
  'cours maintenu': 'maintenu',
  'changement de salle': 'salle',
  'sortie pédagogique': 'sortie',
  'abs personnelle': 'abs_perso',
};

// ---------- Lecture bas niveau ----------
// Déplie les lignes repliées (RFC 5545 : saut de ligne suivi d'une espace ou d'une tabulation).
export const unfold = text => text.replace(/\r?\n[ \t]/g, '');

const ENTITES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: '\'', nbsp: ' ' };
// Texte iCal → texte lisible : échappements iCal puis codes HTML (Pronote écrit « &lt\;3C&gt\; »).
export function unescapeText(v) {
  return v
    .replace(/\\([\\,;nN])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c))
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENTITES[e.toLowerCase()] ?? m;
    });
}

// Une ligne « NOM;PARAM=x:valeur » → { name, params, value }.
function parseLine(line) {
  const m = /^([A-Za-z0-9-]+)((?:;[^:;]+=(?:"[^"]*"|[^:;]*))*):(.*)$/.exec(line);
  if (!m) return null;
  const params = {};
  for (const p of m[2].split(';').slice(1)) { const i = p.indexOf('='); params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, ''); }
  return { name: m[1].toUpperCase(), params, value: m[3] };
}

// ---------- Dates et heures ----------
const pad = n => String(n).padStart(2, '0');
let parisFmt = null;
// Instant UTC → { date: 'AAAA-MM-JJ', time: 'HH:MM' } à l'heure de Paris.
export function toParis(utcDate) {
  parisFmt = parisFmt || new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(parisFmt.formatToParts(utcDate).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
// Valeur DTSTART / DTEND → { date, time } (heure de Paris) ou { date, allDay: true }.
export function parseDateTime(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (params.VALUE === 'DATE' || m[4] === undefined) return { date, allDay: true };
  // Heure UTC (Z) : conversion ; sinon heure « locale » (TZID ou flottante) : déjà l'heure de Paris.
  if (m[7]) return toParis(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])));
  return { date, time: `${m[4]}:${m[5]}` };
}
// Jour précédent (les DTEND de journées entières sont exclusifs).
export function dayBefore(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ---------- Contenu Pronote ----------
// « Calendrier … généré par le logiciel PRONOTE … le 30 sept. 2026 - COLLEGE JULES VERNE - semaines 36 - 26 »
export function etablissementFrom(desc) {
  const parts = (desc || '').split(/\s+-\s+/);
  const i = parts.findIndex(p => /^semaines?\b/i.test(p));
  const name = i > 0 ? parts[i - 1] : parts.find(p => /coll[eè]ge|lyc[eé]e|[eé]cole/i.test(p));
  return name ? name.trim() : '';
}

// DESCRIPTION → { cle: valeur } (clés en minuscules, sans le pluriel : « classes » → « classe »).
function descriptionFields(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([^:]{2,40}?)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/s$/, '').replace(/s de /, ' de ');
    if (!(key in out)) out[key] = m[2].trim();
  }
  return out;
}

function statutFrom(categories) {
  const c = categories.trim();
  const m = /^cours\s*-\s*(.+)$/i.exec(c);
  if (!m) return { statut: 'normal', statutLabel: '' };
  const key = CATEGORIE_STATUT[m[1].trim().toLowerCase()];
  return key ? { statut: key, statutLabel: STATUTS[key].label } : { statut: 'autre', statutLabel: m[1].trim() };
}

// Nom de classe « comparable » : « 4 E », « 4E », « [4E] » → « 4E ».
export const normClasse = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[\s[\]().-]/g, '');

// Clé d'un cours pour la réimportation (les UID Pronote changent à chaque export).
export const coursKey = (etab, c) => [normClasse(etab), c.date, c.debut, normClasse(c.classe)].join('|');

// ---------- Lecture complète ----------
// Renvoie { etablissement, cours: [...], jours: [...], ignores: { agenda, stage, autres }, erreurs: [...] }
//   cours : { date, debut, fin, classe, salle, matiere, statut, statutLabel, multi }
//   jours : { du, au (inclus), type: 'vacances'|'ferie', label }
export function parseICS(text) {
  const lines = unfold(text).split(/\r?\n/);
  const res = { etablissement: '', cours: [], jours: [], ignores: { agenda: 0, stage: 0, autres: 0 }, erreurs: [] };
  let ev = null;
  for (const raw of lines) {
    if (!raw) continue;
    if (raw === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (raw === 'END:VEVENT') { if (ev) addEvent(res, ev); ev = null; continue; }
    const p = parseLine(raw);
    if (!p) continue;
    if (!ev) {
      if (p.name === 'X-WR-CALDESC') res.etablissement = etablissementFrom(unescapeText(p.value));
      continue;
    }
    if (!(p.name in ev)) ev[p.name] = p;
  }
  return res;
}

function addEvent(res, ev) {
  const cat = ev.CATEGORIES ? unescapeText(ev.CATEGORIES.value) : '';
  const summary = ev.SUMMARY ? unescapeText(ev.SUMMARY.value) : '';
  const start = ev.DTSTART && parseDateTime(ev.DTSTART.value, ev.DTSTART.params);
  const end = ev.DTEND && parseDateTime(ev.DTEND.value, ev.DTEND.params);
  if (!start) { res.erreurs.push('Événement sans date de début ignoré'); return; }

  if (/^jours f[ée]ri[ée]s$/i.test(cat)) {
    const au = end && end.allDay && end.date > start.date ? dayBefore(end.date) : start.date;
    res.jours.push({ du: start.date, au, type: /f[ée]ri[ée]/i.test(summary) ? 'ferie' : 'vacances', label: summary.trim() || 'Vacances' });
    return;
  }
  if (/^agenda$/i.test(cat)) { res.ignores.agenda++; return; }
  if (/stage/i.test(cat)) { res.ignores.stage++; return; }
  if (!/^cours\b/i.test(cat) || start.allDay) { res.ignores.autres++; return; }

  const f = descriptionFields(ev.DESCRIPTION ? unescapeText(ev.DESCRIPTION.value) : '');
  // Matière : champ « Matière », sinon début du résumé (« Cours annulé : TECHNOLOGIE - 4E »).
  const matiere = (f['matière'] || summary.replace(/^[^:]*:\s*/, '').split(' - ')[0] || '').trim();
  // Groupe (ex. « [3C1] ») prioritaire sur la classe ; plusieurs classes = événement collectif.
  const classe = (f.groupe || f.classe || '').trim();
  res.cours.push({
    date: start.date, debut: start.time, fin: end && !end.allDay ? end.time : start.time,
    classe, salle: (f.salle || (ev.LOCATION ? unescapeText(ev.LOCATION.value) : '')).trim(), matiere,
    ...statutFrom(cat), multi: /,/.test(classe),
  });
}
