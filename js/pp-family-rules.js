export const FAMILY_PROTOCOL='carnet-pp-rencontres-v1';
export const slotSignature=slots=>JSON.stringify(slots.map(s=>[s.date,s.debut,s.fin]));
export function campaignExport(campaign,className){
  return {protocol:FAMILY_PROTOCOL,campaignId:campaign.entityId,title:campaign.title,className,date:campaign.date,location:campaign.location,status:campaign.status,slots:campaign.slots.map((s,i)=>({index:i,...s})),slotSignature:slotSignature(campaign.slots)};
}
export function familyRequests(payload,campaign){
  if(payload?.protocol!==FAMILY_PROTOCOL||payload.campaignId!==campaign.entityId||payload.slotSignature!==slotSignature(campaign.slots)||!Array.isArray(payload.requests)||payload.requests.length>2000)throw new Error('Ce fichier ne correspond pas aux créneaux de cette campagne.');
  const seen=new Set();
  return payload.requests.map(row=>{
    if(typeof row.id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(row.id)||seen.has(row.id)||typeof row.pupilName!=='string'||!row.pupilName.trim()||row.pupilName.length>120||typeof row.note!=='string'||row.note.length>1000||typeof row.receivedAt!=='string'||!Number.isFinite(Date.parse(row.receivedAt))||!Array.isArray(row.slotIndices)||!row.slotIndices.length||row.slotIndices.length>300||row.slotIndices.some(i=>!Number.isInteger(i)||!campaign.slots[i]))throw new Error('Une demande est incomplète, dupliquée ou contient un créneau inconnu. Aucun import effectué.');
    seen.add(row.id);return {requestId:row.id,pupilName:row.pupilName.trim(),note:row.note,receivedAt:row.receivedAt,slotIndices:[...new Set(row.slotIndices)].sort((a,b)=>a-b)};
  });
}
export function serviceURL(value){
  let url;try{url=new URL(String(value).trim());}catch{throw new Error('Collez l’adresse Google du déploiement, terminée par /exec.');}if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname)||url.search||url.hash)throw new Error('Collez l’adresse Google du déploiement, terminée par /exec, sans paramètres.');return url.href;
}
