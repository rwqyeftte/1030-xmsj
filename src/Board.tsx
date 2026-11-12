import {currentLocation,browserHref} from './routing';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {AppData,ObjectRef,BoardNode,SourceAnchor,Relation} from '../contracts/domain';
import {useApp,placeNode,uid,addMembers,mediaLabels,download} from './store';
import {Link,nav,useQuery,useLocation,useDraft,Empty,Modal,ProjectHeader,AIPanel} from './ui';
import {ResourceViewer,ReaderTools} from './Reader';
import {resourceTitle} from './presentation';
import {featuredMaterial} from './featured';
import {paperParagraphs,type PaperView} from './paper-text';
import {useBoardGestures} from './useBoardGestures';
import {boardBounds,fitBoard,centerNode,zoomBoard,freeCardPosition} from './board-geometry';
import {connectedCards,addSummaryCard} from './board-summary';
import {BoardCardMenu,BoardSummaryDialog,SummaryProvenance} from './BoardSummary';
import BoardConnection from './BoardConnection';
import BoardCanvasCard,{ideaLabels} from './BoardCanvasCard';
import BoardNoteDetail from './BoardNoteDetail';

const relLabels:Record<string,string>={same_source:'同一来源',compare:'比较',supports:'支持',contradicts:'反驳',background:'背景',hypothesis:'待验证联系',summary_source:'汇总来源'};
export default function Board(){
 const {pathname}=useLocation();
 return <ProjectBoard key={pathname} pathname={pathname}/>;
}
function ProjectBoard({pathname}:{pathname:string}){
 const {data,commit,error,review,notify}=useApp();const q=useQuery();const pid=pathname.split('/')[3];const project=data.projects.find(p=>p.id===pid);
 const nodes=data.boardNodes.filter(n=>n.projectId===pid);const members=data.projectMembers.filter(m=>m.projectId===pid);
 const initial=data.boardViews.find(b=>b.projectId===pid)||{x:0,y:0,zoom:1,selectedNodeIds:[],mode:'overview',view:'board'};
 const [viewport,setViewport]=useDraft('viewport:'+pid,{x:initial.x,y:initial.y,zoom:initial.zoom});
 const state=review.split('__').pop();const [view,setView]=useState((['files','analysis'].includes(state||'')?state:q.get('view')||initial.view)||'board');
 const [mode,setMode]=useState(q.get('mode')==='overview'&&['preview','deep','relation'].includes(state||'')?state!:q.get('mode')||initial.mode);
 const [selected,setSelected]=useState<string[]>(q.get('focusNodeId')?[q.get('focusNodeId')!]:initial.selectedNodeIds.length?initial.selectedNodeIds:['preview','deep','relation'].includes(state||'')?[nodes[0]?.id].filter(Boolean):[]);
 const [search,setSearch]=useState('');const [fileFilter,setFileFilter]=useState('all');const [fileOpen,setFileOpen]=useState(()=>!window.matchMedia("(max-width: 760px)").matches);const [panelTab,setPanelTab]=useState('read');const [anchor,setAnchor]=useState<SourceAnchor|null>(null);
 const [modal,setModal]=useState('');const [title,setTitle]=useState('');const [reason,setReason]=useState('');const [relType,setRelType]=useState('compare');const [target,setTarget]=useState(nodes[1]?.id||'');
 const [history,setHistory]=useState<AppData[]>([]);const [future,setFuture]=useState<AppData[]>([]);const [ideaType,setIdeaType]=useState<keyof typeof ideaLabels>('question');
 const [readingPosition,setReadingPosition]=useState<{id:string;page?:number;paragraphId?:string;view?:PaperView}>();
 const [cardMenu,setCardMenu]=useState<{x:number;y:number;nodeId:string;ids:string[]}|null>(null);
 const [summaryIds,setSummaryIds]=useState<string[]|null>(null);
 const [pending,setPending]=useState<((d:AppData)=>void)|null>(null);const [removeId,setRemoveId]=useState('');
 const readonly=project?.status==='archived';const sel=nodes.find(n=>n.id===selected[0]);const resource=sel?.ref.kind==='resource'?data.resources.find(r=>r.id===sel.ref.id):null;
 const objTitle=(ref:ObjectRef)=>{if(ref.kind==='resource'){const r=data.resources.find(r=>r.id===ref.id);return r?resourceTitle(r):undefined;}return ref.kind==='note'?data.notes.find(n=>n.id===ref.id)?.title:data.ideas.find(i=>i.id===ref.id)?.title;};
 function apply(fn:(d:AppData)=>void,msg='工作版已保存在本机'){if(readonly){notify('归档项目只读，请先在工作台恢复');return false;}const before=structuredClone(data);const ok=commit(d=>{if(d.projects.find(p=>p.id===pid)?.status==='archived')throw Error('项目只读');fn(d);const p=d.projects.find(p=>p.id===pid);if(p)p.updatedAt=new Date().toISOString();},msg);if(ok){setHistory(h=>[...h.slice(-19),before]);setFuture([]);setPending(null);}else setPending(()=>fn);return ok;}
 function updateView(v=view,m=mode,s=selected){if(s[0]!==selected[0]){setPanelTab('read');setAnchor(null);}const p=new URLSearchParams(currentLocation().search);p.set('view',v);p.set('mode',m);if(s[0])p.set('focusNodeId',s[0]);else p.delete('focusNodeId');historyReplace(pathname+'?'+p);setView(v);setMode(m);setSelected(s);if(!readonly)commit(d=>{let b=d.boardViews.find(b=>b.projectId===pid);if(!b){b={projectId:pid,...viewport,selectedNodeIds:s,mode:'overview',view:'board'};d.boardViews.push(b);}Object.assign(b,viewport,{view:v,mode:['preview','deep'].includes(m)?m:'overview',selectedNodeIds:s});});}
 function saveViewport(v:typeof viewport){setViewport(v);if(!readonly)commit(d=>{let b=d.boardViews.find(b=>b.projectId===pid);if(!b){b={projectId:pid,...v,selectedNodeIds:selected,view:'board',mode:'overview'};d.boardViews.push(b);}else Object.assign(b,v);});}
 function undo(redo=false){const list=redo?future:history;const previous=list[list.length-1];if(!previous||readonly)return;const current=structuredClone(data);if(commit(d=>{for(const k of ['boardNodes','edgeBindings','relations','groups','ideas','projectMembers'] as const)(d[k] as unknown)=structuredClone(previous[k]);},redo?'已重做':'已撤销')){if(redo){setFuture(f=>f.slice(0,-1));setHistory(h=>[...h,current]);}else{setHistory(h=>h.slice(0,-1));setFuture(f=>[...f,current]);}}}
 function selectCard(id:string,shift:boolean) {
   if (shift) {
     const next=selected.includes(id)?selected.filter(current=>current!==id):[...selected,id];
     updateView('board','overview',next);
     return;
   }
   if (mode==='relation' && sel && sel.id!==id) {setTarget(id);return;}

   updateView('board',mode==='deep'&&nodes.find(n=>n.id===id)?.ref.kind==='resource'?'deep':'preview',[id]);
 }
 const gestures=useBoardGestures(nodes,viewport,readonly,saveViewport,(id,x,y)=>apply(d=>{const n=d.boardNodes.find(n=>n.id===id);if(n)Object.assign(n,{x,y});}),selectCard);
 const {moving,displayViewport,canvasRef}=gestures;
 const renderedNodes=nodes.map(n=>({...n,...(moving?.id===n.id?moving:{}),height:Math.max(n.height,canvasRef.current?.querySelector<HTMLElement>('[data-node-id="'+n.id+'"]')?.offsetHeight||0)}));
 const panelRef=useRef<HTMLElement>(null);
 useEffect(()=>{
   function applyRoute() {
     const location=currentLocation();
     if (location.pathname!==pathname) return;
     const query=new URLSearchParams(location.search);
     const id=query.get('focusNodeId');
     setSelected(id?[id]:[]);
     setView(query.get('view')||'board');
     setMode(query.get('mode')||(id?'preview':'overview'));
     setPanelTab('read');
     setAnchor(null);
   }
   window.addEventListener('popstate',applyRoute);
   window.addEventListener('hashchange',applyRoute);
   return ()=>{window.removeEventListener('popstate',applyRoute);window.removeEventListener('hashchange',applyRoute);};
 },[pathname]);
 function closePanel() {
   updateView('board','overview');
   requestAnimationFrame(()=>Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[data-node-id]')||[]).find(el=>el.dataset.nodeId===sel?.id)?.focus({preventScroll:true}));
 }
 useLayoutEffect(()=>{
   panelRef.current?.scrollTo({top:0});
   if (!sel || view!=='board' || (mode!=='preview'&&mode!=='deep')) return;
   const frame=canvasRef.current;
   const card=Array.from(frame?.querySelectorAll<HTMLElement>('[data-node-id]')||[]).find(el=>el.dataset.nodeId===sel.id);
   if (!frame || !card) return;
   const mobilePanel=window.matchMedia('(max-width:760px)').matches?panelRef.current:null;
   if (mobilePanel && mobilePanel.getBoundingClientRect().top-frame.getBoundingClientRect().top<130) frame.scrollIntoView({block:'start'});
   const box=card.getBoundingClientRect(),canvas=frame.getBoundingClientRect();
   const bottom=mobilePanel?Math.min(canvas.bottom,mobilePanel.getBoundingClientRect().top):canvas.bottom;
   const top=mobilePanel?Math.max(canvas.top,0):canvas.top;
   function reveal(start:number,end:number,min:number,max:number) {
     if (max<=min) return 0;
     if (end-start>max-min) return (max+min-end-start)/2;
     return start<min?min-start:end>max?max-end:0;
   }
   const dx=reveal(box.left,box.right,canvas.left+12,canvas.right-12);
   const dy=reveal(box.top,box.bottom,top+12,bottom-12);
   if (Math.abs(dx)>.5 || Math.abs(dy)>.5) saveViewport({...viewport,x:viewport.x+dx,y:viewport.y+dy});

 },[sel?.id,view,mode]);
 function frameSize(){return {width:canvasRef.current?.clientWidth||800,height:canvasRef.current?.clientHeight||500};}
 function locate(n:BoardNode){updateView('board','overview',[n.id]);requestAnimationFrame(()=>{const {width,height}=frameSize();saveViewport(centerNode(n,width,height,viewport.zoom));});}
 function fit(){const {width,height}=frameSize();saveViewport(fitBoard(renderedNodes,width,height));}
 function zoom(value:number){const {width,height}=frameSize();saveViewport(zoomBoard(viewport,value,width,height));}
 function newIdea(){setTitle('');setReason('');setIdeaType('question');setModal('idea');}
 const selectedMember=sel&&members.find(m=>m.ref.kind===sel.ref.kind&&m.ref.id===sel.ref.id);
 const selectedIdea=sel?.ref.kind==='idea'?data.ideas.find(i=>i.id===sel.ref.id):undefined;
 const connected=connectedCards(data,pid,selected);
 const summarySelection=selected.length>=2?selected:connected;
 function openSummary(ids:string[]){setCardMenu(null);if(readonly||ids.length<2)return;setSummaryIds(ids);}
 function openCardMenu(n:BoardNode,x:number,y:number){const ids=selected.includes(n.id)?selected:[n.id];updateView('board',mode,ids);setCardMenu({x,y,nodeId:n.id,ids});}
 function createSummary(ids:string[],focus:string,summaryTitle:string){const id=uid('summary'),date=new Date().toISOString();let created:BoardNode|undefined;const ok=apply(d=>{created=addSummaryCard(d,pid,ids,focus,summaryTitle,id,date,renderedNodes);},'汇总卡已保存');if(ok&&created){setSummaryIds(null);locate(created);setPanelTab('read');updateView('board','preview',[created.id]);}return ok;}


 function place(ref:ObjectRef){let placed:BoardNode|undefined;const existing=nodes.some(n=>n.ref.id===ref.id&&n.ref.kind===ref.kind);if(apply(d=>{const node=placeNode(d,pid,ref);if(!existing)Object.assign(node,freeCardPosition(renderedNodes));placed=d.boardNodes.find(n=>n.projectId===pid&&n.ref.id===ref.id&&n.ref.kind===ref.kind);})&&placed)locate(placed);}
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(pending){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[pending]);
 if(!project)return <Empty title="项目不存在"><Link to="/me/projects">返回工作台</Link></Empty>;
 const filtered=members.filter(m=>(objTitle(m.ref)||'').includes(search)&&(fileFilter==='all'||m.ref.kind==='resource'&&data.resources.find(r=>r.id===m.ref.id)?.mediaType===fileFilter));
 const resources=members.filter(m=>m.ref.kind==='resource').map(m=>data.resources.find(r=>r.id===m.ref.id)).filter((r):r is NonNullable<typeof r>=>!!r);
 function rememberBoardPage(page:number,paragraphId?:string) {
   if (!resource) return;
   setReadingPosition(previous=>({...((previous?.id===resource.id)?previous:{}),id:resource.id,page,paragraphId}));
   setAnchor(source=>source?.kind==='pdf'&&source.page!==page || source?.kind==='text'&&paragraphId&&source.paragraphId!==paragraphId?null:source);
 }
 function rememberBoardFormat(view:PaperView) {
   if (!resource) return;
   setReadingPosition(previous=>({...((previous?.id===resource.id)?previous:{}),id:resource.id,view,paragraphId:undefined}));
   setAnchor(null);
 }
 const readerParams=new URLSearchParams({projectId:pid});
 const position=readingPosition?.id===resource?.id?readingPosition:undefined;
 if (position?.page) readerParams.set('page',String(position.page));
 if (position?.view) readerParams.set('view',position.view);
 if (position?.paragraphId) readerParams.set('paragraphId',position.paragraphId);
 if (resource && anchor?.resourceId===resource.id) {
   if (data.anchors.some(item=>item.id===anchor.id)) readerParams.set('anchorId',anchor.id);
   if (anchor.kind==='pdf') {readerParams.set('page',String(anchor.page));readerParams.set('view','pdf');}
   if (anchor.kind==='text') {
     readerParams.set('paragraphId',anchor.paragraphId);
     const passage=paperParagraphs(resource.id).find(p=>p.id===anchor.paragraphId);
     if (passage) {readerParams.set('page',String(passage.page));readerParams.set('view','text');}
   }
 }
 const readerUrl=resource?'/resources/'+encodeURIComponent(resource.id)+'/read?'+readerParams:'';
 return <div className="project-page research-board" data-workspace-view={view}><ProjectHeader project={project} active="archive"/>{readonly&&<div className="notice">只读归档项目 · 可查看和导出，恢复后才能编辑。<Link to="/me/projects?status=archived">管理归档</Link></div>}
 <div className="board-toolbar"><div className="tabs">{[['board','项目画布'],['files','项目文件'],['analysis','资料分析']].map(([v,l])=><button key={v} className={view===v?'active':''} aria-pressed={view===v} onClick={()=>updateView(v)}>{l}</button>)}</div><div className="row"><Link className="button" to={'/search/results?targetProjectId='+pid}>＋ 查找资料</Link><Link className="button" to={'/me/import?target=project&projectId='+pid}>导入</Link><button disabled={readonly} onClick={newIdea}>＋ 研究卡片</button><button disabled={readonly||!selected.length} onClick={()=>{setTitle('');setModal('group')}}>分组</button><button disabled={readonly||!sel||nodes.length<2} onClick={()=>{setReason('');setTarget(selected.find(id=>id!==sel?.id)||nodes.find(n=>n.id!==sel?.id)?.id||'');setMode('relation')}}>连接</button><button disabled={readonly||!history.length} onClick={()=>undo()}>撤销</button><button disabled={readonly||!future.length} onClick={()=>undo(true)}>重做</button></div></div>
 {pending&&<div className="error" role="alert">工作版未保存：{error}。操作仍保留，可重试。<button onClick={()=>apply(pending)}>重试保存</button><button onClick={()=>{const draft=structuredClone(data);pending(draft);download('工作版未保存草稿.json',JSON.stringify(draft,null,2),'application/json')}}>导出草稿</button></div>}
 <div onKeyDown={e=>{if(e.key==='Escape'&&!cardMenu&&!modal&&!summaryIds&&mode!=='overview'){e.preventDefault();closePanel();}}} className={'workspace '+(fileOpen?'':'files-collapsed')+' '+(mode!=='overview'&&view==='board'?'with-panel':'')}>
 <aside className="project-files" aria-label="项目材料文件栏" data-testid="project-members"><div className="toolbar"><h3>项目文件 <span className="tag">{members.length}</span></h3><button onClick={()=>setFileOpen(false)} aria-label="收起项目文件">‹</button></div><label>搜索当前项目<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="资料、笔记或想法"/></label><div className="file-list">{filtered.map(m=>{const n=nodes.find(n=>n.ref.id===m.ref.id&&n.ref.kind===m.ref.kind);return <div className="file-item" key={m.id} data-resource-id={m.ref.id}><span className="eyebrow">{m.ref.kind==='resource'?'资料':m.ref.kind==='note'?'笔记':'想法'} · {n?'已放置':'未放上工作版'}</span><strong>{objTitle(m.ref)||'来源失效'}</strong><button disabled={readonly&&!n} onClick={()=>n?locate(n):place(m.ref)}>{n?'定位节点':'放到工作版'}</button></div>})}{!filtered.length&&<p>暂无项目材料。可查找资料或导入。</p>}</div><Link to={"/me/library?targetProjectId="+pid}>从我的资料选择 →</Link></aside>
 <div className="work-center"><div className={"workspace-caption "+(view==='board'?'board-caption':'')}><button onClick={()=>setFileOpen(!fileOpen)}>{fileOpen?'收起文件栏':'展开文件栏'}</button><span>{view==='board'?'自由组织 · 选择卡片后预览或深读':view==='files'?'同一项目的去重材料':'当前项目 · 去重统计'}</span><span className="muted">{resources.length} 份资料 · {members.filter(m=>m.ref.kind==='note').length} 条笔记</span></div>
 {view==='board'?<><div className="board-modes" data-testid="board-mode"><button onClick={()=>setFileOpen(!fileOpen)}>{fileOpen?'收起文件栏':'展开文件栏'}</button>{[['overview','概览'],['preview','预览'],['deep','深读']].map(([v,l])=><button key={v} className={mode===v?'active':''} aria-pressed={mode===v} disabled={v!=='overview'&&!sel} onClick={()=>updateView('board',v)}>{l}</button>)}<button disabled={readonly||summarySelection.length<2} onClick={()=>openSummary(summarySelection)} title={selected.length>=2?`汇总所选 ${selected.length} 张卡片`:`汇总相连的 ${connected.length} 张卡片`}>生成汇总卡{summarySelection.length>=2?`（${summarySelection.length}）`:""}</button><span className="board-selection-count">{selected.length?`已选 ${selected.length} 张卡片`:'选择卡片查看资料或记录想法'}</span>{sel&&<button disabled={readonly} onClick={()=>setModal('remove-node')}>移除摆放</button>}</div><div ref={canvasRef} tabIndex={0} aria-label="研究画布" className={'board-canvas '+(gestures.panReady?'pan-ready ':'')+(gestures.panning?'panning':'')} data-testid="board-canvas" {...gestures.canvasProps}>
 <div className="board-space" style={{transform:`translate(${displayViewport.x}px,${displayViewport.y}px) scale(${displayViewport.zoom})`}}>{data.groups.filter(g=>g.projectId===pid).map(g=>{const cards=renderedNodes.filter(n=>n.groupId===g.id);const b=boardBounds(cards,18);return b?<div key={g.id} className="board-group" style={{left:b.x,top:b.y-27,width:b.width,height:b.height+27}}><span className="board-group-name">{g.title}<small>{cards.length} 张卡片</small></span></div>:null;})}
 <svg className="edges board-connections" width="1" height="1" aria-label="卡片之间的关系">
   {data.edgeBindings.map(edge=>{
     const from=renderedNodes.find(n=>n.id===edge.sourceNodeId),to=renderedNodes.find(n=>n.id===edge.targetNodeId);
     const relation=data.relations.find(r=>r.id===edge.relationId);
     if(!from||!to||!relation)return null;
     const summary=relation.type==='summary_source';
     return <BoardConnection key={edge.id} from={from} to={to} label={relLabels[relation.type]}
       actionLabel={summary?'查看汇总卡：'+objTitle(to.ref):'汇总相连卡片：'+relLabels[relation.type]}
       dotted={summary||relation.type==='hypothesis'} selected={selected.includes(from.id)||selected.includes(to.id)} disabled={readonly&&!summary}
       onMenu={(x,y)=>openCardMenu(from,x,y)}
       onOpen={()=>summary?updateView('board','preview',[to.id]):openSummary(connectedCards(data,pid,[from.id,to.id]))}/>;
   })}
 </svg>
 {nodes.map(n=><BoardCanvasCard key={n.id} data={data} node={n} title={objTitle(n.ref)||'来源失效'} selected={selected.includes(n.id)} position={moving?.id===n.id?moving:n}
   onSelect={shift=>selectCard(n.id,shift)} onMenu={(x,y)=>openCardMenu(n,x,y)}
   onMove={(dx,dy)=>{setSelected([n.id]);if(!readonly)apply(d=>{const node=d.boardNodes.find(item=>item.id===n.id);if(node){node.x=Math.max(0,node.x+dx);node.y=Math.max(0,node.y+dy);}});}}
   onRemove={()=>{if(!readonly){setSelected([n.id]);setModal('remove-node');}}}/>)}
 </div>{!nodes.length&&<div className="board-empty"><h2>从一份材料开始组织研究</h2><p>项目文件中的材料不会自动铺满工作版。点击“放到工作版”安排第一张卡片。</p><Link className="button" to={'/search?targetProjectId='+pid}>查找资料</Link></div>}</div><div className="board-bottom"><button aria-label="缩小画布" onClick={()=>zoom(viewport.zoom-.1)}>−</button><span>{Math.round(viewport.zoom*100)}%</span><button aria-label="放大画布" onClick={()=>zoom(viewport.zoom+.1)}>＋</button><button onClick={fit}>适应画布</button><button disabled={!sel} onClick={()=>sel&&locate(sel)}>定位选中</button><button aria-pressed={gestures.hand} onClick={()=>gestures.setHand(!gestures.hand)}>{gestures.hand?'结束平移':'平移画布'}</button><span className="muted">中键或空格＋拖动平移 · Shift＋单击多选</span></div></>:view==='files'?<div className="file-table"><div className="toolbar"><h2>项目文件</h2><select aria-label="筛选项目文件类型" value={fileFilter} onChange={e=>setFileFilter(e.target.value)}><option value="all">全部类型</option>{Object.entries(mediaLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>{filtered.map(m=><div className="project-file-row" key={m.id}><div><strong>{objTitle(m.ref)}</strong><p className="muted">{m.ref.id} · {nodes.some(n=>n.ref.id===m.ref.id)?'已放置':'未放上工作版'}</p></div><label>阅读<select disabled={readonly} value={m.reading} onChange={e=>apply(d=>{d.projectMembers.find(x=>x.id===m.id)!.reading=e.target.value as typeof m.reading})}><option value="unread">未读</option><option value="reading">阅读中</option><option value="read">已读</option></select></label><label>选材<select disabled={readonly} value={m.selection} onChange={e=>apply(d=>{d.projectMembers.find(x=>x.id===m.id)!.selection=e.target.value as typeof m.selection})}><option value="candidate">候选</option><option value="included">纳入</option><option value="excluded">排除</option></select></label><button disabled={readonly} onClick={()=>place(m.ref)}>放到工作版</button><button disabled={readonly} onClick={()=>{setRemoveId(m.id);setModal('remove-member')}}>移出项目</button></div>)}{!filtered.length&&<Empty title="项目没有匹配材料"/>}</div>:<div className="analysis-view"><h2>项目材料构成</h2><p>统计 {resources.length} 份去重资料；{resources.filter(r=>!r.sourceDate).length} 份年代未详。画布重复引用不增加样本数。</p><div className="analysis-bars">{Object.entries(mediaLabels).map(([k,l])=>{const count=resources.filter(r=>r.mediaType===k).length;return <button key={k} onClick={()=>{setFileFilter(k);updateView('files')}}><span>{l}</span><span className="bar" style={{width:Math.max(3,resources.length?count/resources.length*60:0)+'%'}}/><strong>{count}</strong></button>})}</div><h3>主题分布</h3><p className="muted">非互斥标签；同一资料可在多个主题计数。</p><div className="row">{[...new Set(resources.flatMap(r=>r.subjects))].map(s=><span className="tag" key={s}>{s} · {resources.filter(r=>r.subjects.includes(s)).length}</span>)}</div><h3>已记录的研究关系</h3><p className="muted">以下关系由用户确认。相似或已采纳不代表历史事实已被证明。</p>{data.relations.filter(r=>r.projectId===pid).map(r=><div className="relation-row" key={r.id}><strong>{objTitle(r.from)} → {objTitle(r.to)}</strong><p>{relLabels[r.type]} · {r.rationale}</p><small>{r.state==='inactive'?'关联材料移出，关系失效':r.needsReview?'来源更新，需复核':'用户已确认'}</small><button disabled={readonly} onClick={()=>{setRemoveId(r.id);setModal('remove-relation')}}>删除研究关系</button></div>)}</div>}
 </div>
 {mode!=='overview'&&view==='board'&&<aside ref={panelRef} className={'board-context '+(mode==='deep'?'deep':'')} data-testid="context-panel" aria-label={mode==='deep'?'深读':mode==='relation'?'建立研究关系':'快速预览'}><div className="toolbar"><strong>{mode==='relation'?'建立研究关系':mode==='deep'?'深读':'卡片详情'}</strong><button onClick={closePanel} aria-label="关闭任务面板" title="关闭卡片详情">×</button></div>{mode==='relation'?<div className="stack"><p>起点：{sel&&objTitle(sel.ref)}</p><label>终点<select value={target} onChange={e=>setTarget(e.target.value)}>{nodes.filter(n=>n.id!==sel?.id).map(n=><option key={n.id} value={n.id}>{objTitle(n.ref)}</option>)}</select></label><label>关系类型<select value={relType} onChange={e=>setRelType(e.target.value)}>{Object.entries(relLabels).filter(([v])=>v!=='summary_source').map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>关系理由（必填）<textarea value={reason} onChange={e=>setReason(e.target.value)} rows={5}/></label><p className="muted">这是研究者的关系判断，不代表历史事实已证实。</p><button className="primary" disabled={readonly||!sel||!target||target===sel.id||!reason.trim()} onClick={()=>{const dest=nodes.find(n=>n.id===target);if(!sel||!dest||sel.id===dest.id)return;if(apply(d=>{const rid=uid('relation');d.relations.push({id:rid,projectId:pid,from:sel.ref,to:dest.ref,type:relType as Relation['type'],rationale:reason,anchorIds:[],state:'confirmed',aiAssisted:false,needsReview:false});d.edgeBindings.push({id:uid('edge'),relationId:rid,sourceNodeId:sel.id,targetNodeId:dest.id});}))updateView('board','overview')}}>确认建立关系</button></div>:sel?<><div className="board-detail-kind">{resource?mediaLabels[resource.mediaType]:selectedIdea?ideaLabels[selectedIdea.type]:'研究笔记'}{sel.groupId&&<span> / {data.groups.find(g=>g.id===sel.groupId)?.title}</span>}</div><h3 className="board-detail-title">{objTitle(sel.ref)}</h3>{resource?<>{selectedMember&&<div className="board-resource-state"><label>阅读进度<select disabled={readonly} value={selectedMember.reading} onChange={e=>apply(d=>{d.projectMembers.find(m=>m.id===selectedMember.id)!.reading=e.target.value as typeof selectedMember.reading})}><option value="unread">未读</option><option value="reading">阅读中</option><option value="read">已读</option></select></label><label>选材状态<select disabled={readonly} value={selectedMember.selection} onChange={e=>apply(d=>{d.projectMembers.find(m=>m.id===selectedMember.id)!.selection=e.target.value as typeof selectedMember.selection})}><option value="candidate">候选资料</option><option value="included">纳入研究</option><option value="excluded">排除</option></select></label></div>}<div className="tabs"><button className={panelTab==='read'?'active':''} onClick={()=>setPanelTab('read')}>资料</button><button className={panelTab==='note'?'active':''} onClick={()=>setPanelTab('note')}>记录笔记</button>{review?<button className={panelTab==='ai'?'active':''} onClick={()=>setPanelTab('ai')}>AI 辅助</button>:featuredMaterial(resource)&&<Link className="board-chat-link" to={readerUrl+'&tool=ai'}>AI 辅助 ↗</Link>}</div>{panelTab==='ai'?<AIPanel resourceIds={[resource.id]}/>:panelTab==='note'?<ReaderTools resourceId={resource.id} projectId={pid} anchor={anchor}/>:mode==='deep'?<ResourceViewer key={resource.id} resourceId={resource.id} initialPage={position?.page} initialParagraphId={position?.paragraphId} paperView={position?.view}
 onPageChange={rememberBoardPage} onPaperViewChange={rememberBoardFormat}

 onAnchor={a=>{setAnchor(a);setPanelTab('note');}} compact/>:<div className="board-resource-overview"><h4>资料简介</h4><p>{resource.description}</p><dl>{resource.authors?.length? <><dt>作者</dt><dd>{resource.authors.join('、')}</dd></>:null}{resource.sourceDate&&<><dt>日期</dt><dd>{resource.sourceDate}</dd></>}<dt>来源</dt><dd>{resource.provenance.sourceLabel}</dd></dl><p className="muted">{resource.availabilityNote}</p><button onClick={()=>updateView('board','deep')}>在此深读</button></div>}{anchor&&panelTab==='read'&&<button className="primary" onClick={()=>setPanelTab('note')}>以当前来源创建笔记</button>}<div className="row"><Link to={readerUrl}>全屏阅读 ↗</Link><Link to={'/resources/'+resource.id}>资料详情</Link></div></>:sel.ref.kind==='note'?<BoardNoteDetail data={data} projectId={pid} noteRef={sel.ref} readonly={readonly}/>:<div className="stack"><button disabled={readonly} onClick={()=>{if(selectedIdea){setTitle(selectedIdea.title);setReason(selectedIdea.body);setIdeaType(selectedIdea.type);setModal('edit-idea');}}}>{selectedIdea?.summary?'编辑汇总卡':'编辑研究卡片'}</button><p className="idea-body">{selectedIdea?.body||'暂无内容'}</p>{selectedIdea?.summary&&<SummaryProvenance idea={selectedIdea} data={data} projectId={pid} onLocate={id=>{const n=nodes.find(n=>n.id===id);if(n)locate(n);}}/>}</div>}</>:<Empty title="请先选择一个节点"/>}</aside>}
 </div>
 {cardMenu&&<BoardCardMenu {...cardMenu} selectedIds={cardMenu.ids} connectedIds={connectedCards(data,pid,[cardMenu.nodeId])} readonly={readonly} onClose={()=>setCardMenu(null)} onSummary={openSummary} onPreview={()=>{updateView('board','preview',[cardMenu.nodeId]);setCardMenu(null);}}/>}
 {summaryIds&&<BoardSummaryDialog data={data} projectId={pid} nodeIds={summaryIds} readonly={readonly} error={error} onClose={()=>setSummaryIds(null)} onCreate={createSummary}/>}
 {modal&&<Modal title={{idea:'新建研究卡片','edit-idea':'编辑研究卡片',group:'将选中节点分组','remove-node':'仅移除画布摆放','remove-member':'移出项目','remove-relation':'删除研究关系'}[modal]||''} onClose={()=>setModal('')}>
 {modal==='idea'||modal==='edit-idea'?<div className="stack"><label>卡片类型<select disabled={modal==='edit-idea'&&!!selectedIdea?.summary} value={ideaType} onChange={e=>setIdeaType(e.target.value as keyof typeof ideaLabels)}>{Object.entries(ideaLabels).filter(([v])=>v!=='summary'||!!selectedIdea?.summary&&modal==='edit-idea').map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>卡片标题<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="写下一个问题、观点或待办事项"/></label><label>内容<textarea rows={6} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={!title.trim()||readonly} onClick={()=>{let created:BoardNode|undefined;const editing=modal==='edit-idea';if(apply(d=>{if(editing&&selectedIdea){Object.assign(d.ideas.find(i=>i.id===selectedIdea.id)!,{title:title.trim(),body:reason,type:ideaType});}else{const id=uid('idea');d.ideas.push({id,projectId:pid,title:title.trim(),body:reason,type:ideaType,isDemo:false});placeNode(d,pid,{kind:'idea',id});created=d.boardNodes.find(n=>n.ref.id===id);if(created)Object.assign(created,freeCardPosition(renderedNodes));}})){setModal('');if(created)locate(created);}}}>{modal==='edit-idea'?'保存修改':'创建并放置'}</button></div>:modal==='group'?<div className="stack"><p>将 {selected.length} 个选中节点加入组，不复制原始材料。</p><label>组名<input value={title} onChange={e=>setTitle(e.target.value)}/></label><button disabled={!title.trim()||readonly} onClick={()=>{if(apply(d=>{const id=uid('group');d.groups.push({id,projectId:pid,title,memberRefs:nodes.filter(n=>selected.includes(n.id)).map(n=>n.ref),sourceCollectionId:null,sourceCollectionRevision:null});d.boardNodes.filter(n=>selected.includes(n.id)).forEach(n=>n.groupId=id)}))setModal('')}}>确认分组</button></div>:<div className="stack"><p>{modal==='remove-node'?'只移除选中节点及其可视连线。项目文件、资料原件、笔记与研究关系保留，可撤销。':modal==='remove-member'?'移除项目引用及对应摆放，相关关系失效、计划引用标待复核；个人资料和原件保留。':'删除这条研究关系及其所有可视绑定。资料保留，可撤销。'}</p><button autoFocus onClick={()=>setModal('')}>取消</button><button disabled={readonly} onClick={()=>{if(apply(d=>{if(modal==='remove-node'){d.boardNodes=d.boardNodes.filter(n=>!selected.includes(n.id));d.edgeBindings=d.edgeBindings.filter(e=>!selected.includes(e.sourceNodeId)&&!selected.includes(e.targetNodeId));}else if(modal==='remove-member'){const m=d.projectMembers.find(m=>m.id===removeId);if(!m)return;const ids=d.boardNodes.filter(n=>n.projectId===pid&&n.ref.id===m.ref.id).map(n=>n.id);d.projectMembers=d.projectMembers.filter(m=>m.id!==removeId);d.boardNodes=d.boardNodes.filter(n=>!ids.includes(n.id));d.edgeBindings=d.edgeBindings.filter(e=>!ids.includes(e.sourceNodeId)&&!ids.includes(e.targetNodeId));d.relations.filter(r=>r.projectId===pid&&(r.from.id===m.ref.id||r.to.id===m.ref.id)).forEach(r=>r.state='inactive');const plan=d.researchPlans.find(p=>p.projectId===pid);if(plan)Object.values(plan.sections).filter(s=>s.refs.some(r=>r.id===m.ref.id)).forEach(s=>s.needsReview=true);}else{d.relations=d.relations.filter(r=>r.id!==removeId);d.edgeBindings=d.edgeBindings.filter(e=>e.relationId!==removeId);}})){setModal('');setSelected([]);setMode('overview')}}}>确认{modal==='remove-node'?'仅移除摆放':modal==='remove-member'?'移出项目':'删除关系'}</button></div>}
 </Modal>}
 <div className="group-list">{data.groups.filter(g=>g.projectId===pid).map(g=>{const c=data.collections.find(c=>c.id===g.sourceCollectionId);return <div className="row" key={g.id}><span>组：{g.title} · {g.memberRefs.length} 项</span>{c&&c.revision!==g.sourceCollectionRevision&&<><strong>收藏夹已有变更，未同步</strong><button disabled={readonly} onClick={()=>apply(d=>{const a=d.groups.find(x=>x.id===g.id)!;addMembers(d,pid,c.members);a.memberRefs=structuredClone(c.members);a.sourceCollectionRevision=c.revision;})}>确认同步当前成员</button></>}<button disabled={readonly} onClick={()=>apply(d=>{d.groups=d.groups.filter(x=>x.id!==g.id);d.boardNodes.filter(n=>n.groupId===g.id).forEach(n=>n.groupId=null)})}>解组（保留材料）</button></div>})}</div>
 </div>;
}
function historyReplace(url:string){window.history.replaceState({},'',browserHref(url));}


