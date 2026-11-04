import * as db from './db.js';
import * as pp from './pp.js';
import * as audio from './pp-audio-store.js';
import {SPEECH_MANIFEST as manifest} from './pp-speech-manifest.js';
export function sourceAudio(id){const row=db.get('ppRecords',id);if(row?.kind!=='audio'||!audio.recordings(row.studentId).some(r=>r.id===id))throw new Error('La version de cet audio a changé ou a été supprimée. Rouvrez-le depuis sa fiche.');pp.requireStudent(row.studentId);if(!pp.enabled('audio'))throw new Error('L’outil Audio est désactivé.');return row;}
export const transcripts=entityId=>pp.latest({kind:'audioTranscript'}).filter(r=>r.audioEntityId===entityId);
async function persist(rows){const undo=db.commit(w=>rows.forEach(r=>w.put('ppRecords',r)));try{await db.flush();for(const row of rows)await db.verifyStored('ppRecords',row.id,row.updatedAt);}catch(e){await undo();throw e;}}
export async function saveTranscript(audioId,text){
  const old=db.get('ppRecords',audioId);if(!old)throw new Error('Audio introuvable.');
  const heads=audio.recordings(old.studentId).filter(r=>r.entityId===old.entityId);if(!heads.length)throw new Error('Audio supprimé avant la fin du traitement.');sourceAudio(heads[0].id);
  if(typeof text!=='string'||!text.trim()||text.length>200000)throw new Error('Aucun texte exploitable. Réécoutez l’audio avant de relancer.');
  const id=db.uid(),row={id,entityId:id,parents:[],kind:'audioTranscript',studentId:old.studentId,classId:old.classId,year:old.year,at:new Date().toISOString(),audioEntityId:old.entityId,audioVersionId:old.id,audioBlobId:old.blobId,text:text.trim(),status:'draft',engine:'Whisper Tiny q8 · local',modelRevision:manifest.revision};
  await persist([row]);return row;
}
export async function appendTranscript(audioId,transcriptId,reviewedText){
  const old=sourceAudio(audioId),draft=db.get('ppRecords',transcriptId);
  if(audio.recordings(old.studentId).filter(r=>r.entityId===old.entityId).length!==1)throw new Error('Plusieurs versions du compte rendu : vérifiez les textes avant d’ajouter la transcription.');
  if(draft?.kind!=='audioTranscript'||draft.audioEntityId!==old.entityId||draft.status!=='draft'||!transcripts(old.entityId).some(r=>r.id===transcriptId))throw new Error('Cette transcription est déjà utilisée ou sa version a changé.');
  if(typeof reviewedText!=='string'||!reviewedText.trim()||reviewedText.length>200000)throw new Error('Renseignez le texte à ajouter.');
  const at=new Date().toISOString(),next={...old,id:db.uid(),parents:[old.id],at,text:[old.text,'Transcription automatique\n'+reviewedText.trim()].filter(Boolean).join('\n\n')};
  const used={...draft,id:db.uid(),parents:[draft.id],at,status:'used',reviewedText:reviewedText.trim(),appliedAudioVersionId:next.id};
  await persist([next,used]);return next;
}
