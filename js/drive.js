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
// Identifiant client OAuth « Application Web » : « 123456789012-abc….apps.googleusercontent.com ».
export const validClientId = id => /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id || '');
// Retrouve l'identifiant dans un texte collé : espaces, retours à la ligne, caractères invisibles, majuscules
// (clavier) et texte autour (« ID client : … ») sont ignorés. Renvoie l'identifiant ou null.
export function extractClientId(text) {
  const clean = (text || '').normalize('NFKC').replace(/[\s ​-‍⁠﻿]+/g, '').toLowerCase();
  const m = clean.match(/[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com/);
  return m ? m[0] : null;
}

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
// Google Agenda (1.21.0) : autorisation supplémentaire, demandée seulement si la synchronisation de l'agenda est activée.
// « calendar.app.created » : l'app ne voit que l'agenda qu'elle a créé (« Carnet de classe »), pas vos autres agendas.
export const SCOPE_AGENDA = 'https://www.googleapis.com/auth/calendar.app.created';
const veutAgenda = () => !!(db.getMeta('agenda', {}) || {}).actif;
export const aLAgenda = () => connected() && !!token.scopes && token.scopes.includes(SCOPE_AGENDA);

// interactive = false : tentative discrète (sans fenêtre si Google se souvient de l'autorisation).
// agenda = true : demande aussi l'accès à Google Agenda (activation).
export async function connect(interactive = true, { agenda = false } = {}) {
  const { clientId } = config();
  if (!validClientId(clientId)) throw new Error('Indiquez d’abord votre identifiant client Google (il se termine par .apps.googleusercontent.com).');
  await loadGis();
  await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(), scope: SCOPE + (agenda || veutAgenda() ? ' ' + SCOPE_AGENDA : ''), include_granted_scopes: true,
      callback: r => {
        if (r.error) { reject(new Error(r.error === 'access_denied' ? 'Accès refusé dans la fenêtre Google.' : 'Connexion Google refusée (' + r.error + ').')); return; }
        token = { value: r.access_token, exp: Date.now() + (Number(r.expires_in || 3600) - 120) * 1000, scopes: r.scope || '' };
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
export async function api(url, { method = 'GET', body = null, headers = {}, raw = false } = {}) {
  if (!connected()) throw new NeedAuth('Connexion à Google nécessaire.');
  let res;
  try { res = await fetch(url, { method, body, headers: { Authorization: 'Bearer ' + token.value, ...headers } }); }
  catch (e) { throw new Error('Pas de connexion Internet.'); }
  if (res.status === 401) { token = null; throw new NeedAuth('Connexion à Google expirée.'); }
  if (res.status === 404 || res.status === 410) { const err = new Error('Introuvable chez Google.'); err.notFound = true; err.status = res.status; throw err; }
  if (!res.ok) {
    let msg = res.status + '';
    try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch (e) { /* rien */ }
    const err = new Error((url.includes('/calendar/') ? 'Google Agenda : ' : 'Google Drive : ') + msg);
    err.status = res.status;
    throw err;
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
// Crée un fichier (multipart : métadonnées + contenu) ou remplace son contenu. Renvoie { id, version }.
async function putFile(fileId, name, parentId, blob) {
  if (fileId) {
    try { return await api(`${UPLOAD}/files/${fileId}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }); }
    catch (e) { if (!e.notFound) throw e; } // supprimé dans Drive : on le recrée
  }
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [parentId] })], { type: 'application/json' }));
  form.append('file', blob);
  return api(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, { method: 'POST', body: form });
}
// Version du fichier de données sur Drive (change à chaque envoi, de n'importe quel appareil) ; null si absent.
async function versionOf(id) {
  try { const f = await api(`${API}/files/${id}?fields=id,version,trashed`); return f.trashed ? null : String(f.version); }
  catch (e) { if (e.notFound) return null; throw e; }
}
const getBlob = async id => (await api(`${API}/files/${id}?alt=media`, { raw: true })).blob();
async function trash(id) { try { await api(`${API}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); } catch (e) { if (e instanceof NeedAuth) throw e; } }

// ---------- Synchronisation ----------
let running = null;
export const syncing = () => !!running;
// Fusionne cet appareil et Drive, dans les deux sens. Renvoie { recus, envoyes, supprimes, photos, rien }.
// onStep(texte) : progression affichée.
// opts.remplacerDrive : cet appareil fait foi (après une restauration…) : ce qui n'existe plus ici est supprimé
// de Drive et, à leur prochaine synchronisation, des autres appareils.
export function synchroniser(onStep = () => {}, opts = {}) {
  if (db.archive()) return Promise.reject(new Error('Archive consultée : quittez-la pour synchroniser.'));
  running = running || doSyncRetry(onStep, opts).finally(() => { running = null; });
  return running;
}
// Si un autre appareil a envoyé entre notre lecture et notre envoi, on recommence (jusqu'à 3 fois).
async function doSyncRetry(onStep, opts) {
  for (let i = 0; i < 3; i++) {
    const r = await doSync(onStep, opts);
    if (!r.retry) return r;
    onStep('Un autre appareil vient d’envoyer ses données : nouvelle fusion…');
  }
  throw new Error('Drive change sans cesse (un autre appareil synchronise en même temps) : réessayez dans un instant.');
}
const ZERO = { recus: 0, envoyes: 0, supprimes: 0, photos: 0 };
async function doSync(onStep, opts) {
  onStep('Connexion au dossier « Carnet de classe »…');
  const folderId = await ensureFolder();
  const cfg = config();
  let dataId = cfg.dataFileId;
  if (!dataId) { const f = await findOne(`name='${DATA}' and '${folderId}' in parents`); dataId = f ? f.id : null; }
  const version = dataId ? await versionOf(dataId) : null;
  if (!version) dataId = null;
  await db.flush();
  // La synchronisation est datée de son DÉBUT : une modification faite pendant qu'elle tourne sera envoyée la fois suivante.
  const startedAt = new Date().toISOString();
  const lastSyncMs = cfg.lastSync ? Date.parse(cfg.lastSync) : 0;
  const localChanged = (db.getMeta('lastModified', 0) || 0) > lastSyncMs;
  const driveUnchanged = !!dataId && version === cfg.remoteVersion && !!cfg.photoIdx;
  // Rien de nouveau ni ici ni sur Drive : aucun échange.
  if (driveUnchanged && !localChanged && !opts.remplacerDrive) {
    setConfig({ lastSync: startedAt });
    return { ...ZERO, rien: true };
  }
  let remote = null, idx = {};
  if (driveUnchanged && !opts.remplacerDrive) {
    // Drive n'a pas bougé depuis notre dernier envoi : il est déjà inclus ici, inutile de le retélécharger.
    // (Sauf pour « Remplacer Drive » : il faut la liste de ce que Drive contient pour le supprimer ailleurs.)
    remote = { stores: {}, tombs: [] };
    idx = { ...cfg.photoIdx };
  } else if (dataId) {
    onStep('Lecture des données sur Drive…');
    let d;
    try { d = JSON.parse(await (await getBlob(dataId)).text()); }
    catch (e) { if (e instanceof NeedAuth) throw e; throw new Error('Fichier de données Drive illisible : ' + e.message); }
    if (d.app !== 'carnet-de-classe') throw new Error('Le fichier « ' + DATA + ' » du dossier Drive n’est pas une sauvegarde du Carnet de classe.');
    remote = { stores: d.stores || {}, tombs: d.tombs || [] };
    idx = { ...(d.photos || {}) };
  }
  let local = db.exportForSync();
  if (opts.remplacerDrive && remote) {
    // Cet appareil fait foi : tout ce que Drive a en plus reçoit une trace de suppression datée de maintenant.
    const now = Date.now();
    const tombs = [];
    for (const [store, list] of Object.entries(remote.stores)) {
      const here = new Set((local.stores[store] || []).map(r => r.id));
      for (const r of list) if (!here.has(r.id) && !(store === 'meta' && db.LOCAL_META.has(r.id))) tombs.push({ id: store + ':' + r.id, store, recId: r.id, at: now, updatedAt: now });
    }
    if (tombs.length) { await db.applyRemote({ tombs }); local = db.exportForSync(); }
    remote = { stores: {}, tombs: remote.tombs };
  }
  const m = mergeData(local, remote);
  if (driveUnchanged && !opts.remplacerDrive) {
    // Sans la version Drive, la fusion compterait tout comme « envoyé » : on ne compte que ce qui a changé ici.
    m.stats.envoyes = Object.values(local.stores).reduce((n, list) => n + list.filter(r => (r.updatedAt || 0) > lastSyncMs).length, 0)
      + local.tombs.filter(t => (t.at || 0) > lastSyncMs).length;
  }

  // Photos : télécharger celles qui sont plus récentes sur Drive.
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
    const f = await putFile(idx[p.id] && idx[p.id].fileId, `photo-${p.id}.jpg`, folderId, loc.blob);
    idx[p.id] = { fileId: f.id, updatedAt: loc.updatedAt };
    idxChanged = true; nPhotos++;
  }
  for (const id of Object.keys(idx)) if (!keep.has(id)) { await trash(idx[id].fileId); delete idx[id]; idxChanged = true; }

  // Données : envoyées si Drive n'est pas à jour — seulement si personne n'a envoyé entre-temps.
  let newVersion = version;
  if (m.remoteChanged || idxChanged || !dataId) {
    if (dataId && (await versionOf(dataId)) !== version) return { retry: true };
    onStep('Envoi des données sur Drive…');
    const payload = { app: 'carnet-de-classe', format: 1, savedAt: new Date().toISOString(), stores: m.merged.stores, tombs: m.merged.tombs, photos: idx };
    const f = await putFile(dataId, DATA, folderId, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    dataId = f.id; newVersion = String(f.version);
  }
  const stats = { ...m.stats, photos: nPhotos };
  setConfig({ dataFileId: dataId, remoteVersion: newVersion, photoIdx: idx, lastSync: startedAt, lastStats: stats, reinit: false });
  return stats;
}
// ---------- Archives des années (1.17.0) : un fichier « carnet-archive-AAAA-AAAA.json » par année ----------
// Envoie (ou remplace) l'archive ; renvoie l'identifiant du fichier Drive.
export async function envoyerArchive(name, blob, knownId = null) {
  const folderId = await ensureFolder();
  let id = knownId;
  if (!id) { const f = await findOne(`name='${name}' and '${folderId}' in parents`); id = f ? f.id : null; }
  return (await putFile(id, name, folderId, blob)).id;
}
// Archives présentes dans le dossier Drive : [{ id, name, size, modifiedTime }].
export async function archivesDrive() {
  const folderId = await ensureFolder();
  const r = await api(`${API}/files?q=${q(`name contains 'carnet-archive-' and '${folderId}' in parents and trashed=false`)}&fields=files(id,name,size,modifiedTime)&spaces=drive&pageSize=100`);
  return (r.files || []).filter(f => /^carnet-archive-.*\.json$/.test(f.name));
}
export const telechargerArchive = id => getBlob(id);

// Drive contient-il déjà des données du Carnet (avec au moins une classe) ?
export async function driveADesDonnees() {
  const folderId = await ensureFolder();
  const f = await findOne(`name='${DATA}' and '${folderId}' in parents`);
  if (!f) return false;
  try { const d = JSON.parse(await (await getBlob(f.id)).text()); return !!(d.stores && d.stores.classes && d.stores.classes.length); }
  catch (e) { if (e instanceof NeedAuth) throw e; return false; }
}
export const folderUrl = () => (config().folderId ? 'https://drive.google.com/drive/folders/' + config().folderId : null);
