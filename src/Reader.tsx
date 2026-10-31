import {currentLocation,clickedRoute} from './routing';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {SourceAnchor, Resource} from '../contracts/domain';
import {useApp,uid,addMembers,anchorLabel,download} from './store';
import {Link,nav,useQuery,useLocation,useDraft,Empty,AIPanel,boardReturnPath,Modal,contextUrl} from './ui';
import ImageReader from './ImageReader';
import ImageNotes from './ImageNotes';
import VideoReader from './VideoReader';
import VideoNotes from './VideoNotes';
import {validVideoAnchor} from './video-annotations';
import {imageNotes,validImageBox} from './image-annotations';
import {useImageSource} from './image-source';
import {resourceTitle,projectTitle} from './presentation';
import TextReader from './TextReader';
import ComparisonPicker from './ComparisonPicker';
import {resolveTextAnchor} from './text-anchors';
import {scrollToTextParagraph} from './reader-navigation';

export function returnPath(fallback:string){const q=new URLSearchParams(currentLocation().search);try{const c=JSON.parse(sessionStorage.getItem('literature-center:ctx:'+q.get('ctx'))||'null');if(c?.pathname?.startsWith('/')&&!c.pathname.startsWith('//'))return c.pathname+(c.search||'');}catch{}return fallback;}

export function ResourceViewer({resourceId,anchorId,onAnchor,compact=false,textActionLabel='记笔记',mediaSelection}:{resourceId:string;anchorId?:string|null;onAnchor?:(a:SourceAnchor)=>void;compact?:boolean;textActionLabel?:string;mediaSelection?:SourceAnchor|null}){
 const {data,review}=useApp(); const r=data.resources.find(x=>x.id===resourceId);const c=data.contents.find(x=>x.resourceId===resourceId);
 const target=data.anchors.find(x=>x.id===anchorId); const valid=!!r&&!!c&&target?.resourceId===r.id&&target?.resourceVersionId===r.versionId&&!review.includes('anchor-invalid')&&!review.includes('source-missing')&&(target.kind==='text'?c.kind==='text'&&!!resolveTextAnchor(c.paragraphs,target):target.kind==='image'?c.kind==='image'&&target.x>=0&&target.y>=0&&target.width>0&&target.height>0&&target.x+target.width<=1&&target.y+target.height<=1:target.kind==='video'?c.kind==='video_timeline'&&validVideoAnchor(target,c.durationSec):true);
 const imageSource=useImageSource(resourceId);
 const [pos,setPos]=useDraft('reader:'+resourceId,{paragraphId:'para-1',x:.1,y:.24,width:.325,height:.52,startSec:3,endSec:7,zoom:100});
 const [selection,setSelection]=useState<SourceAnchor|null>(null);const viewer=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const paragraph=valid&&target?.kind==='text'?target.paragraphId:pos.paragraphId;
  if(c?.kind==='text'&&viewer.current&&(paragraph!=='para-1'||anchorId))scrollToTextParagraph(viewer.current,paragraph);
 },[resourceId,anchorId]);
 useEffect(()=>{if(!valid)setSelection(null);if(valid&&target){if(target.kind==='text')setPos(p=>({...p,paragraphId:target.paragraphId}));if(target.kind==='image')setPos(p=>({...p,x:target.x,y:target.y,width:target.width,height:target.height}));if(target.kind==='video')setPos(p=>({...p,startSec:target.startSec,endSec:target.endSec}));setSelection(target);onAnchor?.(target);}},[anchorId,resourceId]);
 if(!r||r.visibility==='private'&&r.ownerId!==data.session.userId)return <Empty title="资料不存在或无权访问"><Link to="/search">返回公开检索</Link></Empty>;
 if(!c||r.access!=='demo_readable'||review.includes('source-missing'))return <Empty title="原件当前不可读"><p>{r.mediaType==='video'?'当前无法播放此视频。已有笔记和时间标记仍保留。':r.availabilityNote+'；可以查看目录或创建独立笔记。'}</p><Link to={'/resources/'+r.id}>查看来源与获取说明</Link></Empty>;
 const base={id:uid('anchor'),resourceId:r.id,resourceVersionId:r.versionId,isDemo:r.isDemo};
 function choose(a:SourceAnchor){setSelection(a);onAnchor?.(a);}
 const proposedMedia=mediaSelection===undefined?(selection||(valid?target:null)):mediaSelection;
 const activeImage=proposedMedia?.kind==='image'&&proposedMedia.resourceId===r.id&&proposedMedia.resourceVersionId===r.versionId&&validImageBox(proposedMedia)?proposedMedia:null;
 const contentLabel=c.kind==='text'?'文本演示':c.kind==='image'?'图片演示':'视频演示';
 return <div ref={viewer} className={'resource-viewer '+(compact?'compact':'')} data-testid="reader-content" data-content-kind={c.kind}>
  {c.kind==='video_timeline'?null:c.kind==='image'?<p className="image-demo-caption">{r.isDemo?'演示图片 · 用于体验图片笔记':'图片批注'}</p>:<><div className="reader-content-header"><div className="notice"><strong>{r.isDemo?contentLabel:'本地私人材料'}：</strong>{c.warning}</div><div className="toolbar reader-display-tools"><label>显示比例 <select value={pos.zoom} onChange={e=>setPos(p=>({...p,zoom:+e.target.value}))}>{[75,100,125,150].map(n=><option key={n} value={n}>{n}%</option>)}</select></label></div></div></>}
  {(anchorId||review.includes('anchor-invalid'))&&!valid&&<div className="error" role="alert">来源版本或锚点失效，未定位。保留原笔记，请核对来源。</div>}

  {c.kind==='text'&&<TextReader resource={r} content={c} paragraphId={pos.paragraphId} zoom={pos.zoom} anchor={selection?.kind==='text'?selection:valid&&target?.kind==='text'?target:null} onNavigate={id=>setPos(p=>({...p,paragraphId:id}))} onSelect={range=>{choose({...base,kind:'text',...range});setPos(p=>({...p,paragraphId:range.paragraphId}));}} actionLabel={textActionLabel}/>}
  {c.kind==='image'&&(imageSource.loading?<p role="status">图片载入中…</p>:imageSource.missing||c.versionId!==r.versionId?<p role="alert">图片暂时无法读取，请从资料详情核对原文件。已有笔记仍保留。</p>:<ImageReader content={c} blobUrl={imageSource.url} anchor={activeImage} annotations={imageNotes(data,r.id).map(item=>({anchor:item.anchor,title:item.note.title}))} onSelect={box=>choose({...base,kind:'image',...box})} onLocate={choose} comparison={textActionLabel==='选为对照来源'}/>)}
  {c.kind==='video_timeline'&&<VideoReader resource={r} content={c} anchor={proposedMedia?.kind==='video'&&proposedMedia.resourceId===r.id&&proposedMedia.resourceVersionId===r.versionId&&validVideoAnchor(proposedMedia,c.durationSec)?proposedMedia:null} onSelect={range=>choose({...base,kind:'video',...range})} comparison={textActionLabel==='选为对照来源'}/>}
  {c.kind==='text'&&<footer className="reader-position">当前定位：{selection?anchorLabel(selection):c.kind==='text'?pos.paragraphId:'尚未确认选区'} · {r.id} · 版本 {r.versionId}</footer>}
 </div>;
}

export function ReaderTools(props:{resourceId:string;projectId?:string|null;anchor:SourceAnchor|null;onMediaSelect?:(a:SourceAnchor|null)=>void}){
 const {data}=useApp();
 const image=data.contents.some(c=>c.resourceId===props.resourceId&&c.kind==='image')||data.resources.some(r=>r.id===props.resourceId&&r.mediaType==='image');
 const video=data.contents.some(c=>c.resourceId===props.resourceId&&c.kind==='video_timeline')||data.resources.some(r=>r.id===props.resourceId&&r.mediaType==='video');
 return image?<ImageNotes {...props} onSelect={props.onMediaSelect}/>:video?<VideoNotes {...props} onSelect={props.onMediaSelect}/>:<StandardReaderTools {...props}/>;
}

function StandardReaderTools({resourceId,projectId,anchor}:{resourceId:string;projectId?:string|null;anchor:SourceAnchor|null}){
 const {data,commit,requireLogin,error,review}=useApp();const [tab,setTab]=useState(review.includes('ai-no-evidence')?'ai':'note');
 const [draft,setDraft,clear]=useDraft('reader-note:'+resourceId,{title:'',body:'',type:'excerpt',anchor:null as SourceAnchor|null,ai:false});
 const noteBody=useRef<HTMLTextAreaElement>(null);
 const [saved,setSaved]=useState(''); const r=data.resources.find(x=>x.id===resourceId);const a=anchor?.resourceId===resourceId?anchor:draft.anchor;const readonly=data.projects.find(p=>p.id===projectId)?.status==='archived';
 const newTextSelection=anchor?.resourceId===resourceId&&anchor.kind==='text'&&!data.anchors.some(a=>a.id===anchor.id);
 useLayoutEffect(()=>{
  if(!anchor||anchor.resourceId!==resourceId)return;
  setDraft(d=>({...d,anchor}));
  if(newTextSelection){setTab('note');setSaved('');}
 },[anchor?.id]);
 useLayoutEffect(()=>{
  if(tab==='note'&&newTextSelection){noteBody.current?.focus({preventScroll:true});noteBody.current?.scrollIntoView({block:'nearest'});}
 },[anchor?.id,tab]);
 function save(){requireLogin(()=>{const id=uid('note');if(commit(d=>{if(readonly)throw Error('归档项目只读');if(!draft.title.trim()||!draft.body.trim())throw Error('请填写笔记标题与内容');if(a&&!d.anchors.some(x=>x.id===a.id))d.anchors.push(a);d.notes.push({id,ownerId:d.session.userId!,originProjectId:projectId||null,title:draft.title,type:a?draft.type as 'excerpt':'independent',currentRevision:1,revisions:[{revision:1,body:draft.body,anchorIds:a?[a.id]:[],createdAt:new Date().toISOString(),aiAssisted:draft.ai}],relatedNoteIds:[]});if(projectId)addMembers(d,projectId,[{kind:'note',id,revision:1}]);},'笔记已保存在本机')){setSaved(id);clear();}});}
 return <div className="reader-tools"><div className="tabs">{[['note','笔记'],['source','来源'],['ai','AI 辅助']].map(([v,l])=><button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>)}</div>{tab==='note'?<div className="stack" data-testid="note-editor"><h3>记录研究观察</h3><p className="muted">归属：{(data.projects.find(p=>p.id===projectId)?projectTitle(data.projects.find(p=>p.id===projectId)!):'个人笔记')}</p><div className={'source-block '+(!a&&r?.mediaType!=='article'&&r?.mediaType!=='book'?'source-block-empty-media':'')}>{a?<><strong>已选择来源 · {anchorLabel(a)}</strong><p className="selected-source-quote">{a.kind==='text'?a.quote:'区域／时间范围已记录'}</p><small>{a.resourceId} · {a.resourceVersionId}</small></>:<p>在正文中选中文字并点击“记笔记”，即可关联原文；也可直接记录独立想法。</p>}</div><label>笔记标题<input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>内容性质<select value={draft.type} onChange={e=>setDraft(d=>({...d,type:e.target.value}))}><option value="excerpt">摘录</option><option value="observation">观察</option><option value="interpretation">解释</option><option value="independent">独立想法</option></select></label><label>我的观察与解释<textarea ref={noteBody} aria-label="我的观察与解释" rows={7} value={draft.body} onChange={e=>setDraft(d=>({...d,body:e.target.value}))}/></label>{draft.body&&<small>草稿待保存{draft.ai?' · 含已采纳的模拟 AI 建议':''}</small>}{readonly&&<p>项目已归档，不能在此创建笔记。</p>}{error&&<p className="error">{error} · 草稿仍保留</p>}<button className="primary" disabled={readonly} onClick={save}>保存笔记</button><details className="note-more-actions"><summary>更多笔记操作</summary><p className="muted">将当前标题、笔记内容和所选原文下载为 JSON 文件，供临时留存。要收进个人笔记，请点击“保存笔记”。</p><button onClick={()=>download('笔记草稿备份.json',JSON.stringify({...draft,anchor:a},null,2),'application/json;charset=utf-8')}>下载草稿备份（JSON）</button></details>{saved&&<div className="notice">已保存。<Link to={'/me/notes/'+saved+(projectId?'?projectId='+projectId:'')}>打开笔记与来源 →</Link></div>}</div>:tab==='source'?<div className="stack"><h3>来源与处理</h3><p>{r?.provenance.sourceLabel}</p><p>版本：{r?.versionId}</p><p>{r?.availabilityNote}</p><Link to={'/resources/'+resourceId}>查看来源详情</Link></div>:<AIPanel resourceIds={[resourceId]} onAccept={readonly?undefined:text=>{setDraft(d=>({...d,body:d.body+'\n'+text,ai:true}));setTab('note');}}/>}</div>;
}

export default function Reader(){
 const {pathname}=useLocation();const q=useQuery();const {data,review,saveResource}=useApp();
 let id=decodeURIComponent(pathname.split('/')[2]||'');
 if(review.includes('P08__image'))id='DEMO-IMAGE';if(review.includes('P08__video'))id='DEMO-VIDEO';
 const projectId=q.get('projectId'),r=data.resources.find(x=>x.id===id);
 const [anchor,setAnchor]=useState<SourceAnchor|null>(null);
 if(!r||r.visibility==='private'&&r.ownerId!==data.session.userId)return <Empty title="资料不存在或无权访问"><Link to="/search">返回公开检索</Link></Empty>;
 return <div className="reader-page">
  <div className="reader-heading">
   <div className="reader-document-heading"><Link to={returnPath(projectId?'/me/projects/'+projectId+'/archive?mode=deep':'/resources/'+id)}>← 返回原位置</Link><h1>{resourceTitle(r)}</h1><p className="muted">{r.mediaType==='image'?'图片批注':r.mediaType==='video'?'视频阅读':'统一深度阅读器'} · {projectId&&data.projects.find(p=>p.id===projectId)?projectTitle(data.projects.find(p=>p.id===projectId)!):'公开资料阅读'}</p></div>
   <div className="row reader-heading-actions">{boardReturnPath(projectId||undefined)&&<Link className="button" to={boardReturnPath(projectId||undefined)!}>返回原工作版位置</Link>}<button onClick={()=>saveResource(id)}>保存资料</button><ComparisonPicker resource={r} projectId={projectId}/></div>
  </div>
  <div className="reader-layout">
   <ResourceViewer key={id} resourceId={id} anchorId={q.get('anchorId')} onAnchor={setAnchor} mediaSelection={anchor}/>
   <aside data-testid="context-panel" aria-label="阅读笔记与辅助工具"><ReaderTools key={id} resourceId={id} projectId={projectId} anchor={anchor} onMediaSelect={setAnchor}/></aside>
  </div>
 </div>;
}

export function Compare(){const q=useQuery();const {data,commit,requireLogin,review,error}=useApp();const projectId=q.get('projectId');const incomingLeft=q.get('left')||'',incomingRight=review.includes('one-unavailable')?'I05':q.get('right')||'';const [left,setLeft]=useState(incomingLeft);const [right,setRight]=useState(incomingRight);const [la,setLa]=useState<SourceAnchor|null>(null);const [ra,setRa]=useState<SourceAnchor|null>(null);useEffect(()=>{setLeft(incomingLeft);setRight(incomingRight);setLa(null);setRa(null);},[incomingLeft,incomingRight]);const [side,setSide]=useState('left');const [draft,setDraft,clear]=useDraft('compare:'+left+':'+right,{purpose:review.includes('dirty-leave')?'待保存的比较记录':'',similarity:'',interpretation:'',question:''});const [saved,setSaved]=useState('');const [savedSnapshot,setSavedSnapshot]=useState('');const [leave,setLeave]=useState('');const dirty=Object.values(draft).some(Boolean)&&JSON.stringify(draft)!==savedSnapshot;useEffect(()=>{const click=(event:MouseEvent)=>{const target=clickedRoute(event);if(!dirty||!target)return;event.preventDefault();event.stopPropagation();setLeave(contextUrl(target));};const unload=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};document.addEventListener('click',click,true);window.addEventListener('beforeunload',unload);return()=>{document.removeEventListener('click',click,true);window.removeEventListener('beforeunload',unload);};},[dirty,draft]);const resources=data.resources.filter(r=>r.access==='demo_readable'&&(r.visibility==='public'||r.ownerId===data.session.userId));const readonly=data.projects.find(p=>p.id===projectId)?.status==='archived';function save(nextUrl=''){requireLogin(()=>{if(!la||!ra)return;const id=uid('note');if(commit(d=>{if(readonly)throw Error('归档项目只读');[la,ra].forEach(a=>{if(!d.anchors.some(x=>x.id===a.id))d.anchors.push(a)});d.notes.push({id,ownerId:d.session.userId!,originProjectId:projectId,title:draft.purpose||'比较记录',type:'comparison',currentRevision:1,revisions:[{revision:1,body:Object.entries(draft).map(([k,v])=>({purpose:'比较维度',similarity:'异同',interpretation:'解释',question:'疑问'}[k]+': '+v)).join('\n'),anchorIds:[la.id,ra.id],aiAssisted:false,createdAt:new Date().toISOString()}],relatedNoteIds:[]});if(projectId)addMembers(d,projectId,[{kind:'note',id,revision:1}]);},'比较笔记已保存在本机')){setSaved(id);clear();setSavedSnapshot(JSON.stringify(draft));if(nextUrl)nav(nextUrl);}})}return <div className="page compare-page"><Link to={returnPath(projectId?'/me/projects/'+projectId+'/archive':'/search/results')}>← 返回原位置</Link><div className="page-head"><div><h1>文献对照</h1><p className="muted">两端独立阅读与定位 · 比较不等于历史关联</p></div><button className="primary" disabled={!la||!ra||readonly} onClick={()=>save()}>保存比较笔记</button></div><div className="mobile-compare tabs"><button aria-pressed={side==='left'} className={side==='left'?'active':''} onClick={()=>setSide('left')}>左侧材料</button><button aria-pressed={side==='right'} className={side==='right'?'active':''} onClick={()=>setSide('right')}>右侧材料</button></div><div className="compare-grid">{[{id:left,set:setLeft,a:la,on:setLa,key:'left',label:'左侧'},{id:right,set:setRight,a:ra,on:setRa,key:'right',label:'右侧'}].map(x=><section className={'panel compare-side '+(side===x.key?'visible':'')} key={x.key}><div className="toolbar"><label>{x.label}资料<select aria-label={x.label+'资料'} value={x.id} onChange={e=>{x.set(e.target.value);x.on(null);}}><option value="" disabled>请选择资料</option>{resources.map(r=><option key={r.id} value={r.id}>{resourceTitle(r)}</option>)}{x.id==='I05'&&<option value="I05">不可读目录条目</option>}</select></label>{x.id&&<Link to={'/resources/'+x.id+'/read'+(projectId?'?projectId='+projectId:'')}>单项全屏</Link>}</div><>{x.id?<ResourceViewer key={x.id} resourceId={x.id} onAnchor={x.on} compact textActionLabel="选为对照来源"/>:<Empty title={'请选择'+x.label+'资料'} showSymbol={false}><p>从上方选择要对照的资料。</p></Empty>}</><p>{x.a?'已选：'+anchorLabel(x.a):'请选择一处来源位置'}</p></section>)}</div><section className="panel"><h2>比较记录</h2><p>更换材料前的文字草稿按材料组合保留；保存需要两端真实锚点。</p><div className="grid two-col">{(['purpose','similarity','interpretation','question'] as const).map((k,i)=><label key={k}>{['比较维度','观察到的异同','研究者解释','待核实问题'][i]}<textarea aria-label={['比较维度','观察到的异同','研究者解释','待核实问题'][i]} rows={3} value={draft[k]} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))}/></label>)}</div>{error&&<p className="error">{error}</p>}{saved&&<Link to={'/me/notes/'+saved}>查看已保存的比较笔记 →</Link>}{dirty&&<p className='notice'>比较记录有未提交修改；草稿保留在当前浏览器会话。</p>}</section>{leave&&<Modal title='比较记录尚未保存' onClose={()=>setLeave('')}><p>取消离开可继续编辑，保存需要两端来源位置。</p><div className='row'><button onClick={()=>setLeave('')}>继续比较</button><button onClick={()=>{clear();nav(leave);}}>丢弃修改并离开</button><button disabled={!la||!ra||readonly} onClick={()=>save(leave)}>保存后离开</button></div></Modal>}</div>}




