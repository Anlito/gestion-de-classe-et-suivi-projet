// app.js — Démarrage de l'application et aiguillage entre les écrans.
import * as db from './db.js';
import * as model from './model.js';
import { setRenderer, setTheme, currentTheme } from './nav.js';
import { html, toast, closeLayer } from './ui.js';
import accueil from './screens/accueil.js';
import semaine from './screens/semaine.js';
import trombi from './screens/trombi.js';
import eleve from './screens/eleve.js';
import projet from './screens/projet.js';
import groupes from './screens/groupes.js';
import notes from './screens/notes.js';
import admin from './screens/admin.js';
import reglages from './screens/reglages.js';
import editClasse from './screens/edit-classe.js';
import editProjet from './screens/edit-projet.js';
import sauvegarde from './screens/sauvegarde.js';
import imprimer from './screens/imprimer.js';
import emploiDuTemps from './screens/emploi-du-temps.js';
import { initLock } from './lock.js';
import { initAlertes, render as renderAlertes } from './alertes.js';
import { lierAppels } from './planning.js';
import { initAutoSync } from './autosync.js';
import { initUpdates } from './update.js';


// Adresse (après #) → écran. Les parties entre parenthèses deviennent des paramètres.
const ROUTES = [
  [/^#?\/?$/, semaine, []],
  [/^#\/classes$/, accueil, []],
  [/^#\/classe\/([^/]+)\/trombi$/, trombi, ['classId']],
  [/^#\/classe\/([^/]+)\/eleve\/([^/]+)$/, eleve, ['classId', 'studentId']],
  [/^#\/classe\/([^/]+)\/projet$/, projet, ['classId']],
  [/^#\/classe\/([^/]+)\/groupes$/, groupes, ['classId']],
  [/^#\/classe\/([^/]+)\/notes$/, notes, ['classId']],
  [/^#\/admin$/, admin, []],
  [/^#\/admin\/reglages$/, reglages, []],
  [/^#\/admin\/sauvegarde$/, sauvegarde, []],
  [/^#\/admin\/planning$/, emploiDuTemps, []],
  [/^#\/imprimer\/(eleve|fiches|recap)\/([^/]+)$/, imprimer, ['kind', 'id']],
  [/^#\/admin\/classe\/([^/]+)$/, editClasse, ['id']],
  [/^#\/admin\/projet\/([^/]+)$/, editProjet, ['id']],
];

let current = null;
const view = () => document.getElementById('view');

function resolve() {
  const h = location.hash || '#/';
  for (const [re, screen, names] of ROUTES) {
    const m = h.match(re);
    if (m) return { screen, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return { screen: semaine, params: {} };
}

// Garde la position de défilement des zones marquées data-scroll quand on redessine le même écran.
function saveScroll(root) {
  return [...root.querySelectorAll('[data-scroll]')].map(el => [el.dataset.scroll, el.scrollTop]);
}
function restoreScroll(root, saved) {
  for (const [k, top] of saved) { const el = root.querySelector(`[data-scroll="${k}"]`); if (el) el.scrollTop = top; }
}

function render() {
  const root = view();
  const r = resolve();
  const key = location.hash || '#/';
  const same = current && current.key === key;
  const saved = same ? saveScroll(root) : [];
  if (!same) { closeLayer(); if (current && current.screen.leave) current.screen.leave(); }
  current = { ...r, key };
  const out = r.screen.render(r.params);
  if (out == null) return; // l'écran a redirigé ailleurs
  root.innerHTML = out.s;
  if (r.screen.mount) r.screen.mount(root, r.params);
  if (same) restoreScroll(root, saved);
  else root.querySelectorAll('[data-scroll]').forEach(el => { el.scrollTop = 0; });
  renderAlertes();
}

// Un seul écouteur par type d'événement : data-click="action" appelle screen.actions.action(élément, événement, paramètres).
function delegate(type) {
  view().addEventListener(type, e => {
    const el = e.target.closest(`[data-${type}]`);
    if (!el || !current) return;
    const fn = current.screen.actions && current.screen.actions[el.dataset[type]];
    if (fn) fn(el, e, current.params);
  });
}

async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch (e) { /* non disponible */ }
}


async function boot() {
  setTheme(currentTheme());
  initLock();
  try {
    await db.init();
  } catch (e) {
    view().innerHTML = html`<div class="fatal"><h1>Impossible d’ouvrir les données</h1><p>${String(e && e.message || e)}</p>
      <p>Fermez les autres onglets du Carnet de classe puis rechargez la page.</p></div>`.s;
    return;
  }
  db.onError(e => toast({ text: 'Erreur d’enregistrement : ' + (e && e.message || e), ms: 8000 }));
  model.ensureMeta();
  // Appels faits avant l'emploi du temps (ou hors planning) : rattachés au cours correspondant s'il existe.
  try { lierAppels(); } catch (e) { console.error(e); }
  setRenderer(render);
  ['click', 'input', 'change'].forEach(delegate);
  addEventListener('hashchange', render);
  render();
  initAlertes();
  initAutoSync();
  requestPersistentStorage();
  initUpdates();
}

boot();
