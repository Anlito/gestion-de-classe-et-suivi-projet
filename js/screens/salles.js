// Administration → Plans de salle (#/admin/salles) et éditeur d'une salle (#/admin/salle/:id, « new » pour créer).
// Îlots : toucher un îlot pour le sélectionner, puis une case vide pour l'y déplacer ; places − / +, pivoter, supprimer.
// Rangées : nombre de rangs, de tables par rang et de places par table.
import * as db from '../db.js';
import * as S from '../salles.js';
import * as planning from '../planning.js';
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
            <div class="grow"><div class="strong-15">${s.name}${S.etabLabel(s) ? html` <span class="chip">${S.etabLabel(s)}</span>` : ''}</div>
              <div class="muted small">${s.type === 'rangees' ? `Rangées · ${s.rangs} × ${s.colonnes} tables` : `Îlots · ${plural((s.tables || []).length, 'îlot', 'îlots')}`} · ${plural(S.nbPlaces(s), 'place', 'places')}</div></div>
            ${icon.chevron}</a>`)
          : html`<div class="muted">Aucun plan de salle pour l’instant.</div>`}
      </div>
      ${sans.length ? html`<div class="set-block">
        <div class="set-title">Salles de votre emploi du temps sans plan</div>
        ${sans.slice(0, 8).map(x => html`<div class="etab-row"><div class="grow"><div class="strong-15">${x.name}${S.etabLabel(x) ? html` <span class="chip">${S.etabLabel(x)}</span>` : ''}</div>
          <div class="muted small">${plural(x.n, 'cours', 'cours')}</div></div>
          <button type="button" class="btn soft small" data-click="creer" data-name="${x.name}" data-etab="${x.etabId || ''}">Créer le plan</button></div>`)}
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
        ${sugg.length ? html`<div class="row-center wrap">${sugg.map(x => html`<button type="button" class="chip-btn${x.name === s.name ? ' on' : ''}" data-click="pickName" data-name="${x.name}" data-etab="${x.etabId || ''}">${x.name}${S.etabLabel(x) ? ' · ' + S.etabLabel(x) : ''}</button>`)}</div>` : ''}
        ${db.all('etablissements').length ? html`<label class="lbl">Collège
          <select class="input" data-change="etab"><option value="">— Tous —</option>${planning.etablissements().map(e => html`<option value="${e.id}" ${s.etabId === e.id ? 'selected' : ''}>${e.initiales} · ${e.name}</option>`)}</select></label>` : ''}
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
              ${t.places > 2 ? html`<div class="segmented">
                <button type="button" class="seg${t.ligne ? '' : ' on'}" data-click="ligne" data-v="0">Face à face</button>
                <button type="button" class="seg${t.ligne ? ' on' : ''}" data-click="ligne" data-v="1">En ligne</button></div>` : ''}
              <div class="rot-row">
                <span class="lbl-text grow">Rotation</span>
                <button type="button" class="step-btn" data-click="tourner" data-d="-${S.PAS_ANGLE}" aria-label="Tourner à gauche">↺</button>
                <span class="step-n rot-n">${((t.angle % 360) + 360) % 360}°</span>
                <button type="button" class="step-btn" data-click="tourner" data-d="${S.PAS_ANGLE}" aria-label="Tourner à droite">↻</button>
              </div>
              <div class="row-center wrap">
                <button type="button" class="btn soft small" data-click="tourner" data-d="90">+ 90°</button>
                <button type="button" class="btn soft small" data-click="droit">Remettre droit</button>
                <button type="button" class="btn danger-soft small" data-click="delIlot">${icon.trash}Supprimer</button>
                <button type="button" class="btn soft small" data-click="deselect">Terminé</button>
              </div>
            </div>`
          : html`<div class="muted small">Faites <strong>glisser</strong> un îlot avec le doigt pour le placer. <strong>Touchez</strong>-le pour changer son nombre de places
              (1 = poste individuel, jusqu’à ${S.MAX_PLACES}), sa disposition (face à face ou en ligne), le tourner dans tous les sens ou le supprimer.</div>`}`}
        <div class="muted">${plural(S.nbPlaces(s), 'place', 'places')} au total</div>
        ${draft.id ? html`<div class="danger-zone"><button type="button" class="btn danger-soft" data-click="delSalle">${icon.trash}Supprimer ce plan</button></div>` : ''}
      </section>
      <section class="panel plan-panel">
        ${planHtml(s, { sel, drag: s.type === 'ilots' })}
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
      draft = s ? { ...JSON.parse(JSON.stringify(s)), key: id } : { ...S.nouvelleSalle(pendingName || '', 'ilots', pendingEtab), key: id };
      draft.tables = S.tablesOf(draft);
      // Ancien plan sans collège : celui des cours qui ont lieu dans cette salle, s'il n'y en a qu'un.
      if (draft.etabId === undefined) {
        const etabs = [...new Set(db.all('cours').filter(c => (c.salle || '').trim().toLowerCase() === (draft.name || '').trim().toLowerCase()).map(c => c.etabId).filter(Boolean))];
        draft.etabId = etabs.length === 1 ? etabs[0] : null;
      }
      pendingName = ''; pendingEtab = null;
      sel = null;
    }
    return editView();
  },

  // Îlots : glisser au doigt (ou à la souris) pour déplacer ; un simple toucher sélectionne.
  mount(root) {
    const room = root.querySelector('[data-room]');
    if (!room || !draft || draft.type !== 'ilots') return;
    room.querySelectorAll('.plan-ilot.drag').forEach(el => {
      el.addEventListener('pointerdown', e => {
        const t = draft.tables.find(x => x.id === el.dataset.ilot);
        if (!t || e.button > 0) return;
        e.preventDefault();
        const rect = room.getBoundingClientRect();
        const ux = rect.width / S.LARGEUR, uy = rect.height / S.HAUTEUR;
        const start = { x: e.clientX, y: e.clientY, cx: t.cx, cy: t.cy };
        let moved = false;
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
        const d = S.disposition(t);
        const move = ev => {
          const dx = (ev.clientX - start.x) / ux, dy = (ev.clientY - start.y) / uy;
          if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
          moved = true;
          const b = S.borner({ cx: start.cx + dx, cy: start.cy + dy });
          t.cx = b.cx; t.cy = b.cy;
          el.style.left = ((t.cx - d.cols / 2) / S.LARGEUR * 100) + '%';
          el.style.top = ((t.cy - d.rows / 2) / S.HAUTEUR * 100) + '%';
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          sel = moved ? t.id : (sel === t.id ? null : t.id);
          refresh();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      });
    });
  },

  leave() { draft = null; sel = null; },

  actions: {
    creer(el) { pendingName = el.dataset.name; pendingEtab = el.dataset.etab || null; go('#/admin/salle/new'); },
    name(el) { draft.name = el.value; },
    pickName(el) { draft.name = el.dataset.name; if (el.dataset.etab) draft.etabId = el.dataset.etab; refresh(); },
    etab(el) { draft.etabId = el.value || null; },
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
      const t = { id: db.uid().slice(0, 8), places: 4, ligne: false, angle: 0, ...S.pointLibre(draft) };
      draft.tables = [...(draft.tables || []), t];
      sel = t.id; refresh();
      toast({ text: 'Îlot ajouté : faites-le glisser à sa place' });
    },
    deselect() { sel = null; refresh(); },
    ilotPlaces(el) {
      const t = draft.tables.find(x => x.id === sel);
      t.places = clamp(t.places + +el.dataset.d, 1, S.MAX_PLACES);
      Object.assign(t, S.borner(t)); refresh();
    },
    ligne(el) { const t = draft.tables.find(x => x.id === sel); t.ligne = el.dataset.v === '1'; refresh(); },
    tourner(el) {
      const t = draft.tables.find(x => x.id === sel);
      t.angle = (((t.angle || 0) + +el.dataset.d) % 360 + 360) % 360;
      refresh();
    },
    droit() { const t = draft.tables.find(x => x.id === sel); t.angle = 0; refresh(); },
    delIlot() {
      const idx = draft.tables.findIndex(x => x.id === sel);
      const removed = draft.tables.splice(idx, 1)[0];
      sel = null; refresh();
      toast({ text: 'Îlot supprimé', undo: () => { draft.tables.splice(idx, 0, removed); refresh(); } });
    },
    save() {
      const name = (draft.name || '').trim();
      if (!name) { toast({ text: 'Donnez le nom de la salle' }); document.querySelector('[data-input="name"]').focus(); return; }
      const autre = S.salleNommee(name, draft.etabId);
      if (autre && autre.id !== draft.id && (autre.etabId || null) === (draft.etabId || null)) { toast({ text: `Il existe déjà un plan pour « ${autre.name} »${S.etabLabel(autre) ? ' (' + S.etabLabel(autre) + ')' : ''}` }); return; }
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
let pendingName = '', pendingEtab = null; // nom et collège proposés par « Créer le plan » (salles sans plan)
