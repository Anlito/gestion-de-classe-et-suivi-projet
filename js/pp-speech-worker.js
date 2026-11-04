import {SPEECH_MANIFEST as manifest} from './pp-speech-manifest.js';
const base=new URL('../',import.meta.url),modelRoot=new URL('speech-models/',base);
const allowed=new Set([...manifest.files.map(f=>new URL(manifest.id+'/'+f.path,modelRoot).href),...manifest.runtime.map(f=>new URL(f.path,base).href)]);
const originalFetch=self.fetch.bind(self);
// Le worker ne reçoit que des échantillons audio ; aucun nom ni compte rendu.
// Son accès réseau est limité aux fichiers locaux connus, uniquement en lecture.
self.fetch=(input,options={})=>{const request=new Request(input,options);if(request.method!=='GET'||!allowed.has(request.url))throw new Error('Accès réseau interdit pendant la transcription locale.');return originalFetch(request);};
let recognizer=null;
async function load(){
  if(recognizer)return recognizer;
  const {pipeline,env}=await import('../vendor/transformers/transformers.min.js');
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
    const output=await model(data.audio,{language:'french',task:'transcribe',chunk_length_s:30,stride_length_s:5,return_timestamps:false,max_new_tokens:440});
    self.postMessage({type:'result',text:String(output.text||'').trim()});
  }catch(error){self.postMessage({type:'error',text:error.message||'La transcription locale n’a pas abouti.'});}
};
