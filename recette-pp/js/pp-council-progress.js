export const COUNCIL_STATES={missing:'À préparer',draft:'Brouillon',validated:'Validée',review:'À vérifier',stale:'À relire'};
export function councilProgress({students,records,classId,year,trimester}){
  const scoped=records.filter(r=>r.kind==='council'&&r.classId===classId&&r.year===year&&r.trimester===trimester);
  const one=studentId=>{
    const all=scoped.filter(r=>(r.studentId||null)===studentId),rows=all.filter(r=>!r.testMode&&r.text?.trim()),advice=rows.filter(r=>r.category!=='synthese'),syntheses=rows.filter(r=>r.category==='synthese');
    const ordinary=all.filter(r=>!r.testMode);
    const duplicate=ordinary.some(r=>ordinary.filter(other=>other.entityId===r.entityId).length>1);
    const currentAdvice=all.filter(r=>!r.testMode&&r.category!=='synthese');
    const stale=syntheses.some(r=>r.writingBasis?.reviewedAdviceIds
      ?r.writingBasis.reviewedAdviceIds.length!==currentAdvice.length||r.writingBasis.reviewedAdviceIds.some(id=>!currentAdvice.some(a=>a.id===id))
      :r.writingBasis?.sourceIds?.some(id=>!advice.some(a=>a.id===id)));
    let state=!syntheses.length?'missing':syntheses[0].status==='validated'?'validated':'draft';
    const synthesisCount=ordinary.filter(r=>r.category==='synthese').length;
    if(stale)state='stale';if(duplicate||synthesisCount>1)state='review';
    return {studentId,adviceCount:new Set(advice.map(r=>r.entityId)).size,state,syntheses:synthesisCount,testCount:all.filter(r=>r.testMode).length,reason:state==='review'?'Plusieurs versions ou synthèses : choisir le texte à retenir.':state==='stale'?'Les avis ont changé depuis la préparation ou la dernière relecture.':''};
  };
  const pupils=students.filter(s=>s.classId===classId).map(s=>({...one(s.id),student:s}));
  const counts=Object.fromEntries(Object.keys(COUNCIL_STATES).map(key=>[key,pupils.filter(r=>r.state===key).length]));
  return {pupils,collective:one(null),counts,testCount:scoped.filter(r=>r.testMode).length};
}
