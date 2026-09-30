// Onglet Projet : séance en cours, journal de séance, historique, fin de projet et archives.
import * as db from '../db.js';
import * as model from '../model.js';
import * as planning from '../planning.js';
import { todayISO } from '../ui.js';
import { html, toast, openMenu, confirmDialog, fmtDayLong, fmtDate } from '../ui.js';
import { icon, backLink, saveStatus, tabBar } from '../components.js';
import { go, refresh } from '../nav.js';

// Séance ouverte dans le journal pour chaque projet.
const selSeance = {};
let journalTimer = null, journalPending = null;

// Projet affiché : le dernier choisi, sinon un projet en cours, sinon à venir, sinon le dernier terminé.
const currentAssignment = classId => model.chosenAssignment(classId);

function flushJournal() {
  clearTimeout(journalTimer);
  if (journalPending) { const { id, text } = journalPending; journalPending = null; model.updateSeance(id, { text }); }
}
addEventListener('pagehide', flushJournal);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushJournal(); });

function header(c, a, p) {
  return html`<header class="topbar">
    ${backLink('#/', 'Accueil')}
    <div class="heading"><span class="title">${c.name}</span>
      <span class="sub">${model.studentsOf(c.id).length} élèves · Trimestre ${model.trimester()}</span></div>
    <div class="spacer"></div>
    ${a ? html`<button type="button" class="picker" data-click="pickProject">
      <span class="muted">Projet :</span><strong>${p ? p.title : '?'}</strong>${icon.down}</button>` : saveStatus()}
  </header>`;
}

export default {
  render({ classId }) {
    const c = db.get('classes', classId);
    if (!c) { go('#/', { replace: true }); return null; }
    const a = currentAssignment(classId);
    const p = a && db.get('projects', a.projectId);
    if (!a || !p) {
      return html`<div class="screen">${header(c, null, null)}
        <main class="content center-msg"><div class="soon"><div class="soon-title">Aucun projet associé</div>
          <p>Associez un projet à la ${c.name} depuis la fiche de la classe.</p>
          <p><a class="btn accent" href="#/admin/classe/${c.id}">Ouvrir la fiche de la classe</a></p></div></main>
        ${tabBar(classId, 'projet')}</div>`;
    }
    const archived = a.status === 'fini';
    const seances = model.seancesOf(a.id);
    const cur = seances.length;
    const last = seances[cur - 1];
    let sel = seances.find(s => s.id === selSeance[a.id]) || last;
    const res = archived ? model.results(a) : null;

    return html`<div class="screen">
      ${header(c, a, p)}
      <main class="content projet">
        <section class="panel proj-main">
          <div class="proj-head">
            <div class="proj-title-row">
              <span class="proj-title">${p.title}</span>
              ${archived ? html`<span class="chip pos">Terminé le ${fmtDate(a.endedAt)} · archivé</span>` : ''}
              ${a.status === 'avenir' ? html`<span class="chip warn">À venir</span>` : ''}
            </div>
            ${p.desc ? html`<div class="proj-desc">${p.desc}</div>` : ''}
          </div>

          ${archived ? html`<div class="results">
              <div class="results-head">
                <span class="results-title">Résultats des groupes</span>
                <span class="muted small">Moyenne de la classe : <strong class="ink">${res.avg == null ? '—' : model.f1(res.avg) + ' / 20'}</strong></span>
                <span class="spacer"></span>
                <button type="button" class="link-btn" data-click="reopen">Rouvrir le projet</button>
              </div>
              ${res.groups.length ? html`<div class="results-grid">${res.groups.map(g => html`<div class="result">
                  <div class="result-top"><span class="result-code">${g.code}</span><span class="result-note${g.complete ? '' : ' muted'}">${model.f1(g.n)}</span></div>
                  <div class="result-bottom"><span class="ellipsis">${g.members.map(s => s.prenom).join(', ')}</span>
                    <span class="strong-sm">${g.complete ? model.mention(g.n) : g.n == null ? '' : 'provisoire'}</span></div>
                </div>`)}</div>` : html`<div class="muted small">Aucun groupe pour ce projet.</div>`}
            </div>`
          : html`<div class="proj-progress">
              <div class="grow">
                <div class="seance-count"><span class="muted big-label">Séance</span><span class="seance-n">${cur}</span><span class="seance-total">/ ${p.nSeances}</span></div>
                <div class="segbar">${Array.from({ length: Math.max(p.nSeances, cur) }, (_, i) => html`<span class="${i < cur ? 'done' : ''}"></span>`)}</div>
              </div>
              ${a.status === 'cours' ? html`<button type="button" class="btn big soft" data-click="askFinish">${icon.check}Projet fini</button>` : ''}
              <button type="button" class="btn big accent" data-click="newSeance">${icon.plusBig}Nouvelle séance</button>
            </div>`}

          <div class="journal">
            ${sel ? html`<div class="journal-head">
                <span class="journal-title">Journal · Séance ${sel.n}</span>
                ${!archived && sel.id !== last.id ? html`<span class="chip">Séance passée · modification</span>` : ''}
                <span class="spacer"></span>
                <label class="date-field">Date
                  <input type="date" value="${sel.date}" data-change="date" data-id="${sel.id}" ${archived ? 'disabled' : ''}></label>
                ${archived ? '' : html`<button type="button" class="icon-btn" data-click="delSeance" data-id="${sel.id}" aria-label="Supprimer la séance ${sel.n}" title="Supprimer cette séance">${icon.trash}</button>`}
              </div>
              <textarea class="journal-text" data-input="journal" data-id="${sel.id}" placeholder="Ce qui a été fait pendant la séance…" ${archived ? 'readonly' : ''}>${sel.text}</textarea>
              <div class="muted small">${archived ? 'Projet archivé · lecture seule' : 'Enregistré automatiquement'}</div>`
            : html`<div class="journal-empty">${archived ? 'Aucune séance enregistrée pour ce projet.' : 'Aucune séance pour ce projet. Touchez « Nouvelle séance » pour commencer.'}</div>`}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head plain"><span class="panel-title">Historique des séances</span></div>
          <div class="panel-scroll hist" data-scroll="hist">
            ${[...seances].reverse().map(s => html`<button type="button" class="hist-item${sel && s.id === sel.id ? ' on' : ''}" data-click="pickSeance" data-id="${s.id}">
              <span class="hist-top"><span class="hist-n">Séance ${s.n}</span><span class="muted small grow">${fmtDayLong(s.date)}</span>
                ${!archived && s.id === last.id ? html`<span class="chip accent">En cours</span>` : ''}</span>
              <span class="hist-text">${s.text || 'Journal vide'}</span>
            </button>`)}
            ${seances.length ? '' : html`<div class="empty-block">Pas encore de séance.</div>`}
          </div>
        </section>
      </main>
      ${tabBar(classId, 'projet')}
    </div>`;
  },

  leave: flushJournal,

  actions: {
    pickProject(el, e, { classId }) {
      flushJournal();
      const cur = currentAssignment(classId);
      const list = model.assignmentsOf(classId);
      const items = [];
      for (const [st, label] of [['cours', 'En cours'], ['avenir', 'À venir'], ['fini', 'Terminés · archivés']]) {
        const group = list.filter(a => a.status === st).map(a => ({ a, p: db.get('projects', a.projectId) })).filter(x => x.p)
          .sort((x, y) => model.cmp(x.p.title, y.p.title));
        if (!group.length) continue;
        items.push({ section: label });
        for (const { a, p } of group) {
          const n = model.seancesOf(a.id).length;
          items.push({
            label: p.title, selected: cur && a.id === cur.id,
            sub: st === 'fini' ? 'Terminé le ' + fmtDate(a.endedAt) + ' · ' + n + ' séances' : n + ' / ' + p.nSeances + ' séances',
            onPick: () => { model.chooseAssignment(classId, a.id); refresh(); },
          });
        }
      }
      items.push({ section: '' });
      items.push({ label: 'Associer un autre projet…', onPick: () => go(`#/admin/classe/${classId}`) });
      openMenu({ anchor: el, items, width: 380, align: 'right' });
    },

    newSeance(el, e, { classId }) {
      flushJournal();
      const a = currentAssignment(classId);
      const p = db.get('projects', a.projectId);
      if (model.seancesOf(a.id).length >= p.nSeances) {
        toast({ text: `Les ${p.nSeances} séances prévues sont faites. Augmentez le nombre de séances dans le projet si besoin.`, ms: 4000 });
        return;
      }
      // Séance créée pendant (ou juste avant) un cours du jour : reliée à ce cours.
      const k = planning.coursContexte(classId);
      const link = k && k.date === todayISO() && planning.roleOfCours(k) === 'suivi' && !model.seanceOfCours(k.id);
      const { seance, undo } = model.newSeance(a, link ? { coursId: k.id } : {});
      selSeance[a.id] = seance.id;
      refresh();
      toast({ text: `Séance ${seance.n} créée · ${fmtDayLong(seance.date)}`, undo: async () => { await undo(); refresh(); } });
    },

    async askFinish(el, e, { classId }) {
      flushJournal();
      const c = db.get('classes', classId), a = currentAssignment(classId), p = db.get('projects', a.projectId);
      const ok = await confirmDialog({
        title: `Terminer « ${p.title} » ?`,
        text: `Le projet sera archivé pour la ${c.name}. Les séances, les groupes et les évaluations restent consultables depuis le menu Projet.`,
        ok: 'Terminer et archiver',
      });
      if (!ok) return;
      const undo = model.finishAssignment(a);
      refresh();
      toast({ text: `« ${p.title} » terminé et archivé`, undo: async () => { await undo(); refresh(); } });
    },

    reopen(el, e, { classId }) {
      const a = currentAssignment(classId), p = db.get('projects', a.projectId);
      const undo = model.reopenAssignment(a);
      refresh();
      toast({ text: `« ${p.title} » rouvert`, undo: async () => { await undo(); refresh(); } });
    },

    async delSeance(el, e, { classId }) {
      flushJournal();
      const s = db.get('seances', el.dataset.id);
      if (!s) return;
      const a = currentAssignment(classId);
      const later = model.seancesOf(a.id).filter(x => x.n > s.n).length;
      const nObs = db.where('observations', o => o.assignmentId === a.id && o.seanceN === s.n).length;
      const nApp = db.where('appels', o => o.assignmentId === a.id && o.seanceN === s.n).length;
      const details = [
        s.text && s.text.trim() ? 'Son journal sera effacé.' : '',
        nObs || nApp ? `${[nObs && nObs + ' observation' + (nObs > 1 ? 's' : ''), nApp && 'l’appel'].filter(Boolean).join(' et ')} de ce jour ${nObs + nApp > 1 ? 'sont gardés' : 'est gardé'}, simplement détaché${nObs + nApp > 1 ? 's' : ''} de la séance.` : '',
        later ? `Les séances suivantes sont renumérotées (${s.n + 1} → ${s.n}${later > 1 ? ', …' : ''}).` : '',
      ].filter(Boolean).map(t => t[0].toUpperCase() + t.slice(1)).join(' ');
      if (!(await confirmDialog({
        title: `Supprimer la séance ${s.n} du ${fmtDayLong(s.date)} ?`,
        text: details || 'La séance est vide.',
        ok: 'Supprimer la séance', danger: true,
      }))) return;
      const r = model.deleteSeance(s.id);
      selSeance[a.id] = null;
      refresh();
      toast({ text: `Séance ${r.n} supprimée`, undo: async () => { await r.undo(); refresh(); }, undone: 'Suppression annulée' });
    },

    pickSeance(el, e, { classId }) {
      flushJournal();
      selSeance[currentAssignment(classId).id] = el.dataset.id;
      refresh();
    },

    journal(el) {
      journalPending = { id: el.dataset.id, text: el.value };
      clearTimeout(journalTimer);
      journalTimer = setTimeout(flushJournal, 500);
    },

    date(el) {
      if (!el.value) return;
      flushJournal();
      model.updateSeance(el.dataset.id, { date: el.value });
      refresh();
      toast({ text: 'Date de la séance : ' + fmtDayLong(el.value) });
    },
  },
};
