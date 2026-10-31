import {useEffect,useRef,useState} from 'react';
import type {Resource} from '../contracts/domain';
import {resourceTitle} from './presentation';
import {makeTextSelection,resolveTextAnchor} from './text-anchors';
import type {TextAnchor,TextContent,TextSelection} from './text-anchors';
import {scrollToTextParagraph} from './reader-navigation';

export default function TextReader({resource,content,paragraphId,zoom,anchor,onNavigate,onSelect,actionLabel}:{resource:Resource;content:TextContent;paragraphId:string;zoom:number;anchor:TextAnchor|null;onNavigate:(id:string)=>void;onSelect:(selection:TextSelection)=>void;actionLabel:string}) {
  const paper=useRef<HTMLElement>(null);
  const [pending,setPending]=useState<TextSelection|null>(null);
  useEffect(()=>{
    const update=()=>{
      const selection=window.getSelection(),root=paper.current;
      if(!selection||!root||selection.isCollapsed||selection.rangeCount!==1){setPending(null);return;}
      const range=selection.getRangeAt(0);
      const endpoint=(node:Node,offset:number)=>{
        const element=node.nodeType===Node.ELEMENT_NODE?node as Element:node.parentElement;
        const paragraph=element?.closest<HTMLElement>('[data-text-paragraph]');
        if(!paragraph||!root.contains(paragraph))return null;
        const before=document.createRange();before.selectNodeContents(paragraph);before.setEnd(node,offset);
        return {id:paragraph.dataset.textParagraph!,offset:before.toString().length};
      };
      const start=endpoint(range.startContainer,range.startOffset),end=endpoint(range.endContainer,range.endOffset);
      setPending(start&&end?makeTextSelection(content.paragraphs,start.id,start.offset,end.id,end.offset):null);
    };
    document.addEventListener('selectionchange',update);
    return()=>document.removeEventListener('selectionchange',update);
  },[content]);
  const slices=anchor?resolveTextAnchor(content.paragraphs,anchor):null;
  function accept(){
    if(!pending)return;
    onSelect(pending);setPending(null);window.getSelection()?.removeAllRanges();
  }
  return <div className="text-reading-content">
    <div className="text-selection-toolbar" aria-label="文字摘录操作">
      <span aria-live="polite">{pending?`已选 ${Array.from(pending.quote.replace(/\n/g,'')).length} 字`:'选中一句话或一段文字，即可记笔记；支持跨段选择。'}</span>
      {pending&&<div className="row"><button className="primary" onPointerDown={e=>e.preventDefault()} onClick={accept}>{actionLabel}</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>{setPending(null);window.getSelection()?.removeAllRanges();}}>取消选择</button></div>}
    </div>
    <div className="text-reader"><aside className="reader-index" aria-label="阅读目录"><strong>阅读目录</strong>{content.paragraphs.map((p,i)=><button key={p.id} className={paragraphId===p.id?'active':''} aria-current={paragraphId===p.id?'location':undefined} onClick={()=>{onNavigate(p.id);const viewer=paper.current?.closest<HTMLElement>('.resource-viewer');if(viewer)scrollToTextParagraph(viewer,p.id);}}>第 {i+1} 段</button>)}</aside>
    <article ref={paper} className="paper" style={{fontSize:16*zoom/100}}><span className="eyebrow">{resource.isDemo?'合成材料':'本地导入文本'} / 全部 {content.paragraphs.length} 段</span><h2>{resourceTitle(resource)}</h2>
      {content.paragraphs.map(p=>{
        const slice=slices?.find(s=>s.paragraphId===p.id);
        return <section id={resource.id+p.id} key={p.id} data-current-paragraph={paragraphId===p.id||undefined}><p data-text-paragraph={p.id} tabIndex={0} aria-label="原文段落">{slice&&slice.end>slice.start?<>{p.text.slice(0,slice.start)}<mark data-testid="anchor-highlight">{p.text.slice(slice.start,slice.end)}</mark>{p.text.slice(slice.end)}</>:p.text}</p></section>;
      })}
      <p className="muted">全文结束</p>
    </article></div>
  </div>;
}
