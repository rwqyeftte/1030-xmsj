import {videoAnchorLabel} from './video-annotations';
import {currentLocation} from './routing';
import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import seed from '../contracts/fixtures.json';
import cases from '../contracts/review_cases.json';
import type {AppData, ObjectRef, SourceAnchor, MediaType} from '../contracts/domain';
import {Modal, Link} from './ui';
import {resourceTitle,projectTitle} from './presentation';
import {upgradeDemoSearchExample} from './query-presets';
import {upgradeDemoReadingExample} from './reader-example';

export const STORAGE_KEY = 'literature-center:v1:data';
export const mediaLabels: Record<MediaType,string> = {book:'图书',article:'文章',image:'图片',video:'视频'};
export const uid = (prefix='id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
export function assertWritable(d:AppData, id:string) {
  const p=d.projects.find(x=>x.id===id);
  if(!p || p.ownerId!==d.session.userId) throw new Error('目标项目不存在或不可访问。');
  if(p.status==='archived') throw new Error('项目已归档，只读。请在工作台明确恢复后再修改。');
  return p;
}
export function canRead(d:AppData, ref:ObjectRef) {
  if(ref.kind==='resource') {const r=d.resources.find(x=>x.id===ref.id);return !!r && (r.visibility==='public'||r.ownerId===d.session.userId);}
  if(ref.kind==='note') return d.notes.some(x=>x.id===ref.id&&x.ownerId===d.session.userId);
  return d.ideas.some(x=>x.id===ref.id&&d.projects.some(p=>p.id===x.projectId&&p.ownerId===d.session.userId));
}
export function addMembers(d:AppData, pid:string, refs:ObjectRef[]) {
  const p=assertWritable(d,pid);
  for(const ref of refs) {
    if(!canRead(d,ref)) throw new Error('所选对象已失效或无权限，未提交本次操作。');
    if(!d.projectMembers.some(m=>m.projectId===pid&&m.ref.kind===ref.kind&&m.ref.id===ref.id)) d.projectMembers.push({id:uid('member'),projectId:pid,ref:{...ref},selection:'candidate',reading:'unread',reason:''});
  }
  p.updatedAt=new Date().toISOString();
}
export function placeNode(d:AppData,pid:string,ref:ObjectRef) {
  addMembers(d,pid,[ref]);
  const existing=d.boardNodes.find(n=>n.projectId===pid&&n.ref.kind===ref.kind&&n.ref.id===ref.id);
  if(existing) return existing;
  const count=d.boardNodes.filter(n=>n.projectId===pid).length;
  const node={id:uid('node'),projectId:pid,ref:{...ref},x:60+(count%3)*290,y:60+Math.floor(count/3)*210,width:260,height:160,groupId:null};
  d.boardNodes.push(node);return node;
}
export function anchorLabel(a:SourceAnchor) {
  if(a.kind==='text') return a.endParagraphId&&a.endParagraphId!==a.paragraphId?`选文 ${a.paragraphId} — ${a.endParagraphId}`:`选文 ${a.paragraphId}`;
  if(a.kind==='image') return `图像选区 (${Math.round(a.x*100)}%, ${Math.round(a.y*100)}%) · ${Math.round(a.width*100)}% × ${Math.round(a.height*100)}%`;
  if(a.kind==='video') return (a.point?'时间点 ':'时间片段 ')+videoAnchorLabel(a);
  return a.label;
}
export function download(name:string,body:string,type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export function makeReviewData(id:string):AppData {
  const d=structuredClone(seed) as AppData;
  const [page,state]=id.split('__');
  if(state==='guest') d.session.userId=null;
  if(state==='empty-projects'||(page==='P13'&&state==='empty')) {d.projects=[];d.projectMembers=[];d.boardNodes=[];d.researchPlans=[];}
  if(page==='P10'&&state==='empty') {d.personalSaves=[];d.collections=[];d.resources=d.resources.filter(r=>r.ownerId!==d.session.userId);}
  if(page==='P10'&&state==='folder-empty') d.collections.forEach(c=>c.members=[]);
  if(page==='P11'&&state==='empty') d.notes=[];
  if(page==='P14'&&['empty','members-unplaced'].includes(state)) {
    d.boardNodes=d.boardNodes.filter(x=>x.projectId!=='project-demo-01');d.edgeBindings=[];
    if(state==='empty') {d.projectMembers=d.projectMembers.filter(x=>x.projectId!=='project-demo-01');d.groups=[];d.relations=[];}
  }
  if(page==='P15'&&state==='empty') d.researchPlans.filter(p=>p.projectId==='project-demo-01').forEach(p=>Object.values(p.sections).forEach(s=>{s.body='';s.refs=[];}));
  if(state==='read-only'||state==='target-read-only') d.projects.find(x=>x.id==='project-demo-01')!.status='archived';
  if(state==='restricted') {const r=d.resources.find(x=>x.id==='I05');if(r) r.access='restricted';}
  if(state==='source-missing') {
    if(page==='P07') {const r=d.resources.find(x=>x.id==='I05');if(r){r.contentId=null;r.access='metadata_only';r.availabilityNote='来源失效（隔离评审），仍保留目录身份与原来源记录。';}}
    else {d.contents=d.contents.filter(x=>x.resourceId!=='DEMO-TEXT'); const r=d.resources.find(x=>x.id==='DEMO-TEXT');if(r){r.contentId=null;r.access='metadata_only';r.availabilityNote='来源已失效（隔离评审），仅保留目录和来源锚点。';}}
  }
  if(state==='anchor-invalid') d.anchors.forEach(a=>a.resourceVersionId='invalid-version');
  if(state==='shared-impact') d.projectMembers.push({id:'review-shared-note',projectId:'project-empty',ref:{kind:'note',id:'note-demo-01',revision:1},selection:'included',reading:'read',reason:'评审：同一笔记用于两个项目'});
  if(page==='P09'&&state==='one-unavailable') {d.contents=d.contents.filter(x=>x.resourceId!=='DEMO-IMAGE');d.resources.find(x=>x.id==='DEMO-IMAGE')!.contentId=null;}
  if(page==='P06'&&['partial-access','bulk-partial'].includes(state)) d.resources.find(x=>x.id==='I05')!.access='restricted';
  if(page==='P04'&&state==='stale-resource') {const r=d.resources.find(x=>x.id==='DEMO-IMAGE')!;r.contentId=null;r.access='metadata_only';r.availabilityNote='推荐来源当前已失效（隔离评审）；可保留目录，不能阅读原件。';}
  if(page==='P12'&&state==='independent') {const n=d.notes.find(x=>x.id==='note-demo-01')!;n.type='independent';n.revisions.forEach(r=>r.anchorIds=[]);n.title='尚待核查的研究想法（演示）';}
  if(page==='P13'&&state==='empty-project') d.projects=d.projects.filter(p=>p.id==='project-empty');
  if(page==='P16'&&['selected','review','duplicate','partial','storage-error','target-read-only'].includes(state)) d.importJobs.push({id:'review-import-text',targetProjectId:'project-demo-01',state:state==='selected'?'selected':'review',fileName:'合成演示导入.txt',blobKey:null,resourceId:null,error:null,recognitionIsMock:true});
  if(page==='P16'&&['partial','unsupported'].includes(state)) d.importJobs.push({id:'review-import-unsupported',targetProjectId:'project-demo-01',state:'failed',fileName:'未支持格式.pdf',blobKey:null,resourceId:null,error:'本地原型没有 PDF 解析能力，请转换为 TXT，或手工记录元数据。',recognitionIsMock:false});
  return d;
}
export function guardArchived(before:AppData,after:AppData) {
  const tables=['projectMembers','ideas','boardNodes','groups','relations','researchPlans'] as const;
  before.projects.filter(p=>p.status==='archived'&&after.projects.find(x=>x.id===p.id)?.status==='archived').forEach(p=>{
    for(const table of tables) if(JSON.stringify(before[table].filter(x=>x.projectId===p.id))!==JSON.stringify(after[table].filter(x=>x.projectId===p.id))) throw new Error('归档项目只读；此次修改未保存。');
  });
}
export function commitData(before:AppData,recipe:(draft:AppData)=>void,persist:(serialized:string)=>void):AppData {
  const draft=structuredClone(before);recipe(draft);guardArchived(before,draft);persist(JSON.stringify(draft));return draft;
}
type Ctx={data:AppData;commit:(recipe:(draft:AppData)=>void,message?:string)=>boolean;status:string;error:string;notify:(msg:string)=>void;requireLogin:(action:()=>void)=>void;openProjectPicker:(refs:ObjectRef[])=>void;saveResource:(id:string)=>void;openCollectionPicker:(refs:ObjectRef[])=>void;review:string;reviewId:string;reviewState:string;reset:()=>void};
const Context=createContext<Ctx|null>(null);
export const useApp=()=>{const x=useContext(Context);if(!x)throw new Error('AppProvider is required');return x;};
export function AppProvider({children}:{children:React.ReactNode}) {
  const initialReview=new URLSearchParams(currentLocation().search).get('review')||'';
  const [reviewId,setReviewId]=useState(initialReview);const review=reviewId.split('__')[1]||'';
  const [data,setData]=useState<AppData>(()=>load(initialReview));const current=useRef(data);current.current=data;
  const [status,setStatus]=useState('idle');const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [login,setLogin]=useState(false);const pending=useRef<null|(()=>void)>(null);
  const [picker,setPicker]=useState<{type:'project'|'collection';refs:ObjectRef[]}|null>(null);
  const [target,setTarget]=useState('');const [newName,setNewName]=useState('');const [alsoPlace,setAlsoPlace]=useState(false);const [localError,setLocalError]=useState('');
  const serialized=useRef('');
  function load(id:string):AppData {
    try {const store=id?sessionStorage:localStorage;const raw=store.getItem(id?`${STORAGE_KEY}:review:${id}`:STORAGE_KEY);if(raw){const parsed=JSON.parse(raw);if(parsed.schemaVersion===1&&Array.isArray(parsed.resources)){
      if(id)return parsed;
      const next=upgradeDemoReadingExample(upgradeDemoSearchExample(parsed));
      if(next!==parsed){try{store.setItem(STORAGE_KEY,JSON.stringify(next));}catch{return parsed;}}
      return next;
    }}}
    catch{/* A readable seed remains available when browser storage is disabled. A write reports the error. */}
    return id?makeReviewData(id):structuredClone(seed) as AppData;
  }
  useEffect(()=>{serialized.current=JSON.stringify(data);},[data]);
  useEffect(()=>{const fn=()=>{const id=new URLSearchParams(currentLocation().search).get('review')||'';setReviewId(prev=>{if(prev!==id){const next=load(id);current.current=next;setData(next);setError('');setStatus('idle');setPicker(null);setLogin(false);}return id;});};window.addEventListener('popstate',fn);window.addEventListener('hashchange',fn);return()=>{window.removeEventListener('popstate',fn);window.removeEventListener('hashchange',fn);};},[]);
  useEffect(()=>{const fn=(e:StorageEvent)=>{if(!reviewId&&e.key===STORAGE_KEY&&e.newValue!==serialized.current){setError('另一标签页更新了本地数据。为避免覆盖，请先导出当前草稿，然后刷新读取最新版本。');setStatus('conflict');}};window.addEventListener('storage',fn);return()=>window.removeEventListener('storage',fn);},[reviewId]);
  const commit=(recipe:(d:AppData)=>void,message='已保存在本机')=>{
    try {
      if(status==='conflict') throw new Error('检测到另一标签页的新版本；请导出草稿并刷新，避免静默覆盖。');
      const draft=structuredClone(current.current);recipe(draft);guardArchived(current.current,draft);
      if(['save-error','storage-error'].includes(review))throw new Error('模拟存储失败：本次提交未保存。草稿仍保留，可重试或导出草稿。');
      const raw=JSON.stringify(draft);(reviewId?sessionStorage:localStorage).setItem(reviewId?`${STORAGE_KEY}:review:${reviewId}`:STORAGE_KEY,raw);
      current.current=draft;serialized.current=raw;setData(draft);setStatus('saved');setError('');setNotice(message);return true;
    } catch(e) {setNotice('');setError(e instanceof Error?e.message:'保存失败，草稿未丢弃。');setStatus('error');return false;}
  };
  const requireLogin=(action:()=>void)=>{if(current.current.session.userId)action();else{pending.current=action;setLogin(true);}};
  const openPicker=(type:'project'|'collection',refs:ObjectRef[])=>requireLogin(()=>{setPicker({type,refs});const qs=new URLSearchParams(currentLocation().search);setTarget(type==='project'?(qs.get('targetProjectId')||qs.get('projectId')||current.current.projects.find(p=>p.status==='active')?.id||''):(current.current.collections[0]?.id||''));setNewName('');setAlsoPlace(false);setLocalError('');});
  const saveResource=(id:string)=>requireLogin(()=>commit(d=>{if(!canRead(d,{kind:'resource',id}))throw new Error('资料不可访问。');if(!d.personalSaves.some(s=>s.userId===d.session.userId&&s.resourceId===id))d.personalSaves.push({userId:d.session.userId!,resourceId:id,savedAt:new Date().toISOString()});},'资料已保存到“全部资料”；尚未加入收藏夹或项目。'));
  const reset=async()=>{
    if(!window.confirm('重置本应用演示资料、笔记、项目和草稿？只清理文献研究中心的存储，不影响其他网站和原始任务文件。'))return;
    try {await new Promise<void>((resolve,reject)=>{const req=indexedDB.deleteDatabase('literature-center-imports-v1');req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error||new Error('本地文件仓库重置失败'));req.onblocked=()=>reject(new Error('本地文件仓库仍被其他标签页使用，请关闭其他标签页后重试。'));});for(const storage of [localStorage,sessionStorage]){Object.keys(storage).filter(k=>k.startsWith('literature-center:')).forEach(k=>storage.removeItem(k));}const next=reviewId?makeReviewData(reviewId):structuredClone(seed) as AppData;current.current=next;setData(next);setStatus('idle');setError('');setNotice('已重置本应用演示数据。');}catch(e){setError(String(e));}
  };
  const confirmPicker=()=>{
    if(!picker)return;if(!target&&!newName.trim()){setLocalError('请选择目标或输入新名称。');return;}
    let pid=target;let added=0;let existing=0;
    const ok=commit(d=>{
      if(newName.trim()) {pid=uid(picker.type);if(picker.type==='project'){d.projects.push({id:pid,ownerId:d.session.userId!,title:newName.trim(),question:'',status:'active',updatedAt:new Date().toISOString(),isDemo:true});d.boardViews.push({projectId:pid,x:0,y:0,zoom:1,selectedNodeIds:[],mode:'overview',view:'board'});}else d.collections.push({id:pid,ownerId:d.session.userId!,title:newName.trim(),description:'',members:[],revision:1});}
      if(picker.type==='project') {existing=picker.refs.filter(ref=>d.projectMembers.some(m=>m.projectId===pid&&m.ref.id===ref.id&&m.ref.kind===ref.kind)).length;addMembers(d,pid,picker.refs);if(alsoPlace)picker.refs.forEach(ref=>placeNode(d,pid,ref));}
      else {const c=d.collections.find(x=>x.id===pid&&x.ownerId===d.session.userId);if(!c)throw new Error('收藏夹不可访问');for(const ref of picker.refs){if(!canRead(d,ref))throw new Error('所选资料已失效');if(c.members.some(m=>m.id===ref.id&&m.kind===ref.kind))existing++;else c.members.push({...ref});}c.revision++;}
      added=picker.refs.length-existing;
    });
    if(ok){setNotice(`${picker.type==='project'?'项目':'收藏夹'}：新增 ${added} 项，已有 ${existing} 项。${picker.type==='project'&&!alsoPlace?'资料已进入项目文件，尚未新增画布摆放。':''}`);setPicker(null);}
  };
  const value:Ctx={data,commit,status,error,notify:setNotice,requireLogin,openProjectPicker:refs=>openPicker('project',refs),saveResource,openCollectionPicker:refs=>openPicker('collection',refs),review:reviewId,reviewId,reviewState:review,reset};
  return <Context.Provider value={value}>{children}
    {reviewId&&!cases.cases.some(c=>c.id===reviewId)&&<div className="notice" role="alert">无法识别评审状态“{reviewId}”。当前使用隔离演示数据，不影响默认保存。<Link to="/__review">返回评审目录选择有效状态</Link></div>}
    {notice&&<div className="app-toast" role="status"><span>{notice}</span><button aria-label="关闭反馈" onClick={()=>setNotice('')}>×</button></div>}
    {error&&<div className="persistence-error" role="alert"><strong>未保存</strong> · {error}<button onClick={()=>download('文献研究中心_当前已存数据.json',JSON.stringify(current.current,null,2),'application/json')}>导出已存数据</button><button aria-label="关闭保存错误" onClick={()=>setError('')}>×</button></div>}
    {login&&<Modal title="本地演示登录" onClose={()=>{pending.current=null;setLogin(false);}}><p>只建立本机演示会话，不需要密码，不连接账号服务。前端演示不是生产权限系统。</p><div className="actions"><button onClick={()=>{pending.current=null;setLogin(false);}}>取消并保留当前内容</button><button className="primary" onClick={()=>{const action=pending.current;if(commit(d=>{d.session.userId='demo-user';},'已进入本地演示会话')){pending.current=null;setLogin(false);action?.();}}}>进入演示并继续</button></div></Modal>}
    {picker&&<Modal title={picker.type==='project'?'加入项目':'加入收藏夹'} onClose={()=>setPicker(null)}><div data-testid="project-picker"><p>选中 {picker.refs.length} 项。引用原记录，不复制原件。{picker.type==='project'?'默认仅加入项目文件栏。':''}</p><label>选择{picker.type==='project'?'项目':'收藏夹'}<select value={target} onChange={e=>{setTarget(e.target.value);setNewName('');}}><option value="">请选择</option>{picker.type==='project'?data.projects.filter(p=>p.ownerId===data.session.userId).map(p=><option key={p.id} value={p.id} disabled={p.status==='archived'}>{projectTitle(p)}{p.status==='archived'?'（归档只读）':''}</option>):data.collections.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label>或新建{picker.type==='project'?'项目':'收藏夹'}<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="名称（必填）"/></label>{picker.type==='project'&&<label className="check"><input type="checkbox" checked={alsoPlace} onChange={e=>setAlsoPlace(e.target.checked)}/>同时放到工作版（可选）</label>}<div className="picker-summary">{picker.refs.map(ref=>{const r=ref.kind==='resource'?data.resources.find(r=>r.id===ref.id):data.notes.find(r=>r.id===ref.id);const exists=picker.type==='project'?data.projectMembers.some(m=>m.projectId===target&&m.ref.id===ref.id&&m.ref.kind===ref.kind):data.collections.find(c=>c.id===target)?.members.some(m=>m.id===ref.id&&m.kind===ref.kind);return <p key={`${ref.kind}:${ref.id}`}>{r?resourceTitle(r):ref.id} <span className="badge">{exists?'已存在，不重复添加':ref.kind==='resource'&&data.resources.find(r=>r.id===ref.id)?.access!=='demo_readable'?'新增目录引用':'新增引用'}</span></p>;})}</div>{localError&&<p role="alert">{localError}</p>}{error&&<p role="alert">{error}</p>}<div className="actions"><button onClick={()=>setPicker(null)}>取消</button><button className="primary" onClick={confirmPicker}>确认加入</button></div><small>归档项目只读。<Link to="/me/projects">前往工作台管理项目</Link></small></div></Modal>}
  </Context.Provider>;
}
export const reviewCases=cases;
