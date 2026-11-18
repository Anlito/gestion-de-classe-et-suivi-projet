// pap-service.js — Consultation des collègues pour le PAP d'un élève (1.25.0).
//
// Même service Google que le formulaire des familles (dossier google-rencontres, choix du professeur) : même adresse
// /exec et même clé professeur (meta.ppFamilyService). Le Carnet publie une consultation par élève et par année ;
// les collègues répondent par un lien sans compte ; le Carnet récupère leurs avis.
// Publié (liste blanche, voir Code.gs) : prénom + initiale, classe, niveau, grille officielle, cases du PAP précédent,
// message et date limite facultatifs. Jamais : nom complet, informations du médecin, bilan, autres élèves.
// État (synchronisé par Drive) : meta 'papConsult:<studentId>' = { consultationId, url, status, message, echeance, at }
//                                 meta 'papRetours:<studentId>' = { at, reponses: [...] }
import * as db from './db.js';
import * as model from './model.js';
import * as pap from './pap.js';
import { SECTIONS, NIVEAUX, DISCIPLINES } from './pap-items.js';
import { serviceURL, FAMILY_PROTOCOL } from './pp-family-rules.js';

const cle = (k, sid) => k + ':' + sid + ':' + model.schoolYear();
export const service = () => db.getMeta('ppFamilyService', {}) || {};
export const configure = () => !!(service().url && service().key);
export const etat = sid => db.getMeta(cle('papConsult', sid), null);
export const retours = sid => db.getMeta(cle('papRetours', sid), null);
const setMeta = (id, value) => db.commit(w => w.meta(id, value));

// Même réglage que Rencontres → Formulaire familles (sans dépendre de l'outil Rencontres).
export function configurer(url, key) {
  const value = { ...service(), url: serviceURL(url), key: (key || '').trim() || service().key };
  if (typeof value.key !== 'string' || value.key.length < 32 || value.key.length > 200) throw new Error('Renseignez la clé professeur fournie lors de l’installation du service Google.');
  return setMeta('ppFamilyService', value);
}

async function appel(action, payload) {
  const cfg = service();
  if (!cfg.url || !cfg.key) throw new Error('Configurez d’abord le service Google (adresse /exec et clé professeur).');
  let response;
  try { response = await fetch(serviceURL(cfg.url), { method: 'POST', body: new URLSearchParams({ action, key: cfg.key, payload: JSON.stringify(payload) }), credentials: 'omit', redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('Le service Google ne répond pas : vérifiez la connexion Internet.'); }
  if (!response.ok) throw new Error('Le service Google n’a pas répondu. Réessayez.');
  let result; try { result = await response.json(); } catch { throw new Error('Google ne renvoie pas les données attendues : vérifiez que le service a été mis à jour (nouveau code PAP, nouvelle version déployée).'); }
  if (result?.protocol !== FAMILY_PROTOCOL || !result.ok) throw new Error(result?.error ? 'Google : ' + result.error : 'Action non confirmée par Google.');
  return result;
}

// Ce qui est publié pour un élève (à partir du PAP ENREGISTRÉ, pas d'une saisie en cours).
export function contenu(sid, { status = 'open', message = '', echeance = '' } = {}) {
  const s = db.get('students', sid), c = db.get('classes', s.classId), d = pap.papDe(sid).data;
  const avant = NIVEAUX.slice(0, NIVEAUX.indexOf(d.niveau));
  const consultationId = (etat(sid) && etat(sid).consultationId) || 'pap-' + db.uid();
  return {
    protocol: FAMILY_PROTOCOL, consultationId, status,
    eleve: `${s.prenom || ''} ${(s.nom || '').charAt(0)}.`.trim(), className: c ? c.name : '', niveau: d.niveau,
    sections: SECTIONS.map(x => ({ id: x.id, titre: x.titre, discipline: x.discipline, sous: !!x.sous, items: x.items.map(i => ({ id: i.id, texte: i.texte })) })),
    precedent: Object.fromEntries(avant.map(n => [n, d.cases[n] || []]).filter(([, l]) => l.length)),
    precedentAutres: d.autres.filter(a => a.niveaux.some(n => avant.includes(n))).map(a => ({ texte: a.texte, niveaux: a.niveaux.filter(n => avant.includes(n)) })),
    disciplines: DISCIPLINES, message: String(message || '').trim().slice(0, 1000), echeance: echeance || '',
  };
}

export async function publier(sid, options = {}) {
  const prev = etat(sid) || {};
  const opts = { status: options.status || prev.status || 'open', message: options.message ?? prev.message ?? '', echeance: options.echeance ?? prev.echeance ?? '' };
  const payload = contenu(sid, opts);
  const r = await appel('papPublish', payload);
  const url = new URL(r.publicURL);
  if (url.origin !== 'https://script.google.com' || !/^[-a-zA-Z0-9_]{20,100}$/.test(url.searchParams.get('pap') || '')) throw new Error('Adresse de formulaire inattendue : vérifiez le service Google.');
  const value = { consultationId: payload.consultationId, url: url.href, status: opts.status, message: opts.message, echeance: opts.echeance, at: new Date().toISOString() };
  setMeta(cle('papConsult', sid), value);
  return value;
}

export async function recuperer(sid) {
  const e = etat(sid);
  if (!e) throw new Error('Créez d’abord le lien pour les collègues.');
  const r = await appel('papList', { consultationId: e.consultationId });
  const reponses = (r.reponses || []).filter(x => typeof x.teacher === 'string' && Array.isArray(x.items))
    .map(x => ({ id: String(x.id), receivedAt: String(x.receivedAt), teacher: x.teacher.slice(0, 80), discipline: String(x.discipline || '').slice(0, 60),
      items: x.items.filter(id => typeof id === 'string'), autres: (x.autres || []).map(String).slice(0, 5), comment: String(x.comment || '').slice(0, 2000) }))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  // Rien de nouveau : on n'enregistre rien (la vérification automatique ne déclenche pas de synchronisation).
  const avant = retours(sid);
  if (avant && JSON.stringify(avant.reponses) === JSON.stringify(reponses)) return avant;
  const value = { at: new Date().toISOString(), reponses };
  setMeta(cle('papRetours', sid), value);
  return value;
}

// Synthèse : pour chaque item, les collègues qui le proposent ; propositions libres ; commentaires.
export function synthese(sid) {
  const r = retours(sid);
  const parItem = new Map();
  for (const rep of (r ? r.reponses : [])) for (const id of rep.items) {
    if (!parItem.has(id)) parItem.set(id, []);
    parItem.get(id).push(`${rep.teacher} (${rep.discipline})`);
  }
  return { parItem, reponses: r ? r.reponses : [], at: r ? r.at : null };
}
