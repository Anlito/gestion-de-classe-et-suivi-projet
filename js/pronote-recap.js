import { norm, lines } from './pronote-import.js';
import { validISODate } from './pp-rules.js';

export const ATTENDANCE = [
  ['absenceCount', 'Absences', 'événements'], ['halfDays', 'Absence', 'demi-journées'],
  ['justified', 'Justifiées', 'demi-journées'], ['unjustified', 'Non justifiées', 'demi-journées'],
  ['lateCount', 'Retards', 'événements'], ['lateMinutes', 'Retards', 'minutes'],
  ['absenceRate','Taux d’absence imprimé','%'],
];
export function reportNumber(raw, minutes = false) {
  raw = String(raw || '').trim(); if (raw === '-') return 0;
  const match = raw.match(minutes ? /^(\d+)\s*(?:min)?$/ : /^(\d+)$/);
  if (!match) throw new Error('Cellule numérique absente ou ambiguë dans le relevé. Vérifiez le PDF.');
  const value = Number(match[1]); if (!Number.isSafeInteger(value)) throw new Error('Nombre trop grand dans le relevé.');
  return value;
}
const center = i => i.x + i.width / 2;
export function parseRecap(pages) {
  const fullText = pages.flatMap(p => lines(p.items).map(l => l.text)).join('\n');
  const profile = /Récapitulatif des punitions et des sanctions/i.test(fullText) ? 'discipline' : /Récapitulatif des absences, retards/i.test(fullText) ? 'attendance' : null;
  if (!profile) throw new Error('Modèle de récapitulatif non reconnu.');
  const periods = [...fullText.matchAll(/Période du\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/g)].map(m => [m[3]+'-'+m[2]+'-'+m[1], m[6]+'-'+m[5]+'-'+m[4]]);
  if (!periods.length || periods.some(p => p.join('|') !== periods[0].join('|'))) throw new Error('Période absente ou différente entre les pages du relevé.');
  const period = periods[0];
  if (!period.every(validISODate) || period[0] > period[1]) throw new Error('Période du relevé invalide.');
  const schoolYear = date => Number(date.slice(0,4)) - (Number(date.slice(5,7)) < 9 ? 1 : 0);
  const firstYear = schoolYear(period[0]);
  if (schoolYear(period[1]) !== firstYear) throw new Error('Le relevé traverse deux années scolaires. Exportez une période par année.');
  const rows = [], totals = []; let schema = '', columns = [], sourceSchool = '', clippedRate = false, compactLayout = null;
  for (const page of pages) {
    const all = page.items, studentHeader = all.find(i => norm(i.text) === 'eleves');
    const classHeader = all.find(i => norm(i.text) === 'classes');
    if (!studentHeader || !classHeader) throw new Error(`En-tête du relevé non reconnu, page ${page.number}.`);
    sourceSchool ||= all.find(i => i.y < studentHeader.y - 30 && /^(college|lycee|etablissement)\b/.test(norm(i.text)))?.text || '';
    let centers, headerBottom, minuteIndex = 8, lateIndex = 9;
    if (profile === 'attendance') {
      const find = label => all.find(i => norm(i.text) === label);
      const retards = all.filter(i => norm(i.text) === 'retards').sort((a,b) => a.x-b.x);
      const headers = [find('nb abs'), find('total 1 2') || all.find(i => /^Total\s*½/.test(i.text)), find('taux'), find('oui'), find('non'), find('repas')];
      const internats = all.filter(i => norm(i.text) === 'internat').sort((a,b)=>a.x-b.x);
      headers.push(internats[0], internats[1], find('minute'), retards[retards.length-1], find('infirmer'));
      const compact = headers.some(h=>!h) || retards.length !== 3;
      if (compact) {
        const band=all.filter(i=>i.y>=studentHeader.y-12&&i.y<=studentHeader.y+15&&i.x>classHeader.x+classHeader.width);
        const part=label=>band.find(i=>norm(i.text)===label);
        const nb=part('nb'), abs=part('abs'), minute=part('minu');
        const late=band.find(i=>norm(i.text)==='retar'&&minute&&i.x>minute.x+10);
        const selected=[nb,part('total'),part('taux'),part('oui'),part('non'),part('repa'),minute,late,part('infirm')];
        if(!abs||selected.some(h=>!h)||Math.abs(nb.x-abs.x)>8)throw new Error('Colonnes du relevé d’assiduité non reconnues.');
        centers=selected.map(center);headerBottom=Math.max(...selected.map(h=>h.y));minuteIndex=6;lateIndex=7;
      } else { centers = headers.map(center); headerBottom = Math.max(...headers.map(h=>h.y)); }
      if(compactLayout!==null&&compactLayout!==compact)throw new Error('Colonnes différentes entre les pages.');
      compactLayout=compact;
      columns = ATTENDANCE.map(([id,label,unit])=>({id,label,unit}));
    } else {
      const first = all.find(i=>['rete','ret'].includes(norm(i.text)));
      if (!first) throw new Error('Colonnes du relevé de mesures non reconnues.');
      const headerY = first.y;
      let headers = all.filter(i=>Math.abs(i.y-headerY)<2.5 && i.x>first.x-40 && i.x<page.width-10).sort((a,b)=>a.x-b.x);
      if(headers.length===17&&/^sur\.\s+Co\s*\.$/i.test(headers.at(-1).text.trim())){
        const last=headers.pop();headers.push({...last,text:'sur.',width:last.width/2},{...last,text:'Co .',x:last.x+last.width/2,width:last.width/2});
      }
      if (headers.length !== 18 || !['exclu','ex'].includes(norm(headers[0].text)) || !['devo','de'].includes(norm(headers[2].text))) throw new Error('Colonnes de mesures différentes du modèle vérifié.');
      centers = headers.map(center); headerBottom = Math.max(...headers.map(h=>h.y));
      const currentSchema = headers.map(h=>h.text.trim()).join('|');
      if (schema && schema!==currentSchema) throw new Error('Colonnes différentes entre les pages.');
      schema = currentSchema;
      columns = headers.map((h,n)=>({id:'c'+n,label:`${n<3 ? 'Punition' : 'Mesure à préciser'} · ${h.text.trim()} · colonne ${n+1}`,unit:'mesures',raw:h.text.trim()}));
    }
    if(centers.some((x,n)=>n&&x<=centers[n-1]))throw new Error('Ordre des colonnes non reconnu.');
    const left = centers[0] - (centers[1]-centers[0])/2;
    const values = all.filter(i=>i.y>headerBottom+3 && i.x>=left && /^(?:-|\d+(?:\s*(?:min|mi\.|\.))?|(?:-|\d+(?:,\d+)?)\s*%|\d+(?:,\d+)?\s*\.)$/.test(i.text.trim()));
    const baselines = lines(values,1.8);
    for (const line of baselines) {
      const near = all.filter(i=>Math.abs(i.y-line.y)<1.8);
      const names = near.filter(i=>i.x<left && i.x<classHeader.x-25).sort((a,b)=>a.x-b.x);
      let label = names[0]?.text.trim(); if (!label) throw new Error('Ligne sans identité source : import interrompu.');
      const mergedClass=label.match(/\s+([3456]\s*[A-Z0-9]+)$/i);if(mergedClass)label=label.slice(0,mergedClass.index).trim();
      const total = label.match(/^(\d+)\s*élèves?\b/i);
      const cells = centers.map((x,n)=> {
        const l=n ? (centers[n-1]+x)/2 : left, r=n<centers.length-1 ? (x+centers[n+1])/2 : page.width;
        const items=line.items.filter(i=>center(i)>=l && center(i)<r);
        if(items.length!==1) throw new Error(`Cellule manquante ou fusionnée, page ${page.number}, ligne ${rows.length+1}, colonne ${n+1} (${items.length} fragments).`);
        return items[0].text.trim();
      });
      const numbers = cells.map((v,n)=>profile==='attendance'&&n===2 ? null : reportNumber(profile==='attendance'&&n===minuteIndex?v.replace(/\s*(?:mi\.|\.)$/,''):v,profile==='attendance'&&n===minuteIndex));
      if (total) { totals.push({count:Number(total[1]),numbers}); continue; }
      const sourceClass = mergedClass?.[1] || near.find(i=>i.x>names[0].x+10 && i.x<left && /^[3456]\s*[A-Z0-9]+$/i.test(i.text.trim()))?.text.trim() || '';
      const rateTruncated=profile==='attendance'&&/\.$/.test(cells[2]);clippedRate ||= rateTruncated;
      const rate = profile==='attendance'&&!rateTruncated&&!/^\s*-/.test(cells[2]) ? Number(cells[2].replace('%','').replace(',','.').trim()) : null;
      if(profile==='attendance'&&rate!==null&&(!Number.isFinite(rate)||rate<0||rate>100))throw new Error('Taux d’absence non reconnu.');
      const metrics = profile==='attendance' ? {absenceCount:numbers[0],halfDays:numbers[1],justified:numbers[3],unjustified:numbers[4],lateMinutes:numbers[minuteIndex],lateCount:numbers[lateIndex],absenceRate:rate} : Object.fromEntries(columns.map((c,n)=>[c.id,numbers[n]]));
      rows.push({label,sourceClass,sourceRow:rows.length+1,sourcePage:page.number,metrics,_numbers:numbers});
    }
  }
  const total=totals.at(-1);
  if (!rows.length || !total || total.count!==rows.length) throw new Error('L’effectif extrait ne correspond pas au total du rapport.');
  if(total.numbers.some((v,n)=>v!==null && rows.reduce((sum,r)=>sum+r._numbers[n],0)!==v)) throw new Error('Les sommes extraites ne correspondent pas aux totaux du rapport.');
  rows.forEach(r=>delete r._numbers);
  const counts=new Map(); rows.forEach(r=>counts.set(norm(r.label),(counts.get(norm(r.label))||0)+1)); rows.forEach(r=>{r.ambiguous=counts.get(norm(r.label))>1||/\./.test(r.label);});
  const classes=[...new Set(rows.map(r=>r.sourceClass).filter(Boolean))];
  const extraWarnings=[];
  if(clippedRate)extraWarnings.push('Des taux d’absence sont tronqués dans le PDF : ils restent non renseignés, sans reconstitution.');
  if(rows.some(r=>/\./.test(r.label)))extraWarnings.push('Des identités sont tronquées : vérifiez manuellement les correspondances avec les élèves.');
  return {profile,label:profile==='attendance'?'Relevé d’assiduité PDF':'Relevé de punitions et sanctions PDF',year:`${firstYear}–${firstYear+1}`,period,sourceSchool,sourceClass:classes.length===1?classes[0]:'',rows,columns,totalsChecked:true,
    warnings:[...extraWarnings,'Cumuls de la période exacte : ne pas additionner deux relevés successifs ou chevauchants.','Une ligne absente ne vaut pas zéro. Les appels du Carnet restent une source distincte.',profile==='discipline'?'Les compteurs représentent des mesures, pas des heures. Les abréviations sont conservées par colonne.':'Seuls les cumuls d’absences et de retards sont conservés ; les données d’infirmerie ne sont pas importées.']};
}

export function latestReportHeads(records, profile) {
  const superseded=new Set(records.flatMap(r=>r.parents||[]));
  return records.filter(r=>r.kind==='periodReport'&&r.profile===profile&&!superseded.has(r.id)).sort((a,b)=>b.period[1].localeCompare(a.period[1]) || (b.updatedAt||0)-(a.updatedAt||0));
}
