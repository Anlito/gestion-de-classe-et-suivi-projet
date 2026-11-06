import { parseRecap,reportNumber,latestReportHeads } from '../js/pronote-recap.js';
export const tests=[];
const test=(name,fn)=>tests.push({name,fn});
const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);};
const reject=fn=>{let ok=false;try{fn();}catch{ok=true;}eq(ok,true);};
export function recapPage(profile='discipline',count=2,totalCount=count,number=1,withTotal=true) {
 const items=[],put=(text,x,y,width=10)=>items.push({text,x,y,width,height:8});
 put(profile==='discipline'?'Récapitulatif des punitions et des sanctions':"Récapitulatif des absences, retards et passages à l'infirmerie",250,48);
 put('COLLEGE FICTIF',28,35);put('Période du 01/09/2026 au 08/11/2026',29,73);
 put('Élèves',61,95);put('Classes',150,95);
 let centers,values;
 if(profile==='discipline') {centers=Array.from({length:18},(_,n)=>355+n*26.16);['Exclu.','Rete.','Devo.','Avert.','Blâm.',...Array(11).fill('Exclu.'),'res c.','Com .'].forEach((t,n)=>put(t,centers[n]-10,100.76,20));values=centers.map((_,n)=>n===1?2:0);}
 else {centers=[475,505,537,570,602,635,667,699,733,765,797];['Nb Abs','Total ½','Taux','Oui','Non','Repas','Internat','Internat','minute.','Retards','Infirmer'].forEach((t,n)=>put(t,centers[n]-10,n===3||n===4?111.68:104,20));put('Retards',689,96,20);put('Retards',723,92,20);values=[2,4,null,3,1,0,0,0,10,2,0];}
 for(let row=0;row<count+(withTotal?1:0);row++){let y=122.6+row*11;const total=row===count;put(total?`${totalCount} élèves`:`EXEMPLE Élève ${row+number}`,29.4,y);put(total?'1 classes':'5 B',121,y);
 centers.forEach((x,n)=>{let value=values[n];let text=profile==='attendance'&&n===2?'10 %':String(value*(total?totalCount:1));if(profile==='attendance'&&n===8)text+=' min';put(text,x-2,y,4);});}
 return {number,width:842.16,height:594.96,items};
}
test('Relevé : effectif variable et dix-huit colonnes distinctes',()=>{const r=parseRecap([recapPage('discipline',5)]);eq([r.rows.length,r.columns.length,r.rows[0].metrics.c1],[5,18,2]);});
test('Relevé : deux pages à en-têtes répétés et total global',()=>eq(parseRecap([recapPage('discipline',2,2,1,false),recapPage('discipline',1,3,2)]).rows.length,3));
test('Relevé : total numérique incohérent refusé',()=>{const p=recapPage();const last=p.items.at(-17);last.text='99';reject(()=>parseRecap([p]));});
test('Relevé : effectif incohérent refusé',()=>reject(()=>parseRecap([recapPage('discipline',2,3)])));
test('Relevé : demi-journées et événements distincts',()=>{const r=parseRecap([recapPage('attendance')]);eq([r.rows[0].metrics.absenceCount,r.rows[0].metrics.halfDays,r.rows[0].metrics.lateMinutes],[2,4,10]);});
test('Relevé : aucune donnée d’infirmerie normalisée',()=>eq(Object.keys(parseRecap([recapPage('attendance')]).rows[0].metrics).some(k=>/infirm|national|naissance/i.test(k)),false));
test('Relevé : tiret explicite vaut zéro, vide reste invalide',()=>{eq(reportNumber('-'),0);reject(()=>reportNumber(''));});
test('Relevé : période impossible refusée',()=>{const p=recapPage();p.items.find(i=>i.text.startsWith('Période')).text='Période du 31/02/2026 au 08/11/2026';reject(()=>parseRecap([p]));});
test('Relevé : homonymes non associés automatiquement',()=>{const p=recapPage();p.items.filter(i=>i.text.startsWith('EXEMPLE')).forEach(i=>{i.text='NOM Prénom';});eq(parseRecap([p]).rows.map(r=>r.ambiguous),[true,true]);});
test('Relevé : correction de même période remplace la version courante, pas l’historique',()=>{const a={id:'a',kind:'periodReport',profile:'discipline',period:['2026-09-01','2026-11-08'],parents:[]},b={...a,id:'b',parents:['a']},c={...a,id:'c',period:['2026-09-01','2026-11-30']};eq(latestReportHeads([a,b,c],'discipline').map(r=>r.id),['c','b']);});
