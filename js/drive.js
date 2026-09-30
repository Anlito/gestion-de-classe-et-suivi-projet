// drive.js — Synchronisation avec le Google Drive du professeur.
//
// Application autonome : aucun accès du développeur. Chaque professeur crée SON identifiant client Google
// (guide dans Administration → Sauvegarde) et le saisit sur chacun de ses appareils. Ses données vont dans
// SON Drive, dossier visible « Carnet de classe » :
//   carnet-donnees.json   toutes les données (sauf images des photos) + index des photos
//   photo-<id>.jpg        une image par photo d'élève (envoyée seulement quand elle change)
// Portée OAuth « drive.file » : l'app ne voit que les fichiers qu'elle a créés. Pas de chiffrement (choix du
// professeur) : ne jamais partager ce dossier.
// Réglage propre à l'appareil (jamais synchronisé) : meta.sync = { mode: 'manuel'|'drive', clientId, folderId,
//   dataFileId, email, lastSync, lastStats }.
import * as db from './db.js';
import { mergeData } from './sync.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'Carnet de classe';
const DATA = 'carnet-donnees.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

// ---------- Réglage de cet appareil ----------
export const config = () => db.getMeta('sync', {}) || {};
export function setConfig(patch) { db.commit(w => w.meta('sync', { ...config(), ...patch }), { track: false }); }
export const isDrive = () => config().mode === 'drive';
// Identifiant client OAuth « Application Web » : se termine par .apps.googleusercontent.com
export const validClientId = id => /^[\w-]+\.apps\.googleusercontent\.com$/.test((id || '').trim());

// ---------- Connexion Google (Google Identity Services, jeton valable 1 h) ----------
let token = null;       // { value, exp }
let gis = null;
function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  gis = gis || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gis = null; reject(new Error('Impossible de joindre Google : vérifiez la connexion Internet.')); };
    document.head.appendChild(s);
  });
  return gis;
}
export const connected = () => !!token && token.exp > Date.now();

// interactive = false : tentative discrète (sans fenêtre si Google se souvient de l'autorisation).
export async function connect(interactive = true) {
  const { clientId } = config();
  if (!validClientId(clientId)) throw new Error('Indiquez d’abord votre identifiant client Google (il se termine par .apps.googleusercontent.com).');
  await loadGis();
  await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(), scope: SCOPE,
      callback: r => {
        if (r.error) { reject(new Error(r.error === 'access_denied' ? 'Accès refusé dans la fenêtre Google.' : 'Connexion Google refusée (' + r.error + ').')); return; }
        token = { value: r.access_token, exp: Date.now() + (Number(r.expires_in || 3600) - 120) * 1000 };
        resolve();
      },
      error_callback: e => reject(new Error(e && e.type === 'popup_closed' ? 'Fenêtre Google fermée avant la fin.'
        : e && e.type === 'popup_failed_to_open' ? 'La fenêtre Google n’a pas pu s’ouvrir (fenêtres bloquées ?).' : 'Connexion Google impossible.')),
    });
    client.requestAccessToken({ prompt: interactive ? '' : 'none' });
  });
  try { const me = await api(API + '/about?fields=user(emailAddress)'); setConfig({ email: me.user && me.user.emailAddress }); } catch (e) { /* e-mail facultatif */ }
}
export function disconnect() {
  try { if (token && window.google) window.google.accounts.oauth2.revoke(token.value, () => {}); } catch (e) { /* rien */ }
  token = null;
  setConfig({ email: null });
}

// ---------- Appels à l'API Drive ----------
export class NeedAuth extends Error {}
async function api(url, { method = 'GET', body = null, headers = {}, raw = false } = {}) {
  if (!connected()) throw new NeedAuth('Connexion à Google nécessaire.');
  let res;
  try { res = await fetch(url, { method, body, headers: { Authorization: 'Bearer ' + token.value, ...headers } }); }
  catch (e) { throw new Error('Pas de connexion Internet.'); }
  if (res.status === 401) { token = null; throw new NeedAuth('Connexion à Google expirée.'); }
  if (res.status === 404) { const err = new Error('Fichier introuvable sur Drive.'); err.notFound = true; throw err; }
  if (!res.ok) {
    let msg = res.status + '';
    try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch (e) { /* rien */ }
    throw new Error('Google Drive : ' + msg);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}
const q = s => encodeURIComponent(s);
async function findOne(query) {
  const r = await api(`${API}/files?q=${q(query + ' and trashed=false')}&fields=files(id,name,modifiedTime)&spaces=drive&pageSize=10`);
  return (r.files || [])[0] || null;
}
async function ensureFolder() {
  const cfg = config();
  if (cfg.folderId) {
    try { const f = await api(`${API}/files/${cfg.folderId}?fields=id,trashed`); if (!f.trashed) return f.id; } catch (e) { if (e instanceof NeedAuth) throw e; }
  }
  const found = await findOne(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder'`);
  const id = found ? found.id : (await api(`${API}/files?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  })).id;
  setConfig({ folderId: id, dataFileId: null });
  return id;
}
// Crée un fichier (multipart : métadonnées + contenu) ou remplace son contenu.
async function putFile(fileId, name, parentId, blob) {
  if (fileId) {
    try { return (await api(`${UPLOAD}/files/${fileId}?uploadType=media&fields=id`, { method: 'PATCH', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob })).id; }
    catch (e) { if (!e.notFound) throw e; } // supprimé dans Drive : on le recrée
  }
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [parentId] })], { type: 'application/json' }));
  form.append('file', blob);
  return (await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: form })).id;
}
const getBlob = async id => (await api(`${API}/files/${id}?alt=media`, { raw: true })).blob();
async function trash(id) { try { await api(`${API}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); } catch (e) { if (e instanceof NeedAuth) throw e; } }

// ---------- Synchronisation ----------
let running = null;
export const syncing = () => !!running;
// Fusionne cet appareil et Drive, dans les deux sens. Renvoie { recus, envoyes, supprimes, photos }.
// onStep(texte) : progression affichée.
export function synchroniser(onStep = () => {}) {
  running = running || doSync(onStep).finally(() => { running = null; });
  return running;
}
async function doSync(onStep) {
  onStep('Connexion au dossier « Carnet de classe »…');
  const folderId = await ensureFolder();
  let dataId = config().dataFileId;
  if (!dataId) { const f = await findOne(`name='${DATA}' and '${folderId}' in parents`); dataId = f ? f.id : null; }
  onStep('Lecture des données sur Drive…');
  let remote = null;
  if (dataId) {
    try { remote = JSON.parse(await (await getBlob(dataId)).text()); }
    catch (e) { if (e instanceof NeedAuth) throw e; if (!e.notFound) throw new Error('Fichier de données Drive illisible : ' + e.message); dataId = null; }
  }
  if (remote && remote.app !== 'carnet-de-classe') throw new Error('Le fichier « ' + DATA + ' » du dossier Drive n’est pas une sauvegarde du Carnet de classe.');
  await db.flush();
  const m = mergeData(db.exportForSync(), remote ? { stores: remote.stores || {}, tombs: remote.tombs || [] } : null);

  // Photos : télécharger celles qui sont plus récentes sur Drive.
  const idx = { ...((remote && remote.photos) || {}) };
  let nPhotos = 0;
  if (m.photosToDownload.length) {
    const wanted = new Set(m.photosToDownload);
    const puts = (m.toLocal.puts.photos || []).filter(p => wanted.has(p.id));
    let i = 0;
    for (const p of puts) {
      onStep(`Réception des photos… ${++i} / ${puts.length}`);
      const f = idx[p.id];
      if (!f) continue;
      try { p.blob = await getBlob(f.fileId); nPhotos++; } catch (e) { if (e instanceof NeedAuth) throw e; }
    }
  }
  onStep('Mise à jour de cet appareil…');
  await db.applyRemote(m.toLocal);

  // Photos : envoyer celles de cet appareil absentes ou plus anciennes sur Drive ; retirer celles supprimées.
  let idxChanged = false;
  const keep = new Set(m.merged.stores.photos ? m.merged.stores.photos.map(p => p.id) : []);
  const toSend = (m.merged.stores.photos || []).filter(p => { const loc = db.get('photos', p.id); return loc && loc.blob && (!idx[p.id] || idx[p.id].updatedAt < loc.updatedAt); });
  let j = 0;
  for (const p of toSend) {
    onStep(`Envoi des photos… ${++j} / ${toSend.length}`);
    const loc = db.get('photos', p.id);
    const fileId = await putFile(idx[p.id] && idx[p.id].fileId, `photo-${p.id}.jpg`, folderId, loc.blob);
    idx[p.id] = { fileId, updatedAt: loc.updatedAt };
    idxChanged = true; nPhotos++;
  }
  for (const id of Object.keys(idx)) if (!keep.has(id)) { await trash(idx[id].fileId); delete idx[id]; idxChanged = true; }

  // Données : envoyées si Drive n'est pas à jour.
  if (m.remoteChanged || idxChanged || !dataId) {
    onStep('Envoi des données sur Drive…');
    const payload = { app: 'carnet-de-classe', format: 1, savedAt: new Date().toISOString(), stores: m.merged.stores, tombs: m.merged.tombs, photos: idx };
    dataId = await putFile(dataId, DATA, folderId, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  }
  const stats = { ...m.stats, photos: nPhotos };
  setConfig({ dataFileId: dataId, lastSync: new Date().toISOString(), lastStats: stats });
  return stats;
}
// Drive contient-il déjà des données du Carnet (avec au moins une classe) ?
export async function driveADesDonnees() {
  const folderId = await ensureFolder();
  const f = await findOne(`name='${DATA}' and '${folderId}' in parents`);
  if (!f) return false;
  try { const d = JSON.parse(await (await getBlob(f.id)).text()); return !!(d.stores && d.stores.classes && d.stores.classes.length); }
  catch (e) { if (e instanceof NeedAuth) throw e; return false; }
}
export const folderUrl = () => (config().folderId ? 'https://drive.google.com/drive/folders/' + config().folderId : null);
