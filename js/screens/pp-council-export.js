import * as db from '../db.js';
import * as model from '../model.js';
import * as pp from '../pp.js';
import {prepareCouncilDocument,councilMarkup,downloadCouncilHTML,COUNCIL_PRINT_CSS} from '../pp-council-export.js';
import {html,raw,toast} from '../ui.js';
import {backLink} from '../components.js';
import {go,refresh} from '../nav.js';
let key='',params={},selected=[],search='',options={};
function documentNow(){return prepareCouncilDocument(params,{...options,studentIds:[...selected]});}
const option=(name,label)=>html`<label class="check-row"><input type="checkbox" data-change="option" data-key="${name}" ${options[name]?'checked':''}>${label}</label>`;
export default{
 render(p){
  if(!pp.active(p.classId)||!pp.enabled('conseils'))return html`<div class="screen"><a href="#/pp">Suivi PP</a><p>Activez Conseils pour cette classe PP.</p></div>`;
  const roster=model.studentsOf(p.classId),next=JSON.stringify(p);if(key!==next){key=next;params={...p};selected=roster.map(s=>s.id);options={includeCollective:true,includeAdvice:false,includeDrafts:false,onePerStudent:false};search='';}
  selected=selected.filter(id=>roster.some(s=>s.id===id));
  let doc,error='';try{doc=documentNow();}catch(e){error=e.message;}
  const c=db.get('classes',p.classId),query=search.trim().toLocaleLowerCase('fr');
  return html`<div class="screen pp-screen">${raw('<style>'+COUNCIL_PRINT_CSS+'</style>')}<header class="topbar no-print">${backLink('#/pp/classe/'+p.classId+'/avancement/'+p.trimester,'Avancement du conseil')}<div class="heading"><span class="title">Dossier du conseil · ${c.name}</span><span class="sub">Trimestre ${p.trimester} · ${model.schoolYear()}</span></div><div class="spacer"></div><div class="button-group"><button class="btn" data-click="download" ${!doc?'disabled':''}>Conserver le dossier</button><button class="btn accent" data-click="print" ${!doc?'disabled':''}>Imprimer / PDF</button></div></header>
  <main class="content pp-council-export"><aside class="panel no-print"><div class="panel-head"><strong>Éléments à inclure</strong></div><div class="panel-scroll" data-scroll="council-export-options"><label class="lbl">Trimestre<select class="input" data-change="period">${[1,2,3].map(t=>html`<option value="${t}" ${t===Number(p.trimester)?'selected':''}>Trimestre ${t}</option>`)}</select></label>
  <div class="stack">${option('includeCollective','Récapitulatif de classe')}${option('includeAdvice','Avis détaillés des professeurs')}${option('includeDrafts','Brouillons et textes à vérifier')}${option('onePerStudent','Une nouvelle page par élève')}</div><p class="muted small">Par défaut, seules les synthèses actuellement validées sont reproduites. Les TEST sont toujours exclus. Aucun document joint, audio ou note personnelle PP n’est inclus.</p>
  <h3>Élèves · ${selected.length} sur ${roster.length}</h3><div class="button-group"><button class="btn small" data-click="all">Toute la classe</button><button class="btn small" data-click="none">Aucun élève</button></div><label class="lbl">Rechercher<input class="input" data-input="search" value="${search}" placeholder="Nom ou prénom"></label>${roster.map(student=>html`<label class="check-row pp-export-pupil" data-export-name="${model.fullName(student).toLocaleLowerCase('fr')}" ${query&&!model.fullName(student).toLocaleLowerCase('fr').includes(query)?'hidden':''}><input type="checkbox" data-change="pupil" data-id="${student.id}" ${selected.includes(student.id)?'checked':''}>${model.fullName(student)}</label>`)}</div><div class="pp-panel-foot"><p class="muted small">Conserver le dossier crée un fichier consultable hors connexion. Pour un PDF, choisissez « Enregistrer au format PDF » dans la fenêtre d’impression.</p></div></aside>
  <section class="panel pp-export-print-wrap"><div class="panel-head no-print"><strong>Aperçu du dossier sélectionné</strong></div><div class="panel-scroll pp-export-preview" data-scroll="council-export-preview">${doc?councilMarkup(doc):html`<p>${error}</p>`}</div></section></main></div>`;
 },
 actions:{
  option(el){options={...options,[el.dataset.key]:el.checked};refresh();},
  pupil(el){selected=el.checked?[...new Set([...selected,el.dataset.id])]:selected.filter(id=>id!==el.dataset.id);refresh();},
  all(){selected=model.studentsOf(params.classId).map(s=>s.id);refresh();},none(){selected=[];refresh();},
  period(el){go('#/pp/classe/'+params.classId+'/dossier/'+el.value);},
  search(el){search=el.value;const query=search.trim().toLocaleLowerCase('fr');document.querySelectorAll('[data-export-name]').forEach(label=>label.hidden=!!query&&!label.dataset.exportName.includes(query));},
  download(){try{downloadCouncilHTML(documentNow());toast({text:'Dossier sélectionné téléchargé sur cet appareil'});}catch(e){toast({text:e.message});}},
  print(){try{documentNow();refresh();if(typeof window.print!=='function')throw Error('L’impression directe n’est pas disponible ici. Conservez le dossier puis utilisez la commande Imprimer de Chrome.');window.print();}catch(e){toast({text:e.message});}}
 }
};
