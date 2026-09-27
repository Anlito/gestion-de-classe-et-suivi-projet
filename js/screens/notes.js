// Onglet Notes : tableau d'évaluation par niveaux (1 à 4), note /20, mention, ajustements individuels.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, openMenu } from '../ui.js';
import { icon, backLink, tabBar, projectSwitch } from '../components.js';
import { go, refresh } from '../nav.js';

const STATUSES = ['cours', 'avenir', 'fini'];
let drawer = null; // { aid, gid, sid } : panneau « Ajustement individuel » ouvert
const pending = new Map(); // saisies de texte en attente d'enregistrement
let timer = null;

function flush() {
  clearTimeout(timer);
  for (const fn of pending.values()) fn();
  pending.clear();
}
function later(key, fn) { pending.set(key, fn); clearTimeout(timer); timer = setTimeout(flush, 600); }
addEventListener('pagehide', flush);

const lvl = v => model.LEVELS[v - 1];
function cell(v, gid, cid, readOnly) {
  if (v == null) return html`<button type="button" class="lvl-cell empty" data-click="cell" data-gid="${gid}" data-cid="${cid}" ${readOnly ? 'disabled' : ''}>+</button>`;
  const l = lvl(v);
  return html`<button type="button" class="lvl-cell" style="background:${l.bg};color:${l.fg}" data-click="cell" data-gid="${gid}" data-cid="${cid}" aria-label="${l.name}">${v}</button>`;
}

function drawerView(a, p) {
  const g = db.get('groups', drawer.gid);
  if (!g) { drawer = null; return ''; }
  const members = g.members.map(id => db.get('students', id)).filter(Boolean);
  if (!members.some(s => s.id === drawer.sid)) drawer.sid = members[0] ? members[0].id : null;
  const s = db.get('students', drawer.sid);
  const crit = p.criteria;
  const e = s ? model.evalOf(a.id, s.id) : null;
  const ind = s ? model.computeNote(model.studentLevels(a.id, s.id), crit) : { n: null };
  const grp = model.computeNote(g.levels, crit);
  const adjusted = !!(e && e.adj && Object.keys(e.adj).length);
  return html`<div class="scrim dim" data-click="closeDrawer"></div>
    <aside class="drawer">
      <div class="drawer-head"><span class="drawer-title grow">${g.code} · Ajustement individuel</span>
        <button type="button" class="btn accent" data-click="closeDrawer">Terminé</button></div>
      <div class="drawer-body" data-scroll="drawer">
        <div class="chips-row">${members.map(m => html`<button type="button" class="pill${m.id === drawer.sid ? ' on' : ''}" data-click="drawerStudent" data-sid="${m.id}">
          ${m.prenom}${model.hasAdjustment(a.id, m.id) ? ' ✎' : ''}</button>`)}</div>
        ${s ? html`
        <div class="note-box"><span class="grow">Note de <strong>${s.prenom}</strong></span>
          <span class="note-big">${model.f1(ind.n)}</span><span class="muted small">groupe : ${model.f1(grp.n)}</span></div>
        <div class="adj-list">${crit.map(c => {
          const base = model.baseLevel(a.id, s.id, c.id);
          const own = e && e.adj ? e.adj[c.id] : undefined;
          const eff = own != null ? own : base.v;
          return html`<div class="adj-row">
            <div class="grow"><div class="strong-15">${c.code} · ${c.label}</div>
              <div class="muted xsmall">${base.carried ? 'Acquis dans son ancien groupe' : 'Groupe'} : ${base.v == null ? 'non évalué' : lvl(base.v).name}</div></div>
            <div class="adj-btns">${model.LEVELS.map(l => html`<button type="button" class="adj-btn${eff === l.v ? ' on' : ''}${eff != null && eff !== l.v ? ' dim' : ''}"
              style="background:${l.bg};color:${l.fg}" data-click="adjLevel" data-cid="${c.id}" data-v="${l.v}" aria-label="${l.name}">${eff === l.v ? '✓' : ''}${l.v}</button>`)}</div>
            <div class="adj-reset">${own != null ? html`<button type="button" class="link-btn" data-click="adjReset" data-cid="${c.id}">= groupe</button>` : ''}</div>
          </div>`;
        })}</div>
        <div class="stack">
          <div class="strong-15">Motif</div>
          <div class="chips-row">${model.ADJ_MOTIFS.map(m => html`<button type="button" class="pill${adjusted && e.motif === m ? ' on' : ''}" data-click="motif" data-k="${m}" ${adjusted ? '' : 'disabled'}>${m}</button>`)}</div>
          <input class="input" data-input="precision" value="${e ? e.precision || '' : ''}" placeholder="Précision (facultatif)" ${adjusted ? '' : 'disabled'}>
          ${adjusted ? '' : html`<div class="muted small">Choisissez un niveau différent de celui du groupe pour créer un ajustement.</div>`}
        </div>` : html`<div class="muted">Ce groupe n’a pas d’élève.</div>`}
      </div>
    </aside>`;
}

export default {
  render({ classId }) {
    const c = db.get('classes', classId);
    if (!c) { go('#/', { replace: true }); return null; }
    const list = model.selectableAssignments(classId, STATUSES);
    const a = model.chosenAssignment(classId, STATUSES);
    const p = a && db.get('projects', a.projectId);
    if (drawer && (!a || drawer.aid !== a.id)) drawer = null;
    const crit = p ? p.criteria : [];

    const head = html`<header class="topbar">
      ${backLink('#/', 'Classes')}
      <div class="heading"><span class="title">${c.name}</span>
        <span class="sub">${p ? `${p.title} · ${crit.length} critère${crit.length > 1 ? 's' : ''} de 1 à 4 pts · note /20 = moyenne × 5` : 'Notes'}</span></div>
      <div class="spacer"></div>
      ${projectSwitch(list, a)}
    </header>`;
    if (!a) {
      return html`<div class="screen">${head}
        <main class="content center-msg"><div class="soon"><div class="soon-title">Aucun projet</div>
          <p>Associez un projet à la ${c.name} depuis sa fiche, puis composez les groupes.</p>
          <p><a class="btn accent" href="#/admin/classe/${c.id}">Ouvrir la fiche de la classe</a></p></div></main>
        ${tabBar(classId, 'notes')}</div>`;
    }

    const groups = model.groupsOf(a.id);
    const res = model.results(a);
    // Moyenne par critère : sur les élèves des groupes, ajustements compris.
    const evaluated = model.studentsOf(classId).filter(s => model.groupOfStudent(a.id, s.id) || model.evalOf(a.id, s.id));
    const levelsBy = evaluated.map(s => model.studentLevels(a.id, s.id));
    const critAvg = crit.map(cr => { const vs = levelsBy.map(l => l[cr.id]).filter(v => v != null); return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : null; });

    return html`<div class="screen">
      ${head}
      <main class="content notes">
        <div class="notes-bar">
          <span class="notes-title">Évaluation des groupes</span>
          ${a.status === 'fini' ? html`<span class="chip pos">Projet terminé</span>` : ''}
          <span class="spacer"></span>
          <div class="legend-lvls">${model.LEVELS.map(l => html`<span class="legend-lvl"><span class="lvl-dot" style="background:${l.bg};color:${l.fg}">${l.v}</span>${l.pronote}</span>`)}</div>
        </div>
        ${groups.length ? html`<div class="grade-table">
          <div class="gt-row gt-head">
            <div class="gt-group">Groupe</div>
            ${crit.map(cr => html`<div class="gt-crit"><span class="gt-code">${cr.code}</span><span class="gt-label">${cr.label}</span></div>`)}
            <div class="gt-note">/20</div><div class="gt-mention">Mention</div><div class="gt-comment">Commentaire</div>
          </div>
          <div class="gt-body" data-scroll="grades">
            ${groups.map(g => {
              const r = model.computeNote(g.levels, crit);
              const members = g.members.map(id => db.get('students', id)).filter(Boolean);
              const adj = members.filter(s => model.hasAdjustment(a.id, s.id))
                .map(s => s.prenom + ' : ' + model.f1(model.computeNote(model.studentLevels(a.id, s.id), crit).n));
              return html`<div class="gt-row">
                <button type="button" class="gt-group gt-gbtn" data-click="openDrawer" data-gid="${g.id}">
                  <span class="grow gt-gtext"><span class="gt-gcode">${g.code}</span>
                    <span class="muted xsmall ellipsis">${members.map(s => s.prenom).join(', ') || 'Aucun élève'}</span>
                    ${adj.length ? html`<span class="gt-adj">${icon.edit}${adj.join(' · ')}</span>` : ''}</span>
                  ${icon.chevron}
                </button>
                ${crit.map(cr => html`<div class="gt-crit">${cell(g.levels[cr.id], g.id, cr.id)}</div>`)}
                <div class="gt-note"><span class="note-val${r.complete ? '' : ' muted'}">${model.f1(r.n)}</span>
                  ${r.n != null && !r.complete ? html`<span class="muted xsmall">provisoire ${r.filled}/${r.total}</span>` : ''}</div>
                <div class="gt-mention">${r.complete ? model.mention(r.n) : '—'}</div>
                <div class="gt-comment"><input class="input comment-in" value="${g.comment || ''}" data-input="comment" data-gid="${g.id}" placeholder="Ajouter…"></div>
              </div>`;
            })}
          </div>
          <div class="gt-row gt-avg">
            <div class="gt-group gt-avgtitle"><strong>Moyenne de la classe</strong><span class="muted xsmall">${res.nComplete} élève${res.nComplete > 1 ? 's' : ''} à note complète</span></div>
            ${critAvg.map(v => html`<div class="gt-crit muted strong-15">${v == null ? '—' : model.f1(v) + ' / 4'}</div>`)}
            <div class="gt-note"><span class="note-val">${model.f1(res.avg)}</span></div>
            <div class="gt-mention">${model.mention(res.avg)}</div>
            <div class="gt-comment"></div>
          </div>
        </div>`
        : html`<div class="soon center-self"><div class="soon-title">Pas encore de groupes</div>
            <p>Composez les groupes de ce projet dans l’onglet Groupes : les notes s’y rattachent.</p>
            <p><a class="btn accent" href="#/classe/${classId}/groupes">Composer les groupes</a></p></div>`}
      </main>
      ${drawer ? drawerView(a, p) : ''}
      ${tabBar(classId, 'notes')}
    </div>`;
  },

  leave() { flush(); drawer = null; },

  actions: {
    pickAssign(el, e, { classId }) { flush(); model.chooseAssignment(classId, el.dataset.id); refresh(); },
    pickAssignMenu(el, e, { classId }) {
      flush();
      const cur = model.chosenAssignment(classId, STATUSES);
      openMenu({
        anchor: el, width: 360, align: 'right',
        items: model.selectableAssignments(classId, STATUSES).map(a => ({
          label: db.get('projects', a.projectId).title, sub: model.STATUS[a.status], selected: cur && a.id === cur.id,
          onPick: () => { model.chooseAssignment(classId, a.id); refresh(); },
        })),
      });
    },

    cell(el, e, { classId }) {
      flush();
      const a = model.chosenAssignment(classId, STATUSES);
      const p = db.get('projects', a.projectId);
      const g = db.get('groups', el.dataset.gid);
      const cr = p.criteria.find(x => x.id === el.dataset.cid);
      const cur = g.levels[cr.id];
      const done = v => {
        const undo = model.setGroupLevel(g.id, cr.id, v);
        refresh();
        toast({ text: `${g.code} · ${cr.code} : ${v == null ? 'effacé' : lvl(v).name}`, undo: async () => { await undo(); refresh(); } });
      };
      openMenu({
        anchor: el, width: 340, title: `${g.code} · ${cr.code} · ${cr.label}`,
        items: [
          ...model.LEVELS.map(l => ({ label: l.name, sub: l.pronote, chip: { bg: l.bg, fg: l.fg, text: String(l.v) }, selected: cur === l.v, onPick: () => done(l.v) })),
          ...(cur != null ? [{ label: 'Effacer la valeur', quiet: true, onPick: () => done(null) }] : []),
        ],
      });
    },

    comment(el) {
      const gid = el.dataset.gid, v = el.value;
      later('c' + gid, () => model.setGroupComment(gid, v));
    },

    openDrawer(el, e, { classId }) {
      flush();
      const a = model.chosenAssignment(classId, STATUSES);
      const g = db.get('groups', el.dataset.gid);
      const first = g.members.find(id => model.hasAdjustment(a.id, id)) || g.members[0];
      drawer = { aid: a.id, gid: g.id, sid: first };
      refresh();
    },
    closeDrawer() { flush(); drawer = null; refresh(); },
    drawerStudent(el) { flush(); drawer.sid = el.dataset.sid; refresh(); },
    adjLevel(el) {
      flush();
      model.setAdjustment(drawer.aid, drawer.sid, el.dataset.cid, +el.dataset.v);
      refresh();
    },
    adjReset(el) { flush(); model.setAdjustment(drawer.aid, drawer.sid, el.dataset.cid, null); refresh(); },
    motif(el) { flush(); model.setAdjustmentInfo(drawer.aid, drawer.sid, { motif: el.dataset.k }); refresh(); },
    precision(el) {
      const { aid, sid } = drawer, v = el.value;
      later('p' + sid, () => model.setAdjustmentInfo(aid, sid, { precision: v }));
    },
  },
};
