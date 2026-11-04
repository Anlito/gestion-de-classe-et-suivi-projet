import * as db from './db.js';
import * as pp from './pp.js';
import * as model from './model.js';
export const AUDIO_LIMIT=20*1024*1024;
const MIME=/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|x-m4a)(;.*)?$/i;
export function validateAudio(blob){if(!blob?.size||blob.size>AUDIO_LIMIT||!MIME.test(blob.type||''))throw new Error('Choisissez un audio non vide (WebM, Ogg, M4A, MP3 ou WAV), de 20 Mo maximum.');}
export const recordings=studentId=>pp.latest({studentId,kind:'audio'}).filter(r=>r.status!=='removed');
function requireTool(studentId){const student=pp.requireStudent(studentId);if(!pp.enabled('audio'))throw new Error('L’outil Audio est désactivé.');return student;}
async function persist(row,blob=null,remove=false){
  const undo=db.commit(w=>{w.put('ppRecords',row);if(blob)w.put('photos',{id:row.blobId,blob});if(remove)w.del('photos',row.blobId);});
  try{await db.flush();await db.verifyStored('ppRecords',row.id,row.updatedAt);if(blob)await db.verifyStored('photos',row.blobId);}catch(e){await undo();throw e;}
  return row;
}
export async function saveRecording(studentId,blob,{durationSeconds=null,title='Enregistrement audio',fileName='',date=''}={}){
  const student=requireTool(studentId);validateAudio(blob);if(durationSeconds!==null&&(!Number.isFinite(durationSeconds)||durationSeconds<0))throw new Error('Durée audio invalide.');
  const id=db.uid(),extension=/mp4|m4a/.test(blob.type)?'m4a':/mpeg/.test(blob.type)?'mp3':/wav/.test(blob.type)?'wav':/ogg/.test(blob.type)?'ogg':'webm';
  return persist({id,entityId:id,parents:[],kind:'audio',classId:student.classId,studentId,year:model.schoolYear(),at:new Date().toISOString(),date,title:String(title).trim()||'Enregistrement audio',text:'',status:'saved',blobId:'pp-file-'+db.uid(),mimeType:blob.type,size:blob.size,fileName:fileName||'enregistrement.'+extension,durationSeconds},blob);
}
export async function annotateRecording(id,title,text){
  const old=db.get('ppRecords',id);if(old?.kind!=='audio'||old.status==='removed')throw new Error('Enregistrement introuvable.');requireTool(old.studentId);
  if(!recordings(old.studentId).some(r=>r.id===id))throw new Error('La version a changé. Rouvrez cet enregistrement.');
  return persist({...old,id:db.uid(),parents:[old.id],at:new Date().toISOString(),title:String(title).trim()||'Enregistrement audio',text:String(text)});
}
export async function removeRecording(id){
  const old=db.get('ppRecords',id);if(old?.kind!=='audio')throw new Error('Enregistrement introuvable.');requireTool(old.studentId);
  const heads=recordings(old.studentId).filter(r=>r.entityId===old.entityId);if(heads.length!==1||heads[0].id!==id)throw new Error('Versions concurrentes : rapprochez les notes avant de supprimer cet audio.');
  return persist({...old,id:db.uid(),parents:[old.id],status:'removed',at:new Date().toISOString()},null,true);
}
