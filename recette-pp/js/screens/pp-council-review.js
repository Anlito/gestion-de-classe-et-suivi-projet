import * as db from '../db.js';
import * as model from '../model.js';
import {reviewData,saveReview} from '../pp-council-review.js';
import {sameIds,scopeStamp} from '../pp-council-review-rules.js';
import {html,toast,confirmDialog,fmtDate} from '../ui.js';
import {backLink,saveStatus} from '../components.js';
import {refresh} from '../nav.js';
let key='',params={},state=null,busy=false;
const drafts=new Map();
function initial(data,selectedId){
  const selected=data.syntheses.find(r=>r.id===selectedId)||(data.syntheses.length===1?data.syntheses[0]:null);
  return {expectedScope:scopeStamp(data.scope),expectedIds:data.heads.map(r=>r.id),synthesisId:selected?.id||'',choices:Object.fromEntries(data.groups.filter(g=>g.rows.length===1).map(g=>[g.entityId,g.rows[0].id])),text:selected?.text||'',reviewed:false,dirty:false};
}
function remember(){if(key&&state)drafts.set(key,{...state,expectedIds:[...state.expectedIds],choices:{...state.choices}});}
addEventListener('beforeunload',e=>{if(state?.dirty||[...drafts.values()].some(s=>s.dirty)){e.preventDefault();e.returnValue='';}});
const sourceText=row=>html`<strong>${[row.subject,row.teacher].filter(Boolean).join(' · ')||'Avis du professeur'}</strong><div class="pp-record-text">${row.text||'Texte vide'}</div><span class="muted small">${fmtDate(row.at)}</span>`;
export default{
 render(p){
  let data;try{data=reviewData(p);}catch(e){return html`<div class="screen"><a href="#/pp">Suivi PP</a><p>${e.message}</p></div>`;}
  const next=JSON.stringify(p);if(key!==next){remember();key=next;params={...p};state=drafts.get(key)||initial(data);}
  const stale=state.expectedScope!==scopeStamp(data.scope)||!sameIds(state.expectedIds,data.heads.map(r=>r.id)),scope=data.scope,student=scope.studentId&&db.get('students',scope.studentId),name=student?model.fullName(student):db.get('classes',scope.classId)?.name;
  const selected=data.syntheses.find(r=>r.id===state.synthesisId),oldIds=(selected?.writingBasis?.sourceIds||[]).filter(id=>!data.advice.some(r=>r.id===id));
  const oldRows=data.history.filter(r=>r.category!=='synthese'),oldSyntheses=data.history.filter(r=>r.category==='synthese');
  const unresolved=data.groups.some(g=>!g.rows.some(r=>r.id===state.choices[g.entityId])),disabled=busy||stale||!state.reviewed||unresolved||!state.text.trim()||data.syntheses.length&&!selected;
  return html`<div class="screen pp-screen"><header class="topbar">${backLink('#/pp/classe/'+scope.classId+'/avancement/'+scope.trimester,'Avancement du conseil')}<div class="heading"><span class="title">Relire et retenir une synthèse</span><span class="sub">${name} · Trimestre ${scope.trimester}</span></div><div class="spacer"></div>${saveStatus()}</header><main class="content pp-audio-grid">
  <section class="panel"><div class="panel-head"><strong>Avis actuels des professeurs</strong></div><div class="panel-scroll" data-scroll="review-advice"><p class="muted small">Lisez les avis actuels. En cas de versions concurrentes, choisissez explicitement celle à retenir. Les autres textes resteront dans l’historique.</p>${stale?html`<div class="info-box">Des avis ou synthèses ont changé pendant votre relecture. Rechargez les sources avant d’enregistrer.<div class="button-group"><button class="btn" data-click="reload" ${busy?'disabled':''}>Recharger la relecture</button></div></div>`:''}
  ${data.groups.map(group=>html`<section class="pp-record">${group.rows.length>1?html`<p class="chip warn">${group.rows.length} versions d’un même avis · choisissez-en une</p>`:''}${group.rows.map(row=>html`<article class="pp-record">${group.rows.length>1?html`<label class="check-row"><input type="radio" name="advice-${group.entityId}" data-change="advice" data-entity="${group.entityId}" value="${row.id}" ${state.choices[group.entityId]===row.id?'checked':''} ${busy||stale?'disabled':''}>Retenir cette version</label>`:''}${sourceText(row)}</article>`)}</section>`)}
  ${!data.groups.length?html`<p>Aucun avis actuel pour ce trimestre. La relecture portera sur votre texte personnel.</p>`:''}
  ${oldRows.length||oldIds.length?html`<details data-review-history="advice"><summary>Versions anciennes des avis · ${oldRows.length}</summary><p class="muted small">Ces textes anciens servent à la comparaison ; ils ne remplacent pas les avis actuels.</p>${oldRows.map(row=>html`<article class="pp-record">${oldIds.includes(row.id)?html`<span class="chip">Utilisé dans le texte de départ</span>`:''}${sourceText(row)}</article>`)}${oldIds.some(id=>!oldRows.some(row=>row.id===id))?html`<p class="muted small">Certains avis anciens ne sont plus disponibles sur cet appareil.</p>`:''}</details>`:''}</div></section>
  <section class="panel"><div class="panel-head"><strong>Synthèse à retenir</strong></div><div class="panel-scroll" data-scroll="review-synthesis"><p class="muted small">Choisissez le texte de départ, puis corrigez-le si nécessaire. L’enregistrement créera une version qui réunit les synthèses affichées, sans effacer leur historique.</p>${data.syntheses.map(row=>html`<article class="pp-record"><label class="check-row"><input type="radio" name="synthesis" data-change="synthesis" value="${row.id}" ${state.synthesisId===row.id?'checked':''} ${busy||stale?'disabled':''}>${row.title||'Synthèse'} · ${row.status==='validated'?'validée':'brouillon'} · ${fmtDate(row.at)}</label><details><summary>Lire cette version</summary><div class="pp-record-text">${row.text||'Texte vide'}</div></details></article>`)}${!data.syntheses.length?html`<p>Aucune synthèse enregistrée : vous pouvez rédiger un premier texte ci-dessous.</p>`:''}
  <label class="lbl">Texte retenu, à relire<textarea class="field" rows="9" maxlength="20000" data-input="text" ${busy||stale||data.syntheses.length&&!selected?'disabled':''}>${state.text}</textarea></label><p class="muted small">Après relecture, un nouvel avis ou une modification d’un avis fera de nouveau apparaître « À relire ». Les avis TEST sont exclus.</p>${oldSyntheses.length?html`<details data-review-history="synthesis"><summary>Synthèses antérieures conservées · ${oldSyntheses.length}</summary>${oldSyntheses.map(row=>html`<article class="pp-record"><strong>${fmtDate(row.at)} · historique</strong><div class="pp-record-text">${row.text||'Texte vide'}</div></article>`)}</details>`:''}</div>
  <div class="pp-panel-foot"><div class="stack"><label class="check-row"><input type="checkbox" data-change="reviewed" ${state.reviewed?'checked':''} ${busy||stale?'disabled':''}>J’ai relu les avis actuels et le texte retenu.</label><div class="button-group"><button class="btn" data-click="saveDraft" ${disabled?'disabled':''}>Garder en brouillon</button><button class="btn accent" data-click="validate" ${disabled?'disabled':''}>Valider le texte retenu</button></div></div></div></section></main></div>`;
 },
 leave(){remember();},
 actions:{
  text(el){state.text=el.value;state.dirty=true;state.reviewed=false;remember();const checkbox=document.querySelector('[data-change="reviewed"]');if(checkbox)checkbox.checked=false;document.querySelectorAll('[data-click="saveDraft"],[data-click="validate"]').forEach(button=>button.disabled=true);},
  advice(el){state.choices={...state.choices,[el.dataset.entity]:el.value};state.reviewed=false;state.dirty=true;remember();refresh();},
  async synthesis(el){const context=key,id=el.value;if(state.dirty&&state.text.trim()&&!await confirmDialog({title:'Changer de texte de départ ?',text:'Les modifications non enregistrées de ce texte seront abandonnées. Les textes déjà enregistrés restent conservés.',ok:'Changer de texte'})){refresh();return;}if(context!==key)return;try{const data=reviewData(params),row=data.syntheses.find(r=>r.id===id);if(!row)throw Error('Cette synthèse a changé. Rechargez la relecture.');state.synthesisId=id;state.text=row.text||'';state.reviewed=false;state.dirty=true;remember();refresh();}catch(e){toast({text:e.message});}},
  reviewed(el){state.reviewed=el.checked;state.dirty=true;remember();refresh();},
  async reload(){const context=key;if(state.dirty&&!await confirmDialog({title:'Recharger les avis et synthèses ?',text:'Le texte non enregistré de cette relecture sera remplacé par les versions actuelles.',ok:'Recharger'}))return;if(context!==key)return;try{state=initial(reviewData(params));remember();refresh();}catch(e){toast({text:e.message});}},
  async saveDraft(){await commit('draft');},async validate(){await commit('validated');}
 }
};
async function commit(status){
  if(busy)return;const context=key,request={...params},input={...state,expectedIds:[...state.expectedIds],choices:{...state.choices},status};busy=true;refresh();
  try{const saved=await saveReview(request,input),next=initial(reviewData(request),saved.id);drafts.set(context,next);if(key===context)state=next;toast({text:status==='validated'?'Synthèse retenue et validée, historique conservé':'Synthèse retenue en brouillon, historique conservé'});}
  catch(e){toast({text:e.message});}finally{busy=false;refresh();}
}
