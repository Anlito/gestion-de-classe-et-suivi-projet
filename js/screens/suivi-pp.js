import * as db from '../db.js';
import * as model from '../model.js';
import * as pp from '../pp.js';
import { isOverdue } from '../pp-rules.js';
import { html, raw, toast, todayISO, fmtDate, confirmDialog } from '../ui.js';
import { icon, photo, backLink, saveStatus } from '../components.js';
import { go, refresh } from '../nav.js';

let st = { classId: '', studentId: '', tab: 'journal', filter: '', trimester: 1, collective: false, editId: null, form: {}, file: null, busy: false };
const drafts = new Map();
let recapPeriod = 1;
let previewUrl = null;
const draftKey = () => [st.studentId, st.classId, st.tab, st.trimester, st.collective].join('|');
const keepDraft = () => drafts.set(draftKey(), { form: { ...st.form }, editId: st.editId, file: st.file });
function restoreDraft() { const d = drafts.get(draftKey()); st.form = { ...(d?.form || {}) }; st.editId = d?.editId || null; st.file = d?.file || null; }
const panel = (title, body, footer = '') => html`<section class="panel pp-panel"><div class="panel-head row"><span class="panel-title grow">${title}</span></div><div class="panel-scroll" data-scroll="${title}">${body}</div>${footer ? html`<div class="pp-panel-foot">${footer}</div>` : ''}</section>`;
const field = (key, label, type = 'text') => html`<label class="lbl">${label}<input class="input" type="${type}" value="${st.form[key] || ''}" data-input="form" data-key="${key}" ${type === 'text' ? raw('maxlength="240"') : ''}></label>`;
const textField = label => html`<label class="lbl pp-text-field">${label}<textarea class="field" rows="5" data-input="form" data-key="text">${st.form.text || ''}</textarea></label>`;
const recordTool = r => ({ task: 'actions', note: 'notes', progress: 'notes', carnet: 'carnet', document: 'documents', council: 'conseils' })[r.kind];
const kindLabel = r => ({ task: 'Action', note: 'Note PP', progress: 'Progrès', carnet: r.category, document: r.category, council: r.category === 'synthese' ? 'Synthèse' : [r.subject, r.teacher].filter(Boolean).join(' · ') || 'Avis' })[r.kind];
const currentFilters = () => ({ classId: st.classId, ...(st.collective ? {} : { studentId: st.studentId }) });
function currentRecords() {
  let list = pp.latest(currentFilters()).filter(r => !st.collective || !r.studentId);
  if (st.tab === 'documents') return list.filter(r => r.kind === 'document');
  if (st.tab === 'actions') return list.filter(r => r.kind === 'task');
  if (st.tab === 'conseils') return list.filter(r => r.kind === 'council' && r.trimester === st.trimester);
  return list.filter(r => ['note', 'progress', 'carnet'].includes(r.kind) && pp.enabled(recordTool(r)));
}
function entryView(r) {
  const conflict = pp.latest(currentFilters()).filter(x => x.entityId === r.entityId).length > 1;
  return html`<article class="pp-record${st.editId === r.id ? ' selected' : ''}">
    <div class="row-center wrap"><span class="chip${r.kind === 'progress' ? ' pos' : ''}">${kindLabel(r)}</span>
      ${r.testMode ? html`<span class="chip warn">TEST · source ${r.sourceClass || '?'} · ${r.sourceYear || '?'}</span>` : ''}
      ${conflict ? html`<span class="chip warn">Versions concurrentes conservées</span>` : ''}
      ${r.status === 'validated' ? html`<span class="chip pos">Validé</span>` : ''}</div>
    <strong>${r.title || (r.kind === 'council' ? `Trimestre ${r.trimester}` : '')}</strong>
    ${r.text ? html`<div class="pp-record-text">${r.text}</div>` : ''}
    <span class="muted small">${r.date ? fmtDate(r.date) : fmtDate(r.at)}${r.due ? ' · échéance ' + fmtDate(r.due) : ''}</span>
    ${r.kind === 'task' ? html`<label class="check-row"><input type="checkbox" data-change="task" data-id="${r.id}" ${r.status === 'done' ? 'checked' : ''}> ${r.status === 'done' ? 'Fait' : isOverdue(r, todayISO()) ? 'À faire · échéance dépassée' : 'À faire'}</label>` : ''}
    <div class="row-center wrap">
      ${r.kind === 'document' ? html`<button class="btn soft small" data-click="preview" data-id="${r.id}">Ouvrir</button><button class="btn danger-soft small" data-click="removeDocument" data-id="${r.id}">Retirer</button>`
        : html`<button class="btn soft small" data-click="edit" data-id="${r.id}">Modifier</button>`}
    </div></article>`;
}
function journalForm() {
  const kinds = [...(pp.enabled('notes') ? [['note', 'Note personnelle'], ['progress', 'Réussite / progrès']] : []), ...(pp.enabled('carnet') ? [['carnet', 'Carnet scolaire numérique']] : [])];
  if (!kinds.length) return html`<p class="muted">Notes et carnet scolaire désactivés. Retrouvez vos choix dans Administration → Mes outils.</p>`;
  const kind = st.form.kind || kinds[0][0];
  return html`<label class="lbl">Type<select class="input" data-change="kind" ${st.editId ? 'disabled' : ''}>${kinds.map(([k, label]) => html`<option value="${k}" ${kind === k ? 'selected' : ''}>${label}</option>`)}</select></label>
    ${kind === 'carnet' ? html`<label class="lbl">Catégorie<select class="input" data-change="form" data-key="category">${pp.CARNET_TYPES.map(k => html`<option ${st.form.category === k ? 'selected' : ''}>${k}</option>`)}</select></label>` : ''}
    ${field('date', 'Date du fait', 'date')}${field('title', 'Titre (facultatif)')}${textField('Note personnelle / détail')}`;
}
function editor() {
  if (st.tab === 'documents') return html`<div class="stack"><p class="muted small">Plusieurs dispositifs et documents peuvent être associés au même élève.</p>
    <label class="lbl">Catégorie<select class="input" data-change="form" data-key="category">${pp.DOCUMENT_TYPES.map(k => html`<option ${st.form.category === k ? 'selected' : ''}>${k}</option>`)}</select></label>
    ${field('title', 'Titre (facultatif)')}
    <label class="lbl">Choisir un document (20 Mo maximum)<input type="file" class="input" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" data-change="file"></label>
    <label class="lbl">Prendre une photo<input type="file" class="input" accept="image/jpeg,image/png,image/webp" capture="environment" data-change="file"></label>
    <span class="muted small">${st.file ? st.file.name : 'Aucun fichier sélectionné.'}</span></div>`;
  if (st.tab === 'actions') return html`<div class="stack">${field('title', 'Action à suivre')}${field('due', 'Échéance (facultative)', 'date')}${textField('Détail / résultat de l’action')}</div>`;
  if (st.tab === 'conseils') return html`<div class="stack pp-editor-stack"><label class="lbl">Contenu<select class="input" data-change="kindCouncil" ${st.editId ? 'disabled' : ''}><option value="avis" ${st.form.category !== 'synthese' ? 'selected' : ''}>${st.collective ? 'Avis d’un professeur sur la classe' : 'Avis par matière'}</option><option value="synthese" ${st.form.category === 'synthese' ? 'selected' : ''}>${st.collective ? 'Synthèse générale de classe' : 'Synthèse globale de l’élève'}</option></select></label>
    ${st.form.category !== 'synthese' ? html`${field('subject', 'Matière')}${field('teacher', 'Professeur (facultatif)')}` : html`<p class="muted small">Bilan du trimestre → constats nuancés → conseils concrets. Félicitations si justifiées.</p>`}
    ${textField(st.form.category === 'synthese' ? 'Votre appréciation' : 'Appréciation du professeur')}
    <label class="lbl">État<select class="input" data-change="form" data-key="status"><option value="draft" ${st.form.status !== 'validated' ? 'selected' : ''}>Brouillon</option><option value="validated" ${st.form.status === 'validated' ? 'selected' : ''}>Validé par moi</option></select></label>
    <p class="muted small">Rédaction manuelle disponible. L’import des avis et l’aide à la rédaction seront ajoutés dans les prochaines étapes.</p></div>`;
  return html`<div class="stack pp-editor-stack">${journalForm()}</div>`;
}
function tabs() {
  return [['journal', 'Notes', pp.enabled('notes') || pp.enabled('carnet')], ['actions', 'Actions', pp.enabled('actions')], ['documents', 'Documents', pp.enabled('documents')], ['conseils', 'Conseils', pp.enabled('conseils')]].filter(t => t[2]);
}
function home() {
  const cls = pp.classes();
  const classIds = new Set(cls.map(c => c.id));
  const all = pp.latest().filter(r => classIds.has(r.classId) && pp.enabled(recordTool(r)));
  const tasks = all.filter(r => r.kind === 'task' && r.status !== 'done').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const ids = new Set(db.all('students').filter(s => classIds.has(s.classId)).map(s => s.id));
  const meetings = db.where('evenements', e => ids.has(e.studentId) && e.date >= todayISO()).sort((a, b) => (a.date + a.debut).localeCompare(b.date + b.debut));
  return html`<div class="pp-grid-home">
    ${panel('Mes classes PP', cls.map(c => html`<a class="pp-class-tile" style="--tint:${model.SECTIONS.find(sec => sec.key === model.sectionOf(c))?.tint || 'var(--accentTint)'}" href="#/pp/classe/${c.id}"><strong>${c.name}</strong><span>${model.studentsOf(c.id).length} élèves</span></a>`), html`<a class="link-btn" href="#/admin">Gérer les classes</a>`)}
    ${panel('Actions à suivre', pp.enabled('actions') ? (tasks.length ? tasks.map(r => html`<a class="pp-home-row" href="#/pp/eleve/${r.studentId}"><strong>${r.title}</strong><span class="muted small">${model.fullName(db.get('students', r.studentId) || {})}${r.due ? ' · ' + fmtDate(r.due) : ' · sans échéance'}</span>${isOverdue(r, todayISO()) ? html`<span class="chip warn">En retard</span>` : ''}</a>`) : html`<p class="muted">Aucune action ouverte. Ajoutez-en depuis une fiche élève.</p>`) : html`<p class="muted">Outil désactivé.</p>`)}
    ${panel('Réunions et suivi récent', html`${meetings.length ? meetings.map(e => html`<a class="pp-home-row" href="#/pp/eleve/${e.studentId}"><strong>${e.titre || 'Réunion'}</strong><span class="muted small">${fmtDate(e.date)} · ${e.debut} · ${model.fullName(db.get('students', e.studentId) || {})}</span></a>`) : html`<p class="muted">Aucune réunion élève à venir. Associez un élève PP à un événement de l’agenda.</p>`}
      <hr><span class="muted small">Les listes CSV et bulletins PDF s’importent depuis le récap d’une classe. Les relevés d’assiduité et de punitions, campagnes familles et audio restent à intégrer.</span>`)}
  </div>`;
}
function classSidebar(c, current = 'recap') {
  return html`<section class="panel pp-sidebar"><div class="pp-class-heading"><span class="title">${c.name}</span><span class="muted small">${model.studentsOf(c.id).length} élèves · Suivi PP</span></div>
    <div class="pp-class-nav"><a class="pp-pupil${current === 'recap' ? ' current' : ''}" href="#/pp/classe/${c.id}" ${current === 'recap' ? raw('aria-current="page"') : ''}>${icon.grid}Récap classe</a></div>
    <div class="pp-search"><input class="input" aria-label="Rechercher un élève" placeholder="Rechercher un élève" data-input="search" value="${st.filter}"></div>
    <div class="panel-scroll" data-scroll="pp-pupils">${model.studentsOf(c.id).map(p => html`<a class="pp-pupil" data-pp-pupil href="#/pp/eleve/${p.id}" ${st.filter && !model.fullName(p).toLocaleLowerCase('fr').includes(st.filter.toLocaleLowerCase('fr')) ? 'hidden' : ''}>${p.prenom} <span class="upper">${p.nom}</span></a>`)}</div></section>`;
}
function classRecap(c) {
  const trimester = recapPeriod;
  const pupils = model.studentsOf(c.id), ids = new Set(pupils.map(p => p.id));
  const rows = pp.latest({ classId: c.id }).filter(r => !r.studentId || ids.has(r.studentId));
  const tasks = rows.filter(r => pp.enabled('actions') && r.kind === 'task' && r.status !== 'done').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const documents = rows.filter(r => pp.enabled('documents') && r.kind === 'document');
  const meetings = db.where('evenements', e => (e.classId === c.id || ids.has(e.studentId)) && !e.cancelled && e.date >= todayISO()).sort((a, b) => (a.date + a.debut).localeCompare(b.date + b.debut));
  const collective = rows.filter(r => !r.studentId && r.kind === 'council' && r.trimester === trimester);
  const pupilsWithAdvice = new Set(rows.filter(r => r.kind === 'council' && r.studentId && r.trimester === trimester).map(r => r.studentId)).size;
  return html`<div class="screen pp-screen"><header class="topbar">${backLink('#/pp', 'Classes PP')}<div class="heading"><span class="title">${c.name} · Récap classe</span><span class="sub">${model.schoolYear()}</span></div><div class="spacer"></div>${saveStatus()}<a class="btn soft" href="#/admin/outils">${icon.sliders}<span class="hide-narrow">Mes outils</span></a></header>
    <div class="pp-toolbar"><span class="chip accent">Récap classe</span><span class="muted small grow">Vue collective, puis fiches élève par élève dans la liste.</span>${pp.enabled('imports') ? html`<a class="btn soft small" href="#/pp/imports/${c.id}">${icon.download}Importer Pronote</a>` : ''}${pp.enabled('conseils') ? html`<select class="input pp-trimester" data-change="recapTrimester" aria-label="Trimestre du récapitulatif">${[1, 2, 3].map(t => html`<option value="${t}" ${trimester === t ? 'selected' : ''}>Trimestre ${t}</option>`)}</select>` : ''}</div>
    <main class="content pp-detail pp-class-recap">${classSidebar(c)}
      ${panel('Vue d’ensemble de la classe', html`<div class="pp-recap-metrics"><div><strong>${pupils.length}</strong><span>élève${pupils.length > 1 ? 's' : ''}</span></div>${pp.enabled('actions') ? html`<div><strong>${tasks.length}</strong><span>action${tasks.length > 1 ? 's' : ''} ouverte${tasks.length > 1 ? 's' : ''}</span></div>` : ''}${pp.enabled('documents') ? html`<div><strong>${documents.length}</strong><span>pièce${documents.length > 1 ? 's' : ''} jointe${documents.length > 1 ? 's' : ''}</span></div>` : ''}</div>
      ${pp.enabled('actions') ? html`<h3 class="pp-source-title">Actions à suivre</h3>${tasks.length ? tasks.map(r => html`<a class="pp-home-row" href="${r.studentId ? '#/pp/eleve/' + r.studentId : '#/pp/classe/' + c.id}"><strong>${r.title}</strong><span class="muted small">${r.studentId ? model.fullName(db.get('students', r.studentId) || {}) : c.name}${r.due ? ' · ' + fmtDate(r.due) : ' · sans échéance'}</span>${isOverdue(r, todayISO()) ? html`<span class="chip warn">En retard</span>` : ''}</a>`) : html`<p class="muted small">Aucune action ouverte pour cette classe.</p>`}` : ''}
      <h3 class="pp-source-title">Prochaines réunions</h3>${meetings.length ? meetings.map(e => html`<div class="pp-home-row"><strong>${e.titre || 'Réunion'}</strong><span class="muted small">${fmtDate(e.date)} · ${e.debut}${e.studentId ? ' · ' + model.fullName(db.get('students', e.studentId) || {}) : ' · classe entière'}</span></div>`) : html`<p class="muted small">Aucune réunion à venir pour cette classe.</p>`}
      <p class="muted small pp-source-title">Ces indicateurs portent sur le suivi enregistré dans le Carnet. Les cumuls et alertes Pronote seront ajoutés avec les imports.</p>`)}
      ${pp.enabled('conseils') ? panel(`Conseil · trimestre ${trimester}`, html`<div class="info-box small-text">${pupilsWithAdvice} élève${pupilsWithAdvice > 1 ? 's' : ''} avec un avis ou une synthèse enregistré${pupilsWithAdvice > 1 ? 's' : ''} sur ${pupils.length}. Ce nombre ne mesure pas la complétude des avis.</div>
      <h3 class="pp-source-title">Avis généraux des professeurs</h3>${collective.filter(r => r.category !== 'synthese').map(r => html`<article class="pp-record"><strong>${[r.subject, r.teacher].filter(Boolean).join(' · ') || 'Avis collectif'}</strong><div class="pp-record-text">${r.text}</div></article>`)}${collective.some(r => r.category !== 'synthese') ? '' : html`<p class="muted small">Aucun avis collectif renseigné pour ce trimestre.</p>`}
      <h3 class="pp-source-title">Conclusion générale de la classe</h3>${collective.filter(r => r.category === 'synthese').map(r => html`<article class="pp-record"><span class="chip${r.status === 'validated' ? ' pos' : ''}">${r.status === 'validated' ? 'Validé' : 'Brouillon'}</span><div class="pp-record-text">${r.text}</div></article>`)}${collective.some(r => r.category === 'synthese') ? '' : html`<p class="muted small">La conclusion générale est à préparer.</p>`}`, html`<a class="btn accent" href="#/pp/classe/${c.id}/conseils">Préparer le conseil de la classe</a>`) : panel('Suivi collectif', html`<p class="muted">Le module Conseils est masqué. Les données collectives sont conservées.</p>`) }
    </main></div>`;
}
function profile(s, c) {
  const pupils = model.studentsOf(c.id).filter(p => !st.filter || model.fullName(p).toLocaleLowerCase('fr').includes(st.filter.toLocaleLowerCase('fr')));
  return html`<section class="panel pp-sidebar"><div class="pp-profile">${photo(s, { cls: 'big' })}<div><strong>${s.prenom}</strong><span class="upper">${s.nom}</span><span class="chip">${c.name} · PP</span></div></div>
    <div class="pp-profile-links"><a class="link-btn" href="#/classe/${c.id}/eleve/${s.id}">Fiche du Carnet →</a><button class="link-btn" data-click="newMeeting">+ Réunion liée</button></div>
    <div class="muted small pp-profile-links">${model.besoinsOf(s).join(' · ') || 'Aucun dispositif renseigné'}</div>
    <div class="pp-search"><input class="input" aria-label="Rechercher un élève" placeholder="Rechercher un élève" data-input="search" value="${st.filter}"></div>
    <div class="panel-scroll" data-scroll="pp-pupils">${pupils.map(p => html`<a class="pp-pupil${p.id === s.id ? ' current' : ''}" data-pp-pupil href="#/pp/eleve/${p.id}" ${p.id === s.id ? raw('aria-current="true"') : ''}>${p.prenom} <span class="upper">${p.nom}</span></a>`)}</div></section>`;
}
export default {
  render(params) {
    if (!pp.hasPP()) return html`<div class="screen"><header class="topbar">${backLink('#/', 'Accueil')}<div class="title">Suivi PP</div></header><main class="content pp-empty"><h2>Aucune classe PP activée</h2><p>Dans Administration, ouvrez une classe et cochez « Je suis professeur principal de cette classe ».</p><p>Le suivi des classes décochées est conservé.</p><a class="btn accent" href="#/admin">Choisir une classe PP</a></main></div>`;
    const cls = pp.classes();
    if (params.classId && !pp.active(params.classId)) { go('#/pp', { replace: true }); return null; }
    const classId = params.classId || (!params.studentId && cls.length === 1 ? cls[0].id : null);
    if (classId && !params.section) return classRecap(db.get('classes', classId));
    const classCouncil = params.section === 'conseils';
    if (classCouncil && !pp.enabled('conseils')) { go(`#/pp/classe/${classId}`, { replace: true }); return null; }
    let s = params.studentId ? db.get('students', params.studentId) : null;
    if (params.studentId && (!s || !pp.active(s.classId))) { go('#/pp', { replace: true }); return null; }
    if (classCouncil && (st.classId !== classId || st.studentId || !st.collective || st.tab !== 'conseils' || st.trimester !== recapPeriod)) { keepDraft(); st.classId = classId; st.studentId = ''; st.collective = true; st.tab = 'conseils'; st.trimester = recapPeriod; restoreDraft(); }
    if (s && (s.id !== st.studentId || s.classId !== st.classId || st.collective)) { keepDraft(); st.studentId = s.id; st.classId = s.classId; st.collective = false; restoreDraft(); }
    const c = db.get('classes', s?.classId || classId);
    if (!tabs().some(t => t[0] === st.tab)) st.tab = tabs()[0]?.[0] || 'none';
    const title = s ? model.fullName(s) : classCouncil ? c.name + ' · Conseil de classe' : 'Mon suivi PP';
    const list = s || classCouncil ? currentRecords() : [];
    const builtin = s && st.tab === 'journal' && pp.enabled('notes') ? model.notesOf(s.id) : [];
    return html`<div class="screen pp-screen"><header class="topbar">${backLink('#/', 'Carnet')}
      <div class="heading"><span class="title ellipsis">${title}</span>${c ? html`<span class="sub">${c.name}</span>` : ''}</div>
      <div class="spacer"></div>${saveStatus()}<a class="btn soft" href="#/admin/outils">${icon.sliders}<span class="hide-narrow">Mes outils</span></a></header>
      ${s || classCouncil ? html`<div class="pp-toolbar">${s ? html`<a class="btn accent pp-recap-access" href="#/pp/classe/${c.id}">${icon.grid}<span>Récap classe <strong>${c.name}</strong></span></a>` : html`<span class="grow muted">Avis et synthèses collectifs</span>`}${classCouncil ? '' : html`<div class="segmented">${tabs().map(([key, label]) => html`<button class="seg${st.tab === key ? ' on' : ''}" data-click="tab" data-key="${key}">${label}</button>`)}</div>`}
        ${st.tab === 'conseils' ? html`<select class="input pp-trimester" data-change="trimester" aria-label="Trimestre">${[1, 2, 3].map(t => html`<option value="${t}" ${t === st.trimester ? 'selected' : ''}>Trimestre ${t}</option>`)}</select>` : ''}</div>
      <main class="content pp-detail">${classCouncil ? classSidebar(c, 'conseil') : profile(s, c)}
      ${panel(st.collective ? `Conseil · ${c.name}` : st.tab === 'documents' ? 'Documents associés' : st.tab === 'conseils' ? `Conseil · trimestre ${st.trimester}` : st.tab === 'actions' ? 'Actions de suivi' : 'Historique personnel', html`
        ${s && st.tab === 'journal' ? pp.meetingsOf(s.id).map(e => html`<article class="pp-record"><span class="chip">Réunion liée à l’agenda</span><strong>${e.titre || 'Réunion'}</strong><span class="muted small">${fmtDate(e.date)} · ${e.debut} · ${e.lieu || ''}</span><button class="btn soft small" data-click="meeting" data-id="${e.id}">Ouvrir la réunion</button></article>`) : ''}
        ${list.length ? list.map(entryView) : html`<p class="muted">Aucun élément dans cette rubrique.</p>`}
        ${builtin.length ? html`<h3 class="pp-source-title">Notes du Carnet</h3>${builtin.map(n => html`<article class="pp-record"><span class="chip">Carnet · note libre</span><div class="pp-record-text">${n.text}</div><span class="muted small">${fmtDate(n.at)}</span></article>`)}` : ''}`, html`<button class="btn soft small" data-click="newEntry">${icon.plus}Nouvel élément</button>`)}
      ${panel(st.editId ? 'Modifier · nouvelle version' : 'Ajouter au suivi', editor(), html`<span class="muted small">${st.file ? 'Fichier prêt à joindre' : 'Enregistrement local, puis Drive si activé'}</span><button class="btn accent" data-click="save" ${st.busy || st.tab === 'none' ? 'disabled' : ''}>${st.busy ? 'Enregistrement…' : 'Enregistrer'}</button>`)}
      </main>` : html`<main class="content pp-home">${home()}</main>`}
    </div>`;
  },
  mount(root) {
    const textarea = root.querySelector('[data-key="text"]');
    if (textarea) textarea.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.actions.save(); } });
  },
  leave() { keepDraft(); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; },
  actions: {
    form(el) { st.form[el.dataset.key] = el.value; keepDraft(); },
    search(el) {
      st.filter = el.value;
      // Ne pas redessiner le champ pendant la frappe (clavier Android).
      const text = st.filter.toLocaleLowerCase('fr');
      document.querySelectorAll('[data-pp-pupil]').forEach(a => { a.hidden = !a.textContent.toLocaleLowerCase('fr').includes(text); });
    },
    tab(el) { keepDraft(); st.tab = el.dataset.key; st.collective = false; restoreDraft(); refresh(); },
    trimester(el, e, params) { keepDraft(); st.trimester = Number(el.value); if (params?.section === 'conseils') recapPeriod = st.trimester; restoreDraft(); refresh(); },
    recapTrimester(el) { recapPeriod = Number(el.value); refresh(); },
    kind(el) { st.form.kind = el.value; keepDraft(); refresh(); },
    kindCouncil(el) { st.form.category = el.value; keepDraft(); refresh(); },
    file(el) { st.file = el.files?.[0] || null; keepDraft(); const msg = document.createElement('span'); msg.className = 'muted small'; msg.textContent = st.file?.name || ''; el.parentElement.querySelector('.pp-file-picked')?.remove(); msg.classList.add('pp-file-picked'); el.parentElement.append(msg); },
    async newEntry() {
      if ((st.form.text || st.form.title || st.file) && !(await confirmDialog({ title: 'Commencer un nouvel élément ?', text: 'Le contenu non enregistré de cet éditeur sera remplacé.', ok: 'Nouvel élément' }))) return;
      st.form = {}; st.editId = null; st.file = null; keepDraft(); refresh();
    },
    async edit(el) {
      const r = db.get('ppRecords', el.dataset.id); if (!r) return;
      if ((st.form.text || st.form.title || st.file) && !(await confirmDialog({ title: 'Ouvrir cet élément ?', text: 'Le contenu non enregistré de cet éditeur sera remplacé.', ok: 'Ouvrir' }))) return;
      st.editId = r.id; st.form = { ...r }; keepDraft(); refresh();
    },
    async save() {
      if (st.busy) return;
      try {
        st.busy = true;
        const data = { ...st.form, studentId: st.collective ? null : st.studentId, classId: st.classId };
        let result;
        if (st.tab === 'documents') {
          if (!st.file) throw new Error('Choisissez un document ou prenez une photo.');
          result = await pp.attachDocument(st.studentId, st.file, data.category || pp.DOCUMENT_TYPES[0], data.title);
        } else {
          data.kind = st.tab === 'actions' ? 'task' : st.tab === 'conseils' ? 'council' : data.kind || (pp.enabled('notes') ? 'note' : 'carnet');
          if (data.kind === 'carnet') data.category ||= pp.CARNET_TYPES[0];
          if (data.kind === 'council') { data.trimester = st.trimester; data.category ||= 'avis'; if (!data.text?.trim()) throw new Error('Renseignez l’appréciation.'); }
          result = pp.saveEntry(data, st.editId ? db.get('ppRecords', st.editId) : null);
          await db.flush();
          await db.verifyStored('ppRecords', result.entry.id, result.entry.updatedAt);
        }
        st.form = {}; st.editId = null; st.file = null; keepDraft(); refresh();
        toast({ text: 'Enregistré sur cet appareil. Drive prend le relais si la synchronisation est activée.', undo: async () => { await result.undo(); refresh(); }, ms: 6000 });
      } catch (e) { toast({ text: e.message, ms: 6000 }); }
      finally { st.busy = false; const b = document.querySelector('[data-click="save"]'); if (b) { b.disabled = false; b.textContent = 'Enregistrer'; } }
    },
    async task(el) {
      try { const r = db.get('ppRecords', el.dataset.id); pp.saveEntry({ ...r, status: el.checked ? 'done' : 'todo' }, r); await db.flush(); refresh(); }
      catch (e) { toast({ text: e.message }); refresh(); }
    },
    async removeDocument(el) {
      if (!(await confirmDialog({ title: 'Retirer ce document ?', text: 'Le fichier sera retiré de ce dossier et des appareils après synchronisation.', danger: true, ok: 'Retirer' }))) return;
      try { const undo = pp.removeEntry(el.dataset.id); await db.flush(); refresh(); toast({ text: 'Document retiré', undo: async () => { await undo(); refresh(); } }); }
      catch (e) { toast({ text: e.message }); }
    },
    preview(el) {
      const r = db.get('ppRecords', el.dataset.id), p = r && db.get('photos', r.blobId);
      if (!p?.blob) { toast({ text: 'Fichier absent de cet appareil. Reconnectez Drive et synchronisez.' }); return; }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([p.blob], { type: r.mimeType }));
      const layer = document.getElementById('layer');
      layer.innerHTML = html`<div class="scrim dim" data-pp-close></div><section class="drawer pp-preview" role="dialog" aria-modal="true" aria-label="Aperçu du document"><div class="drawer-head"><span class="drawer-title grow">${r.title}</span><a class="btn soft" href="${previewUrl}" download="${r.fileName}">Télécharger</a><button class="btn accent" data-pp-close>Fermer</button></div><div class="pp-preview-body">${r.mimeType === 'application/pdf' ? html`<iframe title="Document PDF" src="${previewUrl}"></iframe>` : r.mimeType.startsWith('image/') ? html`<img src="${previewUrl}" alt="${r.title}">` : html`<p>Ce format se consulte après téléchargement.</p>`}</div></section>`.s;
      layer.querySelectorAll('[data-pp-close]').forEach(b => b.addEventListener('click', () => { layer.innerHTML = ''; URL.revokeObjectURL(previewUrl); previewUrl = null; }));
    },
    async newMeeting() {
      const { openStudentEvent } = await import('./semaine.js');
      openStudentEvent(st.studentId);
    },
    async meeting(el) {
      const { openStudentEvent } = await import('./semaine.js');
      openStudentEvent(st.studentId, el.dataset.id);
    },
  },
};
