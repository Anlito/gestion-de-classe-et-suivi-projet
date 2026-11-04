import { revisionHeads } from './pp-rules.js';
export const ALERT_METRICS = [
  ['halfDays','Absences · demi-journées'], ['unjustified','Absences non justifiées · demi-journées'],
  ['lateCount','Retards · nombre'], ['lateMinutes','Retards · minutes'],
];
export function validateRule(data) {
  if (!ALERT_METRICS.some(([key])=>key===data.metric) || !['>','>='].includes(data.operator)) throw new Error('Choisissez un indicateur et une comparaison.');
  if (data.threshold === '' || !Number.isSafeInteger(Number(data.threshold)) || Number(data.threshold)<0) throw new Error('Le seuil doit être un entier positif ou nul.');
}
// Un relevé cumulatif ne permet pas de reconstruire une période glissante.
// Chaque établissement et chaque mode d’essai gardent leur propre dernière période.
export function evaluateAlerts(records, rules) {
  const heads=revisionHeads(records), groups=new Map(), alerts=[], warnings=[];
  for(const r of heads.filter(r=>r.kind==='periodReport' && r.profile==='attendance')) {
    const key=JSON.stringify([r.studentId,r.sourceSchool||'',!!r.testMode]);
    if(!groups.has(key))groups.set(key,[]); groups.get(key).push(r);
  }
  for(const rows of groups.values()) {
    const end=rows.map(r=>r.period?.[1]||'').sort().at(-1);
    const candidates=rows.filter(r=>r.period?.[1]===end);
    if(candidates.length!==1) { warnings.push({studentId:rows[0].studentId,text:'Plusieurs relevés se terminent à la même date : vérifiez les sources avant de calculer les alertes.'}); continue; }
    const report=candidates[0];
    for(const rule of rules.filter(r=>r.enabled!==false)) {
      const value=report.metrics?.[rule.metric];
      if(typeof value!=='number'||!Number.isFinite(value))continue;
      if(rule.operator==='>=' ? value<rule.threshold : value<=rule.threshold)continue;
      const key=JSON.stringify([rule.entityId,report.entityId]);
      const signature=JSON.stringify([value,rule.metric,rule.operator,rule.threshold]);
      alerts.push({key,signature,value,rule,report,studentId:report.studentId});
    }
  }
  return {alerts,warnings};
}
