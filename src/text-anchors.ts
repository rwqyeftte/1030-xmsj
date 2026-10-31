import type {DemoContent,SourceAnchor} from '../contracts/domain';

export type TextContent=Extract<DemoContent,{kind:'text'}>;
export type TextAnchor=Extract<SourceAnchor,{kind:'text'}>;
export type TextSelection=Pick<TextAnchor,'paragraphId'|'endParagraphId'|'startOffset'|'endOffset'|'quote'|'prefix'|'suffix'>;
export type TextSlice={paragraphId:string;start:number;end:number};

function slicesForRange(paragraphs:TextContent['paragraphs'],startId:string,start:number,endId:string,end:number):TextSlice[]|null {
  const first=paragraphs.findIndex(p=>p.id===startId),last=paragraphs.findIndex(p=>p.id===endId);
  if(first<0||last<first||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<0||start>paragraphs[first].text.length||end>paragraphs[last].text.length||(first===last&&start>=end))return null;
  return paragraphs.slice(first,last+1).map((p,i)=>({paragraphId:p.id,start:i===0?start:0,end:first+i===last?end:p.text.length}));
}

function quoteForSlices(paragraphs:TextContent['paragraphs'],slices:TextSlice[]) {
  const texts=new Map(paragraphs.map(p=>[p.id,p.text]));
  return slices.map(s=>texts.get(s.paragraphId)!.slice(s.start,s.end)).join('\n\n');
}

// Offsets use DOM/JavaScript UTF-16 positions, so repeated words remain unambiguous.
export function makeTextSelection(paragraphs:TextContent['paragraphs'],startId:string,start:number,endId:string,end:number):TextSelection|null {
  const slices=slicesForRange(paragraphs,startId,start,endId,end);
  if(!slices)return null;
  const texts=new Map(paragraphs.map(p=>[p.id,p.text]));
  while(slices.length&&!texts.get(slices[0].paragraphId)!.slice(slices[0].start,slices[0].end).trim())slices.shift();
  while(slices.length&&!texts.get(slices.at(-1)!.paragraphId)!.slice(slices.at(-1)!.start,slices.at(-1)!.end).trim())slices.pop();
  if(!slices.length)return null;
  const first=slices[0],last=slices.at(-1)!;
  const firstText=texts.get(first.paragraphId)!,lastText=texts.get(last.paragraphId)!;
  first.start+=firstText.slice(first.start,first.end).length-firstText.slice(first.start,first.end).trimStart().length;
  last.end-=lastText.slice(last.start,last.end).length-lastText.slice(last.start,last.end).trimEnd().length;
  return {paragraphId:first.paragraphId,endParagraphId:last.paragraphId,startOffset:first.start,endOffset:last.end,quote:quoteForSlices(paragraphs,slices),prefix:firstText.slice(Math.max(0,first.start-24),first.start),suffix:lastText.slice(last.end,last.end+24)};
}

export function resolveTextAnchor(paragraphs:TextContent['paragraphs'],anchor:TextSelection):TextSlice[]|null {
  if(!anchor.quote.trim())return null;
  if(anchor.startOffset!==undefined||anchor.endOffset!==undefined||anchor.endParagraphId!==undefined){
    if(anchor.startOffset===undefined||anchor.endOffset===undefined)return null;
    const slices=slicesForRange(paragraphs,anchor.paragraphId,anchor.startOffset,anchor.endParagraphId||anchor.paragraphId,anchor.endOffset);
    return slices&&quoteForSlices(paragraphs,slices)===anchor.quote?slices:null;
  }
  // Existing notes have paragraph + quote only. Locate only a unique matching context.
  const p=paragraphs.find(p=>p.id===anchor.paragraphId);
  if(!p)return null;
  const matches:number[]=[];
  for(let at=p.text.indexOf(anchor.quote);at!==-1;at=p.text.indexOf(anchor.quote,at+1)){
    if((!anchor.prefix||p.text.slice(0,at).endsWith(anchor.prefix))&&(!anchor.suffix||p.text.slice(at+anchor.quote.length).startsWith(anchor.suffix)))matches.push(at);
  }
  return matches.length===1?[{paragraphId:p.id,start:matches[0],end:matches[0]+anchor.quote.length}]:null;
}
