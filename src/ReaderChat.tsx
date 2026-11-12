import {useEffect,useRef,useState, type ReactNode} from 'react';
import type {Resource,SourceAnchor} from '../contracts/domain';
import excerpts from '../contracts/pdf-passages.json';
import ResearchChat,{type ChatSource} from './ResearchChat';
import {coursePdf,featuredMaterial,hasStudySource} from './featured';
import {paperParagraphs} from './paper-text';
import {resourceTitle} from './presentation';
import {currentLocation} from './routing';
import {scrollToTextParagraph} from './reader-navigation';
import {uid,useApp} from './store';
import {makeTextSelection,resolveTextAnchor} from './text-anchors';
import {isValidPdfSelection} from './pdf-selection';
import {contextUrl,nav,useQuery} from './ui';

const pages:Record<string,string[]>=excerpts;

type ReaderChatProps={
  resource:Resource;
  anchor?:SourceAnchor|null;
  page?:number;
  onAccept?:(text:string,sources:ChatSource[],originAnchor?:SourceAnchor)=>void;
};

export function answerAnchor(resource:Resource,source:ChatSource,origin?:SourceAnchor):SourceAnchor|null{
  if(source.resourceId!==resource.id)return null;
  const selected=origin?.resourceId===resource.id&&origin.resourceVersionId===resource.versionId?origin:null;
  const paragraphs=paperParagraphs(resource.id);
  if(selected?.kind==='text'&&typeof selected.quote==='string'&&resolveTextAnchor(paragraphs,selected)){
    const paragraph=paragraphs.find(p=>p.id===selected.paragraphId);
    if(paragraph&&(source.paragraphId?paragraph.id===source.paragraphId:paragraph.page===source.page))return selected;
  }
  const base={id:uid('anchor'),resourceId:resource.id,resourceVersionId:resource.versionId,isDemo:false};
  if(source.paragraphId){
    const paragraph=paragraphs.find(p=>p.id===source.paragraphId);
    const range=paragraph&&makeTextSelection(paragraphs,paragraph.id,0,paragraph.id,paragraph.text.length);
    if(range)return {...base,kind:'text',...range};
  }
  if(source.page&&coursePdf(resource)){
    if(selected?.kind==='pdf'&&selected.page===source.page&&(!selected.selection||isValidPdfSelection(selected.selection)))return selected;
    return {...base,kind:'pdf',page:source.page};
  }
  return {...base,kind:'record',label:source.label};
}

function openReadingSource(source:ChatSource){
  const target='/resources/'+encodeURIComponent(source.resourceId);
  if(!source.page&&!source.paragraphId){nav(contextUrl(target));return;}
  const loc=currentLocation(),sameReader=loc.pathname===target+'/read';
  const params=new URLSearchParams(sameReader?loc.search:'');
  params.delete('anchorId');
  if(source.page)params.set('page',String(source.page));
  if(source.paragraphId){
    params.set('view','text');
    params.set('paragraphId',source.paragraphId);
  }else{
    params.set('view','pdf');
    params.delete('paragraphId');
  }
  const url=target+'/read?'+params;
  if(sameReader&&source.paragraphId&&params.toString()===new URLSearchParams(loc.search).toString()){
    const viewer=document.querySelector<HTMLElement>('.reader-layout .resource-viewer');
    if(viewer)scrollToTextParagraph(viewer,source.paragraphId);
    return;
  }
  nav(sameReader?url:contextUrl(url),{preserveScroll:sameReader});
}

export function ReaderChat({resource,anchor,page=1,onAccept}:ReaderChatProps){
  const {data,review}=useApp(),query=useQuery();
  const [edited,setEdited]=useState<{key:string;text:string}|null>(null);
  const document=coursePdf(resource);
  const transcript=resource.mediaType==='paper'&&query.get('view')!=='pdf'&&(!query.has('page')||query.get('view')==='text');
  const paragraphs=paperParagraphs(resource.id);
  const selectedParagraph=anchor?.kind==='text'?paragraphs.find(p=>p.id===anchor.paragraphId&&p.page===page):undefined;
  const selectedText=anchor?.kind==='text'&&selectedParagraph?.id===anchor.paragraphId&&
    (!query.has('paragraphId')||query.get('paragraphId')===anchor.paragraphId);
  const paragraph=transcript ? (selectedText?selectedParagraph:paragraphs.find(p=>p.id===query.get('paragraphId')&&p.page===page)) : undefined;
  const selectedPdf=anchor?.kind==='pdf'&&anchor.page===page;
  const selection=selectedText&&transcript&&anchor?.kind==='text'?anchor.quote:selectedPdf&&!transcript&&anchor.kind==='pdf'?anchor.selection?.quote:undefined;
  const passageKey=[resource.id,page,transcript?'text':'pdf',paragraph?.id,selection].join(':');
  const pageText=paragraphs.filter(p=>p.page===page).map(p=>p.text).join('\n\n')||pages[resource.id]?.[page-1]||'';
  const original=(selection||paragraph?.text||pageText).slice(0,2500);
  const editedText=edited?.key===passageKey?edited.text:undefined;
  const passage=(editedText??selection?.slice(0,2500))?.trim()||undefined;
  const origin=selection&&passage===selection.trim()?anchor:undefined;
  const label=document?`节选第 ${page} 页${editedText?.trim()?' · 本次填写的摘录':origin?' · 已选原文':''}`:resourceTitle(resource)+' · 馆藏编目说明';
  if(review||resource.visibility!=='public'||resource.isDemo||!featuredMaterial(resource)||!hasStudySource(data,resource)){
    return <section className="reader-chat-unavailable"><h3>阅读问答</h3><p>这份资料暂无可用于问答的公开来源。</p></section>;
  }
  return <div className="reader-chat-tool">
    {document&&<details className="reader-chat-passage"><summary>本次提问的原文</summary>
      <label>节选第 {page} 页原文<textarea rows={4} maxLength={2500} value={editedText??original} onChange={e=>setEdited({key:passageKey,text:e.target.value})}/></label>
      {selection&&selection.length>2500&&editedText===undefined&&<small>本次使用所选文字的前 2500 字。</small>}
      {editedText!==undefined&&<button onClick={()=>setEdited(null)}>恢复摘录</button>}
    </details>}
    <ResearchChat scopeKey={'reader:'+resource.id} title="阅读问答" scopeLabel={label} resourceIds={[resource.id]}
      page={document?page:undefined} paragraphId={paragraph?.id} passage={passage} originAnchor={origin||undefined}
      onSource={openReadingSource} onAccept={onAccept}
      suggestions={document?['这一页主要讨论什么？','这段文字的依据是什么？']:['这份资料记录了什么？','哪些细节值得进一步核对？']}/>
  </div>;
}

export function MediaNotesTools({resource,anchor,onAccept,children}:{resource:Resource;anchor:SourceAnchor|null;onAccept?:(text:string)=>void;children:ReactNode}){
  const query=useQuery();
  const [chat,setChat]=useState(()=>query.get('tool')==='ai');
  const [opened,setOpened]=useState(chat);
  const initialSource=useRef(query.get('tool')==='ai'?query.get('anchorId'):null);
  const previousAnchor=useRef(anchor?.id);
  useEffect(()=>{
    if (anchor?.id===previousAnchor.current) return;
    previousAnchor.current=anchor?.id;
    if (!anchor || anchor.id!==initialSource.current) setChat(false);
    initialSource.current=null;
  },[anchor?.id]);
  return <div className="reader-tools media-study-tools">
    <div className="tabs"><button aria-pressed={!chat} className={!chat?'active':''} onClick={()=>setChat(false)}>笔记</button>
      <button aria-pressed={chat} className={chat?'active':''} onClick={()=>{setOpened(true);setChat(true);}}>AI 辅助</button></div>
    <div hidden={chat}>{children}</div>
    {opened&&<div hidden={!chat}><ReaderChat resource={resource} onAccept={onAccept&&((text)=>{onAccept(text);setChat(false);})}/></div>}
  </div>;
}
