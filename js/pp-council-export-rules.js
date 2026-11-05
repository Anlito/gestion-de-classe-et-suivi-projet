import {councilProgress,COUNCIL_STATES} from './pp-council-progress.js';
export function councilDocument({classId,className,year,trimester,students,records,studentIds,includeCollective=true,includeAdvice=false,includeDrafts=false,onePerStudent=false,at}){
  if(![1,2,3].includes(trimester))throw Error('Choisissez un trimestre valide.');
  const roster=students.filter(s=>s.classId===classId),ids=new Set(roster.map(s=>s.id));
  if(!Array.isArray(studentIds)||new Set(studentIds).size!==studentIds.length||studentIds.some(id=>!ids.has(id)))throw Error('La liste des élèves a changé. Actualisez votre sélection.');
  if(!studentIds.length&&!includeCollective)throw Error('Sélectionnez au moins un élève ou le récapitulatif de classe.');
  const selected=roster.filter(s=>studentIds.includes(s.id));
  const scoped=records.filter(r=>r.kind==='council'&&r.classId===classId&&r.year===year&&r.trimester===trimester);
  const ordinary=scoped.filter(r=>!r.testMode),progress=councilProgress({students:roster,records:scoped,classId,year,trimester});
  const section=(studentId,name,summary)=>{
    const rows=ordinary.filter(r=>(r.studentId||null)===studentId),syntheses=rows.filter(r=>r.category==='synthese'&&r.text?.trim());
    const texts=includeDrafts||summary.state==='validated'?syntheses:[];
    return {name,state:summary.state,stateLabel:COUNCIL_STATES[summary.state],reason:summary.reason,
      syntheses:texts.map(r=>({text:String(r.text),label:summary.state==='validated'?'Validée':summary.state==='stale'?'À relire':summary.state==='review'?'À vérifier - version '+(r.status==='validated'?'précédemment validée':'brouillon'):'Brouillon'})),
      advice:includeAdvice?rows.filter(r=>r.category!=='synthese'&&r.text?.trim()).map(r=>({subject:String(r.subject||''),teacher:String(r.teacher||''),text:String(r.text),conflict:rows.filter(other=>other.entityId===r.entityId).length>1})):[],
      withheld:!includeDrafts&&summary.state!=='validated'&&syntheses.length>0};
  };
  const sections=[];if(includeCollective)sections.push({...section(null,'Récapitulatif de la classe',progress.collective),collective:true});
  for(const student of selected)sections.push(section(student.id,[student.prenom,student.nom].filter(Boolean).join(' '),progress.pupils.find(r=>r.studentId===student.id)));
  const selectedSet=new Set(studentIds);
  return {className:String(className),year:String(year),trimester,at,studentCount:selected.length,includeAdvice:!!includeAdvice,includeDrafts:!!includeDrafts,includeCollective:!!includeCollective,onePerStudent:!!onePerStudent,sections,
    excludedTests:scoped.filter(r=>r.testMode&&((!r.studentId&&includeCollective)||selectedSet.has(r.studentId))).length};
}
