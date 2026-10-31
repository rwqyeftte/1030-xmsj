import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {SourceAnchor} from '../contracts/domain';
import {useApp,uid,addMembers,download} from './store';
import {Link,useDraft,useQuery} from './ui';
import {videoNotes,validVideoAnchor,videoAnchorLabel,hasDemoVideo,type VideoAnchor} from './video-annotations';
import {projectTitle,resourceTitle} from './presentation';

export default function VideoNotes({resourceId,projectId,anchor,onSelect}:{resourceId:string;projectId?:string|null;anchor:SourceAnchor|null;onSelect?:(a:SourceAnchor|null)=>void}){
  const {data,commit,requireLogin,error,review}=useApp(),query=useQuery();
  const resource=data.resources.find(r=>r.id===resourceId)!,content=data.contents.find(c=>c.id===resource.contentId);
  const notes=videoNotes(data,resourceId),project=data.projects.find(p=>p.id===projectId),readonly=project?.status==='archived';
  const canRead=hasDemoVideo(resource,content)&&!review.includes('source-missing');
  const [draft,setDraft,clear]=useDraft('reader-note:'+resourceId,{title:'',body:'',type:'observation',anchor:null as SourceAnchor|null,ai:false});
  const [viewed,setViewed]=useState<string|null>(null),[saved,setSaved]=useState(''),[localError,setLocalError]=useState('');
  const body=useRef<HTMLTextAreaElement>(null),panel=useRef<HTMLDivElement>(null);
  const valid=(a:SourceAnchor|null):a is VideoAnchor=>!!a&&a.kind==='video'&&a.resourceId===resourceId&&a.resourceVersionId===resource.versionId&&content?.kind==='video_timeline'&&validVideoAnchor(a,content.durationSec);
  const selected=valid(anchor)?anchor:null,area=valid(draft.anchor)?draft.anchor:null;
  const current=notes.find(item=>item.note.id===viewed);
  useEffect(()=>{if(!query.get('anchorId')&&(!anchor||anchor.resourceId!==resourceId)&&area)onSelect?.(area);},[resourceId]);
  useLayoutEffect(()=>{
    if(!selected)return;
    const existing=notes.find(item=>item.anchor.id===selected.id);
    if(existing){setViewed(id=>notes.some(item=>item.note.id===id&&item.anchor.id===selected.id)?id:existing.note.id);panel.current?.closest('aside')?.scrollTo({top:0});return;}
    setViewed(null);setSaved('');setLocalError('');setDraft(d=>({...d,anchor:selected}));
    requestAnimationFrame(()=>{body.current?.focus({preventScroll:true});body.current?.scrollIntoView({block:'nearest'});});
  },[selected?.id]);
  function save(){
    setLocalError('');if(!draft.body.trim()){setLocalError('写下笔记内容后再保存。');body.current?.focus();return;}
    if(!area||!canRead){setLocalError('请先在视频中选择一个时间点或片段。');return;}
    requireLogin(()=>{
      const id=uid('note');
      if(commit(d=>{
        if(readonly)throw Error('项目已归档，不能添加笔记。');
        if(!d.anchors.some(a=>a.id===area.id))d.anchors.push(area);
        d.notes.push({id,ownerId:d.session.userId!,originProjectId:projectId||null,title:draft.title.trim()||Array.from(draft.body.trim()).slice(0,24).join(''),type:'observation',currentRevision:1,revisions:[{revision:1,body:draft.body.trim(),anchorIds:[area.id],aiAssisted:draft.ai,createdAt:new Date().toISOString()}],relatedNoteIds:[]});
        if(projectId)addMembers(d,projectId,[{kind:'note',id,revision:1}]);
      },'视频笔记已保存')){setDraft({title:'',body:'',type:'observation',anchor:null,ai:false});clear();setViewed(id);setSaved(id);onSelect?.({...area});}
    });
  }
  function resume(){setViewed(null);setSaved('');onSelect?.(area);}
  const location=(a:VideoAnchor)=>onSelect?<button className="video-time-link" onClick={()=>onSelect({...a})} aria-label={'返回视频 '+videoAnchorLabel(a)}>{videoAnchorLabel(a)} ↗</button>:data.anchors.some(item=>item.id===a.id)?<Link to={'/resources/'+resourceId+'/read?anchorId='+a.id+(projectId?'&projectId='+projectId:'')}>{videoAnchorLabel(a)} ↗</Link>:<span>{videoAnchorLabel(a)}</span>;
  return <div ref={panel} className="video-notes-panel">
    <div className="video-notes-heading"><h2>视频笔记</h2><Link to="/me/notes">全部笔记 →</Link></div>
    <p className="muted video-note-destination">保存到个人笔记{project?' · 同时加入「'+projectTitle(project)+'」':''}</p>
    {current?<section className="video-selected-note" aria-label="当前视频笔记">
      {saved===current.note.id&&<p className="video-save-success" role="status">已保存到个人笔记</p>}
      {location(current.anchor)}{current.note.title!==current.revision.body&&<h3>{current.note.title}</h3>}<p className="video-note-body">{current.revision.body}</p>
      <div className="row"><Link className="button" to={'/me/notes/'+current.note.id+(projectId?'?projectId='+projectId:'')}>查看与编辑笔记</Link><button onClick={resume}>{draft.body||draft.title?'继续未保存笔记':'添加下一条'}</button></div>
    </section>:<section className="video-note-compose stack" data-testid="note-editor">
      {area?<div className="video-note-selection"><span>{area.point?'关联时间':'关联片段'}</span>{location(area)}</div>:canRead?<p className="video-note-empty">播放到想记录的位置，点击“记笔记”。</p>:null}
      {(area||draft.body||draft.title)&&<><label>笔记内容<textarea ref={body} aria-label="笔记内容" placeholder="记下这一刻的重点、想法或疑问…" rows={5} value={draft.body} onChange={e=>{setDraft(d=>({...d,body:e.target.value}));setLocalError('');}}/></label><label>标题（选填）<input aria-label="笔记标题" placeholder="留空时使用笔记内容作为标题" value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><button className="primary" disabled={readonly||!area||!canRead} onClick={save}>保存笔记</button>{draft.body&&<small className="muted">尚未保存</small>}</>}
      {(localError||error)&&<div className="error" role="alert"><p>{localError||error} 内容仍保留，可修改后重试。</p>{error&&draft.body&&<button onClick={()=>download('视频笔记草稿.json',JSON.stringify({resource:resourceTitle(resource),...draft},null,2),'application/json;charset=utf-8')}>备份未保存笔记</button>}</div>}
      {readonly&&<p className="muted">项目已归档，当前只可查看。</p>}
      {!canRead&&<p className="muted">视频当前不可读，已有笔记仍可在个人笔记中查看。</p>}
    </section>}
    <section className="video-note-list" aria-label="这个视频的笔记"><h3>这个视频的笔记 <span>{notes.length}</span></h3>{notes.length===0?<p className="muted">保存后按时间排列，点击笔记即可回看。</p>:notes.map(item=><button className={viewed===item.note.id?'video-note-item selected':'video-note-item'} key={item.note.id} onClick={()=>{setViewed(item.note.id);setSaved('');onSelect?.({...item.anchor});}}><time>{videoAnchorLabel(item.anchor)}</time><strong>{item.note.title}</strong>{item.note.title!==item.revision.body&&<small>{item.revision.body}</small>}</button>)}</section>
  </div>;
}
