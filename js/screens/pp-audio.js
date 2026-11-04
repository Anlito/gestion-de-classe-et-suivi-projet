import * as db from '../db.js';
import * as model from '../model.js';
import * as pp from '../pp.js';
import * as audio from '../pp-audio-store.js';
import * as capture from '../pp-audio-capture.js';
import {html,toast,confirmDialog,fmtDate} from '../ui.js';
import {backLink,saveStatus} from '../components.js';
import {refresh,go} from '../nav.js';
let studentId='',selected='',title='',text='',dirty=false,busy=false,unsubscribe=null;
const drafts=new Map();
addEventListener('beforeunload',e=>{if(dirty||[...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
let url=null,urlKey=null;
const releaseURL=()=>{document.querySelectorAll('.pp-audio-player').forEach(player=>player.pause());if(url)URL.revokeObjectURL(url);url=null;urlKey=null;};
function blobURL(key,blob){if(urlKey!==key){releaseURL();if(blob){url=URL.createObjectURL(blob);urlKey=key;}}return url;}
function select(row){selected=row?.id||'';title=row?.title||'';text=row?.text||'';dirty=false;drafts.delete(studentId);releaseURL();}
async function mayReplace(){return !dirty||await confirmDialog({title:'Abandonner le texte non enregistré ?',text:'La transcription ou le compte rendu saisi ne sera pas conservé.',ok:'Abandonner'});}
async function task(fn){if(busy)return;busy=true;refresh();try{await fn();}catch(e){toast({text:e.message});}finally{busy=false;refresh();}}
export default {
 render(params){
  if(studentId!==params.studentId){studentId=params.studentId;const draft=drafts.get(studentId);if(draft){({selected,title,text,dirty}=draft);}else select(null);}
  let student;try{student=pp.requireStudent(studentId);}catch(e){return html`<div class="screen"><a href="#/pp">Retour au suivi PP</a><p>${e.message}</p></div>`;}
  if(!pp.enabled('audio'))return html`<div class="screen"><a href="#/pp/eleve/${studentId}">Retour à la fiche élève</a><p>L’outil Audio est masqué. Les enregistrements restent conservés.</p></div>`;
  const rows=audio.recordings(studentId),state=capture.state,ours=state.studentId===studentId,recording=ours&&state.phase==='recording',pending=ours&&state.blob;
  if(!selected&&rows.length)select(rows[0]);
  if(selected&&!dirty&&!rows.some(r=>r.id===selected)){const entity=db.get('ppRecords',selected)?.entityId;select(rows.find(r=>r.entityId===entity)||rows[0]);}
  const row=rows.find(r=>r.id===selected),blob=row&&db.get('photos',row.blobId)?.blob;
  const player=blobURL(pending?'pending':row?.blobId,pending||blob);
  return html`<div class="screen pp-screen"><header class="topbar">${backLink('#/pp/eleve/'+studentId,'Fiche élève')}<div class="heading"><span class="title">Audio · ${student.prenom}</span><span class="sub">${db.get('classes',student.classId)?.name}</span></div><div class="spacer"></div>${saveStatus()}</header><main class="content pp-audio-grid">
  <section class="panel"><div class="panel-head"><strong>Enregistrer une note ou un entretien</strong></div><div class="panel-scroll"><h3>${model.fullName(student)}</h3>
  <div class="pp-audio-status" role="status"><strong>${recording?'● Enregistrement en cours':ours?state.message||'Microphone arrêté':'Microphone arrêté'}</strong><span data-audio-time>${recording?capture.formatDuration(state.seconds):''}</span></div>
  <div class="button-group"><button class="btn accent" data-click="start" ${capture.active()||state.blob||busy?'disabled':''}>Démarrer l’enregistrement</button>${ours&&['requesting','recording'].includes(state.phase)?html`<button class="btn danger-soft" data-click="stop">${state.phase==='requesting'?'Annuler la demande de micro':'Arrêter et sauvegarder'}</button>`:''}</div>
  <p class="muted small">Le microphone démarre uniquement après votre clic et l’autorisation de Chrome. L’audio est sauvegardé à l’arrêt. L’enregistrement s’arrête si vous quittez cet écran ou passez en arrière-plan. Limite : 30 minutes et 20 Mo.</p>
  ${pending?html`<div class="button-group"><button class="btn" data-click="retry" ${capture.active()?'disabled':''}>Réessayer la sauvegarde</button><a class="btn" href="${player}" download="audio-a-conserver.webm">Télécharger une copie</a></div>`:''}
  <label class="lbl">Importer un audio existant<input type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,.m4a,.mp3,.wav,.webm,.ogg" data-change="file" ${capture.active()||busy?'disabled':''}></label>
  <h3>Enregistrements · ${rows.length}</h3>${rows.map(r=>html`<button class="btn pp-home-row" data-click="select" data-id="${r.id}" ${capture.active()||busy?'disabled':''}><strong>${r.title}</strong><span>${fmtDate(r.date||r.at)} · ${r.durationSeconds==null?'durée non renseignée':capture.formatDuration(r.durationSeconds)}</span>${rows.some(other=>other.entityId===r.entityId&&other.id!==r.id)?html`<span class="chip warn">Versions concurrentes conservées</span>`:''}</button>`)}</div></section>
  <section class="panel"><div class="panel-head"><strong>Réécoute et transcription</strong></div><div class="panel-scroll">${player?html`<audio class="pp-audio-player" controls preload="metadata" src="${player}" aria-label="Réécouter l’enregistrement"></audio>`:row?html`<p>Le fichier audio n’est pas disponible sur cet appareil. Vérifiez la restauration ou la synchronisation des pièces.</p>`:html`<p>Enregistrez ou importez un audio, puis sélectionnez-le pour le réécouter.</p>`}
  ${row&&!pending?html`<form id="pp-audio-text" class="stack" data-submit="save"><label class="lbl">Titre<input class="input" value="${title}" data-input="title" maxlength="240"></label><label class="lbl">Transcription / compte rendu personnel<textarea class="field" rows="8" data-input="text">${text}</textarea></label><p class="muted small">Texte saisi ou collé par vous. Le bouton Transcrire sur cet appareil prépare un brouillon à relire, sans envoyer l’audio à un service de transcription. Les audios et leurs textes suivent la sauvegarde et la synchronisation Drive du Carnet si elle est activée.</p></form>`:''}</div>${row&&!pending?html`<div class="pp-panel-foot"><div class="button-group"><button class="btn accent" type="submit" form="pp-audio-text" ${busy||capture.active()?'disabled':''}>Enregistrer le texte</button>${blob?html`<button class="btn" type="button" data-click="transcribe" ${busy||capture.active()?'disabled':''}>Transcrire sur cet appareil</button><a class="btn" href="${player}" download="${row.fileName}">Télécharger l’audio</a>`:''}<button class="btn danger-soft" type="button" data-click="remove" ${busy||capture.active()?'disabled':''}>Supprimer cet audio</button></div></div>`:''}</section>
  </main></div>`;
 },
 mount(){if(!unsubscribe)unsubscribe=capture.subscribe(type=>{if(type==='tick'){const el=document.querySelector('[data-audio-time]');if(el)el.textContent=capture.formatDuration(capture.state.seconds);}else{if(!dirty&&capture.state.entry?.studentId===studentId)select(capture.state.entry);refresh();}});},
 leave(){drafts.set(studentId,{selected,title,text,dirty});unsubscribe?.();unsubscribe=null;capture.stop();releaseURL();},
 actions:{
  title(el){title=el.value;dirty=true;},text(el){text=el.value;dirty=true;},
  transcribe(){if(dirty){toast({text:'Enregistrez votre texte avant de lancer la transcription.'});return;}go('#/pp/eleve/'+studentId+'/audio/'+selected+'/transcription');},
  async start(){if(!await mayReplace())return;select(null);try{await capture.start(studentId);}catch(e){toast({text:e.message});}},
  async stop(){await capture.stop();},async retry(){await capture.retry();},
  async select(el){if(await mayReplace()){select(db.get('ppRecords',el.dataset.id));refresh();}},
  async save(el,e){e.preventDefault();await task(async()=>{const row=await audio.annotateRecording(selected,title,text);select(row);toast({text:'Texte enregistré avec cet audio'});});},
  async file(el){const file=el.files?.[0];if(!file||!await mayReplace())return;await task(async()=>{const inferred=/\.m4a$/i.test(file.name)?'audio/mp4':/\.mp3$/i.test(file.name)?'audio/mpeg':/\.wav$/i.test(file.name)?'audio/wav':/\.ogg$/i.test(file.name)?'audio/ogg':/\.webm$/i.test(file.name)?'audio/webm':'';const blob=new Blob([file],{type:file.type||inferred});select(await audio.saveRecording(studentId,blob,{title:file.name,fileName:file.name}));toast({text:'Audio importé sur cet appareil'});});},
  async remove(){if(!await confirmDialog({title:'Supprimer cet audio ?',text:'Le fichier et son texte ne seront plus proposés dans cette fiche. La suppression sera transmise par la synchronisation.',ok:'Supprimer'}))return;await task(async()=>{await audio.removeRecording(selected);select(null);toast({text:'Audio supprimé'});});}
 }
};
