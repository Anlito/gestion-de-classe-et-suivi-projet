// agenda.js — Copie du planning dans Google Agenda (1.21.0), dans un agenda à part « Carnet de classe ».
//
// Sens unique : l'app → Google Agenda (ce qui est modifié directement dans Google Agenda est écrasé).
// Contenu (choix du professeur) : les cours du planning (hors matières masquées) et les événements hors Pronote, toute
// l'année ; un cours annulé (annulé, classe absente, absence personnelle) est retiré de l'agenda. Pas de vacances, ni
// de notes, ni de matériel.
// Couleurs (choix du professeur) : une famille de couleurs par collège ; nuance foncée = cours, moyenne = vie de classe
// (« appel seulement »), claire = rendez-vous (événements). Le type est aussi écrit dans le titre.
//
// Chaque élément a un identifiant d'événement Google STABLE (calculé à partir de l'identifiant dans l'app) : la tablette
// et l'ordinateur peuvent synchroniser tous les deux sans créer de doublons. Ce qui a déjà été envoyé est mémorisé
// (meta.agendaEtat = { idGoogle: empreinte }, synchronisé par Drive) : seuls les changements sont renvoyés.
// Réglage meta.agenda = { actif, calendarId } (synchronisé : un seul agenda pour tous les appareils).
import * as db from './db.js';
import * as planning from './planning.js';
import * as drive from './drive.js';

const CAL = 'https://www.googleapis.com/calendar/v3';
const NOM = 'Carnet de classe';
const DELAI = 8000;

export const config = () => db.getMeta('agenda', {}) || {};
const setConfig = patch => db.commit(w => w.meta('agenda', { ...config(), ...patch }), { track: false });
const etat = () => db.getMeta('agendaEtat', {}) || {};

// ---------- Couleurs Google Agenda (colorId 1 à 11) ----------
// Familles [cours, vie de classe, rendez-vous] selon la couleur du collège dans l'app (planning.PALETTE).
const FAMILLES = {
  '#3d7dd8': ['9', '7', '1'],   // bleu : Myrtille, Paon, Lavande
  '#d9822b': ['6', '5', '4'],   // orange : Mandarine, Banane, Flamant
  '#2f9e6e': ['10', '2', '5'],  // vert : Basilic, Sauge, Banane
  '#b04fc4': ['3', '1', '4'],   // violet : Raisin, Lavande, Flamant
  '#c9434f': ['11', '6', '4'],  // rouge : Tomate, Mandarine, Flamant
  '#8a6d3b': ['8', '5', '2'],   // brun : Graphite, Banane, Sauge
};
const SANS_COLLEGE = ['8', '8', '8']; // Graphite
const famille = etab => FAMILLES[etab && etab.color] || SANS_COLLEGE;
const etabDeClasse = classId => db.all('etablissements').find(e => Object.values(e.classes || {}).some(m => m.classId === classId)) || null;

// Couleurs affichées par Google Agenda (pour la légende dans l'app).
export const HEX = { 1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e', 7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000' };
export const legende = () => planning.etablissements().map(e => ({ initiales: e.initiales, name: e.name, couleurs: famille(e).map(id => HEX[id]) }));

// ---------- Identifiants Google stables ----------
// Caractères autorisés par Google : a-v et 0-9, 5 à 1024 caractères.
function idGoogle(key) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < key.length; i++) { const c = key.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return 'cdc' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
const empreinte = o => { const s = JSON.stringify(o); let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const quand = (date, hhmm) => ({ dateTime: `${date}T${hhmm}:00`, timeZone: 'Europe/Paris' });
const joli = m => { const s = (m || '').trim().toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

// Ce que l'agenda doit contenir : Map idGoogle → événement Google.
export function souhaite() {
  const out = new Map();
  const etabs = Object.fromEntries(db.all('etablissements').map(e => [e.id, e]));
  for (const c of db.all('cours').map(planning.eff)) {
    const role = planning.roleOfCours(c);
    if (role === 'masque' || planning.OFF.has(c.statut)) continue;
    const etab = etabs[c.etabId] || null;
    const classId = planning.classIdOf(c.src);
    const cls = classId ? db.get('classes', classId) : null;
    const nom = cls ? cls.name : c.classe || joli(c.matiere);
    const vdc = role === 'appel';
    const type = vdc ? (c.matiere ? joli(c.matiere) : 'Vie de classe') : (c.matiere ? joli(c.matiere) : 'Cours');
    const ev = {
      summary: `${nom} · ${type}${etab ? ' · ' + etab.initiales : ''}`,
      location: c.salle || '',
      start: quand(c.date, c.debut), end: quand(c.date, c.fin),
      colorId: famille(etab)[vdc ? 1 : 0],
      status: 'confirmed', transparency: 'opaque',
    };
    out.set(idGoogle('cours:' + c.id), ev);
  }
  for (const e of db.all('evenements')) {
    const cls = e.classId ? db.get('classes', e.classId) : null;
    const etab = cls ? etabDeClasse(cls.id) : null;
    out.set(idGoogle('evt:' + e.id), {
      summary: `${planning.titreEvt(e)}${cls ? ' · ' + cls.name : ''}${etab ? ' · ' + etab.initiales : ''}`,
      location: e.lieu || '',
      start: quand(e.date, e.debut), end: quand(e.date, e.fin),
      colorId: famille(etab)[2],
      status: 'confirmed', transparency: 'opaque',
    });
  }
  return out;
}

// ---------- Appels Google ----------
const attendre = ms => new Promise(r => setTimeout(r, ms));
async function appel(url, opts, essais = 4) {
  for (let i = 0; ; i++) {
    try { return await drive.api(url, opts); }
    catch (e) {
      // Trop de demandes d'un coup : on patiente un peu et on recommence.
      if ((e.status === 429 || (e.status === 403 && /rate|quota|limit/i.test(e.message))) && i < essais) { await attendre(1000 * 2 ** i); continue; }
      throw e;
    }
  }
}
const json = body => ({ body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
// Crée ou remplace un événement à identifiant fixe (y compris un événement supprimé auparavant : il est rétabli).
async function ecrire(calId, id, ev, neuf = false) {
  const base = `${CAL}/calendars/${encodeURIComponent(calId)}/events`;
  if (neuf) {
    // Jamais envoyé depuis cet agenda : création directe ; déjà là (autre appareil) → remplacement.
    try { await appel(base, { method: 'POST', ...json({ ...ev, id }) }); return; }
    catch (e) { if (e.status !== 409) throw e; }
  }
  try { await appel(`${base}/${id}`, { method: 'PUT', ...json({ ...ev, id }) }); }
  catch (e) {
    if (!e.notFound) throw e;
    try { await appel(base, { method: 'POST', ...json({ ...ev, id }) }); }
    catch (e2) { if (e2.status === 409) await appel(`${base}/${id}`, { method: 'PUT', ...json({ ...ev, id }) }); else throw e2; }
  }
}
async function effacer(calId, id) {
  try { await appel(`${CAL}/calendars/${encodeURIComponent(calId)}/events/${id}`, { method: 'DELETE' }); }
  catch (e) { if (!e.notFound) throw e; }
}

// ---------- Synchronisation ----------
let enCours = null, timer = null;
let progres = null; // { fait, total } pendant une synchronisation
export const etatSync = () => ({ enCours: !!enCours, progres, ...config() });
const ecouteurs = new Set();
export const onProgres = fn => { ecouteurs.add(fn); return () => ecouteurs.delete(fn); };
const signaler = () => { for (const fn of ecouteurs) { try { fn(etatSync()); } catch (e) { /* rien */ } } };

// Activation (toucher du professeur) : demande l'autorisation Google Agenda, crée l'agenda « Carnet de classe ».
export async function activer() {
  await drive.connect(true, { agenda: true });
  if (!drive.aLAgenda()) throw new Error('Google n’a pas donné l’accès à l’agenda : vérifiez dans la console Google que l’« API Google Calendar » est activée et que le champ « calendar.app.created » est ajouté (voir le guide).');
  let { calendarId } = config();
  if (calendarId) { try { await appel(`${CAL}/calendars/${encodeURIComponent(calendarId)}`); } catch (e) { if (e.notFound) calendarId = null; else throw e; } }
  if (!calendarId) {
    const cal = await appel(`${CAL}/calendars`, { method: 'POST', ...json({ summary: NOM, timeZone: 'Europe/Paris', description: 'Emploi du temps et rendez-vous du Carnet de classe (mis à jour automatiquement par l’application).' }) });
    calendarId = cal.id;
    db.commit(w => w.meta('agendaEtat', {}), { track: false });
  }
  setConfig({ actif: true, calendarId, erreur: null });
  return synchroniser();
}
export function desactiver() { setConfig({ actif: false }); }

// Envoie les différences. Renvoie { crees, modifies, retires } ; null si inactif ou pas connecté.
export function synchroniser() {
  enCours = enCours || (async () => {
    const cfg = config();
    if (!cfg.actif || !cfg.calendarId || db.archive()) return null;
    if (!drive.connected()) { try { await drive.connect(false); } catch (e) { return null; } }
    if (!drive.aLAgenda()) return null;
    const avant = { ...etat() };
    const voulu = souhaite();
    const taches = [];
    for (const [id, ev] of voulu) { const h = empreinte(ev); if (avant[id] !== h) taches.push({ id, ev, h, neuf: !avant[id] }); }
    const aRetirer = Object.keys(avant).filter(id => !voulu.has(id));
    const total = taches.length + aRetirer.length;
    const stats = { crees: 0, modifies: 0, retires: 0 };
    if (!total) { setConfig({ derniere: new Date().toISOString(), erreur: null }); return stats; }
    progres = { fait: 0, total }; signaler();
    const nouvelEtat = { ...avant };
    let dernierEnregistrement = Date.now();
    const sauver = () => db.commit(w => w.meta('agendaEtat', { ...nouvelEtat }), { track: false });
    const travaux = [
      ...taches.map(t => async () => { await ecrire(cfg.calendarId, t.id, t.ev, t.neuf); nouvelEtat[t.id] = t.h; stats[t.neuf ? 'crees' : 'modifies']++; }),
      ...aRetirer.map(id => async () => { await effacer(cfg.calendarId, id); delete nouvelEtat[id]; stats.retires++; }),
    ];
    // 3 envois à la fois (Google limite le nombre de demandes par seconde) ; l'avancement est enregistré au fil de l'eau.
    let i = 0, erreur = null;
    const ouvrier = async () => {
      while (i < travaux.length && !erreur) {
        const t = travaux[i++];
        try { await t(); } catch (e) { erreur = e; break; }
        progres.fait++; signaler();
        if (Date.now() - dernierEnregistrement > 5000) { dernierEnregistrement = Date.now(); sauver(); }
      }
    };
    await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
    sauver();
    progres = null;
    if (erreur) { setConfig({ erreur: erreur.message }); signaler(); throw erreur; }
    setConfig({ derniere: new Date().toISOString(), erreur: null, stats });
    signaler();
    return stats;
  })().finally(() => { enCours = null; signaler(); });
  return enCours;
}

// Automatique : quelques secondes après un changement du planning (import Pronote, cours déplacé, événement…).
const STORES_PLANNING = new Set(['cours', 'evenements', 'etablissements', 'classes', 'meta']);
export function planifier(ms = DELAI) {
  clearTimeout(timer);
  if (!config().actif) return;
  timer = setTimeout(() => { synchroniser().catch(() => {}); }, ms);
}
export function initAgenda() {
  db.onChange(info => {
    if (info.archive || db.archive() || !config().actif) return;
    const stores = info.stores || [];
    // Ne pas réagir à nos propres enregistrements (état de l'agenda, réglages de l'appareil).
    const keys = info.keys || [];
    if (keys.length && keys.every(k => k === 'meta:agendaEtat' || k === 'meta:agenda' || (k.startsWith('meta:') && db.LOCAL_META.has(k.slice(5))))) return;
    if (stores.some(s => STORES_PLANNING.has(s)) || info.reset) planifier();
  });
  planifier(12000); // à l'ouverture (après la synchronisation Drive)
}
