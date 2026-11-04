import * as pp from '../pp.js';
import * as db from '../db.js';
import * as model from '../model.js';
import { html, toast } from '../ui.js';
import { backLink, saveStatus } from '../components.js';
import { refresh } from '../nav.js';
import { ALERT_METRICS, validateRule, evaluateAlerts, columnSchema, ruleLabel, manualMetric } from '../pp-alert-rules.js';
async function store(data,previous) {
  const versions=Array.isArray(previous)?previous:previous?[previous]:[];
  const id=db.uid(), entry={...data,id,entityId:versions[0]?.entityId||id,parents:versions.map(r=>r.id),year:model.schoolYear(),at:new Date().toISOString()};
  const undo=db.commit(w=>w.put('ppRecords',entry));
  try { await db.flush(); await db.verifyStored('ppRecords',id,entry.updatedAt); } catch(e) { await undo(); throw e; }
}
export default {
  render() {
    if(!pp.hasPP()||!pp.enabled('alertes'))return html`<div class="screen"><a href="#/pp">Retour au suivi PP</a><p>Les alertes PP sont masquées.</p></div>`;
    const activeClasses=new Set(pp.classes().map(c=>c.id));
    const records=pp.records().filter(r=>activeClasses.has(r.classId));
    const rules=pp.latest({kind:'alertRule'}), follows=pp.latest({kind:'alertFollowup'});
    const conflicts=new Set(rules.filter(r=>rules.some(s=>s.id!==r.id&&s.entityId===r.entityId)).map(r=>r.entityId));
    const sources=new Map();
    for(const report of pp.latest({kind:'periodReport'}).filter(r=>activeClasses.has(r.classId)&&r.profile==='discipline'))for(const col of report.columns||[]) {
      const source={columnId:col.id,columnLabel:col.label,columnSchema:columnSchema(report.columns),sourceSchool:report.sourceSchool||''};
      sources.set(JSON.stringify(source),source);
    }
    const yearStart=Number(String(model.schoolYear()).match(/\d{4}/)?.[0]);
    const {alerts,warnings}=evaluateAlerts(records,rules.filter(r=>!conflicts.has(r.entityId)));
    return html`<div class="screen"><header class="topbar">${backLink('#/pp','Suivi PP')}<div class="title">Alertes PP</div><div class="spacer"></div>${saveStatus()}</header><main class="content pp-tools">
    <section class="panel"><div class="panel-head"><strong>Seuils communs aux classes PP · ${model.schoolYear()}</strong></div><div class="panel-scroll">
    <p>Aucune limite n’est imposée. Choisissez vos seuils ; les compteurs PDF utilisent leur dernière période disponible. Les saisies personnelles utilisent les dates de début et de fin choisies.</p>
    <form class="stack" data-submit="addRule"><label class="lbl">Indicateur<select class="input" name="metric">${ALERT_METRICS.map(([k,label])=>html`<option value="${k}">${label}</option>`)}</select></label>
    <details><summary>Période des saisies / colonne du relevé</summary><div class="stack">
    <label class="lbl">Début des saisies inclus<input class="input" type="date" name="from" value="${yearStart}-09-01"></label><label class="lbl">Fin des saisies incluse<input class="input" type="date" name="to" value="${yearStart+1}-08-31"></label>
    <label class="lbl">Colonne pour « compteur du relevé choisi »<select class="input" name="disciplineSource"><option value="">Choisir après import du PDF</option>${[...sources].map(([value,source])=>html`<option value="${value}">${source.sourceSchool||'Établissement non précisé'} · ${source.columnLabel}</option>`)}</select></label><p class="muted small">Les dates ci-dessus concernent les saisies personnelles ; les compteurs importés gardent la période imprimée sur leur PDF.</p></div></details>
    <label class="lbl">Déclenchement<select class="input" name="operator"><option value=">">Strictement supérieur à</option><option value=">=">Supérieur ou égal à</option></select></label><label class="lbl">Seuil<input class="input" name="threshold" type="number" min="0" step="1" required></label><button class="btn accent" type="submit">Ajouter le seuil</button></form>
    ${rules.map(r=>html`<div class="pp-tool-row"><span>${ruleLabel(r)}${manualMetric(r.metric)?` · du ${r.from} au ${r.to}`:''} ${r.operator} ${r.threshold}${conflicts.has(r.entityId)?' · versions concurrentes, calcul suspendu':''}</span><button class="btn" data-click="toggleRule" data-id="${r.id}">${r.enabled===false?'Réactiver':'Désactiver'}</button></div>`)}
    <p class="muted small">Les périodes ne sont jamais additionnées. Les données absentes ne valent pas zéro. Les compléments liés à un relevé ne sont pas ajoutés à son compteur. Les minutes de retenue portent seulement sur les durées saisies connues ; les mesures annulées sont exclues. Les dates inconnues sont signalées et exclues.</p></div></section>
    <section class="panel"><div class="panel-head"><strong>${alerts.length} dépassement(s) actuel(s)</strong></div><div class="panel-scroll">
    ${conflicts.size?html`<p>Des seuils ont des versions concurrentes : leur calcul est suspendu. Conservez vos sauvegardes pour les rapprocher.</p>`:''}
    ${warnings.map(w=>html`<p>${db.get('students',w.studentId)?.prenom} : ${w.text}</p>`)}
    ${!alerts.length?html`<p>Aucun dépassement calculable avec les seuils et les relevés disponibles.</p>`:''}
    ${alerts.map(a=>{const pupil=db.get('students',a.studentId);const follow=follows.filter(f=>f.alertKey===a.key);const treated=follow.length===1&&follow[0].signature===a.signature&&follow[0].status==='done';return html`<article class="pp-alert-card"><a class="btn" href="#/pp/eleve/${a.studentId}">${pupil?.prenom} ${pupil?.nom} · ouvrir la fiche</a><p><strong>${a.report.testMode?'TEST · ':''}${ruleLabel(a.rule)} : ${a.value} ${a.rule.operator} ${a.rule.threshold}</strong></p><p>Du ${a.report.period[0]} au ${a.report.period[1]} · ${a.report.sourceSchool||'Établissement non précisé'}</p><p class="muted small">${a.note||''}</p><p>${treated?'Traité pour cette valeur et ce seuil':'À examiner'}${follow.length>1?' · suivis concurrents conservés':''}</p>${pp.records({kind:'alertFollowup'}).filter(f=>f.alertKey===a.key).sort((x,y)=>(y.updatedAt||0)-(x.updatedAt||0)).map(f=>html`<p class="muted small">Suivi enregistré : ${f.text}${f.signature!==a.signature?' · valeur ou seuil modifié depuis':''}</p>`)}<form class="stack" data-submit="follow"><input type="hidden" name="alertKey" value="${a.key}"><input type="hidden" name="signature" value="${a.signature}"><input type="hidden" name="studentId" value="${a.studentId}"><label class="lbl">Note de suivi<textarea class="field" rows="3" name="text" required></textarea></label><button class="btn" type="submit">Noter comme traité</button></form></article>`;})}
    </div></section></main></div>`;
  },
  actions:{
    async addRule(el,e) {e.preventDefault();try {if(!pp.hasPP()||!pp.enabled('alertes'))throw new Error('Outil désactivé.');const form=Object.fromEntries(new FormData(el));const data={metric:form.metric,operator:form.operator,threshold:form.threshold};if(manualMetric(data.metric)){data.from=form.from;data.to=form.to;}if(data.metric==='disciplineColumn'){const source=JSON.parse(form.disciplineSource||'null');if(!source)throw new Error('Choisissez la colonne du relevé.');Object.assign(data,source);}validateRule(data);await store({...data,threshold:Number(data.threshold),kind:'alertRule',classId:null,studentId:null,enabled:true});refresh();toast({text:'Seuil enregistré'});}catch(err){toast({text:err.message});}},
    async toggleRule(el) {try {if(!pp.hasPP()||!pp.enabled('alertes'))return;const row=db.get('ppRecords',el.dataset.id);if(row?.kind!=='alertRule')return;await store({...row,enabled:row.enabled===false},row);refresh();}catch(err){toast({text:err.message});}},
    async follow(el,e) {e.preventDefault();try {if(!pp.enabled('alertes'))throw new Error('Outil désactivé.');const data=Object.fromEntries(new FormData(el)),s=pp.requireStudent(data.studentId);if(!data.text.trim())throw new Error('Renseignez une note de suivi.');const previous=pp.latest({kind:'alertFollowup'}).filter(f=>f.alertKey===data.alertKey);if(previous.length>1)throw new Error('Plusieurs versions du suivi sont présentes.');await store({...data,text:data.text.trim(),kind:'alertFollowup',classId:s.classId,status:'done'},previous[0]);refresh();toast({text:'Suivi enregistré'});}catch(err){toast({text:err.message});}}
  }
};
