import {validISODate} from './pp-rules.js';
import {columnSchema} from './pp-alert-rules.js';
const days=period=>(Date.parse(period[1])-Date.parse(period[0]))/86400000+1;
export function compareReports(a,b){
  if(!a||!b||a.id===b.id)throw Error('Choisissez deux relevés distincts.');
  if([a,b].some(r=>!Array.isArray(r.period)||r.period.length!==2||!r.period.every(validISODate)||r.period[0]>r.period[1]))throw Error('Période de relevé invalide.');
  if(a.studentId!==b.studentId||a.classId!==b.classId||a.year!==b.year||a.profile!==b.profile||(a.sourceSchool||'')!==(b.sourceSchool||'')||!!a.testMode!==!!b.testMode)throw Error('Choisissez le même élève, établissement et type de relevé.');
  if(a.testMode||b.testMode)throw Error('Les relevés TEST sont exclus de cette comparaison.');
  if(a.profile==='discipline'&&columnSchema(a.columns)!==columnSchema(b.columns))throw Error('Les colonnes des relevés diffèrent : comparaison suspendue.');
  const [first,second]=a.period[0]<b.period[0]?[a,b]:[b,a],overlap=first.period[1]>=second.period[0],sameLength=days(first.period)===days(second.period);
  const keys=a.profile==='attendance'?['absenceCount','halfDays','justified','unjustified','lateCount','lateMinutes']:(a.columns||[]).map(c=>c.id);
  return {first,second,overlap,sameLength,days:[days(first.period),days(second.period)],comparable:!overlap&&sameLength,values:keys.map(key=>({key,a:first.metrics?.[key],b:second.metrics?.[key],delta:!overlap&&sameLength&&Number.isFinite(first.metrics?.[key])&&Number.isFinite(second.metrics?.[key])?second.metrics[key]-first.metrics[key]:null}))};
}
