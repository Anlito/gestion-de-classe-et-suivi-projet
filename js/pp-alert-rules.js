import { revisionHeads, validISODate } from './pp-rules.js';
export const ALERT_METRICS = [
  ['halfDays','Absences · demi-journées'], ['unjustified','Absences non justifiées · demi-journées'],
  ['lateCount','Retards · nombre'], ['lateMinutes','Retards · minutes'],
  ['disciplineColumn','Mesures · compteur du relevé choisi'],
  ['manualMeasures','Mesures indépendantes saisies · nombre'],
  ['retentionMinutes','Retenues documentées · minutes connues'],
  ['observations','Carnet · observations saisies'],
  ['carnetMissing','Carnet · défauts de carnet saisis'],
];
export const manualMetric = metric => ['manualMeasures','retentionMinutes','observations','carnetMissing'].includes(metric);
export const columnSchema = columns => JSON.stringify((columns||[]).map(c=>[c.id,c.label]));
export function ruleLabel(rule) {
  return (ALERT_METRICS.find(([key])=>key===rule.metric)?.[1]||'Indicateur inconnu')+
    (rule.metric==='disciplineColumn'?` · ${rule.columnLabel} · ${rule.sourceSchool||'Établissement non précisé'}`:'');
}
export function validateRule(data) {
  if (!ALERT_METRICS.some(([key])=>key===data.metric) || !['>','>='].includes(data.operator)) throw new Error('Choisissez un indicateur et une comparaison.');
  if (data.threshold === '' || !Number.isSafeInteger(Number(data.threshold)) || Number(data.threshold)<0) throw new Error('Le seuil doit être un entier positif ou nul.');
  if(manualMetric(data.metric) && (!validISODate(data.from)||!validISODate(data.to)||data.from>data.to))throw new Error('Choisissez une période de saisie valide, début inclus et fin incluse.');
  if(data.metric==='disciplineColumn' && (!data.columnId||!data.columnLabel||!data.columnSchema||typeof data.sourceSchool!=='string'))throw new Error('Choisissez la colonne et l’établissement du relevé.');
}
// Un relevé cumulatif ne permet pas de reconstruire une période glissante.
// Chaque établissement et chaque mode d’essai gardent leur propre dernière période.
export function evaluateAlerts(records, rules) {
  const heads=revisionHeads(records), groups=new Map(), alerts=[], warnings=[];
  const emit=(rule,report,value,note='')=>{
    if(typeof value!=='number'||!Number.isFinite(value))return;
    if(rule.operator==='>=' ? value<rule.threshold : value<=rule.threshold)return;
    const key=JSON.stringify([rule.entityId,report.entityId]);
    const signature=JSON.stringify([value,rule.metric,rule.operator,rule.threshold,...(manualMetric(rule.metric)?[rule.from,rule.to]:rule.metric==='disciplineColumn'?[rule.columnId,rule.columnSchema]:[])]);
    alerts.push({key,signature,value,rule,report,studentId:report.studentId,note});
  };
  for(const r of heads.filter(r=>r.kind==='periodReport' && ['attendance','discipline'].includes(r.profile))) {
    const key=JSON.stringify([r.studentId,r.profile,r.sourceSchool||'',!!r.testMode]);
    if(!groups.has(key))groups.set(key,[]); groups.get(key).push(r);
  }
  for(const rows of groups.values()) {
    const end=rows.map(r=>r.period?.[1]||'').sort().at(-1);
    const candidates=rows.filter(r=>r.period?.[1]===end);
    if(candidates.length!==1) { warnings.push({studentId:rows[0].studentId,text:'Plusieurs relevés se terminent à la même date : vérifiez les sources avant de calculer les alertes.'}); continue; }
    const report=candidates[0];
    for(const rule of rules.filter(r=>r.enabled!==false)) {
      if(manualMetric(rule.metric))continue;
      if(rule.metric==='disciplineColumn') {
        if(report.profile!=='discipline'||(report.sourceSchool||'')!==rule.sourceSchool)continue;
        if(columnSchema(report.columns)!==rule.columnSchema) {warnings.push({studentId:report.studentId,text:'La présentation du relevé de mesures a changé : vérifiez la colonne du seuil.'});continue;}
        emit(rule,report,report.metrics?.[rule.columnId],'Compteur du PDF uniquement ; les compléments et mesures indépendantes ne sont pas ajoutés.');
      } else if(report.profile==='attendance')emit(rule,report,report.metrics?.[rule.metric]);
    }
  }
  for(const rule of rules.filter(r=>r.enabled!==false&&manualMetric(r.metric))) {
    const relevant=heads.filter(r=>r.studentId && (rule.metric==='observations'?r.kind==='carnet'&&r.category==='Observation':rule.metric==='carnetMissing'?r.kind==='carnet'&&r.category==='Défaut de carnet':r.kind==='measure'&&(rule.metric==='retentionMinutes'?r.category==='Retenue':!r.reportEntityId)));
    const buckets=new Map();
    for(const row of relevant){const key=JSON.stringify([row.studentId,!!row.testMode]);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(row);}
    for(const rows of buckets.values()) {
      // Vérifier les branches avant de filtrer date/état : une branche pourrait changer ces champs.
      const ambiguous=rows.some(r=>heads.filter(h=>h.entityId===r.entityId).length>1);
      if(ambiguous){warnings.push({studentId:rows[0].studentId,text:`${ruleLabel(rule)} : versions concurrentes, calcul suspendu.`});continue;}
      const live=rows.filter(r=>r.status!=='annulée');
      const unknownDate=live.filter(r=>!validISODate(r.date)).length;
      const dated=live.filter(r=>validISODate(r.date)&&r.date>=rule.from&&r.date<=rule.to);
      const unknownDuration=rule.metric==='retentionMinutes'?dated.filter(r=>!Number.isSafeInteger(r.durationMinutes)||r.durationMinutes<0).length:0;
      if(unknownDate||unknownDuration)warnings.push({studentId:rows[0].studentId,text:`${ruleLabel(rule)} : ${unknownDate} date(s) manquante(s), ${unknownDuration} durée(s) inconnue(s), exclues du calcul.`});
      if(!dated.length)continue;
      const value=rule.metric==='retentionMinutes'?dated.reduce((n,r)=>n+(Number.isSafeInteger(r.durationMinutes)&&r.durationMinutes>=0?r.durationMinutes:0),0):dated.length;
      if(rule.metric==='retentionMinutes'&&unknownDuration===dated.length)continue;
      emit(rule,{studentId:rows[0].studentId,entityId:JSON.stringify(['manual',rows[0].studentId,!!rows[0].testMode,rule.from,rule.to]),testMode:rows[0].testMode,period:[rule.from,rule.to],sourceSchool:'Saisies personnelles datées'},value,rule.metric==='retentionMinutes'?'Durées connues uniquement, mesures liées comprises une seule fois ; ce montant ne représente pas toutes les heures du PDF.':rule.metric==='manualMeasures'?'Mesures indépendantes uniquement, sans ajout au compteur PDF.':'Catégorie explicite du carnet ; les appréciations des bulletins et les encouragements ne sont pas comptés.');
    }
  }
  return {alerts,warnings};
}
