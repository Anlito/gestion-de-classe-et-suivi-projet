import * as db from './db.js';
import * as model from './model.js';
import * as pp from './pp.js';
export const LEVELS=['excellent','très bon','satisfaisant','contrasté','fragile','difficile'];
export function scopeOf(params){
  const trimester=Number(params.trimester);if(![1,2,3].includes(trimester)||!pp.enabled('conseils'))throw Error('Choisissez un trimestre et activez Conseils.');
  const student=params.studentId?pp.requireStudent(params.studentId):null,classId=student?.classId||params.classId;
  if(!pp.active(classId))throw Error('Cette classe n’a pas de suivi PP actif.');
  return {studentId:student?.id||null,classId,trimester,year:model.schoolYear()};
}
export const adviceOf=scope=>pp.latest({classId:scope.classId,kind:'council'}).filter(r=>(r.studentId||null)===scope.studentId&&r.trimester===scope.trimester&&r.category!=='synthese'&&!r.testMode&&r.text?.trim());
const sentence=text=>String(text||'').trim().replace(/[.!?…]+$/u,'').trim()+'.';
export function composeDraft(name,collective,form){
  if(!LEVELS.includes(form.level))throw Error('Choisissez votre bilan du trimestre.');
  if(!form.facts?.trim()||!form.goals?.trim())throw Error('Renseignez les constats et les conseils avant de préparer le texte.');
  const target=collective?'de la classe '+name:(/^[aeiouyàâéèêëîïôöùûüœh]/iu.test(name)?'d’':'de ')+name;
  const lines=[sentence('Le trimestre '+target+' est '+form.level+' : '+form.facts.trim())];
  if(form.nuance?.trim())lines.push(sentence(form.nuance));
  lines.push(sentence('Pour '+(form.level==='excellent'||form.level==='très bon'?'continuer à progresser':'progresser')+', '+form.goals.trim()));
  if(form.praise?.trim())lines.push(sentence(form.praise));
  return lines.join('\n');
}
export function checkedAdvice(scope,ids){
  const rows=adviceOf(scope),selected=ids.map(id=>rows.find(r=>r.id===id));
  if(!selected.length||selected.some(r=>!r))throw Error('Choisissez au moins un avis actuel de ce trimestre. Une source a peut-être changé.');
  if(new Set(selected.map(r=>r.entityId)).size!==selected.length)throw Error('Retenez une seule version de chaque avis.');
  return selected;
}
export async function saveDraft(params,text,sourceIds,previous=null){
  const scope=scopeOf(params);checkedAdvice(scope,sourceIds);
  if(!text?.trim()||text.length>20000)throw Error('Renseignez un brouillon de 20 000 caractères maximum.');
  if(previous&&!pp.latest({classId:scope.classId,kind:'council'}).some(r=>r.id===previous.id&&r.status==='draft'&&r.studentId===scope.studentId&&r.trimester===scope.trimester))throw Error('Ce brouillon a changé. Rouvrez-le depuis Conseils.');
  const id=db.uid(),row={...scope,id,entityId:previous?.entityId||id,parents:previous?[previous.id]:[],kind:'council',category:'synthese',status:'draft',title:'Appréciation préparée',at:new Date().toISOString(),text:text.trim(),writingBasis:{method:'guided-v1',sourceIds:[...new Set(sourceIds)]},testMode:false};
  const undo=db.commit(w=>w.put('ppRecords',row));try{await db.flush();await db.verifyStored('ppRecords',row.id,row.updatedAt);}catch(e){await undo();throw e;}return row;
}
