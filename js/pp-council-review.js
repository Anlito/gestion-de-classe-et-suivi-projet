import * as db from './db.js';
import * as pp from './pp.js';
import {scopeOf} from './pp-writing.js';
import {reviewPlan} from './pp-council-review-rules.js';
export function reviewData(params){
  const scope=scopeOf(params);
  const heads=pp.latest({classId:scope.classId,kind:'council'}).filter(r=>r.year===scope.year&&(r.studentId||null)===scope.studentId&&r.trimester===scope.trimester&&!r.testMode);
  const advice=heads.filter(r=>r.category!=='synthese'),map=new Map();
  for(const row of advice){if(!map.has(row.entityId))map.set(row.entityId,[]);map.get(row.entityId).push(row);}
  const history=pp.records({classId:scope.classId,kind:'council'}).filter(r=>r.year===scope.year&&(r.studentId||null)===scope.studentId&&r.trimester===scope.trimester&&!r.testMode&&!heads.some(head=>head.id===r.id)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  return {scope,heads,advice,history,syntheses:heads.filter(r=>r.category==='synthese'),groups:[...map].map(([entityId,rows])=>({entityId,rows}))};
}
export async function saveReview(params,input){
  const data=reviewData(params),plan=reviewPlan(data,input),at=new Date().toISOString(),rows=[];
  const advice=plan.advice.map(choice=>{
    if(!choice.merge)return choice.row;
    const row={...choice.row,id:db.uid(),parents:choice.parents,at,reviewResolution:{selectedId:choice.row.id,at}};rows.push(row);return row;
  });
  const id=db.uid(),selected=plan.synthesis;
  const synthesis={...(selected||{}),...data.scope,id,entityId:selected?.entityId||id,parents:data.syntheses.map(r=>r.id),kind:'council',category:'synthese',title:selected?.title||'Synthèse relue',text:plan.text,status:plan.status,at,testMode:false,
    writingBasis:{method:'review-v1',sourceIds:advice.filter(r=>r.text?.trim()).map(r=>r.id),reviewedAdviceIds:advice.map(r=>r.id)},
    reviewResolution:{selectedId:selected?.id||null,previousSynthesisIds:data.syntheses.map(r=>r.id),at}};
  rows.push(synthesis);
  const undo=db.commit(w=>rows.forEach(row=>w.put('ppRecords',row)));
  try{await db.flush();for(const row of rows)await db.verifyStored('ppRecords',row.id,row.updatedAt);}catch(e){await undo();throw e;}
  return synthesis;
}
