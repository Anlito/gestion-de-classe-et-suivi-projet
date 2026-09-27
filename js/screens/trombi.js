// Trombinoscope : l'écran le plus utilisé. Un tap = une observation ; appui long = choix d'un motif.
// Mode « Appel » : toucher les élèves absents. « Tirage » : tirage au sort parmi les présents pas encore interrogés.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, openMenu, buzz, todayISO, fmtDayLong } from '../ui.js';
import { icon, backLink, saveStatus, tabBar, photo } from '../components.js';
import { go, refresh } from '../nav.js';

const LONG_PRESS_MS = 450;
const COLOR = { neg: 'var(--neg)', pos: 'var(--pos)' };

let appel = null;   // classId en mode appel
let draw = null;    // { classId, sid, spinning, restarted }

// ---------- Élèves déjà interrogés pendant ce cours (mémorisés sur l'appareil) ----------
// Remis à zéro à chaque nouvelle séance (ou chaque jour s'il n'y a pas de séance du jour).
function drawnGet(classId) {
  const key = model.currentSession(classId).key;
  try { const o = JSON.parse(localStorage.getItem('carnet-tirage-' + classId) || 'null'); if (o && o.session === key) return o.ids; } catch (e) { /* rien */ }
  return [];
}
function drawnSet(classId, ids) {
  try { localStorage.setItem('carnet-tirage-' + classId, JSON.stringify({ session: model.currentSession(classId).key, ids })); } catch (e) { /* rien */ }
}
function sessionTitle(classId) {
  const s = model.currentSession(classId);
  return s.kind === 'seance' ? 'Appel · ' + s.label : 'Appel du ' + fmtDayLong(todayISO());
}

function card(s, c, absent, inAppel) {
  if (inAppel) {
    return html`<button type="button" class="card appel${absent ? ' absent' : ''}" data-click="toggleAbs" data-sid="${s.id}" aria-pressed="${absent ? 'true' : 'false'}">
      <span class="card-photo">${photo(s)}</span>
      <span class="card-body">
        <span class="card-name"><span class="prenom">${s.prenom || '—'}</span><span class="nom">${s.nom}</span></span>
        <span class="appel-state">${absent ? 'Absent' : 'Présent'}</span>
      </span>
    </button>`;
  }
  return html`<div class="card${absent ? ' absent' : ''}" data-sid="${s.id}">
    <button type="button" class="card-photo" data-click="detail" data-sid="${s.id}" aria-label="Détail de ${model.fullName(s)}">
      ${photo(s, { badge: true })}
      ${absent ? html`<span class="abs-chip">Absent</span>` : ''}
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

// ---------- Tirage au sort ----------
function drawPool(classId) {
  const absent = model.absentNow(classId);
  const present = model.studentsOf(classId).filter(s => !absent.has(s.id));
  const done = new Set(drawnGet(classId));
  return { present, absent, done, pool: present.filter(s => !done.has(s.id)) };
}

function drawView(classId) {
  const { present, absent, done } = drawPool(classId);
  const s = draw.sid ? db.get('students', draw.sid) : null;
  const asked = present.filter(x => done.has(x.id)).length;
  const left = present.length - asked;
  return html`<div class="scrim dim" data-click="closeDraw"></div>
    <div class="draw-box" role="dialog" aria-modal="true">
      <div class="draw-title">${icon.dice} Tirage au sort</div>
      <div class="draw-card${draw.spinning ? ' spinning' : ''}">
        <span class="draw-photo">${s ? photo(s, { cls: 'huge' }) : ''}</span>
        <div class="draw-name">${s ? html`${s.prenom} <span class="upper">${s.nom}</span>` : '…'}</div>
      </div>
      ${draw.restarted ? html`<div class="draw-note">Tout le monde est passé : nouveau tour.</div>` : ''}
      <div class="draw-stats">${asked} interrogé${asked > 1 ? 's' : ''} pendant ce cours · ${left} restant${left > 1 ? 's' : ''}${absent.size ? ` · ${absent.size} absent${absent.size > 1 ? 's' : ''} exclu${absent.size > 1 ? 's' : ''}` : ''}</div>
      ${s && !draw.spinning ? html`<div class="draw-obs">
          <button type="button" class="obs neg" data-click="drawObs" data-type="neg">${icon.minus}Comportement</button>
          <button type="button" class="obs pos" data-click="drawObs" data-type="pos">${icon.plus}Participation</button>
        </div>` : ''}
      <div class="draw-actions">
        <button type="button" class="btn soft" data-click="closeDraw">Fermer</button>
        <button type="button" class="btn accent big" data-click="draw" ${draw.spinning ? 'disabled' : ''}>${icon.dice}Nouveau tirage</button>
      </div>
      <button type="button" class="link-btn" data-click="resetDraw">Recommencer à zéro (oublier les élèves déjà interrogés)</button>
    </div>`;
}

function startDraw(classId) {
  let { present, pool } = drawPool(classId);
  if (!present.length) { toast({ text: 'Aucun élève présent pour le tirage' }); return; }
  let restarted = false;
  if (!pool.length) { drawnSet(classId, []); pool = present; restarted = true; }
  const winner = pool[Math.floor(Math.random() * pool.length)];
  draw = { classId, sid: pool[0].id, spinning: true, restarted };
  refresh();
  // Défilement des visages pendant ~1 s, puis arrêt sur l'élève tiré.
  const box = () => document.querySelector('.draw-card');
  let i = 0;
  const tick = setInterval(() => {
    const b = box();
    if (!b || !draw) { clearInterval(tick); return; }
    const s = present[Math.floor(Math.random() * present.length)];
    b.querySelector('.draw-photo').innerHTML = photo(s, { cls: 'huge' }).s;
    b.querySelector('.draw-name').textContent = s.prenom + ' ' + s.nom;
    if (++i >= 12) {
      clearInterval(tick);
      drawnSet(classId, [...drawnGet(classId), winner.id]);
      draw = { classId, sid: winner.id, spinning: false, restarted };
      buzz(40);
      refresh();
    }
  }, 80);
}

export default {
  render({ classId }) {
    const c = db.get('classes', classId);
    if (!c) { go('#/', { replace: true }); return null; }
    if (appel && appel !== classId) appel = null;
    if (draw && draw.classId !== classId) draw = null;
    const inAppel = appel === classId;
    const students = model.studentsOf(classId);
    const counts = model.countsByStudent(classId);
    const absent = model.absentNow(classId);
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/', 'Classes')}
        <div class="heading"><span class="title">${c.name}</span>
          <span class="sub">${students.length} élèves${absent.size ? ` · ${absent.size} absent${absent.size > 1 ? 's' : ''}` : ''} · Trimestre ${model.trimester()}</span></div>
        <div class="spacer"></div>
        ${inAppel ? '' : html`
          <button type="button" class="btn soft" data-click="startAppel">${icon.roll}<span class="hide-phone">Appel</span></button>
          <button type="button" class="btn soft" data-click="draw">${icon.dice}<span class="hide-phone">Tirage</span></button>
          <div class="legend hide-narrow">
            <span><i class="sw neg"></i>Comportement</span>
            <span><i class="sw pos"></i>Aide / soutien / rangement</span>
          </div>
          <div class="vsep hide-narrow"></div>
          ${saveStatus()}`}
      </header>
      <main class="content trombi${inAppel ? ' appel-mode' : ''}" data-scroll="trombi">
        ${students.length
          ? html`<div class="trombi-grid">${students.map(s => card(s, counts.get(s.id) || { neg: 0, pos: 0 }, absent.has(s.id), inAppel))}</div>`
          : html`<div class="empty-block">Aucun élève dans cette classe. Ajoutez-les depuis Administration.</div>`}
      </main>
      ${inAppel ? html`<div class="sel-bar appel-bar">
        <span class="sel-text"><strong>${sessionTitle(classId)}</strong> · touchez les absents · ${absent.size} absent${absent.size > 1 ? 's' : ''} / ${students.length}
          ${model.currentSession(classId).kind === 'day' && model.activeAssignments(classId).length
            ? html`<br><span class="appel-hint">Pas encore de séance aujourd’hui : créez-la dans l’onglet Projet pour un appel par séance.</span>` : ''}</span>
        <button type="button" class="toast-btn accent" data-click="endAppel">Terminer l’appel</button>
      </div>` : ''}
      ${draw ? drawView(classId) : ''}
      ${tabBar(classId, 'trombi')}
    </div>`;
  },

  leave() { appel = null; draw = null; },

  mount(root) {
    const grid = root.querySelector('.trombi-grid');
    if (!grid || appel) return;
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

    startAppel(el, e, { classId }) { appel = classId; refresh(); },
    endAppel(el, e, { classId }) {
      const n = model.absentNow(classId).size;
      appel = null;
      refresh();
      toast({ text: n ? `Appel enregistré : ${n} absent${n > 1 ? 's' : ''}` : 'Appel enregistré : tout le monde est présent' });
    },
    toggleAbs(el) {
      const s = db.get('students', el.dataset.sid);
      if (!s) return;
      model.toggleAbsent(s);
      buzz(18);
      refresh();
    },

    draw(el, e, { classId }) { if (!draw || !draw.spinning) startDraw(classId); },
    closeDraw() { draw = null; refresh(); },
    resetDraw(el, e, { classId }) {
      drawnSet(classId, []);
      if (draw) draw.restarted = false;
      refresh();
      toast({ text: 'Liste des élèves interrogés remise à zéro' });
    },
    drawObs(el) {
      const s = draw && db.get('students', draw.sid);
      if (!s) return;
      const type = el.dataset.type;
      const motif = type === 'pos' ? 'Participation' : '';
      const undo = model.addObservation(s, type, motif);
      buzz(18);
      refresh();
      toast({ who: model.shortName(s), text: model.LABEL[type] + (motif ? ' — ' + motif : ''), color: COLOR[type],
        undo: async () => { await undo(); refresh(); return { who: model.shortName(s), text: 'saisie annulée' }; } });
    },
  },
};
