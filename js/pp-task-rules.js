import {validISODate} from './pp-rules.js';
export const TASK_STATES={todo:'À faire',inprogress:'En cours',done:'Fait'};
export function taskDetails(data,previous=null,now=new Date().toISOString()){
  const status=data.status||'todo';if(!Object.hasOwn(TASK_STATES,status))throw Error('État de l’action inconnu.');
  const reviewDate=String(data.reviewDate||'');if(reviewDate&&!validISODate(reviewDate))throw Error('Vérifiez la date du bilan.');
  const text=value=>String(value||'').trim();
  const assignedTo=text(data.assignedTo),outcome=text(data.outcome),nextStep=text(data.nextStep),related=text(data.related);
  if(assignedTo.length>240||outcome.length>10000||nextStep.length>10000)throw Error('Le contenu de l’action est trop long.');
  if(related&&!/^(event|record):.+/.test(related))throw Error('Lien de suivi inconnu.');
  return {status,assignedTo,related,reviewDate,outcome,nextStep,completedAt:status==='done'?(previous?.status==='done'&&previous.completedAt||now):null};
}
