// Trombinoscope : l'écran le plus utilisé. Un tap = une observation ; appui long = choix d'un motif.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, openMenu, buzz } from '../ui.js';
import { icon, backLink, saveStatus, tabBar, photo } from '../components.js';
import { go } from '../nav.js';

const LONG_PRESS_MS = 450;
const COLOR = { neg: 'var(--neg)', pos: 'var(--pos)' };

function card(s, c) {
  return html`<div class="card" data-sid="${s.id}">
    <button type="button" class="card-photo" data-click="detail" data-sid="${s.id}" aria-label="Détail de ${model.fullName(s)}">
      ${photo(s, { badge: true })}
    </button>
    <div class="card-body">
      <div class="card-name" data-click="detail" data-sid="${s.id}">
        <div class="prenom">${s.prenom || '—'}</div>
        <div class="nom">${s.nom}</div>
      </div>
      <div class="obs-btns">
        <button type="button" class="obs neg" data-obs="neg" data-sid="${s.id}" aria-label="Comportement">
          ${icon.minus}<span class="n" data-count="${s.id}:neg">${c.neg}</span></button>
        <button type="button" class="obs pos" data-obs="pos" data-sid="${s.id}" aria-label="Aide / soutien / rangement">
          ${icon.plus}<span class="n" data-count="${s.id}:pos">${c.pos}</span></button>
      </div>
    </div>
  </div>`;
}

function updateCount(root, sid) {
  const st = db.get('students', sid);
  if (!st) return;
  const c = model.countsOf(sid, model.trimester());
  for (const type of ['neg', 'pos']) {
    const el = root.querySelector(`[data-count="${sid}:${type}"]`);
    if (el) el.textContent = c[type];
  }
}

function flash(btn) {
  btn.classList.add('flash');
  setTimeout(() => btn.classList.remove('flash'), 380);
}

function add(root, btn, motif = '') {
  const sid = btn.dataset.sid, type = btn.dataset.obs;
  const st = db.get('students', sid);
  if (!st) return;
  const undo = model.addObservation(st, type, motif);
  buzz(18);
  flash(btn);
  updateCount(root, sid);
  toast({
    who: model.shortName(st),
    text: model.LABEL[type] + (motif ? ' — ' + motif : ''),
    color: COLOR[type],
    undo: async () => { await undo(); updateCount(document, sid); return { who: model.shortName(st), text: 'saisie annulée' }; },
  });
}

export default {
  render({ classId }) {
    const c = db.get('classes', classId);
    if (!c) { go('#/', { replace: true }); return null; }
    const students = model.studentsOf(classId);
    const counts = model.countsByStudent(classId);
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/', 'Classes')}
        <div class="heading"><span class="title">${c.name}</span>
          <span class="sub">${students.length} élèves · Trimestre ${model.trimester()}</span></div>
        <div class="spacer"></div>
        <div class="legend hide-narrow">
          <span><i class="sw neg"></i>Comportement</span>
          <span><i class="sw pos"></i>Aide / soutien / rangement</span>
        </div>
        <div class="vsep hide-narrow"></div>
        ${saveStatus()}
      </header>
      <main class="content trombi" data-scroll="trombi">
        ${students.length
          ? html`<div class="trombi-grid">${students.map(s => card(s, counts.get(s.id) || { neg: 0, pos: 0 }))}</div>`
          : html`<div class="empty-block">Aucun élève dans cette classe. Ajoutez-les depuis Administration.</div>`}
      </main>
      ${tabBar(classId, 'trombi')}
    </div>`;
  },

  mount(root) {
    const grid = root.querySelector('.trombi-grid');
    if (!grid) return;
    let press = null;
    const cancel = () => { if (press) { clearTimeout(press.timer); press = null; } };

    grid.addEventListener('pointerdown', e => {
      const btn = e.target.closest('[data-obs]');
      if (!btn || (e.pointerType === 'mouse' && e.button !== 0)) return;
      cancel();
      const p = { btn, long: false, x: e.clientX, y: e.clientY };
      p.timer = setTimeout(() => {
        p.long = true;
        buzz(30);
        const st = db.get('students', btn.dataset.sid);
        const type = btn.dataset.obs;
        openMenu({
          anchor: btn, width: 280, color: COLOR[type],
          title: model.LABEL[type] + ' · ' + (st ? st.prenom : ''),
          items: model.MOTIFS[type].map(label => ({ label, onPick: () => add(root, btn, label) })),
        });
      }, LONG_PRESS_MS);
      press = p;
    });
    grid.addEventListener('pointermove', e => {
      if (press && !press.long && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14) cancel();
    });
    grid.addEventListener('pointerup', e => {
      const p = press;
      press = null;
      if (!p) return;
      clearTimeout(p.timer);
      if (p.long) return;
      const btn = e.target.closest('[data-obs]');
      if (btn === p.btn) add(root, btn);
    });
    grid.addEventListener('pointercancel', cancel);
    grid.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') cancel(); });
    grid.addEventListener('contextmenu', e => e.preventDefault());
  },

  actions: {
    detail(el, e, { classId }) { go(`#/classe/${classId}/eleve/${el.dataset.sid}`); },
  },
};
