// Conservative failure detection: reject a suspicious result; never rewrite it.
export function repeatedTail(tokens){
  for(let period=1;period<=8;period++){
    const length=Math.max(4,Math.ceil(12/period))*period;
    if(tokens.length<length)continue;
    const start=tokens.length-length;
    let same=true;for(let i=start+period;i<tokens.length;i++)if(tokens[i]!==tokens[i-period]){same=false;break;}
    if(same)return true;
  }
  return false;
}
export const LOOP_MESSAGE='Le moteur a produit une répétition anormale. Ce résultat n’a pas été ajouté. Relancez la transcription ou saisissez le passage après réécoute.';
export function transcriptionIssue(text,durationSeconds=null){
  const words=String(text||'').normalize('NFKC').toLocaleLowerCase('fr').match(/[\p{L}\p{N}]+/gu)||[];
  if(!words.length)return 'Aucun texte exploitable. Réécoutez l’audio avant de relancer.';
  for(let end=12;end<=words.length;end++)if(repeatedTail(words.slice(Math.max(0,end-64),end)))return LOOP_MESSAGE;
  if(Number.isFinite(durationSeconds)&&durationSeconds>0&&words.length>Math.ceil(durationSeconds*7+25))return 'Le texte produit est anormalement long pour cet audio. Relancez la transcription après réécoute.';
  return '';
}
