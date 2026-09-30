// Accueil : planning de la semaine (cours importés de Pronote). Sans emploi du temps, l'accueil reste
// la liste des classes (screens/accueil.js). Tablette : la semaine entière ; téléphone : un jour à la fois.
import * as db from '../db.js';
import * as model from '../model.js';
import * as planning from '../planning.js';
import { normClasse } from '../ical.js';
import { html, toast, todayISO } from '../ui.js';
import { icon, saveStatus } from '../components.js';
import { go, refresh } from '../nav.js';
import accueil from './accueil.js';

let weekStart = null;   // lundi affiché (AAAA-MM-JJ)
let dayIdx = null;      // jour affiché sur téléphone (0 = lundi)
let timer = null, onResize = null;

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

// Statuts qui annulent le cours (barré) ; ceux qui n'ont qu'une étiquette.
const OFF = new Set(['annule', 'classe_absente', 'abs_perso']);

// Cours de la semaine prêts à afficher.
function weekCours(mon) {
  const end = addDays(mon, 6);
  const etabs = Object.fromEntries(db.all('etablissements').map(e => [e.id, e]));
  const today = todayISO(), now = nowMin();
  return db.where('cours', c => c.date >= mon && c.date <= end)
    .filter(c => planning.roleOf(c.matiere) !== 'masque')
    .map(c => {
      const e = etabs[c.etabId];
      const entry = e && e.classes ? e.classes[normClasse(c.classe)] : null;
      const classId = planning.classIdOf(c);
      const cls = classId ? db.get('classes', classId) : null;
      const link = !c.classe ? 'none' : classId ? 'ok' : entry && entry.classId === '' ? 'ignored' : 'todo';
      const off = OFF.has(c.statut);
      const role = planning.roleOf(c.matiere);
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
  return html`<button type="button" class="${cls}" style="top:${top}px;height:${height}px;left:${left}%;width:${width}%;--etab:${it.e ? it.e.color : 'var(--ink2)'}"
    ${clickable ? html`data-click="open" data-id="${it.c.id}"` : html`data-click="info" data-id="${it.c.id}"`}
    aria-label="${it.name}, ${it.c.debut} à ${it.c.fin}${it.badge ? ', ' + it.badge : ''}">
    ${it.live ? html`<span class="wk-live">En cours</span>` : ''}
    <span class="wk-row1"><span class="wk-name">${it.name}${it.link === 'todo' ? ' ?' : ''}</span>${it.badge ? html`<span class="wk-badge">${it.badge}</span>` : ''}</span>
    <span class="wk-meta">${it.c.debut}–${it.c.fin}${it.c.salle ? ' · ' + it.c.salle : ''}</span>
  </button>`;
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
    const avail = window.innerHeight - 64 - 56 - 40;
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
    </div>`;
  },

  mount(root, params) {
    if (!db.all('cours').length) { if (accueil.mount) accueil.mount(root, params); return; }
    // Faire défiler jusqu'à l'heure actuelle sur un petit écran.
    const now = root.querySelector('.wk-now');
    const main = root.querySelector('.wk');
    if (now && main && main.scrollTop === 0 && main.scrollHeight > main.clientHeight) main.scrollTop = Math.max(0, now.offsetTop - 120);
    if (!timer) timer = setInterval(() => { if ((location.hash || '#/') === '#/' && !document.hidden) refresh(); }, 60 * 1000);
    if (!onResize) {
      let wasNarrow = narrow(), h = window.innerHeight, t = null;
      onResize = () => { clearTimeout(t); t = setTimeout(() => { if (narrow() !== wasNarrow || Math.abs(window.innerHeight - h) > 40) { wasNarrow = narrow(); h = window.innerHeight; refresh(); } }, 200); };
      addEventListener('resize', onResize);
    }
  },

  leave() {
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
      if (classId) { go(`#/classe/${classId}/trombi`); return; }
      toast({ text: `« ${c.classe} » n’est reliée à aucune classe de l’app : choisissez-la dans Emploi du temps → Classes`, ms: 5000 });
      go('#/admin/planning');
    },
    info(el) {
      const c = db.get('cours', el.dataset.id);
      if (!c) return;
      toast({ text: c.classe ? `« ${c.classe} » est ignorée (Emploi du temps → Classes pour la relier)` : `${c.matiere} : pas de classe` });
    },
  },
};
