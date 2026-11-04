import * as db from './db.js';
import * as model from './model.js';
import * as pp from './pp.js';
import * as planning from './planning.js';
import {meetingSlots,eventMatchesBooking} from './pp-meeting-rules.js';
import {campaignExport,familyRequests} from './pp-family-rules.js';
export {meetingSlots,eventMatchesBooking};
const requireTool=()=>{if(!pp.hasPP()||!pp.enabled('rencontres'))throw new Error('Les campagnes de rencontres PP sont désactivées.');};
export const campaigns=()=>pp.latest({kind:'meetingCampaign'}).filter(r=>pp.active(r.classId));
export const bookings=id=>pp.latest({kind:'meetingBooking'}).filter(r=>r.campaignId===id);
export const requests=id=>pp.latest({kind:'meetingRequest'}).filter(r=>r.campaignId===id);
export const exportCampaign=id=>{const c=campaignOf(id);return campaignExport(c,db.get('classes',c.classId)?.name||'');};
export async function importRequests(id,payload){
  const c=campaignOf(id),parsed=familyRequests(payload,c),old=pp.records({kind:'meetingRequest'}).filter(r=>r.campaignId===id);
  for(const row of parsed){const prior=old.find(r=>r.requestId===row.requestId);if(prior&&JSON.stringify([prior.pupilName,prior.note,prior.slotIndices,prior.receivedAt])!==JSON.stringify([row.pupilName,row.note,row.slotIndices,row.receivedAt]))throw new Error('Une demande déjà reçue contient des données différentes. Import interrompu, historique conservé.');}
  const added=parsed.filter(row=>!old.some(r=>r.requestId===row.requestId)).map(row=>revision({...row,kind:'meetingRequest',entityId:'family-'+id+'-'+row.requestId,campaignId:id,classId:c.classId,studentId:null,status:'pending'}));
  // Identifiants stables : deux appareils important la même réponse créent la même entité.
  for(const row of added){row.entityId='family-'+id+'-'+row.requestId;row.id=row.entityId+'-initial';}
  await persist(added);return {added:added.length,ignored:parsed.length-added.length};
}
export async function dismissRequest(id){requireTool();const rows=pp.latest({kind:'meetingRequest'}).filter(r=>r.entityId===id);if(rows.length!==1||rows[0].status!=='pending')throw new Error('Demande absente, déjà traitée ou en conflit.');campaignOf(rows[0].campaignId);await persist([revision({...rows[0],status:'dismissed'},rows[0])]);}
export async function reopenRequest(id){requireTool();const rows=pp.latest({kind:'meetingRequest'}).filter(r=>r.entityId===id);if(rows.length!==1)throw new Error('Demande absente ou en conflit.');const old=rows[0];campaignOf(old.campaignId);if(old.status==='assigned'&&bookings(old.campaignId).some(b=>b.entityId===old.bookingId&&b.status!=='cancelled'&&db.get('evenements',b.eventId)))throw new Error('Annulez le rendez-vous existant avant de remettre la demande à traiter.');await persist([revision({...old,status:'pending',studentId:null,bookingId:null},old)]);}
function campaignOf(id){requireTool();const rows=campaigns().filter(r=>r.entityId===id);if(rows.length!==1)throw new Error('Campagne absente ou versions concurrentes.');return rows[0];}
function revision(data,previous=null){const id=db.uid();return {...data,id,entityId:previous?.entityId||id,parents:previous?[previous.id]:[],year:model.schoolYear(),at:new Date().toISOString()};}
async function persist(records,event=null,removeEvent=null){
  const undo=db.commit(w=>{for(const row of records)w.put('ppRecords',row);if(event)w.put('evenements',event);if(removeEvent)w.del('evenements',removeEvent);});
  try{await db.flush();for(const row of records)await db.verifyStored('ppRecords',row.id,row.updatedAt);if(event)await db.verifyStored('evenements',event.id,event.updatedAt);if(removeEvent)await db.verifyStored(db.TOMBS,'evenements:'+removeEvent,db.get(db.TOMBS,'evenements:'+removeEvent)?.updatedAt);}
  catch(e){await undo();throw e;}
}
export async function createCampaign(data){
  requireTool();if(!pp.active(data.classId))throw new Error('Choisissez une classe PP.');
  const slots=meetingSlots(data),title=String(data.title||'').trim();if(!title)throw new Error('Donnez un titre à la campagne.');
  const row=revision({kind:'meetingCampaign',classId:data.classId,studentId:null,title,date:data.date,ranges:data.ranges,duration:Number(data.duration),gap:Number(data.gap||0),location:String(data.location||'').trim(),status:'open',slots});
  await persist([row]);return row;
}
export async function toggleCampaign(id){const old=campaignOf(id);await persist([revision({...old,status:old.status==='open'?'closed':'open'},old)]);}
export async function reserve(id,slotIndex,studentId,channel,requestId=null){
  const campaign=campaignOf(id);if(campaign.status!=='open')throw new Error('Cette campagne est fermée.');
  const student=pp.requireStudent(studentId);if(student.classId!==campaign.classId)throw new Error('Choisissez un élève de cette classe.');
  if(!['Carnet de correspondance','Téléphone','Contact direct','Autre',...(requestId?['Formulaire familles']:[])].includes(channel))throw new Error('Choisissez l’origine de la demande.');
  const pending=requestId?requests(id).filter(r=>r.entityId===requestId):[];
  if(requestId&&(pending.length!==1||pending[0].status!=='pending'||!pending[0].slotIndices.includes(Number(slotIndex))))throw new Error('Demande déjà traitée, en conflit ou créneau non proposé par la famille.');
  const slot=campaign.slots[Number(slotIndex)];if(!slot||!Number.isInteger(Number(slotIndex)))throw new Error('Créneau inconnu.');
  const existing=bookings(id);
  if(existing.some(b=>b.status!=='cancelled'&&(b.studentId===studentId||b.slotIndex===Number(slotIndex))&&db.get('evenements',b.eventId)))throw new Error('Un rendez-vous existe déjà pour cet élève ou ce créneau.');
  if(planning.chevauchementsTout([slot]).length)throw new Error('Ce créneau chevauche un cours ou un événement. Choisissez un autre horaire.');
  const eventId=db.uid();
  const booking=revision({kind:'meetingBooking',classId:campaign.classId,studentId,campaignId:id,slotIndex:Number(slotIndex),eventId,channel,requestId,status:'reserved',date:slot.date,debut:slot.debut,fin:slot.fin});
  // Pas de nom d’élève ni de commentaire personnel dans le titre partagé avec Agenda.
  const event={id:eventId,...slot,type:'parents',titre:campaign.title,lieu:campaign.location,classId:campaign.classId,studentId,ppCampaignId:id,ppBookingId:booking.entityId,ppRemindersManaged:true};
  const resolved=requestId?revision({...pending[0],studentId,status:'assigned',bookingId:booking.entityId},pending[0]):null;
  await persist([booking,...(resolved?[resolved]:[])],event);return booking;
}
export async function cancelBooking(id){
  requireTool();const rows=pp.latest({kind:'meetingBooking'}).filter(r=>r.entityId===id);if(rows.length!==1)throw new Error('Plusieurs versions du rendez-vous : vérifiez le planning.');
  const old=rows[0],campaign=campaignOf(old.campaignId),event=db.get('evenements',old.eventId);
  if(event&&!eventMatchesBooking(event,old,campaign))throw new Error('L’événement a changé de lien élève : vérifiez-le dans l’agenda avant de retirer la réservation.');
  await persist([revision({...old,status:'cancelled'},old)],null,event?.id);
}
