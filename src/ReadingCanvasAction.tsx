import {useState} from 'react';
import type {AppData,ObjectRef,Resource,SourceAnchor} from '../contracts/domain';
import {placeNode,useApp} from './store';
import {Link} from './ui';
import {projectTitle} from './presentation';
import {readingCardRef,type ReadingDraft} from './reading-card';
import './reading-canvas.css';

interface Props {
  resource:Resource; anchor:SourceAnchor; projectId?:string|null;
  draft?:ReadingDraft; noteId?:string; onPlaced?:(noteId:string)=>void;
}

export default function ReadingCanvasAction({resource,anchor,projectId,draft,noteId,onPlaced}:Props) {
  const {data,commit,requireLogin,chooseCanvasProject}=useApp();
  const [lastProject,setLastProject]=useState('');
  const context=data.projects.find(p=>p.id===projectId && p.ownerId===data.session.userId);
  const placement=data.boardNodes.filter(n=>n.ref.kind==='note' && n.ref.id===noteId &&
    (projectId?n.projectId===projectId:data.projects.some(p=>p.id===n.projectId && p.ownerId===data.session.userId)));
  const node=placement.find(n=>n.projectId===lastProject)??placement[0];
  const destination=node && data.projects.find(p=>p.id===node.projectId);
  const readonly=!!projectId && !!data.session.userId && (!context || context.status==='archived');

  function place() {
    const makeNoteRef=(d:AppData,pid:string)=>readingCardRef(d,pid,resource,anchor,draft,noteId);
    function placed(pid:string,ref:ObjectRef) {setLastProject(pid);onPlaced?.(ref.id);}
    if (!projectId) {chooseCanvasProject({makeNoteRef,onPlaced:placed});return;}
    const pid=projectId;
    requireLogin(()=>{
      let ref:ObjectRef;
      if (commit(d=>{ref=makeNoteRef(d,pid);placeNode(d,pid,ref);},'卡片已放到项目画布')) placed(pid,ref!);
    });
  }
  return <div className="reading-canvas-action">
    {node&&destination&&<div className="reading-canvas-receipt">
      <small>已放入「{projectTitle(destination)}」</small>
      <Link to={'/me/projects/'+encodeURIComponent(destination.id)+'/archive?view=board&mode=preview&focusNodeId='+encodeURIComponent(node.id)}>查看画布卡片 →</Link>
    </div>}
    {(!node||!projectId)&&<button type="button" className={node?'reading-canvas-secondary':'reading-canvas-place'} disabled={readonly} onClick={place}>
      <span className="reading-canvas-mark" aria-hidden="true">▦</span>{node?'放到其他项目':'放到项目画布'}
    </button>}
  </div>;
}
