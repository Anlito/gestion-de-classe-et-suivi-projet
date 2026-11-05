export function sameIds(a,b){
  return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&new Set(a).size===a.length&&new Set(b).size===b.length&&a.every(id=>typeof id==='string'&&b.includes(id));
}
export const scopeStamp=scope=>JSON.stringify([scope.year,scope.classId,scope.studentId||null,scope.trimester]);
export function reviewPlan(data,input){
  if(input.expectedScope!==scopeStamp(data.scope))throw Error('Le contexte de classe ou d’année a changé. Rouvrez la relecture.');
  if(!sameIds(input.expectedIds,data.heads.map(r=>r.id)))throw Error('Les avis ou les synthèses ont changé. Rechargez la relecture avant d’enregistrer.');
  if(input.reviewed!==true)throw Error('Confirmez la relecture des avis et du texte retenu.');
  if(!['draft','validated'].includes(input.status))throw Error('État de synthèse inconnu.');
  if(typeof input.text!=='string'||!input.text.trim()||input.text.length>20000)throw Error('Renseignez une synthèse de 20 000 caractères maximum.');
  const synthesis=data.syntheses.find(r=>r.id===input.synthesisId);
  if(data.syntheses.length&&!synthesis||!data.syntheses.length&&input.synthesisId)throw Error('Choisissez la synthèse à retenir parmi les versions affichées.');
  const advice=data.groups.map(group=>{
    const row=group.rows.find(r=>r.id===input.choices?.[group.entityId]);
    if(!row)throw Error('Choisissez une version pour chaque avis en conflit.');
    return {row,parents:group.rows.map(r=>r.id),merge:group.rows.length>1};
  });
  if(Object.keys(input.choices||{}).some(entityId=>!data.groups.some(g=>g.entityId===entityId)))throw Error('Une sélection d’avis ne correspond plus aux sources affichées.');
  return {synthesis,advice,text:input.text.trim(),status:input.status};
}
