// Trombinoscope : l'écran le plus utilisé. Un tap = une observation ; appui long = choix d'un motif.
// Mode « Appel » : toucher les élèves absents. « Tirage » : tirage au sort parmi les présents pas encore interrogés.
import * as db from '../db.js';
import * as model from '../model.js';
import * as planning from '../planning.js';
import * as stats from '../stats.js';
import { html, toast, openMenu, buzz, todayISO, fmtDayLong, choiceDialog } from '../ui.js';
import { icon, backLink, saveStatus, tabBar, photo } from '../components.js';
import { go, refresh } from '../nav.js';
import { onFaireAppel } from '../alertes.js';
import * as PC from '../plan-classe.js';
import * as S from '../salles.js';
import { planHtml } from '../plan-view.js';

const LONG_PRESS_MS = 450;
const COLOR = { neg: 'var(--neg)', pos: 'var(--pos)' };

let appel = null;   // classId en mode appel
let draw = null;    // { classId, sid, spinning, restarted }
let presence = null; // { classId, period: 1|2|3|'annee' } : panneau des statistiques de présence de la classe

// ---------- Plan de classe (1.20.0) ----------
// Vue « Photos » (trombinoscope) ou « Plan » (élèves à leur place dans la salle) : choix mémorisé sur l'appareil.
let vue = (() => { try { return localStorage.getItem('carnet-vue-trombi') === 'plan' ? 'plan' : 'photos'; } catch (e) { return 'photos'; } })();
let placing = null;      // classId en mode « Placer les élèves »
let selSid = null;       // élève choisi (à placer / à déplacer)
const choixSalle = {};   // classId → salle choisie à la main (sinon celle du cours)

function planVue(classId, inAppel, stateOf, counts) {
  const salle = PC.salleDe(classId, choixSalle[classId]);
  if (!salle) return html`<div class="empty-block">Aucun plan de salle pour l’instant.
    <a class="btn accent" href="#/admin/salles">${icon.grid}Créer le plan de votre salle</a></div>`;
  const map = PC.placement(classId, salle);
  const enPlace = placing === classId;
  const libres = PC.nonPlaces(classId, salle);
  const salles = S.salles();
  const seat = p => {
    const s = map[p.id] && db.get('students', map[p.id]);
    if (!s) return html`<button type="button" class="pseat empty${enPlace && selSid ? ' target' : ''}" data-click="seatTap" data-seat="${p.id}" aria-label="Place ${p.num} libre">${enPlace ? p.num : ''}</button>`;
    const st = stateOf(s), c = counts.get(s.id) || { neg: 0, pos: 0 };
    return html`<button type="button" class="pseat ${st}${selSid === s.id ? ' sel' : ''}" data-click="seatTap" data-seat="${p.id}" data-sid="${s.id}" aria-label="${model.fullName(s)}${st !== 'present' ? ' : ' + PRESENCE[st] : ''}">
      ${photo(s, { label: false, cls: 'pphoto' })}<span class="pname">${s.prenom || s.nom}</span>
      ${!enPlace && !inAppel && c.neg ? html`<span class="pbadge neg">−${c.neg}</span>` : ''}
      ${!enPlace && !inAppel && c.pos ? html`<span class="pbadge pos">+${c.pos}</span>` : ''}
      ${st !== 'present' ? html`<span class="pstate">${st === 'absent' ? 'Absent' : 'Retard'}</span>` : ''}</button>`;
  };
  return html`<div class="plan-classe${enPlace ? ' placing' : ''}">
    <div class="plan-bar">
      ${salles.length > 1 ? html`<div class="segmented">${salles.map(x => html`<button type="button" class="seg${x.id === salle.id ? ' on' : ''}" data-click="pickSalle" data-id="${x.id}">${x.name}</button>`)}</div>`
        : html`<span class="strong-15">${salle.name}</span>`}
      <span class="grow"></span>
      ${inAppel ? '' : enPlace ? html`
          <button type="button" class="btn soft small" data-click="remplir" data-h="0">Compléter (A → Z)</button>
          <button type="button" class="btn soft small" data-click="remplir" data-h="1">Compléter au hasard</button>
          <button type="button" class="btn soft small" data-click="viderPlan">Tout retirer</button>
          <button type="button" class="btn accent small" data-click="finPlacer">Terminé</button>`
        : html`<button type="button" class="btn soft small" data-click="placer">${icon.edit}Placer les élèves</button>`}
    </div>
    ${enPlace ? html`<div class="plan-aide muted small">${selSid ? html`<strong>${model.fullName(db.get('students', selSid))}</strong> : touchez sa place (une place prise = échange).
        <button type="button" class="link-btn" data-click="retirerEleve">Retirer de sa place</button>`
      : 'Touchez un élève ci-dessous (ou sur le plan, pour le déplacer), puis sa place.'}</div>
      <div class="plan-libres">${libres.length ? libres.map(s => html`<button type="button" class="libre${selSid === s.id ? ' on' : ''}" data-click="pickEleve" data-sid="${s.id}">
          ${photo(s, { label: false, cls: 'mini' })}<span>${s.prenom} ${s.nom.charAt(0)}.</span></button>`)
        : html`<span class="muted small">Tous les élèves sont placés ✓</span>`}</div>` : ''}
    ${planHtml(salle, { seat })}
    ${!enPlace && libres.length && Object.keys(map).length ? html`<div class="muted small">Non placés : ${libres.map(s => model.shortName(s)).join(', ')}</div>` : ''}
    ${!enPlace && !Object.keys(map).length ? html`<div class="muted small center">Personne n’est encore placé : touchez « Placer les élèves ».</div>` : ''}
  </div>`;
}

// + / − depuis le plan (toast avec « Annuler », comme dans le trombinoscope).
function addObsPlan(st, type, motif = '') {
  const undo = model.addObservation(st, type, motif);
  buzz(18);
  refresh();
  toast({ who: model.shortName(st), text: model.LABEL[type] + (motif ? ' — ' + motif : ''), color: COLOR[type],
    undo: async () => { await undo(); refresh(); return { who: model.shortName(st), text: 'saisie annulée' }; } });
}

// ---------- Présence de la classe (panneau) ----------
function presenceView(classId) {
  const t = model.trimester();
  const per = presence.period;
  const P = stats.presenceClasse(classId, per === 'annee' ? null : per);
  const rows = P.eleves.filter(e => e.appels).sort((a, b) => a.taux - b.taux || b.retards - a.retards || model.cmp(a.s.nom, b.s.nom));
  return html`<div class="scrim dim" data-click="closePresence"></div>
    <aside class="drawer" role="dialog" aria-modal="true">
      <div class="drawer-head"><span class="drawer-title grow">Présence</span>
        <button type="button" class="btn soft" data-click="closePresence">Fermer</button></div>
      <div class="drawer-body" data-scroll="presence">
        <div class="segmented">${[1, 2, 3].map(k => html`<button type="button" class="seg${per === k ? ' on' : ''}" data-click="presencePeriod" data-k="${k}" ${k > t ? 'disabled' : ''}>T${k}</button>`)}
          <button type="button" class="seg${per === 'annee' ? ' on' : ''}" data-click="presencePeriod" data-k="annee">Année</button></div>
        <div class="pres-kpis">
          <div class="pres-kpi"><span class="pres-n">${stats.pct(P.moyenne)}</span><span class="muted small">présence moyenne</span></div>
          <div class="pres-kpi"><span class="pres-n">${P.appels}</span><span class="muted small">appel${P.appels > 1 ? 's' : ''}</span></div>
          <div class="pres-kpi"><span class="pres-n">${P.absences}</span><span class="muted small">absence${P.absences > 1 ? 's' : ''}</span></div>
          <div class="pres-kpi"><span class="pres-n">${P.retards}</span><span class="muted small">retard${P.retards > 1 ? 's' : ''}</span></div>
        </div>
        ${P.appels ? html`
          ${P.plusAbsents.length ? html`<div class="stack-tight"><div class="caps">Les plus absents</div>
            ${P.plusAbsents.map(e => html`<div class="pres-row"><span class="grow"><strong>${e.s.prenom}</strong> ${e.s.nom}</span><span>${e.absences} abs.</span><strong class="pres-pct">${stats.pct(e.taux)}</strong></div>`)}</div>` : html`<div class="muted">Aucune absence sur la période.</div>`}
          <div class="stack-tight"><div class="caps">Toute la classe</div>
            ${rows.map(e => html`<button type="button" class="pres-row btnrow" data-click="detail" data-sid="${e.s.id}">
              <span class="grow"><strong>${e.s.prenom}</strong> ${e.s.nom}</span>
              <span class="muted small">${e.absences ? e.absences + ' abs.' : ''}${e.absences && e.retards ? ' · ' : ''}${e.retards ? e.retards + ' ret.' : ''}</span>
              <span class="pres-bar"><span style="width:${Math.round(e.taux * 100)}%"></span></span>
              <strong class="pres-pct">${stats.pct(e.taux)}</strong></button>`)}
          </div>` : html`<div class="muted">Aucun appel sur cette période.</div>`}
        <div class="muted small">Présence = appels où l’élève n’était pas absent, sur les appels de la classe. Un retard compte comme présent.</div>
      </div>
    </aside>`;
}

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

// Appel demandé depuis une alerte ou le panneau d'un cours : ouvert dès l'affichage du trombinoscope.
let autoAppel = null;
export function demanderAppel(classId) { autoAppel = classId; }
onFaireAppel(demanderAppel);

// Appel rattaché au cours en contexte (touché dans le planning, en cours, ou prochain de la journée).
// Le même cours ne reçoit qu'un appel : s'il existe, on le rouvre pour le corriger.
async function startAppel(classId) {
  const k = planning.coursContexte(classId);
  if (!k) return startAppelHorsPlanning(classId);
  const open = () => { appel = classId; refresh(); };
  const done = model.appelOfCours(k.id);
  if (done) { open(); toast({ text: `Appel du cours de ${k.debut} déjà fait : touchez un élève pour corriger` }); return; }
  if (planning.OFF.has(k.statut)) {
    const ok = await choiceDialog({
      title: `Ce cours est marqué « ${planning.statutLabel(k)} »`,
      text: 'Faire l’appel quand même ?',
      choices: [{ label: 'Faire l’appel', value: true, style: 'accent' }, { label: 'Annuler', value: false }],
    });
    if (!ok) return;
  }
  let ctx = null;
  const act = model.activeAssignments(classId)[0];
  if (planning.roleOfCours(k) === 'suivi' && act && !k.pasSeance) {
    // 1 créneau = 1 séance : la séance reliée à ce cours, sinon une séance du jour encore sans cours (créée dans
    // l'onglet Projet) ; sinon on propose d'en commencer une nouvelle, même si un autre créneau précède.
    let s = model.seanceOfCours(k.id)
      || model.seancesOf(act.id).filter(x => x.date === k.date && (!x.coursId || !db.get('cours', x.coursId))).shift();
    if (s && (!s.coursId || !db.get('cours', s.coursId))) model.updateSeance(s.id, { coursId: k.id });
    if (!s) {
      const p = db.get('projects', act.projectId);
      const n = model.seancesOf(act.id).length + 1;
      const full = n > p.nSeances;
      const choice = await choiceDialog({
        title: full ? `Les ${p.nSeances} séances de « ${p.title} » sont faites` : `Commencer la séance ${n} ?`,
        text: `Cours de ${k.debut} · ${p.title}.` + (full ? ' Vous pouvez augmenter le nombre de séances dans le projet (Administration).' : ''),
        choices: [
          ...(full ? [] : [{ label: `Commencer la séance ${n} et faire l’appel`, value: 'seance', style: 'accent' }]),
          { label: 'Faire l’appel sans séance de projet', value: 'appel', style: 'soft' },
          { label: 'Annuler', value: null, style: 'soft' },
        ],
      });
      if (!choice) return;
      if (choice === 'seance') {
        s = model.newSeance(act, { date: k.date, coursId: k.id }).seance;
        toast({ text: `Séance ${s.n} créée · ${fmtDayLong(s.date)}` });
      }
    }
    if (s) ctx = model.ctxOfSeance(s);
  }
  model.createAppel(classId, ctx, k);
  open();
}

// Appel sans emploi du temps (ou classe sans cours ce jour-là) : fonctionnement d'avant le planning.
async function startAppelHorsPlanning(classId) {
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
    if (presence && presence.classId !== classId) presence = null;
    const inAppel = appel === classId;
    const students = model.studentsOf(classId);
    const counts = model.countsByStudent(classId);
    const absent = model.absentNow(classId);
    const late = model.retardNow(classId);
    const stateOf = s => (late.has(s.id) ? 'retard' : absent.has(s.id) ? 'absent' : 'present');
    const lateTxt = late.size ? ` · ${late.size} retard${late.size > 1 ? 's' : ''}` : '';
    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/', 'Accueil')}
        <div class="heading"><span class="title">${c.name}</span>
          <span class="sub">${students.length} élèves${absent.size ? ` · ${absent.size} absent${absent.size > 1 ? 's' : ''}` : ''}${lateTxt} · Trimestre ${model.trimester()}</span></div>
        <div class="spacer"></div>
        <div class="segmented vue-seg">
          <button type="button" class="seg${vue === 'photos' ? ' on' : ''}" data-click="vue" data-k="photos">Photos</button>
          <button type="button" class="seg${vue === 'plan' ? ' on' : ''}" data-click="vue" data-k="plan">Plan</button>
        </div>
        ${inAppel ? '' : html`
          <button type="button" class="btn soft" data-click="startAppel">${icon.roll}<span class="hide-phone">Appel</span></button>
          <button type="button" class="btn soft" data-click="draw">${icon.dice}<span class="hide-phone">Tirage</span></button>
          <button type="button" class="btn soft" data-click="presence">${icon.tabProjet}<span class="hide-phone">Présence</span></button>
          <div class="legend hide-narrow">
            <span><i class="sw neg"></i>Comportement</span>
            <span><i class="sw pos"></i>Aide / soutien / rangement</span>
          </div>
          <div class="vsep hide-narrow"></div>
          ${saveStatus()}`}
      </header>
      <main class="content trombi${inAppel ? ' appel-mode' : ''}" data-scroll="trombi">
        ${(() => { const k = planning.coursContexte(classId); return k && k.note ? html`<div class="cours-note">${icon.list}
          <span><strong>Note du cours · ${new Date(k.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${k.debut}</strong> — ${k.note}</span></div>` : ''; })()}
        ${students.length && vue === 'plan' ? planVue(classId, inAppel, stateOf, counts)
          : students.length
          ? html`<div class="trombi-grid">${students.map(s => card(s, counts.get(s.id) || { neg: 0, pos: 0 }, stateOf(s), inAppel))}</div>`
          : html`<div class="empty-block">Aucun élève dans cette classe. Ajoutez-les depuis Administration.</div>`}
      </main>
      ${inAppel ? html`<div class="sel-bar appel-bar">
        <span class="sel-text"><strong>${sessionTitle(classId)}</strong> · 1 toucher : absent, 2 touchers : en retard · ${absent.size} absent${absent.size > 1 ? 's' : ''}${lateTxt} / ${students.length}
</span>
        <button type="button" class="toast-btn accent" data-click="endAppel">Terminer l’appel</button>
      </div>` : ''}
      ${draw ? drawView(classId) : ''}
      ${presence ? presenceView(classId) : ''}
      ${tabBar(classId, 'trombi')}
    </div>`;
  },

  leave() { appel = null; draw = null; presence = null; placing = null; selSid = null; },

  mount(root, params) {
    if (autoAppel && params && autoAppel === params.classId) { autoAppel = null; setTimeout(() => startAppel(params.classId)); }
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
    detail(el, e, { classId }) { presence = null; go(`#/classe/${classId}/eleve/${el.dataset.sid}`); },
    presence(el, e, { classId }) { presence = { classId, period: model.trimester() }; refresh(); },
    presencePeriod(el) { presence.period = el.dataset.k === 'annee' ? 'annee' : +el.dataset.k; refresh(); },
    closePresence() { presence = null; refresh(); },

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

    // ----- Plan de classe -----
    vue(el) {
      vue = el.dataset.k === 'plan' ? 'plan' : 'photos';
      try { localStorage.setItem('carnet-vue-trombi', vue); } catch (err) { /* stockage indisponible */ }
      placing = null; selSid = null; refresh();
    },
    pickSalle(el, e, { classId }) {
      choixSalle[classId] = el.dataset.id; selSid = null;
      const s = db.get('salles', el.dataset.id); if (s) PC.retenirSalle(classId, s);
      refresh();
    },
    placer(el, e, { classId }) { placing = classId; selSid = null; refresh(); },
    finPlacer() { placing = null; selSid = null; refresh(); toast({ text: 'Plan de classe enregistré' }); },
    pickEleve(el) { selSid = selSid === el.dataset.sid ? null : el.dataset.sid; refresh(); },
    seatTap(el, e, { classId }) {
      const salle = PC.salleDe(classId, choixSalle[classId]);
      const sid = el.dataset.sid || null;
      if (placing === classId) {
        if (selSid) { PC.placer(classId, salle, el.dataset.seat, selSid); selSid = null; }
        else if (sid) selSid = sid;
        refresh();
        return;
      }
      if (!sid) return;
      const st = db.get('students', sid);
      if (appel === classId) { model.setPresence(st, NEXT_PRESENCE[model.presenceOf(st)]); buzz(18); refresh(); return; }
      openMenu({
        anchor: el, width: 290, title: model.fullName(st),
        items: ['neg', 'pos'].flatMap(type => {
          const chip = { bg: COLOR[type], fg: '#fff', text: type === 'neg' ? '−' : '+' };
          return [{ section: model.LABEL[type] },
            { label: 'Sans motif', chip, onPick: () => addObsPlan(st, type) },
            ...model.motifs(type).map(m => ({ label: m, chip, onPick: () => addObsPlan(st, type, m) }))];
        }).concat([{ label: 'Fiche de l’élève →', quiet: true, onPick: () => go(`#/classe/${classId}/eleve/${sid}`) }]),
      });
    },
    retirerEleve(el, e, { classId }) {
      const salle = PC.salleDe(classId, choixSalle[classId]);
      const seat = Object.entries(PC.placement(classId, salle)).find(([, s]) => s === selSid);
      if (seat) PC.placer(classId, salle, seat[0], null);
      selSid = null; refresh();
    },
    remplir(el, e, { classId }) {
      const salle = PC.salleDe(classId, choixSalle[classId]);
      const { undo, reste } = PC.remplir(classId, salle, { hasard: el.dataset.h === '1' });
      selSid = null; refresh();
      toast({ text: reste ? `Plus de place libre : ${reste} élève${reste > 1 ? 's' : ''} non placé${reste > 1 ? 's' : ''}` : 'Élèves placés', undo: async () => { await undo(); refresh(); } });
    },
    async viderPlan(el, e, { classId }) {
      const salle = PC.salleDe(classId, choixSalle[classId]);
      const undo = PC.vider(classId, salle);
      selSid = null; refresh();
      toast({ text: 'Plan vidé', undo: async () => { await undo(); refresh(); } });
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
