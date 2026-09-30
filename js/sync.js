// sync.js — Fusion des données entre appareils (synchronisation Google Drive, plusieurs appareils en alternance).
//
// Principe : chaque enregistrement a un identifiant et une date de modification (updatedAt, en ms).
// Pour chaque enregistrement présent d'un côté ou de l'autre, la version la plus récente gagne.
// Les suppressions laissent une trace (table « effacements » : { id: 'store:recId', store, recId, at }) :
// si la trace est plus récente que l'enregistrement, il est supprimé partout ; sinon (enregistrement recréé
// ou rétabli par « Annuler » après la suppression) il est gardé.
// Les traces de plus de TOMB_MAX_DAYS jours sont oubliées (un appareil resté hors ligne plus longtemps pourrait
// faire réapparaître un élément supprimé).
//
// Format échangé (db.exportForSync) : { stores: { [store]: [rec] }, tombs: [trace] } — les photos n'y figurent
// que par { id, updatedAt } ; leurs images voyagent dans des fichiers séparés.

export const TOMB_MAX_DAYS = 180;
const newer = (a, b) => (b && (!a || (b.updatedAt || 0) > (a.updatedAt || 0)) ? b : a);
const same = (a, b) => (!a && !b) || (!!a && !!b && (a.updatedAt || 0) === (b.updatedAt || 0));

// local, remote : données au format ci-dessus (remote peut être null : premier envoi).
// Renvoie {
//   merged        : données fusionnées (à envoyer sur Drive),
//   toLocal       : { puts: { store: [rec] }, dels: [{ store, id }], tombs: [trace] } à appliquer sur cet appareil,
//   remoteChanged : true si la version Drive doit être remplacée,
//   photosToDownload : ids des photos dont la version distante est plus récente (image à télécharger),
//   stats         : { recus, envoyes, supprimes }
// }
export function mergeData(local, remote, now = Date.now()) {
  remote = remote || { stores: {}, tombs: [] };
  const limit = now - TOMB_MAX_DAYS * 864e5;
  // Traces : union, la plus récente par clé ; les trop anciennes sont oubliées.
  const tombs = new Map();
  for (const t of [...(local.tombs || []), ...(remote.tombs || [])]) {
    if ((t.at || 0) < limit) continue;
    const cur = tombs.get(t.id);
    if (!cur || t.at > cur.at) tombs.set(t.id, t);
  }
  const merged = { stores: {}, tombs: [...tombs.values()] };
  const toLocal = { puts: {}, dels: [], tombs: [] };
  const photosToDownload = [];
  let remoteChanged = false;
  const stats = { recus: 0, envoyes: 0, supprimes: 0 };

  const names = new Set([...Object.keys(local.stores || {}), ...Object.keys(remote.stores || {})]);
  for (const store of names) {
    const L = new Map((local.stores[store] || []).map(r => [r.id, r]));
    const R = new Map((remote.stores[store] || []).map(r => [r.id, r]));
    const out = [];
    for (const id of new Set([...L.keys(), ...R.keys()])) {
      const l = L.get(id), r = R.get(id);
      let win = newer(l, r) || l; // égalité : la version locale
      const t = tombs.get(store + ':' + id);
      if (t && t.at >= (win.updatedAt || 0)) win = null; // supprimé après la dernière modification
      if (win) out.push(win);
      // Ce qui change sur cet appareil
      if (!same(win, l)) {
        if (win) {
          (toLocal.puts[store] = toLocal.puts[store] || []).push(win);
          stats.recus++;
          if (store === 'photos') photosToDownload.push(id);
        } else if (l) { toLocal.dels.push({ store, id }); stats.supprimes++; }
      }
      // Ce qui change sur Drive
      if (!same(win, r)) { remoteChanged = true; if (win && same(win, l)) stats.envoyes++; }
    }
    merged.stores[store] = out;
  }
  // Traces à enregistrer / oublier sur cet appareil ; la version Drive change si ses traces diffèrent.
  const localTombs = new Map((local.tombs || []).map(t => [t.id, t]));
  const remoteTombs = new Map((remote.tombs || []).map(t => [t.id, t]));
  for (const t of merged.tombs) {
    const lt = localTombs.get(t.id);
    if (!lt || lt.at !== t.at) toLocal.tombs.push(t);
    const rt = remoteTombs.get(t.id);
    if (!rt || rt.at !== t.at) remoteChanged = true;
  }
  for (const id of localTombs.keys()) if (!tombs.has(id)) toLocal.dels.push({ store: 'effacements', id });
  for (const id of remoteTombs.keys()) if (!tombs.has(id)) remoteChanged = true;
  return { merged, toLocal, remoteChanged, photosToDownload, stats };
}
