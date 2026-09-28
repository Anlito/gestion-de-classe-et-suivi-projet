// Trombinoscope : l'écran le plus utilisé. Un tap = une observation ; appui long = choix d'un motif.
// Mode « Appel » : toucher les élèves absents. « Tirage » : tirage au sort parmi les présents pas encore interrogés.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, openMenu, buzz, todayISO, fmtDayLong, choiceDialog } from '../ui.js';
import { icon, backLink, saveStatus, tabBar, photo } from '../components.js';
import { go, refresh } from '../nav.js';

const LONG_PRESS_MS = 450;
const COLOR = { neg: 'var(--neg)', pos: 'var(--pos)' };

let appel = null;   // classId en mode appel
let draw = null;    // { classId, sid, spinning, restarted }

// ---------- Élèves déjà interrogés pendant ce cours (mémorisés sur l'appareil) ----------
// Remis à zéro à chaque nouvel appel (nouveau cours), ou chaque jour si aucun appel n'a été fait.
const sessionKey = classId => { const ap = model.currentAppel(classId); return ap ? 'A:' + ap.id : 'D:' + todayISO(); };
function drawnGet(classId) {
  const key = sessionKey(classId);
  try { const o = JSON.parse(localStorage.getItem('carnet-tirage-' + classId) || 'null'); if (o && o.session === key) return o.ids; } catch (e) { /* rien */ }
  return [];
}
function drawnSet(classId, ids) {
  try { localStorage.setItem('carnet-tirage-' + classId, JSON.stringify({ session: sessionKey(classId), ids })); } catch (e) { /* rien */ }
}
const sessionTitle = classId => model.appelTitle(model.currentAppel(classId));

// ---------- Démarrer un appel ----------
// Crée la séance du jour si besoin (projet en cours), ou propose de refaire / corriger un appel déjà fait.
async function newSeanceFor(classId) {
  const a = model.activeAssignments(classId)[0];
  const p = db.get('projects', a.projectId);
  if (model.seancesOf(a.id).length >= p.nSeances) {
    const ok = await choiceDialog({
      title: `Les ${p.nSeances} séances de « ${p.title} » sont faites`,
      text: 'Vous pouvez faire l’appel sans créer de séance, ou augmenter le nombre de séances dans le projet (Administration).',
      choices: [{ label: 'Faire l’appel sans séance', value: true, style: 'accent' }, { label: 'Annuler', value: false }],
    });
    return ok ? { ctx: null } : null;
  }
  const { seance } = model.newSeance(a);
  return { ctx: model.todaySeance(classId), seance };
}

async function startAppel(classId) {
  const ap = model.currentAppel(classId);
  const act = model.activeAssignments(classId)[0];
  const today = model.todaySeance(classId);
  const open = () => { appel = classId; refresh(); };

  // Une séance a été créée (onglet Projet) depuis le dernier appel : c'est un nouveau cours.
  if (ap && today && ap.seanceId !== today.seanceId) { model.createAppel(classId, today); open(); return; }

  if (!ap) {
    if (act && !today) {
      const p = db.get('projects', act.projectId);
      const n = model.seancesOf(act.id).length + 1;
      const go = await choiceDialog({
        title: `Commencer la séance ${n} ?`,
        text: `Pour faire l’appel, la séance du jour doit exister. Projet en cours : ${p.title}.`,
        choices: [{ label: `Commencer la séance ${n} et faire l’appel`, value: true, style: 'accent' }, { label: 'Annuler', value: false }],
      });
      if (!go) return;
      const r = await newSeanceFor(classId);
      if (!r) return;
      model.createAppel(classId, r.ctx);
      if (r.seance) toast({ text: `Séance ${r.seance.n} créée · ${fmtDayLong(r.seance.date)}` });
    } else {
      model.createAppel(classId, today);
    }
    open();
    return;
  }

  // Un appel existe déjà pour ce cours.
  const nAbs = model.absentNow(classId).size;
  const choice = await choiceDialog({
    title: 'Un appel a déjà été fait',
    text: `${model.appelTitle(ap)} · ${nAbs} absent${nAbs > 1 ? 's' : ''}. Refaire l’appel ?`,
    choices: [
      { label: 'Oui, je recommence : je me suis trompé', sub: 'L’appel qui vient d’être fait est effacé', value: 'redo', style: 'soft' },
      { label: 'Oui, c’est une autre séance dans la journée', sub: act ? 'Crée la séance suivante et un nouvel appel' : 'Nouvel appel pour ce nouveau cours', value: 'new', style: 'soft' },
      { label: 'Corriger cet appel', sub: 'Un élève arrivé en retard, un oubli…', value: 'edit', style: 'soft' },
      { label: 'Non', value: null, style: 'soft' },
    ],
  });
  if (choice === 'edit') { open(); return; }
  if (choice === 'redo') {
    const undo = model.resetAppel(ap);
    open();
    toast({ text: 'Appel remis à zéro', undo: async () => { await undo(); refresh(); } });
    return;
  }
  if (choice === 'new') {
    if (act) {
      const r = await newSeanceFor(classId);
      if (!r) return;
      model.createAppel(classId, r.ctx);
      if (r.seance) toast({ text: `Séance ${r.seance.n} créée · ${fmtDayLong(r.seance.date)}` });
    } else {
      model.createAppel(classId, null);
    }
    open();
  }
}

// Appel : un toucher fait passer l'élève de Présent à Absent, puis En retard, puis de nouveau Présent.
const PRESENCE = { present: 'Présent', absent: 'Absent', retard: 'Retard' };
const NEXT_PRESENCE = { present: 'absent', absent: 'retard', retard: 'present' };

function card(s, c, state, inAppel) {
  const absent = state === 'absent', late = state === 'retard';
  if (inAppel) {
    return html`<button type="button" class="card appel ${state}" data-click="toggleAbs" data-sid="${s.id}" aria-label="${model.fullName(s)} : ${PRESENCE[state]}">
      <span class="card-photo">${photo(s)}</span>
      <span class="card-body">
        <span class="card-name"><span class="prenom">${s.prenom || '—'}</span><span class="nom">${s.nom}</span></span>
        <span class="appel-state">${PRESENCE[state]}</span>
      </span>
    </button>`;
  }
  const besoins = model.besoinsOf(s);
  return html`<div class="card${absent ? ' absent' : ''}" data-sid="${s.id}">
    <button type="button" class="card-photo" data-click="detail" data-sid="${s.id}" aria-label="Détail de ${model.fullName(s)}">
      ${photo(s, { badge: true })}
      ${absent ? html`<span class="abs-chip">Absent</span>` : late ? html`<span class="abs-chip late">Retard</span>` : ''}
    </button>
    <div class="card-body">
      <div class="card-name" data-click="detail" data-sid="${s.id}">
        <div class="prenom">${s.prenom || '—'}</div>
        <div class="nom">${s.nom}</div>
        ${besoins.length ? html`<div class="besoin-tags">${besoins.join(' · ')}</div>` : ''}
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
    const late = model.retardNow(classId);
    const stateOf = s => (late.has(s.id) ? 'retard' : absent.has(s.id) ? 'absent' : 'present');
    const lateTxt = late.size ? ` · ${late.size} retard${late.size > 1 ? 's' : ''}` : '';
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/', 'Classes')}
        <div class="heading"><span class="title">${c.name}</span>
          <span class="sub">${students.length} élèves${absent.size ? ` · ${absent.size} absent${absent.size > 1 ? 's' : ''}` : ''}${lateTxt} · Trimestre ${model.trimester()}</span></div>
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
          ? html`<div class="trombi-grid">${students.map(s => card(s, counts.get(s.id) || { neg: 0, pos: 0 }, stateOf(s), inAppel))}</div>`
          : html`<div class="empty-block">Aucun élève dans cette classe. Ajoutez-les depuis Administration.</div>`}
      </main>
      ${inAppel ? html`<div class="sel-bar appel-bar">
        <span class="sel-text"><strong>${sessionTitle(classId)}</strong> · 1 toucher : absent, 2 touchers : en retard · ${absent.size} absent${absent.size > 1 ? 's' : ''}${lateTxt} / ${students.length}
</span>
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
        const st = db.get('students', btn.dataset.sid);
        const type = btn.dataset.obs;
        const list = model.motifs(type);
        if (!list.length) return; // aucun motif défini : l'appui long compte comme un toucher
        p.long = true;
        buzz(30);
        openMenu({
          anchor: btn, width: 280, color: COLOR[type],
          title: model.LABEL[type] + ' · ' + (st ? st.prenom : ''),
          items: list.map(label => ({ label, onPick: () => add(root, btn, label) })),
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

    startAppel(el, e, { classId }) { startAppel(classId); },
    endAppel(el, e, { classId }) {
      const n = model.absentNow(classId).size, r = model.retardNow(classId).size;
      const parts = [n && `${n} absent${n > 1 ? 's' : ''}`, r && `${r} retard${r > 1 ? 's' : ''}`].filter(Boolean);
      appel = null;
      refresh();
      toast({ text: parts.length ? `Appel enregistré : ${parts.join(', ')}` : 'Appel enregistré : tout le monde est présent' });
    },
    toggleAbs(el) {
      const s = db.get('students', el.dataset.sid);
      if (!s) return;
      model.setPresence(s, NEXT_PRESENCE[model.presenceOf(s)]);
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
  },
};
