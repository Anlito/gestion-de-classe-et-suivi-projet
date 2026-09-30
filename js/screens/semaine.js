// Accueil : planning de la semaine (cours importés de Pronote). Sans emploi du temps, l'accueil reste
// la liste des classes (screens/accueil.js). Tablette : la semaine entière ; téléphone : un jour à la fois.
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

// ---------- Dates ----------
const pad = n => String(n).padStart(2, '0');
const parse = iso => new Date(iso + 'T12:00:00');
const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return todayISO(d); };
const mondayOf = iso => { const d = parse(iso); return addDays(iso, -((d.getDay() + 6) % 7)); };
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const fmtShort = iso => parse(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const narrow = () => window.innerWidth < 700;

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
    return {
      c, e, cls, link, off, start: toMin(c.debut), end: Math.max(toMin(c.fin), toMin(c.debut) + 1),
      name: cls ? cls.name : c.classe || c.matiere,
      dim: role === 'grise' || link === 'ignored' || link === 'none',
      live: c.date === today && !off && now >= toMin(c.debut) && now < toMin(c.fin),
      badge: planning.statutLabel(c),
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

function block(it, top, height, left, width) {
  const cls = ['wk-c', it.dim ? 'dim' : '', it.off ? 'off' : '', it.live ? 'live' : '', it.link === 'todo' ? 'todo' : '', height < 44 ? 'tiny' : ''].filter(Boolean).join(' ');
  const clickable = it.link === 'ok' || it.link === 'todo';
  // Toucher le cours : ouvrir la classe. Bouton « ⋯ » : note, modifier, déplacer, annuler.
  return html`<div role="button" tabindex="0" class="${cls}" style="top:${top}px;height:${height}px;left:${left}%;width:${width}%;--etab:${it.e ? it.e.color : 'var(--ink2)'}"
    ${clickable ? html`data-click="open" data-id="${it.c.id}"` : html`data-click="sheet" data-id="${it.c.id}"`}
    aria-label="${it.name}, ${it.c.debut} à ${it.c.fin}${it.badge ? ', ' + it.badge : ''}${it.c.note ? ', note : ' + it.c.note : ''}">
    ${it.live ? html`<span class="wk-live">En cours</span>` : ''}
    <span class="wk-row1"><span class="wk-name">${it.name}${it.link === 'todo' ? ' ?' : ''}</span>${it.c.note && height < 72 ? html`<span class="wk-note-ic" title="${it.c.note}">${icon.list}</span>` : ''}${it.badge ? html`<span class="wk-badge">${it.badge}</span>` : ''}</span>
    <span class="wk-meta">${it.c.debut}–${it.c.fin}${it.c.salle ? ' · ' + it.c.salle : ''}${it.c.modifie ? ' · modifié' : ''}${it.c.source === 'manuel' ? ' · ajouté' : ''}</span>
    ${it.c.note && height >= 72 ? html`<span class="wk-note">${icon.list}<span>${it.c.note}</span></span>` : ''}
    <button type="button" class="wk-more" data-click="sheet" data-id="${it.c.id}" aria-label="Note, modifier ou annuler ce cours">⋯</button>
  </div>`;
}

// ---------- Fiche d'un cours (tiroir) : note, modifier / déplacer, annuler ; ajout d'un cours ----------
let sheet = null; // { mode: 'view'|'edit'|'add', id?, f: { classId, etabId, date, debut, fin, salle, role, repeat }, note }
const fmtLong = iso => parse(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function sheetView() {
  const c = sheet.id ? db.get('cours', sheet.id) : null;
  if (sheet.mode !== 'add' && !c) { sheet = null; return ''; }
  const e = c ? planning.eff(c) : null;
  const classId = c ? planning.classIdOf(c) : null;
  const cls = classId ? db.get('classes', classId) : null;
  const etab = e && e.etabId ? db.get('etablissements', e.etabId) : null;
  const title = sheet.mode === 'add' ? 'Ajouter un cours' : (cls ? cls.name : e.classe || e.matiere);
  let body;
  if (sheet.mode === 'view') {
    const serie = planning.suivants(c).length;
    body = html`
      <div class="stack-tight">
        <div class="strong">${fmtLong(e.date)} · ${e.debut}–${e.fin}</div>
        <div class="muted">${[e.salle && 'Salle ' + e.salle, etab && etab.initiales + ' · ' + etab.name, e.matiere].filter(Boolean).join(' · ')}</div>
        ${planning.statutLabel(e) ? html`<div><span class="chip warn">${planning.statutLabel(e)}</span></div>` : ''}
        ${e.modifie ? html`<div class="abs-info">Modifié par vous. Pronote : ${fmtLong(c.date)} · ${c.debut}–${c.fin}${c.salle ? ' · ' + c.salle : ''}
          <button type="button" class="link-btn" data-click="resetPerso">Revenir à la version Pronote</button></div>` : ''}
        ${c.source === 'manuel' ? html`<div class="muted small">Cours ajouté à la main${c.serieId ? ' (chaque semaine)' : ''}.</div>` : ''}
      </div>
      <div class="stack">
        <div class="caps">Note sur ce cours</div>
        <textarea class="field" rows="3" data-input="noteText" placeholder="Photo de classe, élection des délégués, sortie à préparer…">${sheet.note}</textarea>
        <div class="row-end"><button type="button" class="btn soft small" data-click="saveNote">Enregistrer la note</button></div>
        <div class="muted small">La note s’affiche sur le planning et en haut du trombinoscope quand vous ouvrez la classe depuis ce cours. Elle est conservée quand vous réimportez Pronote.</div>
      </div>
      <div class="btn-col">
        ${cls ? html`<button type="button" class="btn accent" data-click="open" data-id="${c.id}">Ouvrir la ${cls.name}</button>` : ''}
        <button type="button" class="btn soft" data-click="editForm">Modifier ou déplacer${serie ? '…' : ''}</button>
        ${e.statut === 'annule_perso'
          ? html`<button type="button" class="btn soft" data-click="annule" data-v="0">Rétablir ce cours</button>`
          : planning.OFF.has(e.statut) ? '' : html`<button type="button" class="btn danger-soft" data-click="annule" data-v="1">Annuler ce cours (cette fois)</button>`}
        ${c.source === 'manuel' ? html`<button type="button" class="btn danger-soft" data-click="delCours">Supprimer ce cours ajouté</button>` : ''}
      </div>`;
  } else {
    const f = sheet.f;
    const add = sheet.mode === 'add';
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
    <aside class="drawer" role="dialog" aria-modal="true">
      <div class="drawer-head"><span class="drawer-title grow ellipsis">${sheet.mode === 'edit' ? 'Modifier · ' : ''}${title}</span>
        ${sheet.mode === 'view' ? html`<button type="button" class="btn soft" data-click="closeSheet">Fermer</button>`
          : html`<button type="button" class="btn soft" data-click="${sheet.mode === 'edit' ? 'backView' : 'closeSheet'}">Annuler</button>
            <button type="button" class="btn accent" data-click="${sheet.mode === 'add' ? 'saveAdd' : 'saveEdit'}">Enregistrer</button>`}</div>
      <div class="drawer-body" data-scroll="sheet">${body}</div>
    </aside>`;
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

    // Plage horaire : celle des cours de la semaine, arrondie à l'heure (8 h – 17 h par défaut).
    const from = Math.floor(Math.min(8 * 60, ...items.map(i => i.start)) / 60) * 60;
    const to = Math.ceil(Math.max(17 * 60, ...items.map(i => i.end)) / 60) * 60;
    // Hauteur : la journée tient dans l'écran de la tablette, sans descendre sous 0,9 px par minute.
    // Hauteur de référence : la plus grande vue pour cette largeur (le clavier ou une liste ouverte la réduisent un instant).
    if (screenW !== window.innerWidth) { screenW = window.innerWidth; screenH = 0; }
    screenH = Math.max(screenH, window.innerHeight);
    const avail = screenH - 64 - 56 - 40;
    const ppm = Math.max(phone ? 1.1 : 0.9, avail / (to - from));
    const H = Math.round((to - from) * ppm);
    const y = m => Math.round((m - from) * ppm);

    const isThisWeek = mondayOf(today) === weekStart;
    const etabs = planning.etablissements();
    const t = nowMin();

    return html`<div class="screen">
      <header class="topbar home wk-top">
        <button type="button" class="icon-btn" data-click="prev" aria-label="${phone ? 'Jour précédent' : 'Semaine précédente'}">${icon.back}</button>
        <div class="wk-title">
          <span class="brand-title">${phone ? parse(shown[0]).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : `Semaine du ${fmtShort(dates[0])} au ${fmtShort(dates[nDays - 1])}`}</span>
          <span class="sub">${model.schoolYear()} · Trimestre ${model.trimester()}</span>
        </div>
        <button type="button" class="icon-btn flip" data-click="next" aria-label="${phone ? 'Jour suivant' : 'Semaine suivante'}">${icon.back}</button>
        ${(phone ? shown[0] !== today : !isThisWeek) ? html`<button type="button" class="btn soft small" data-click="today">Aujourd’hui</button>` : ''}
        <div class="spacer"></div>
        ${saveStatus()}
        <button type="button" class="btn soft" data-click="add" aria-label="Ajouter un cours">${icon.plusBig}<span class="hide-narrow">Cours</span></button>
        <a class="btn soft" href="#/classes">${icon.tabTrombi}<span class="hide-narrow">Classes</span></a>
        <a class="btn accent" href="#/admin">${icon.sliders}<span class="hide-narrow">Administration</span></a>
      </header>
      ${phone ? html`<nav class="wk-days">${dates.map((d, i) => html`<button type="button" class="wk-day-tab${i === dayIdx ? ' on' : ''}${d === today ? ' today' : ''}" data-click="day" data-i="${i}">
        <span>${DAYS[i].slice(0, 3)}</span><strong>${parse(d).getDate()}</strong></button>`)}</nav>` : ''}
      <main class="content wk" data-scroll="week">
        <div class="wk-grid" style="--cols:${shown.length}">
          <div class="wk-corner"></div>
          ${shown.map(d => { const off = dayOff(d); return html`<div class="wk-dh${d === today ? ' today' : ''}${off.length ? ' holiday' : ''}">
            ${phone ? '' : html`<span class="wk-dname">${DAYS[dates.indexOf(d)]}</span> <span class="wk-dnum">${parse(d).getDate()}</span>`}
            ${off.length ? html`<span class="wk-off">${off.join(' · ')}</span>` : ''}</div>`; })}
          <div class="wk-hours" style="height:${H}px">${Array.from({ length: (to - from) / 60 + 1 }, (_, i) => html`<span style="top:${y(from + i * 60)}px">${pad(from / 60 + i)}h</span>`)}</div>
          ${shown.map(d => {
            const dayItems = lanes(items.filter(it => it.c.date === d));
            const off = dayOff(d).length;
            return html`<div class="wk-col${d === today ? ' today' : ''}${off ? ' holiday' : ''}" style="height:${H}px;--hour:${Math.round(60 * ppm)}px;--first:${y(from)}px">
              ${dayItems.map(it => block(it, y(it.start), Math.max(22, y(it.end) - y(it.start) - 2), it.lane * 100 / it.lanes, 100 / it.lanes))}
              ${d === today && t >= from && t <= to ? html`<div class="wk-now" style="top:${y(t)}px"></div>` : ''}
              ${!dayItems.length && !off ? html`<div class="wk-empty">Pas de cours</div>` : ''}
            </div>`;
          })}
        </div>
        ${etabs.length > 1 ? html`<div class="wk-legend">${etabs.map(e => html`<span><i style="background:${e.color}"></i>${e.initiales} · ${e.name}</span>`)}</div>` : ''}
      </main>
      ${sheet ? sheetView() : ''}
    </div>`;
  },

  mount(root, params) {
    if (!db.all('cours').length) { if (accueil.mount) accueil.mount(root, params); return; }
    // Faire défiler jusqu'à l'heure actuelle sur un petit écran.
    const now = root.querySelector('.wk-now');
    const main = root.querySelector('.wk');
    if (now && main && main.scrollTop === 0 && main.scrollHeight > main.clientHeight) main.scrollTop = Math.max(0, now.offsetTop - 120);
    if (!timer) timer = setInterval(() => { if ((location.hash || '#/') === '#/' && !document.hidden && !sheet) refresh(); }, 60 * 1000);
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
    sheet = null;
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
      if (classId) { planning.openedFromPlanning(c); sheet = null; go(`#/classe/${classId}/trombi`); return; }
      toast({ text: `« ${c.classe} » n’est reliée à aucune classe de l’app : choisissez-la dans Emploi du temps → Classes`, ms: 5000 });
      go('#/admin/planning');
    },
    // ----- Fiche d'un cours -----
    sheet(el) {
      const c = db.get('cours', el.dataset.id);
      if (!c) return;
      sheet = { mode: 'view', id: c.id, note: c.note || '' };
      refresh();
    },
    closeSheet() { sheet = null; refresh(); },
    noteText(el) { sheet.note = el.value; },
    saveNote() {
      const c = db.get('cours', sheet.id);
      const undo = planning.setNote(c, sheet.note);
      refresh();
      toast({ text: sheet.note.trim() ? 'Note enregistrée' : 'Note effacée', undo: async () => { await undo(); sheet && (sheet.note = (db.get('cours', sheet.id) || {}).note || ''); refresh(); } });
    },
    editForm() {
      const e = planning.eff(db.get('cours', sheet.id));
      sheet = { ...sheet, mode: 'edit', f: { date: e.date, debut: e.debut, fin: e.fin, salle: e.salle || '' } };
      refresh();
    },
    backView() { sheet.mode = 'view'; refresh(); },
    add() {
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
      const n = planning.suivants(c).length;
      let serie = false;
      if (n) {
        const e = planning.eff(c);
        const choice = await choiceDialog({
          title: 'Appliquer la modification à…',
          text: `D’autres cours de cette classe ont lieu le ${DAYS[(parse(e.date).getDay() + 6) % 7].toLowerCase()} à ${e.debut} jusqu’à la fin de l’année. Les cours passés ne changent pas.`,
          choices: [
            { label: 'Cette fois seulement', value: 'one', style: 'soft' },
            { label: `Ce cours et toutes les semaines suivantes`, sub: `${n + 1} cours jusqu’à la fin de l’année`, value: 'all', style: 'soft' },
            { label: 'Annuler', value: null, style: 'soft' },
          ],
        });
        if (!choice) return;
        serie = choice === 'all';
      }
      const undo = planning.editCours(c, { date: f.date, debut: f.debut, fin: f.fin, salle: f.salle.trim() }, serie);
      sheet = { mode: 'view', id: c.id, note: c.note || '' };
      if (f.date < weekStart || f.date > addDays(weekStart, 6)) { weekStart = mondayOf(f.date); dayIdx = null; }
      refresh();
      toast({ text: serie ? `${n + 1} cours modifiés` : 'Cours modifié', undo: async () => { await undo(); refresh(); } });
    },
    saveAdd() {
      const f = sheet.f;
      if (!f.classId) { toast({ text: 'Choisissez la classe' }); return; }
      if (!f.date || !f.debut || !f.fin || f.fin <= f.debut) { toast({ text: 'Vérifiez la date et les heures (la fin doit suivre le début)' }); return; }
      const { undo, n } = planning.addCours({ classId: f.classId, etabId: f.etabId || null, date: f.date, debut: f.debut, fin: f.fin, salle: f.salle.trim(), role: f.role }, f.repeat);
      sheet = null;
      weekStart = mondayOf(f.date); dayIdx = null;
      refresh();
      toast({ text: n > 1 ? `${n} cours ajoutés (chaque semaine)` : 'Cours ajouté', undo: async () => { await undo(); refresh(); } });
    },
    annule(el) {
      const c = db.get('cours', sheet.id);
      const undo = planning.setAnnule(c, el.dataset.v === '1');
      refresh();
      toast({ text: el.dataset.v === '1' ? 'Cours annulé' : 'Cours rétabli', undo: async () => { await undo(); refresh(); } });
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
