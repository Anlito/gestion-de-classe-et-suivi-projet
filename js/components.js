// components.js — Morceaux d'interface réutilisés par plusieurs écrans.
import * as db from './db.js';
import { html, raw, fmtDay } from './ui.js';
import { isDrive } from './drive.js';
import { statusHtml } from './autosync.js';

export const icon = {
  back: raw('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'),
  chevron: raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'),
  down: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'),
  sliders: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>'),
  minus: raw('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M5 12h14"/></svg>'),
  plus: raw('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>'),
  plusBig: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>'),
  list: raw('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9"/></svg>'),
  camera: raw('<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'),
  swap: raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l-3 3 3 3M4 7h13M17 20l3-3-3-3M20 17H7"/></svg>'),
  trash: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>'),
  edit: raw('<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>'),
  dice: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>'),
  roll: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3h6v1.5M8.5 12l2.5 2.5 4.5-5"/></svg>'),
  download: raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>'),
  close: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'),
  arrow: raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>'),
  calendar: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>'),
  book: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5c-.8 0-1.5-.7-1.5-1.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z"/></svg>'),
  refresh: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v3h3M4 13a8 8 0 0 0 14.6 4.5M20 20v-3h-3"/></svg>'),
  check: raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'),
  tabTrombi: raw('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'),
  tabProjet: raw('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h16M6 16V9M12 16V5M18 16v-4"/></svg>'),
  tabGroupes: raw('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5M15.5 14.2c2.6-.3 4.8 1.2 5.5 4.3"/></svg>'),
  tabNotes: raw('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/></svg>'),
};

export function backLink(href, label) {
  return html`<a class="back" href="${href}" aria-label="Retour : ${label}">${icon.back}<span class="back-label">${label}</span></a>`;
}

// État de sauvegarde, affiché dans les en-têtes : « Synchronisé 10:42 » en mode Google Drive,
// sinon la date de la dernière sauvegarde manuelle.
export function saveStatus() {
  if (isDrive()) return statusHtml();
  const last = db.getMeta('lastBackupAt');
  const old = !last || Date.now() - new Date(last).getTime() > 7 * 24 * 3600 * 1000;
  const text = last ? 'Sauvegardé le ' + fmtDay(last) : 'Aucune sauvegarde';
  return html`<a class="status${old ? ' warn' : ''}" href="#/admin/sauvegarde" title="${old ? 'Pensez à faire une sauvegarde' : ''}"><span class="status-dot"></span><span class="status-text">${text}</span></a>`;
}

const TABS = [
  ['trombi', 'Trombinoscope', icon.tabTrombi],
  ['projet', 'Projet', icon.tabProjet],
  ['groupes', 'Groupes', icon.tabGroupes],
  ['notes', 'Notes', icon.tabNotes],
];
export function tabBar(classId, active) {
  return html`<nav class="tabbar">${TABS.map(([k, label, ic]) =>
    html`<a class="tab" href="#/classe/${classId}/${k}" ${k === active ? raw('aria-current="page"') : ''}>${ic}${label}</a>`)}</nav>`;
}

// Sélecteur de projet dans l'en-tête des onglets Groupes et Notes : boutons côte à côte, ou menu s'il y en a beaucoup.
export function projectSwitch(list, current) {
  if (!list.length) return '';
  const title = a => { const p = db.get('projects', a.projectId); return p ? p.title : '?'; };
  if (list.length <= 3) {
    return html`<div class="segmented head-seg">${list.map(a =>
      html`<button type="button" class="seg${current && a.id === current.id ? ' on' : ''}" data-click="pickAssign" data-id="${a.id}">${title(a)}</button>`)}</div>`;
  }
  return html`<button type="button" class="picker" data-click="pickAssignMenu"><span class="muted">Projet :</span><strong>${current ? title(current) : '?'}</strong>${icon.down}</button>`;
}

// Photo d'élève au format 2:3, ou cadre « Photo manquante ».
export function photo(student, { cls = '', badge = false, label = true, url: given } = {}) {
  const url = given !== undefined ? given : db.photoURL(student.photoId);
  return html`<span class="photo ${cls}${url ? '' : ' missing'}">
    ${url ? html`<img src="${url}" alt="" draggable="false">`
      : html`<span class="photo-missing">${icon.camera}${label ? html`<span>Photo<br>manquante</span>` : ''}</span>`}
    ${badge ? html`<span class="photo-badge">${icon.list}</span>` : ''}
  </span>`;
}
