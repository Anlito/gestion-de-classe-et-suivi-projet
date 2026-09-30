// db.js — Stockage local des données (IndexedDB), avec une copie en mémoire.
//
// Principes (pensés pour ajouter facilement la synchronisation Google Drive plus tard) :
// - Chaque enregistrement a un identifiant unique (id) et une date de modification (updatedAt).
// - Toute modification passe par commit() : la copie en mémoire est mise à jour tout de suite
//   (l'écran réagit instantanément), puis l'écriture sur la tablette se fait en arrière-plan.
// - commit() renvoie une fonction « annuler » : c'est ce qui alimente les boutons Annuler.
// - onChange() prévient les abonnés après chaque modification : la future synchronisation
//   s'y branchera pour envoyer les données après chaque changement.
// - exportSnapshot() / importSnapshot() produisent et relisent un instantané complet
//   (données + photos). Il sert à la sauvegarde manuelle, et servira de contenu au fichier
//   chiffré déposé sur Google Drive.

const DB_NAME = 'carnet-de-classe';
const DB_VERSION = 6; // 2 : absences · 3 : appels · 4 : retards · 5 : emploi du temps · 6 : effacements (synchronisation)
export const SNAPSHOT_FORMAT = 1;
// Réglages propres à cet appareil, jamais synchronisés (voir sync.js).
export const LOCAL_META = new Set(['lastBackupAt', 'lastModified', 'sync']);
export const TOMBS = 'effacements';

export const STORES = [
  'meta',          // réglages : année scolaire, trimestre en cours, dernière sauvegarde…
  'classes',       // { name, level, segpa, year }
  'students',      // { classId, nom, prenom, photoId, besoins:['PAP'…], amenagements }
  'photos',        // { blob }
  'observations',  // { studentId, classId, type:'neg'|'pos', motif, at, trimester, origin, assignmentId, seanceN, seanceLabel }
  'notes',         // { studentId, text, at }
  'projects',      // { title, desc, nSeances, criteria:[{ id, code, label, pronote }] }
  'assignments',   // { classId, projectId, status:'avenir'|'cours'|'fini', endedAt }
  'seances',       // { assignmentId, n, date, text }
  'groups',        // { assignmentId, code, members:[studentId], comment, levels:{ critId: 1..4 } }
  'evals',         // { assignmentId, studentId, carried:{critId:lvl}, adj:{critId:lvl}, motif, precision }
  'groupChanges',  // { assignmentId, studentId, from, to, at, seanceN }
  'absences',      // { studentId, classId, appelId, date:'AAAA-MM-JJ', at, trimester, assignmentId, seanceId, seanceN, seanceLabel }
  'appels',        // { classId, date, at, n (1er, 2e appel du jour…), assignmentId, seanceId, seanceN, label }
  'retards',       // { studentId, classId, appelId, date:'AAAA-MM-JJ', at, trimester, assignmentId, seanceId, seanceN, seanceLabel }
  'etablissements', // { name, initiales, color, classes:{ [classe Pronote normalisée]: { name, classId } }, importedAt } — voir planning.js
  'cours',         // { etabId, date, debut:'HH:MM', fin, classe (nom Pronote), salle, matiere, statut, statutLabel, source }
  'jours',         // { etabId, du, au, type:'vacances'|'ferie', label } — vacances et jours fériés
  'effacements',   // { id: 'store:recId', store, recId, at } — trace de chaque suppression, pour la synchronisation
];

let idb = null;
const cache = {};
const listeners = new Set();
const photoURLs = new Map();
let pending = Promise.resolve();

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

export async function init() {
  idb = await new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Base de données bloquée par un autre onglet'));
  });
  await loadCache();
}

async function loadCache() {
  const tx = idb.transaction(STORES, 'readonly');
  const lists = await Promise.all(STORES.map(s => req(tx.objectStore(s).getAll())));
  STORES.forEach((s, i) => { cache[s] = new Map(lists[i].map(x => [x.id, x])); });
  for (const url of photoURLs.values()) URL.revokeObjectURL(url);
  photoURLs.clear();
}

// ---------- Lecture ----------
export const get = (store, id) => cache[store].get(id);
export const all = store => [...cache[store].values()];
export const where = (store, pred) => all(store).filter(pred);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export function getMeta(key, fallback = null) {
  const r = cache.meta.get(key);
  return r === undefined ? fallback : r.value;
}

export function photoURL(photoId) {
  if (!photoId) return null;
  if (photoURLs.has(photoId)) return photoURLs.get(photoId);
  const rec = cache.photos.get(photoId);
  if (!rec || !rec.blob) return null;
  const url = URL.createObjectURL(rec.blob);
  photoURLs.set(photoId, url);
  return url;
}

// ---------- Écriture ----------
// fn(w) reçoit un « rédacteur » :
//   w.put(store, rec)          ajoute ou remplace (toujours passer un NOUVEL objet)
//   w.update(store, id, patch) copie l'enregistrement et applique les changements
//   w.del(store, id)           supprime
//   w.meta(key, value)         change un réglage
// Renvoie une fonction undo() qui rétablit exactement l'état précédent.
// oldest = true : valeurs par défaut créées automatiquement (date 0), pour qu'une vraie valeur venue d'un autre
// appareil l'emporte toujours à la synchronisation.
export function commit(fn, { track = true, oldest = false } = {}) {
  const ops = [];
  const now = oldest ? 0 : Date.now();
  const w = {
    put(store, rec) {
      if (!rec.id) rec.id = uid();
      const before = cache[store].get(rec.id);
      if (before === rec) throw new Error('commit.put : passer une copie, pas l’objet en mémoire');
      rec.updatedAt = now;
      ops.push({ store, id: rec.id, before, after: rec });
      cache[store].set(rec.id, rec);
      if (store === 'photos') dropPhotoURL(rec.id);
      return rec;
    },
    update(store, id, patch) {
      const cur = cache[store].get(id);
      if (!cur) return null;
      return w.put(store, { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) });
    },
    del(store, id) {
      const before = cache[store].get(id);
      if (!before) return;
      ops.push({ store, id, before, after: undefined });
      cache[store].delete(id);
      if (store === 'photos') dropPhotoURL(id);
      // Trace de la suppression : un autre appareil synchronisé supprimera aussi cet enregistrement.
      // (Annuler remet l'enregistrement avec une date plus récente que la trace : il l'emporte.)
      if (store !== TOMBS && !(store === 'meta' && LOCAL_META.has(id))) {
        const tid = store + ':' + id;
        const tomb = { id: tid, store, recId: id, at: now, updatedAt: now };
        ops.push({ store: TOMBS, id: tid, before: cache[TOMBS].get(tid), after: tomb, noUndo: true });
        cache[TOMBS].set(tid, tomb);
      }
    },
    meta(key, value) { return w.put('meta', { id: key, value }); },
  };
  fn(w);
  if (!ops.length) return async () => {};
  if (track) {
    const lm = { id: 'lastModified', value: now, updatedAt: now };
    cache.meta.set(lm.id, lm);
    ops.push({ store: 'meta', id: lm.id, after: lm, noUndo: true });
  }
  write(ops);
  emit({ stores: [...new Set(ops.map(o => o.store))], keys: ops.map(o => o.store + ':' + o.id) });
  return async function undo() {
    return commit(u => {
      for (const op of [...ops].reverse()) {
        if (op.noUndo) continue;
        if (op.before) u.put(op.store, { ...op.before }); else u.del(op.store, op.id);
      }
    });
  };
}

function dropPhotoURL(id) {
  const url = photoURLs.get(id);
  if (url) { URL.revokeObjectURL(url); photoURLs.delete(id); }
}

function write(ops) {
  pending = pending.then(() => new Promise(resolve => {
    const stores = [...new Set(ops.map(o => o.store))];
    const tx = idb.transaction(stores, 'readwrite');
    for (const op of ops) {
      const os = tx.objectStore(op.store);
      if (op.after) os.put(op.after); else os.delete(op.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => { emitError(tx.error); resolve(); };
  }));
  return pending;
}

// Attendre que toutes les écritures soient faites (avant un export, par exemple).
export const flush = () => pending;

// ---------- Abonnements ----------
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(info) { for (const fn of listeners) { try { fn(info); } catch (e) { console.error(e); } } }
let errorHandler = e => console.error(e);
export function onError(fn) { errorHandler = fn; }
function emitError(e) { errorHandler(e); }

// ---------- Instantané complet (sauvegarde / future synchronisation) ----------
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
}
async function dataURLToBlob(url) { return (await fetch(url)).blob(); }

export async function exportSnapshot() {
  await flush();
  const data = {};
  for (const s of STORES) {
    if (s === 'photos') {
      data[s] = await Promise.all(all(s).map(async p => ({ id: p.id, updatedAt: p.updatedAt, dataURL: await blobToDataURL(p.blob) })));
    } else {
      data[s] = all(s);
    }
  }
  return { app: 'carnet-de-classe', format: SNAPSHOT_FORMAT, exportedAt: new Date().toISOString(), data };
}

export async function importSnapshot(snap) {
  if (!snap || snap.app !== 'carnet-de-classe' || !snap.data) throw new Error('Ce fichier n’est pas une sauvegarde du Carnet de classe.');
  if (snap.format > SNAPSHOT_FORMAT) throw new Error('Cette sauvegarde vient d’une version plus récente de l’app. Mettez l’app à jour.');
  const prepared = {};
  for (const s of STORES) {
    const list = Array.isArray(snap.data[s]) ? snap.data[s] : [];
    prepared[s] = s === 'photos'
      ? await Promise.all(list.map(async p => ({ id: p.id, updatedAt: p.updatedAt, blob: await dataURLToBlob(p.dataURL) })))
      : list;
  }
  await replaceAll(prepared);
}

// ---------- Synchronisation (voir sync.js) ----------
// Données à synchroniser : tous les enregistrements, sauf les réglages propres à l'appareil ; les photos
// sans leur image ({ id, updatedAt } : les images voyagent à part, une par fichier).
export function exportForSync() {
  const stores = {};
  for (const s of STORES) {
    if (s === TOMBS) continue;
    let list = all(s);
    if (s === 'meta') list = list.filter(r => !LOCAL_META.has(r.id));
    if (s === 'photos') list = list.map(p => ({ id: p.id, updatedAt: p.updatedAt }));
    stores[s] = list;
  }
  return { stores, tombs: all(TOMBS) };
}
// Applique des changements venus d'un autre appareil, tels quels (dates conservées, pas de nouvelle trace,
// pas d'annulation). changes = { puts: { store: [rec] }, dels: [{ store, id }], tombs: [rec] }.
// Une photo sans image garde l'image locale si elle existe (l'image arrive séparément).
export async function applyRemote(changes) {
  const ops = [];
  for (const [store, list] of Object.entries(changes.puts || {})) {
    for (const rec of list) {
      // Modifié ici pendant la synchronisation (plus récent) : on garde la version locale.
      const cur = cache[store].get(rec.id);
      if (cur && (cur.updatedAt || 0) > (rec.updatedAt || 0)) continue;
      const r = store === 'photos' && !rec.blob ? { ...(cur || {}), ...rec } : rec;
      if (store === 'photos' && !r.blob) continue; // image pas encore téléchargée
      cache[store].set(r.id, r);
      if (store === 'photos') dropPhotoURL(r.id);
      ops.push({ store, id: r.id, after: r });
    }
  }
  for (const { store, id, at } of changes.dels || []) {
    const cur = cache[store].get(id);
    if (!cur || (at != null && (cur.updatedAt || 0) > at)) continue; // absent, ou modifié ici après la suppression
    cache[store].delete(id);
    if (store === 'photos') dropPhotoURL(id);
    ops.push({ store, id, after: undefined });
  }
  for (const t of changes.tombs || []) { cache[TOMBS].set(t.id, t); ops.push({ store: TOMBS, id: t.id, after: t }); }
  if (!ops.length) return 0;
  await write(ops);
  emit({ stores: [...new Set(ops.map(o => o.store))], remote: true });
  return ops.length;
}

// Remplace toutes les données (restauration, démonstration, tout effacer). Les réglages propres à cet appareil
// (synchronisation Drive, dernière sauvegarde) sont conservés : ils ne viennent jamais d'un fichier.
export async function replaceAll(prepared) {
  await flush();
  const keep = all('meta').filter(r => LOCAL_META.has(r.id));
  prepared = { ...prepared, meta: [...(prepared.meta || []).filter(r => !LOCAL_META.has(r.id)), ...keep] };
  await new Promise((resolve, reject) => {
    const tx = idb.transaction(STORES, 'readwrite');
    for (const s of STORES) {
      const os = tx.objectStore(s);
      os.clear();
      for (const rec of prepared[s] || []) os.put(rec);
    }
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
  await loadCache();
  emit({ stores: STORES, reset: true });
}

export async function clearAll() {
  const empty = Object.fromEntries(STORES.map(s => [s, []]));
  await replaceAll(empty);
}
