export const canMergeReport = parsed => ['attendance','discipline'].includes(parsed.profile);
export function reportGroups(parsed,mappings) {
  const groups=new Map();
  mappings.forEach((studentId,index)=>{if(!studentId||studentId==='skip')return;if(!groups.has(studentId))groups.set(studentId,{studentId,indexes:[]});groups.get(studentId).indexes.push(index);});
  return [...groups.values()];
}
export const mergeGroupKey = group => JSON.stringify([group.studentId,group.indexes]);
export const mergeConfirmed = (parsed,group,options={}) => canMergeReport(parsed)&&Array.isArray(options.mergeGroups)&&options.mergeGroups.includes(mergeGroupKey(group));
export function reportImportRows(parsed,mappings,options={}) {
  return reportGroups(parsed,mappings).map(group=>{
    const sources=group.indexes.map(i=>parsed.rows[i]);
    if(sources.length===1)return {studentId:group.studentId,row:sources[0]};
    if(!mergeConfirmed(parsed,group,options))throw Error('Confirmez le regroupement des lignes de ce même élève.');
    const metrics={},keys=[...new Set(sources.flatMap(r=>Object.keys(r.metrics||{})))];
    for(const key of keys){
      if(key==='absenceRate'){metrics[key]=null;continue;}
      const values=sources.map(r=>r.metrics?.[key]);
      if(values.some(v=>v==null)){metrics[key]=null;continue;}
      if(values.some(v=>!Number.isSafeInteger(v)||v<0))throw Error('Un compteur à regrouper est invalide.');
      const sum=values.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(sum))throw Error('Le total regroupé est trop grand.');
      metrics[key]=sum;
    }
    return {studentId:group.studentId,row:{...sources[0],metrics,merged:true,sourceRows:sources.map(r=>({sourceRow:r.sourceRow,sourcePage:r.sourcePage,label:r.label,sourceClass:r.sourceClass,metrics:{...r.metrics}}))}};
  });
}
