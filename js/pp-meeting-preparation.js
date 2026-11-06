import * as db from './db.js';
import * as pp from './pp.js';
import {followupScope,checkedDate,bounded,followupVersion,persistFollowup} from './pp-followup-core.js';
export function preparations(studentId){const scope=followupScope(studentId,'preparation');return pp.latest({studentId,kind:'meetingPreparation'}).filter(r=>r.classId===scope.classId);}
export function preparationSources(studentId,from='',to=''){
  const scope=followupScope(studentId,'preparation');checkedDate(from,'le début de période');checkedDate(to,'la fin de période');if(from&&to&&from>to)throw Error('La fin de période précède le début.');
  const tools={note:'notes',progress:'notes',carnet:'carnet',measure:'vieScolaire',task:'actions',council:'conseils',periodReport:'vieScolaire',meetingPreparation:'preparation'};
  return pp.latest({studentId}).filter(r=>r.classId===scope.classId&&!r.testMode&&pp.enabled(tools[r.kind])).filter(r=>{if(r.kind==='periodReport'&&Array.isArray(r.period))return (!from||r.period[1]>=from)&&(!to||r.period[0]<=to);const date=r.date||'';return !date||(!from||date>=from)&&(!to||date<=to);});
}
export function preparationEvents(studentId){const s=pp.requireStudent(studentId);return pp.meetingsOf(studentId).filter(e=>!e.cancelled&&(!e.classId||e.classId===s.classId));}
export async function savePreparation(studentId,data,previousId=null){
  const scope=followupScope(studentId,'preparation'),title=bounded(data.title,240);if(!title)throw Error('Renseignez l’objet de la rencontre.');
  if(!['prepared','completed'].includes(data.status))throw Error('Choisissez l’état de la rencontre.');
  const previous=previousId&&db.get('ppRecords',previousId),eventId=String(data.eventId||'');
  if(eventId&&!preparationEvents(studentId).some(e=>e.id===eventId)&&eventId!==previous?.eventId)throw Error('La réunion ne correspond pas à cet élève.');
  const from=checkedDate(data.from,'le début de période'),to=checkedDate(data.to,'la fin de période'),sources=preparationSources(studentId,from,to),sourceIds=[...new Set(data.sourceIds||[])];
  if(sourceIds.includes(previousId)||sourceIds.some(id=>!sources.some(r=>r.id===id)&&!previous?.sourceIds?.includes(id)))throw Error('Un élément retenu a changé. Actualisez les faits avant de l’ajouter.');
  const row=followupVersion('meetingPreparation',scope,{title,status:data.status,eventId,date:checkedDate(data.date,'la date de rencontre'),from,to,sourceIds,questions:bounded(data.questions),account:bounded(data.account),decisions:bounded(data.decisions),nextSteps:bounded(data.nextSteps),followupDate:checkedDate(data.followupDate,'la date du prochain point')},previousId,data.resolveConcurrent===true,data.expectedHeads);
  return persistFollowup([row]);
}
export function preparationTasks(row){return pp.latest({studentId:row.studentId,kind:'task'}).filter(r=>r.related==='record:'+row.entityId);}
export async function planPreparationFollowup(id){
  const row=db.get('ppRecords',id);if(!row||row.kind!=='meetingPreparation')throw Error('Rencontre introuvable.');
  const heads=preparations(row.studentId).filter(r=>r.entityId===row.entityId);if(heads.length!==1||heads[0].id!==id)throw Error('Retenez d’abord la version actuelle de cette rencontre.');
  if(!row.followupDate||!row.nextSteps)throw Error('Enregistrez la suite à donner et la date du prochain point.');
  const tasks=preparationTasks(row);if(tasks.length>1)throw Error('Départagez les versions de cette action dans Actions.');
  const entry=pp.buildEntry({...tasks[0],kind:'task',studentId:row.studentId,title:'Suite de rencontre : '+row.title,text:row.nextSteps,due:row.followupDate,status:'todo',related:'record:'+row.entityId},tasks[0]);
  if(!tasks.length)entry.entityId='meeting-followup-'+row.entityId;
  return persistFollowup([entry]);
}
