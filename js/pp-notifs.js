// pp-notifs.js — Notifications internes des retours (1.25.1) : demandes de rendez-vous des familles et avis des
// collègues sur un PAP, signalés dans l'encadré des alertes.
//
// Quand l'app est affichée, elle interroge le service Google (le même pour les deux) : 20 s après l'ouverture, puis
// toutes les 10 min, et au retour dans l'app. Seulement les campagnes de rendez-vous OUVERTES et publiées, et les
// consultations PAP ouvertes. Les nouveautés sont enregistrées comme avec « Récupérer » (aucune action en plus).
// Pas de notification app fermée (une application web ne peut pas réveiller la tablette sans serveur).
//
// Ce qui est signalé :
// - familles : demandes « à traiter » (pending) des campagnes non archivées, jusqu'à leur traitement ;
// - PAP : avis reçus depuis la dernière ouverture du PAP de l'élève (meta 'papVu:<élève>:<année>').
import * as db from './db.js';
import * as model from './model.js';
import * as pp from './pp.js';
import * as meetings from './pp-meetings.js';
import * as family from './pp-family.js';
import * as papService from './pap-service.js';

const PERIODE = 10 * 60 * 1000, RETOUR = 2 * 60 * 1000;
let dernier = 0, enCours = null;

const consultationsPAP = () => {
  const suffixe = ':' + model.schoolYear();
  return db.all('meta').filter(r => r.id.startsWith('papConsult:') && r.id.endsWith(suffixe) && r.value)
    .map(r => ({ sid: r.id.slice('papConsult:'.length, -suffixe.length), ...r.value }))
    .filter(c => db.get('students', c.sid));
};
const campagnesOuvertes = () => meetings.campaigns().filter(c => c.status === 'open' && family.published(c.entityId));

// Va chercher les nouveautés chez Google. Silencieux en cas d'échec (réseau, service non mis à jour…).
export function verifier() {
  if (enCours) return enCours;
  enCours = (async () => {
    dernier = Date.now();
    if (db.archive() || !navigator.onLine || !pp.hasPP()) return;
    if (pp.enabled('rencontres') && family.config().url && family.config().key) {
      for (const c of campagnesOuvertes()) { try { await family.receive(c.entityId); } catch (e) { /* réessai au prochain passage */ } }
    }
    if (pp.enabled('pap') && papService.configure()) {
      for (const c of consultationsPAP().filter(x => x.status === 'open')) { try { await papService.recuperer(c.sid); } catch (e) { /* idem */ } }
    }
  })().finally(() => { enCours = null; });
  return enCours;
}

// Retours à signaler : [{ type: 'famille'|'pap', n, titre, href }].
export function aSignaler() {
  if (db.archive() || !pp.hasPP()) return [];
  const out = [];
  if (pp.enabled('rencontres')) {
    for (const c of meetings.campaigns().filter(x => x.status !== 'archived')) {
      const n = meetings.requests(c.entityId).filter(r => r.status === 'pending').length;
      if (n) out.push({ type: 'famille', n, titre: c.title || 'Rencontres parents–PP', href: '#/pp/rencontres/familles/' + c.entityId });
    }
  }
  if (pp.enabled('pap')) {
    for (const c of consultationsPAP()) {
      const r = papService.retours(c.sid);
      if (!r) continue;
      const vu = db.getMeta(vuKey(c.sid), '') || '';
      const n = r.reponses.filter(x => x.receivedAt > vu).length;
      const s = db.get('students', c.sid);
      if (n) out.push({ type: 'pap', n, titre: `${s.prenom} ${(s.nom || '').charAt(0)}.`, href: '#/pp/eleve/' + c.sid + '/pap' });
    }
  }
  return out;
}

const vuKey = sid => 'papVu:' + sid + ':' + model.schoolYear();
// Ouverture du PAP de l'élève : ses avis sont considérés comme vus.
export function marquerVu(sid) {
  const r = papService.retours(sid);
  if (!r || !r.reponses.length) return;
  const max = r.reponses.reduce((m, x) => (x.receivedAt > m ? x.receivedAt : m), '');
  if ((db.getMeta(vuKey(sid), '') || '') < max) db.commit(w => w.meta(vuKey(sid), max));
}

export function initNotifs() {
  setTimeout(() => { if (!document.hidden) verifier(); }, 20000);
  setInterval(() => { if (!document.hidden) verifier(); }, PERIODE);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - dernier > RETOUR) verifier(); });
}
