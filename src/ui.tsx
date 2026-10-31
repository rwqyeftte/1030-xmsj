import {currentLocation,browserHref} from './routing';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import CatalogVisual from './CatalogVisual';
import type {Project,Resource,SourceAnchor} from '../contracts/domain';
import {useApp,uid,mediaLabels,anchorLabel,download} from './store';
import {readLocalBlob} from './imports';
import {resourceTitle,projectTitle,resourceDateLabel} from './presentation';

const locationEvent=()=>window.dispatchEvent(new PopStateEvent('popstate',{state:{internal:true}}));
export function useLocation(){const [loc,setLoc]=useState({pathname:currentLocation().pathname,search:currentLocation().search});useEffect(()=>{const f=(event:PopStateEvent|HashChangeEvent)=>{setLoc({pathname:currentLocation().pathname,search:currentLocation().search});if(!('state' in event&&event.state?.internal))requestAnimationFrame(()=>{try{window.scrollTo(0,Number(sessionStorage.getItem(`literature-center:scroll:${currentLocation().pathname}${currentLocation().search}`)||0));}catch{}});};window.addEventListener('popstate',f);window.addEventListener('hashchange',f);return()=>{window.removeEventListener('popstate',f);window.removeEventListener('hashchange',f);};},[]);return loc;}
export function useQuery(){return new URLSearchParams(useLocation().search);}
function keepReview(to:string){const u=new URL(to,location.origin);const review=new URLSearchParams(currentLocation().search).get('review');if(review&&!u.searchParams.has('review')&&!u.pathname.startsWith('/__review'))u.searchParams.set('review',review);return u.pathname+u.search+u.hash;}
export function nav(to:string){if(!to.startsWith('/')||to.startsWith('//'))return;try{sessionStorage.setItem(`literature-center:scroll:${currentLocation().pathname}${currentLocation().search}`,String(window.scrollY));}catch{}history.pushState({},'',browserHref(keepReview(to)));locationEvent();window.scrollTo(0,0);}
export function contextUrl(to:string){const u=new URL(to,location.origin);const query=new URLSearchParams(currentLocation().search);const project=query.get('targetProjectId')||query.get('projectId');if(project&&!u.searchParams.has('projectId'))u.searchParams.set('projectId',project);if(!u.searchParams.has('ctx')){const id=uid('ctx');try{sessionStorage.setItem(`literature-center:ctx:${id}`,JSON.stringify({pathname:currentLocation().pathname,search:currentLocation().search,scrollY:window.scrollY}));u.searchParams.set('ctx',id);}catch{}}return keepReview(u.pathname+u.search+u.hash);}
export function returnTo(fallback='/'){const id=new URLSearchParams(currentLocation().search).get('ctx');if(id)try{const raw=sessionStorage.getItem(`literature-center:ctx:${id}`);if(raw){const ctx=JSON.parse(raw);if(typeof ctx.pathname==='string'&&ctx.pathname.startsWith('/')&&!ctx.pathname.startsWith('//')){nav(ctx.pathname+(ctx.search||''));requestAnimationFrame(()=>window.scrollTo(0,ctx.scrollY||0));return;}}}catch{}nav(fallback);}
export function Link({to,children,onClick,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>&{to:string}){const href=browserHref(keepReview(to));return <a {...props} href={href} onClick={e=>{onClick?.(e);if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||props.target==='_blank')return;e.preventDefault();nav((to.startsWith('/resources/')||to.startsWith('/me/notes/')||to.startsWith('/compare'))?contextUrl(to):to);}}>{children}</a>;}
export function Empty({title,children,showSymbol=true}:{title:string;children?:React.ReactNode;showSymbol?:boolean}){return <section className="empty-state">{showSymbol&&<div className="empty-symbol" aria-hidden="true">□</div>}<h2>{title}</h2>{children||<p>调整条件或添加第一份材料。</p>}</section>;}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){const ref=useRef<HTMLDivElement>(null);const restore=useRef<Element|null>(null);const close=useRef(onClose);close.current=onClose;const titleId=useRef(uid('modal-title'));useEffect(()=>{restore.current=document.activeElement;const root=ref.current;const items=()=>Array.from(root?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')||[]).filter(el=>el.offsetParent!==null);items()[0]?.focus();const f=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close.current();}if(e.key==='Tab'){const focusable=items();if(!focusable.length){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===focusable[0]){e.preventDefault();focusable.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===focusable.at(-1)){e.preventDefault();focusable[0].focus();}}};root?.addEventListener('keydown',f);return()=>{root?.removeEventListener('keydown',f);if(restore.current instanceof HTMLElement&&restore.current.isConnected)restore.current.focus();};},[]);return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId.current} ref={ref}><header className="panel-heading"><h2 id={titleId.current}>{title}</h2><button onClick={onClose} aria-label="关闭对话框">×</button></header>{children}</div></div>;}
export function PersonalShell({children}:{children:React.ReactNode}){const {pathname}=useLocation();return <div className="personal-shell"><aside className="personal-nav"><span className="eyebrow">个人研究空间</span><h2>我的资料</h2><nav aria-label="个人区域">{[['/me/library','全部资料'],['/me/notes','个人笔记'],['/me/projects','工作台']].map(([path,label])=><Link key={path} to={path} className={pathname.startsWith(path)?'active':''}>{label}<span aria-hidden="true">→</span></Link>)}</nav><p className="muted">资料、笔记和项目分别管理，同一来源保持关联。</p></aside><div className="personal-main">{children}</div></div>;}
export function ProjectHeader({project,active}:{project:Project;active:'archive'|'plan'}){const {status}=useApp();return <><header className="project-header"><div><Link to="/me/projects">← 工作台</Link><h1>{projectTitle(project)}</h1><p className="muted">{project.question||'研究问题待整理'} {project.status==='archived'&&<span className="badge">归档 · 只读</span>}</p></div><span data-testid="save-status">{status==='saved'?'已保存在本机':status==='error'?'有内容未保存':'本地演示'}</span></header><nav className="tabs" aria-label="项目导航"><Link className={active==='archive'?'active':''} to={`/me/projects/${project.id}/archive`}>研究档案</Link><Link className={active==='plan'?'active':''} to={`/me/projects/${project.id}/plan`}>研究计划</Link></nav></>;}
export function ResourcePreview({resource:r}:{resource:Resource}) {
  const {data}=useApp();const [open,setOpen]=useState(false);
  const allowed=r.visibility==='public'||r.ownerId===data.session.userId;
  const content=allowed&&r.access==='demo_readable'
    ? data.contents.find(c=>c.resourceId===r.id&&c.id===r.contentId&&c.versionId===r.versionId)
    : undefined;
  const title=resourceTitle(r);
  const [imageUrl,setImageUrl]=useState('');const [imageError,setImageError]=useState('');
  const blobKey=data.importJobs.find(job=>job.resourceId===r.id)?.blobKey;
  useEffect(()=>{
    setImageUrl('');setImageError('');
    if(!open||!allowed||content?.kind!=='image'||r.isDemo)return;
    let live=true,url='';
    if(!blobKey){setImageError('本地图片暂不可用，可查看目录信息。');return;}
    readLocalBlob(blobKey).then(blob=>{
      if(!live)return;
      if(!blob){setImageError('本地图片暂不可用，可查看目录信息。');return;}
      url=URL.createObjectURL(blob);setImageUrl(url);
    }).catch(()=>{if(live)setImageError('本地图片读取失败，请关闭预览后重试。');});
    return()=>{live=false;if(url)URL.revokeObjectURL(url);};
  },[open,allowed,content?.id,r.isDemo,blobKey]);
  return <><button data-testid={'preview-resource-'+r.id} disabled={!allowed} onClick={()=>setOpen(true)}>预览</button>{open&&allowed&&createPortal(
    <Modal title={'资料预览 · '+title} onClose={()=>setOpen(false)}>
      <div className="resource-preview" data-testid="resource-preview">
        <p className="muted">{mediaLabels[r.mediaType]} · {r.id}{r.isDemo?' · 合成演示材料':''}</p>
        <section className="resource-preview-content" aria-label="资料预览内容">
          {content?.kind==='text'?<><h3>文本片段</h3>{content.paragraphs.slice(0,3).map(p=><p key={p.id}>{p.text.slice(0,600)}{p.text.length>600?'…':''}</p>)}</>
          :content?.kind==='image'?<><h3>{content.label}</h3>{r.isDemo?<svg viewBox={`0 0 ${content.width} ${content.height}`} role="img" aria-label={content.label}><rect width={content.width} height={content.height} fill="#f3f3f0"/>{content.shapes.map((shape,i)=><g key={i}><rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill="#ddd" stroke="#666"/><text x={shape.x+8} y={shape.y+24} fontSize="16">{shape.label}</text></g>)}</svg>:imageError?<p role="status">{imageError}</p>:imageUrl?<img src={imageUrl} alt={content.label} onError={()=>setImageError('本地图片无法显示，可查看目录信息。')}/>:<p role="status">正在读取本地图片…</p>}</>
          :content?.kind==='video_timeline'?<><h3>时间轴片段</h3>{content.segments.slice(0,3).map((s,i)=><p key={i}><strong>{s.startSec}–{s.endSec} 秒</strong> · {s.text}</p>)}</>
          :<><h3>目录预览</h3><p>{r.description}</p><p className="muted">{r.access==='restricted'?'原件访问受限，当前仅可预览目录信息。':'当前未提供可预览的原文内容，以下为已有目录信息。'}</p></>}
        </section>
        {content&&<p className="muted">{content.warning}</p>}
        <dl className="download-metadata"><dt>作者／机构</dt><dd>{r.authors?.join('、')||'未详'}</dd><dt>原始日期</dt><dd>{r.sourceDate||'未详'}</dd><dt>来源</dt><dd>{r.provenance.sourceLabel}</dd><dt>主题</dt><dd>{r.subjects.join('、')||'未详'}</dd></dl>
        <div className="actions"><Link className="button" to={`/resources/${r.id}`} onClick={()=>setOpen(false)}>查看详情</Link>{content&&<Link className="button primary" to={`/resources/${r.id}/read`} onClick={()=>setOpen(false)}>继续阅读</Link>}</div>
      </div>
    </Modal>,document.body)}</>;
}
export function ResourceAccess({resource:r}:{resource:Resource}) {
  const {data}=useApp();const [open,setOpen]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const content=data.contents.find(c=>c.resourceId===r.id&&c.id===r.contentId);
  const job=data.importJobs.find(j=>j.resourceId===r.id&&j.blobKey);
  const allowed=r.visibility==='public'||r.ownerId===data.session.userId;
  const title=resourceTitle(r);
  const metadata=()=>download(r.id+'-metadata.json',JSON.stringify({...r,displayTitle:title},null,2),'application/json;charset=utf-8');
  async function original() {
    if(!allowed||!job?.blobKey)return;
    setBusy(true);setError('');
    try {const blob=await readLocalBlob(job.blobKey);if(!blob)throw new Error('本地原件已不可用，目录信息仍可下载。');
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=job.fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    } catch(e){setError(e instanceof Error?e.message:'下载失败，请重试。');}finally{setBusy(false);}
  }
  return <><button data-testid={'resource-access-'+r.id} disabled={!allowed} onClick={()=>{setError('');setOpen(true);}}>查看获取方式</button>{open&&allowed&&createPortal(<Modal title={'获取方式 · '+title} onClose={()=>setOpen(false)}>
    <div className="resource-access">
    <section aria-label="当前可获取内容"><h3>当前可获取内容</h3>
    <p>{r.access==='demo_readable'&&(content||job?.blobKey)?'可下载目录信息及下方列出的已提供内容。':r.access==='restricted'?'原件访问受限，当前仅可下载目录信息。':'当前仅提供目录信息，尚无原件获取渠道。'}目录信息文件不包含正文或原图。</p>
    {r.isDemo&&<p className="notice">合成演示材料 · 不作真实史料使用。</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="actions download-actions"><button onClick={metadata}>下载目录元数据（JSON）</button>
      {content&&r.access==='demo_readable'&&r.isDemo&&<button onClick={()=>download(r.id+'-demo-content.json',JSON.stringify({resourceId:r.id,title,isDemo:true,content},null,2),'application/json;charset=utf-8')}>下载合成内容（JSON）</button>}
      {content?.kind==='text'&&r.access==='demo_readable'&&<button onClick={()=>download(r.id+'-text.md','# '+title+'\n\n'+content.warning+'\n\n'+content.paragraphs.map(p=>'## '+p.id+'\n\n'+p.text).join('\n\n'),'text/markdown;charset=utf-8')}>下载已提供文本（Markdown）</button>}
      {job?.blobKey&&r.access==='demo_readable'&&<button onClick={()=>void original()} disabled={busy}>{busy?'读取本地原件…':'下载本地原件'}</button>}
    </div></section>
    <section className="resource-access-future" aria-label="未来可能的原件渠道"><h3>未来可能的原件渠道 <span className="badge">尚未接入</span></h3>
      <p className="muted">后续可根据资料来源与授权情况提供以下方式：</p>
      <ul><li><strong>前往来源网站：</strong>访问馆藏机构或数据库中的原件页面。</li><li><strong>在线阅读或下载原件：</strong>在获得授权后查看全文、原图或其他原始文件。</li><li><strong>向收藏机构申请：</strong>查看申请流程、使用条件及联系方式。</li></ul>
    </section></div>
  </Modal>,document.body)}</>;
}
export function ResourceShare({resource:r}:{resource:Resource}) {
  const [open,setOpen]=useState(false),[copied,setCopied]=useState(false),[error,setError]=useState('');
  const url=location.origin+browserHref('/resources/'+encodeURIComponent(r.id));
  const copy=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);setError('');}catch{setError('浏览器未允许复制，请选中下方地址手动复制。');}};
  return <><button disabled={r.visibility==='private'} title={r.visibility==='private'?'私人资料仅在本机可见，不生成公开分享':''} onClick={()=>{setOpen(true);setCopied(false);setError('');}}>分享</button>{open&&<Modal title="分享资料链接" onClose={()=>setOpen(false)}><h3>{resourceTitle(r)}</h3><p>{['localhost','127.0.0.1','[::1]'].includes(location.hostname)?'这是本地原型的资料地址，仅在运行此网页的电脑上可用，不会上传资料或发送给他人。':'链接指向网站公开目录，不包含你的本机笔记、项目或上传文件。'}</p><label>资料地址<input readOnly value={url} onFocus={e=>e.currentTarget.select()}/></label>{error&&<p role="alert">{error}</p>}<div className="actions"><button onClick={()=>setOpen(false)}>关闭</button><button onClick={()=>void copy()}>{copied?'已复制链接':'复制资料链接'}</button></div></Modal>}</>;
}
export function ResourceCard({resource:r,compact=false,selectable=false,selected=false,onSelect,hideMetadataFooter=false,hideAvailability=false,variant=compact?'result':'catalog'}:{resource:Resource;hideMetadataFooter?:boolean;hideAvailability?:boolean;compact?:boolean;selectable?:boolean;selected?:boolean;onSelect?:()=>void;variant?:'catalog'|'result'}) {
  const app=useApp();const [unsaving,setUnsaving]=useState(false);
  const saved=app.data.personalSaves.some(s=>s.resourceId===r.id&&s.userId===app.data.session.userId);
  const collected=app.data.collections.some(c=>c.ownerId===app.data.session.userId&&c.members.some(m=>m.kind==='resource'&&m.id===r.id));
  const title=resourceTitle(r);
  return <article className={`resource-card resource-card-${variant} ${compact?'compact':''}`} data-testid={`resource-card-${r.id}`} data-resource-id={r.id}>
    {selectable&&<label className="card-select"><input type="checkbox" checked={selected} onChange={()=>onSelect?.()} aria-label={`选择 ${title}`}/></label>}
    {!compact&&<CatalogVisual resource={r}/>}
    <div className="resource-info">
      <h3><Link to={`/resources/${r.id}`}>{title}</Link>{hideMetadataFooter&&r.isDemo&&<> <span className="badge">合成演示</span></>}</h3>
      <p className="resource-description">{r.description}</p>
      <p className="muted resource-author">作者：{r.authors?.join('、')||'未详'}</p>
      <p className="muted resource-bibliography"><span>{resourceDateLabel(r)}</span>{r.mediaType==='book'&&<span>ISBN：未详</span>}</p>
      <div className="actions"><ResourcePreview resource={r}/>{variant==='result'&&<button data-testid={`add-to-project-${r.id}`} onClick={()=>app.openProjectPicker([{kind:'resource',id:r.id}])}>加入项目</button>}<button aria-label={`将 ${title} 加入收藏夹`} onClick={()=>app.openCollectionPicker([{kind:'resource',id:r.id}])}>{collected?'已收藏':'收藏'}</button>{variant==='catalog'&&<ResourceShare resource={r}/>}</div>
      {!hideMetadataFooter&&(variant==='result'?<><div className="meta resource-footer"><span>{mediaLabels[r.mediaType]}</span><span>{r.id}</span>{r.isDemo&&<span className="badge">合成演示</span>}{r.visibility==='private'&&<span className="badge">私有</span>}<button className="text-button resource-save-link" data-testid={`save-resource-${r.id}`} onClick={()=>saved?setUnsaving(true):app.saveResource(r.id)}>{saved?'已保存':'保存资料'}</button></div>{!hideAvailability&&<p className="availability">{r.access==='demo_readable'?(r.isDemo?'合成内容可读 · 非史料':'本地原件可读'):r.access==='restricted'?'受限 · 仅目录可见':'仅目录，原件未提供'}</p>}</>:r.isDemo&&!hideAvailability?<p className="availability">合成演示材料 · 非史料原件</p>:null)}
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
export function SourceLink({anchorId}:{anchorId:string}) {
  const {data}=useApp();const a=data.anchors.find(a=>a.id===anchorId);const r=a&&data.resources.find(r=>r.id===a.resourceId&&(r.visibility==='public'||r.ownerId===data.session.userId));
  if(!a||!r)return <span className="warning">来源失效或不可访问 · {anchorId}</span>;
  const note=data.notes.find(n=>n.id===currentLocation().pathname.split('/').at(-1));
  const projectId=new URLSearchParams(currentLocation().search).get('projectId')||note?.originProjectId;
  const project=projectId&&data.projects.find(p=>p.id===projectId&&p.ownerId===data.session.userId);
  const node=project&&data.boardNodes.find(n=>n.projectId===project.id&&(n.ref.id===note?.id||n.ref.id===r.id));
  const board=boardReturnPath(project?project.id:null,node?node.id:undefined);
  const stale=r.versionId!==a.resourceVersionId||(!r.contentId&&a.kind!=='record');
  return <span className="source-links"><Link to={`/resources/${a.resourceId}/read?anchorId=${encodeURIComponent(a.id)}${project?'&projectId='+encodeURIComponent(project.id):''}`}>{resourceTitle(r)} · {anchorLabel(a)} ↗</Link>{stale&&<span className="badge">来源或版本失效，待复核</span>}{board&&<small> · <Link to={board}>返回原工作版位置</Link></small>}</span>;
}
export function useDraft<T>(key:string,initial:T):[T,React.Dispatch<React.SetStateAction<T>>,()=>void]{const review=new URLSearchParams(currentLocation().search).get('review')||'default';const storageKey=`literature-center:draft:${review}:${key}`;const read=()=>{try{const raw=sessionStorage.getItem(storageKey);return raw?JSON.parse(raw) as T:initial;}catch{return initial;}};const [value,setValue]=useState<T>(read);const prevKey=useRef(storageKey);useEffect(()=>{if(prevKey.current!==storageKey){prevKey.current=storageKey;setValue(read());}},[storageKey]);const update:React.Dispatch<React.SetStateAction<T>>=(next)=>setValue(old=>{const value=typeof next==='function'?(next as (x:T)=>T)(old):next;try{sessionStorage.setItem(storageKey,JSON.stringify(value));}catch{/* committed-save path will surface storage failure; the draft remains in memory. */}return value;});return [value,update,()=>{try{sessionStorage.removeItem(storageKey);}catch{}}];}
export function AIPanel({resourceIds,onAccept,onClose}:{resourceIds:string[];onAccept?:(text:string)=>void;onClose?:()=>void}){const {data,reviewState:review}=useApp();const [state,setState]=useState<'idle'|'loading'|'candidate'|'failed'|'dismissed'>('idle');const [body,setBody]=useState('');const [question,setQuestion]=useState('');const key=resourceIds.join(',');useEffect(()=>{setState(review==='ai-error'?'failed':['ai-candidate','ai-no-evidence'].includes(review)?'candidate':'idle');setBody(review==='ai-no-evidence'?'当前范围没有支持回答的已读原文。建议补充材料；不能据目录推断历史结论。':review==='ai-candidate'?'模拟建议：根据当前项目已提供目录，先明确材料的可读范围与待获取原件。没有全文依据，不生成历史结论。':'');setQuestion('');},[key,review]);const resources=data.resources.filter(r=>resourceIds.includes(r.id)&&(r.visibility==='public'||r.ownerId===data.session.userId));const anchors=data.anchors.filter(a=>resourceIds.includes(a.resourceId));const noEvidence=review==='ai-no-evidence'||!resources.length;const generate=()=>{setState('loading');setTimeout(()=>{if(review==='ai-error'){setState('failed');return;}setBody(noEvidence?'当前范围没有支持回答的已读原文。建议补充材料；不能据目录推断历史结论。':resources.some(r=>r.contentId&&r.isDemo)?'模拟建议：分别记录合成材料中的文字位置与图像区域，再比较不同定位方式。此建议只验证研究流程，不代表真实史料的分析结论。':'模拟建议：当前仅有目录信息。可按已知题名与资料类型建立候选清单，并记录待获取原件；没有全文依据，无法生成摘要或引文。');setState('candidate');},350);};return <section className="ai-panel" data-testid="ai-panel"><header className="panel-heading"><h2>AI 辅助 <span className="badge">模拟</span></h2>{onClose&&<button aria-label="关闭 AI 面板" onClick={onClose}>×</button>}</header><p data-testid="ai-scope">仅使用当前 {resources.length} 份材料的已提供内容。不连接模型，不读取整个个人库。</p><ul>{resources.map(r=><li key={r.id}><Link to={`/resources/${r.id}`}>{resourceTitle(r)}</Link> · {r.contentId&&r.isDemo?'合成内容':r.contentId?'仅元数据，私人原件未送模型':'仅目录'}</li>)}</ul><label>希望辅助的任务<textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="例如：列出需要人工核实的事项"/></label><button onClick={generate} disabled={state==='loading'}>{state==='loading'?'正在生成模拟候选…':'生成模拟建议'}</button>{state==='failed'&&<div role="alert" className="error"><p>模拟 AI 不可用。人工检索、阅读和整理仍可继续。</p><button onClick={generate}>重试</button></div>}{state==='candidate'&&<div data-testid="ai-candidate"><h3>候选内容 · 未采纳</h3><textarea value={body} onChange={e=>setBody(e.target.value)} aria-label="编辑 AI 候选内容"/><h3>依据与局限</h3>{anchors.slice(0,2).map(a=><p key={a.id}><SourceLink anchorId={a.id}/></p>)}<p>用户确认不等于历史事实已获证明。未经确认，不写入笔记、关系或计划。</p><div className="actions"><button onClick={()=>setState('dismissed')}>拒绝建议</button>{onAccept&&<button disabled={noEvidence} onClick={()=>{onAccept(`[模拟 AI 辅助，用户确认]\n${body}`);setState('dismissed');}}>确认采纳到当前编辑草稿</button>}</div></div>}{state==='dismissed'&&<p>候选已关闭；若已采纳，请核对目标草稿并手动保存。</p>}</section>;}

