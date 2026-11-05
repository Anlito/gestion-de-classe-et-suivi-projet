import {SPEECH_MANIFEST as manifest} from './pp-speech-manifest.js';
const base=new URL('../',import.meta.url),root=new URL('speech-models/'+manifest.id+'/',base);
export const MODEL_BYTES=manifest.files.reduce((n,f)=>n+f.bytes,0);
export const INSTALL_BYTES=MODEL_BYTES+manifest.runtime.reduce((n,f)=>n+f.bytes,0);
export const modelItems=()=>[...manifest.files.map(f=>({...f,key:new URL(f.path,root).href,source:`https://huggingface.co/${manifest.upstream}/resolve/${manifest.revision}/${f.path}`})),...manifest.runtime.map(f=>({...f,key:new URL(f.path,base).href,source:new URL(f.path,base).href}))];
export async function modelReady(){if(typeof caches==='undefined')return false;const cache=await caches.open(manifest.cache);if(!await cache.match(new URL('ready.json',root).href))return false;for(const item of modelItems()){const response=await cache.match(item.key);if(response?.headers.get('x-pp-sha256')!==item.sha256)return false;}return true;}
export async function installModel(onProgress=()=>{},signal){
  if(typeof caches==='undefined'||!crypto.subtle)throw new Error('Le modèle local nécessite Chrome en HTTPS ou localhost.');
  const cache=await caches.open(manifest.cache),items=modelItems(),total=items.reduce((n,f)=>n+f.bytes,0);let completed=0;
  for(const item of items){
    signal?.throwIfAborted();
    const known=await cache.match(item.key);
    if(known&&known.headers.get('x-pp-sha256')===item.sha256){completed+=item.bytes;onProgress({loaded:completed,total});continue;}
    const response=await fetch(item.source,{credentials:'omit',referrerPolicy:'no-referrer',signal});if(!response.ok)throw new Error('Téléchargement du modèle impossible. Réessayez avec une connexion Internet.');
    const reader=response.body?.getReader();let chunks=[],loaded=0;
    if(reader){while(true){const {value,done}=await reader.read();if(done)break;loaded+=value.length;if(loaded>item.bytes){await reader.cancel();throw new Error('Taille de fichier modèle inattendue.');}chunks.push(value);onProgress({loaded:completed+loaded,total});}}else{const bytes=new Uint8Array(await response.arrayBuffer());chunks=[bytes];loaded=bytes.length;}
    if(loaded!==item.bytes)throw new Error('Téléchargement incomplet du modèle. Réessayez.');
    const buffer=await new Blob(chunks).arrayBuffer();chunks=[];
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==item.sha256)throw new Error('Le fichier téléchargé ne correspond pas au modèle attendu.');
    await cache.put(item.key,new Response(buffer,{headers:{'Content-Type':item.path.endsWith('.wasm')?'application/wasm':item.path.endsWith('.mjs')||item.path.endsWith('.js')?'text/javascript':item.path.endsWith('.json')?'application/json':'application/octet-stream','x-pp-sha256':digest}}));
    completed+=item.bytes;onProgress({loaded:completed,total});
  }
  await cache.put(new URL('ready.json',root),new Response(JSON.stringify({revision:manifest.revision,installedAt:new Date().toISOString()}),{headers:{'Content-Type':'application/json'}}));
  // Remove only obsolete model assets, after the replacement is fully installed.
  for(const key of await caches.keys())if(key!==manifest.cache&&key.startsWith('pp-speech-whisper-tiny-'))await caches.delete(key);
}
export async function clearModel(){await caches.delete(manifest.cache);}
export async function decodeLocalAudio(blob,knownDuration=null){
  if(knownDuration!=null&&knownDuration>1800)throw new Error('La transcription est limitée à 30 minutes par audio.');
  const context=new OfflineAudioContext(1,1,16000);let decoded;
  try{decoded=await context.decodeAudioData(await blob.arrayBuffer());}catch{throw new Error('Ce fichier audio ne peut pas être décodé par Chrome. Essayez un fichier WAV ou M4A.');}
  if(!decoded.length||decoded.duration>1800||decoded.sampleRate!==16000)throw new Error('La durée de cet audio est vide ou dépasse 30 minutes.');
  const mono=new Float32Array(decoded.length);
  for(let channel=0;channel<decoded.numberOfChannels;channel++){const data=decoded.getChannelData(channel);for(let i=0;i<data.length;i++)mono[i]+=data[i]/decoded.numberOfChannels;}
  return mono;
}
