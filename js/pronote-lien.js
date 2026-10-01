// pronote-lien.js — Emploi du temps Pronote mis à jour par lien (abonnement iCal), automatiquement le soir.
//
// Pronote n'autorise pas une page web à lire son calendrier (pas d'en-tête CORS) : l'app passe par un RELAIS,
// un petit Google Apps Script créé par le professeur dans SON compte Google (code fourni ci-dessous, guide dans
// Administration → Emploi du temps). L'app lui envoie le lien Pronote (dans le corps de la requête, pas dans
// l'adresse), il télécharge le calendrier et le renvoie. Personne d'autre n'intervient.
//
// Réglages (synchronisés entre appareils) : meta.relaisPronote = adresse du relais (…/exec) ;
// etablissements.lien = lien iCal Pronote (secret : équivaut à un mot de passe en lecture de l'emploi du temps),
// lienAt = dernière mise à jour réussie, lienErreur = dernier échec.
//
// Quand : chaque soir à partir de 18 h si l'app est ouverte, sinon à l'ouverture suivante ; et sur demande
// (« Mettre à jour maintenant »). La mise à jour automatique applique les choix par défaut des conflits (vos
// modifications l'emportent, vos cours avec appel / séance / note sont gardés) et ne relie aucune nouvelle classe
// d'elle-même (elle est signalée dans l'admin).
import * as db from './db.js';
import * as planning from './planning.js';
import { toast } from './ui.js';
import { refresh } from './nav.js';

export const SOIR = 18; // heure de la mise à jour automatique
const VERIF = 15 * 60 * 1000;

export const RELAIS_CODE = `// Relais « Carnet de classe » : télécharge un calendrier Pronote pour l'application.
function doGet() {
  return ContentService.createTextOutput('Relais Carnet de classe : OK');
}
function doPost(e) {
  var lien = String((e.postData && e.postData.contents) || '').trim();
  if (!/^https:\\/\\/[^\\/]+\\/pronote\\/ical\\//i.test(lien)) {
    return ContentService.createTextOutput('ERREUR: ce n’est pas un lien de calendrier Pronote');
  }
  var r = UrlFetchApp.fetch(lien, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) {
    return ContentService.createTextOutput('ERREUR: Pronote a répondu ' + r.getResponseCode());
  }
  return ContentService.createTextOutput(r.getContentText('UTF-8'));
}
`;

// ---------- Réglages ----------
export const relais = () => db.getMeta('relaisPronote', '') || '';
export const setRelais = url => db.commit(w => w.meta('relaisPronote', url));
// Adresse d'un déploiement Apps Script (« Application Web ») : https://script.google.com/macros/s/…/exec
export function extractRelais(text) {
  const m = (text || '').replace(/\s+/g, '').match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/);
  return m ? m[0] : null;
}
// Lien « abonnement » Pronote : https://…/pronote/ical/….ics?icalsecurise=…
export function extractLien(text) {
  const m = (text || '').replace(/\s+/g, '').match(/https:\/\/[^/\s]+\/pronote\/ical\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}
export const avecLien = () => planning.etablissements().filter(e => e.lien);

// ---------- Téléchargement par le relais ----------
export async function testerRelais(url = relais()) {
  let t;
  try { t = await (await fetch(url, { method: 'GET', redirect: 'follow' })).text(); }
  catch (e) { throw new Error('Relais injoignable : vérifiez l’adresse et que l’accès est « Tout le monde ».'); }
  if (!/Relais Carnet de classe/.test(t)) throw new Error('Cette adresse ne répond pas comme le relais : vérifiez le code collé et le déploiement (« Tout le monde »).');
  return true;
}
export async function telecharger(lien) {
  const url = relais();
  if (!url) throw new Error('Relais non configuré (Administration → Emploi du temps).');
  if (!navigator.onLine) throw new Error('Pas de connexion Internet.');
  let t;
  // text/plain : requête « simple », sans vérification préalable du navigateur (que le relais ne gère pas).
  try { t = await (await fetch(url, { method: 'POST', body: lien, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' })).text(); }
  catch (e) { throw new Error('Relais injoignable (connexion Internet, ou accès du relais différent de « Tout le monde »).'); }
  if (t.startsWith('ERREUR:')) throw new Error(t.slice(7).trim());
  if (!t.includes('BEGIN:VCALENDAR')) throw new Error(/<html/i.test(t) ? 'Le relais demande une connexion Google : redéployez-le avec l’accès « Tout le monde ».' : 'Réponse inattendue du relais.');
  return t;
}
// Lit le calendrier d'un lien → plan d'import (comme un fichier).
export async function planDuLien(lien, nom = 'Pronote') {
  const text = await telecharger(lien);
  return planning.readTexts([{ name: nom, text, lien }])[0];
}

// ---------- Mise à jour d'un établissement déjà importé ----------
// Renvoie { changes, nouvellesClasses, undo } ; lève une erreur (aussi enregistrée sur l'établissement).
export async function mettreAJour(etab) {
  let p;
  try {
    p = await planDuLien(etab.lien, etab.name);
    if (!p.etab || p.etab.id !== etab.id) throw new Error(`Ce lien donne l’emploi du temps de « ${p.etabName} », pas celui de ${etab.name}.`);
  } catch (e) {
    db.commit(w => w.update('etablissements', etab.id, { lienErreur: e.message }), { track: false });
    throw e;
  }
  // Les propositions de classes ne sont pas validées automatiquement : seules les correspondances déjà choisies servent.
  p.classes = p.classes.map(c => (c.suggested ? { ...c, classId: null, suggested: false } : c));
  const d = planning.previewOf(p);
  const changes = d.ajouts.length + d.modifs.length + d.suppressions.length + d.conflits.length;
  const nouvellesClasses = p.classes.filter(c => c.classId === null).map(c => c.name);
  const joursAvant = new Set(planning.joursOfEtab(etab.id).map(j => [j.du, j.au, j.type, j.label].join('|')));
  const joursChange = p.jours.length !== joursAvant.size || p.jours.some(j => !joursAvant.has([j.du, j.au, j.type, j.label].join('|')));
  let undo = null;
  if (changes || joursChange) { undo = planning.applyImport([p]); planning.lierAppels(); }
  else db.commit(w => w.update('etablissements', etab.id, { lienAt: new Date().toISOString(), lienErreur: undefined }), { track: false });
  return { ...d, changes, nouvellesClasses, undo };
}

// Résumé pour l'utilisateur : « 2 cours ajoutés, 1 modifié ».
export function resume(r) {
  const parts = [];
  if (r.ajouts.length) parts.push(`${r.ajouts.length} ajouté${r.ajouts.length > 1 ? 's' : ''}`);
  const m = r.modifs.length + r.conflits.filter(k => k.type === 'modif').length;
  if (m) parts.push(`${m} modifié${m > 1 ? 's' : ''}`);
  const s = r.suppressions.length + r.conflits.filter(k => k.type === 'suppr').length;
  if (s) parts.push(`${s} retiré${s > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'aucun changement';
}

// Met à jour tous les établissements qui ont un lien. auto = true : silencieux sauf s'il y a des changements.
let enCours = null;
export const occupe = () => !!enCours;
export function toutMettreAJour({ auto = false } = {}) {
  enCours = enCours || (async () => {
    const res = [];
    for (const e of avecLien()) {
      try { res.push({ etab: e, ...(await mettreAJour(e)) }); }
      catch (err) { res.push({ etab: e, erreur: err.message }); }
    }
    return res;
  })().finally(() => { enCours = null; });
  return enCours.then(res => { annoncer(res, auto); return res; });
}
function annoncer(res, auto) {
  if (!res.length) return;
  const changed = res.filter(r => r.changes);
  const erreurs = res.filter(r => r.erreur);
  const nouvelles = res.flatMap(r => r.nouvellesClasses || []);
  if (changed.length || erreurs.length) refresh();
  if (auto && !changed.length && !nouvelles.length) return; // rien à signaler (erreurs visibles dans l'admin)
  const txt = res.map(r => `${r.etab.initiales} : ${r.erreur ? 'échec (' + r.erreur + ')' : resume(r)}`).join(' · ');
  const undos = changed.map(r => r.undo).filter(Boolean);
  toast({
    text: `Emploi du temps Pronote mis à jour — ${txt}${nouvelles.length ? ` · Nouvelle classe à relier : ${nouvelles.join(', ')} (Administration → Emploi du temps)` : ''}`,
    ms: erreurs.length || nouvelles.length ? 12000 : 8000,
    undo: undos.length ? async () => { for (const u of undos.reverse()) await u(); refresh(); } : undefined,
  });
}

// ---------- Automatique ----------
// Dernier « soir » passé : aujourd'hui 18 h si on y est, sinon hier 18 h.
export function dernierSoir(now = new Date()) {
  const d = new Date(now); d.setHours(SOIR, 0, 0, 0);
  if (now < d) d.setDate(d.getDate() - 1);
  return d;
}
export const aFaire = (e, now = new Date()) => !!e.lien && (!e.lienAt || new Date(e.lienAt) < dernierSoir(now));

function verifier() {
  if (db.archive() || document.hidden || !navigator.onLine || !relais() || enCours) return;
  if (!avecLien().some(e => aFaire(e))) return;
  // Pas pendant une saisie ou un panneau ouvert : on réessaiera au prochain passage.
  if (document.querySelector('#layer > *, #view .scrim, .busy, .appel-mode') || (document.activeElement && document.activeElement.matches('input, select, textarea'))) return;
  toutMettreAJour({ auto: true });
}
let timer = null;
export function initPronoteAuto() {
  setTimeout(verifier, 6000); // après la synchronisation Drive de l'ouverture (un autre appareil a peut-être déjà mis à jour)
  timer = timer || setInterval(verifier, VERIF);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(verifier, 6000); });
}
