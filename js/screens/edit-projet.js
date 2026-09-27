// Créer / Modifier un projet : titre, description, nombre de séances, critères (chacun sur 4 pts).
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, confirmDialog } from '../ui.js';
import { icon, backLink } from '../components.js';
import { go, refresh } from '../nav.js';

let draft = null; // copie de travail, enregistrée seulement avec « Enregistrer »

function load(id) {
  if (id === 'new') return { id: null, title: '', desc: '', nSeances: 6, criteria: [{ id: db.uid(), code: 'C1', label: '', pronote: '' }] };
  const p = db.get('projects', id);
  return p ? { id: p.id, title: p.title, desc: p.desc || '', nSeances: p.nSeances, criteria: p.criteria.map(c => ({ ...c })) } : null;
}
const crit = id => draft.criteria.find(c => c.id === id);

// Nouveau code : même lettre que le dernier critère, numéro suivant (C4 → C5, D7 → D8).
function nextCode() {
  const last = draft.criteria[draft.criteria.length - 1];
  const m = last && /^([A-Za-z]*)(\d+)$/.exec(last.code || '');
  return m ? m[1].toUpperCase() + (+m[2] + 1) : 'C' + (draft.criteria.length + 1);
}

export default {
  render({ id }) {
    if (!draft || draft.key !== id) {
      const d = load(id);
      if (!d) { go('#/admin', { replace: true }); return null; }
      draft = { ...d, key: id };
    }
    const isNew = !draft.id;
    const cls = isNew ? [] : model.assignmentsOfProject(draft.id).map(a => db.get('classes', a.classId)).filter(Boolean)
      .sort((x, y) => model.cmp(x.name, y.name)).map(c => c.name);
    const n = draft.criteria.length;
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/admin', 'Administration')}
        <div class="title ellipsis">${isNew ? 'Nouveau projet' : `Modifier « ${draft.title || 'projet'} »`}</div>
        <div class="spacer"></div>
        ${isNew ? '' : html`<button type="button" class="btn soft hide-phone" data-click="duplicate">Dupliquer</button>`}
        <a class="btn soft hide-phone" href="#/admin">Annuler</a>
        <button type="button" class="btn accent" data-click="save">Enregistrer</button>
      </header>
      <main class="content edit-grid proj-edit">
        <section class="panel form">
          <label class="lbl">Titre
            <input class="input big" data-input="title" value="${draft.title}" placeholder="Nom du projet"></label>
          <label class="lbl">Description
            <textarea class="input" rows="3" data-input="desc" placeholder="Objectif du projet, production attendue…">${draft.desc}</textarea></label>
          <div class="stepper-row">
            <span class="grow lbl-text">Nombre de séances</span>
            <button type="button" class="step-btn" data-click="lessN" aria-label="Moins">−</button>
            <span class="step-n">${draft.nSeances}</span>
            <button type="button" class="step-btn" data-click="moreN" aria-label="Plus">+</button>
          </div>
          <div class="info-box">
            <div class="set-title">Notation par niveaux · chaque critère sur 4 pts</div>
            ${model.LEVELS.map(l => html`<div class="lvl-row"><span class="lvl-chip" style="background:${l.bg};color:${l.fg}">${l.v}</span>
              <span class="lvl-name">${l.name}</span><span class="muted">${l.pronote}</span></div>`)}
            <div class="muted small">Note /20 = moyenne des niveaux × 5. Mentions : moins de 10 À approfondir · 10 à 12 Satisfaisant · 13 à 16 Bien · 17 et plus Très bien.</div>
          </div>
          ${isNew ? '' : html`<div class="stack-tight"><strong>Classes associées</strong>
            <span class="muted">${cls.length ? cls.join(' · ') : 'Aucune'} — l’association se fait depuis chaque classe.</span></div>
            <div class="danger-zone"><button type="button" class="btn danger-soft" data-click="deleteProject">${icon.trash}Supprimer le projet</button></div>`}
        </section>

        <section class="panel">
          <div class="panel-head plain row"><span class="panel-title">Critères</span><span class="muted">${n} critère${n > 1 ? 's' : ''}</span></div>
          <div class="crit-head"><span class="c-code">Code</span><span class="grow">Intitulé</span><span class="c-pts">Barème</span><span class="c-pronote">Compétence Pronote (facultatif)</span><span class="c-del"></span></div>
          <div class="panel-scroll crit-list" data-scroll="crit">
            ${draft.criteria.map(c => html`<div class="crit-row">
              <input class="input c-code strong-in" value="${c.code}" data-input="code" data-id="${c.id}" aria-label="Code">
              <input class="input grow" value="${c.label}" data-input="label" data-id="${c.id}" placeholder="Intitulé du critère">
              <span class="c-pts muted strong-sm">4 pts</span>
              <input class="input c-pronote" value="${c.pronote || ''}" data-input="pronote" data-id="${c.id}" placeholder="—">
              <button type="button" class="icon-btn c-del" data-click="delCrit" data-id="${c.id}" aria-label="Supprimer le critère">${icon.trash}</button>
            </div>`)}
            <button type="button" class="add-row" data-click="addCrit">${icon.plusBig}Ajouter un critère</button>
          </div>
          <div class="crit-foot"><strong>${n} critère${n > 1 ? 's' : ''} × 4 pts = ${n * 4} pts</strong><span class="muted">ramené sur 20</span></div>
        </section>
      </main>
    </div>`;
  },

  leave() { draft = null; },

  actions: {
    title(el) { draft.title = el.value; },
    desc(el) { draft.desc = el.value; },
    code(el) { const c = crit(el.dataset.id); const v = el.value.toUpperCase(); if (el.value !== v) el.value = v; c.code = v; },
    label(el) { crit(el.dataset.id).label = el.value; },
    pronote(el) { crit(el.dataset.id).pronote = el.value; },
    lessN() { draft.nSeances = Math.max(1, draft.nSeances - 1); refresh(); },
    moreN() { draft.nSeances = Math.min(40, draft.nSeances + 1); refresh(); },
    addCrit() {
      draft.criteria.push({ id: db.uid(), code: nextCode(), label: '', pronote: '' });
      refresh();
      const inputs = document.querySelectorAll('[data-input="label"]');
      inputs[inputs.length - 1].focus();
    },
    async delCrit(el) {
      const id = el.dataset.id;
      const used = draft.id && db.all('groups').some(g => g.levels[id] != null && db.get('assignments', g.assignmentId)?.projectId === draft.id);
      if (used && !(await confirmDialog({
        title: 'Supprimer ce critère ?',
        text: 'Des groupes ont déjà été évalués sur ce critère. Leurs niveaux ne compteront plus dans les notes une fois le projet enregistré.',
        ok: 'Supprimer le critère', danger: true,
      }))) return;
      const idx = draft.criteria.findIndex(c => c.id === id);
      const removed = draft.criteria.splice(idx, 1)[0];
      refresh();
      toast({ text: `Critère ${removed.code || ''} retiré`, undo: () => { draft.criteria.splice(idx, 0, removed); refresh(); } });
    },
    save() {
      const title = draft.title.trim();
      if (!title) { toast({ text: 'Donnez un titre au projet' }); document.querySelector('[data-input="title"]').focus(); return; }
      const criteria = draft.criteria.filter(c => c.code.trim() || c.label.trim())
        .map(c => ({ id: c.id, code: c.code.trim(), label: c.label.trim(), pronote: (c.pronote || '').trim() }));
      if (!criteria.length) { toast({ text: 'Ajoutez au moins un critère' }); return; }
      const isNew = !draft.id;
      const rec = { title, desc: draft.desc.trim(), nSeances: draft.nSeances, criteria };
      if (!isNew) rec.id = draft.id;
      const undo = db.commit(w => w.put('projects', rec));
      draft = null;
      go('#/admin');
      toast({ text: isNew ? `Projet « ${title} » créé` : 'Modifications enregistrées', undo: async () => { await undo(); refresh(); } });
    },
    async deleteProject() {
      const p = db.get('projects', draft.id);
      if (!p) return;
      const cls = model.assignmentsOfProject(p.id).map(a => db.get('classes', a.classId)).filter(Boolean).map(c => c.name);
      if (!(await confirmDialog({
        title: `Supprimer le projet « ${p.title} » ?`,
        text: cls.length
          ? `Il est associé à : ${cls.join(', ')}. Dans ces classes, ses séances, son journal, ses groupes et ses évaluations seront supprimés. Les observations de comportement des élèves sont conservées.`
          : 'Il n’est associé à aucune classe.',
        ok: 'Supprimer le projet', danger: true,
      }))) return;
      const undo = model.deleteProject(p.id);
      draft = null;
      go('#/admin');
      toast({ text: `Projet « ${p.title} » supprimé`, undo: async () => { await undo(); refresh(); } });
    },
    async duplicate() {
      const p = db.get('projects', draft.id);
      if (!p) return;
      const { copy } = model.duplicateProject(p);
      draft = null;
      go(`#/admin/projet/${copy.id}`);
      toast({ text: `Copie « ${copy.title} » créée` });
    },
  },
};
