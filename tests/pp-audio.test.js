import {validateAudio,AUDIO_LIMIT} from '../js/pp-audio-store.js';
import {formatDuration} from '../js/pp-audio-capture.js';
export const tests=[];const test=(name,fn)=>tests.push({name,fn});
const eq=(a,b)=>{if(a!==b)throw Error(`${a} ≠ ${b}`);};
const bad=fn=>{let rejected=false;try{fn();}catch{rejected=true;}eq(rejected,true);};
test('Audio : formats de capture et import acceptés',()=>{for(const type of ['audio/webm;codecs=opus','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-m4a'])validateAudio({size:1,type});});
test('Audio : fichier vide ou trop volumineux refusé',()=>{bad(()=>validateAudio({size:0,type:'audio/webm'}));bad(()=>validateAudio({size:AUDIO_LIMIT+1,type:'audio/webm'}));validateAudio({size:AUDIO_LIMIT,type:'audio/webm'});});
test('Audio : vidéo, HTML et format inconnu refusés',()=>{for(const type of ['video/webm','text/html','application/octet-stream',''])bad(()=>validateAudio({size:100,type}));});
test('Audio : affichage des minutes et secondes',()=>{eq(formatDuration(0),'0:00');eq(formatDuration(61.8),'1:01');eq(formatDuration(1800),'30:00');});
