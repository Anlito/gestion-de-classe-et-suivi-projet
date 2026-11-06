import {reportGroups,mergeGroupKey,reportImportRows} from '../js/pp-import-merge.js';
import {importProblems} from '../js/pronote-import.js';
export const tests=[];
const test=(name,fn)=>tests.push({name,fn});
const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`Attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);};
const reject=fn=>{let failed=false;try{fn();}catch{failed=true;}eq(failed,true);};
function fixture(profile='attendance'){return {profile,sourceSchool:'COLLEGE FICTIF',period:['2026-09-01','2026-11-08'],rows:[{label:'EXEMPLE A.',sourceRow:8,sourcePage:1,metrics:profile==='attendance'?{absenceCount:2,halfDays:3,lateCount:1,lateMinutes:5,absenceRate:10}:{c0:1,c1:2}},{label:'EXEMPLE-A.',sourceRow:9,sourcePage:1,metrics:profile==='attendance'?{absenceCount:3,halfDays:4,lateCount:2,lateMinutes:20,absenceRate:20}:{c0:3,c1:1}}]};}
const options=p=>({mergeGroups:[mergeGroupKey(reportGroups(p,['s','s'])[0])]});
test('Regroupement : doublon sans confirmation toujours bloqué',()=>reject(()=>reportImportRows(fixture(),['s','s'])));
test('Regroupement : compteurs additionnés, taux absent et sources conservées',()=>{const p=fixture(),before=JSON.stringify(p),r=reportImportRows(p,['s','s'],options(p));eq(r.length,1);eq(r[0].row.metrics,{absenceCount:5,halfDays:7,lateCount:3,lateMinutes:25,absenceRate:null});eq(r[0].row.sourceRows.map(x=>x.sourceRow),[8,9]);eq(JSON.stringify(p),before);});
test('Regroupement : mesures additionnées colonne par colonne',()=>{const p=fixture('discipline');eq(reportImportRows(p,['s','s'],options(p))[0].row.metrics,{c0:4,c1:3});});
test('Regroupement : absence de compteur ne devient pas zéro',()=>{const p=fixture();delete p.rows[1].metrics.halfDays;eq(reportImportRows(p,['s','s'],options(p))[0].row.metrics.halfDays,null);});
test('Regroupement : total supérieur à la précision entière refusé',()=>{const p=fixture();p.rows[0].metrics.lateCount=Number.MAX_SAFE_INTEGER;reject(()=>reportImportRows(p,['s','s'],options(p)));});
test('Regroupement : changement de lignes invalide la confirmation',()=>{const p=fixture(),o=options(p);p.rows.push({...p.rows[0],sourceRow:10});reject(()=>reportImportRows(p,['s','s','s'],o));});
test('Regroupement : élèves différents et ligne ignorée restent séparés',()=>{const p=fixture();eq(reportImportRows(p,['s','other']).map(r=>r.studentId),['s','other']);eq(reportImportRows(p,['s','skip']).length,1);});
test('Regroupement : bulletin et liste d’élèves ne sont pas additionnés',()=>{for(const profile of ['bulletin','roster']){const p=fixture(profile);p.year='2026–2027';p.trimester=1;eq(importProblems(p,['s','s'],{id:'c',name:'4E'},'2026–2027',[{id:'s'}],options(p)).length,1);}});
test('Regroupement : confirmation ne contourne pas l’appartenance à la classe',()=>{const p=fixture();eq(importProblems(p,['s','s'],{id:'c',name:'4E'},'2026–2027',[],options(p)).length,3);});
