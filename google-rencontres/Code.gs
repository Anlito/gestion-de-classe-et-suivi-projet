// Projet Apps Script séparé de l’ancien outil. Toutes les fonctions internes se terminent par _.
const PROTO_='carnet-pp-rencontres-v1';
function installer_(){
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty('SHEET_ID')){
    const book=SpreadsheetApp.create('Carnet de classe · demandes de rencontres PP');
    book.getSheets()[0].setName('Campagnes');book.getSheets()[0].appendRow(['Identifiant','Jeton public','Configuration JSON']);
    book.insertSheet('Demandes').appendRow(['Identifiant','Campagne','Réception','Élève indiqué','Disponibilités JSON','Précisions']);
    props.setProperties({SHEET_ID:book.getId(),TEACHER_KEY:Utilities.getUuid()+Utilities.getUuid()});
  }
  console.log('Tableau privé : https://docs.google.com/spreadsheets/d/'+props.getProperty('SHEET_ID'));
  console.log('Clé professeur (à garder privée) : '+props.getProperty('TEACHER_KEY'));
}
function book_(){const id=PropertiesService.getScriptProperties().getProperty('SHEET_ID');if(!id)throw Error('Installation Google incomplète.');return SpreadsheetApp.openById(id);}
function rows_(name){return book_().getSheetByName(name).getDataRange().getValues().slice(1);}
function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function lock_(fn){const lock=LockService.getScriptLock();lock.waitLock(10000);try{return fn();}finally{lock.releaseLock();}}
function clean_(value,max){if(typeof value!=='string'||value.length>max)throw Error('Texte trop long ou invalide.');return value.trim();}
// Encodage JSON des textes : préserve apostrophes et caractères de formule sans exécuter de formule Sheets.
function text_(value){return JSON.parse(String(value));}
function validateCampaign_(c){
  if(!c||c.protocol!==PROTO_||!/^[a-zA-Z0-9_-]{8,100}$/.test(c.campaignId||'')||!['open','closed'].includes(c.status)||!Array.isArray(c.slots)||!c.slots.length||c.slots.length>300)throw Error('Campagne non reconnue.');
  ['title','className','date','location'].forEach(k=>clean_(c[k],200));
  const date=new Date(c.date+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(c.date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==c.date||!c.title.trim())throw Error('Date ou titre invalide.');
  let last='';c.slots.forEach((s,i)=>{if(s.index!==i||s.date!==c.date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.debut)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.fin)||s.debut>=s.fin||s.debut<last)throw Error('Créneaux invalides.');last=s.fin;});
  if(c.slotSignature!==JSON.stringify(c.slots.map(s=>[s.date,s.debut,s.fin])))throw Error('Créneaux incohérents.');
  // Liste blanche : aucun dossier, liste d’élèves, document ou identifiant interne de classe.
  return {protocol:PROTO_,campaignId:c.campaignId,title:c.title.trim(),className:c.className,date:c.date,location:c.location,status:c.status,slots:c.slots.map(s=>({index:s.index,date:s.date,debut:s.debut,fin:s.fin})),slotSignature:c.slotSignature};
}
function adminAction(key,action,payload){
  const expected=PropertiesService.getScriptProperties().getProperty('TEACHER_KEY');if(!expected||typeof key!=='string'||key!==expected)throw Error('Clé professeur incorrecte.');
  return lock_(function(){
    if(action==='publish'){
      const c=validateCampaign_(payload),sheet=book_().getSheetByName('Campagnes'),rows=rows_('Campagnes'),index=rows.findIndex(r=>r[0]===c.campaignId);
      const prior=index>=0?JSON.parse(rows[index][2]):null;
      if(prior&&prior.slotSignature!==c.slotSignature)throw Error('Les créneaux de cette campagne ont changé. Créez une nouvelle campagne.');
      const token=index>=0?rows[index][1]:Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
      sheet.getRange(index>=0?index+2:sheet.getLastRow()+1,1,1,3).setValues([[c.campaignId,token,JSON.stringify(c)]]);
      return {protocol:PROTO_,ok:true,publicURL:ScriptApp.getService().getUrl()+'?campaign='+encodeURIComponent(token)};
    }
    if(action==='list'){
      const row=rows_('Campagnes').find(r=>r[0]===payload?.campaignId);if(!row)throw Error('Campagne non publiée.');const c=JSON.parse(row[2]);
      const requests=rows_('Demandes').filter(r=>r[1]===c.campaignId).map(r=>({id:String(r[0]),receivedAt:r[2] instanceof Date?r[2].toISOString():String(r[2]),pupilName:text_(r[3]),slotIndices:JSON.parse(r[4]),note:text_(r[5])}));
      if(requests.length>2000)throw Error('Trop de demandes : consultez le tableau privé.');
      return {protocol:PROTO_,ok:true,campaignId:c.campaignId,slotSignature:c.slotSignature,requests};
    }
    throw Error('Action inconnue.');
  });
}
function doPost(e){try{const p=e?.parameter||{};if(String(p.payload||'').length>100000)throw Error('Requête trop volumineuse.');return json_(adminAction(p.key,p.action,JSON.parse(p.payload||'{}')));}catch(err){return json_({protocol:PROTO_,ok:false,error:String(err.message||err)});}}
function doGet(e){
  const p=e?.parameter||{};
  if(p.admin==='1')return HtmlService.createHtmlOutputFromFile('Professeur').setTitle('Rencontres PP · professeur').addMetaTag('viewport','width=device-width, initial-scale=1');
  const template=HtmlService.createTemplateFromFile('Formulaire');template.token=/^[a-zA-Z0-9_-]{20,100}$/.test(p.campaign||'')?p.campaign:'';
  return template.evaluate().setTitle('Disponibilités de rencontre').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function publicCampaign_(token){if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{20,100}$/.test(token))throw Error('Lien de rencontre inconnu.');const row=rows_('Campagnes').find(r=>r[1]===token);if(!row)throw Error('Lien de rencontre inconnu.');return JSON.parse(row[2]);}
function getPublicCampaign(token){const c=publicCampaign_(token);return {title:c.title,className:c.className,date:c.date,location:c.location,open:c.status==='open'&&c.date>=Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd'),slots:c.slots,slotSignature:c.slotSignature};}
function submitRequest(token,data){
  return lock_(function(){
    const c=publicCampaign_(token);if(c.status!=='open'||c.date<Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd'))throw Error('Cette campagne ne reçoit plus de réponses. Contactez le professeur.');
    if(!data||!/^[a-zA-Z0-9_-]{8,100}$/.test(data.id||'')||data.slotSignature!==c.slotSignature)throw Error('Rechargez le formulaire avant de répondre.');
    const pupilName=clean_(data.pupilName,120),note=clean_(data.note,1000),indices=data.slotIndices;
    if(!pupilName||!Array.isArray(indices)||!indices.length||indices.length>300||indices.some(i=>!Number.isInteger(i)||!c.slots[i]))throw Error('Indiquez l’élève et au moins une disponibilité.');
    const unique=[...new Set(indices)].sort((a,b)=>a-b),rows=rows_('Demandes'),old=rows.find(r=>r[0]===data.id&&r[1]===c.campaignId);
    if(old){if(text_(old[3])!==pupilName||text_(old[5])!==note||old[4]!==JSON.stringify(unique))throw Error('Cette réponse existe déjà. Contactez le professeur pour la modifier.');return {ok:true};}
    if(rows.filter(r=>r[1]===c.campaignId).length>=2000)throw Error('Le formulaire a atteint sa limite. Contactez le professeur.');
    book_().getSheetByName('Demandes').appendRow([data.id,c.campaignId,new Date().toISOString(),JSON.stringify(pupilName),JSON.stringify(unique),JSON.stringify(note)]);
    return {ok:true};
  });
}
