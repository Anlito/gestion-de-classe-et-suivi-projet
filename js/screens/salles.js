// Administration → Plans de salle (#/admin/salles) et éditeur d'une salle (#/admin/salle/:id, « new » pour créer).
// Îlots : toucher un îlot pour le sélectionner, puis une case vide pour l'y déplacer ; places − / +, pivoter, supprimer.
// Rangées : nombre de rangs, de tables par rang et de places par table.
import * as db from '../db.js';
import * as S from '../salles.js';
import { planHtml } from '../plan-view.js';
import { html, toast, confirmDialog } from '../ui.js';
import { icon, backLink } from '../components.js';
import { go, refresh } from '../nav.js';

let draft = null; // copie de travail de la salle (enregistrée avec « Enregistrer »)
let sel = null;   // îlot sélectionné

const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);
const stepper = (label, action, v) => html`<div class="stepper-row">
  <span class="grow lbl-text">${label}</span>
  <button type="button" class="step-btn" data-click="${action}" data-d="-1" aria-label="Moins">−</button>
  <span class="step-n">${v}</span>
  <button type="button" class="step-btn" data-click="${action}" data-d="1" aria-label="Plus">+</button></div>`;

function listView() {
  const list = S.salles();
  const sans = S.sallesSansPlan();
  return html`<div class="screen">
    <header class="topbar">
      ${backLink('#/admin', 'Administration')}
      <div class="title">Plans de salle</div>
      <div class="spacer"></div>
      <a class="btn accent" href="#/admin/salle/new">${icon.plusBig}<span class="hide-narrow">Nouvelle salle</span></a>
    </header>
    <main class="content settings-page" data-scroll="salles">
      <div class="set-block">
        <div class="muted small">Un plan par salle, utilisé par toutes les classes qui y ont cours : le plan de classe (prochaine version)
          y placera les élèves. Le nom de la salle doit être celui de l’emploi du temps (ex. « Techno 1 ») pour que chaque cours retrouve son plan.</div>
        ${list.length ? list.map(s => html`<a class="etab-row salle-row" href="#/admin/salle/${s.id}">
            <span class="arch-ic">${icon.grid}</span>
            <div class="grow"><div class="strong-15">${s.name}</div>
              <div class="muted small">${s.type === 'rangees' ? `Rangées · ${s.rangs} × ${s.colonnes} tables` : `Îlots · ${plural((s.tables || []).length, 'îlot', 'îlots')}`} · ${plural(S.nbPlaces(s), 'place', 'places')}</div></div>
            ${icon.chevron}</a>`)
          : html`<div class="muted">Aucun plan de salle pour l’instant.</div>`}
      </div>
      ${sans.length ? html`<div class="set-block">
        <div class="set-title">Salles de votre emploi du temps sans plan</div>
        ${sans.slice(0, 8).map(x => html`<div class="etab-row"><div class="grow"><div class="strong-15">${x.name}</div>
          <div class="muted small">${plural(x.n, 'cours', 'cours')}</div></div>
          <button type="button" class="btn soft small" data-click="creer" data-name="${x.name}">Créer le plan</button></div>`)}
      </div>` : ''}
    </main>
  </div>`;
}

function editView() {
  const s = draft;
  const t = sel && (s.tables || []).find(x => x.id === sel);
  const sugg = !draft.id ? S.sallesSansPlan().slice(0, 6) : [];
  return html`<div class="screen">
    <header class="topbar">
      ${backLink('#/admin/salles', 'Plans de salle')}
      <div class="title ellipsis">${draft.id ? s.name || 'Salle' : 'Nouvelle salle'}</div>
      <div class="spacer"></div>
      <a class="btn soft hide-phone" href="#/admin/salles">Annuler</a>
      <button type="button" class="btn accent" data-click="save">Enregistrer</button>
    </header>
    <main class="content edit-grid salle-edit">
      <section class="panel form">
        <label class="lbl">Nom de la salle (comme dans l’emploi du temps)
          <input class="input big" value="${s.name}" data-input="name" placeholder="ex. Techno 1"></label>
        ${sugg.length ? html`<div class="row-center wrap">${sugg.map(x => html`<button type="button" class="chip-btn${x.name === s.name ? ' on' : ''}" data-click="pickName" data-name="${x.name}">${x.name}</button>`)}</div>` : ''}
        <div class="segmented">
          <button type="button" class="seg${s.type === 'ilots' ? ' on' : ''}" data-click="type" data-k="ilots">Îlots</button>
          <button type="button" class="seg${s.type === 'rangees' ? ' on' : ''}" data-click="type" data-k="rangees">Rangées</button>
        </div>
        ${s.type === 'rangees' ? html`
          ${stepper('Rangs (de l’avant vers le fond)', 'rangs', s.rangs)}
          ${stepper('Tables par rang', 'colonnes', s.colonnes)}
          ${stepper('Places par table', 'parTable', s.parTable)}`
        : html`
          <button type="button" class="btn soft self-start" data-click="addIlot">${icon.plusBig}Ajouter un îlot</button>
          ${t ? html`<div class="info-box ilot-box">
              <div class="set-title">Îlot sélectionné</div>
              ${stepper('Places', 'ilotPlaces', t.places)}
              <div class="row-center wrap">
                <button type="button" class="btn soft small" data-click="pivoter">Pivoter</button>
                <button type="button" class="btn danger-soft small" data-click="delIlot">${icon.trash}Supprimer l’îlot</button>
                <button type="button" class="btn soft small" data-click="deselect">Terminé</button>
              </div>
              <div class="muted small">Pour le déplacer : touchez une case vide du plan (son coin en haut à gauche s’y place).</div>
            </div>`
          : html`<div class="muted small">Touchez un îlot du plan pour le déplacer, changer son nombre de places (1 = poste individuel, jusqu’à ${S.MAX_PLACES}), le pivoter ou le supprimer.</div>`}`}
        <div class="muted">${plural(S.nbPlaces(s), 'place', 'places')} au total</div>
        ${draft.id ? html`<div class="danger-zone"><button type="button" class="btn danger-soft" data-click="delSalle">${icon.trash}Supprimer ce plan</button></div>` : ''}
      </section>
      <section class="panel plan-panel">
        ${planHtml(s, { sel, cells: s.type === 'ilots' && !!t, tableClick: s.type === 'ilots' ? 'selIlot' : '' })}
      </section>
    </main>
  </div>`;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default {
  render({ id }) {
    if (!id) { draft = null; sel = null; return listView(); }
    if (!draft || draft.key !== id) {
      const s = id === 'new' ? null : db.get('salles', id);
      if (id !== 'new' && !s) { go('#/admin/salles', { replace: true }); return null; }
      draft = s ? { ...JSON.parse(JSON.stringify(s)), key: id } : { ...S.nouvelleSalle(pendingName || ''), key: id };
      pendingName = '';
      sel = null;
    }
    return editView();
  },

  leave() { draft = null; sel = null; },

  actions: {
    creer(el) { pendingName = el.dataset.name; go('#/admin/salle/new'); },
    name(el) { draft.name = el.value; },
    pickName(el) { draft.name = el.dataset.name; refresh(); },
    type(el) {
      if (draft.type === el.dataset.k) return;
      draft.type = el.dataset.k;
      if (draft.type === 'ilots' && !(draft.tables || []).length) draft.tables = S.nouvelleSalle('', 'ilots').tables;
      sel = null; refresh();
    },
    rangs(el) { draft.rangs = clamp(draft.rangs + +el.dataset.d, 1, 10); refresh(); },
    colonnes(el) { draft.colonnes = clamp(draft.colonnes + +el.dataset.d, 1, 6); refresh(); },
    parTable(el) { draft.parTable = clamp(draft.parTable + +el.dataset.d, 1, 3); refresh(); },
    addIlot() {
      const t = { id: db.uid().slice(0, 8), places: 4, vertical: false };
      const pos = S.premierePlace(draft, t) || S.premierePlace(draft, { ...t, places: 2 });
      if (!pos) { toast({ text: 'Plus de place libre sur le plan : déplacez ou supprimez un îlot.' }); return; }
      if (!S.placeLibre(draft, { ...t, ...pos })) t.places = 2;
      draft.tables = [...(draft.tables || []), { ...t, ...pos }];
      sel = t.id; refresh();
    },
    selIlot(el) { sel = sel === el.dataset.id ? null : el.dataset.id; refresh(); },
    deselect() { sel = null; refresh(); },
    moveTo(el) {
      const t = draft.tables.find(x => x.id === sel);
      if (!t) return;
      const moved = { ...t, x: +el.dataset.x, y: +el.dataset.y };
      if (!S.placeLibre(draft, moved)) { toast({ text: 'L’îlot ne tient pas ici (il touche un autre îlot ou le bord).' }); return; }
      Object.assign(t, moved); refresh();
    },
    ilotPlaces(el) {
      const t = draft.tables.find(x => x.id === sel);
      const changed = { ...t, places: clamp(t.places + +el.dataset.d, 1, S.MAX_PLACES) };
      if (changed.places === t.places) return;
      if (!S.placeLibre(draft, changed)) { toast({ text: 'Pas assez de place autour de l’îlot : déplacez-le d’abord.' }); return; }
      Object.assign(t, changed); refresh();
    },
    pivoter() {
      const t = draft.tables.find(x => x.id === sel);
      const changed = { ...t, vertical: !t.vertical };
      if (!S.placeLibre(draft, changed)) { toast({ text: 'Pas assez de place pour le pivoter ici : déplacez-le d’abord.' }); return; }
      Object.assign(t, changed); refresh();
    },
    delIlot() {
      const idx = draft.tables.findIndex(x => x.id === sel);
      const removed = draft.tables.splice(idx, 1)[0];
      sel = null; refresh();
      toast({ text: 'Îlot supprimé', undo: () => { draft.tables.splice(idx, 0, removed); refresh(); } });
    },
    save() {
      const name = (draft.name || '').trim();
      if (!name) { toast({ text: 'Donnez le nom de la salle' }); document.querySelector('[data-input="name"]').focus(); return; }
      const autre = S.salleNommee(name);
      if (autre && autre.id !== draft.id) { toast({ text: `Il existe déjà un plan pour « ${autre.name} »` }); return; }
      if (!S.nbPlaces(draft)) { toast({ text: 'Le plan n’a aucune place' }); return; }
      const { key, ...rec } = draft;
      rec.name = name;
      const isNew = !rec.id;
      const undo = db.commit(w => w.put('salles', rec));
      draft = null; sel = null;
      go('#/admin/salles');
      toast({ text: isNew ? `Plan de « ${name} » créé` : 'Plan enregistré', undo: async () => { await undo(); refresh(); } });
    },
    async delSalle() {
      const s = db.get('salles', draft.id);
      if (!s || !(await confirmDialog({ title: `Supprimer le plan de « ${s.name} » ?`, text: 'Les plans de classe faits dans cette salle seront aussi effacés.', ok: 'Supprimer', danger: true }))) return;
      const undo = db.commit(w => w.del('salles', s.id));
      draft = null;
      go('#/admin/salles');
      toast({ text: 'Plan supprimé', undo: async () => { await undo(); refresh(); } });
    },
  },
};
let pendingName = ''; // nom proposé par « Créer le plan » (liste des salles sans plan)
