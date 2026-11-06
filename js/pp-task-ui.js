import * as pp from './pp.js';
import {html,fmtDate} from './ui.js';
import {TASK_STATES} from './pp-task-rules.js';
export function taskLinkOptions(studentId,entityId){
  const student=pp.requireStudent(studentId);
  const events=pp.meetingsOf(studentId).filter(e=>!e.cancelled&&(!e.classId||e.classId===student.classId)).map(e=>({value:'event:'+e.id,label:(e.titre||'Réunion')+' · '+e.date}));
  const records=pp.latest({studentId}).filter(r=>r.classId===student.classId&&!r.archivedAt&&r.entityId!==entityId&&['council','document','note','progress','measure','procedure','meetingPreparation','alertState'].includes(r.kind)).map(r=>({value:'record:'+r.entityId,label:(r.title||r.subject||r.category||'Suivi')+' · '+(r.date||String(r.at||'').slice(0,10))}));
  return [...events,...records];
}
export function taskExtraFields(form,studentId){
  const links=taskLinkOptions(studentId,form.entityId);
  const heads=pp.latest({studentId,kind:'task'}).filter(r=>r.entityId===form.entityId);
  return html`<label class="lbl">État<select class="input" data-change="form" data-key="status">${Object.entries(TASK_STATES).map(([key,label])=>html`<option value="${key}" ${(form.status||'todo')===key?'selected':''}>${label}</option>`)}</select></label>
  <label class="lbl">Qui doit agir ? (suivi personnel)<input class="input" maxlength="240" data-input="form" data-key="assignedTo" value="${form.assignedTo||''}"></label>
  <label class="lbl">Rattacher à un élément<select class="input" data-change="form" data-key="related"><option value="">Aucun lien</option>${links.map(r=>html`<option value="${r.value}" ${form.related===r.value?'selected':''}>${r.label}</option>`)}${form.related&&!links.some(r=>r.value===form.related)?html`<option value="${form.related}" selected>Élément ancien ou indisponible · lien conservé</option>`:''}</select></label>
  <label class="lbl">Bilan prévu le<input type="date" class="input" data-input="form" data-key="reviewDate" value="${form.reviewDate||''}"></label>
  <label class="lbl">Résultat observé<textarea class="field" rows="3" maxlength="10000" data-input="form" data-key="outcome">${form.outcome||''}</textarea></label><label class="lbl">Suite à donner<textarea class="field" rows="3" maxlength="10000" data-input="form" data-key="nextStep">${form.nextStep||''}</textarea></label>${heads.length>1?html`<label class="check-row"><input type="checkbox" data-change="taskResolve" ${form.resolveConcurrent?'checked':''}>Retenir cette version de l’action, historique conservé.</label>`:''}<p class="muted small">Aucun message ni rappel externe n’est envoyé à la personne indiquée.</p>`;
}
export function taskExtraView(row){
  const link=row.related&&taskLinkOptions(row.studentId,row.entityId).find(r=>r.value===row.related);
  return html`<span class="chip">${TASK_STATES[row.status]||'À faire'}</span>${row.assignedTo?html`<p class="small">À suivre par : ${row.assignedTo}</p>`:''}${row.reviewDate?html`<p class="small">Bilan prévu : ${fmtDate(row.reviewDate)}</p>`:''}${row.completedAt?html`<p class="small">Réalisée le ${fmtDate(row.completedAt)}</p>`:''}${row.related?html`<p class="small">Élément lié : ${link?.label||'ancien élément conservé dans l’historique'}</p>${link?html`<button class="btn small" data-click="taskLink" data-ref="${row.related}">Ouvrir l’élément lié</button>`:''}`:''}${row.outcome?html`<h4>Résultat observé</h4><div class="pp-record-text">${row.outcome}</div>`:''}${row.nextStep?html`<h4>Suite à donner</h4><div class="pp-record-text">${row.nextStep}</div>`:''}`;
}
