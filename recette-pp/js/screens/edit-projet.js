// Créer / Modifier un projet : titre, description, nombre de séances, critères (chacun sur 4 pts).
// Les critères peuvent être choisis dans le programme de technologie du cycle 4 (programme.js).
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, confirmDialog } from '../ui.js';
import { icon, backLink } from '../components.js';
import { go, refresh } from '../nav.js';
import { THEMES, COMPETENCES, NIVEAUX, SOURCE } from '../programme.js';
import * as prepa from '../prepa.js';

let draft = null; // copie de travail, enregistrée seulement avec « Enregistrer »
// Ouvert depuis le panneau d'un cours (« Modifier la liste de la séance ») : partie matériel dépliée, retour au planning.
let matOpen = false, retour = null;
export function ouvrirMateriel(projectId, back = '#/') { matOpen = true; retour = back; location.hash = `#/admin/projet/${projectId}`; }
// Fenêtre « Choisir dans le programme » : target = id du critère à remplacer (null : ajout de plusieurs critères).
let picker = null; // { target, level: 'all'|'5e'|'4e'|'3e', open: Set(n° de compétence), sel: Map(clé → { label, pronote }) }

// Niveau proposé d'office : celui des classes associées au projet s'il n'y en a qu'un.
function defaultLevel() {
  if (!draft.id) return 'all';
  const lv = [...new Set(model.assignmentsOfProject(draft.id).map(a => db.get('classes', a.classId)).filter(Boolean).map(c => c.level))];
  return lv.length === 1 && NIVEAUX.includes(lv[0]) ? lv[0] : 'all';
}

function pickerView() {
  const multi = !picker.target;
  const target = multi ? null : crit(picker.target);
  const levels = picker.level === 'all' ? NIVEAUX : [picker.level];
  const pickBtn = (key, label, pronote, sub = '') => {
    const on = picker.sel.has(key);
    return html`<button type="button" class="prog-item${on ? ' on' : ''}" data-click="progPick" data-key="${key}" data-label="${label}" data-pronote="${pronote}">
      <span class="prog-check">${on ? icon.check : ''}</span>
      <span class="grow">${sub ? html`<span class="prog-lvl">${sub}</span>` : ''}${label}</span>
    </button>`;
  };
  return html`<div class="scrim dim" data-click="closePicker"></div>
    <aside class="drawer prog-drawer" role="dialog" aria-modal="true">
      <div class="drawer-head"><span class="drawer-title grow ellipsis">${multi ? 'Choisir dans le programme' : `Critère ${target ? target.code : ''} · programme`}</span>
        <button type="button" class="btn soft" data-click="closePicker">Fermer</button></div>
      <div class="drawer-body" data-scroll="prog">
        <div class="stack-tight">
          <div class="segmented">${[['all', 'Tous'], ...NIVEAUX.map(n => [n, n])].map(([k, l]) =>
            html`<button type="button" class="seg${picker.level === k ? ' on' : ''}" data-click="progLevel" data-k="${k}">${l}</button>`)}</div>
          <div class="muted small">${multi ? 'Touchez les repères à évaluer : chacun devient un critère.' : 'Touchez un repère ou une compétence pour ce critère.'}
            Seule la colonne « Compétence Pronote » est remplie (compétence de fin de cycle) : l’intitulé reste le vôtre.</div>
        </div>
        ${THEMES.map((t, ti) => html`<div class="prog-theme">
          <div class="caps">Thème ${ti + 1}</div>
          <div class="prog-theme-title">${t.title}</div>
          ${COMPETENCES.filter(c => c.theme === ti).map(c => {
            const open = picker.open.has(c.n);
            const count = [...picker.sel.keys()].filter(k => k.split('.')[0] === String(c.n)).length;
            return html`<div class="prog-comp${open ? ' open' : ''}">
              <button type="button" class="prog-comp-head" data-click="progToggle" data-n="${c.n}" aria-expanded="${open ? 'true' : 'false'}">
                <span class="prog-n">${c.n}</span><span class="grow">${c.label}</span>
                ${count ? html`<span class="chip accent">${count}</span>` : ''}${icon.down}
              </button>
              ${open ? html`<div class="prog-comp-body">
                ${pickBtn(String(c.n), 'Toute la compétence (sans repère précis)', c.label)}
                ${c.parts.map((p, pi) => {
                  const items = levels.flatMap(lv => p.reperes[lv].map((r, ri) => ({ lv, r, key: `${c.n}.${pi}.${lv}.${ri}` })));
                  return items.length ? html`<div class="prog-part">${p.title}</div>
                    ${items.map(x => pickBtn(x.key, x.r, c.label, picker.level === 'all' ? x.lv : ''))}` : '';
                })}
              </div>` : ''}
            </div>`;
          })}
        </div>`)}
        <div class="muted xsmall">${SOURCE}</div>
      </div>
      ${multi ? html`<div class="drawer-foot">
        <span class="grow muted">${picker.sel.size ? `${picker.sel.size} repère${picker.sel.size > 1 ? 's' : ''} choisi${picker.sel.size > 1 ? 's' : ''}` : 'Aucun repère choisi'}</span>
        <button type="button" class="btn accent" data-click="progAdd" ${picker.sel.size ? '' : 'disabled'}>Ajouter ${picker.sel.size > 1 ? picker.sel.size + ' critères' : 'le critère'}</button>
      </div>` : ''}
    </aside>`;
}

function load(id) {
  if (id === 'new') return { id: null, title: '', desc: '', nSeances: 6, criteria: [{ id: db.uid(), code: 'C1', label: '', pronote: '' }], materiel: {} };
  const p = db.get('projects', id);
  // materiel : texte de chaque séance (une ligne par élément), converti en listes à l'enregistrement.
  const materiel = Object.fromEntries(Object.entries(p ? p.materiel || {} : {}).map(([n, list]) => [n, prepa.versTexte(list)]));
  return p ? { id: p.id, title: p.title, desc: p.desc || '', nSeances: p.nSeances, criteria: p.criteria.map(c => ({ ...c })), materiel } : null;
}
const crit = id => draft.criteria.find(c => c.id === id);
// Place le curseur dans l'intitulé d'un critère s'il est encore vide (à écrire soi-même).
function focusLabel(id) {
  const el = document.querySelector(`[data-input="label"][data-id="${id}"]`);
  if (el && !el.value) el.focus();
}

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
        ${retour ? backLink(retour, 'Planning') : backLink('#/admin', 'Administration')}
        <div class="title ellipsis">${isNew ? 'Nouveau projet' : `Modifier « ${draft.title || 'projet'} »`}</div>
        <div class="spacer"></div>
        ${isNew ? '' : html`<button type="button" class="btn soft hide-phone" data-click="duplicate">Dupliquer</button>`}
        <a class="btn soft hide-phone" href="${retour || '#/admin'}">Annuler</a>
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
          <details class="guide mat-box"${matOpen || Object.values(draft.materiel).some(t => t.trim()) ? ' open' : ''}>
            <summary>Matériel à préparer par séance (facultatif)</summary>
            <div class="muted small">Un élément par ligne. Cette liste s’affiche sur chaque cours où la séance est prévue, pour toutes les classes
              qui font ce projet, avec un rappel la veille. Ajouts ponctuels : directement sur le cours, dans le planning.</div>
            ${Array.from({ length: draft.nSeances }, (_, i) => i + 1).map(n => html`<label class="lbl mat-seance">Séance ${n}
              <textarea class="input" rows="${Math.max(2, (draft.materiel[n] || '').split('\n').length)}" data-input="materiel" data-n="${n}" placeholder="ex. Imprimante 3D allumée&#10;Cartes micro:bit + câbles">${draft.materiel[n] || ''}</textarea></label>`)}
          </details>
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
              <input class="input grow" value="${c.label}" data-input="label" data-id="${c.id}" placeholder="${c.hint ? 'Votre intitulé · ex. : ' + c.hint : 'Intitulé du critère'}" title="${c.hint || ''}">
              <span class="c-pts muted strong-sm">4 pts</span>
              <input class="input c-pronote" value="${c.pronote || ''}" data-input="pronote" data-id="${c.id}" placeholder="—">
              <button type="button" class="icon-btn c-del" data-click="openPicker" data-id="${c.id}" aria-label="Choisir ce critère dans le programme" title="Choisir dans le programme">${icon.book}</button>
              <button type="button" class="icon-btn c-del" data-click="delCrit" data-id="${c.id}" aria-label="Supprimer le critère">${icon.trash}</button>
            </div>`)}
            <div class="add-rows">
              <button type="button" class="add-row" data-click="addCrit">${icon.plusBig}Ajouter un critère</button>
              <button type="button" class="add-row accent" data-click="openPicker">${icon.book}Choisir dans le programme</button>
            </div>
          </div>
          <div class="crit-foot"><strong>${n} critère${n > 1 ? 's' : ''} × 4 pts = ${n * 4} pts</strong><span class="muted">ramené sur 20</span></div>
        </section>
      </main>
      ${picker ? pickerView() : ''}
    </div>`;
  },

  leave() { draft = null; picker = null; matOpen = false; retour = null; },

  actions: {
    openPicker(el) {
      const target = el.dataset.id || null;
      picker = { target, level: defaultLevel(), open: new Set(), sel: new Map() };
      // Critère déjà choisi dans le programme : on ouvre directement sa compétence.
      const c = target && crit(target);
      const comp = c && COMPETENCES.find(x => x.label === c.pronote);
      if (comp) picker.open.add(comp.n);
      refresh();
    },
    closePicker() { picker = null; refresh(); },
    progLevel(el) { picker.level = el.dataset.k; refresh(); },
    progToggle(el) {
      const n = +el.dataset.n;
      if (picker.open.has(n)) picker.open.delete(n); else picker.open.add(n);
      refresh();
    },
    progPick(el) {
      const { key, label, pronote } = el.dataset;
      // L'intitulé du critère n'est jamais modifié : seule la compétence Pronote est remplie.
      // Le repère choisi sert seulement d'exemple (texte grisé) tant que l'intitulé est vide.
      if (picker.target) {
        const c = crit(picker.target);
        c.pronote = pronote; c.hint = label;
        picker = null;
        refresh();
        focusLabel(c.id);
        toast({ text: `Compétence Pronote du critère ${c.code} choisie dans le programme` });
        return;
      }
      if (picker.sel.has(key)) picker.sel.delete(key); else picker.sel.set(key, { label, pronote });
      refresh();
    },
    progAdd() {
      const chosen = [...picker.sel.values()];
      let first = null;
      // Les critères encore vides (ex. le C1 d'un nouveau projet) sont remplis en premier.
      for (const x of chosen) {
        let c = draft.criteria.find(k => !k.label.trim() && !(k.pronote || '').trim());
        if (!c) { c = { id: db.uid(), code: nextCode(), label: '', pronote: '' }; draft.criteria.push(c); }
        c.pronote = x.pronote; c.hint = x.label;
        first = first || c;
      }
      picker = null;
      if (first) setTimeout(() => focusLabel(first.id));
      refresh();
      toast({ text: (chosen.length > 1 ? `${chosen.length} critères ajoutés` : 'Critère ajouté') + ' : écrivez votre intitulé' });
    },

    title(el) { draft.title = el.value; },
    desc(el) { draft.desc = el.value; },
    materiel(el) { draft.materiel[el.dataset.n] = el.value; },
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
      const untitled = criteria.find(c => !c.label && c.pronote);
      if (untitled) { toast({ text: `Donnez un intitulé au critère ${untitled.code}` }); focusLabel(untitled.id); return; }
      const isNew = !draft.id;
      const materiel = {};
      for (const [n, t] of Object.entries(draft.materiel)) { const list = prepa.depuisTexte(t); if (list.length && +n <= draft.nSeances) materiel[n] = list; }
      const rec = { title, desc: draft.desc.trim(), nSeances: draft.nSeances, criteria, materiel: Object.keys(materiel).length ? materiel : undefined };
      if (!isNew) rec.id = draft.id;
      const undo = db.commit(w => w.put('projects', rec));
      draft = null;
      go(retour || '#/admin');
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
