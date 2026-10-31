import {useState} from 'react';
import type {Resource} from '../contracts/domain';
import {useApp,mediaLabels} from './store';
import {resourceTitle} from './presentation';
import {Modal,contextUrl,nav} from './ui';

export default function ComparisonPicker({resource,projectId}:{resource:Resource;projectId?:string|null}) {
  const {data,review}=useApp();
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[selected,setSelected]=useState('');
  const readable=(r:Resource)=>r.access==='demo_readable'&&(r.visibility==='public'||r.ownerId===data.session.userId)&&data.contents.some(c=>c.id===r.contentId&&c.resourceId===r.id&&c.versionId===r.versionId);
  const currentReadable=readable(resource)&&!review.includes('source-missing');
  const candidates=data.resources.filter(r=>r.id!==resource.id&&readable(r));
  const term=query.trim().toLocaleLowerCase();
  const matches=candidates.filter(r=>[resourceTitle(r),r.id,...r.subjects].some(value=>value.toLocaleLowerCase().includes(term)));
  const chosen=matches.find(r=>r.id===selected);
  function compare(){
    if(!currentReadable||!chosen)return;
    const params=new URLSearchParams({left:resource.id,right:chosen.id});
    if(projectId)params.set('projectId',projectId);
    const destination=contextUrl('/compare?'+params.toString());
    setOpen(false);nav(destination);
  }
  return <><button disabled={!currentReadable} title={currentReadable?'选择另一份资料并排阅读':'当前资料没有可读内容，暂时无法对照'} onClick={()=>{setQuery('');setSelected('');setOpen(true);}}>文献对照</button>
    {open&&<Modal title="选择对照资料" onClose={()=>setOpen(false)}>
      <p>当前资料：<strong>{resourceTitle(resource)}</strong></p>
      <p className="muted">选择另一份资料，与当前资料并排阅读。</p>
      <label>查找对照资料<input value={query} onChange={e=>{setQuery(e.target.value);setSelected('');}} placeholder="输入题名、编号或主题" autoComplete="off"/></label>
      <fieldset className="comparison-options"><legend>可对照的资料</legend>
        {matches.map(r=><label key={r.id}><input type="radio" name="comparison-resource" value={r.id} checked={selected===r.id} onChange={()=>setSelected(r.id)}/><span><strong>{resourceTitle(r)}</strong><small>{mediaLabels[r.mediaType]} · {r.id}{r.visibility==='private'?' · 我的本地资料':''}{r.isDemo?' · 合成演示':''}</small></span></label>)}
        {!matches.length&&<p role="status">{candidates.length?'没有匹配的可读资料，请调整查找内容。':'暂无其他可读资料可供对照。'}</p>}
      </fieldset>
      <div className="actions"><button onClick={()=>setOpen(false)}>取消</button><button className="primary" disabled={!currentReadable||!chosen} onClick={compare}>开始对照</button></div>
    </Modal>}
  </>;
}
