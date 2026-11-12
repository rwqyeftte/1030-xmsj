import {currentLocation,browserHref} from './routing';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {collectionImage} from './collection-images';
import {accessionDate,coursePdf,featuredMaterial} from './featured';
import {isValidPdfSelection} from './pdf-selection';
import {resolveTextAnchor} from './text-anchors';
import {paperParagraphs,type PaperView} from './paper-text';
import {FeaturedMedia,FeaturedLinks} from './FeaturedMedia';
import CatalogVisual from './CatalogVisual';
import type {Project,Resource,SourceAnchor} from '../contracts/domain';
import {useApp,uid,mediaLabels,anchorLabel} from './store';
import {readLocalBlob} from './imports';
import {resourceTitle,projectTitle,resourceDateLabel} from './presentation';
import ResearchChat from './ResearchChat';

interface AIPanelProps {
  resourceIds:string[];
  onAccept?:(text:string)=>void;
  onClose?:()=>void;
  acceptLabel?:string;
}
export function AIPanel(props:AIPanelProps) {
  const {data,review}=useApp();
  if(review)return <ReviewAIPanel {...props}/>;
  const selected=new Set(props.resourceIds);
  const resources=data.resources.filter(r=>selected.has(r.id)&&r.visibility==='public'&&!r.isDemo&&r.catalogOrigin==='center_preview'&&featuredMaterial(r));
  return <ResearchChat scopeKey={currentLocation().pathname} title="AI 辅助" resourceIds={resources.map(r=>r.id)}
    scopeLabel={resources.length===1?resourceTitle(resources[0]):'当前范围 · '+resources.length+' 份公开馆藏'}
    onClose={props.onClose} onAccept={props.onAccept} acceptLabel={props.acceptLabel}/>;
}

const locationEvent=()=>window.dispatchEvent(new PopStateEvent('popstate',{state:{internal:true}}));
export function useLocation(){const [loc,setLoc]=useState({pathname:currentLocation().pathname,search:currentLocation().search});useEffect(()=>{const f=(event:PopStateEvent|HashChangeEvent)=>{setLoc({pathname:currentLocation().pathname,search:currentLocation().search});if(!('state' in event&&event.state?.internal))requestAnimationFrame(()=>{try{window.scrollTo(0,Number(sessionStorage.getItem(`literature-center:scroll:${currentLocation().pathname}${currentLocation().search}`)||0));}catch{}});};window.addEventListener('popstate',f);window.addEventListener('hashchange',f);return()=>{window.removeEventListener('popstate',f);window.removeEventListener('hashchange',f);};},[]);return loc;}
export function useQuery(){return new URLSearchParams(useLocation().search);}
function keepReview(to:string){const u=new URL(to,location.origin);const review=new URLSearchParams(currentLocation().search).get('review');if(review&&!u.searchParams.has('review')&&!u.pathname.startsWith('/__review'))u.searchParams.set('review',review);return u.pathname+u.search+u.hash;}
export function nav(to:string,{preserveScroll=false}={}){if(!to.startsWith('/')||to.startsWith('//'))return;try{sessionStorage.setItem(`literature-center:scroll:${currentLocation().pathname}${currentLocation().search}`,String(window.scrollY));}catch{}history.pushState({},'',browserHref(keepReview(to)));locationEvent();if(!preserveScroll)window.scrollTo(0,0);}
export function contextUrl(to:string){const u=new URL(to,location.origin);const query=new URLSearchParams(currentLocation().search);const project=query.get('targetProjectId')||query.get('projectId');if(project&&!u.searchParams.has('projectId'))u.searchParams.set('projectId',project);if(!u.searchParams.has('ctx')){const id=uid('ctx');try{sessionStorage.setItem(`literature-center:ctx:${id}`,JSON.stringify({pathname:currentLocation().pathname,search:currentLocation().search,scrollY:window.scrollY}));u.searchParams.set('ctx',id);}catch{}}return keepReview(u.pathname+u.search+u.hash);}
export function returnTo(fallback='/',destination?:string){const id=new URLSearchParams(currentLocation().search).get('ctx');if(id)try{const raw=sessionStorage.getItem(`literature-center:ctx:${id}`);if(raw){const ctx=JSON.parse(raw);if(typeof ctx.pathname==='string'&&ctx.pathname.startsWith('/')&&!ctx.pathname.startsWith('//')){nav(destination??ctx.pathname+(ctx.search||''));requestAnimationFrame(()=>window.scrollTo(0,ctx.scrollY||0));return;}}}catch{}nav(destination??fallback);}
export function Link({to,children,onClick,preserveContext=true,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>&{to:string;preserveContext?:boolean}){const href=browserHref(keepReview(to));return <a {...props} href={href} onClick={e=>{onClick?.(e);if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||props.target==='_blank')return;e.preventDefault();nav(preserveContext&&(to.startsWith('/resources/')||to.startsWith('/me/notes/')||to.startsWith('/compare'))?contextUrl(to):to);}}>{children}</a>;}
export function Empty({title,children,showSymbol=true}:{title:string;children?:React.ReactNode;showSymbol?:boolean}){return <section className="empty-state">{showSymbol&&<div className="empty-symbol" aria-hidden="true">□</div>}<h2>{title}</h2>{children||<p>调整条件或添加第一份材料。</p>}</section>;}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){const ref=useRef<HTMLDivElement>(null);const restore=useRef<Element|null>(null);const close=useRef(onClose);close.current=onClose;const titleId=useRef(uid('modal-title'));useEffect(()=>{restore.current=document.activeElement;const root=ref.current;const items=()=>Array.from(root?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')||[]).filter(el=>el.offsetParent!==null);items()[0]?.focus();const f=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close.current();}if(e.key==='Tab'){const focusable=items();if(!focusable.length){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===focusable[0]){e.preventDefault();focusable.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===focusable.at(-1)){e.preventDefault();focusable[0].focus();}}};root?.addEventListener('keydown',f);return()=>{root?.removeEventListener('keydown',f);if(restore.current instanceof HTMLElement&&restore.current.isConnected)restore.current.focus();};},[]);return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId.current} ref={ref}><header className="panel-heading"><h2 id={titleId.current}>{title}</h2><button onClick={onClose} aria-label="关闭对话框">×</button></header>{children}</div></div>;}
export function PersonalShell({children}:{children:React.ReactNode}){const {pathname}=useLocation();return <div className="personal-shell"><aside className="personal-nav"><span className="eyebrow">个人研究空间</span><h2>我的资料</h2><nav aria-label="个人区域">{[['/me/library','全部资料'],['/me/notes','个人笔记'],['/me/projects','工作台']].map(([path,label])=><Link key={path} to={path} className={pathname.startsWith(path)?'active':''}>{label}<span aria-hidden="true">→</span></Link>)}</nav><p className="muted">资料、笔记和项目分别管理，同一来源保持关联。</p></aside><div className="personal-main">{children}</div></div>;}
export function ProjectHeader({project,active}:{project:Project;active:'archive'|'plan'}){const {status}=useApp();return <><header className="project-header"><div><Link to="/me/projects">← 工作台</Link><h1>{projectTitle(project)}</h1><p className="muted">{project.question||'研究问题待整理'} {project.status==='archived'&&<span className="badge">归档 · 只读</span>}</p></div><span data-testid="save-status">{status==='saved'?'已保存在本机':status==='error'?'有内容未保存':'本地演示'}</span></header><nav className="tabs" aria-label="项目导航"><Link className={active==='archive'?'active':''} to={`/me/projects/${project.id}/archive`}>研究档案</Link><Link className={active==='plan'?'active':''} to={`/me/projects/${project.id}/plan`}>研究计划</Link></nav></>;}
export function ResourcePreview({resource:r}:{resource:Resource}) {
  const {data}=useApp();const [open,setOpen]=useState(false);
  const [page,setPage]=useState(1);
  const [paperView,setPaperView]=useState<PaperView>('text');
  const pdf=coursePdf(r);
  const resourcePath='/resources/'+encodeURIComponent(r.id);
  const fileQuery=pdf?'?page='+page+(r.mediaType==='paper'?'&view='+paperView:''):'';
  const allowed=r.visibility==='public'||r.ownerId===data.session.userId;
  const content=allowed&&r.access==='demo_readable'
    ? data.contents.find(c=>c.resourceId===r.id&&c.id===r.contentId&&c.versionId===r.versionId)
    : undefined;
  const title=resourceTitle(r);
  const item=featuredMaterial(r);
  const [imageUrl,setImageUrl]=useState('');const [imageError,setImageError]=useState('');
  const blobKey=data.importJobs.find(job=>job.resourceId===r.id)?.blobKey;
  useEffect(()=>{
    setImageUrl('');setImageError('');
    if(!open||!allowed||content?.kind!=='image'||r.isDemo)return;
    let live=true,url='';
    const archived=collectionImage(r.id);
    if(archived){setImageUrl(archived);return;}
    if(!blobKey){setImageError('本地图片暂不可用，可查看目录信息。');return;}
    readLocalBlob(blobKey).then(blob=>{
      if(!live)return;
      if(!blob){setImageError('本地图片暂不可用，可查看目录信息。');return;}
      url=URL.createObjectURL(blob);setImageUrl(url);
    }).catch(()=>{if(live)setImageError('本地图片读取失败，请关闭预览后重试。');});
    return()=>{live=false;if(url)URL.revokeObjectURL(url);};
  },[open,allowed,content?.id,r.isDemo,blobKey]);
  return <><button data-testid={'preview-resource-'+r.id} disabled={!allowed} onClick={()=>{setPage(1);setPaperView('text');setOpen(true);}}>预览</button>{open&&allowed&&createPortal(
    <Modal title={'资料预览 · '+title} onClose={()=>setOpen(false)}>
      <div className="resource-preview" data-testid="resource-preview">
        <div className="preview-entry-row">
          <span className="muted">{mediaLabels[r.mediaType]} · {r.id}{r.isDemo?' · 合成演示材料':''}</span>
          {item&&<div className="actions">
            <Link className="button" to={resourcePath+fileQuery}>查看详情</Link>
            <Link className="button primary" to={resourcePath+'/read'+fileQuery}>进入精读</Link>
          </div>}
        </div>
        <section className="resource-preview-content" aria-label="资料预览内容">
          {item?<FeaturedMedia item={item} initialPage={page} onPageChange={setPage} paperView={paperView} onPaperViewChange={setPaperView}/>:content?.kind==='text'?<><h3>文本片段</h3>{content.paragraphs.slice(0,3).map(p=><p key={p.id}>{p.text.slice(0,600)}{p.text.length>600?'…':''}</p>)}</>
          :content?.kind==='image'?<><h3>{content.label}</h3>{r.isDemo?<svg viewBox={`0 0 ${content.width} ${content.height}`} role="img" aria-label={content.label}><rect width={content.width} height={content.height} fill="#f3f3f0"/>{content.shapes.map((shape,i)=><g key={i}><rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill="#ddd" stroke="#666"/><text x={shape.x+8} y={shape.y+24} fontSize="16">{shape.label}</text></g>)}</svg>:imageError?<p role="status">{imageError}</p>:imageUrl?<img src={imageUrl} alt={content.label} onError={()=>setImageError('本地图片无法显示，可查看目录信息。')}/>:<p role="status">正在读取本地图片…</p>}</>
          :content?.kind==='video_timeline'?<><h3>时间轴片段</h3>{content.segments.slice(0,3).map((s,i)=><p key={i}><strong>{s.startSec}–{s.endSec} 秒</strong> · {s.text}</p>)}</>
          :<><h3>目录预览</h3><p>{r.description}</p><p className="muted">{r.access==='restricted'?'原件访问受限，当前仅可预览目录信息。':'当前未提供可预览的原文内容，以下为已有目录信息。'}</p></>}
        </section>
        {item&&<FeaturedLinks item={item}/>}
        {content&&<p className="muted">{content.warning}</p>}
        <dl className="download-metadata"><dt>作者／机构</dt><dd>{r.authors?.join('、')||'未详'}</dd><dt>原始日期</dt><dd>{r.sourceDate||'未详'}</dd><dt>来源</dt><dd>{r.provenance.sourceLabel}</dd><dt>主题</dt><dd>{r.subjects.join('、')||'未详'}</dd></dl>
        {!item&&<div className="actions"><Link className="button" to={resourcePath} onClick={()=>setOpen(false)}>查看详情</Link>{content&&<Link className="button primary" to={resourcePath+'/read'} onClick={()=>setOpen(false)}>继续阅读</Link>}</div>}
      </div>
    </Modal>,document.body)}</>;
}
export function ResourceShare({resource:r}:{resource:Resource}) {
  const [open,setOpen]=useState(false),[copied,setCopied]=useState(false),[error,setError]=useState('');
  const url=location.origin+browserHref('/resources/'+encodeURIComponent(r.id));
  const copy=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);setError('');}catch{setError('浏览器未允许复制，请选中下方地址手动复制。');}};
  return <><button disabled={r.visibility==='private'} title={r.visibility==='private'?'私人资料仅在本机可见，不生成公开分享':''} onClick={()=>{setOpen(true);setCopied(false);setError('');}}>分享</button>{open&&<Modal title="分享资料链接" onClose={()=>setOpen(false)}><h3>{resourceTitle(r)}</h3><p>{['localhost','127.0.0.1','[::1]'].includes(location.hostname)?'这是本地原型的资料地址，仅在运行此网页的电脑上可用，不会上传资料或发送给他人。':'链接指向网站公开目录，不包含你的本机笔记、项目或上传文件。'}</p><label>资料地址<input readOnly value={url} onFocus={e=>e.currentTarget.select()}/></label>{error&&<p role="alert">{error}</p>}<div className="actions"><button onClick={()=>setOpen(false)}>关闭</button><button onClick={()=>void copy()}>{copied?'已复制链接':'复制资料链接'}</button></div></Modal>}</>;
}
export function ResourceCard({resource:r,compact=false,selectable=false,selected=false,onSelect,hideMetadataFooter=false,hideAvailability=false,showFeaturedCover=false,showAccessionDate=false,variant=compact?'result':'catalog'}:{resource:Resource;hideMetadataFooter?:boolean;hideAvailability?:boolean;showFeaturedCover?:boolean;showAccessionDate?:boolean;compact?:boolean;selectable?:boolean;selected?:boolean;onSelect?:()=>void;variant?:'catalog'|'result'|'recommendation'}) {
  const app=useApp();const [unsaving,setUnsaving]=useState(false);
  const saved=app.data.personalSaves.some(s=>s.resourceId===r.id&&s.userId===app.data.session.userId);
  const collected=app.data.collections.some(c=>c.ownerId===app.data.session.userId&&c.members.some(m=>m.kind==='resource'&&m.id===r.id));
  const title=resourceTitle(r);
  const recommended=variant==='recommendation';
  const edition=recommended?featuredMaterial(r)?.source:undefined;
  const extent=edition?.pageCount?edition.pageCount+' 页节选':edition?.durationSec?edition.durationSec+' 秒视频节选':undefined;
  return <article className={`resource-card resource-card-${recommended?'catalog recommendation-resource':variant} ${compact?'compact':''}`} data-testid={`resource-card-${r.id}`} data-resource-id={r.id}>
    {selectable&&<label className="card-select"><input type="checkbox" checked={selected} onChange={()=>onSelect?.()} aria-label={`选择 ${title}`}/></label>}
    {!compact&&<CatalogVisual resource={r} showFeaturedCover={showFeaturedCover}/>}
    <div className="resource-info">
      <h3><Link to={`/resources/${r.id}`}>{title}</Link>{hideMetadataFooter&&r.isDemo&&<> <span className="badge">合成演示</span></>}</h3>
      <p className="resource-description">{r.description}</p>
      {(!recommended||!!r.authors?.length)&&<p className="muted resource-author">作者：{r.authors?.join('、')||'未详'}</p>}
      {(!recommended||extent||r.sourceDate||showAccessionDate)&&<p className="muted resource-bibliography">{extent&&<span>{extent}</span>}{(!recommended||r.sourceDate)&&<span>{resourceDateLabel(r)}</span>}{showAccessionDate&&<span>入库日期 <time dateTime={accessionDate(r)}>{accessionDate(r).slice(0,10)}</time></span>}{r.mediaType==='book'&&r.access!=='file_available'&&<span>ISBN：未详</span>}</p>}
      <div className="actions">
        {edition&&<Link className="recommendation-read" to={'/resources/'+r.id+'/read'}>进入精读</Link>}
        <ResourcePreview resource={r}/>
        {variant==='result'&&<button data-testid={`add-to-project-${r.id}`} onClick={()=>app.openProjectPicker([{kind:'resource',id:r.id}])}>加入项目</button>}
        <button aria-label={`将 ${title} 加入收藏夹`} onClick={()=>app.openCollectionPicker([{kind:'resource',id:r.id}])}>{collected?'已收藏':'收藏'}</button>
        {variant!=='result'&&<ResourceShare resource={r}/>}
      </div>
      {!hideMetadataFooter&&(variant==='result'?<><div className="meta resource-footer"><span>{mediaLabels[r.mediaType]}</span><span>{r.id}</span>{r.isDemo&&<span className="badge">合成演示</span>}{r.visibility==='private'&&<span className="badge">私有</span>}<button className="text-button resource-save-link" data-testid={`save-resource-${r.id}`} onClick={()=>saved?setUnsaving(true):app.saveResource(r.id)}>{saved?'已保存':'保存资料'}</button></div>{!hideAvailability&&<p className="availability">{r.access==='file_available'?r.availabilityNote:r.access==='demo_readable'?(r.isDemo?'合成内容可读 · 非史料':'本地原件可读'):r.access==='restricted'?'受限 · 仅目录可见':'仅目录，原件未提供'}</p>}</>:r.isDemo&&!hideAvailability?<p className="availability">合成演示材料 · 非史料原件</p>:null)}
    </div>
    {variant==='result'&&compact&&<aside className="resource-metrics" aria-label="文献统计未提供"><div><span>未详</span><small>引用</small></div><div><span>未详</span><small>参考文献</small></div></aside>}
    {unsaving&&<Modal title="取消个人保存" onClose={()=>setUnsaving(false)}><p>取消保存「{title}」只移除个人保存关系。已有收藏夹、项目文件、画布与笔记均保留；收藏夹仍引用的资料仍会在个人库显示。</p><div className="actions"><button onClick={()=>setUnsaving(false)}>保留保存</button><button onClick={()=>{if(app.commit(d=>{d.personalSaves=d.personalSaves.filter(s=>!(s.userId===d.session.userId&&s.resourceId===r.id));},'已取消个人保存，收藏夹和项目引用保留'))setUnsaving(false);}}>确认取消保存</button></div></Modal>}
  </article>;
}
export function boardReturnPath(projectId?:string|null,nodeId?:string):string|null {
  let query=new URLSearchParams(currentLocation().search);
  const visited=new Set<string>();
  for(let step=0;step<12;step++) {
    const id=query.get('ctx');if(!id||visited.has(id))break;visited.add(id);
    try {const ctx=JSON.parse(sessionStorage.getItem(`literature-center:ctx:${id}`)||'null');if(!ctx)break;if(/^\/me\/projects\/[^/]+\/archive$/.test(ctx.pathname))return ctx.pathname+(ctx.search||'');query=new URLSearchParams(ctx.search||'');}catch{break;}
  }
  return projectId?`/me/projects/${encodeURIComponent(projectId)}/archive?view=board${nodeId?'&focusNodeId='+encodeURIComponent(nodeId):''}`:null;
}
export function SourceLink({anchorId,boardProjectId}:{anchorId:string;boardProjectId?:string}) {
  const {data}=useApp();const a=data.anchors.find(a=>a.id===anchorId);const r=a&&data.resources.find(r=>r.id===a.resourceId&&(r.visibility==='public'||r.ownerId===data.session.userId));
  if(!a||!r)return <span className="warning">来源失效或不可访问 · {anchorId}</span>;
  const note=data.notes.find(n=>n.id===currentLocation().pathname.split('/').at(-1));
  const projectId=boardProjectId||new URLSearchParams(currentLocation().search).get('projectId')||note?.originProjectId;
  const project=projectId&&data.projects.find(p=>p.id===projectId&&p.ownerId===data.session.userId);
  const node=project&&data.boardNodes.find(n=>n.projectId===project.id&&(n.ref.id===note?.id||n.ref.id===r.id));
  const board=!boardProjectId&&boardReturnPath(project?project.id:null,node?node.id:undefined);
  const pdfPages=coursePdf(r)?.source.pageCount ?? 0;
  const validPdfPage=a.kind==='pdf' && Number.isInteger(a.page) && a.page>=1 && a.page<=pdfPages && (!a.selection||isValidPdfSelection(a.selection));
  const paperText=r.mediaType==='paper'&&a.kind==='text';
  const passage=paperText?paperParagraphs(r.id).find(p=>p.id===a.paragraphId):undefined;
  const stale=paperText&&!resolveTextAnchor(paperParagraphs(r.id),a)||r.versionId!==a.resourceVersionId || (a.kind==='pdf' ? !validPdfPage : !r.contentId && a.kind!=='record');
  const locationLabel=resourceTitle(r)+' · '+anchorLabel(a);
  return <span className="source-links"><Link aria-label={boardProjectId?'回到原文：'+locationLabel:undefined} to={`/resources/${a.resourceId}/read?anchorId=${encodeURIComponent(a.id)}${a.kind==='pdf'&&!stale?'&page='+a.page+(r.mediaType==='paper'?'&view=pdf':''):paperText&&passage?'&view=text&page='+passage.page:''}${project?'&projectId='+encodeURIComponent(project.id):''}`}>{boardProjectId?'回到原文':locationLabel} ↗</Link>{stale&&<span className="badge">来源或版本失效，待复核</span>}{board&&<small> · <Link to={board}>返回原工作版位置</Link></small>}</span>;
}
export function useDraft<T>(key:string,initial:T):[T,React.Dispatch<React.SetStateAction<T>>,()=>void]{const review=new URLSearchParams(currentLocation().search).get('review')||'default';const storageKey=`literature-center:draft:${review}:${key}`;const read=()=>{try{const raw=sessionStorage.getItem(storageKey);return raw?JSON.parse(raw) as T:initial;}catch{return initial;}};const [value,setValue]=useState<T>(read);const prevKey=useRef(storageKey);useEffect(()=>{if(prevKey.current!==storageKey){prevKey.current=storageKey;setValue(read());}},[storageKey]);const update:React.Dispatch<React.SetStateAction<T>>=(next)=>setValue(old=>{const value=typeof next==='function'?(next as (x:T)=>T)(old):next;try{sessionStorage.setItem(storageKey,JSON.stringify(value));}catch{/* committed-save path will surface storage failure; the draft remains in memory. */}return value;});return [value,update,()=>{try{sessionStorage.removeItem(storageKey);}catch{}}];}
function ReviewAIPanel({resourceIds,onAccept,onClose}:{resourceIds:string[];onAccept?:(text:string)=>void;onClose?:()=>void}){const {data,reviewState:review}=useApp();const [state,setState]=useState<'idle'|'loading'|'candidate'|'failed'|'dismissed'>('idle');const [body,setBody]=useState('');const [question,setQuestion]=useState('');const key=resourceIds.join(',');useEffect(()=>{setState(review==='ai-error'?'failed':['ai-candidate','ai-no-evidence'].includes(review)?'candidate':'idle');setBody(review==='ai-no-evidence'?'当前范围没有支持回答的已读原文。建议补充材料；不能据目录推断历史结论。':review==='ai-candidate'?'模拟建议：根据当前项目已提供目录，先明确材料的可读范围与待获取原件。没有全文依据，不生成历史结论。':'');setQuestion('');},[key,review]);const resources=data.resources.filter(r=>resourceIds.includes(r.id)&&(r.visibility==='public'||r.ownerId===data.session.userId));const anchors=data.anchors.filter(a=>resourceIds.includes(a.resourceId));const noEvidence=review==='ai-no-evidence'||!resources.length;const generate=()=>{setState('loading');setTimeout(()=>{if(review==='ai-error'){setState('failed');return;}setBody(noEvidence?'当前范围没有支持回答的已读原文。建议补充材料；不能据目录推断历史结论。':resources.some(r=>r.contentId&&r.isDemo)?'模拟建议：分别记录合成材料中的文字位置与图像区域，再比较不同定位方式。此建议只验证研究流程，不代表真实史料的分析结论。':'模拟建议：当前仅有目录信息。可按已知题名与资料类型建立候选清单，并记录待获取原件；没有全文依据，无法生成摘要或引文。');setState('candidate');},350);};return <section className="ai-panel" data-testid="ai-panel"><header className="panel-heading"><h2>AI 辅助 <span className="badge">模拟</span></h2>{onClose&&<button aria-label="关闭 AI 面板" onClick={onClose}>×</button>}</header><p data-testid="ai-scope">仅使用当前 {resources.length} 份材料的已提供内容。不连接模型，不读取整个个人库。</p><ul>{resources.map(r=><li key={r.id}><Link to={`/resources/${r.id}`}>{resourceTitle(r)}</Link> · {r.contentId&&r.isDemo?'合成内容':r.contentId?'仅元数据，私人原件未送模型':'仅目录'}</li>)}</ul><label>希望辅助的任务<textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="例如：列出需要人工核实的事项"/></label><button onClick={generate} disabled={state==='loading'}>{state==='loading'?'正在生成模拟候选…':'生成模拟建议'}</button>{state==='failed'&&<div role="alert" className="error"><p>模拟 AI 不可用。人工检索、阅读和整理仍可继续。</p><button onClick={generate}>重试</button></div>}{state==='candidate'&&<div data-testid="ai-candidate"><h3>候选内容 · 未采纳</h3><textarea value={body} onChange={e=>setBody(e.target.value)} aria-label="编辑 AI 候选内容"/><h3>依据与局限</h3>{anchors.slice(0,2).map(a=><p key={a.id}><SourceLink anchorId={a.id}/></p>)}<p>用户确认不等于历史事实已获证明。未经确认，不写入笔记、关系或计划。</p><div className="actions"><button onClick={()=>setState('dismissed')}>拒绝建议</button>{onAccept&&<button disabled={noEvidence} onClick={()=>{onAccept(`[模拟 AI 辅助，用户确认]\n${body}`);setState('dismissed');}}>确认采纳到当前编辑草稿</button>}</div></div>}{state==='dismissed'&&<p>候选已关闭；若已采纳，请核对目标草稿并手动保存。</p>}</section>;}

