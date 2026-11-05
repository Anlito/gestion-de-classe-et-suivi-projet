import * as pp from './pp.js';
import {AUDIO_LIMIT,saveRecording} from './pp-audio-store.js';
import {todayISO,toast} from './ui.js';
export const state={phase:'idle',studentId:null,seconds:0,blob:null,message:''};
let recorder=null,stream=null,chunks=[],size=0,timer=null,started=0,token=0,stopPromise=null,resolveStop=null;
const listeners=new Set();export const subscribe=fn=>{listeners.add(fn);return ()=>listeners.delete(fn);};
const emit=type=>listeners.forEach(fn=>fn(type));
const release=()=>{clearInterval(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;};
export const active=()=>['requesting','recording','saving'].includes(state.phase);
export const formatDuration=seconds=>{const n=Math.max(0,Math.floor(seconds||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
async function save(){
  state.phase='saving';emit('state');
  try{state.entry=await saveRecording(state.studentId,state.blob,{durationSeconds:state.seconds,date:state.date});state.phase='saved';state.blob=null;state.message='Audio enregistré sur cet appareil.';}
  catch(e){state.phase='error';state.message=e.message+' L’audio reste disponible ici : réessayez ou téléchargez une copie.';}
  if(!listeners.size)toast({text:state.message});emit('state');
}
export async function retry(){if(state.phase==='error'&&state.blob)await save();}
export async function start(studentId){
  pp.requireStudent(studentId);if(!pp.enabled('audio'))throw new Error('L’outil Audio est désactivé.');
  if(active()||state.blob)throw new Error('Terminez ou sauvegardez d’abord l’audio en cours.');
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Le micro nécessite Chrome avec une connexion HTTPS (ou le test local sur cet ordinateur). Vous pouvez aussi importer un fichier audio.');
  const generation=++token;Object.assign(state,{phase:'requesting',studentId,seconds:0,blob:null,entry:null,date:todayISO(),message:'Autorisez le microphone dans Chrome.'});emit('state');
  try{
    const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
    if(generation!==token){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;chunks=[];size=0;
    const mimeType=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
    recorder=new MediaRecorder(stream,{...(mimeType?{mimeType}:{}),audioBitsPerSecond:64000});
    stopPromise=new Promise(resolve=>resolveStop=resolve);
    recorder.ondataavailable=e=>{if(e.data?.size){chunks.push(e.data);size+=e.data.size;if(size>=AUDIO_LIMIT-128*1024&&recorder.state==='recording'){state.message='Arrêt à l’approche de la taille maximale.';stop();}}};
    recorder.onerror=()=>{state.message='Le microphone a été interrompu. Vérifiez l’audio conservé.';stop();};
    recorder.onstop=async()=>{
      state.seconds=Math.max(0,(performance.now()-started)/1000);release();
      state.blob=new Blob(chunks,{type:recorder.mimeType||mimeType||'audio/webm'});chunks=[];
      if(state.blob.size)await save();else{state.phase='error';state.blob=null;state.message='Aucun son enregistré. Vous pouvez réessayer.';emit('state');}
      resolveStop?.();resolveStop=null;
    };
    recorder.start(1000);started=performance.now();state.phase='recording';state.message='Enregistrement en cours';emit('state');
    stream.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>stop(),{once:true}));
    timer=setInterval(()=>{state.seconds=(performance.now()-started)/1000;emit('tick');if(state.seconds>=1800){state.message='Arrêt après 30 minutes.';stop();}},1000);
  }catch(e){if(generation!==token)return;release();state.phase='idle';state.message=e.name==='NotAllowedError'?'Microphone refusé. Autorisez-le dans les réglages du site Chrome pour enregistrer.':e.name==='NotFoundError'?'Aucun microphone disponible.':'Impossible de démarrer le microphone. Vérifiez ses autorisations dans Chrome.';emit('state');}
}
export async function stop(){
  if(state.phase==='requesting'){token++;release();state.phase='idle';state.message='Demande de microphone annulée.';emit('state');return;}
  if(recorder?.state==='recording'){state.phase='saving';emit('state');recorder.stop();release();}
  if(stopPromise&&['saving','recording'].includes(state.phase))await stopPromise;
}
addEventListener('visibilitychange',()=>{if(document.hidden&&['recording','requesting'].includes(state.phase))stop();});
addEventListener('beforeunload',e=>{if(active()||state.blob){e.preventDefault();e.returnValue='';}});
