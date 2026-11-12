import {useLayoutEffect,useRef} from 'react';
import {paperParagraphs, type PaperView} from './paper-text';

export function PaperViewSwitch({view, onChange}: {view:PaperView; onChange:(view:PaperView)=>void}) {
  return <div className="paper-view-switch" role="group" aria-label="论文阅读方式">
    <button type="button" aria-pressed={view==='text'} onClick={()=>onChange('text')}>论文正文</button>
    <button type="button" aria-pressed={view==='pdf'} onClick={()=>onChange('pdf')}>PDF 原页</button>
  </div>;
}

export function PaperTextPreview({id, initialPage=1, onPageChange}: {id:string; initialPage?:number; onPageChange?:(page:number)=>void}) {
  const viewport=useRef<HTMLElement>(null);
  const entryPage=useRef(initialPage);
  useLayoutEffect(()=>{
    const root=viewport.current;
    const entry=root?.querySelector<HTMLElement>(`section[data-page="${entryPage.current}"]`);
    if(root&&entry&&entryPage.current>1)root.scrollTop+=entry.getBoundingClientRect().top-root.getBoundingClientRect().top;
  },[id]);
  function reportScroll(){
    const root=viewport.current;
    if(!root||!onPageChange)return;
    const sections=Array.from(root.querySelectorAll<HTMLElement>('section[data-page]'));
    const line=root.getBoundingClientRect().top+root.clientHeight*.2;
    const current=sections.filter(el=>el.getBoundingClientRect().top<=line).at(-1);
    onPageChange(Number(current?.dataset.page)||1);
  }
  const paragraphs=paperParagraphs(id);
  return <article ref={viewport} onScroll={reportScroll} className="paper-transcript" aria-label="论文正文节选" tabIndex={0}>
    {paragraphs.map((p,i)=><section key={p.id} data-page={p.page}>
      {p.page!==paragraphs[i-1]?.page&&<small>节选第 {p.page} 页</small>}
      {p.heading&&p.heading!==paragraphs[i-1]?.heading&&<h3>{p.heading}</h3>}
      <p>{p.text}</p>
    </section>)}
  </article>;
}
