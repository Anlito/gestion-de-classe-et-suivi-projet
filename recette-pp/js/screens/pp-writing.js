import * as db from '../db.js';
import * as model from '../model.js';
import {scopeOf,adviceOf,checkedAdvice,composeDraft,saveDraft,LEVELS} from '../pp-writing.js';
import {html,toast,confirmDialog} from '../ui.js';
import {backLink,saveStatus} from '../components.js';
import {refresh} from '../nav.js';
let key='',params={},form={},text='',ids=[],dirty=false,busy=false,saved=null;
const drafts=new Map();
function remember(){if(key)drafts.set(key,{form:{...form},text,ids:[...ids],dirty,saved});}
addEventListener('beforeunload',e=>{if(dirty||[...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
const input=(name,label,placeholder)=>html`<label class="lbl">${label}<textarea class="field" rows="2" maxlength="3000" data-input="part" data-key="${name}" placeholder="${placeholder}">${form[name]||''}</textarea></label>`;
export default{
 render(p){
  const next=JSON.stringify(p);if(next!==key){remember();key=next;params={...p};const d=drafts.get(key)||{};form={...d.form};text=d.text||'';ids=[...(d.ids||[])];dirty=!!d.dirty;saved=d.saved||null;}
  let scope;try{scope=scopeOf(params);}catch(e){return html`<div class="screen"><a href="#/pp">Suivi PP</a><p>${e.message}</p></div>`;}
  const collective=!scope.studentId,student=db.get('students',scope.studentId),name=collective?db.get('classes',scope.classId)?.name:student?.prenom,rows=adviceOf(scope),back=collective?'#/pp/classe/'+scope.classId+'/conseils':'#/pp/eleve/'+scope.studentId;
  return html`<div class="screen pp-screen"><header class="topbar">${backLink(back,'Conseils')}<div class="heading"><span class="title">Préparer une appréciation</span><span class="sub">${collective?name:model.fullName(student)} · Trimestre ${scope.trimester}</span></div><div class="spacer"></div>${saveStatus()}</header><main class="content pp-audio-grid">
  <section class="panel"><div class="panel-head"><strong>Avis des professeurs · trimestre ${scope.trimester}</strong></div><div class="panel-scroll" data-scroll="writing-sources"><p class="muted small">Retenez les avis à prendre en compte, puis formulez les constats à droite. Aucun avis d’un autre élève ou trimestre n’est utilisé. Les avis TEST sont exclus.</p>${rows.map(r=>html`<article class="pp-record"><label class="row"><input type="checkbox" data-change="source" data-id="${r.id}" ${ids.includes(r.id)?'checked':''} ${busy?'disabled':''}><strong>${[r.subject,r.teacher].filter(Boolean).join(' · ')||'Avis'}</strong></label><div class="pp-record-text">${r.text}</div></article>`)}${!rows.length?html`<p>Aucun avis disponible. Ajoutez ou importez les appréciations des professeurs dans Conseils pour ce trimestre.</p>`:''}</div></section>
  <section class="panel"><div class="panel-head"><strong>Votre structure · bilan, nuances, conseils</strong></div><div class="panel-scroll" data-scroll="writing-editor"><p class="muted small">Aide à la formulation locale : vous choisissez les constats. Aucun jugement n’est déduit automatiquement des notes ou des avis.</p><label class="lbl">Votre bilan<select class="input" data-change="level"><option value="">Choisir…</option>${LEVELS.map(level=>html`<option value="${level}" ${form.level===level?'selected':''}>${level}</option>`)}</select></label>
  ${input('facts','Constats retenus','un travail sérieux et une attitude positive')}${input('nuance','Nuances ou points à améliorer (facultatif)','Quelques bavardages restent à corriger')}${input('goals','Conseils concrets','il faudra maintenir les efforts et participer plus régulièrement')}${input('praise','Félicitations (facultatif, à votre initiative)','Félicitations pour un travail sérieux et régulier')}
  <div class="button-group"><button class="btn" data-click="compose" ${busy||!rows.length?'disabled':''}>Préparer le brouillon</button></div><label class="lbl">Appréciation à relire et modifier<textarea class="field" rows="7" maxlength="20000" data-input="text">${text}</textarea></label><p class="muted small">Enregistrement comme brouillon uniquement. Vos synthèses existantes restent conservées. La validation finale se fait dans Conseils.</p></div><div class="pp-panel-foot"><div class="button-group"><button class="btn accent" data-click="save" ${busy?'disabled':''}>${saved?'Enregistrer une nouvelle version':'Enregistrer ce nouveau brouillon'}</button><span class="muted small">${dirty?'Modifications non enregistrées':saved?'Brouillon enregistré':'À préparer'}</span></div></div></section></main></div>`;
 },
 leave(){remember();},
 actions:{
  source(el){ids=el.checked?[...new Set([...ids,el.dataset.id])]:ids.filter(id=>id!==el.dataset.id);dirty=true;remember();},
  level(el){form.level=el.value;dirty=true;remember();},part(el){form[el.dataset.key]=el.value;dirty=true;remember();},text(el){text=el.value;dirty=true;remember();},
  async compose(){try{const scope=scopeOf(params);checkedAdvice(scope,ids);if(text.trim()&&!await confirmDialog({title:'Repréparer le brouillon ?',text:'Le texte en cours sera remplacé par vos nouveaux éléments. Les synthèses enregistrées restent conservées.',ok:'Repréparer'}))return;const student=db.get('students',scope.studentId);text=composeDraft(student?.prenom||db.get('classes',scope.classId).name,!scope.studentId,form);dirty=true;remember();refresh();document.querySelector('[data-input="text"]')?.scrollIntoView({block:'center'});}catch(e){toast({text:e.message});}},
  async save(){if(busy)return;const context=key,request={...params},content=text,sources=[...ids],previous=saved,snapshot={form:{...form},text,ids:[...ids]};busy=true;refresh();try{const result=await saveDraft(request,content,sources,previous);if(key===context){saved=result;dirty=false;remember();}else drafts.set(context,{...snapshot,saved:result,dirty:false});toast({text:'Brouillon enregistré dans Conseils, à relire avant validation'});}catch(e){toast({text:e.message});}finally{busy=false;refresh();}}
 }
};
