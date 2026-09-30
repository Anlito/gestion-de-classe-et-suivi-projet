// alertes.js — Alertes dans l'app (pas de notifications système), affichées dans un coin de l'écran sur tous
// les écrans (élément #alerts) :
// - « Appel non fait » : cours suivi ou « appel seulement » commencé depuis 15 min, sans appel rattaché ;
//   reste affiché jusqu'à ce que l'appel soit fait.
// - « Séances à remplir » : à partir de 18 h, cours suivis du jour (avec un projet en cours) sans séance reliée ;
//   « Remplir la séance » ou « Pas une séance projet » (mémorisé).
// Aucune alerte pour un cours annulé, classe absente, sortie pédagogique, absence personnelle, ni en vacances / férié.
import * as db from './db.js';
import * as model from './model.js';
import * as planning from './planning.js';
import { html, toast, todayISO } from './ui.js';
import { go, refresh } from './nav.js';

export const DELAI_APPEL = 15;       // minutes après le début du cours
export const HEURE_SEANCES = 18 * 60; // 18 h
const toMin = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
// 1 créneau = 1 séance : le cours est couvert par la séance qui lui est reliée (les séances créées dans l'onglet
// Projet sont reliées à un créneau du jour par planning.lierAppels).
const couvert = e => !!model.seanceOfCours(e.id);

// Liste des alertes à l'instant « now » : [{ type: 'appel'|'seance', cours (affiché), classId, cls }].
export function alertes(now = new Date()) {
  const today = todayISO(now), m = now.getHours() * 60 + now.getMinutes();
  if (!db.all('cours').length || planning.isOffDay(today)) return [];
  const out = [];
  for (const e of planning.coursEntre(today, today).sort((a, b) => a.debut.localeCompare(b.debut))) {
    const classId = planning.classIdOf(e.src);
    if (!classId || planning.NO_ALERT.has(e.statut)) continue;
    const role = planning.roleOfCours(e);
    if (role !== 'suivi' && role !== 'appel') continue;
    const cls = db.get('classes', classId);
    if (m >= toMin(e.debut) + DELAI_APPEL && !model.appelOfCours(e.id)) out.push({ type: 'appel', cours: e, classId, cls });
    if (m >= HEURE_SEANCES && role === 'suivi' && m >= toMin(e.debut) && !e.pasSeance && !couvert(e)
      && model.activeAssignments(classId).length) out.push({ type: 'seance', cours: e, classId, cls });
  }
  return out;
}

// ---------- Affichage ----------
// Liste dépliée ou repliée : choix mémorisé sur l'appareil (repliée, elle ne cache plus l'écran).
let open = (() => { try { return localStorage.getItem('carnet-alertes') !== 'repliees'; } catch (e) { return true; } })();
let startAppelHook = null; // fourni par le trombinoscope : ouvre l'appel d'une classe
export function onFaireAppel(fn) { startAppelHook = fn; }

export function render() {
  const el = document.getElementById('alerts');
  if (!el) return;
  const hash = location.hash || '#/';
  // Pas d'alertes à l'impression, sur l'écran verrouillé, ni dans l'administration (formulaires, import).
  if (hash.startsWith('#/imprimer') || hash.startsWith('#/admin') || document.querySelector('.lock')) { el.innerHTML = ''; return; }
  // Appels et séances faits sans cours (ex. séance créée dans l'onglet Projet après le cours) : reliés d'abord.
  try { planning.lierAppels(); } catch (e) { console.error(e); }
  const list = alertes();
  const appels = list.filter(a => a.type === 'appel'), seances = list.filter(a => a.type === 'seance');
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = html`<div class="alerts-box" role="status">
    <button type="button" class="alerts-head" data-a="toggle">
      <span class="alerts-dot"></span>
      <span class="grow">${[appels.length && `${appels.length} appel${appels.length > 1 ? 's' : ''} non fait${appels.length > 1 ? 's' : ''}`,
        seances.length && `${seances.length} séance${seances.length > 1 ? 's' : ''} à remplir`].filter(Boolean).join(' · ')}</span>
      <span class="alerts-chev">${open ? '▾' : '▸'}</span>
    </button>
    ${open ? html`<div class="alerts-list">
      ${appels.map(a => html`<div class="alert-row">
        <span class="grow"><strong>Appel non fait – ${a.cls.name}</strong><span class="muted small"> · ${a.cours.debut}</span></span>
        <button type="button" class="btn accent small" data-a="appel" data-id="${a.cours.id}">Faire l’appel</button>
      </div>`)}
      ${seances.length ? html`<div class="alert-sec">Cours du jour sans séance de projet</div>` : ''}
      ${seances.map(a => html`<div class="alert-row wrap">
        <span class="grow"><strong>${a.cls.name}</strong><span class="muted small"> · ${a.cours.debut}–${a.cours.fin}</span></span>
        <button type="button" class="btn accent small" data-a="remplir" data-id="${a.cours.id}">Remplir la séance</button>
        <button type="button" class="btn soft small" data-a="pas" data-id="${a.cours.id}">Pas une séance projet</button>
      </div>`)}
    </div>` : ''}
  </div>`.s;
}

function clickHandler(e) {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const kind = b.dataset.a;
  if (kind === 'toggle') {
    open = !open;
    try { localStorage.setItem('carnet-alertes', open ? 'ouvertes' : 'repliees'); } catch (err) { /* stockage indisponible */ }
    render();
    return;
  }
  const c = db.get('cours', b.dataset.id);
  if (!c) return;
  const classId = planning.classIdOf(c);
  if (kind === 'appel') {
    planning.openedFromPlanning(c);
    if (startAppelHook) startAppelHook(classId);
    go(`#/classe/${classId}/trombi`);
  } else if (kind === 'remplir') {
    // Crée la séance reliée à ce cours (si besoin), puis ouvre le journal du projet.
    const a = model.activeAssignments(classId)[0];
    if (a && !model.seanceOfCours(c.id)) model.newSeance(a, { date: planning.eff(c).date, coursId: c.id });
    planning.openedFromPlanning(c);
    go(`#/classe/${classId}/projet`);
    render();
  } else if (kind === 'pas') {
    const undo = planning.setPasSeance(c, true);
    render();
    toast({ text: 'Noté : pas une séance projet', undo: async () => { await undo(); render(); refresh(); } });
  }
}

let timer = null;
export function initAlertes() {
  const el = document.getElementById('alerts');
  if (!el) return;
  el.addEventListener('click', clickHandler);
  db.onChange(() => render());
  timer = timer || setInterval(render, 30 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  render();
}
