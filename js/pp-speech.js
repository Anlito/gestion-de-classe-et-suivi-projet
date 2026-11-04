import * as db from './db.js';
import {sourceAudio,saveTranscript} from './pp-speech-store.js';
import {modelReady,installModel,clearModel,decodeLocalAudio} from './pp-speech-model.js';
export const state={phase:'idle',ready:false,percent:0,message:'',audioEntityId:null,result:null};
let worker=null,controller=null,generation=0,finish=null;
const listeners=new Set();export const subscribe=fn=>{listeners.add(fn);return ()=>listeners.delete(fn);};
const emit=()=>listeners.forEach(fn=>fn());
export const active=()=>['checking','installing','decoding','running','saving'].includes(state.phase);
export async function check(){state.ready=await modelReady();emit();}
export async function install(){
  if(active())return;const run=++generation;controller=new AbortController();state.phase='installing';state.message='Téléchargement et vérification du modèle…';state.percent=0;emit();
  try{await installModel(progress=>{if(run!==generation)return;state.percent=Math.floor(progress.loaded/progress.total*100);emit();},controller.signal);if(run!==generation)return;state.ready=true;state.phase='idle';state.message='Modèle installé sur cet appareil.';emit();}
  catch(e){if(run!==generation)return;state.phase='error';state.ready=false;state.message=e.message||'Installation interrompue. Réessayez.';emit();}
  finally{if(run===generation)controller=null;}
}
export function cancel(){if(state.phase==='saving')return;generation++;controller?.abort();controller=null;worker?.terminate();worker=null;finish?.();finish=null;state.phase='cancelled';state.message='Traitement annulé. L’audio et le compte rendu sont conservés.';emit();}
export async function removeModel(){if(active())throw new Error('Arrêtez le traitement avant de retirer le modèle.');worker?.terminate();worker=null;await clearModel();state.ready=false;state.message='Modèle retiré de cet appareil. Les audios et les textes sont conservés.';emit();}
export async function transcribe(audioId){
  if(active())throw new Error('Un traitement est déjà en cours.');
  const row=sourceAudio(audioId),blob=db.get('photos',row.blobId)?.blob;if(!blob)throw new Error('Fichier audio absent sur cet appareil.');
  const run=++generation;Object.assign(state,{phase:'checking',audioEntityId:row.entityId,result:null,message:'Vérification du modèle local…'});emit();
  try{
    if(!await modelReady())throw new Error('Installez d’abord le modèle sur cet appareil.');if(run!==generation)return;
    state.phase='decoding';state.message='Préparation locale de l’audio…';emit();
    const samples=await decodeLocalAudio(blob,row.durationSeconds);if(run!==generation)return;
    const rms=Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length);if(rms<0.0001)throw new Error('L’audio semble silencieux. Aucun texte n’a été créé.');
    state.phase='running';state.message='Chargement du modèle…';emit();
    const result=await new Promise((resolve,reject)=>{
      worker=new Worker(new URL('./pp-speech-worker.js',import.meta.url),{type:'module'});finish=()=>resolve(null);
      worker.onerror=()=>reject(new Error('Le moteur local n’a pas démarré. Vérifiez le modèle ou essayez un audio plus court.'));
      worker.onmessage=({data})=>{if(run!==generation)return;if(data.type==='stage'){state.message=data.text;emit();}else if(data.type==='result')resolve(data.text);else if(data.type==='error')reject(new Error('La transcription locale n’a pas abouti. Réessayez avec un audio plus court.'));};
      worker.postMessage({type:'transcribe',audio:samples},[samples.buffer]);
    });
    worker?.terminate();worker=null;finish=null;if(run!==generation||result===null)return;
    state.phase='saving';state.message='Conservation du brouillon…';emit();
    state.result=await saveTranscript(audioId,result);state.phase='done';state.message='Brouillon conservé. Relisez-le avant de l’utiliser.';emit();
  }catch(e){if(run!==generation)return;worker?.terminate();worker=null;finish=null;state.phase='error';state.message=e.message;emit();}
}
addEventListener('beforeunload',e=>{if(active()){e.preventDefault();e.returnValue='';}});
