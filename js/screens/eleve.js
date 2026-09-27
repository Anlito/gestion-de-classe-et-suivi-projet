// Détail élève : compteurs corrigeables, comparaison par trimestre, historique, notes libres.
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast, fmtDay, fmtDayYear } from '../ui.js';
import { icon, backLink, tabBar, photo } from '../components.js';
import { go, refresh } from '../nav.js';

// État de l'écran (filtres, note en cours de modification), remis à zéro quand on change d'élève.
let st = { sid: null, period: null, filter: 'all', newNote: '', editing: null, draft: '' };

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
    const obs = st.filter === 'abs' ? [] : model.observationsOf(s.id).filter(o => o.trimester === st.period && (st.filter === 'all' || o.type === st.filter));
    const abs = st.filter === 'all' || st.filter === 'abs' ? model.absencesOf(s.id).filter(a => a.trimester === st.period) : [];
    // Historique : observations et absences mêlées, de la plus récente à la plus ancienne.
    const rowsList = [...obs.map(o => ({ kind: 'obs', key: o.at, o })), ...abs.map(a => ({ kind: 'abs', key: a.date + 'T' + a.at.slice(11), a }))]
      .sort((x, y) => y.key.localeCompare(x.key));
    const absentNow = model.absentNow(s.classId).has(s.id);
    const ap = model.currentAppel(s.classId);
    const absLabel = ap && ap.seanceN ? 'Absent à la séance ' + ap.seanceN : 'Absent à l’appel du jour';
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
              <div class="segmented">${[['all', 'Tout'], ['neg', 'Comportement'], ['pos', 'Aide'], ['abs', 'Absences']].map(([k, l]) =>
                html`<button type="button" class="seg${seg(st.filter === k)}" data-click="filter" data-k="${k}">${l}</button>`)}</div>
            </div>
          </div>
          <div class="panel-scroll" data-scroll="obs">
            ${rowsList.map(r => r.kind === 'abs'
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
            ${rowsList.length ? '' : html`<div class="empty-block">${st.period > t ? `Le trimestre ${st.period} n’a pas encore commencé.` : st.filter === 'abs' ? 'Aucune absence.' : 'Aucune observation.'}</div>`}
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

  actions: {
    period(el) { st.period = +el.dataset.k; refresh(); },
    filter(el) { st.filter = el.dataset.k; refresh(); },

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
      const s = db.get('students', studentId);
      const r = model.toggleAbsent(s);
      if (!r) return;
      const { absent, undo } = r;
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
