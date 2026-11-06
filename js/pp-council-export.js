import * as db from './db.js';
import * as model from './model.js';
import * as pp from './pp.js';
import {councilDocument} from './pp-council-export-rules.js';
import {html,raw} from './ui.js';
export function prepareCouncilDocument(params,options){
  const trimester=Number(params.trimester);if(!pp.active(params.classId)||!pp.enabled('conseils'))throw Error('Activez Conseils pour cette classe PP.');
  return councilDocument({classId:params.classId,className:db.get('classes',params.classId)?.name,year:model.schoolYear(),trimester,students:model.studentsOf(params.classId),records:pp.latest({classId:params.classId,kind:'council'}),studentIds:options.studentIds,includeCollective:options.includeCollective!==false,includeAdvice:options.includeAdvice===true,includeDrafts:options.includeDrafts===true,onePerStudent:options.onePerStudent===true,at:new Date().toISOString()});
}
export const COUNCIL_PRINT_CSS=`
.pp-export-document{font:14px/1.5 Arial,Helvetica,sans-serif;color:#202434;background:#fff;overflow-wrap:anywhere;}
.pp-export-document *{box-sizing:border-box;}
.pp-export-document h1{font-size:26px;line-height:1.2;margin:0 0 8px;}
.pp-export-document h2{font-size:21px;line-height:1.25;margin:0 0 8px;break-after:avoid;}
.pp-export-document h3{font-size:15px;margin:16px 0 6px;break-after:avoid;}
.pp-export-document p{margin:6px 0 12px;}
.pp-export-document .export-meta{color:#52576a;font-size:12px;}
.pp-export-document .export-section{padding:26px 0;border-top:2px solid #e6e7ee;}
.pp-export-document .export-section:first-of-type{margin-top:24px;}
.pp-export-document .export-text{white-space:pre-wrap;margin:8px 0 16px;orphans:3;widows:3;}
.pp-export-document .export-state{display:inline-block;border:1px solid #b7bbc8;border-radius:5px;padding:2px 7px;font-size:12px;margin:0 0 8px;}
.pp-export-document .export-source{border-left:3px solid #d5d7e0;padding-left:12px;margin:12px 0;}
.pp-export-document .export-note{font-size:12px;color:#555c70;background:#f3f4f8;padding:12px;}
.pp-export-document .export-footer{font-size:11px;color:#555c70;border-top:1px solid #d5d7e0;padding-top:10px;margin-top:26px;}
@page{size:A4 portrait;margin:14mm 14mm 16mm;@bottom-right{content:"Page " counter(page) " / " counter(pages);font:9pt Arial,Helvetica,sans-serif;color:#555c70;}}
@media print{
 .pp-export-document{font-size:11pt;line-height:1.45;}
 .pp-export-document h1{font-size:22pt;}.pp-export-document h2{font-size:17pt;}
 .pp-export-document .export-section{padding:12pt 0;border-top:1px solid #d5d7e0;margin:0;}
 .pp-export-document.export-per-student .export-section{break-before:page;}
 .pp-export-document.export-per-student .export-section:first-of-type{break-before:auto;}
 .pp-export-document .export-source{break-inside:auto;}
 .pp-export-document .export-text{overflow:visible;}
 .pp-export-document .export-meta,.pp-export-document .export-note{font-size:9pt;}
 .pp-export-document .export-state{font-size:9pt;}
 .pp-export-document .export-footer{font-size:8pt;}
 .pp-export-document .export-cover{break-after:avoid;}
 .pp-export-document .export-section:first-of-type{margin-top:0;}
 .pp-export-print-wrap{display:block!important;height:auto!important;padding:0!important;border:0!important;overflow:visible!important;box-shadow:none!important;}
 .pp-export-preview{display:block!important;height:auto!important;max-height:none!important;overflow:visible!important;padding:0!important;}
}
`;
export function councilMarkup(doc){
  const date=new Date(doc.at).toLocaleString('fr-FR');
  return html`<div class="pp-export-document${doc.onePerStudent?' export-per-student':''}"><header class="export-cover"><h1>Préparation du conseil de classe</h1><p>${doc.className} · ${doc.year} · Trimestre ${doc.trimester}</p><p class="export-meta">Édité le ${date} · ${doc.studentCount} élève(s) sélectionné(s)${doc.includeCollective?' · récapitulatif de classe inclus':''}</p>
  <p class="export-note">${doc.includeDrafts?'Brouillons et textes à vérifier inclus, avec leur état indiqué.':'Seules les synthèses actuellement validées sont reproduites. Les autres situations sont signalées sans leur texte.'}${doc.includeAdvice?' Avis des professeurs inclus.':''} Ce dossier ne contient ni notes personnelles PP, ni documents joints, ni audios.${doc.excludedTests?' Les éléments TEST ont été exclus.':''}</p><p class="export-meta">Dossier de travail personnel · ${doc.sections.length} rubrique(s). Le nombre d’avis ne garantit pas que toutes les matières ont répondu.</p></header>
  ${doc.sections.map(section=>html`<section class="export-section"><h2>${section.name}</h2><p class="export-meta">${doc.className} · ${doc.year} · Trimestre ${doc.trimester}</p><span class="export-state">${section.stateLabel}</span>${section.reason?html`<p class="export-meta">${section.reason}</p>`:''}
  <h3>${section.collective?'Conclusion générale de la classe':'Synthèse de l’élève'}</h3>${section.syntheses.map(synthesis=>html`<div>${section.syntheses.length>1||synthesis.label!==section.stateLabel?html`<span class="export-state">${synthesis.label}</span>`:''}<div class="export-text">${synthesis.text}</div></div>`)}${!section.syntheses.length?html`<p class="export-meta">${section.withheld?'Texte non reproduit : activer l’option des brouillons et textes à vérifier pour l’inclure.':'Aucune synthèse disponible dans cette sélection.'}</p>`:''}
  ${doc.includeAdvice?html`<h3>Avis des professeurs</h3>${section.advice.map(advice=>html`<article class="export-source"><strong>${[advice.subject,advice.teacher].filter(Boolean).join(' · ')||'Avis'}</strong>${advice.conflict?html`<p class="export-meta">Version concurrente - avis à vérifier</p>`:''}<div class="export-text">${advice.text}</div></article>`)}${!section.advice.length?html`<p class="export-meta">Aucun avis disponible pour cette sélection.</p>`:''}`:''}</section>`)}
  <footer class="export-footer">Instantané édité le ${date}. Les modifications ultérieures du Carnet ne changent pas ce document.</footer></div>`;
}
export function standaloneCouncilHTML(doc){
  return html`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Conseil · ${doc.className} · Trimestre ${doc.trimester}</title><style>${raw(COUNCIL_PRINT_CSS+'body{margin:24px auto;padding:0 20px;max-width:900px;}@media print{body{margin:0;padding:0;max-width:none;}}')}</style></head><body>${councilMarkup(doc)}</body></html>`.s;
}
export function downloadCouncilHTML(doc){
  const blob=new Blob([standaloneCouncilHTML(doc)],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=('conseil-'+doc.className+'-'+doc.year+'-T'+doc.trimester).replace(/[^\p{L}\p{N}-]+/gu,'-')+'.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
