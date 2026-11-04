import {SPEECH_MANIFEST as manifest} from './pp-speech-manifest.js';
import {repeatedTail,transcriptionIssue,LOOP_MESSAGE} from './pp-speech-quality.js';
const base=new URL('../',import.meta.url),modelRoot=new URL('speech-models/',base);
const allowed=new Set([...manifest.files.map(f=>new URL(manifest.id+'/'+f.path,modelRoot).href),...manifest.runtime.map(f=>new URL(f.path,base).href)]);
const originalFetch=self.fetch.bind(self);
// Le worker ne reçoit que des échantillons audio ; aucun nom ni compte rendu.
// Son accès réseau est limité aux fichiers locaux connus, uniquement en lecture.
self.fetch=(input,options={})=>{const request=new Request(input,options);if(request.method!=='GET'||!allowed.has(request.url))throw new Error('Accès réseau interdit pendant la transcription locale.');return originalFetch(request);};
let recognizer=null,StoppingCriteria,StoppingCriteriaList;
async function load(){
  if(recognizer)return recognizer;
  const library=await import('../vendor/transformers/transformers.min.js');
  const {pipeline,env}=library;({StoppingCriteria,StoppingCriteriaList}=library);
  env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=modelRoot.href;env.useBrowserCache=false;env.useFSCache=false;env.useCustomCache=true;
  const cache=await caches.open(manifest.cache);
  env.customCache={match:key=>cache.match(key),put:(key,response)=>cache.put(key,response)};
  env.backends.onnx.wasm.numThreads=1;
  env.backends.onnx.wasm.wasmPaths=new URL('../vendor/transformers/',import.meta.url).href;
  recognizer=await pipeline('automatic-speech-recognition',manifest.id,{device:'wasm',dtype:'q8',local_files_only:true});
  return recognizer;
}
self.onmessage=async({data})=>{
  if(data?.type!=='transcribe')return;
  try{
    self.postMessage({type:'stage',text:'Chargement du modèle sur cet appareil…'});
    const model=await load();self.postMessage({type:'stage',text:'Transcription locale en cours…'});
    let failure='';
    class LoopStop extends StoppingCriteria{
      _call(sequences){return sequences.map(ids=>{if(repeatedTail(ids.slice(-64))){failure=LOOP_MESSAGE;return true;}if(ids.length>=440){failure='La limite de texte a été atteinte. Aucun brouillon incomplet n’a été conservé. Essayez un audio plus court.';return true;}return false;});}
    }
    const stopping_criteria=new StoppingCriteriaList();stopping_criteria.push(new LoopStop());
    const output=await model(data.audio,{language:'french',task:'transcribe',chunk_length_s:30,stride_length_s:5,return_timestamps:false,max_new_tokens:440,stopping_criteria});
    const text=String(output.text||'').trim();failure||=transcriptionIssue(text,data.audio.length/16000);
    if(failure){self.postMessage({type:'error',code:'quality',text:failure});return;}
    self.postMessage({type:'result',text});
  }catch(error){self.postMessage({type:'error',code:'engine',text:error.message||'La transcription locale n’a pas abouti.'});}
};
