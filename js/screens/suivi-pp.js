import * as db from '../db.js';
import * as model from '../model.js';
import * as pp from '../pp.js';
import {archiveNote,deleteNote} from '../pp-note-lifecycle.js';
import {taskExtraFields,taskExtraView} from '../pp-task-ui.js';
import { isOverdue } from '../pp-rules.js';
import { isMasteryLayout, previousResultText, annualBulletinRows } from '../pronote-import.js';
import { schoolHistory, measureEditor, measureExtras, classReportSummary, disciplineColumnInfo } from '../school-life.js';
import { html, raw, toast, todayISO, fmtDate, confirmDialog } from '../ui.js';
import { icon, photo, backLink, saveStatus } from '../components.js';
import { go, refresh } from '../nav.js';

let st = { classId: '', studentId: '', tab: 'journal', filter: '', trimester: 1, collective: false, notesView:'active', editId: null, form: {}, file: null, busy: false, editorOpen:false };
const drafts = new Map();
let recapPeriod = 1;
let previewUrl = null;
const draftKey = () => [st.studentId, st.classId, st.tab, st.trimester, st.collective].join('|');
const keepDraft = () => drafts.set(draftKey(), { form: { ...st.form }, editId: st.editId, file: st.file, editorOpen:st.editorOpen });
function restoreDraft() { const d = drafts.get(draftKey()); st.form = { ...(d?.form || {}) }; st.editId = d?.editId || null; st.file = d?.file || null; st.editorOpen=d?.editorOpen===true; }
const panel = (title, body, footer = '') => html`<section class="panel pp-panel"><div class="panel-head row"><span class="panel-title grow">${title}</span></div><div class="panel-scroll" data-scroll="${title}">${body}</div>${footer ? html`<div class="pp-panel-foot">${footer}</div>` : ''}</section>`;
const field = (key, label, type = 'text') => html`<label class="lbl">${label}<input class="input" type="${type}" value="${st.form[key] || ''}" data-input="form" data-key="${key}" ${type === 'text' ? raw('maxlength="240"') : ''}></label>`;
const textField = label => html`<label class="lbl pp-text-field">${label}<textarea class="field" rows="5" data-input="form" data-key="text">${st.form.text || ''}</textarea></label>`;
const recordTool = r => ({ measure:'vieScolaire',task: 'actions', note: 'notes', progress: 'notes', carnet: 'carnet', document: 'documents', council: 'conseils' })[r.kind];
const kindLabel = r => ({ measure:r.category,task: 'Action', note: 'Note PP', progress: 'Progrès', carnet: r.category, document: r.category, council: r.category === 'synthese' ? 'Synthèse' : [r.subject, r.teacher].filter(Boolean).join(' · ') || 'Avis' })[r.kind];
const currentFilters = () => ({ classId: st.classId, ...(st.collective ? {} : { studentId: st.studentId }) });
function currentRecords() {
  let list = pp.latest(currentFilters()).filter(r => !st.collective || !r.studentId);
  if (st.tab === 'documents') return list.filter(r => r.kind === 'document');
  if (st.tab === 'actions') return list.filter(r => r.kind === 'task');
  if (st.tab === 'conseils') return list.filter(r => r.kind === 'council' && r.trimester === st.trimester);
  if (st.tab === 'vie') return list.filter(r=>r.kind==='measure');
  return list.filter(r => ['note', 'progress', 'carnet'].includes(r.kind) && pp.enabled(recordTool(r)) && (st.notesView==='archived'?['note','progress'].includes(r.kind)&&!!r.archivedAt:!r.archivedAt));
}
function noteButtons(row,store='ppRecords',editable=false) {
  return html`<div class="button-group pp-note-actions">${editable&&!row.archivedAt?html`<button type="button" class="btn soft small" data-click="edit" data-id="${row.id}">Modifier</button>`:''}<button type="button" class="btn soft small" data-click="noteArchive" data-store="${store}" data-id="${row.id}" data-restore="${row.archivedAt?'yes':'no'}">${row.archivedAt?'Restaurer':'Archiver'}</button><button type="button" class="btn danger-soft small" data-click="noteDelete" data-store="${store}" data-id="${row.id}">Supprimer</button></div>`;
}
function legacyNoteView(n){return html`<article class="pp-record" data-note-id="${n.id}"><span class="chip">Carnet · note libre${n.archivedAt?' · archivée':''}</span><div class="pp-record-text">${n.text}</div><span class="muted small">${fmtDate(n.at)}${n.archivedAt?' · archivée le '+fmtDate(n.archivedAt):''}</span>${noteButtons(n,'notes')}</article>`;}
function notesToolbar(){
  if(st.tab!=='journal'||!st.studentId||!pp.enabled('notes'))return '';
  const count=pp.latest({studentId:st.studentId,classId:st.classId}).filter(r=>['note','progress'].includes(r.kind)&&r.archivedAt).length+model.notesOf(st.studentId,{archived:true}).length;
  return html`<div class="pp-notes-toolbar" role="group" aria-label="Afficher les notes"><button type="button" class="btn small ${st.notesView==='active'?'accent':'soft'}" aria-pressed="${st.notesView==='active'?'true':'false'}" data-click="notesView" data-mode="active">Suivi actif</button><button type="button" class="btn small ${st.notesView==='archived'?'accent':'soft'}" aria-pressed="${st.notesView==='archived'?'true':'false'}" data-click="notesView" data-mode="archived">Archives (${count})</button></div>`;
}
async function changeNote(el,remove=false){
  const studentId=st.studentId,store=el.dataset.store,id=el.dataset.id,restore=el.dataset.restore==='yes';
  const source=db.get(store,id);if(!remove&&st.editId===id&&store==='ppRecords'&&source&&(st.form.text!==source.text||st.form.title!==source.title)){toast({text:'Enregistrez vos modifications avant d’archiver cette note.'});return;}
  if(remove&&!await confirmDialog({title:'Supprimer cette note ?',text:(store==='notes'?'Cette note sera supprimée aussi de la fiche du Carnet, puis des autres appareils à la synchronisation.':'Toutes les versions de cette note seront supprimées, puis des autres appareils à la synchronisation.')+' Pour la garder sans l’afficher, utilisez Archiver.',danger:true,ok:'Supprimer'}))return;
  try{const undo=remove?await deleteNote(studentId,store,id):await archiveNote(studentId,store,id,!restore);if(st.studentId===studentId){if(st.editId===id&&store==='ppRecords'){st.editId=null;st.form={};keepDraft();}if(restore)st.notesView='active';}refresh();toast({text:remove?'Note supprimée':restore?'Note restaurée':'Note archivée, conservée dans Archives',undo:async()=>{await undo();await db.flush();refresh();},ms:6000});}catch(e){toast({text:e.message});}
}
function entryView(r) {
  const conflict = pp.latest(currentFilters()).filter(x => x.entityId === r.entityId).length > 1;
  return html`<article class="pp-record${st.editId === r.id ? ' selected' : ''}" data-record-id="${r.id}">
    <div class="row-center wrap"><span class="chip${r.kind === 'progress' ? ' pos' : ''}">${kindLabel(r)}</span>
      ${r.testMode ? html`<span class="chip warn">TEST · source ${r.sourceClass || '?'} · ${r.sourceYear || '?'}</span>` : ''}
      ${conflict ? html`<span class="chip warn">Versions concurrentes conservées</span>` : ''}
      ${r.archivedAt?html`<span class="chip">Archivée le ${fmtDate(r.archivedAt)}</span>`:''}${r.status === 'validated' ? html`<span class="chip pos">Validé</span>` : ''}</div>
    <strong>${r.title || (r.kind === 'council' ? `Trimestre ${r.trimester}` : '')}</strong>
    ${r.text ? html`<div class="pp-record-text">${r.text}</div>` : ''}
    ${r.kind==='measure'?measureExtras(r):''}
    ${r.kind==='task'?taskExtraView(r):''}
    <span class="muted small">${r.date ? fmtDate(r.date) : r.kind==='measure'?'Saisie le '+fmtDate(r.at)+' · date de la mesure non renseignée':fmtDate(r.at)}${r.due ? ' · échéance ' + fmtDate(r.due) : ''}</span>
    ${r.kind === 'task' ? html`<label class="check-row"><input type="checkbox" data-change="task" data-id="${r.id}" ${r.status === 'done' ? 'checked' : ''}> ${r.status === 'done' ? 'Fait' : isOverdue(r, todayISO()) ? 'À faire · échéance dépassée' : 'À faire'}</label>` : ''}
    ${['note','progress'].includes(r.kind)?noteButtons(r,'ppRecords',true):html`<div class="button-group">
      ${r.kind === 'document' ? html`<button class="btn soft small" data-click="preview" data-id="${r.id}">Ouvrir</button><button class="btn danger-soft small" data-click="removeDocument" data-id="${r.id}">Retirer</button>`
        : html`<button class="btn soft small" data-click="edit" data-id="${r.id}">Modifier</button>`}
    </div>`}</article>`;
}
function bulletinEvolution() {
  if (st.tab !== 'conseils' || st.collective) return '';
  const sources = pp.records({ studentId: st.studentId, kind: 'bulletinSource' });
  if (!sources.length) return '';
  const available = [...new Set(sources.map(s => s.trimester))].sort();
  return html`<details class="pp-bulletin-results pp-annual"><summary>Évolution sur les 3 trimestres</summary><p class="muted small">Bulletins importés : ${available.map(t => `T${t}`).join(' · ')}. Une case « — » correspond à une donnée absente. Les changements d’enseignants sont conservés sur des lignes distinctes.</p><table class="pp-import-table"><thead><tr><th>Matière / professeur</th><th>T1</th><th>T2</th><th>T3</th></tr></thead><tbody>${annualBulletinRows(sources).map(r => html`<tr><td><strong>${r.subject}</strong><div class="muted small">${r.teacher}</div></td>${r.periods.map(p => html`<td>${p?.text || '—'}${p?.testMode ? html`<div class="muted small">TEST</div>` : ''}</td>`)}</tr>`)}</tbody></table></details>`;
}
function bulletinResults() {
  if (st.tab !== 'conseils' || st.collective) return '';
  const source = pp.records({ studentId: st.studentId, kind: 'bulletinSource' }).filter(r => r.trimester === st.trimester).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  if (!source) return '';
  const document = pp.latest({ studentId: st.studentId, kind: 'document' }).find(r => r.importBatchId === source.importBatchId);
  return html`<details class="pp-bulletin-results"><summary>Données du dernier bulletin importé${source.testMode ? ' · TEST' : ''}</summary>
    <p class="muted small">Source : ${source.sourceClass || '?'} · ${source.sourceYear || source.year} · trimestre ${source.trimester}</p>
    ${document && pp.enabled('documents') ? html`<button class="btn soft small" data-click="preview" data-id="${document.id}">Ouvrir le bulletin</button>` : ''}
    ${(source.payload?.subjects || []).map(s => html`<article class="pp-record"><strong>${s.subject}</strong><span class="muted small">${s.teacher || 'Professeur non renseigné'}</span>
      ${s.nonRepresentative ? html`<span class="chip warn">NR · moyenne non représentative</span>` : ''}
      ${s.mastery && !isMasteryLayout(source.layout) ? html`<span class="chip">Positionnement : ${s.mastery.value}/4 · ${s.mastery.label}</span>` : ''}
      ${isMasteryLayout(source.layout) ? html`<span class="chip">${s.mastery ? `${s.mastery.value}/4 · ${s.mastery.label}` : 'Positionnement non renseigné'}</span>${s.competenciesRaw ? html`<div class="pp-record-text muted small">${s.competenciesRaw}</div>` : ''}` : html`<span class="muted small">Élève : ${(s.studentResults || []).map(g => g.raw).join(' / ') || 'pas de moyenne'} · Classe : ${(s.classResults || []).map(g => g.raw).join(' / ') || 'pas de moyenne'}</span>`}${s.previousResults?.map(p => html`<span class="muted small">Rappel T${p.trimester} : ${previousResultText(p)}</span>`)}
    </article>`)}${[source.payload?.mentionsRaw, source.payload?.orientationRaw, source.payload?.engagementsRaw].filter(Boolean).map(t => html`<div class="info-box pp-record-text">${t}</div>`)}<p class="muted small">Les graphiques et le détail des évaluations restent dans le PDF original.</p></details>`;
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
  if(st.tab==='vie')return measureEditor(st.form,st.studentId);
  if (st.tab === 'documents') return html`<div class="stack"><p class="muted small">Plusieurs dispositifs et documents peuvent être associés au même élève.</p>
    <label class="lbl">Catégorie<select class="input" data-change="form" data-key="category">${pp.DOCUMENT_TYPES.map(k => html`<option ${st.form.category === k ? 'selected' : ''}>${k}</option>`)}</select></label>
    ${field('title', 'Titre (facultatif)')}
    <label class="lbl">Choisir un document (20 Mo maximum)<input type="file" class="input" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" data-change="file"></label>
    <label class="lbl">Prendre une photo<input type="file" class="input" accept="image/jpeg,image/png,image/webp" capture="environment" data-change="file"></label>
    <span class="muted small">${st.file ? st.file.name : 'Aucun fichier sélectionné.'}</span></div>`;
  if (st.tab === 'actions') return html`<div class="stack">${field('title', 'Action à suivre')}${field('due', 'Échéance (facultative)', 'date')}${textField('Détail de l’action')}${taskExtraFields(st.form,st.studentId)}</div>`;
  if (st.tab === 'conseils') return html`<div class="stack pp-editor-stack"><label class="lbl">Contenu<select class="input" data-change="kindCouncil" ${st.editId ? 'disabled' : ''}><option value="avis" ${st.form.category !== 'synthese' ? 'selected' : ''}>${st.collective ? 'Avis d’un professeur sur la classe' : 'Avis par matière'}</option><option value="synthese" ${st.form.category === 'synthese' ? 'selected' : ''}>${st.collective ? 'Synthèse générale de classe' : 'Synthèse globale de l’élève'}</option></select></label>
    ${st.form.category !== 'synthese' ? html`${field('subject', 'Matière')}${field('teacher', 'Professeur (facultatif)')}` : html`<p class="muted small">Bilan du trimestre → constats nuancés → conseils concrets. Félicitations si justifiées.</p>`}
    ${textField(st.form.category === 'synthese' ? 'Votre appréciation' : 'Appréciation du professeur')}
    <label class="lbl">État<select class="input" data-change="form" data-key="status"><option value="draft" ${st.form.status !== 'validated' ? 'selected' : ''}>Brouillon</option><option value="validated" ${st.form.status === 'validated' ? 'selected' : ''}>Validé par moi</option></select></label>
    <p class="muted small">Les avis des bulletins peuvent être importés. Votre synthèse reste personnelle. Préparer une appréciation ouvre les avis du trimestre et votre structure de rédaction.</p></div>`;
  return html`<div class="stack pp-editor-stack">${journalForm()}</div>`;
}
function tabs() {
  return [['journal', 'Notes', pp.enabled('notes') || pp.enabled('carnet')], ['actions', 'Actions', pp.enabled('actions')], ['documents', 'Documents', pp.enabled('documents')], ['conseils', 'Conseils', pp.enabled('conseils')],['vie','Vie scolaire',pp.enabled('vieScolaire')]].filter(t => t[2]);
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
      <hr><span class="muted small">Les listes CSV et bulletins PDF s’importent depuis le récap d’une classe. Les relevés d’assiduité et de punitions sont disponibles. Les campagnes de rencontres sont disponibles depuis le récap classe. Le formulaire familles nécessite l’installation du service Google fourni. Les notes audio sont disponibles depuis chaque fiche élève.</span>`)}
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
      <div class="button-group">${pp.enabled('qualite')?html`<a class="btn" href="#/pp/classe/${c.id}/qualite">Qualité des données et évolution</a>`:''}${pp.enabled('rencontres') ? html`<a class="btn accent" href="#/pp/rencontres">Rencontres parents–PP</a>` : ''}${pp.enabled('alertes') ? html`<a class="btn accent" href="#/pp/alertes">Alertes PP · seuils et suivi</a>` : ''}</div>${classReportSummary(c.id)}<p class="muted small pp-source-title">Ces relevés conservent leurs périodes. Les appels du Carnet restent distincts. Les alertes PP utilisent la dernière période d’assiduité disponible.</p>`)}
      ${pp.enabled('conseils') ? panel(`Conseil · trimestre ${trimester}`, html`<div class="info-box small-text">${pupilsWithAdvice} élève${pupilsWithAdvice > 1 ? 's' : ''} avec un avis ou une synthèse enregistré${pupilsWithAdvice > 1 ? 's' : ''} sur ${pupils.length}. Ce nombre ne mesure pas la complétude des avis.</div>
      <h3 class="pp-source-title">Avis généraux des professeurs</h3>${collective.filter(r => r.category !== 'synthese').map(r => html`<article class="pp-record"><strong>${[r.subject, r.teacher].filter(Boolean).join(' · ') || 'Avis collectif'}</strong><div class="pp-record-text">${r.text}</div></article>`)}${collective.some(r => r.category !== 'synthese') ? '' : html`<p class="muted small">Aucun avis collectif renseigné pour ce trimestre.</p>`}
      <h3 class="pp-source-title">Conclusion générale de la classe</h3>${collective.filter(r => r.category === 'synthese').map(r => html`<article class="pp-record"><span class="chip${r.archivedAt?html`<span class="chip">Archivée le ${fmtDate(r.archivedAt)}</span>`:''}${r.status === 'validated' ? ' pos' : ''}">${r.archivedAt?html`<span class="chip">Archivée le ${fmtDate(r.archivedAt)}</span>`:''}${r.status === 'validated' ? 'Validé' : 'Brouillon'}</span><div class="pp-record-text">${r.text}</div></article>`)}${collective.some(r => r.category === 'synthese') ? '' : html`<p class="muted small">La conclusion générale est à préparer.</p>`}`, html`<div class="button-group"><a class="btn accent" href="#/pp/classe/${c.id}/avancement/${trimester}">Avancement du conseil</a><a class="btn" href="#/pp/classe/${c.id}/conseils">Préparer le conseil de la classe</a></div>`) : panel('Suivi collectif', html`<p class="muted">Le module Conseils est masqué. Les données collectives sont conservées.</p>`) }
    </main></div>`;
}
function profile(s, c) {
  const pupils = model.studentsOf(c.id).filter(p => !st.filter || model.fullName(p).toLocaleLowerCase('fr').includes(st.filter.toLocaleLowerCase('fr')));
  const microphone=raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>');
  const actions=[...(pp.enabled('preparation')?[{label:'Préparer une rencontre',href:'#/pp/eleve/'+s.id+'/preparer-rdv',icon:icon.book,primary:true}]:[]),{label:'Créer RDV',click:'newMeeting',icon:icon.calendar},...(pp.enabled('audio')?[{label:'Notes audio',href:'#/pp/eleve/'+s.id+'/audio',icon:microphone}]:[]),...(pp.enabled('demarches')?[{label:'Démarches',description:'Démarches et renouvellements',href:'#/pp/eleve/'+s.id+'/demarches',icon:icon.archive}]:[]),{label:'Fiche Carnet',description:'Ouvrir la fiche du Carnet de cet élève',href:'#/classe/'+c.id+'/eleve/'+s.id,icon:icon.tabTrombi}];
  const secondaryCount=actions.filter(a=>!a.primary).length,needs=model.besoinsOf(s);
  return html`<section class="panel pp-sidebar pp-student-sidebar"><div class="pp-profile">${photo(s, { cls: 'big',label:false })}<div class="pp-profile-identity"><strong>${s.prenom}</strong><span class="upper">${s.nom}</span><span class="chip">${c.name} · PP</span></div></div>
    <nav class="pp-profile-actions" aria-label="Actions de suivi de l’élève">${actions.map((a,i)=>{const cls='pp-profile-action'+(a.primary?' primary':i===actions.length-1&&secondaryCount%2?' wide':'');return a.href?html`<a class="${cls}" href="${a.href}" title="${a.description||a.label}">${a.icon}<span>${a.label}</span>${a.primary?icon.chevron:''}</a>`:html`<button type="button" class="${cls}" data-click="${a.click}">${a.icon}<span>${a.label}</span></button>`;})}</nav>
    <div class="pp-profile-support"><span>Dispositifs</span><strong>${needs.length?needs.join(' · '):'Aucun renseigné'}</strong></div>
    <div class="pp-search"><label class="pp-profile-search"><span>Changer d’élève <span class="muted">· ${model.studentsOf(c.id).length}</span></span><input class="input" aria-label="Rechercher un élève" placeholder="Rechercher un élève" data-input="search" value="${st.filter}"></label></div>
    <div class="panel-scroll" data-scroll="pp-pupils">${pupils.map(p => html`<a class="pp-pupil${p.id === s.id ? ' current' : ''}" data-pp-pupil href="#/pp/eleve/${p.id}" ${p.id === s.id ? raw('aria-current="true"') : ''}>${p.prenom} <span class="upper">${p.nom}</span></a>`)}</div></section>`;
}
export default {
  render(params) {
    if (!pp.hasPP()) return html`<div class="screen"><header class="topbar">${backLink('#/', 'Accueil')}<div class="title">Suivi PP</div></header><main class="content pp-empty"><h2>Aucune classe PP activée</h2><p>Dans Administration, ouvrez une classe et cochez « Je suis professeur principal de cette classe ».</p><p>Le suivi des classes décochées est conservé.</p><a class="btn accent" href="#/admin">Choisir une classe PP</a></main></div>`;
    const cls = pp.classes();
    if (params.classId && !pp.active(params.classId)) { go('#/pp', { replace: true }); return null; }
    const classId = params.classId || (!params.studentId && cls.length === 1 ? cls[0].id : null);
    if (classId && !params.section) return classRecap(db.get('classes', classId));
    const classCouncil = !params.studentId && params.section === 'conseils';
    const requestedPeriod=Number(params.trimester);if(classCouncil&&[1,2,3].includes(requestedPeriod))recapPeriod=requestedPeriod;
    if (classCouncil && !pp.enabled('conseils')) { go(`#/pp/classe/${classId}`, { replace: true }); return null; }
    let s = params.studentId ? db.get('students', params.studentId) : null;
    if (params.studentId && (!s || !pp.active(s.classId))) { go('#/pp', { replace: true }); return null; }
    if (classCouncil && (st.classId !== classId || st.studentId || !st.collective || st.tab !== 'conseils' || st.trimester !== recapPeriod)) { keepDraft(); st.classId = classId; st.studentId = ''; st.collective = true; st.tab = 'conseils'; st.trimester = recapPeriod; restoreDraft(); }
    if (s && (s.id !== st.studentId || s.classId !== st.classId || st.collective)) { keepDraft(); st.studentId = s.id; st.classId = s.classId; st.collective = false; restoreDraft(); }
    if(s&&params.section&&tabs().some(t=>t[0]===params.section)&&(st.tab!==params.section||(params.section==='conseils'&&st.trimester!==requestedPeriod))){keepDraft();st.tab=params.section;if(params.section==='conseils')st.trimester=[1,2,3].includes(requestedPeriod)?requestedPeriod:1;restoreDraft();}
    const c = db.get('classes', s?.classId || classId);
    if(!pp.enabled('notes'))st.notesView='active';
    if (!tabs().some(t => t[0] === st.tab)) st.tab = tabs()[0]?.[0] || 'none';
    const title = s ? model.fullName(s) : classCouncil ? c.name + ' · Conseil de classe' : 'Mon suivi PP';
    const list = s || classCouncil ? currentRecords() : [];
    const builtin = s && st.tab === 'journal' && pp.enabled('notes') ? model.notesOf(s.id,{archived:st.notesView==='archived'}) : [];
    return html`<div class="screen pp-screen"><header class="topbar">${backLink('#/', 'Carnet')}
      <div class="heading"><span class="title ellipsis">${title}</span>${c ? html`<span class="sub">${c.name}</span>` : ''}</div>
      <div class="spacer"></div>${saveStatus()}<a class="btn soft" href="#/admin/outils">${icon.sliders}<span class="hide-narrow">Mes outils</span></a></header>
      ${s || classCouncil ? html`<div class="pp-toolbar">${s ? html`<a class="btn accent pp-recap-access" href="#/pp/classe/${c.id}">${icon.grid}<span>Récap classe <strong>${c.name}</strong></span></a>` : html`<span class="grow muted">Avis et synthèses collectifs</span>`}${classCouncil ? '' : html`<div class="segmented">${tabs().map(([key, label]) => html`<button class="seg${st.tab === key ? ' on' : ''}" data-click="tab" data-key="${key}">${label}</button>`)}</div>`}
        ${st.tab === 'conseils' ? html`<select class="input pp-trimester" data-change="trimester" aria-label="Trimestre">${[1, 2, 3].map(t => html`<option value="${t}" ${t === st.trimester ? 'selected' : ''}>Trimestre ${t}</option>`)}</select>` : ''}</div>
      <main class="content pp-detail${st.editorOpen?'':' pp-editor-closed'}">${classCouncil ? classSidebar(c, 'conseil') : profile(s, c)}
      ${panel(st.collective ? `Conseil · ${c.name}` : st.tab==='vie'?'Vie scolaire':st.tab === 'documents' ? 'Documents associés' : st.tab === 'conseils' ? `Conseil · trimestre ${st.trimester}` : st.tab === 'actions' ? 'Actions de suivi' : 'Historique personnel', html`
        ${notesToolbar()}${st.tab==='conseils'?html`<div class="button-group"><a class="btn" href="#/pp/classe/${st.classId}/dossier/${st.trimester}">Dossier / PDF</a><a class="btn" href="#/pp/${st.collective?'classe/'+st.classId:'eleve/'+st.studentId}/relecture/${st.trimester}">Relire les synthèses</a><a class="btn" href="#/pp/classe/${st.classId}/avancement/${st.trimester}">Avancement du conseil</a><a class="btn accent" href="#/pp/${st.collective?'classe/'+st.classId:'eleve/'+st.studentId}/appreciation/${st.trimester}">Préparer une appréciation</a></div>`:''}${s && st.tab === 'journal' && st.notesView!=='archived' ? pp.meetingsOf(s.id).map(e => html`<article class="pp-record"><span class="chip">Réunion liée à l’agenda</span><strong>${e.titre || 'Réunion'}</strong><span class="muted small">${fmtDate(e.date)} · ${e.debut} · ${e.lieu || ''}</span><button class="btn soft small" data-click="meeting" data-id="${e.id}">Ouvrir la réunion</button></article>`) : ''}
        ${st.tab==='vie'?schoolHistory(st.studentId):''}${bulletinEvolution()}${bulletinResults()}${list.length ? list.map(entryView) : !builtin.length&&!(st.tab==='vie'&&pp.records({studentId:st.studentId,kind:'periodReport'}).length)?html`<p class="muted">${st.tab==='journal'&&st.notesView==='archived'?'Aucune note archivée.':'Aucun élément dans cette rubrique.'}</p>`:''}
        ${builtin.length ? html`<h3 class="pp-source-title">Notes du Carnet${st.notesView==='archived'?' · archives':''}</h3><p class="muted small">Notes partagées avec la fiche du Carnet. Les actions s’appliquent aux deux espaces.</p>${builtin.map(legacyNoteView)}` : ''}`, html`<button class="btn accent small" data-click="toggleEditor" aria-expanded="${String(st.editorOpen)}" aria-controls="pp-editor">${st.editorOpen?'Masquer le formulaire':st.editId||Object.keys(st.form).length||st.file?'Reprendre le brouillon':st.tab==='vie'?'Ajouter une mesure':st.tab==='documents'?'Ajouter un document':st.tab==='actions'?'Ajouter une action':st.tab==='conseils'?'Ajouter une appréciation':'Ajouter une note'}</button>`)}
      ${st.editorOpen?html`<section class="panel pp-panel" id="pp-editor"><div class="panel-head row"><span class="panel-title grow">${st.editId?'Modifier':st.tab==='vie'?'Compléter une mesure':'Ajouter au suivi'}</span><button class="btn soft small" data-click="toggleEditor" aria-label="Masquer le formulaire">Fermer</button></div><div class="panel-scroll" data-scroll="pp-editor">${editor()}</div><div class="pp-panel-foot"><button class="btn soft small" data-click="newEntry">Nouveau</button><button class="btn accent" data-click="save" ${st.busy || st.tab === 'none' ? 'disabled' : ''}>${st.busy ? 'Enregistrement…' : 'Enregistrer'}</button></div></section>`:''}
      </main>` : html`<main class="content pp-home">${home()}</main>`}
    </div>`;
  },
  mount(root) {
    const textarea = root.querySelector('[data-key="text"]');
    if (textarea) textarea.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.actions.save(); } });
  },
  leave() { keepDraft(); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; },
  actions: {
    toggleEditor(){if(st.busy)return;st.editorOpen=!st.editorOpen;keepDraft();refresh();document.querySelector(st.editorOpen?'#pp-editor .panel-head button':'[data-click="toggleEditor"]')?.focus({preventScroll:true});},
    notesView(el){st.notesView=el.dataset.mode;refresh();},
    async noteArchive(el){await changeNote(el);},
    async noteDelete(el){await changeNote(el,true);},
    taskResolve(el){st.form.resolveConcurrent=el.checked;keepDraft();},
    schoolReport(el) { st.form.reportEntityId=el.value;st.form.columnId='';keepDraft();refresh(); },
    async completeReportMeasure(el) {
      if(st.busy)return;
      const report=pp.latest({studentId:st.studentId,kind:'periodReport'}).find(r=>r.id===el.dataset.id&&r.profile==='discipline'),column=report?.columns.find(c=>c.id===el.dataset.column),info=column&&disciplineColumnInfo(column);
      if(!report||!info?.category||!pp.enabled('vieScolaire')||!pp.active(st.classId)||pp.latest({studentId:st.studentId,kind:'periodReport'}).filter(r=>r.entityId===report.entityId).length!==1){toast({text:'Rouvrez le relevé de cet élève avant de le compléter.'});return;}
      if((st.editId||Object.keys(st.form).length)&&!await confirmDialog({title:'Compléter cette mesure ?',text:'Le formulaire non enregistré sera remplacé.',ok:'Compléter'}))return;
      st.editId=null;st.editorOpen=true;st.form={kind:'measure',reportEntityId:report.entityId,columnId:column.id,category:info.category};keepDraft();refresh();
      document.querySelector('[data-key="reason"]')?.focus({preventScroll:true});
    },
    form(el) { st.form[el.dataset.key] = el.value; keepDraft(); },
    search(el) {
      st.filter = el.value;
      // Ne pas redessiner le champ pendant la frappe (clavier Android).
      const text = st.filter.toLocaleLowerCase('fr');
      document.querySelectorAll('[data-pp-pupil]').forEach(a => { a.hidden = !a.textContent.toLocaleLowerCase('fr').includes(text); });
    },
    tab(el,e,params) { keepDraft(); st.tab = el.dataset.key; st.collective = false; restoreDraft(); if(params?.studentId&&params.section){go('#/pp/eleve/'+params.studentId);return;}refresh(); },
    trimester(el, e, params) { keepDraft(); if(params?.trimester){go('#/pp/'+(params.studentId?'eleve/'+params.studentId:'classe/'+params.classId)+'/conseils/'+el.value);return;}st.trimester = Number(el.value); if (params?.section === 'conseils') recapPeriod = st.trimester; restoreDraft(); refresh(); },
    recapTrimester(el) { recapPeriod = Number(el.value); refresh(); },
    kind(el) { st.form.kind = el.value; keepDraft(); refresh(); },
    kindCouncil(el) { st.form.category = el.value; keepDraft(); refresh(); },
    file(el) { st.file = el.files?.[0] || null; keepDraft(); const msg = document.createElement('span'); msg.className = 'muted small'; msg.textContent = st.file?.name || ''; el.parentElement.querySelector('.pp-file-picked')?.remove(); msg.classList.add('pp-file-picked'); el.parentElement.append(msg); },
    async newEntry() {
      if ((st.form.text || st.form.title || st.file) && !(await confirmDialog({ title: 'Commencer un nouvel élément ?', text: 'Le contenu non enregistré de cet éditeur sera remplacé.', ok: 'Nouvel élément' }))) return;
      st.form = {}; st.editId = null; st.file = null; st.editorOpen=true; keepDraft(); refresh();
    },
    async edit(el) {
      const r = db.get('ppRecords', el.dataset.id); if (!r) return;
      if ((st.form.text || st.form.title || st.file) && !(await confirmDialog({ title: 'Ouvrir cet élément ?', text: 'Le contenu non enregistré de cet éditeur sera remplacé.', ok: 'Ouvrir' }))) return;
      st.editorOpen=true;st.editId = r.id; st.form = { ...r,...(r.kind==='task'?{resolveConcurrent:false,expectedHeads:pp.latest({studentId:st.studentId,kind:'task'}).filter(other=>other.entityId===r.entityId).map(other=>other.id)}:{}) }; keepDraft(); refresh();
    },
    async save() {
      if (st.busy) return;
      const context=draftKey(),formSnapshot=JSON.stringify(st.form),fileSnapshot=st.file,originalEdit=st.editId;
      let result;
      try {
        st.busy = true;
        const data = { ...st.form, studentId: st.collective ? null : st.studentId, classId: st.classId };
        if (st.tab === 'documents') {
          if (!st.file) throw new Error('Choisissez un document ou prenez une photo.');
          result = await pp.attachDocument(st.studentId, st.file, data.category || pp.DOCUMENT_TYPES[0], data.title);
        } else {
          data.kind = st.tab==='vie'?'measure':st.tab === 'actions' ? 'task' : st.tab === 'conseils' ? 'council' : data.kind || (pp.enabled('notes') ? 'note' : 'carnet');
          if(data.kind==='measure'){data.category||='Retenue';data.title||=data.category;data.status||='prévue';}
          if (data.kind === 'carnet') data.category ||= pp.CARNET_TYPES[0];
          if (data.kind === 'council') { data.trimester = st.trimester; data.category ||= 'avis'; if (!data.text?.trim()) throw new Error('Renseignez l’appréciation.'); }
          result = pp.saveEntry(data, st.editId ? db.get('ppRecords', st.editId) : null);
          await db.flush();
          await db.verifyStored('ppRecords', result.entry.id, result.entry.updatedAt);
        }
        if(draftKey()===context&&JSON.stringify(st.form)===formSnapshot&&st.file===fileSnapshot&&st.editId===originalEdit){st.form = {}; st.editId = null; st.file = null; st.editorOpen=false; keepDraft();}else if(draftKey()!==context){const draft=drafts.get(context);if(draft&&JSON.stringify(draft.form)===formSnapshot&&draft.file===fileSnapshot&&draft.editId===originalEdit)drafts.delete(context);}
        if(draftKey()===context&&['note','progress'].includes(result.entry?.kind))st.notesView='active';
        refresh();
        toast({ text: 'Enregistré sur cet appareil. Drive prend le relais si la synchronisation est activée.', undo: async () => { await result.undo(); refresh(); }, ms: 6000 });
      } catch (e) { if(result?.undo){await result.undo();await db.flush();}toast({ text: e.message, ms: 6000 }); }
      finally { st.busy = false; const b = document.querySelector('[data-click="save"]'); if (b) { b.disabled = false; b.textContent = 'Enregistrer'; } }
    },
    async task(el) {
      let result;try { const r = db.get('ppRecords', el.dataset.id);result=pp.saveEntry({ ...r, status: el.checked ? 'done' : 'todo' }, r); await db.flush();await db.verifyStored('ppRecords',result.entry.id,result.entry.updatedAt);refresh(); }
      catch (e) { if(result?.undo){await result.undo();await db.flush();}toast({ text: e.message }); refresh(); }
    },
    async taskLink(el){const ref=el.dataset.ref;if(ref.startsWith('event:')){const {openStudentEvent}=await import('./semaine.js');openStudentEvent(st.studentId,ref.slice(6));return;}const rows=pp.latest({studentId:st.studentId}).filter(r=>r.entityId===ref.slice(7));const row=rows[0];if(!row){toast({text:'Élément lié indisponible'});return;}if(row.kind==='meetingPreparation'){go('#/pp/eleve/'+st.studentId+'/preparer-rdv/note/'+row.id);return;}if(row.kind==='procedure'){go('#/pp/eleve/'+st.studentId+'/demarches/'+row.id);return;}const tab={council:'conseils',document:'documents',note:'journal',progress:'journal',measure:'vie'}[row.kind];if(!tab||!tabs().some(t=>t[0]===tab)){toast({text:'Ouvrez ou activez le module de cet élément.'});return;}keepDraft();st.tab=tab;if(row.kind==='council')st.trimester=row.trimester;restoreDraft();refresh();document.querySelector('[data-record-id="'+CSS.escape(row.id)+'"]')?.scrollIntoView({block:'center'});},
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
