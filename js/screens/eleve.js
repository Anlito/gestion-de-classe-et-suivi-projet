// Détail élève : compteurs corrigeables, absences et retards, besoins particuliers, comparaison par trimestre, historique, notes libres.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, fmtDay, fmtDayYear } from '../ui.js';
import { icon, backLink, tabBar, photo } from '../components.js';
import { go, refresh } from '../nav.js';

// État de l'écran (filtres, note en cours de modification), remis à zéro quand on change d'élève.
let st = { sid: null, period: null, filter: 'all', newNote: '', editing: null, draft: '' };

// Texte « Aménagements » : enregistré peu après la frappe (sans redessiner l'écran).
let amenTimer = null, amenPending = null;
function flushAmen() {
  clearTimeout(amenTimer);
  if (amenPending) { const { sid, text } = amenPending; amenPending = null; if (db.get('students', sid)) model.setAmenagements(sid, text); }
}
addEventListener('pagehide', flushAmen);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushAmen(); });

export default {
  render({ classId, studentId }) {
    const c = db.get('classes', classId);
    const s = db.get('students', studentId);
    if (!c || !s) { go(c ? `#/classe/${classId}/trombi` : '#/', { replace: true }); return null; }
    const t = model.trimester();
    if (st.sid !== studentId) st = { sid: studentId, period: t, filter: 'all', newNote: '', editing: null, draft: '' };

    const cur = model.countsOf(s.id, t);
    const byT = [1, 2, 3].map(k => model.countsOf(s.id, k));
    const max = Math.max(8, ...byT.flatMap(x => [x.neg, x.pos]));
    const gi = model.studentGroupInfo(s);
    const obs = ['abs', 'ret'].includes(st.filter) ? [] : model.observationsOf(s.id).filter(o => o.trimester === st.period && (st.filter === 'all' || o.type === st.filter));
    const abs = st.filter === 'all' || st.filter === 'abs' ? model.absencesOf(s.id).filter(a => a.trimester === st.period) : [];
    const ret = st.filter === 'all' || st.filter === 'ret' ? model.retardsOf(s.id).filter(r => r.trimester === st.period) : [];
    // Historique : observations, absences et retards mêlés, du plus récent au plus ancien.
    const rowsList = [...obs.map(o => ({ kind: 'obs', key: o.at, o })), ...abs.map(a => ({ kind: 'abs', key: a.date + 'T' + a.at.slice(11), a })),
      ...ret.map(r => ({ kind: 'ret', key: r.date + 'T' + r.at.slice(11), r }))]
      .sort((x, y) => y.key.localeCompare(x.key));
    const presence = model.presenceOf(s);
    const absentNow = presence === 'absent', lateNow = presence === 'retard';
    const ap = model.currentAppel(s.classId);
    const absLabel = ap && ap.seanceN ? 'Absent à la séance ' + ap.seanceN : 'Absent à l’appel du jour';
    const nRet = model.retardCount(s.id, t);
    const besoins = model.besoinsOf(s);
    const notes = model.notesOf(s.id);
    const seg = on => (on ? ' on' : '');

    return html`<div class="screen">
      <header class="topbar">
        ${backLink(`#/classe/${classId}/trombi`, c.name)}
        <div class="heading"><span class="title">${s.prenom} <span class="upper">${s.nom}</span></span>
          <span class="sub">${c.name} · Trimestre ${t} en cours</span></div>
        <div class="spacer"></div>
        <a class="btn soft" href="#/imprimer/eleve/${s.id}">${icon.download}<span class="hide-narrow">Fiche PDF</span></a>
      </header>
      <main class="content detail" data-scroll="detail">
        <section class="panel profile">
          <div class="profile-top">
            ${photo(s, { cls: 'big' })}
            <div class="profile-group">
              <div class="muted">Groupe projet</div>
              <div class="strong">${gi ? (gi.code ? gi.code + ' · ' + gi.project : 'Sans groupe · ' + gi.project) : 'Aucun projet en cours'}</div>
            </div>
          </div>
          <div class="stack">
            <div class="caps">Trimestre ${t}</div>
            <div class="counters">
              ${['neg', 'pos'].map(type => html`<div class="counter ${type}">
                <div class="counter-n">${cur[type]}</div>
                <div class="counter-label">${type === 'neg' ? 'Comportement' : 'Aide / soutien'}</div>
                <div class="counter-btns">
                  <button type="button" class="counter-btn" data-click="minus" data-type="${type}" aria-label="Retirer 1">−</button>
                  <button type="button" class="counter-btn" data-click="plus" data-type="${type}" aria-label="Ajouter 1">+</button>
                </div>
              </div>`)}
            </div>
          </div>
          <div class="abs-block">
            <div class="grow"><div class="abs-n">${model.absenceCount(s.id, t)} <span class="abs-label">absence${model.absenceCount(s.id, t) > 1 ? 's' : ''} ce trimestre</span></div>
              <div class="muted small">${model.absenceCount(s.id)} sur l’année</div></div>
            ${ap ? html`<button type="button" class="btn ${absentNow ? 'accent' : 'soft'} small" data-click="toggleAbs">${absentNow ? '✓ ' + absLabel : absLabel}</button>`
              : html`<span class="muted small abs-hint">Appel à faire depuis le trombinoscope</span>`}
          </div>
          <div class="abs-block">
            <div class="grow"><div class="abs-n">${nRet} <span class="abs-label">retard${nRet > 1 ? 's' : ''} ce trimestre</span></div>
              <div class="muted small">${model.retardCount(s.id)} sur l’année</div></div>
            <button type="button" class="btn ${lateNow ? 'accent' : 'soft'} small" data-click="toggleRetard">${lateNow ? '✓ En retard aujourd’hui' : 'Arrivé en retard'}</button>
          </div>
          <div class="stack">
            <div class="caps">Besoins particuliers</div>
            <div class="chips-row">${model.BESOINS.map(b => html`<button type="button" class="pill small-pill${besoins.includes(b.key) ? ' on' : ''}"
              data-click="besoin" data-k="${b.key}" title="${b.label}" aria-pressed="${besoins.includes(b.key) ? 'true' : 'false'}">${besoins.includes(b.key) ? '✓ ' : ''}${b.key}</button>`)}</div>
            ${besoins.length ? html`<div class="muted xsmall">${besoins.map(k => model.BESOINS.find(b => b.key === k).label).join(' · ')}</div>` : ''}
            <textarea class="field" rows="3" data-input="amenagements" placeholder="Aménagements, informations utiles (place, tiers-temps, supports adaptés…)">${amenPending && amenPending.sid === s.id ? amenPending.text : s.amenagements || ''}</textarea>
          </div>
          <div class="stack">
            <div class="caps">Par trimestre</div>
            ${byT.map((x, i) => {
              const future = i + 1 > t;
              const w = n => (future ? 0 : Math.max(3, n / max * 100));
              return html`<div class="tri-row">
                <div class="tri-label">T${i + 1}</div>
                <div class="tri-bars">
                  <div class="tri-line"><div class="tri-bar neg" style="width:${w(x.neg)}%"></div><span class="tri-n neg">${future ? '—' : x.neg}</span></div>
                  <div class="tri-line"><div class="tri-bar pos" style="width:${w(x.pos)}%"></div><span class="tri-n pos">${future ? 'à venir' : x.pos}</span></div>
                </div>
              </div>`;
            })}
          </div>
        </section>

        <section class="panel history">
          <div class="panel-head">
            <div class="panel-title">Historique des observations</div>
            <div class="filters">
              <div class="segmented">${[1, 2, 3].map(k => html`<button type="button" class="seg${seg(st.period === k)}" data-click="period" data-k="${k}">T${k}</button>`)}</div>
              <div class="segmented">${[['all', 'Tout'], ['neg', 'Comportement'], ['pos', 'Aide'], ['abs', 'Absences'], ['ret', 'Retards']].map(([k, l]) =>
                html`<button type="button" class="seg${seg(st.filter === k)}" data-click="filter" data-k="${k}">${l}</button>`)}</div>
            </div>
          </div>
          <div class="panel-scroll" data-scroll="obs">
            ${rowsList.map(r => r.kind === 'ret'
              ? html`<div class="obs-row">
                  <span class="obs-mark ret"></span>
                  <div class="obs-text"><div class="obs-title">En retard</div><div class="muted small">${fmtDay(r.r.date)}${r.r.seanceLabel ? ' · ' + r.r.seanceLabel : ''}</div></div>
                  <button type="button" class="icon-btn" data-click="delRet" data-id="${r.r.id}" aria-label="Supprimer le retard">${icon.trash}</button>
                </div>`
              : r.kind === 'abs'
              ? html`<div class="obs-row">
                  <span class="obs-mark abs"></span>
                  <div class="obs-text"><div class="obs-title">Absent</div><div class="muted small">${fmtDay(r.a.date)}${r.a.seanceLabel ? ' · ' + r.a.seanceLabel : ''}</div></div>
                  <button type="button" class="icon-btn" data-click="delAbs" data-id="${r.a.id}" aria-label="Supprimer l'absence">${icon.trash}</button>
                </div>`
              : html`<div class="obs-row">
                  <span class="obs-mark ${r.o.type}"></span>
                  <div class="obs-text"><div class="obs-title">${model.obsTitle(r.o)}</div><div class="muted small">${model.obsSub(r.o)}</div></div>
                  <button type="button" class="btn soft small" data-click="swap" data-id="${r.o.id}" aria-label="${r.o.type === 'neg' ? 'Passer en Aide' : 'Passer en Comportement'}">${icon.swap}<span class="swap-label">${r.o.type === 'neg' ? 'Passer en Aide' : 'Passer en Comportement'}</span></button>
                  <button type="button" class="icon-btn" data-click="delObs" data-id="${r.o.id}" aria-label="Supprimer">${icon.trash}</button>
                </div>`)}
            ${rowsList.length ? '' : html`<div class="empty-block">${st.period > t ? `Le trimestre ${st.period} n’a pas encore commencé.` : st.filter === 'abs' ? 'Aucune absence.' : st.filter === 'ret' ? 'Aucun retard.' : 'Aucune observation.'}</div>`}
          </div>
        </section>

        <section class="panel notes">
          <div class="panel-head">
            <div class="panel-title">Notes</div>
            <textarea class="field" rows="3" placeholder="Ajouter une note sur ${s.prenom}…" data-input="newNote">${st.newNote}</textarea>
            <button type="button" class="btn accent self-end" data-click="addNote">Ajouter la note</button>
          </div>
          <div class="panel-scroll" data-scroll="notes">
            ${notes.map(n => html`<div class="note">
              <div class="note-head"><span class="muted small grow">${fmtDayYear(n.at)}</span>
                <button type="button" class="icon-btn" data-click="editNote" data-id="${n.id}" aria-label="Modifier">${icon.edit}</button>
                <button type="button" class="icon-btn" data-click="delNote" data-id="${n.id}" aria-label="Supprimer">${icon.trash}</button>
              </div>
              ${st.editing === n.id
                ? html`<textarea class="field editing" rows="4" data-input="draft">${st.draft}</textarea>
                  <div class="row-end"><button type="button" class="btn line" data-click="cancelEdit">Annuler</button>
                  <button type="button" class="btn accent" data-click="saveEdit">Enregistrer</button></div>`
                : html`<div class="note-text">${n.text}</div>`}
            </div>`)}
            ${notes.length ? '' : html`<div class="empty-block">Aucune note.</div>`}
          </div>
        </section>
      </main>
      ${tabBar(classId, 'trombi')}
    </div>`;
  },

  mount(root) {
    const ta = root.querySelector('textarea.editing');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  },

  leave() { flushAmen(); },

  actions: {
    period(el) { flushAmen(); st.period = +el.dataset.k; refresh(); },
    filter(el) { flushAmen(); st.filter = el.dataset.k; refresh(); },

    besoin(el, e, { studentId }) {
      flushAmen();
      model.toggleBesoin(studentId, el.dataset.k);
      refresh();
    },
    amenagements(el, e, { studentId }) {
      amenPending = { sid: studentId, text: el.value };
      clearTimeout(amenTimer);
      amenTimer = setTimeout(flushAmen, 600);
    },
    toggleRetard(el, e, { studentId }) {
      flushAmen();
      const s = db.get('students', studentId);
      const late = model.presenceOf(s) === 'retard';
      const undo = model.setPresence(s, late ? 'present' : 'retard');
      refresh();
      toast({ text: late ? 'Retard retiré' : `${s.prenom} noté en retard`, undo: async () => { await undo(); refresh(); } });
    },
    delRet(el) {
      const undo = model.deleteRetard(el.dataset.id);
      refresh();
      toast({ text: 'Retard supprimé', undo: async () => { await undo(); refresh(); }, undone: 'Suppression annulée' });
    },

    plus(el, e, { studentId }) {
      const s = db.get('students', studentId), type = el.dataset.type;
      const undo = model.addObservation(s, type, 'Ajout manuel', 'manual');
      refresh();
      toast({ text: model.LABEL[type] + ' : +1', undo: async () => { await undo(); refresh(); } });
    },
    minus(el, e, { studentId }) {
      const type = el.dataset.type;
      const r = model.removeLastObservation(studentId, type);
      if (!r) { toast({ text: 'Aucune observation à retirer ce trimestre' }); return; }
      refresh();
      toast({ text: model.LABEL[type] + ' : −1 (saisie du ' + fmtDay(r.removed.at) + ' retirée)', undo: async () => { await r.undo(); refresh(); } });
    },
    swap(el) {
      const o = db.get('observations', el.dataset.id);
      if (!o) return;
      const nt = o.type === 'neg' ? 'pos' : 'neg';
      const undo = model.swapObservation(o.id);
      refresh();
      toast({ text: 'Observation passée en ' + model.LABEL[nt], undo: async () => { await undo(); refresh(); } });
    },
    delObs(el) {
      const undo = model.deleteObservation(el.dataset.id);
      refresh();
      toast({ text: 'Observation supprimée', undo: async () => { await undo(); refresh(); }, undone: 'Suppression annulée' });
    },

    toggleAbs(el, e, { studentId }) {
      flushAmen();
      const s = db.get('students', studentId);
      if (!model.currentAppel(s.classId)) return;
      const absent = model.presenceOf(s) !== 'absent';
      const undo = model.setPresence(s, absent ? 'absent' : 'present');
      refresh();
      toast({ text: absent ? `${s.prenom} noté absent` : `Absence retirée`, undo: async () => { await undo(); refresh(); } });
    },
    delAbs(el) {
      const undo = model.deleteAbsence(el.dataset.id);
      refresh();
      toast({ text: 'Absence supprimée', undo: async () => { await undo(); refresh(); }, undone: 'Suppression annulée' });
    },
    newNote(el) { st.newNote = el.value; },
    addNote(el, e, { studentId }) {
      const text = st.newNote.trim();
      if (!text) { document.querySelector('[data-input="newNote"]').focus(); return; }
      const undo = model.addNote(studentId, text);
      st.newNote = '';
      refresh();
      toast({ text: 'Note ajoutée', undo: async () => { await undo(); refresh(); } });
    },
    editNote(el) {
      const n = db.get('notes', el.dataset.id);
      if (!n) return;
      st.editing = n.id; st.draft = n.text;
      refresh();
    },
    draft(el) { st.draft = el.value; },
    cancelEdit() { st.editing = null; refresh(); },
    saveEdit() {
      const id = st.editing, text = st.draft.trim();
      st.editing = null;
      if (!text) { refresh(); return; }
      const undo = model.updateNote(id, text);
      refresh();
      toast({ text: 'Note modifiée', undo: async () => { await undo(); refresh(); } });
    },
    delNote(el) {
      if (st.editing === el.dataset.id) st.editing = null;
      const undo = model.deleteNote(el.dataset.id);
      refresh();
      toast({ text: 'Note supprimée', undo: async () => { await undo(); refresh(); }, undone: 'Suppression annulée' });
    },
  },
};
