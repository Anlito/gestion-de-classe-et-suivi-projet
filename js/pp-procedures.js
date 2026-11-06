import * as db from './db.js';
import * as pp from './pp.js';
import {followupScope,checkedDate,bounded,followupVersion,persistFollowup} from './pp-followup-core.js';
export const PROCEDURE_STATES=['À demander','Demandé / en attente','Reçu','À compléter','Clôturé'];
export const procedures=studentId=>pp.latest({studentId,kind:'procedure'}).filter(r=>r.classId===pp.requireStudent(studentId).classId);
export function procedureDocuments(studentId){return pp.latest({studentId,kind:'document'}).filter(r=>!r.testMode&&r.classId===pp.requireStudent(studentId).classId);}
export async function saveProcedure(studentId,data,previousId=null){
  const scope=followupScope(studentId,'demarches'),title=bounded(data.title,240);if(!title)throw Error('Renseignez l’objet de la démarche.');
  if(!PROCEDURE_STATES.includes(data.status)||!pp.DOCUMENT_TYPES.includes(data.category||'Autre'))throw Error('Choisissez l’état et la catégorie de la démarche.');
  const documentIds=[...new Set(data.documentIds||[])],previous=previousId&&db.get('ppRecords',previousId);
  if(documentIds.some(entityId=>!procedureDocuments(studentId).some(r=>r.entityId===entityId)&&!previous?.documentIds?.includes(entityId)))throw Error('Un document ne correspond pas à cet élève.');
  const row=followupVersion('procedure',scope,{title,status:data.status,category:data.category||'Autre',text:bounded(data.text),contact:bounded(data.contact,240),requestedAt:checkedDate(data.requestedAt,'la date de demande'),lastContactAt:checkedDate(data.lastContactAt,'la date du dernier échange'),validUntil:checkedDate(data.validUntil,'la validité du document'),renewalAt:checkedDate(data.renewalAt,'la date de renouvellement'),documentIds},previousId,data.resolveConcurrent===true,data.expectedHeads);
  return persistFollowup([row]);
}
export function procedureReminders(procedure){return pp.latest({studentId:procedure.studentId,kind:'task'}).filter(r=>r.related==='record:'+procedure.entityId);}
export async function planProcedureReminder(id,{due,assignedTo=''}){
  const previous=db.get('ppRecords',id);if(!previous||previous.kind!=='procedure')throw Error('Démarche introuvable.');
  followupScope(previous.studentId,'demarches');if(!pp.enabled('actions'))throw Error('Activez Actions pour planifier une relance.');
  if(!procedures(previous.studentId).some(r=>r.id===id)||previous.status==='Clôturé')throw Error('Rouvrez la démarche et sa version actuelle avant de planifier une relance.');
  if(procedures(previous.studentId).filter(r=>r.entityId===previous.entityId).length>1)throw Error('Retenez d’abord une version de la démarche.');
  const date=checkedDate(due,'la date de relance');if(!date)throw Error('Choisissez une date de relance.');
  const heads=procedureReminders(previous);if(heads.length>1)throw Error('Plusieurs versions de la relance sont présentes. Départagez-les dans Actions.');
  const old=heads[0],entry=pp.buildEntry({...old,kind:'task',studentId:previous.studentId,title:'Relancer : '+previous.title,due:date,status:'todo',assignedTo:bounded(assignedTo,240),related:'record:'+previous.entityId},old);
  // Identité commune sur les appareils pour détecter deux planifications hors ligne.
  if(!old)entry.entityId='procedure-reminder-'+previous.entityId;
  return persistFollowup([entry]);
}
export async function attachProcedureDocument(id,file){
  const previous=db.get('ppRecords',id);if(!previous||previous.kind!=='procedure')throw Error('Démarche introuvable.');
  const scope=followupScope(previous.studentId,'demarches');if(!pp.enabled('documents'))throw Error('Activez Documents pour joindre une pièce.');
  if(previous.status==='Clôturé'||!procedures(previous.studentId).some(r=>r.id===id))throw Error('Rouvrez la démarche et sa version actuelle pour joindre une pièce.');
  if(procedures(previous.studentId).filter(r=>r.entityId===previous.entityId).length>1)throw Error('Retenez d’abord une version de la démarche.');
  if(!file?.size||file.size>20*1048576)throw Error('Choisissez un fichier non vide de 20 Mo maximum.');
  const mimeType=file.type||(/\.pdf$/i.test(file.name)?'application/pdf':'');
  if(!/^(application\/pdf|image\/(jpeg|png|webp)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword)$/.test(mimeType))throw Error('Formats acceptés : PDF, image, DOC ou DOCX.');
  const docId=db.uid(),blobId='pp-file-'+db.uid(),at=new Date().toISOString();
  const document={...scope,id:docId,entityId:docId,parents:[],kind:'document',category:previous.category,title:file.name,fileName:file.name,mimeType,size:file.size,blobId,at};
  const row=followupVersion('procedure',scope,{title:previous.title,status:'Reçu',category:previous.category,text:previous.text,contact:previous.contact,requestedAt:previous.requestedAt,lastContactAt:previous.lastContactAt,validUntil:previous.validUntil,renewalAt:previous.renewalAt,documentIds:[...new Set([...(previous.documentIds||[]),docId])]},id);
  return persistFollowup([document,row],[{id:blobId,blob:new Blob([file],{type:mimeType})}]);
}
