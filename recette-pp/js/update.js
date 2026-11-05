// update.js — Mises à jour de l'app : recherche automatique (ouverture, retour dans l'app, toutes les heures)
// ou manuelle (Réglages). Quand une nouvelle version est prête, un bandeau propose de redémarrer l'app.

const CHECK_EVERY_MS = 15 * 60 * 1000;
let reg = null;
let lastCheck = 0;
let ready = false;

export const updateReady = () => ready;
export function restartApp() { location.reload(); }

// Bandeau en haut de l'écran (ne gêne pas la saisie ; reste jusqu'à ce qu'on choisisse).
function announce() {
  if (ready) return;
  ready = true;
  const el = document.createElement('div');
  el.className = 'update-banner';
  el.setAttribute('role', 'status');
  el.innerHTML = '<span class="grow">Nouvelle version de l’app prête</span>'
    + '<button type="button" class="toast-btn" data-u="later">Plus tard</button>'
    + '<button type="button" class="toast-btn accent" data-u="now">Redémarrer</button>';
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-u]');
    if (!b) return;
    if (b.dataset.u === 'now') restartApp(); else el.remove();
  });
  document.body.appendChild(el);
}

// Attend qu'un nouveau service worker en cours d'installation soit actif.
function waitActivated(sw) {
  return new Promise(resolve => {
    if (!sw || sw.state === 'activated') { resolve(true); return; }
    const t = setTimeout(() => resolve(false), 60000);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') { clearTimeout(t); resolve(true); }
      if (sw.state === 'redundant') { clearTimeout(t); resolve(false); }
    });
  });
}

// Renvoie 'ready' (nouvelle version prête), 'none' (déjà à jour), 'offline' ou 'unsupported'.
export async function checkForUpdate() {
  if (!reg) return 'unsupported';
  if (!navigator.onLine) return 'offline';
  lastCheck = Date.now();
  try { await reg.update(); } catch (e) { return 'offline'; }
  const sw = reg.installing || reg.waiting;
  if (sw) { const ok = await waitActivated(sw); if (ok) { announce(); return 'ready'; } }
  return ready ? 'ready' : 'none';
}

export async function initUpdates() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try { reg = await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('Service worker non installé', e); return; }
  const hadController = !!navigator.serviceWorker.controller;
  // Une nouvelle version vient de prendre le relais : l'écran affiché est encore l'ancien.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) announce(); });
  const maybeCheck = () => { if (Date.now() - lastCheck > CHECK_EVERY_MS) checkForUpdate(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeCheck(); });
  setInterval(maybeCheck, CHECK_EVERY_MS);
  checkForUpdate();
}
