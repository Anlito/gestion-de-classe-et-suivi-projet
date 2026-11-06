import * as db from '../db.js';
import * as model from '../model.js';
import * as pp from '../pp.js';
import { parseFile, fileHash, suggestStudent, importProblems, importClassDifferences, renderPDFPage, isMasteryLayout, previousResultText } from '../pronote-import.js';
import { alreadyImported, buildImport, commitImport } from '../pp-import-store.js';
import { html, toast, fmtDate } from '../ui.js';
import { backLink, saveStatus } from '../components.js';
import { go, refresh } from '../nav.js';

let st = { classId: '', key: null, file: null, parsed: null, preview: null, hash: '', mappings: [], busy: false, error: '', result: null, confirmed: false, testMode: false };
let url = null;
let generation = 0;
let classSources = [];
const importOptions=()=>({testMode:st.testMode,classCorrespondence:{classId:st.classId,sourceClasses:classSources}});
function proposeMappings() {
  classSources=[];
  const pupils = model.studentsOf(st.classId);
  st.mappings = (st.parsed?.rows || []).map(row => {
    if (!row.identityCandidates) return suggestStudent(row.label, pupils, row.ambiguous);
    const ids = [...new Set(row.identityCandidates.map(label => suggestStudent(label, pupils)).filter(Boolean))];
    return ids.length === 1 ? ids[0] : '';
  });
  st.confirmed = false;
}
function proposal() {
  if (!st.parsed) return { errors: [], plan: null };
  const options = importOptions();
  const errors = importProblems(st.parsed, st.mappings, db.get('classes', st.classId), model.schoolYear(), model.studentsOf(st.classId), options);
  if (alreadyImported(st.hash, st.classId, options)) errors.unshift('Ce fichier a déjà été validé pour cette classe.');
  let plan = null;
  if (!errors.length) { try { plan = buildImport(st.parsed, st.mappings, st.classId, st.hash, options); } catch (e) { errors.push(e.message); } }
  return { errors, plan };
}
function details() {
  if (!st.parsed) return html`<p class="muted">Choisissez un fichier pour afficher les données proposées.</p>`;
  if (st.parsed.profile === 'roster') return html`<p>Les correspondances sont vérifiées et enregistrées dans un rapport d’import.</p><p class="muted small">Aucun élève n’est créé, renommé ou supprimé. Les colonnes administratives et les coordonnées ne sont pas recopiées dans les fiches.</p>`;
  if (['attendance','discipline'].includes(st.parsed.profile)) return html`<div class="stack-tight"><strong>Du ${fmtDate(st.parsed.period[0])} au ${fmtDate(st.parsed.period[1])}</strong><span class="muted small">${st.parsed.sourceSchool} · effectif et totaux du PDF vérifiés.</span>${st.parsed.rows.map(r=>html`<article class="pp-record"><strong>${r.label}</strong>${st.parsed.columns.filter(c=>st.parsed.profile==='attendance'||r.metrics[c.id]>0).map(c=>html`<span class="muted small">${c.label} : ${r.metrics[c.id]??'—'} ${c.unit}</span>`)}</article>`)}</div>`;
  const row = st.parsed.rows[0];
  return html`<div class="stack-tight"><span class="chip">Trimestre ${st.parsed.trimester || '?'} · ${st.parsed.year || 'année inconnue'}</span>
    ${row.subjects.map(s => html`<article class="pp-record"><strong>${s.subject}</strong><span class="muted small">${s.teacher || 'Professeur non reconnu'} · page ${s.sourcePage}</span>
      ${isMasteryLayout(st.parsed.layout) ? html`<div class="chip">${s.mastery ? `${s.mastery.value}/4 · ${s.mastery.label}` : 'Positionnement non renseigné ou à vérifier'}</div>${s.competenciesRaw ? html`<details><summary>Compétences évaluées</summary><div class="pp-record-text muted small">${s.competenciesRaw}</div></details>` : ''}<p class="muted small">Le détail coloré des évaluations reste consultable dans le PDF.</p>` : html`<div class="muted small">Élève : ${s.studentResults.map(g => g.raw).join(' / ') || 'pas de moyenne'} · Classe : ${s.classResults.map(g => g.raw).join(' / ') || 'pas de moyenne'}</div>${s.noteCountRaw ? html`<div class="muted small">Nombre de notes : ${s.noteCountRaw}</div>` : ''}${s.rangeRaw ? html`<div class="muted small">Bornes de la classe : ${s.rangeRaw}</div>` : ''}`}
      ${s.previousResults?.map(p => html`<div class="muted small">Rappel T${p.trimester} : ${previousResultText(p)}</div>`)}
      ${s.mastery && !isMasteryLayout(st.parsed.layout) ? html`<span class="chip">Positionnement : ${s.mastery.value}/4 · ${s.mastery.label}</span>` : ''}
      ${s.nonRepresentative ? html`<span class="chip warn">NR · moyenne non représentative</span>` : ''}
      <div class="pp-record-text">${s.appreciation || 'Appréciation non renseignée'}</div></article>`)}
    <h3>Appréciation globale du bulletin</h3><div class="pp-record-text">${row.generalAppreciation || 'Non renseignée'}</div><p class="muted small">Conservée comme texte source, sans remplacer votre synthèse personnelle.</p>${[row.mentionsRaw, row.orientationRaw, row.engagementsRaw].filter(Boolean).map(t => html`<div class="pp-record-text info-box">${t}</div>`)}</div>`;
}
export default {
  render(params) {
    if (!pp.hasPP()) { go('#/pp', { replace: true }); return null; }
    if (!pp.enabled('imports')) return html`<div class="screen"><header class="topbar">${backLink('#/pp', 'Suivi PP')}<span class="title">Imports Pronote</span></header><main class="content pp-empty"><p>L’outil Imports est masqué.</p><a class="btn accent" href="#/admin/outils">Mes outils</a></main></div>`;
    const key = params.classId || '';
    if (st.key !== key) { st.key = key; st.classId = pp.active(key) ? key : pp.classes().length === 1 ? pp.classes()[0].id : ''; if (st.parsed) proposeMappings(); }
    const pupils = model.studentsOf(st.classId), { errors, plan } = proposal();
    const batches = db.where('ppRecords', r => r.kind === 'importBatch' && r.classId === st.classId && r.year === model.schoolYear()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return html`<div class="screen pp-screen"><header class="topbar">${backLink(st.classId ? `#/pp/classe/${st.classId}` : '#/pp', 'Suivi PP')}<span class="title">Imports Pronote</span><div class="spacer"></div>${saveStatus()}</header>
      <div class="pp-toolbar pp-import-toolbar"><label class="lbl">Classe PP<select class="input" data-change="target" ${st.busy ? 'disabled' : ''}><option value="">Choisir la classe</option>${pp.classes().map(c => html`<option value="${c.id}" ${st.classId === c.id ? 'selected' : ''}>${c.name}</option>`)}</select></label>
      ${st.classId&&pp.enabled('vieScolaire')?html`<a class="btn" href="#/pp/imports/${st.classId}/csv">Configurer un autre CSV</a>`:''}<label class="lbl grow">CSV élèves ou rapport PDF<input class="input" type="file" accept=".csv,.pdf" data-change="file" ${st.busy ? 'disabled' : ''}></label><span class="muted small">${st.busy ? 'Lecture locale en cours…' : 'Aucun envoi à Pronote'}</span></div>
      <main class="content pp-import-grid">
      <section class="panel"><div class="panel-head"><span class="panel-title">1. Correspondances</span><span class="muted small">${st.parsed ? st.parsed.label : 'Choisir un fichier'}</span></div><div class="panel-scroll" data-scroll="import-matches">
        ${st.parsed?.rows.length>1 && st.mappings.some(id=>!id) ? html`<button class="btn soft small" data-click="ignoreUnmatched" ${st.busy?'disabled':''}>Ignorer les lignes sans correspondance</button><p class="muted small">Les associations déjà choisies sont conservées.</p>`:''}
        ${st.error ? html`<div class="info-box" role="alert">${st.error}</div>` : ''}
        ${st.parsed ? html`<p class="muted small">${st.file.name} · ${st.parsed.rows.length} ligne(s) · classe source : ${st.parsed.sourceClass || 'à confirmer'}</p>${st.parsed.rows.map((r, i) => html`<label class="lbl pp-import-match">${r.label}<span class="muted small">Ligne source ${r.sourceRow}${r.ambiguous ? ' · identité ambiguë' : ''}</span><select class="input" data-change="mapping" data-index="${i}"><option value="">Choisir l’élève</option><option value="skip" ${st.mappings[i] === 'skip' ? 'selected' : ''}>Ignorer cette ligne</option>${pupils.map(p => html`<option value="${p.id}" ${st.mappings[i] === p.id ? 'selected' : ''}>${model.fullName(p)}</option>`)}</select></label>`)}` : html`<p class="muted">Profils disponibles : liste des élèves CSV et bulletins PDF de la famille de modèles vérifiée.</p><p class="muted small">Les relevés d’assiduité et de punitions des modèles vérifiés sont également acceptés.</p>`}
        ${batches.length ? html`<h3 class="pp-source-title">Imports validés</h3>${batches.map(b => html`<div class="pp-record"><strong>${b.testMode ? 'TEST · ' : ''}${b.fileName}</strong><span class="muted small">${fmtDate(b.at)} · ${b.matched} correspondance(s) · ${b.avisAdded || 0} avis ajoutés</span></div>`)}` : ''}
      </div></section>
      <section class="panel"><div class="panel-head"><span class="panel-title">2. Document source</span>${url ? html`<a class="btn soft small" href="${url}" target="_blank" rel="noopener">Ouvrir le PDF</a>` : ''}</div>${st.preview ? html`<div class="pp-preview-pages"><button class="btn soft small" data-click="previewPage" data-page="${st.preview.page - 1}" ${st.busy || st.preview.page <= 1 ? 'disabled' : ''}>←</button><span>Page ${st.preview.page} / ${st.preview.pages}</span><button class="btn soft small" data-click="previewPage" data-page="${st.preview.page + 1}" ${st.busy || st.preview.page >= st.preview.pages ? 'disabled' : ''}>→</button></div>` : ''}<div class="pp-import-preview">${st.preview ? html`<div class="pp-pdf-scroll"><img alt="Bulletin source à vérifier" src="${st.preview.src}"></div>` : st.parsed ? html`<div class="panel-scroll"><table class="pp-import-table"><thead><tr><th>Ligne</th><th>Élève source</th><th>Classe source</th></tr></thead><tbody>${st.parsed.rows.map(r => html`<tr><td>${r.sourceRow}</td><td>${r.label}</td><td>${r.sourceClass || '—'}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Le document et les propositions seront affichés côte à côte.</p>`}</div></section>
      <section class="panel"><div class="panel-head"><span class="panel-title">3. Vérifier et valider</span></div><div class="panel-scroll" data-scroll="import-details">
        ${st.result ? html`<div class="info-box" role="status"><strong>Import enregistré sur cet appareil</strong>${st.result.testMode ? html`<span class="chip warn">TEST</span>` : ''}<p>${st.result.matched} correspondance(s), ${st.result.batch.reportRows ? st.result.batch.reportRows+' relevé(s) élève enregistré(s).' : st.result.batch.avisAdded+' avis ajoutés.'} ${st.result.conflicts.length} avis retouché(s) conservé(s) sans remplacement.</p></div>` : ''}
        ${details()}
        ${st.parsed&&st.classId&&!st.testMode&&!st.result?importClassDifferences(st.parsed,st.mappings,db.get('classes',st.classId)).map(source=>html`<div class="info-box pp-source-title"><label class="check-row"><input type="checkbox" data-change="classCorrespondence" data-source="${source}" ${classSources.includes(source)?'checked':''} ${st.busy?'disabled':''}> La classe « ${source} » du document correspond bien à « ${db.get('classes',st.classId)?.name} » dans mon Carnet.</label><p class="muted small">Vérifiez le collège et les élèves. Cette correspondance vaut uniquement pour ce fichier et cette classe ; les classes ne sont pas fusionnées.</p></div>`):''}
        ${st.parsed?.warnings.map(w => html`<p class="muted small pp-source-title">${w}</p>`) || ''}
        ${errors.length && !st.result ? html`<div class="info-box pp-source-title" role="status">${errors.slice(0, 4).map(e => html`<p>${e}</p>`)}${errors.length > 4 ? html`<p>${errors.length - 4} autre(s) ligne(s) à vérifier.</p>` : ''}</div>` : ''}
        ${plan ? html`<div class="info-box pp-source-title">${plan.matched} élève(s) associé(s) · ${plan.records.some(r=>r.kind==='periodReport')?plan.records.filter(r=>r.kind==='periodReport').length+' relevé(s) élève' : plan.records.filter(r=>r.kind==='council').length+' nouvel avis' }.<br>${plan.conflicts.length} avis retouché(s) ne seront pas remplacés.</div>` : ''}
      </div><div class="pp-panel-foot pp-import-footer">
        ${st.parsed && st.parsed.profile !== 'roster' ? html`<div class="pp-import-test"><label class="check-row"><input type="checkbox" data-change="testMode" ${st.testMode ? 'checked' : ''} ${st.busy ? 'disabled' : ''}> Essai avec des élèves fictifs</label><p>Source : ${st.parsed.sourceClass || '?'} · ${st.parsed.year || '?'} → ${db.get('classes', st.classId)?.name || 'classe à choisir'} · ${model.schoolYear()}</p>${st.testMode ? html`<p><strong>TEST :</strong> l’année et la classe peuvent différer. Les données et le PDF seront enregistrés dans les fiches choisies, marqués TEST, et inclus dans les sauvegardes et Drive si activé.</p>` : ''}</div>` : ''}
        ${st.result ? html`<p class="pp-import-blocked" role="status">Import terminé. Choisissez le fichier suivant pour continuer.</p>` : plan ? html`<label class="check-row"><input type="checkbox" data-change="confirm" ${st.confirmed ? 'checked' : ''} ${st.busy ? 'disabled' : ''}> ${st.testMode ? 'Je confirme l’association à des élèves fictifs et l’enregistrement TEST.' : 'J’ai vérifié la classe, les élèves et les données proposées.'}</label>` : errors.length ? html`<p class="pp-import-blocked" role="status">Import bloqué : ${errors[0]}${errors.length > 1 ? ` (+ ${errors.length - 1} autre point à vérifier)` : ''}</p>` : ''}
        <div class="pp-import-submit"><span class="muted small">${st.testMode ? 'Mode TEST · validation obligatoire' : 'Enregistrement après validation uniquement.'}</span><button class="btn accent" data-click="validate" ${!plan || !st.confirmed || st.busy ? 'disabled' : ''}>Valider l’import</button></div></div></section>
      </main></div>`;
  },
  leave() { generation++;classSources=[]; if (url) URL.revokeObjectURL(url); url = null; st = { ...st, busy: false, error: '', file: null, parsed: null, preview: null, result: null, hash: '', mappings: [], confirmed: false, testMode: false, key: null }; },
  actions: {
    ignoreUnmatched() { if(st.busy)return;st.mappings=st.mappings.map(id=>id||'skip');st.confirmed=false;st.result=null;refresh(); },
    target(el) { st.classId = el.value; st.result = null; st.testMode = false; if (st.parsed) proposeMappings(); refresh(); },
    classCorrespondence(el){if(st.busy)return;classSources=classSources.filter(s=>s!==el.dataset.source);if(el.checked)classSources.push(el.dataset.source);st.confirmed=false;refresh();},
    testMode(el) { if (st.busy) return; st.testMode = el.checked; st.confirmed = false; st.result = null; refresh(); },
    mapping(el) { st.mappings[Number(el.dataset.index)] = el.value; st.confirmed = false; refresh(); },
    confirm(el) { st.confirmed = el.checked; const b = document.querySelector('[data-click="validate"]'); if (b) b.disabled = !st.confirmed || !!proposal().errors.length; },
    async file(el) {
      if (!el.files?.[0]) return;
      const token = ++generation, file = el.files[0];
      if (url) URL.revokeObjectURL(url); url = null;
      st.file = file; st.busy = true; st.error = ''; st.parsed = null; st.preview = null; st.result = null; st.confirmed = false; st.testMode = false; refresh();
      try { const parsed = await parseFile(file), hash = await fileHash(file), preview = parsed.profile !== 'roster' ? await renderPDFPage(file) : null; if (token !== generation) return; if (parsed.rows.length > 1000) throw new Error('Plus de 1 000 lignes : scindez ce fichier avant import.'); st.parsed = parsed; st.preview = preview; st.hash = hash; proposeMappings(); if (st.parsed.profile !== 'roster') url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' })); }
      catch (e) { if (token === generation) st.error = e.message; }
      finally { if (token === generation) { st.busy = false; refresh(); } }
    },
    async previewPage(el) {
      if (st.busy || !st.preview) return;
      const token = generation; st.busy = true; refresh();
      try { const preview = await renderPDFPage(st.file, Number(el.dataset.page)); if (token === generation) st.preview = preview; }
      catch (e) { if (token === generation) st.error = e.message; }
      finally { if (token === generation) { st.busy = false; refresh(); } }
    },
    async validate() {
      if (st.busy || !st.confirmed || proposal().errors.length) return;
      const token = generation;
      st.busy = true; st.error = ''; refresh();
      try { const result = await commitImport(st.parsed, st.mappings, st.classId, st.hash, st.file, importOptions()); if (token === generation) { st.result = result; st.confirmed = false; } toast({ text: `${result.testMode ? 'TEST · ' : ''}Import enregistré localement ; synchronisation Drive si activée.`, ms: 5000 }); }
      catch (e) { if (token === generation) st.error = e.message; else toast({ text: e.message, ms: 6000 }); }
      finally { if (token === generation) { st.busy = false; refresh(); } }
    },
  },
};
