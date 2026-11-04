const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function makeService(){
 const books=new Map(),props=new Map();let counter=0,locked=false;
 class Sheet{
  constructor(name){this.name=name;this.data=[];}
  setName(name){this.name=name;}
  appendRow(row){this.data.push([...row]);return this;}
  getDataRange(){return {getValues:()=>this.data.map(r=>[...r])};}
  getLastRow(){return this.data.length;}
  getRange(row,col,height,width){return {setValues:values=>{for(let i=0;i<height;i++){this.data[row-1+i]??=[];for(let j=0;j<width;j++)this.data[row-1+i][col-1+j]=values[i][j];}}};}
 }
 class Book{constructor(id){this.id=id;this.sheets=[new Sheet('Feuille 1')];}getId(){return this.id;}getSheets(){return this.sheets;}insertSheet(name){const sheet=new Sheet(name);this.sheets.push(sheet);return sheet;}getSheetByName(name){return this.sheets.find(s=>s.name===name);}}
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-11-04T17:00:00Z']));}}
 const ctx={Date:FixedDate,console:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperties:data=>{for(const [key,value] of Object.entries(data))props.set(key,value);}})},SpreadsheetApp:{create:()=>{const b=new Book('sheet-'+(++counter));books.set(b.id,b);return b;},openById:id=>books.get(id)},Utilities:{getUuid:()=>require('node:crypto').randomUUID(),formatDate:()=> '2026-11-04'},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/DEMO_FAMILY_TEST/exec'})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../google-rencontres/Code.gs'),'utf8'),ctx);ctx.installer_();
 return {ctx,key:props.get('TEACHER_KEY'),books,props};
}
function testServer(){
 const service=makeService(),{ctx,key,props}=service,protocol='carnet-pp-rencontres-v1';
 const slots=[{index:0,date:'2026-11-17',debut:'17:30',fin:'17:40'},{index:1,date:'2026-11-17',debut:'17:40',fin:'17:50'}];
 const campaign={protocol,campaignId:'campaign-example',title:'Rencontre fictive',className:'5e B',date:'2026-11-17',location:'Collège',status:'open',slots,slotSignature:JSON.stringify(slots.map(s=>[s.date,s.debut,s.fin])),privateNote:'PRIVATE_NOTE'};
 const bad=fn=>assert.throws(fn);bad(()=>ctx.adminAction('wrong','publish',campaign));
 const first=ctx.adminAction(key,'publish',campaign),second=ctx.adminAction(key,'publish',campaign);assert.equal(first.publicURL,second.publicURL);
 const token=new URL(first.publicURL).searchParams.get('campaign');const publicData=ctx.getPublicCampaign(token);assert.equal(JSON.stringify(publicData).includes('PRIVATE'),false);assert.equal(JSON.stringify(publicData).includes(key),false);assert.equal(publicData.open,true);
 const request={id:'request-example',pupilName:"'=Élève EXEMPLE",note:'=1+2',slotIndices:[1,0,1],slotSignature:campaign.slotSignature};
 assert.equal(ctx.submitRequest(token,request).ok,true);assert.equal(ctx.submitRequest(token,request).ok,true);let list=ctx.adminAction(key,'list',{campaignId:campaign.campaignId});assert.equal(list.requests.length,1);assert.equal(list.requests[0].pupilName,request.pupilName);assert.equal(list.requests[0].note,request.note);assert.deepEqual(JSON.parse(JSON.stringify(list.requests[0].slotIndices)),[0,1]);
 const sheet=[...service.books.values()][0].getSheetByName('Demandes');assert.equal(sheet.data[1][3][0],'"');assert.equal(sheet.data[1][5][0],'"');
 bad(()=>ctx.submitRequest(token,{...request,note:'autre'}));bad(()=>ctx.submitRequest(token,{...request,id:'request-invalid',slotIndices:[2]}));bad(()=>ctx.submitRequest(token,{...request,id:'request-invalid',note:'x'.repeat(1001)}));bad(()=>ctx.getPublicCampaign('bad'));
 ctx.adminAction(key,'publish',{...campaign,status:'closed'});bad(()=>ctx.submitRequest(token,{...request,id:'request-new'}));assert.equal(ctx.getPublicCampaign(token).open,false);assert.equal(ctx.adminAction(key,'list',{campaignId:campaign.campaignId}).requests.length,1);
 bad(()=>ctx.adminAction(key,'publish',{...campaign,slots:[{...slots[0],debut:'17:35'}]}));ctx.installer_();assert.equal(props.get('TEACHER_KEY'),key);assert.equal(service.books.size,1);
 const denied=JSON.parse(ctx.doPost({parameter:{key:'wrong',action:'list',payload:'{}'}}).text);assert.equal(denied.ok,false);assert.equal(JSON.stringify(denied).includes(key),false);
 console.log('Service Google simulé : authentification, publication stable, confidentialité, réponse idempotente, textes sûrs, fermeture et installation non destructive vérifiées.');
}
module.exports={makeService,testServer};if(require.main===module)testServer();
