import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {SourceAnchor} from '../contracts/domain';
import {useApp,uid,addMembers,download} from './store';
import {Link,useDraft,useQuery} from './ui';
import {imageNotes,validImageBox} from './image-annotations';
import {ImageCrop} from './ImageReader';
import {useImageSource} from './image-source';
import {projectTitle,resourceTitle} from './presentation';

export default function ImageNotes({resourceId,projectId,anchor,onSelect}:{resourceId:string;projectId?:string|null;anchor:SourceAnchor|null;onSelect?:(a:SourceAnchor|null)=>void}){
  const {data,commit,requireLogin,error,review}=useApp(),query=useQuery();
  const resource=data.resources.find(r=>r.id===resourceId)!,content=data.contents.find(c=>c.resourceId===resourceId);
  const source=useImageSource(resourceId),notes=imageNotes(data,resourceId);
  const [draft,setDraft,clear]=useDraft('reader-note:'+resourceId,{title:'',body:'',type:'observation',anchor:null as SourceAnchor|null,ai:false});
  const [viewed,setViewed]=useState<string|null>(null),[saved,setSaved]=useState(''),[localError,setLocalError]=useState('');
  const body=useRef<HTMLTextAreaElement>(null),panel=useRef<HTMLDivElement>(null),previous=useRef<string|null>(null);
  const project=data.projects.find(p=>p.id===projectId),readonly=project?.status==='archived';
  const canRead=content?.kind==='image'&&content.versionId===resource.versionId&&resource.access==='demo_readable'&&!review.includes('source-missing')&&!source.missing&&!source.loading;
  const selected=anchor?.kind==='image'&&anchor.resourceId===resourceId&&anchor.resourceVersionId===resource.versionId&&validImageBox(anchor)?anchor:null;
  const area=draft.anchor?.kind==='image'&&draft.anchor.resourceId===resourceId&&draft.anchor.resourceVersionId===resource.versionId&&validImageBox(draft.anchor)?draft.anchor:null;
  const current=notes.find(item=>item.note.id===viewed);
  useLayoutEffect(()=>{if(viewed)panel.current?.closest('aside')?.scrollTo({top:0});},[viewed]);
  useEffect(()=>{if(!query.get('anchorId')&&(!anchor||anchor.resourceId!==resourceId)&&draft.anchor)onSelect?.(draft.anchor);},[resourceId]);
  useLayoutEffect(()=>{
    if(!selected)return;
    const existing=notes.find(item=>item.anchor.id===selected.id);
    if(existing){setViewed(id=>notes.some(item=>item.note.id===id&&item.anchor.id===selected.id)?id:existing.note.id);return;}
    const first=!previous.current;previous.current=selected.id;
    setViewed(null);setSaved('');setLocalError('');setDraft(d=>({...d,anchor:selected}));
    const keyboardSelection=document.activeElement?.hasAttribute('data-keyboard-selection')||document.activeElement?.closest('[data-handle]');
    if(first&&!keyboardSelection)requestAnimationFrame(()=>{body.current?.focus({preventScroll:true});body.current?.scrollIntoView({block:'nearest'});});
  },[selected?.id]);
  function save(){
    setLocalError('');if(!draft.body.trim()){setLocalError('写下笔记内容后再保存。');body.current?.focus();return;}
    if(!area||!canRead){setLocalError('请先选择可读图片中的区域，或选择整张图片。');return;}
    requireLogin(()=>{
      const id=uid('note');
      if(commit(d=>{
        if(readonly)throw Error('项目已归档，不能添加笔记。');
        if(!d.anchors.some(a=>a.id===area.id))d.anchors.push(area);
        d.notes.push({id,ownerId:d.session.userId!,originProjectId:projectId||null,title:draft.title.trim()||Array.from(draft.body.trim()).slice(0,24).join(''),type:'observation',currentRevision:1,revisions:[{revision:1,body:draft.body.trim(),anchorIds:[area.id],aiAssisted:draft.ai,createdAt:new Date().toISOString()}],relatedNoteIds:[]});
        if(projectId)addMembers(d,projectId,[{kind:'note',id,revision:1}]);
      },'图片笔记已保存')){
        setDraft({title:'',body:'',type:'observation',anchor:null,ai:false});clear();setViewed(id);setSaved(id);previous.current=null;onSelect?.(area);
      }
    });
  }
  function resume(){setViewed(null);setSaved('');previous.current=null;onSelect?.(area);}
  const whole=(b:typeof area)=>b&&b.x===0&&b.y===0&&b.width===1&&b.height===1;
  return <div ref={panel} className="image-notes-panel">
    <div className="image-notes-heading"><h2>图片笔记</h2><Link to="/me/notes">全部笔记 →</Link></div>
    <p className="muted image-note-destination">保存到个人笔记{project?' · 同时加入「'+projectTitle(project)+'」':''}</p>
    {current?<section className="image-selected-note" aria-label="当前图片笔记">
      {saved===current.note.id&&<p className="image-save-success" role="status">已保存到个人笔记</p>}
      {content?.kind==='image'&&canRead&&<ImageCrop content={content} blobUrl={source.url} box={current.anchor}/>}
      <h3>{current.note.title}</h3><p className="image-note-body">{current.revision.body}</p>
      <div className="row"><Link className="button" to={'/me/notes/'+current.note.id+(projectId?'?projectId='+projectId:'')}>查看与编辑笔记</Link><button onClick={resume}>{draft.body||draft.title?'继续未保存笔记':'添加下一条'}</button></div>
    </section>:<section className="image-note-compose stack" data-testid="note-editor">
      {area&&content?.kind==='image'&&canRead?<div className="image-note-selection"><strong>{whole(area)?'整张图片':'已选区域'}</strong><ImageCrop content={content} blobUrl={source.url} box={area}/></div>:<p className="image-note-empty">先在图片上框选一个区域，或点击“整图记笔记”。</p>}
      {(area||draft.body||draft.title)&&<><label>笔记内容<textarea ref={body} aria-label="笔记内容" placeholder="记下你对这处图片的观察或疑问…" rows={5} value={draft.body} onChange={e=>{setDraft(d=>({...d,body:e.target.value}));setLocalError('');}}/></label><label>标题（选填）<input aria-label="笔记标题" placeholder="留空时使用笔记内容作为标题" value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><button className="primary" disabled={readonly||!area||!canRead} onClick={save}>保存笔记</button><small className="muted">{draft.body?'尚未保存 · ':''}笔记关联所选区域，原图保持不变。</small></>}
      {(localError||error)&&<div className="error" role="alert"><p>{localError||error} 内容仍保留，可修改后重试。</p>{error&&draft.body&&<button onClick={()=>download('图片笔记草稿.json',JSON.stringify({resource:resourceTitle(resource),...draft},null,2),'application/json;charset=utf-8')}>备份未保存笔记</button>}</div>}
      {readonly&&<p className="muted">项目已归档，当前只可查看。</p>}
      {!canRead&&<p className="muted">{source.loading?'图片载入中…':'图片当前不可读，已有笔记仍可在个人笔记中查看。'}</p>}
    </section>}
    <section className="image-note-list" aria-label="这张图的笔记"><h3>这张图的笔记 <span>{notes.length}</span></h3>{notes.length===0?<p className="muted">保存后会显示在这里，点击可回到对应区域。</p>:notes.map((item,i)=><button className={viewed===item.note.id?'image-note-item selected':'image-note-item'} key={item.note.id} onClick={()=>{setViewed(item.note.id);setSaved('');onSelect?.({...item.anchor});}}><span className="image-note-number">{i+1}</span><span><strong>{item.note.title}</strong><small>{item.revision.body}</small></span></button>)}</section>
    <Link className="image-source-link" to={'/resources/'+resourceId}>查看「{resourceTitle(resource)}」资料详情 →</Link>
  </div>;
}
