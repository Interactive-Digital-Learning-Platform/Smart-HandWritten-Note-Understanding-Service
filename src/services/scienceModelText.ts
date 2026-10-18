/** OCR often adds empty lines between steps of one procedure. Join spacing
 * only between an explicit Benedict action and the immediately following
 * affirmative heating step referring to that sample. Never add any words. */
export function scienceModelText(text:string,conceptId:string) {
  const removed:Array<[number,number]>=[];
  if(conceptId==='sci-g10-cbl-007') {
    const pattern=/^([ \t]*(?:[-*•][ \t]*)?(?:add|mix)\b[^\n]*)(\n[ \t]*\n(?:[ \t]*\n)*)([^\n]+)/gim;
    const rejected=/\b(?:not|no|never|without|don['’]?t|avoid|different|another|other|separate|iodine|biuret|sudan|ethanol|emulsion|starch|protein|lipid|fat|negative)\b/i;
    for(const match of text.matchAll(pattern)) {
      const first=match[1].trim().replace(/^[-*•]\s*/,''),next=match[3].trim().replace(/^[-*•]\s*/,'');
      if(first.length>220||next.length>180||rejected.test(first+' '+next))continue;
      if(!/^(?:add|mix)\b/i.test(first)||! /\bbenedict(?:['’]s)?\b/i.test(first)||! /\b(?:sample|food|solution|mixture)\b/i.test(first))continue;
      if(!/^(?:heat|warm)\b/i.test(next)||! /\b(?:sample|mixture|solution|it)\b/i.test(next)||! /\b(?:hot|boiling)?\s*water\s+bath\b/i.test(next))continue;
      const gap=match.index!+match[1].length;
      removed.push([gap+1,gap+match[2].length]);
    }
  }
  const indices:number[]=[];let normalized='';
  for(let i=0,range=0;i<text.length;i++){
    while(range<removed.length&&i>=removed[range][1])range++;
    if(range<removed.length&&i>=removed[range][0]&&i<removed[range][1])continue;
    indices.push(i);normalized+=text[i];
  }
  return {text:normalized,changed:removed.length>0,
    originalSpan(start:number,end:number){return {start:indices[start]??text.length,end:end>start?(indices[end-1]??text.length-1)+1:indices[start]??text.length};}};
}
