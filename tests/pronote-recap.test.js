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

function compactPage(profile='attendance') {
 const p=recapPage(profile);p.width=595;
 const centers=profile==='attendance'?[360,385,409,433,457,482,506,530,554]:Array.from({length:18},(_,n)=>252+n*18);
 const rows=p.items.filter(i=>i.y>120),header=p.items.filter(i=>i.y<90||['Élèves','Classes'].includes(i.text));
 p.items=header;if(profile==='attendance')p.items.filter(i=>['Élèves','Classes'].includes(i.text)).forEach(i=>i.y=101);
 const put=(text,x,y,width=12)=>p.items.push({text,x,y,width,height:8});
 if(profile==='attendance'){
  ['Nb','Total','Taux','Oui','Non','Repa.','minu.','Retar','Infirm'].forEach((t,n)=>put(t,centers[n]-6,n===3||n===4?112:102));put('Abs',354,110);
 }else{
  ['Ex.','Ret.','De.','Av.','Blâ.',...Array(11).fill('Ex.')].forEach((t,n)=>put(t,centers[n]-6,101));
  put('sur. Co .',centers[16]-7,99,36);
 }
 for(const y of [...new Set(rows.map(i=>i.y))]){
  const row=rows.filter(i=>i.y===y),label=row[0].text;
  put(label.startsWith('EXEMPLE')?label+' . 5 B':label,29,y,60);
  let values=row.slice(2);if(profile==='attendance')values=values.filter((_,n)=>n!==6&&n!==7);
  values.forEach((item,n)=>put(profile==='attendance'&&n===2?'10,0.':profile==='attendance'&&n===6?item.text.replace(' min',' mi.'):item.text,centers[n]-2,y,4));
 }
 return p;
}
test('Relevé portrait : titres d’assiduité sur plusieurs lignes, sans internat',()=>{
 const r=parseRecap([compactPage()]);eq([r.rows.length,r.rows[0].metrics.halfDays,r.rows[0].metrics.lateMinutes,r.rows[0].metrics.lateCount,r.rows[0].metrics.absenceRate,r.rows[0].sourceClass,r.rows[0].ambiguous],[2,4,10,2,null,'5 B',true]);eq(r.warnings.some(w=>w.includes('taux')),true);
});
test('Relevé portrait : abréviations de mesures et deux derniers titres fusionnés',()=>{const r=parseRecap([compactPage('discipline')]);eq([r.columns.length,r.rows[0].metrics.c1,r.rows[0].sourceClass],[18,2,'5 B']);});
test('Relevé portrait : total incohérent toujours refusé',()=>{const p=compactPage();p.items.filter(i=>i.y>120&&i.x===358).at(-1).text='99';reject(()=>parseRecap([p]));});
test('Relevé portrait : titre obligatoire manquant refusé',()=>{const p=compactPage();p.items=p.items.filter(i=>i.text!=='minu.');reject(()=>parseRecap([p]));});
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
