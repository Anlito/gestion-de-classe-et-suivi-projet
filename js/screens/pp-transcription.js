import * as db from '../db.js';
import * as model from '../model.js';
import * as speech from '../pp-speech.js';
import {sourceAudio,transcripts,appendTranscript} from '../pp-speech-store.js';
import {INSTALL_BYTES} from '../pp-speech-model.js';
import {html,toast,confirmDialog,fmtDate} from '../ui.js';
import {backLink,saveStatus} from '../components.js';
import {refresh,go} from '../nav.js';
let studentId='',audioId='',selectedDraft='',edited='',dirty=false,unsubscribe=null,busy=false,checked=false;
let lastResult='';
const drafts=new Map();
function remember(){if(selectedDraft)drafts.set(selectedDraft,{text:edited,dirty});}
function selectDraft(row){remember();selectedDraft=row?.id||'';const saved=drafts.get(selectedDraft);edited=saved?.text??row?.reviewedText??row?.text??'';dirty=saved?.dirty||false;}
addEventListener('beforeunload',e=>{if(dirty||[...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
export default {
 render(params){
  if(audioId!==params.audioId||studentId!==params.studentId){remember();audioId=params.audioId;studentId=params.studentId;selectedDraft='';edited='';dirty=false;}
  let row;try{row=sourceAudio(audioId);if(row.studentId!==studentId)throw new Error('Cet audio appartient à un autre élève.');}catch(e){return html`<div class="screen"><a href="#/pp/eleve/${studentId}/audio">Retour aux audios</a><p>${e.message}</p></div>`;}
  const list=transcripts(row.entityId),result=speech.state.result;
  if(result?.audioEntityId===row.entityId&&result.id!==lastResult&&list.some(r=>r.id===result.id)){lastResult=result.id;selectDraft(result);}
  if(!list.some(r=>r.id===selectedDraft))selectDraft(list[0]);const draft=list.find(r=>r.id===selectedDraft),state=speech.state,active=speech.active(),student=db.get('students',studentId);
  return html`<div class="screen pp-screen"><header class="topbar">${backLink('#/pp/eleve/'+studentId+'/audio','Notes audio')}<div class="title">Transcription locale</div><div class="spacer"></div>${saveStatus()}</header><main class="content pp-audio-grid">
  <section class="panel"><div class="panel-head"><strong>${model.fullName(student||{})} · ${row.title}</strong></div><div class="panel-scroll"><p>L’audio est traité sur cet appareil, sans envoi à un service de transcription. Les sauvegardes Drive du Carnet suivent vos réglages habituels.</p><p class="muted small">Le premier usage télécharge environ ${Math.ceil(INSTALL_BYTES/1048576)} Mo depuis les sources du modèle. Une fois installé, le modèle reste sur cet appareil. Chaque appareil a sa propre installation.</p><p role="status" class="pp-audio-status">${state.message||'Choisissez l’installation ou la transcription.'}${state.phase==='installing'?' · '+state.percent+' %':''}</p>
  <div class="button-group">${!state.ready?html`<button class="btn accent" data-click="install" ${active||busy?'disabled':''}>Installer le modèle sur cet appareil</button>`:html`<button class="btn accent" data-click="transcribe" ${active||busy?'disabled':''}>Lancer la transcription</button>`}${active&&state.phase!=='saving'?html`<button class="btn" data-click="cancel">Annuler le traitement</button>`:''}</div>
  <p class="muted small">Le calcul peut être long sur tablette, surtout pour un entretien complet. Commencez par une courte note. Gardez cet écran ouvert ; quitter l’écran annule le traitement sans modifier votre audio ni votre compte rendu.</p>
  <h3>Compte rendu déjà enregistré</h3><div class="pp-record-text">${row.text||'Aucun texte enregistré pour cet audio.'}</div>
  ${state.ready?html`<div class="button-group"><button class="btn" data-click="removeModel" ${active||busy?'disabled':''}>Retirer le modèle de cet appareil</button></div>`:''}
  </div></section>
  <section class="panel"><div class="panel-head"><strong>Brouillon à relire</strong></div><div class="panel-scroll">${list.length?html`<label class="lbl">Transcriptions conservées<select class="input" data-change="chooseDraft" ${active||busy?'disabled':''}>${list.map(r=>html`<option value="${r.id}" ${selectedDraft===r.id?'selected':''}>${fmtDate(r.at)} · ${r.status==='used'?'déjà ajouté au compte rendu':'brouillon'}</option>`)}</select></label><label class="lbl">Texte de la transcription<textarea class="field" rows="11" data-input="draft" ${draft?.status==='used'?'readonly':''}>${edited}</textarea></label><p class="muted small">Vérifiez les noms, les nombres et les formulations en réécoutant l’audio. Ce modèle léger peut commettre des erreurs ou inventer des mots, notamment sur les silences et le bruit. Le texte existant est conservé ; l’ajout se fait seulement après votre clic.</p>`:html`<p>Le résultat apparaîtra ici. Aucun texte existant ne sera remplacé automatiquement.</p>`}</div>${draft&&draft.status==='draft'?html`<div class="pp-panel-foot"><div class="button-group"><button class="btn accent" data-click="append" ${active||busy?'disabled':''}>Ajouter ce texte au compte rendu</button></div></div>`:''}</section>
  </main></div>`;
 },
 mount(){if(!unsubscribe)unsubscribe=speech.subscribe(()=>refresh());if(!checked){checked=true;speech.check().catch(e=>toast({text:e.message}));}},
 leave(){remember();unsubscribe?.();unsubscribe=null;if(speech.active())speech.cancel();},
 actions:{
  async install(){await speech.install();},
  async transcribe(){try{await speech.transcribe(audioId);}catch(e){toast({text:e.message});}},
  cancel(){speech.cancel();},
  draft(el){edited=el.value;dirty=true;remember();},
  chooseDraft(el){selectDraft(db.get('ppRecords',el.value));refresh();},
  async append(){if(busy)return;busy=true;refresh();try{const updated=await appendTranscript(audioId,selectedDraft,edited);drafts.delete(selectedDraft);dirty=false;selectedDraft='';toast({text:'Transcription ajoutée, compte rendu initial conservé'});go('#/pp/eleve/'+studentId+'/audio/'+updated.id+'/transcription',{replace:true});}catch(e){toast({text:e.message});}finally{busy=false;refresh();}},
  async removeModel(){if(!await confirmDialog({title:'Retirer le modèle local ?',text:'Les audios et les transcriptions seront conservés. Une nouvelle installation sera nécessaire pour transcrire sur cet appareil.',ok:'Retirer le modèle'}))return;try{await speech.removeModel();}catch(e){toast({text:e.message});}}
 }
};
