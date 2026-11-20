// Onglet Bulletins : grille des constats par élève (critères à 3 niveaux, note, tendance, remarque, présence),
// triée par groupe du projet choisi ou par ordre alphabétique. Fiche détaillée d'un élève dans un panneau latéral.
import * as db from '../db.js';
import * as model from '../model.js';
import * as B from '../bulletins.js';
import { html, toast, openMenu } from '../ui.js';
import { backLink, tabBar, projectSwitch, saveStatus } from '../components.js';
import { go, refresh } from '../nav.js';

const trimOf = {};            // trimestre affiché, par classe (par défaut : le trimestre en cours)
let openSid = null;           // élève dont la fiche est ouverte
let onlyTodo = false;
let sortMode = (() => { try { return localStorage.getItem('carnet-bulletins-tri') || 'group'; } catch (e) { return 'group'; } })();
const pending = new Map();
let timer = null;
function flush() { clearTimeout(timer); for (const fn of pending.values()) fn(); pending.clear(); }
function later(key, fn) { pending.set(key, fn); clearTimeout(timer); timer = setTimeout(flush, 600); }
addEventListener('pagehide', flush);

const trimester = classId => trimOf[classId] || model.trimester();
const f1 = model.f1;

// Lignes du tableau : par groupe (projet choisi), élèves sans groupe à la fin ; ou par ordre alphabétique.
function sections(classId, students, a) {
  if (sortMode !== 'group' || !a) return [{ title: null, students }];
  const out = [], placed = new Set();
  for (const g of model.groupsOf(a.id)) {
    const m = students.filter(s => g.members.includes(s.id));
    m.forEach(s => placed.add(s.id));
    if (m.length) out.push({ title: 'Groupe ' + g.code, students: m });
  }
  const rest = students.filter(s => !placed.has(s.id));
  if (rest.length) out.push({ title: out.length ? 'Sans groupe' : null, students: rest });
  return out;
}

function cell(s, rec, f, t) {
  const v = rec.levels[f.k], n = (rec.details[f.k] || []).length;
  return html`<td><button type="button" class="bul-cell${v ? ' bl-' + v : ''}" data-click="cycle" data-sid="${s.id}" data-k="${f.k}"
    aria-label="${s.prenom}, ${f.label} : ${v ? B.LEVEL_LABEL[v] : 'non renseigné'}">${v ? B.LEVEL_SYMBOL[v] : '+'}${n ? html`<span class="bul-dot" aria-hidden="true"></span>` : ''}</button></td>`;
}
function row(s, t) {
  const rec = B.recordOf(s, t), st = B.stateOf(rec);
  const name = html`<td class="bul-name"><button type="button" class="bul-namebtn" data-click="open" data-sid="${s.id}">
    <span class="grow ellipsis"><strong>${s.prenom}</strong> <span class="muted">${s.nom || ''}</span></span>
    ${rec.presence === 'partielle' ? html`<span class="chip warn">Présence partielle</span>` : ''}</button></td>`;
  if (rec.presence === 'dispense') {
    return html`<tr class="bul-disp">${name}<td colspan="${B.FAMILIES.length + 3}" class="muted small bul-disp-txt">Dispensé ce trimestre · non évalué</td>
      <td><span class="bul-badge b-disp">${B.STATE_LABEL.disp}</span></td></tr>`;
  }
  const note = B.noteOf(s, rec, t);
  return html`<tr>${name}${B.FAMILIES.map(f => cell(s, rec, f, t))}
    <td class="bul-note"><strong>${f1(note.n)}</strong><span class="bul-auto">${note.n == null ? '' : note.manual ? 'corrigée' : 'auto'}</span></td>
    <td class="small">${rec.tendance || '—'}</td>
    <td>${rec.info && rec.info.trim() ? html`<span class="bul-info" title="${rec.info}">✎</span>` : html`<span class="muted">—</span>`}</td>
    <td><span class="bul-badge b-${st}">${B.STATE_LABEL[st]}</span></td></tr>`;
}

function drawer(classId, s, t, mates) {
  const rec = B.recordOf(s, t), note = B.noteOf(s, rec, t), auto = B.autoNote(s, t), h = B.hintsOf(s, t);
  const facts = [
    h.neg ? h.neg + ' remarque' + (h.neg > 1 ? 's' : '') + ' Comportement' + (h.negMotifs.length ? ' (' + h.negMotifs.join(', ') + ')' : '') : '',
    h.pos ? h.pos + ' remarque' + (h.pos > 1 ? 's' : '') + ' Aide' + (h.posMotifs.length ? ' (' + h.posMotifs.join(', ') + ')' : '') : '',
    h.absences + ' absence' + (h.absences > 1 ? 's' : ''), h.retards + ' retard' + (h.retards > 1 ? 's' : ''),
  ].filter(Boolean);
  const disp = rec.presence === 'dispense';
  return html`<div class="scrim dim" data-click="close"></div>
    <aside class="drawer bul-drawer" aria-label="Fiche de ${s.prenom}">
      <div class="drawer-head"><span class="drawer-title grow ellipsis">${model.fullName(s)} · T${t}</span>
        <button type="button" class="btn accent" data-click="close">Terminé</button></div>
      <div class="drawer-body" data-scroll="bul-drawer">
        <div class="chips-row bul-mates">${mates.map(m => html`<button type="button" class="pill${m.id === s.id ? ' on' : ''}" data-click="open" data-sid="${m.id}">${m.prenom}</button>`)}</div>
        <div class="bul-block"><span class="caps">Présence en cours ce trimestre</span>
          <div class="segmented">${Object.entries(B.PRESENCE).map(([k, label]) => html`<button type="button" class="seg${rec.presence === k ? ' on' : ''}" data-click="presence" data-v="${k}">${label}</button>`)}</div>
          <span class="muted small">${rec.presence === 'partielle' ? 'Emploi du temps aménagé, absent certains cours… Remplissez seulement les critères que vous avez pu observer.'
            : disp ? 'Non évalué ce trimestre : aucune case à remplir.' : 'Suit le cours normalement.'}</span></div>
        ${disp ? '' : html`
        <div class="bul-hint"><strong>Ce que le Carnet a noté ce trimestre</strong><span>${facts.join(' · ')}</span>
          <span class="muted small">Pour vous aider : rien n’est coché à votre place.</span></div>
        ${B.FAMILIES.map(f => html`<div class="bul-fam">
          <div class="bul-fam-head"><strong class="grow">${f.label}</strong>
            <div class="bul-lv">${B.LEVELS.map(v => html`<button type="button" class="bl-${v}${rec.levels[f.k] === v ? ' on' : ''}" data-click="level" data-k="${f.k}" data-v="${v}">${B.LEVEL_SYMBOL[v]} ${B.LEVEL_LABEL[v]}</button>`)}</div></div>
          <div class="bul-desc">${[...f.pos, ...f.neg].map(d => html`<button type="button" class="${(rec.details[f.k] || []).includes(d) ? 'on' : ''}" data-click="detail" data-k="${f.k}" data-d="${d}">${d}</button>`)}</div>
        </div>`)}
        <div class="bul-block"><span class="caps">Note du trimestre /20</span>
          <div class="bul-noterow"><input class="input bul-notein" inputmode="decimal" data-change="note" value="${note.n == null ? '' : f1(note.n)}" aria-label="Note du trimestre sur 20" placeholder="—">
            <span class="muted small grow">${note.manual ? html`Corrigée à la main. <button type="button" class="linkbtn" data-click="resetNote">Revenir à ${auto.n == null ? 'la note calculée' : f1(auto.n)}</button>`
              : auto.projects.length ? 'Moyenne de l’onglet Notes : ' + auto.projects.map(p => p.title + ' ' + f1(p.n)).join(' · ')
              : 'Aucun projet noté ce trimestre dans l’onglet Notes.'}</span></div></div>
        <div class="bul-block"><span class="caps">Tendance</span>
          <div class="segmented">${B.TENDANCES.map(v => html`<button type="button" class="seg${rec.tendance === v ? ' on' : ''}" data-click="tendance" data-v="${v}">${v}</button>`)}</div></div>
        `}
        <label class="bul-block"><span class="caps">Remarque personnelle (facultatif)</span>
          <textarea class="input" rows="3" maxlength="1000" data-input="info" placeholder="Ex. : a présenté le projet à l’oral, a beaucoup progressé en modélisation 3D…">${rec.info}</textarea>
          <span class="muted small">Elle servira à l’appréciation. N’y mettez ni nom, ni information médicale ou familiale.</span></label>
      </div>
    </aside>`;
}

export default {
  render({ classId }) {
    const c = db.get('classes', classId);
    if (!c) { go('#/', { replace: true }); return null; }
    const t = trimester(classId);
    const students = model.studentsOf(classId);
    const list = model.selectableAssignments(classId, ['cours', 'avenir', 'fini']);
    const a = model.chosenAssignment(classId);
    const p = a && db.get('projects', a.projectId);
    const secs = sections(classId, students, a);
    const recs = students.map(s => B.recordOf(s, t));
    const disp = recs.filter(r => r.presence === 'dispense').length, ready = recs.filter(r => B.stateOf(r) === 'ok').length, total = students.length - disp;
    const shown = s => !onlyTodo || !['ok', 'disp'].includes(B.stateOf(B.recordOf(s, t)));
    const cols = B.FAMILIES.length + 5;
    const open = openSid && students.find(s => s.id === openSid);
    if (openSid && !open) openSid = null;
    const mates = open ? (secs.find(x => x.students.includes(open)) || { students }).students : [];

    return html`<div class="screen">
      <header class="topbar">
        ${backLink('#/', 'Accueil')}
        <div class="heading"><span class="title">${c.name}</span><span class="sub">Bulletins · Trimestre ${t}</span></div>
        <div class="spacer"></div>
        <div class="segmented head-seg" role="group" aria-label="Trimestre">${[1, 2, 3].map(n => html`<button type="button" class="seg${n === t ? ' on' : ''}" data-click="trim" data-t="${n}">T${n}</button>`)}</div>
      </header>
      <div class="bul-bar">
        <div class="segmented" role="group" aria-label="Ordre des élèves">
          <button type="button" class="seg${sortMode === 'group' ? ' on' : ''}" data-click="sort" data-v="group">Par groupe</button>
          <button type="button" class="seg${sortMode === 'alpha' ? ' on' : ''}" data-click="sort" data-v="alpha">A → Z</button></div>
        ${sortMode === 'group' && list.length > 1 ? projectSwitch(list, a) : sortMode === 'group' && p ? html`<span class="muted small">${p.title}</span>` : ''}
        <label class="bul-check"><input type="checkbox" data-change="todo" ${onlyTodo ? 'checked' : ''}> À compléter seulement</label>
        <span class="spacer"></span>
        <span class="bul-legend">${B.LEVELS.map(v => html`<span><i class="bul-sw bl-${v}"></i>${B.LEVEL_LABEL[v]}</span>`)}</span>
        <span class="bul-prog"><span>${ready} / ${total} prêt${ready > 1 ? 's' : ''}${disp ? ' · ' + disp + ' dispensé' + (disp > 1 ? 's' : '') : ''}</span>
          <span class="bul-track"><i style="width:${total ? Math.round(ready / total * 100) : 0}%"></i></span></span>
      </div>
      <main class="content bul-content" data-scroll="bulletins">
        ${students.length ? html`<table class="bul-grid">
          <thead><tr><th class="bul-name">Élève</th>${B.FAMILIES.map(f => html`<th>${f.label}</th>`)}<th>Note /20</th><th>Tendance</th><th>Remarque</th><th>État</th></tr></thead>
          <tbody>${secs.map(sec => {
            const rows = sec.students.filter(shown);
            if (!rows.length) return '';
            return html`${sec.title ? html`<tr class="bul-grp"><td colspan="${cols}"><div class="bul-grp-in">
                <strong>${sec.title}</strong><span class="muted small">${sec.students.map(s => s.prenom).join(', ')}</span>
                <span class="bul-mini">Travail en équipe pour tout le groupe :${B.LEVELS.map(v => html`<button type="button" class="bl-${v}" data-click="groupLevel" data-ids="${sec.students.map(s => s.id).join(',')}" data-v="${v}" aria-label="${B.LEVEL_LABEL[v]} pour tout le ${sec.title}">${B.LEVEL_SYMBOL[v]}</button>`)}</span>
              </div></td></tr>` : ''}${rows.map(s => row(s, t))}`;
          })}${onlyTodo && !students.some(shown) ? html`<tr><td colspan="${cols}" class="bul-empty">Tous les élèves sont prêts pour ce trimestre.</td></tr>` : ''}</tbody>
        </table>` : html`<div class="center-msg"><div class="soon"><div class="soon-title">Aucun élève</div><p>Ajoutez les élèves depuis la fiche de la classe.</p></div></div>`}
      </main>
      ${tabBar(classId, 'bulletins')}
      ${open ? drawer(classId, open, t, mates) : ''}
    </div>`;
  },
  leave() { flush(); openSid = null; },
  actions: {
    trim(el, e, { classId }) { flush(); trimOf[classId] = Number(el.dataset.t); refresh(); },
    sort(el) { sortMode = el.dataset.v; try { localStorage.setItem('carnet-bulletins-tri', sortMode); } catch (e) { /* stockage indisponible */ } refresh(); },
    todo(el) { onlyTodo = el.checked; refresh(); },
    pickAssign(el, e, { classId }) { model.chooseAssignment(classId, el.dataset.id); refresh(); },
    pickAssignMenu(el, e, { classId }) {
      const cur = model.chosenAssignment(classId);
      openMenu({ anchor: el, width: 360, align: 'right',
        items: model.selectableAssignments(classId, ['cours', 'avenir', 'fini']).map(a => ({
          label: db.get('projects', a.projectId).title, sub: model.STATUS[a.status], selected: cur && a.id === cur.id,
          onPick: () => { model.chooseAssignment(classId, a.id); refresh(); } })) });
    },
    cycle(el, e, { classId }) { B.cycleLevel(db.get('students', el.dataset.sid), trimester(classId), el.dataset.k); refresh(); },
    groupLevel(el, e, { classId }) {
      const ss = el.dataset.ids.split(',').map(id => db.get('students', id)).filter(Boolean);
      const undo = B.setLevelForAll(ss, trimester(classId), 'equipe', el.dataset.v);
      refresh();
      toast({ text: 'Travail en équipe : ' + B.LEVEL_LABEL[el.dataset.v] + ' pour ' + ss.length + ' élève' + (ss.length > 1 ? 's' : ''), undo: async () => { await undo(); refresh(); } });
    },
    open(el) { flush(); openSid = el.dataset.sid; refresh(); },
    close() { flush(); openSid = null; refresh(); },
    presence(el, e, { classId }) { B.setPresence(db.get('students', openSid), trimester(classId), el.dataset.v); refresh(); },
    level(el, e, { classId }) {
      const s = db.get('students', openSid), t = trimester(classId), v = el.dataset.v;
      B.setLevel(s, t, el.dataset.k, B.recordOf(s, t).levels[el.dataset.k] === v ? null : v); refresh();
    },
    detail(el, e, { classId }) { B.toggleDetail(db.get('students', openSid), trimester(classId), el.dataset.k, el.dataset.d); refresh(); },
    tendance(el, e, { classId }) { B.setTendance(db.get('students', openSid), trimester(classId), el.dataset.v); refresh(); },
    note(el, e, { classId }) {
      const s = db.get('students', openSid), t = trimester(classId);
      const auto = B.autoNote(s, t).n, v = el.value.trim();
      try {
        // Saisir la note calculée (ou vider le champ) revient à la note automatique.
        const n = B.validNote(v);
        B.setNote(s, t, n == null || n === auto ? '' : n);
      } catch (err) { toast({ text: err.message }); }
      refresh();
    },
    resetNote(el, e, { classId }) { B.setNote(db.get('students', openSid), trimester(classId), ''); refresh(); },
    info(el, e, { classId }) {
      const s = db.get('students', openSid), t = trimester(classId), v = el.value;
      later('i' + s.id + t, () => B.setInfo(s, t, v));
    },
  },
};
