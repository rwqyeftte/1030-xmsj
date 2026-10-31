import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {AppData,Idea} from '../contracts/domain';
import {Link,Modal} from './ui';
import {sourceBasis,summarySources} from './board-summary';

export function BoardCardMenu({x,y,selectedIds,connectedIds,readonly,onSummary,onPreview,onClose}:{x:number;y:number;selectedIds:string[];connectedIds:string[];readonly:boolean;onSummary:(ids:string[])=>void;onPreview:()=>void;onClose:()=>void}){
  const root=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const previous=document.activeElement as HTMLElement;root.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))close.current();};const dismiss=()=>close.current();window.addEventListener('pointerdown',outside,true);window.addEventListener('resize',dismiss);return()=>{window.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',dismiss);if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  return createPortal(<div ref={root} className="board-card-menu" role="menu" aria-label="卡片操作" style={{left:Math.max(8,Math.min(x,window.innerWidth-290)),top:Math.max(8,Math.min(y,window.innerHeight-230))}} onKeyDown={e=>{if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();onClose();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...root.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],i=items.indexOf(document.activeElement as HTMLButtonElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}}}>
    <p>卡片操作</p><button role="menuitem" onClick={onPreview}>查看卡片</button>
    <button role="menuitem" disabled={readonly||selectedIds.length<2} onClick={()=>onSummary(selectedIds)}>汇总所选 {selectedIds.length} 张卡片</button>
    <button role="menuitem" disabled={readonly||connectedIds.length<2} onClick={()=>onSummary(connectedIds)}>汇总相连的 {connectedIds.length} 张卡片</button>
    {(readonly||Math.max(selectedIds.length,connectedIds.length)<2)&&<small>{readonly?'归档项目只读':'按住 Shift 多选，或先连接两张卡片。'}</small>}
  </div>,document.body);
}

export function BoardSummaryDialog({data,projectId,nodeIds,onClose,onCreate,error,readonly}:{data:AppData;projectId:string;nodeIds:string[];onClose:()=>void;onCreate:(ids:string[],focus:string,title:string)=>boolean;error:string;readonly:boolean}){
  const sources=summarySources(data,projectId,nodeIds),[chosen,setChosen]=useState(nodeIds),[focus,setFocus]=useState(''),[title,setTitle]=useState('材料汇总'),[failed,setFailed]=useState(false);
  const chosenSources=summarySources(data,projectId,chosen);
  return <Modal title="生成汇总卡" onClose={onClose}><div className="stack board-summary-form">
    <p className="summary-method">本地内容整理 · 未连接 AI 模型</p>
    <label>汇总标题<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>关注的问题（可选）<textarea rows={2} value={focus} onChange={e=>setFocus(e.target.value)} placeholder="例如：这些材料对保温性能分别提供了什么信息？"/></label>
    <fieldset><legend>汇总来源 · 已选 {chosenSources.length} 张</legend>{sources.map((s,i)=>{const n=data.boardNodes.find(n=>nodeIds.includes(n.id)&&n.ref.kind===s.ref.kind&&n.ref.id===s.ref.id)!;return <label className="summary-source-choice" key={n.id}><input type="checkbox" checked={chosen.includes(n.id)} onChange={e=>setChosen(ids=>e.target.checked?[...ids,n.id]:ids.filter(id=>id!==n.id))}/><span>{s.title}<small>{sourceBasis[s.basis]}{s.basis==='metadata'?' · 没有全文':s.basis==='description'?' · 不识别画面':''}</small></span></label>;})}</fieldset>
    {sources.length<2&&<p role="alert">至少需要两张可访问的卡片。</p>}
    {failed&&<p role="alert" className="error">{error||'未能保存，请重试。'} 输入内容已保留。</p>}
    <p className="muted">整理已有文字、共同主题和连线理由；生成后可继续编辑，新卡片会保留来源链接。</p>
    <button className="primary" disabled={readonly||chosenSources.length<2||!title.trim()} onClick={()=>{if(!onCreate(chosen,focus,title))setFailed(true);}}>生成并放到画布</button>
  </div></Modal>;
}

export function SummaryProvenance({idea,data,projectId,onLocate}:{idea:Idea;data:AppData;projectId:string;onLocate:(id:string)=>void}){
  if(!idea.summary)return null;
  return <div className="summary-provenance"><p className="summary-method">本地内容整理 · 可编辑</p><h4>汇总来源（{idea.summary.sources.length}）</h4>{idea.summary.sources.map((s,i)=>{
    const n=data.boardNodes.find(n=>n.projectId===projectId&&n.ref.kind===s.ref.kind&&n.ref.id===s.ref.id);
    const resource=s.ref.kind==='resource'?data.resources.find(r=>r.id===s.ref.id&&(r.visibility==='public'||r.ownerId===data.session.userId)):null;
    const note=s.ref.kind==='note'?data.notes.find(n=>n.id===s.ref.id&&n.ownerId===data.session.userId):null;
    const changed=resource&&s.resourceVersionId!==resource.versionId||note&&s.ref.revision!==note.currentRevision;
    return <div className="summary-provenance-item" key={s.ref.kind+s.ref.id}><strong>[{i+1}] {s.title}</strong><small>{sourceBasis[s.basis]}{s.ref.revision?` · 笔记第 ${s.ref.revision} 版`:''}{changed?' · 来源有更新，本卡保留生成时内容':''}</small><div className="row">{n&&<button onClick={()=>onLocate(n.id)}>定位来源卡片</button>}{resource&&<Link to={'/resources/'+s.ref.id}>打开资料</Link>}{note&&<Link to={'/me/notes/'+s.ref.id+'?projectId='+projectId}>打开笔记</Link>}{!n&&!resource&&!note&&<span className="muted">来源已移出，保留生成时记录</span>}</div></div>;
  })}</div>;
}
