// Carnet de la classe PP : comptes rendus de réunion et pense-bêtes d'une classe dont on est professeur principal.
import * as db from '../db.js';
import * as model from '../model.js';
import * as pp from '../pp.js';
import * as notes from '../pp-class-notes.js';
import { html, raw, toast, todayISO, fmtDate, confirmDialog } from '../ui.js';
import { backLink, saveStatus } from '../components.js';
import { go, refresh } from '../nav.js';

let st = { classId: '', view: 'all', search: '', editId: null, form: {}, open: false, busy: false };
const VIEWS = [['all', 'Tout'], ['memo', 'Pense-bêtes'], ['reunion', 'Réunions'], ['archived', 'Archivées']];
const blank = (category = 'reunion') => ({ category, date: todayISO(), title: '', text: '' });

function visible(classId) {
  const all = notes.notesOf(classId);
  const rows = st.view === 'archived' ? all.filter(r => r.archivedAt) : all.filter(r => !r.archivedAt && (st.view === 'all' || r.category === st.view));
  return rows;
}
const matches = r => { const q = st.search.trim().toLocaleLowerCase('fr'); return !q || (r.title + ' ' + r.text).toLocaleLowerCase('fr').includes(q); };
function noteView(r, conflicts) {
  const memo = r.category === 'memo', done = r.status === 'done';
  return html`<article data-cnote class="pp-record pp-cnote${memo ? ' memo' : ''}${done ? ' done' : ''}${st.editId === r.id ? ' selected' : ''}" ${matches(r) ? '' : raw('hidden')}>
    <div class="row-center wrap"><span class="chip${memo ? ' accent' : ''}">${memo ? 'Pense-bête' : 'Réunion'}</span>${r.date ? html`<span class="muted small">${fmtDate(r.date)}</span>` : ''}
      ${conflicts.has(r.entityId) ? html`<span class="chip warn">Deux versions (autre appareil)</span>` : ''}${r.archivedAt ? html`<span class="chip">Archivée</span>` : ''}</div>
    ${memo ? html`<label class="check-row"><input type="checkbox" data-change="done" data-id="${r.id}" ${done ? 'checked' : ''} ${r.archivedAt ? 'disabled' : ''}><strong>${r.title || r.text.split('\n')[0]}</strong></label>`
      : r.title ? html`<strong>${r.title}</strong>` : ''}
    ${r.text && !(memo && !r.title) ? html`<div class="pp-record-text">${r.text}</div>` : ''}
    <div class="button-group pp-note-actions">${r.archivedAt ? '' : html`<button type="button" class="btn soft small" data-click="edit" data-id="${r.id}">Modifier</button>`}
      <button type="button" class="btn soft small" data-click="archive" data-id="${r.id}" data-restore="${r.archivedAt ? 'yes' : 'no'}">${r.archivedAt ? 'Restaurer' : 'Archiver'}</button>
      <button type="button" class="btn danger-soft small" data-click="remove" data-id="${r.id}">Supprimer</button></div></article>`;
}
function editor() {
  const f = st.form, memo = f.category === 'memo';
  return html`<section class="panel pp-panel" id="pp-cnote-editor"><div class="panel-head row"><span class="panel-title grow">${st.editId ? 'Modifier la note' : memo ? 'Nouveau pense-bête' : 'Nouveau compte rendu'}</span><button class="btn soft small" data-click="close">Fermer</button></div>
    <div class="panel-scroll"><div class="stack">
      <div class="segmented" role="group" aria-label="Type de note">${notes.CATEGORIES.map(([k, label]) => html`<button type="button" class="seg${f.category === k ? ' on' : ''}" data-click="category" data-key="${k}" aria-pressed="${f.category === k}">${label}</button>`)}</div>
      <label class="lbl">${memo ? 'À ne pas oublier' : 'Réunion'}<input class="input" data-input="form" data-key="title" maxlength="240" value="${f.title || ''}" ${memo ? raw('placeholder="Ex. : relancer la famille de Léo pour le PAP"') : raw('list="pp-cnote-titles" placeholder="Ex. : Réunion d’équipe pédagogique"')}></label>
      <datalist id="pp-cnote-titles">${notes.MEETING_TITLES.map(t => html`<option value="${t}">`)}</datalist>
      <label class="lbl">${memo ? 'Pour le (facultatif)' : 'Date de la réunion'}<input class="input" type="date" data-input="form" data-key="date" value="${f.date || ''}"></label>
      <label class="lbl pp-text-field">${memo ? 'Détail (facultatif)' : 'Notes de la réunion'}<textarea class="field" rows="${memo ? 4 : 12}" data-input="form" data-key="text" ${memo ? '' : raw('placeholder="Présents, points abordés, décisions, à faire…"')}>${f.text || ''}</textarea></label>
      <p class="muted small">Ctrl + Entrée pour enregistrer. Ces notes restent dans le Carnet (et votre Drive si la synchronisation est activée) : elles ne sont jamais envoyées ailleurs.</p>
    </div></div>
    <div class="pp-panel-foot"><button class="btn accent" data-click="save" ${st.busy ? 'disabled' : ''}>Enregistrer</button></div></section>`;
}
export default {
  render(params) {
    const c = db.get('classes', params.classId);
    if (!c || !pp.active(c.id)) { go('#/pp', { replace: true }); return null; }
    if (st.classId !== c.id) st = { classId: c.id, view: 'all', search: '', editId: null, form: {}, open: false, busy: false };
    const head = html`<header class="topbar">${backLink('#/pp/classe/' + c.id, 'Récap ' + c.name)}<div class="heading"><span class="title">Carnet de la classe · ${c.name}</span><span class="sub">Réunions et pense-bêtes · ${model.schoolYear()}</span></div><div class="spacer"></div>${saveStatus()}</header>`;
    if (!pp.enabled('notes')) return html`<div class="screen pp-screen">${head}<main class="content pp-empty"><p>L’outil Notes est désactivé. Réactivez-le dans Administration → Mes outils.</p><a class="btn accent" href="#/admin/outils">Mes outils</a></main></div>`;
    const all = notes.notesOf(c.id), rows = visible(c.id);
    const heads = new Map(); all.forEach(r => heads.set(r.entityId, (heads.get(r.entityId) || 0) + 1));
    const conflicts = new Set([...heads].filter(([, n]) => n > 1).map(([k]) => k));
    const count = k => k === 'archived' ? all.filter(r => r.archivedAt).length : all.filter(r => !r.archivedAt && (k === 'all' || r.category === k)).length;
    const openCount = all.filter(notes.isOpenMemo).length;
    return html`<div class="screen pp-screen">${head}
      <div class="pp-toolbar"><button class="btn accent" data-click="new" data-key="reunion">+ Compte rendu de réunion</button><button class="btn accent" data-click="new" data-key="memo">+ Pense-bête</button><span class="muted small grow">${openCount ? `${openCount} pense-bête${openCount > 1 ? 's' : ''} à faire` : 'Aucun pense-bête en attente'}</span></div>
      <main class="content pp-cnote-grid${st.open ? '' : ' closed'}">
        <section class="panel pp-panel"><div class="panel-head row wrap"><div class="segmented" role="group" aria-label="Afficher">${VIEWS.map(([k, label]) => html`<button type="button" class="seg${st.view === k ? ' on' : ''}" data-click="view" data-key="${k}" aria-pressed="${st.view === k}">${label} <span class="muted">${count(k)}</span></button>`)}</div>
          <input class="input pp-cnote-search" type="search" aria-label="Rechercher dans les notes" placeholder="Rechercher" data-input="search" value="${st.search}"></div>
          <div class="panel-scroll" data-scroll="pp-cnotes">${rows.length ? rows.map(r => noteView(r, conflicts)) : html`<p class="muted">${st.view === 'archived' ? 'Aucune note archivée.' : 'Rien pour l’instant. Notez ici ce qui se dit en réunion ou ce qu’il ne faut pas oublier pour cette classe.'}</p>`}</div></section>
        ${st.open ? editor() : ''}
      </main></div>`;
  },
  mount(root) {
    const ta = root.querySelector('#pp-cnote-editor textarea');
    root.querySelectorAll('#pp-cnote-editor input, #pp-cnote-editor textarea').forEach(el => el.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.actions.save(); } }));
    if (st.focus) { (st.focus === 'text' ? ta : root.querySelector('#pp-cnote-editor [data-key="title"]'))?.focus({ preventScroll: true }); st.focus = null; }
  },
  actions: {
    view(el) { st.view = el.dataset.key; refresh(); },
    search(el) {
      st.search = el.value;
      // Ne pas redessiner le champ pendant la frappe (clavier Android) : on masque seulement les notes.
      const q = st.search.trim().toLocaleLowerCase('fr');
      document.querySelectorAll('[data-cnote]').forEach(a => { a.hidden = !!q && !a.textContent.toLocaleLowerCase('fr').includes(q); });
    },
    form(el) { st.form[el.dataset.key] = el.value; },
    async new(el) {
      if (st.open && (st.form.title || st.form.text) && !await confirmDialog({ title: 'Commencer une nouvelle note ?', text: 'Le texte non enregistré sera perdu.', ok: 'Nouvelle note' })) return;
      st.editId = null; st.form = blank(el.dataset.key); if (el.dataset.key === 'memo') st.form.date = ''; st.open = true; st.focus = 'title'; refresh();
    },
    category(el) { st.form.category = el.dataset.key; refresh(); },
    async edit(el) {
      const r = db.get('ppRecords', el.dataset.id); if (!r) return;
      if (st.open && st.editId !== r.id && (st.form.title || st.form.text) && !await confirmDialog({ title: 'Ouvrir cette note ?', text: 'Le texte non enregistré sera perdu.', ok: 'Ouvrir' })) return;
      st.editId = r.id; st.form = { category: r.category, date: r.date, title: r.title, text: r.text, status: r.status }; st.open = true; st.focus = 'text'; refresh();
    },
    async close() {
      if ((st.form.title || st.form.text) && !st.editId && !await confirmDialog({ title: 'Fermer sans enregistrer ?', text: 'Le texte saisi sera perdu.', ok: 'Fermer' })) return;
      st.open = false; st.editId = null; st.form = {}; refresh();
    },
    async save() {
      if (st.busy) return;
      st.busy = true;
      try {
        const { undo } = await notes.saveNote(st.classId, st.form, st.editId);
        const wasEdit = !!st.editId;
        st.open = false; st.editId = null; st.form = {};
        refresh();
        toast({ text: wasEdit ? 'Note modifiée' : 'Note enregistrée', undo: async () => { await undo(); refresh(); } });
      } catch (e) { toast({ text: e.message, ms: 6000 }); }
      finally { st.busy = false; refresh(); }
    },
    async done(el) {
      try { const undo = await notes.setDone(st.classId, el.dataset.id, el.checked); refresh(); toast({ text: el.checked ? 'C’est fait !' : 'Remis à faire', undo: async () => { await undo(); refresh(); } }); }
      catch (e) { toast({ text: e.message }); refresh(); }
    },
    async archive(el) {
      const restore = el.dataset.restore === 'yes';
      if (st.editId === el.dataset.id) { st.open = false; st.editId = null; st.form = {}; }
      try { const undo = await notes.setArchived(st.classId, el.dataset.id, !restore); refresh(); toast({ text: restore ? 'Note restaurée' : 'Note archivée (onglet Archivées)', undo: async () => { await undo(); refresh(); } }); }
      catch (e) { toast({ text: e.message }); }
    },
    async remove(el) {
      if (!await confirmDialog({ title: 'Supprimer cette note ?', text: 'Elle sera supprimée de cet appareil, puis des autres à la synchronisation. Pour la garder sans l’afficher, utilisez Archiver.', danger: true, ok: 'Supprimer' })) return;
      if (st.editId === el.dataset.id) { st.open = false; st.editId = null; st.form = {}; }
      try { const undo = await notes.deleteNote(st.classId, el.dataset.id); refresh(); toast({ text: 'Note supprimée', undo: async () => { await undo(); refresh(); } }); }
      catch (e) { toast({ text: e.message }); }
    },
  },
};
