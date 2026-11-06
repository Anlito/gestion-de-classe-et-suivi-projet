import {validISODate} from './pp-rules.js';
const minutes=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;
const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function meetingSlots({date,ranges,duration,gap=0}) {
  duration=Number(duration);gap=Number(gap);
  if(!validISODate(date))throw new Error('Vérifiez la date de rencontre.');
  if(!Number.isSafeInteger(duration)||duration<5||duration>120||!Number.isSafeInteger(gap)||gap<0||gap>120)throw new Error('Durée : 5 à 120 minutes. Pause : 0 à 120 minutes.');
  const bands=String(ranges||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{
    const match=line.match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/);
    const start=minutes(match?.[1]),end=minutes(match?.[2]);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start<duration)throw new Error('Chaque tranche doit suivre le format 17:30-19:00 et contenir au moins un rendez-vous.');
    return {start,end};
  }).sort((a,b)=>a.start-b.start);
  if(!bands.length||bands.length>20)throw new Error('Renseignez entre 1 et 20 tranches horaires.');
  if(bands.some((b,i)=>i&&b.start<bands[i-1].end))throw new Error('Les tranches horaires ne doivent pas se chevaucher.');
  const slots=[];
  for(const b of bands)for(let n=b.start;n+duration<=b.end;n+=duration+gap)slots.push({date,debut:time(n),fin:time(n+duration)});
  return slots;
}
export const overlaps=(a,b)=>a.date===b.date&&minutes(a.debut)<minutes(b.fin)&&minutes(b.debut)<minutes(a.fin);
export function eventMatchesBooking(event,booking,campaign) {
  return !!event&&event.id===booking.eventId&&event.ppCampaignId===campaign.entityId&&event.studentId===booking.studentId&&event.classId===campaign.classId;
}
