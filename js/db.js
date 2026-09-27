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
const DB_VERSION = 2; // 2 : ajout des absences
export const SNAPSHOT_FORMAT = 1;

export const STORES = [
  'meta',          // réglages : année scolaire, trimestre en cours, dernière sauvegarde…
  'classes',       // { name, level, segpa, year }
  'students',      // { classId, nom, prenom, photoId }
  'photos',        // { blob }
  'observations',  // { studentId, classId, type:'neg'|'pos', motif, at, trimester, origin, assignmentId, seanceN, seanceLabel }
  'notes',         // { studentId, text, at }
  'projects',      // { title, desc, nSeances, criteria:[{ id, code, label, pronote }] }
  'assignments',   // { classId, projectId, status:'avenir'|'cours'|'fini', endedAt }
  'seances',       // { assignmentId, n, date, text }
  'groups',        // { assignmentId, code, members:[studentId], comment, levels:{ critId: 1..4 } }
  'evals',         // { assignmentId, studentId, carried:{critId:lvl}, adj:{critId:lvl}, motif, precision }
  'groupChanges',  // { assignmentId, studentId, from, to, at, seanceN }
  'absences',      // { studentId, classId, date:'AAAA-MM-JJ', at, trimester, assignmentId, seanceN, seanceLabel }
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
export function commit(fn, { track = true } = {}) {
  const ops = [];
  const now = Date.now();
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
  emit({ stores: [...new Set(ops.map(o => o.store))] });
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

export async function replaceAll(prepared) {
  await flush();
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
