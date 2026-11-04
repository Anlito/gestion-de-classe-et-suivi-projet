import * as db from './db.js';
import * as pp from './pp.js';
import * as meetings from './pp-meetings.js';
import {serviceURL,FAMILY_PROTOCOL} from './pp-family-rules.js';
export const config=()=>db.getMeta('ppFamilyService',{})||{};
export const published=id=>{const state=db.getMeta('ppFamilyPublished:'+id,null);return state?.url?.split('?')[0]===config().url?state:null;};
const requireTool=()=>{if(!pp.hasPP()||!pp.enabled('rencontres'))throw new Error('Campagnes de rencontres désactivées.');};
async function saveMeta(id,value){const row={id,value},undo=db.commit(w=>w.put('meta',row));try{await db.flush();await db.verifyStored('meta',id,row.updatedAt);}catch(e){await undo();throw e;}}
export async function configure(url,key){
  requireTool();const value={url:serviceURL(url),key:key?.trim()||config().key};if(typeof value.key!=='string'||value.key.length<32||value.key.length>200)throw new Error('Renseignez la clé professeur fournie lors de l’installation.');
  await saveMeta('ppFamilyService',value);
}
async function call(action,payload){
  requireTool();const cfg=config();if(!cfg.key||!cfg.url)throw new Error('Configurez d’abord le service Google des familles.');
  let response;try{response=await fetch(serviceURL(cfg.url),{method:'POST',body:new URLSearchParams({action,key:cfg.key,payload:JSON.stringify(payload)}),credentials:'omit',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(30000)});}catch{throw new Error('Liaison directe avec Google non confirmée. Réessayez ou utilisez l’espace professeur Google et les fichiers.');}
  if(!response.ok)throw new Error('Le service Google n’a pas répondu. Réessayez ou utilisez l’espace professeur Google.');
  let result;try{result=await response.json();}catch{throw new Error('Google ne renvoie pas les données attendues. Vérifiez le déploiement ou utilisez l’espace professeur Google.');}if(result?.protocol!==FAMILY_PROTOCOL||!result.ok)throw new Error(result?.error||'Réponse du service non reconnue. Vérifiez le déploiement Google.');return result;
}
export async function publish(id){
  const campaign=meetings.exportCampaign(id),cfg=config(),result=await call('publish',campaign);
  const url=new URL(result.publicURL);if(url.origin!=='https://script.google.com'||url.pathname!==new URL(cfg.url).pathname||!/^[-a-zA-Z0-9_]{20,100}$/.test(url.searchParams.get('campaign')||'')||[...url.searchParams.keys()].some(k=>k!=='campaign'))throw new Error('Lien public renvoyé par Google non reconnu.');
  const row=meetings.campaigns().find(c=>c.entityId===id);const state={url:url.href,status:campaign.status,signature:JSON.stringify(campaign),at:new Date().toISOString(),revision:row?.id};
  await saveMeta('ppFamilyPublished:'+id,state);return state;
}
export async function receive(id){const campaign=meetings.exportCampaign(id);const result=await call('list',{campaignId:id});return meetings.importRequests(id,result);}
export const adminURL=()=>config().url?serviceURL(config().url)+'?admin=1':null;
