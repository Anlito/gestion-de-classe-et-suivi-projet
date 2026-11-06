import * as db from './db.js';
import * as pp from './pp.js';
const noteKinds=['note','progress'];
function target(studentId,store,id){
  if(db.archive())throw Error('Archive annuelle en lecture seule : revenez à l’année en cours.');
  const student=pp.requireStudent(studentId);if(!pp.enabled('notes')||!['notes','ppRecords'].includes(store))throw Error('Les notes sont désactivées ou leur origine est inconnue.');
  const row=db.get(store,id);if(!row||row.studentId!==student.id)throw Error('Cette note ne correspond pas à cet élève.');
  if(store==='ppRecords'&&(!noteKinds.includes(row.kind)||row.classId!==student.classId||!pp.latest({studentId,kind:row.kind}).some(r=>r.id===id)))throw Error('La note a changé. Rouvrez sa version actuelle.');
  return row;
}
async function verified(undo,checks){try{await db.flush();await checks();return undo;}catch(e){await undo();await db.flush();throw e;}}
export async function archiveNote(studentId,store,id,archived=true){
  const row=target(studentId,store,id);const archivedAt=archived?new Date().toISOString():null;
  if(store==='notes'){
    const undo=db.commit(w=>w.update('notes',id,{archivedAt})),saved=db.get('notes',id);
    return verified(undo,()=>db.verifyStored('notes',id,saved.updatedAt));
  }
  const heads=pp.latest({studentId,kind:row.kind}).filter(r=>r.entityId===row.entityId);
  if(heads.length!==1)throw Error('Plusieurs versions de cette note existent : vérifiez-les avant de l’archiver.');
  const saved={...row,id:db.uid(),parents:[row.id],at:new Date().toISOString(),archivedAt};
  const undo=db.commit(w=>w.put('ppRecords',saved));return verified(undo,()=>db.verifyStored('ppRecords',saved.id,saved.updatedAt));
}
export async function deleteNote(studentId,store,id){
  const row=target(studentId,store,id);
  const rows=store==='notes'?[row]:pp.records({studentId,kind:row.kind}).filter(r=>r.classId===row.classId&&r.entityId===row.entityId);
  const undo=db.commit(w=>{for(const r of rows)w.del(store,r.id);});
  const tombs=rows.map(r=>db.get(db.TOMBS,store+':'+r.id));
  return verified(undo,async()=>{for(const tomb of tombs){await db.verifyStored(db.TOMBS,tomb.id,tomb.updatedAt);await db.verifyAbsent(store,tomb.recId);}});
}
