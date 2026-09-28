// nav.js — Navigation entre écrans (adresse après le « # ») et rafraîchissement de l'écran courant.
// Numéro de version affiché dans les Réglages (à augmenter avec VERSION dans sw.js à chaque mise à jour).
export const APP_VERSION = '1.4.1';
let renderer = () => {};
export function setRenderer(fn) { renderer = fn; }
export const refresh = () => renderer();
export function go(hash, { replace = false } = {}) {
  if (location.hash === hash) { refresh(); return; }
  if (replace) { history.replaceState(null, '', hash); refresh(); } else location.hash = hash;
}

// Thème clair / sombre, mémorisé sur l'appareil (clé carnet-theme).
export function currentTheme() { return document.documentElement.dataset.theme || 'clair'; }
export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('carnet-theme', t); } catch (e) { /* stockage indisponible */ }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const m = document.querySelector('meta[name="theme-color"]');
  if (m && bg) m.content = bg;
}
