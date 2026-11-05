import * as db from './db.js';
import * as model from './model.js';
import * as pp from './pp.js';
import {validISODate} from './pp-rules.js';
export function followupScope(studentId,tool){const student=pp.requireStudent(studentId);if(!pp.enabled(tool))throw Error('Activez cet outil dans Mes outils.');return {studentId:student.id,classId:student.classId,year:model.schoolYear()};}
export function checkedDate(value,label){const date=String(value||'');if(date&&!validISODate(date))throw Error('Vérifiez '+label+'.');return date;}
export function bounded(value,max=10000){const text=String(value||'').trim();if(text.length>max)throw Error('Le contenu dépasse '+max+' caractères.');return text;}
export function followupVersion(kind,scope,data,previousId=null,resolve=false,expectedHeads=[]){
  const previous=previousId&&db.get('ppRecords',previousId),heads=pp.latest({studentId:scope.studentId,kind}).filter(r=>r.classId===scope.classId);
  if(previousId&&(!previous||previous.kind!==kind||previous.year!==scope.year||previous.studentId!==scope.studentId||previous.classId!==scope.classId||!heads.some(r=>r.id===previousId)))throw Error('La version a changé. Rechargez le suivi avant d’enregistrer.');
  const family=previous?heads.filter(r=>r.entityId===previous.entityId).map(r=>r.id):[];
  if(resolve&&(!Array.isArray(expectedHeads)||expectedHeads.length!==family.length||new Set(expectedHeads).size!==family.length||!expectedHeads.every(id=>family.includes(id))))throw Error('Les versions ont changé depuis l’ouverture. Rechargez le suivi.');
  const id=db.uid(),parents=previous?(resolve?family:[previous.id]):[];
  return {...scope,...data,id,entityId:previous?.entityId||id,parents,kind,at:new Date().toISOString(),testMode:false};
}
export async function persistFollowup(records,binaries=[]){
  const undo=db.commit(w=>{for(const file of binaries)w.put('photos',file);for(const row of records)w.put('ppRecords',row);});
  try{await db.flush();for(const row of records)await db.verifyStored('ppRecords',row.id,row.updatedAt);for(const file of binaries)await db.verifyStored('photos',file.id,file.updatedAt);}catch(e){await undo();await db.flush();throw e;}
  return records[records.length-1];
}
