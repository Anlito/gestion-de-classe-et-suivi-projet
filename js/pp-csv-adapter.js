import {readCSV,norm} from './pronote-import.js';
import {validISODate} from './pp-rules.js';
import {ATTENDANCE} from './pronote-recap.js';
export function csvTable(text,delimiter=';'){
  if(![';',',','\t'].includes(delimiter))throw Error('Choisissez un séparateur reconnu.');
  const rows=readCSV(text,delimiter);if(rows.length<2||rows.length>1001)throw Error('Choisissez un CSV de 1 à 1 000 lignes de données.');
  const header=rows.shift().map(s=>s.trim());if(header.some(h=>!h)||new Set(header.map(norm)).size!==header.length)throw Error('Les en-têtes doivent être non vides et distincts.');
  if(rows.some(row=>row.length!==header.length))throw Error('Le nombre de colonnes varie : vérifiez le séparateur et les lignes de totaux.');
  return {header,rows};
}
export function adaptCSV(table,config){
  const {header,rows}=table,profile=config.profile;if(!['attendance','discipline'].includes(profile))throw Error('Choisissez un relevé d’assiduité ou de mesures.');
  const col=value=>{if(value===''||value==null)return null;const i=Number(value);if(!Number.isSafeInteger(i)||i<0||i>=header.length)throw Error('Colonne CSV inconnue.');return i;};
  const identity=col(config.identity),surname=col(config.surname),firstname=col(config.firstname),classCol=col(config.classCol);
  if(identity===null&&(surname===null||firstname===null))throw Error('Choisissez la colonne Élève ou les colonnes Nom et Prénom.');
  if(identity===null&&surname===firstname)throw Error('Nom et prénom doivent utiliser deux colonnes distinctes.');
  const period=[config.from,config.to];if(!period.every(validISODate)||period[0]>period[1])throw Error('Renseignez la période exacte du relevé.');
  const sy=d=>Number(d.slice(0,4))-(Number(d.slice(5,7))<9?1:0),year=sy(period[0]);if(sy(period[1])!==year)throw Error('La période traverse deux années scolaires.');
  if(!String(config.school||'').trim())throw Error('Indiquez l’établissement source.');
  let columns=[];
  if(profile==='attendance')columns=ATTENDANCE.filter(([id])=>id!=='absenceRate'&&col(config.metrics?.[id])!==null).map(([id,label,unit])=>({id,label,unit,index:col(config.metrics[id])}));
  else columns=(config.columns||[]).map(item=>{const index=col(item.index);if(index===null||!String(item.label||'').trim())throw Error('Choisissez la colonne et le libellé de chaque compteur de mesure.');return {id:'csv-'+norm(header[index]).replaceAll(' ','-'),label:String(item.label).trim(),unit:'mesure(s)',index};});
  if(!columns.length||new Set(columns.map(c=>c.index)).size!==columns.length||new Set(columns.map(c=>c.id)).size!==columns.length)throw Error('Choisissez au moins un compteur, avec une colonne distincte pour chacun.');
  if(columns.some(c=>[identity,surname,firstname,classCol].filter(i=>i!==null).includes(c.index)))throw Error('Une colonne d’identité ou de classe ne peut pas servir de compteur.');
  const result=rows.map((r,i)=>{const label=identity===null?[r[surname],r[firstname]].join(' ').trim():r[identity].trim();if(!label)throw Error('Identité absente ligne '+(i+2)+'.');const metrics={};for(const c of columns){const raw=r[c.index].trim();if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw Error('Ligne '+(i+2)+' : « '+c.label+' » doit être un entier explicite (0 si aucun).');metrics[c.id]=Number(raw);}return {sourceRow:i+2,label,sourceClass:classCol===null?'':r[classCol].trim(),metrics};});
  const counts=new Map();for(const row of result)counts.set(norm(row.label),(counts.get(norm(row.label))||0)+1);for(const row of result)row.ambiguous=counts.get(norm(row.label))>1;
  return {profile,label:profile==='attendance'?'Assiduité CSV paramétrée':'Mesures CSV paramétrées',year:year+'–'+(year+1),sourceSchool:String(config.school).trim(),sourceClass:'',period,columns:columns.map(({index,...c})=>c),rows:result,totalsChecked:config.verified===true,sourceFormat:'csv',warnings:['Colonnes et période choisies manuellement : vérifier toutes les valeurs avant validation.','Une cellule vide n’est jamais assimilée à zéro. Aucun total PDF n’est disponible pour ce fichier CSV.','Seuls des cumuls par élève sont acceptés ici. Les lignes de détail, totaux ou sous-totaux doivent être retirées.']};
}
