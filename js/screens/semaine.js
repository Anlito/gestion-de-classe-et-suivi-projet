// Accueil : planning de la semaine (maquette Planning.dc.html, cahier des charges v2 §7.0).
// Sans emploi du temps, l'accueil reste la liste des classes (screens/accueil.js).
// Tablette : la semaine entière ; téléphone : un jour à la fois.
// Toucher un cours ouvre son panneau : ouvrir la classe, projet, statut, déplacer (créneaux libres en pointillés),
// remettre à sa place, note, autre horaire.
import * as db from '../db.js';
import * as model from '../model.js';
import * as planning from '../planning.js';
import { normClasse } from '../ical.js';
import { html, toast, todayISO, choiceDialog } from '../ui.js';
import { icon, saveStatus } from '../components.js';
import { go, refresh } from '../nav.js';
import accueil from './accueil.js';

let weekStart = null;   // lundi affiché (AAAA-MM-JJ)
let dayIdx = null;      // jour affiché sur téléphone (0 = lundi)
let timer = null, onResize = null;
let screenW = 0, screenH = 0;
let moving = null;      // id du cours en cours de déplacement (créneaux libres affichés)

// ---------- Dates ----------
const pad = n => String(n).padStart(2, '0');
const parse = iso => new Date(iso + 'T12:00:00');
const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return todayISO(d); };
const mondayOf = iso => { const d = parse(iso); return addDays(iso, -((d.getDay() + 6) % 7)); };
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const fmtShort = iso => parse(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtSlot = (iso, debut) => parse(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) + ' · ' + debut;
const fmtLong = iso => parse(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const narrow = () => window.innerWidth < 700;

// Teinte du niveau de la classe (mêmes teintes que les tuiles des classes).
const tintOf = cls => { if (!cls) return 'var(--surface)'; const s = model.SECTIONS.find(x => x.key === model.sectionOf(cls)); return s ? s.tint : 'var(--surface)'; };
// « Projet · séance x/n » du projet en cours de la classe.
function projetOf(classId) {
  const a = classId && model.activeAssignments(classId)[0];
  const p = a && db.get('projects', a.projectId);
  if (!p) return null;
  const pr = model.progress(a);
  return { a, p, label: `${p.title} · séance ${pr.cur}/${pr.total}` };
}
const nameOf = (e, cls) => (cls ? cls.name : e.classe || e.matiere);

// Cours de la semaine prêts à afficher (tels que modifiés par le professeur : planning.eff).
function weekCours(mon) {
  const etabs = Object.fromEntries(db.all('etablissements').map(e => [e.id, e]));
  const today = todayISO(), now = nowMin();
  return planning.coursEntre(mon, addDays(mon, 6)).map(c => {
    const e = etabs[c.etabId];
    const classId = planning.classIdOf(c.src);
    const cls = classId ? db.get('classes', classId) : null;
    const entry = c.source === 'pronote' && e && e.classes ? e.classes[normClasse(c.classe)] : null;
    const link = classId ? 'ok' : !c.classe ? 'none' : entry && entry.classId === '' ? 'ignored' : 'todo';
    const off = planning.OFF.has(c.statut);
    const role = planning.roleOfCours(c);
    const start = toMin(c.debut), end = Math.max(toMin(c.fin), start + 1);
    const live = c.date === today && !off && now >= start && now < end;
    const moved = !!c.deplaceDe || c.statut === 'deplace';
    return {
      c, e, cls, classId, link, off, start, end, live, moved,
      name: nameOf(c, cls),
      dim: role === 'grise' || link === 'ignored' || link === 'none',
      past: !live && (c.date < today || (c.date === today && end <= now)),
      chip: planning.statutLabel(c) && c.statut !== 'deplace' ? planning.statutLabel(c) : moved ? 'Déplacé' : live ? 'En cours' : '',
      progress: live ? Math.round((now - start) / (end - start) * 100) : 0,
    };
  });
}

// Répartit les cours qui se chevauchent sur plusieurs colonnes (« couloirs »).
function lanes(items) {
  items.sort((a, b) => a.start - b.start || b.end - a.end);
  let group = [], groupEnd = -1;
  const flush = () => { const n = Math.max(...group.map(x => x.lane)) + 1; for (const x of group) x.lanes = n; group = []; };
  for (const it of items) {
    if (group.length && it.start >= groupEnd) flush();
    const used = new Set(group.filter(x => x.end > it.start).map(x => x.lane));
    let l = 0; while (used.has(l)) l++;
    it.lane = l; group.push(it); groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) flush();
  return items;
}

// Vacances ou jours fériés d'une date (libellés sans doublon, tous établissements confondus).
function dayOff(iso) {
  return [...new Set(db.where('jours', j => iso >= j.du && iso <= j.au).map(j => j.label || (j.type === 'ferie' ? 'Férié' : 'Vacances')))];
}

// Pause méridienne : entre la fin des cours du matin et le début de ceux de l'après-midi de la semaine.
function lunchOf(items) {
  const on = items.filter(i => !i.off);
  const morning = on.filter(i => i.start < 12 * 60 + 30), afternoon = on.filter(i => i.start >= 12 * 60 + 30);
  if (!morning.length || !afternoon.length) return null;
  const a = Math.max(...morning.map(i => i.end)), b = Math.min(...afternoon.map(i => i.start));
  return b - a >= 40 ? { a, b } : null;
}

function block(it, top, height, left, width, lanesN) {
  const wide = lanesN === 1;
  const cls = ['wk-c', it.dim ? 'dim' : '', it.off ? 'off' : '', it.live ? 'live' : '', it.link === 'todo' ? 'todo' : '',
    it.past && !it.off ? 'past' : '', moving && moving !== it.c.id ? 'faded' : '', moving === it.c.id ? 'sel' : '', height < 44 ? 'tiny' : ''].filter(Boolean).join(' ');
  const proj = wide && !it.off && height >= 62 ? (it.c.deplaceDe ? 'Déplacé depuis ' + fmtSlot(it.c.deplaceDe.date, it.c.deplaceDe.debut) : (projetOf(it.classId) || {}).label) : '';
  const time = `${it.c.debut}–${it.c.fin}`;
  const line2 = wide ? time + (it.c.salle ? ' · ' + it.c.salle : '') : it.chip || (lanesN === 2 ? time : it.c.debut);
  return html`<div role="button" tabindex="0" class="${cls}" data-click="sheet" data-id="${it.c.id}"
    style="top:${top}px;height:${height}px;left:calc(${left}% + ${it.lane ? 3 : 0}px);width:calc(${width}% - ${lanesN > 1 ? 3 : 0}px);--tint:${it.off ? 'transparent' : tintOf(it.cls)};--etab:${it.e ? it.e.color : 'transparent'}"
    aria-label="${it.name}, ${time}${it.chip ? ', ' + it.chip : ''}${it.c.note ? ', note : ' + it.c.note : ''}">
    <span class="wk-row1"><span class="wk-name">${it.name}${it.link === 'todo' ? ' ?' : ''}</span>
      ${it.c.note ? html`<span class="wk-note-ic" title="${it.c.note}">${icon.list}</span>` : ''}
      ${wide && it.chip ? html`<span class="wk-chip${it.live ? ' live' : it.off ? ' warn' : ''}">${it.chip}</span>` : ''}</span>
    <span class="wk-meta${!wide && it.chip ? ' strong' : ''}">${line2}</span>
    ${proj ? html`<span class="wk-proj">${proj}</span>` : ''}
    ${it.live ? html`<span class="wk-progress"><span style="width:${it.progress}%"></span></span>` : ''}
  </div>`;
}

// ---------- Panneau d'un cours ; formulaires « autre horaire » et « ajouter un cours » ----------
let sheet = null; // { mode: 'view'|'edit'|'add', id?, f: { classId, etabId, date, debut, fin, salle, role, repeat }, note }

function sheetView() {
  const c = sheet.id ? db.get('cours', sheet.id) : null;
  if (sheet.mode !== 'add' && !c) { sheet = null; return ''; }
  const e = c ? planning.eff(c) : null;
  const classId = c ? planning.classIdOf(c) : null;
  const cls = classId ? db.get('classes', classId) : null;
  const etab = e && e.etabId ? db.get('etablissements', e.etabId) : null;
  let head, body;
  if (sheet.mode === 'view') {
    const proj = projetOf(classId);
    const choix = planning.choixOf(e.statut);
    head = html`<div class="cs-head" style="background:${tintOf(cls)}">
        <div class="grow"><div class="cs-title">${nameOf(e, cls)}</div>
          <div class="cs-when">${fmtLong(e.date)} · ${e.debut}–${e.fin}</div>
          <div class="cs-where">${[e.salle && 'Salle ' + e.salle, etab && etab.initiales, e.source === 'manuel' && 'ajouté à la main'].filter(Boolean).join(' · ') || ' '}</div></div>
        <button type="button" class="cs-close" data-click="closeSheet" aria-label="Fermer">${icon.close}</button>
      </div>`;
    body = html`
      <div class="stack-tight">
        ${cls ? html`<button type="button" class="btn accent cs-open" data-click="open" data-id="${c.id}">Ouvrir la classe ${icon.arrow}</button>`
          : html`<div class="abs-info">${c.classe ? html`« ${c.classe} » n’est reliée à aucune classe de l’app.
              <a class="link-btn" href="#/admin/planning">Emploi du temps → Classes</a>` : 'Cours sans classe.'}</div>`}
        ${proj ? html`<a class="cs-proj" href="#/classe/${classId}/projet"><span class="grow"><span class="muted small">Projet</span><strong>${proj.label}</strong></span>${icon.chevron}</a>` : ''}
      </div>
      <div class="stack-tight">
        <div class="cs-sec">Statut du cours</div>
        ${Object.entries(planning.STATUT_CHOIX).map(([k, s]) => html`<button type="button" class="cs-opt${choix === k ? ' on' : ''}" data-click="statut" data-k="${k}">
          <span class="grow">${s.choix}</span>${choix === k ? icon.check : ''}</button>`)}
      </div>
      <div class="stack-tight">
        <div class="cs-sec">Créneau</div>
        ${e.deplaceDe ? html`<div class="muted">Déplacé depuis <strong class="ink">${fmtSlot(e.deplaceDe.date, e.deplaceDe.debut)}</strong></div>` : ''}
        <div class="row-center">
          <button type="button" class="btn soft grow" data-click="startMove">Déplacer le cours</button>
          ${e.deplaceDe ? html`<button type="button" class="btn soft grow" data-click="remettre">Remettre à sa place</button>` : ''}
        </div>
        <button type="button" class="link-btn self-start" data-click="editForm">Autre horaire ou salle…</button>
      </div>
      <div class="stack-tight">
        <div class="cs-sec">Note sur ce cours</div>
        <textarea class="field" rows="3" data-input="noteText" placeholder="Photo de classe, élection des délégués, sortie à préparer…">${sheet.note}</textarea>
        <div class="row-end"><button type="button" class="btn soft small" data-click="saveNote">Enregistrer la note</button></div>
      </div>
      ${e.modifie || c.source === 'manuel' ? html`<div class="stack-tight">
        ${e.modifie ? html`<div class="muted small">Modifié par vous. Pronote : ${fmtLong(c.date)} · ${c.debut}–${c.fin}${c.salle ? ' · ' + c.salle : ''}.</div>
          <button type="button" class="link-btn self-start" data-click="resetPerso">Revenir entièrement à la version Pronote</button>` : ''}
        ${c.source === 'manuel' ? html`<button type="button" class="btn danger-soft" data-click="delCours">Supprimer ce cours ajouté</button>` : ''}
      </div>` : ''}`;
  } else {
    const f = sheet.f;
    const add = sheet.mode === 'add';
    head = html`<div class="drawer-head"><span class="drawer-title grow ellipsis">${add ? 'Ajouter un cours' : 'Autre horaire · ' + nameOf(e, cls)}</span>
        <button type="button" class="btn soft" data-click="${add ? 'closeSheet' : 'backView'}">Annuler</button>
        <button type="button" class="btn accent" data-click="${add ? 'saveAdd' : 'saveEdit'}">Enregistrer</button></div>`;
    body = html`<div class="stack">
      ${add ? html`<label class="lbl">Classe
        <select class="input" data-change="fClass"><option value="">— Choisir —</option>${model.classes().map(k => html`<option value="${k.id}" ${f.classId === k.id ? 'selected' : ''}>${k.name}</option>`)}</select></label>` : ''}
      <label class="lbl">Date <input class="input" type="date" value="${f.date}" data-change="fDate"></label>
      <div class="row-center">
        <label class="lbl grow">Début <input class="input" type="time" value="${f.debut}" data-change="fDebut"></label>
        <label class="lbl grow">Fin <input class="input" type="time" value="${f.fin}" data-change="fFin"></label>
      </div>
      <label class="lbl">Salle (facultatif) <input class="input" value="${f.salle}" data-input="fSalle" placeholder="—"></label>
      ${add ? html`
        <label class="lbl">Établissement (facultatif)
          <select class="input" data-change="fEtab"><option value="">—</option>${planning.etablissements().map(x => html`<option value="${x.id}" ${f.etabId === x.id ? 'selected' : ''}>${x.initiales} · ${x.name}</option>`)}</select></label>
        <label class="lbl">Type de cours
          <select class="input" data-change="fRole">${['suivi', 'appel', 'grise'].map(r => html`<option value="${r}" ${f.role === r ? 'selected' : ''}>${planning.ROLES[r].label} — ${planning.ROLES[r].sub}</option>`)}</select></label>
        <label class="check-row"><input type="checkbox" data-change="fRepeat" ${f.repeat ? 'checked' : ''}> Chaque semaine jusqu’à la fin de l’année (vacances sautées)</label>` : ''}
    </div>`;
  }
  return html`<div class="scrim dim" data-click="closeSheet"></div>
    <aside class="drawer cours-sheet" role="dialog" aria-modal="true">
      ${head}
      <div class="drawer-body" data-scroll="sheet">${body}</div>
    </aside>`;
}

// Chevauchements : avertit et demande confirmation. Renvoie true pour continuer.
async function okMalgreChevauchement(placements, ignore = []) {
  const conflicts = planning.chevauchements(placements, ignore);
  if (!conflicts.length) return true;
  const lines = conflicts.slice(0, 4).map(({ cours: x }) => {
    const k = planning.classIdOf(x.src);
    return `${fmtSlot(x.date, x.debut)}–${x.fin} : ${nameOf(x, k && db.get('classes', k))}`;
  });
  const n = conflicts.length;
  const choice = await choiceDialog({
    title: n > 1 ? `Ce cours en chevauche ${n} autres` : 'Ce cours en chevauche un autre',
    text: lines.join(' · ') + (n > 4 ? ` · et ${n - 4} autre${n - 4 > 1 ? 's' : ''}` : ''),
    choices: [
      { label: 'Enregistrer quand même', value: true, style: 'soft' },
      { label: 'Revenir en arrière', value: false, style: 'accent' },
    ],
  });
  return choice === true;
}
// « Cette fois » ou « toutes les semaines suivantes » (null si on renonce).
async function askSerie(c) {
  const n = planning.suivants(c).length;
  if (!n) return false;
  const e = planning.eff(c);
  const choice = await choiceDialog({
    title: 'Appliquer la modification à…',
    text: `D’autres cours de cette classe ont lieu le ${DAYS[(parse(e.date).getDay() + 6) % 7].toLowerCase()} à ${e.debut} jusqu’à la fin de l’année. Les cours passés ne changent pas.`,
    choices: [
      { label: 'Cette fois seulement', value: 'one', style: 'soft' },
      { label: 'Ce cours et toutes les semaines suivantes', sub: `${n + 1} cours jusqu’à la fin de l’année`, value: 'all', style: 'soft' },
      { label: 'Annuler', value: null, style: 'soft' },
    ],
  });
  return choice === null ? null : choice === 'all';
}
// Déplacement / changement d'horaire commun au glisser vers un créneau et au formulaire.
async function deplacer(c, changes) {
  const serie = await askSerie(c);
  if (serie === null) return false;
  const placements = planning.placementsDeplacement(c, changes, serie);
  if (!(await okMalgreChevauchement(placements, placements.map(p => p.id)))) return false;
  const undo = planning.editCours(c, changes, serie);
  toast({ text: (serie ? `${placements.length} cours déplacés` : `${nameOf(c, db.get('classes', planning.classIdOf(c)))} déplacé au ${fmtSlot(changes.date, changes.debut)}`),
    undo: async () => { await undo(); refresh(); } });
  return true;
}

export default {
  render(params) {
    // Pas encore d'emploi du temps : l'accueil reste la liste des classes.
    if (!db.all('cours').length) return accueil.render(params);

    const today = todayISO();
    if (!weekStart) weekStart = mondayOf(today);
    const items = weekCours(weekStart);
    const hasSat = items.some(it => parse(it.c.date).getDay() === 6);
    const nDays = hasSat ? 6 : 5;
    const dates = Array.from({ length: nDays }, (_, i) => addDays(weekStart, i));
    const phone = narrow();
    if (dayIdx == null || dayIdx >= nDays) { const t = dates.indexOf(today); dayIdx = t >= 0 ? t : 0; }
    const shown = phone ? [dates[dayIdx]] : dates;

    // Plage horaire : celle des cours de la semaine, arrondie à l'heure (8 h – 17 h 30 au minimum).
    const from = Math.floor(Math.min(8 * 60, ...items.map(i => i.start)) / 60) * 60;
    const to = Math.ceil(Math.max(17.5 * 60, ...items.map(i => i.end)) / 30) * 30;
    // Hauteur de référence : la plus grande vue pour cette largeur (le clavier ou une liste ouverte la réduisent un instant).
    if (screenW !== window.innerWidth) { screenW = window.innerWidth; screenH = 0; }
    screenH = Math.max(screenH, window.innerHeight);
    const avail = screenH - 64 - 48 - 16;
    const ppm = Math.max(phone ? 1.1 : 0.9, avail / (to - from));
    const H = Math.round((to - from) * ppm);
    const y = m => Math.round((m - from) * ppm);
    const lunch = lunchOf(items);

    const isThisWeek = mondayOf(today) === weekStart;
    const live = items.find(it => it.live && it.classId);
    const t = nowMin();
    const mc = moving ? db.get('cours', moving) : null;
    if (moving && !mc) moving = null;
    // Créneaux libres pendant un déplacement.
    const targets = d => {
      if (!mc || d < today || dayOff(d).length) return [];
      const me = planning.eff(mc);
      const busy = items.filter(it => it.c.date === d && !it.off && it.c.id !== mc.id);
      return planning.creneaux(mc).filter(s => !(d === today && toMin(s.debut) <= t) && !(d === me.date && s.debut === me.debut) && !busy.some(b => toMin(s.debut) < b.end && b.start < toMin(s.fin)));
    };

    return html`<div class="screen">
      <header class="topbar home wk-top">
        <button type="button" class="icon-btn" data-click="prev" aria-label="${phone ? 'Jour précédent' : 'Semaine précédente'}">${icon.back}</button>
        <div class="wk-title">
          <span class="brand-title">${phone ? parse(shown[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : `Semaine du ${fmtShort(dates[0])} au ${fmtShort(dates[nDays - 1])}`}</span>
          <span class="sub">${model.schoolYear()} · Trimestre ${model.trimester()}</span>
        </div>
        <button type="button" class="icon-btn flip" data-click="next" aria-label="${phone ? 'Jour suivant' : 'Semaine suivante'}">${icon.back}</button>
        ${(phone ? shown[0] !== today : !isThisWeek) ? html`<button type="button" class="btn soft small" data-click="today">${phone ? 'Aujourd’hui' : 'Cette semaine'}</button>` : ''}
        <div class="spacer"></div>
        ${saveStatus()}
        ${live ? html`<button type="button" class="btn accent wk-livebtn" data-click="open" data-id="${live.c.id}"><span class="dot"></span><span class="hide-phone">En cours · </span><strong>${live.name}</strong>${icon.arrow}</button>` : ''}
        <button type="button" class="btn soft" data-click="add" aria-label="Ajouter un cours">${icon.plusBig}<span class="hide-narrow">Cours</span></button>
        <a class="btn soft" href="#/classes">${icon.tabTrombi}<span class="hide-narrow">Classes</span></a>
        <a class="btn soft" href="#/admin">${icon.sliders}<span class="hide-narrow">Administration</span></a>
      </header>
      ${phone ? html`<nav class="wk-days">${dates.map((d, i) => html`<button type="button" class="wk-day-tab${i === dayIdx ? ' on' : ''}${d === today ? ' today' : ''}" data-click="day" data-i="${i}">
        <span>${DAYS[i].slice(0, 3)}</span><strong>${parse(d).getDate()}</strong></button>`)}</nav>` : ''}
      <main class="content wk" data-scroll="week">
        <div class="wk-grid" style="--cols:${shown.length}">
          <div class="wk-corner"></div>
          ${shown.map(d => { const off = dayOff(d); return html`<div class="wk-dh${d === today ? ' today' : ''}${off.length ? ' holiday' : ''}">
            ${phone ? '' : html`<span class="wk-dname">${DAYS[dates.indexOf(d)]}</span><span class="wk-dnum">${parse(d).getDate()}</span>`}
            ${off.length ? html`<span class="wk-off">${off.join(' · ')}</span>` : ''}</div>`; })}
          <div class="wk-hours" style="height:${H}px">${Array.from({ length: Math.floor((to - from) / 60) + 1 }, (_, i) => html`<span style="top:${y(from + i * 60)}px">${pad(from / 60 + i)}h</span>`)}</div>
          ${shown.map(d => {
            const dayItems = lanes(items.filter(it => it.c.date === d));
            const off = dayOff(d).length;
            const showLunch = lunch && !off && !dayItems.some(it => !it.off && it.start < lunch.b && lunch.a < it.end);
            return html`<div class="wk-col${d === today ? ' today' : ''}${off ? ' holiday' : ''}" style="height:${H}px;--hour:${Math.round(60 * ppm)}px;--first:${y(from)}px">
              ${showLunch ? html`<div class="wk-lunch" style="top:${y(lunch.a) + 4}px;height:${y(lunch.b) - y(lunch.a) - 8}px">Pause méridienne</div>` : ''}
              ${dayItems.map(it => block(it, y(it.start) + 1, Math.max(22, y(it.end) - y(it.start) - 3), it.lane * 100 / it.lanes, 100 / it.lanes, it.lanes))}
              ${targets(d).map(s => html`<button type="button" class="wk-target" style="top:${y(toMin(s.debut)) + 1}px;height:${Math.max(26, y(toMin(s.fin)) - y(toMin(s.debut)) - 3)}px"
                data-click="moveTo" data-date="${d}" data-debut="${s.debut}" data-fin="${s.fin}">${icon.plus}${s.debut}</button>`)}
              ${d === today && t >= from && t <= to ? html`<div class="wk-now" style="top:${y(t)}px"></div>` : ''}
              ${!dayItems.length && !off && !mc ? html`<div class="wk-empty">Pas de cours</div>` : ''}
            </div>`;
          })}
        </div>
      </main>
      ${mc ? html`<div class="sel-bar move-bar"><span class="sel-text">Déplacer <strong>${nameOf(planning.eff(mc), db.get('classes', planning.classIdOf(mc)))}</strong> · touchez un créneau libre</span>
        <button type="button" class="toast-btn" data-click="cancelMove">Annuler</button></div>` : ''}
      ${sheet ? sheetView() : ''}
    </div>`;
  },

  mount(root, params) {
    if (!db.all('cours').length) { if (accueil.mount) accueil.mount(root, params); return; }
    // Faire défiler jusqu'à l'heure actuelle sur un petit écran.
    const now = root.querySelector('.wk-now');
    const main = root.querySelector('.wk');
    if (now && main && main.scrollTop === 0 && main.scrollHeight > main.clientHeight) main.scrollTop = Math.max(0, now.offsetTop - 120);
    if (!timer) timer = setInterval(() => { if ((location.hash || '#/') === '#/' && !document.hidden && !sheet && !moving) refresh(); }, 60 * 1000);
    // Redessiner seulement quand la LARGEUR change (tablette tournée). Sur Android, ouvrir une liste, un champ
    // date/heure ou le clavier réduit la HAUTEUR : redessiner à ce moment fermait la liste avant le choix.
    if (!onResize) {
      let w = window.innerWidth, t = null;
      const busy = () => sheet || document.querySelector('#layer > *') || (document.activeElement && document.activeElement.matches('input, select, textarea'));
      onResize = () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (Math.abs(window.innerWidth - w) < 50 || busy()) return;
          w = window.innerWidth;
          refresh();
        }, 250);
      };
      addEventListener('resize', onResize);
    }
  },

  leave() {
    sheet = null; moving = null;
    clearInterval(timer); timer = null;
    if (onResize) { removeEventListener('resize', onResize); onResize = null; }
  },

  actions: {
    ...accueil.actions,
    prev() {
      if (narrow()) { if (dayIdx > 0) dayIdx--; else { weekStart = addDays(weekStart, -7); dayIdx = 4; } }
      else weekStart = addDays(weekStart, -7);
      refresh();
    },
    next() {
      if (narrow()) { if (dayIdx < 4) dayIdx++; else { weekStart = addDays(weekStart, 7); dayIdx = 0; } }
      else weekStart = addDays(weekStart, 7);
      refresh();
    },
    today() { weekStart = mondayOf(todayISO()); dayIdx = null; refresh(); },
    day(el) { dayIdx = +el.dataset.i; refresh(); },
    open(el) {
      const c = db.get('cours', el.dataset.id);
      if (!c) return;
      const classId = planning.classIdOf(c);
      if (classId) { planning.openedFromPlanning(c); sheet = null; moving = null; go(`#/classe/${classId}/trombi`); }
    },

    // ----- Panneau d'un cours -----
    sheet(el) {
      if (moving) return;
      const c = db.get('cours', el.dataset.id);
      if (!c) return;
      sheet = { mode: 'view', id: c.id, note: c.note || '' };
      refresh();
    },
    closeSheet() { sheet = null; refresh(); },
    statut(el) {
      const c = db.get('cours', sheet.id);
      const k = el.dataset.k;
      if (planning.choixOf(planning.eff(c).statut) === k) return;
      const undo = planning.setStatut(c, k);
      refresh();
      toast({ text: `${nameOf(c, db.get('classes', planning.classIdOf(c)))} · ${planning.STATUT_CHOIX[k].choix}`, undo: async () => { await undo(); refresh(); } });
    },
    startMove() { moving = sheet.id; sheet = null; refresh(); },
    cancelMove() { moving = null; refresh(); },
    async moveTo(el) {
      const c = db.get('cours', moving);
      if (!c) { moving = null; refresh(); return; }
      const { date, debut, fin } = el.dataset;
      const done = await deplacer(c, { date, debut, fin });
      if (done) moving = null;
      refresh();
    },
    remettre() {
      const c = db.get('cours', sheet.id);
      const e = planning.eff(c);
      const undo = planning.remettre(c);
      refresh();
      toast({ text: `${nameOf(e, db.get('classes', planning.classIdOf(c)))} remis au ${fmtSlot(c.date, c.debut)}`, undo: async () => { await undo(); refresh(); } });
    },
    noteText(el) { sheet.note = el.value; },
    saveNote() {
      const c = db.get('cours', sheet.id);
      const undo = planning.setNote(c, sheet.note);
      refresh();
      toast({ text: sheet.note.trim() ? 'Note enregistrée' : 'Note effacée', undo: async () => { await undo(); if (sheet) sheet.note = (db.get('cours', sheet.id) || {}).note || ''; refresh(); } });
    },
    editForm() {
      const e = planning.eff(db.get('cours', sheet.id));
      sheet = { ...sheet, mode: 'edit', f: { date: e.date, debut: e.debut, fin: e.fin, salle: e.salle || '' } };
      refresh();
    },
    backView() { sheet.mode = 'view'; refresh(); },
    add() {
      moving = null;
      const d = narrow() ? addDays(weekStart, dayIdx || 0) : (mondayOf(todayISO()) === weekStart ? todayISO() : weekStart);
      sheet = { mode: 'add', f: { classId: '', etabId: '', date: d, debut: '08:00', fin: '09:00', salle: '', role: 'suivi', repeat: false } };
      refresh();
    },
    fClass(el) { sheet.f.classId = el.value; },
    fEtab(el) { sheet.f.etabId = el.value; },
    fRole(el) { sheet.f.role = el.value; },
    fRepeat(el) { sheet.f.repeat = el.checked; },
    fDate(el) { sheet.f.date = el.value; },
    fDebut(el) {
      // La fin suit le début (même durée) tant qu'on ne l'a pas changée.
      const f = sheet.f, dur = toMin(f.fin) - toMin(f.debut);
      f.debut = el.value;
      if (el.value && dur > 0) { const m = toMin(el.value) + dur; f.fin = pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); refresh(); }
    },
    fFin(el) { sheet.f.fin = el.value; },
    fSalle(el) { sheet.f.salle = el.value; },
    async saveEdit() {
      const f = sheet.f, c = db.get('cours', sheet.id);
      if (!f.date || !f.debut || !f.fin || f.fin <= f.debut) { toast({ text: 'Vérifiez la date et les heures (la fin doit suivre le début)' }); return; }
      const done = await deplacer(c, { date: f.date, debut: f.debut, fin: f.fin, salle: f.salle.trim() });
      if (!done) return;
      sheet = { mode: 'view', id: c.id, note: c.note || '' };
      if (f.date < weekStart || f.date > addDays(weekStart, 6)) { weekStart = mondayOf(f.date); dayIdx = null; }
      refresh();
    },
    async saveAdd() {
      const f = sheet.f;
      if (!f.classId) { toast({ text: 'Choisissez la classe' }); return; }
      if (!f.date || !f.debut || !f.fin || f.fin <= f.debut) { toast({ text: 'Vérifiez la date et les heures (la fin doit suivre le début)' }); return; }
      const placements = planning.datesAjout(f.date, f.repeat).map(date => ({ date, debut: f.debut, fin: f.fin }));
      if (!(await okMalgreChevauchement(placements))) return;
      const { undo, n } = planning.addCours({ classId: f.classId, etabId: f.etabId || null, date: f.date, debut: f.debut, fin: f.fin, salle: f.salle.trim(), role: f.role }, f.repeat);
      sheet = null;
      weekStart = mondayOf(f.date); dayIdx = null;
      refresh();
      toast({ text: n > 1 ? `${n} cours ajoutés (chaque semaine)` : 'Cours ajouté', undo: async () => { await undo(); refresh(); } });
    },
    resetPerso() {
      const c = db.get('cours', sheet.id);
      const undo = planning.resetPerso(c);
      refresh();
      toast({ text: 'Version Pronote rétablie', undo: async () => { await undo(); refresh(); } });
    },
    async delCours() {
      const c = db.get('cours', sheet.id);
      const n = planning.suivants(c).filter(x => x.source === 'manuel').length;
      const choice = await choiceDialog({
        title: 'Supprimer ce cours ajouté ?',
        choices: [
          { label: 'Ce cours seulement', value: 'one', style: 'soft' },
          ...(n ? [{ label: 'Ce cours et les semaines suivantes', sub: `${n + 1} cours`, value: 'all', style: 'soft' }] : []),
          { label: 'Annuler', value: null, style: 'soft' },
        ],
      });
      if (!choice) return;
      const undo = planning.deleteCours(c, choice === 'all');
      sheet = null;
      refresh();
      toast({ text: choice === 'all' ? `${n + 1} cours supprimés` : 'Cours supprimé', undo: async () => { await undo(); refresh(); } });
    },
  },
};
