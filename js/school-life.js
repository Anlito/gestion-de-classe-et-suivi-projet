import * as pp from './pp.js';
import { PP_ROLES as ROLES, MEASURE_TYPES as MEASURES } from './pp-rules.js';
import { html,fmtDate } from './ui.js';
import { latestReportHeads,ATTENDANCE } from './pronote-recap.js';

const periodText=r=>`${fmtDate(r.period[0])} → ${fmtDate(r.period[1])}`;
// Libellés de présentation uniquement : conserver les colonnes source et leurs identifiants.
export function disciplineColumnInfo(column) {
  const raw=String(column.raw||'').trim().toLocaleLowerCase('fr');
  const known=[['c0',/^ex(?:clu)?\.$/,'Exclusions de cours','Exclusion de cours'],['c1',/^ret(?:e)?\.$/,'Retenues','Retenue'],['c2',/^de(?:vo)?\.$/,'Devoirs supplémentaires','Travail supplémentaire']].find(([id,pattern])=>column.id===id&&pattern.test(raw));
  return known?{label:known[2],category:known[3]}:{label:column.label};
}
export function measureExtras(r) {
  return html`<div class="muted small">${r.authorRole || 'Auteur non renseigné'}${r.authorName?' · '+r.authorName:''} · ${r.status||'prévue'}${r.plannedDate?' · prévue le '+fmtDate(r.plannedDate):''}</div><div class="pp-record-text">${r.reason || ''}</div><span class="muted small">${r.reportEntityId?'Déjà comprise dans un relevé : aucun ajout au cumul.':'Mesure indépendante, séparée des cumuls importés.'}${r.durationMinutes!=null?' · durée renseignée : '+r.durationMinutes+' min':''}</span>`;
}
export function schoolHistory(studentId, detailViews = []) {
  const rows=pp.records({studentId,kind:'periodReport'}), details=pp.latest({studentId,kind:'measure'});
  return html`<div class="pp-school-history">${['attendance','discipline'].map(profile=>{
    const reports=latestReportHeads(rows,profile);
    return html`<section class="pp-school-column" data-school-profile="${profile}"><h3>${profile==='attendance'?'Absences et retards':'Punitions et sanctions'}</h3><div class="pp-school-column-body">${reports.length?reports.map((r,n)=>{
      const conflicts=reports.filter(x=>x.entityId===r.entityId).length>1;
      return html`<article class="pp-record"><strong>${periodText(r)}</strong><span class="muted small">${r.sourceSchool||''} · ${r.sourceClass||''}${r.testMode?' · TEST':''}${n===0?' · période la plus récente':''}</span>
        ${conflicts?html`<span class="chip warn">Versions concurrentes : vérifier les relevés</span>`:''}
        ${profile==='attendance'?ATTENDANCE.map(([key,label,unit])=>html`<span>${label} : <strong>${r.metrics[key]??'—'}</strong> ${unit}</span>`):r.columns.filter(c=>disciplineColumnInfo(c).category||r.metrics[c.id]>0||details.some(d=>d.reportEntityId===r.entityId&&d.columnId===c.id)).map(c=>{
          const count=new Set(details.filter(d=>d.reportEntityId===r.entityId&&d.columnId===c.id).map(d=>d.entityId||d.id)).size;
          const info=disciplineColumnInfo(c);
          return html`<div class="pp-school-counter stack"><span>${info.label} : <strong>${r.metrics[c.id]??'—'}</strong></span>${r.metrics[c.id]>0?html`<span class="muted small">${count} détail(s) renseigné(s) sur ${r.metrics[c.id]} mesure(s) importée(s).</span>`:''}${count>r.metrics[c.id]?html`<span class="chip warn">Écart à vérifier</span>`:''}${info.category&&r.metrics[c.id]>0&&!conflicts?html`<button class="btn soft small" data-click="completeReportMeasure" data-id="${r.id}" data-column="${c.id}">Ajouter les détails · ${info.category}</button>`:''}</div>`;
        })}
        ${profile==='discipline'?html`<span class="muted small">Le relevé indique un nombre de mesures. La durée des retenues, les dates, l’auteur et le motif sont à compléter s’ils sont connus.</span>`:''}
        <span class="muted small">Cumul de cette période uniquement. Aucun total avec les autres relevés ou les appels du Carnet.</span><button class="btn soft small" data-click="preview" data-id="${r.importBatchId}">Ouvrir le relevé source</button></article>`;
    }):html`<p class="muted small">${profile==='attendance'?'Aucun relevé d’absences et de retards importé.':'Aucun relevé de punitions importé.'}</p>`}
    ${profile==='discipline'&&detailViews.length?html`<h4>Détails et mesures saisies</h4>${detailViews}`:''}</div></section>`;
  })}</div>`;
}
export function measureEditor(form,studentId) {
  const reports=latestReportHeads(pp.records({studentId,kind:'periodReport'}),'discipline');
  const selected=reports.find(r=>r.entityId===form.reportEntityId);
  const input=(key,label,type='text')=>html`<label class="lbl">${label}<input class="input" type="${type}" data-input="form" data-key="${key}" value="${form[key]??''}" ${type==='number'?'min=0 step=1':''}></label>`;
  return html`<div class="stack pp-editor-stack"><label class="lbl">Lien avec un relevé<select class="input" data-change="schoolReport"><option value="">Mesure indépendante</option>${reports.map(r=>html`<option value="${r.entityId}" ${selected?.id===r.id?'selected':''}>Déjà comprise · ${periodText(r)}${r.testMode?' · TEST':''}</option>`)}</select></label>
    ${selected?html`<label class="lbl">Colonne du compteur<select class="input" data-change="form" data-key="columnId"><option value="">Choisir la colonne source</option>${selected.columns.map(c=>html`<option value="${c.id}" ${form.columnId===c.id?'selected':''}>${disciplineColumnInfo(c).label} (${selected.metrics[c.id]})</option>`)}</select></label>`:''}
    <label class="lbl">Type de mesure<select class="input" data-change="form" data-key="category">${MEASURES.map(k=>html`<option ${form.category===k?'selected':''}>${k}</option>`)}</select></label>
    ${input('date','Date de la mesure, si connue','date')}<label class="lbl">Rôle de l’auteur<select class="input" data-change="form" data-key="authorRole"><option value="">Non renseigné</option>${ROLES.map(k=>html`<option ${form.authorRole===k?'selected':''}>${k}</option>`)}</select></label>
    ${input('authorName','Nom de l’auteur (facultatif)')}${input('reason','Motif')}
    <label class="lbl">Détail / compte rendu<textarea class="field" data-input="form" data-key="text" rows="4">${form.text||''}</textarea></label>
    ${input('plannedDate','Date prévue (facultative)','date')}${input('durationMinutes','Durée connue en minutes (facultative)','number')}
    <label class="lbl">État<select class="input" data-change="form" data-key="status">${['prévue','effectuée','reportée','annulée'].map(k=>html`<option ${form.status===k?'selected':''}>${k}</option>`)}</select></label><p class="muted small">Aucune durée n’est déduite du nombre de retenues. Les compléments ne gonflent pas les compteurs importés.</p></div>`;
}
export function classReportSummary(classId) {
  if(!pp.enabled('vieScolaire'))return '';
  const rows=pp.latest({classId,kind:'periodReport'}), groups=new Map();
  rows.forEach(r=>{const key=[r.profile,r.period.join('|'),r.sourceSchool,r.testMode].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
  if(!groups.size)return '';
  return html`<details class="pp-bulletin-results"><summary>Relevés de vie scolaire importés</summary>${[...groups.values()].map(list=>{
    const r=list[0], conflict=new Set(list.map(r=>r.entityId)).size!==list.length;
    return html`<article class="pp-record"><strong>${r.profile==='attendance'?'Assiduité':'Mesures'} · ${periodText(r)}${r.testMode?' · TEST':''}</strong><span>${new Set(list.map(r=>r.studentId)).size} élève(s) associé(s)${conflict?' · versions concurrentes à vérifier':''}</span>${!conflict&&r.profile==='attendance'?html`<span class="muted small">${list.reduce((s,r)=>s+r.metrics.halfDays,0)} demi-journées · ${list.reduce((s,r)=>s+r.metrics.lateCount,0)} retards (élèves associés uniquement)</span>`:!conflict?html`${r.columns.map(c=>({label:disciplineColumnInfo(c).label,value:list.reduce((s,r)=>s+(r.metrics[c.id]||0),0)})).filter(c=>c.value>0).map(c=>html`<span class="muted small">${c.label} : ${c.value} mesure(s) pour les élèves associés</span>`)}`:''}<button class="btn soft small" data-click="preview" data-id="${r.importBatchId}">Ouvrir un relevé source de cette période</button></article>`;
  })}<p class="muted small">Périodes séparées ; les élèves absents du relevé ne sont pas considérés à zéro.</p></details>`;
}
