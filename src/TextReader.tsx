import {useEffect,useId,useRef,useState} from 'react';
import type {Resource} from '../contracts/domain';
import {paperParagraphs} from './paper-text';
import type {PaperParagraph} from './paper-text';
import {resourceTitle} from './presentation';
import {makeTextSelection,resolveTextAnchor} from './text-anchors';
import type {TextAnchor,TextContent,TextSelection} from './text-anchors';
import {scrollToTextParagraph} from './reader-navigation';
import './PaperOutline.css';

type OutlineSection = {
  heading: string;
  page: number;
  paragraphIds: string[];
  children: OutlineSection[];
};

function paperOutline(paragraphs:PaperParagraph[]) {
  const roots:OutlineSection[]=[];
  const numbered=new Map<string,OutlineSection>();
  let previous:OutlineSection|undefined;
  for(const paragraph of paragraphs) {
    if(previous && previous.heading===paragraph.heading) {
      previous.paragraphIds.push(paragraph.id);
      continue;
    }
    if(!paragraph.heading)continue;
    const section:OutlineSection={heading:paragraph.heading,page:paragraph.page,paragraphIds:[paragraph.id],children:[]};
    const number=paragraph.heading.match(/^(\d+(?:\.\d+)*)(?=\s)/u)?.[1];
    const parent=number?.includes('.')?numbered.get(number.slice(0,number.lastIndexOf('.'))):undefined;
    (parent?parent.children:roots).push(section);
    if(number)numbered.set(number,section);
    previous=section;
  }
  return roots;
}

function OutlineList({sections,currentId,navigate}:{sections:OutlineSection[];currentId:string;navigate:(id:string)=>void}) {
  return <ol>{sections.map(section=><li key={section.paragraphIds[0]}>
    <button type="button" aria-current={section.paragraphIds.includes(currentId)?'location':undefined}
      onClick={()=>navigate(section.paragraphIds[0])}>
      <span>{section.heading}</span><small aria-label={`节选第 ${section.page} 页`}>{section.page}</small>
    </button>
    {section.children.length>0&&<OutlineList sections={section.children} currentId={currentId} navigate={navigate}/>}
  </li>)}</ol>;
}

export default function TextReader({resource,content,paragraphId,zoom,anchor,onNavigate,onSelect,onAsk,actionLabel}:{resource:Resource;content:TextContent;paragraphId:string;zoom:number;anchor:TextAnchor|null;onNavigate:(id:string)=>void;onSelect:(selection:TextSelection)=>void;onAsk?:(selection:TextSelection)=>void;actionLabel:string}) {
  const paper=useRef<HTMLElement>(null);
  const source=resource.mediaType==='paper'?paperParagraphs(resource.id):[];
  const sections=paperOutline(source);
  const readerLayout=useRef<HTMLDivElement>(null);
  const outlineToggle=useRef<HTMLButtonElement>(null);
  const outlineId=useId();
  const [outlineOpen,setOutlineOpen]=useState(false);
  const narrowOutline=useRef(false);
  useEffect(()=>{
    const layout=readerLayout.current;
    if(!layout||!sections.length)return;
    let previousWidthClass:boolean|undefined;
    const sync=()=>{
      const narrow=layout.clientWidth<=620;
      narrowOutline.current=narrow;
      if(narrow!==previousWidthClass)setOutlineOpen(!narrow);
      previousWidthClass=narrow;
    };
    sync();
    const observer=new ResizeObserver(sync);
    observer.observe(layout);
    return ()=>observer.disconnect();
  },[resource.id,sections.length]);
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
  function accept(action=onSelect){
    if(!pending)return;
    action(pending);setPending(null);window.getSelection()?.removeAllRanges();
  }
  function navigate(id:string) {
    onNavigate(id);
    const viewer=paper.current?.closest<HTMLElement>('.resource-viewer');
    if(viewer)scrollToTextParagraph(viewer,id);
    if(sections.length&&narrowOutline.current){
      setOutlineOpen(false);
      paper.current?.querySelector<HTMLElement>(`[data-text-paragraph="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
    }
  }
  return <div className={`text-reading-content${sections.length?' has-paper-outline':''}`}>
    <div className="text-selection-toolbar" aria-label="文字摘录操作">
      {sections.length>0&&<button className="paper-outline-toggle" type="button" ref={outlineToggle} aria-expanded={outlineOpen} aria-controls={outlineId}
        onClick={()=>setOutlineOpen(open=>!open)}>
        <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="3" width="14" height="12" rx="1.5"/><path d="M7 3v12"/></svg>
        本篇结构
      </button>}
      <span aria-live="polite">{pending?`已选 ${Array.from(pending.quote.replace(/\n/g,'')).length} 字`:'选中一句话或一段文字，即可记笔记；支持跨段选择。'}</span>
      {pending&&<div className="row"><button className="primary" onPointerDown={e=>e.preventDefault()} onClick={()=>accept()}>{actionLabel}</button>{onAsk&&<button onPointerDown={e=>e.preventDefault()} onClick={()=>accept(onAsk)}>问 AI</button>}<button onPointerDown={e=>e.preventDefault()} onClick={()=>{setPending(null);window.getSelection()?.removeAllRanges();}}>取消选择</button></div>}
    </div>
    <div className="text-reader" ref={readerLayout}>
    {sections.length>0?<aside className="paper-outline" id={outlineId} hidden={!outlineOpen} aria-label="本篇结构"
      onKeyDown={e=>{if(e.key==='Escape'){setOutlineOpen(false);outlineToggle.current?.focus();}}}>
      <div className="paper-outline-panel">
        <div className="paper-outline-columns"><span>章节</span><span>页</span></div>
        <OutlineList sections={sections} currentId={paragraphId} navigate={navigate}/>
      </div>
    </aside>:<aside className="reader-index" aria-label="阅读目录"><strong>阅读目录</strong>{content.paragraphs.map((p,i)=><button key={p.id} className={paragraphId===p.id?'active':''} aria-current={paragraphId===p.id?'location':undefined} onClick={()=>navigate(p.id)}>第 {i+1} 段</button>)}</aside>}
    <article ref={paper} className="paper" style={{fontSize:16*zoom/100}}><span className="eyebrow">{resource.mediaType==='paper'?'论文正文节选':resource.isDemo?'合成材料':'本地导入文本'} / 全部 {content.paragraphs.length} 段</span><h2>{resourceTitle(resource)}</h2>
      {content.paragraphs.map((p,i)=>{
        const paragraph=source[i];
        const slice=slices?.find(s=>s.paragraphId===p.id);
        return <section id={resource.id+p.id} key={p.id} data-current-paragraph={paragraphId===p.id||undefined}>
          {paragraph&&paragraph.page!==source[i-1]?.page&&<small className="paper-source-page">节选第 {paragraph.page} 页</small>}
          {paragraph?.heading&&paragraph.heading!==source[i-1]?.heading&&<h3 data-outline-heading>{paragraph.heading}</h3>}
          <p data-text-paragraph={p.id} tabIndex={0} aria-label="原文段落">{slice&&slice.end>slice.start?<>{p.text.slice(0,slice.start)}<mark data-testid="anchor-highlight">{p.text.slice(slice.start,slice.end)}</mark>{p.text.slice(slice.end)}</>:p.text}</p></section>;
      })}
      <p className="muted">{source.length?'本次节选结束':'全文结束'}</p>
    </article></div>
  </div>;
}
