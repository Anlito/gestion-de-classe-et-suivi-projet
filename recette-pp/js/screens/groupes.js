// Onglet Groupes : composition des groupes d'un projet, sans glisser-déposer.
// 1) toucher un ou plusieurs élèves pour les sélectionner ; 2) toucher le groupe de destination.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, hideToast, openMenu, fmtDay } from '../ui.js';
import { icon, backLink, tabBar, photo, projectSwitch } from '../components.js';
import { go, refresh } from '../nav.js';

const STATUSES = ['cours', 'avenir'];
let sel = { aid: null, ids: [] };

function tile(s) {
  const on = sel.ids.includes(s.id);
  return html`<button type="button" class="member${on ? ' on' : ''}" data-click="toggle" data-sid="${s.id}">
    ${photo(s, { cls: 'mini', label: false })}
    <span class="member-name">${on ? '✓ ' : ''}${s.prenom || s.nom}</span>
  </button>`;
}

export default {
  render({ classId }) {
    const c = db.get('classes', classId);
    if (!c) { go('#/', { replace: true }); return null; }
    const list = model.selectableAssignments(classId, STATUSES);
    const a = model.chosenAssignment(classId, STATUSES);
    const p = a && db.get('projects', a.projectId);
    if (sel.aid !== (a && a.id)) sel = { aid: a && a.id, ids: [] };

    const head = html`<header class="topbar">
      ${backLink('#/', 'Accueil')}
      <div class="heading"><span class="title">${c.name}</span>
        <span class="sub">${p ? 'Groupes du projet ' + p.title : 'Groupes'}</span></div>
      <div class="spacer"></div>
      ${projectSwitch(list, a)}
    </header>`;
    if (!a) {
      return html`<div class="screen">${head}
        <main class="content center-msg"><div class="soon"><div class="soon-title">Aucun projet en cours</div>
          <p>Les groupes se composent pour un projet en cours ou à venir. Associez un projet à la ${c.name} depuis sa fiche.</p>
          <p><a class="btn accent" href="#/admin/classe/${c.id}">Ouvrir la fiche de la classe</a></p></div></main>
        ${tabBar(classId, 'groupes')}</div>`;
    }

    const students = model.studentsOf(classId);
    const groups = model.groupsOf(a.id);
    const inGroup = new Set(groups.flatMap(g => g.members));
    const unassigned = students.filter(s => !inGroup.has(s.id));
    const has = sel.ids.length > 0;
    const changes = model.groupChangesOf(a.id);
    const byId = id => db.get('students', id);

    return html`<div class="screen">
      ${head}
      <main class="content groupes">
        <section class="groups-grid" data-scroll="groups">
          ${groups.map(g => {
            const members = g.members.map(byId).filter(Boolean);
            return html`<div class="group-card${has ? ' target' : ''}" data-click="drop" data-gid="${g.id}">
              <div class="group-head">
                <span class="group-code">${g.code}</span>
                <span class="muted small">${members.length} élève${members.length > 1 ? 's' : ''}</span>
                <span class="spacer"></span>
                ${has ? html`<span class="place-here">Placer ici</span>`
                  : !members.length && !Object.keys(g.levels || {}).length
                    ? html`<button type="button" class="icon-btn small-x" data-click="delGroup" data-gid="${g.id}" aria-label="Supprimer le groupe vide">✕</button>` : ''}
              </div>
              <div class="members">${members.map(tile)}</div>
            </div>`;
          })}
          <button type="button" class="new-group" data-click="newGroup">${icon.plusBig}${has ? `Nouveau groupe ${model.nextGroupCode(a.id)} avec la sélection` : 'Nouveau groupe'}</button>
        </section>

        <aside class="groups-side">
          <section class="side-card${unassigned.length ? ' warn' : ''}">
            <div class="side-head"><span class="side-title">Sans groupe</span>
              <span class="muted">${unassigned.length ? unassigned.length + ' élève' + (unassigned.length > 1 ? 's' : '') : ''}</span></div>
            ${unassigned.length
              ? html`<div class="members unassigned" data-scroll="unassigned">${unassigned.map(tile)}</div>`
              : html`<div class="muted">Tous les élèves ont un groupe pour ce projet.</div>`}
          </section>
          <section class="side-card history-card">
            <div class="side-head"><span class="side-title">Changements de groupe</span></div>
            <div class="changes" data-scroll="changes">
              ${changes.map(ch => {
                const s = byId(ch.studentId);
                const who = s ? s.prenom : 'Élève retiré';
                const text = ch.from && ch.to ? `${who} : ${ch.from} → ${ch.to}` : ch.to ? `${who} : ajouté à ${ch.to}` : `${who} : retiré de ${ch.from}`;
                return html`<div class="change"><span class="change-text">${text}</span>
                  <span class="muted xsmall">${fmtDay(ch.at)}${ch.seanceN ? ' · séance ' + ch.seanceN : ''}</span></div>`;
              })}
              ${changes.length ? '' : html`<div class="muted">Aucun changement pour l'instant.</div>`}
            </div>
          </section>
        </aside>
      </main>
      ${has ? html`<div class="sel-bar">
        <span class="sel-text"><strong>${sel.ids.length} sélectionné${sel.ids.length > 1 ? 's' : ''}</strong> · touchez un groupe pour y placer</span>
        ${sel.ids.some(id => inGroup.has(id)) ? html`<button type="button" class="toast-btn" data-click="removeSel">Retirer du groupe</button>` : ''}
        <button type="button" class="toast-btn" data-click="clearSel">Désélectionner</button>
      </div>` : ''}
      ${tabBar(classId, 'groupes')}
    </div>`;
  },

  leave() { sel = { aid: null, ids: [] }; },

  actions: {
    pickAssign(el, e, { classId }) { model.chooseAssignment(classId, el.dataset.id); refresh(); },
    pickAssignMenu(el, e, { classId }) {
      const cur = model.chosenAssignment(classId, STATUSES);
      openMenu({
        anchor: el, width: 360, align: 'right',
        items: model.selectableAssignments(classId, STATUSES).map(a => ({
          label: db.get('projects', a.projectId).title, sub: model.STATUS[a.status], selected: cur && a.id === cur.id,
          onPick: () => { model.chooseAssignment(classId, a.id); refresh(); },
        })),
      });
    },
    toggle(el) {
      hideToast();
      const id = el.dataset.sid;
      sel.ids = sel.ids.includes(id) ? sel.ids.filter(x => x !== id) : [...sel.ids, id];
      refresh();
    },
    clearSel() { sel.ids = []; refresh(); },
    drop(el, e, { classId }) {
      if (!sel.ids.length) return;
      move(classId, el.dataset.gid);
    },
    removeSel(el, e, { classId }) { move(classId, null); },
    newGroup(el, e, { classId }) {
      const a = model.chosenAssignment(classId, STATUSES);
      if (!sel.ids.length) {
        const { undo, created } = model.moveStudents(a, [], null, true);
        refresh();
        toast({ text: `Groupe ${created.code} créé`, undo: async () => { await undo(); refresh(); } });
        return;
      }
      move(classId, null, true);
    },
    delGroup(el) {
      const g = db.get('groups', el.dataset.gid);
      const undo = model.deleteGroup(g.id);
      refresh();
      toast({ text: `Groupe ${g.code} supprimé`, undo: async () => { await undo(); refresh(); } });
    },
  },
};

function move(classId, targetId, createNew = false) {
  const a = model.chosenAssignment(classId, STATUSES);
  const ids = sel.ids;
  const { undo, created } = model.moveStudents(a, ids, targetId, createNew);
  const target = created || (targetId && db.get('groups', targetId));
  sel.ids = [];
  refresh();
  const n = ids.length;
  toast({
    text: target ? `${n} élève${n > 1 ? 's' : ''} placé${n > 1 ? 's' : ''} dans ${target.code}` : `${n > 1 ? n + ' élèves retirés' : 'Retiré'} du groupe`,
    undo: async () => { await undo(); refresh(); return 'Changement annulé'; },
  });
}
