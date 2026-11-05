// Uniquement dans la copie de recette : jeu fictif ajouté à la demande.
import * as db from './db.js';
import * as pp from './pp.js';
import * as model from './model.js';
import {toast,todayISO} from './ui.js';
import {go} from './nav.js';
const button=document.createElement('button');button.type='button';button.className='btn small';button.textContent='Démarrer la recette fictive';button.style.cssText='position:fixed;left:8px;bottom:3px;z-index:9000;background:#fff0bd;color:#623b00;font-size:11px;min-height:28px';document.body.append(button);
button.addEventListener('click',async()=>{
 button.disabled=true;try{
  const classId='recette-pp-classe',studentId='recette-pp-camille';
  if(db.get('classes',classId)){go('#/pp/classe/'+classId);toast({text:'Jeu fictif déjà présent, données conservées'});return;}
  if(db.all('students').length){toast({text:'Des données sont déjà présentes. La recette ne les remplace pas.'});return;}
  const year=model.schoolYear(),date=new Date(todayISO()+'T12:00:00');date.setDate(date.getDate()+1);const tomorrow=date.toISOString().slice(0,10);
  const undo=db.commit(w=>{w.put('classes',{id:classId,name:'4e TEST PP',level:'4e',year,ppYear:year});w.put('students',{id:studentId,classId,nom:'EXEMPLE',prenom:'Camille'});w.put('students',{id:'recette-pp-alex',classId,nom:'EXEMPLE',prenom:'Alex'});w.put('evenements',{id:'recette-pp-rencontre',classId,studentId,type:'reunion',titre:'[TEST PP] Rencontre fictive',date:tomorrow,debut:'17:30',fin:'18:00',lieu:'Test',note:'Événement fictif de recette, sans famille invitée.'});});
  try{await db.verifyStored('students',studentId);await db.verifyStored('evenements','recette-pp-rencontre');}catch(e){await undo();throw e;}
  const note=pp.saveEntry({studentId,kind:'note',title:'[TEST PP] Note du portable',text:'Première note fictive pour vérifier le passage sur la tablette.',date:todayISO()});await db.verifyStored('ppRecords',note.entry.id,note.entry.updatedAt);
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff5d6';ctx.fillRect(0,0,640,240);ctx.fillStyle='#24344d';ctx.font='bold 30px sans-serif';ctx.fillText('Pièce fictive de recette PP',40,95);ctx.font='22px sans-serif';ctx.fillText('Camille EXEMPLE · aucune donnée réelle',40,155);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  await pp.attachDocument(studentId,new File([blob],'piece-fictive-recette.png',{type:'image/png'}),'Autre','[TEST PP] Pièce fictive');
  go('#/pp/classe/'+classId);toast({text:'Recette prête : deux élèves, une note, une pièce et une réunion fictives'});
 }catch(e){toast({text:e.message});}finally{button.disabled=false;}
});
