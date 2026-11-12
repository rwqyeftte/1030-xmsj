import type {KeyboardEvent} from 'react';
import type {AppData, BoardNode, Idea} from '../contracts/domain';
import {anchorLabel, mediaLabels} from './store';

export const ideaLabels: Record<Idea['type'],string>={question:'研究问题',tentative_claim:'待验证观点',memo:'备忘',summary:'汇总卡片'};

interface Props {
  data:AppData;
  node:BoardNode;
  title:string;
  selected:boolean;
  position:{x:number;y:number};
  onSelect:(shift:boolean)=>void;
  onMenu:(x:number,y:number)=>void;
  onMove:(dx:number,dy:number)=>void;
  onRemove:()=>void;
}

export default function BoardCanvasCard({data,node,title,selected,position,onSelect,onMenu,onMove,onRemove}:Props) {
  const {ref}=node;
  const resource=ref.kind==='resource'?data.resources.find(item=>item.id===ref.id):undefined;
  const note=ref.kind==='note'?data.notes.find(item=>item.id===ref.id && item.ownerId===data.session.userId):undefined;
  const idea=ref.kind==='idea'?data.ideas.find(item=>item.id===ref.id && item.projectId===node.projectId):undefined;
  const revision=note?.revisions.find(item=>item.revision===(ref.revision??note.currentRevision));
  const anchor=revision && data.anchors.find(item=>item.id===revision.anchorIds[0]);
  const member=data.projectMembers.find(item=>item.projectId===node.projectId && item.ref.kind===ref.kind && item.ref.id===ref.id);
  const type=resource?mediaLabels[resource.mediaType]:note?'研究笔记':idea?ideaLabels[idea.type]:'卡片';
  let caption='研究者记录';
  if (resource && member) caption={unread:'未读',reading:'阅读中',read:'已读'}[member.reading]+' · '+{candidate:'候选资料',included:'已纳入',excluded:'已排除'}[member.selection];
  if (revision) caption=anchor?anchorLabel(anchor):'独立笔记';
  if (idea?.summary) caption=idea.summary.sources.length+' 个来源';
  const excerpt=resource?.description || revision?.body || (anchor?.kind==='text' && anchor.quote) || (anchor?.kind==='pdf' && anchor.selection?.quote) || idea?.body;

  function onKey(event:KeyboardEvent<HTMLElement>) {
    if (event.target!==event.currentTarget) return;
    if (event.key==='ContextMenu' || (event.key==='F10' && event.shiftKey)) {
      event.preventDefault();
      const rect=event.currentTarget.getBoundingClientRect();
      onMenu(rect.left+24,rect.top+30);
    } else if (event.key==='Enter') {
      event.preventDefault();
      onSelect(event.shiftKey);
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      onMove(event.key==='ArrowLeft'?-24:event.key==='ArrowRight'?24:0,event.key==='ArrowUp'?-24:event.key==='ArrowDown'?24:0);
    } else if (event.key==='Delete') onRemove();
  }

  return <article tabIndex={0} role="button" aria-label={'选择节点 '+title} aria-pressed={selected}
    className={['board-node',ref.kind,idea?.summary?'summary-node':'',selected?'selected':''].join(' ')}
    data-node-id={node.id} data-testid={'board-node-'+node.id}
    style={{left:position.x,top:position.y,width:node.width,minHeight:node.height}}
    onClick={event=>onSelect(event.shiftKey)} onKeyDown={onKey}
    onContextMenu={event=>{event.preventDefault();onMenu(event.clientX,event.clientY);}}>
    <header><span className="board-card-type">{type}</span>
      <button className="node-actions" aria-label={'卡片操作 '+title} aria-haspopup="menu" onClick={event=>{
        event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect();onMenu(rect.left,rect.bottom);
      }}>⋯</button>
    </header>
    <h3>{title}</h3>
    {excerpt && <p>{excerpt}</p>}
    <footer><span title={caption}>{caption}</span>
      <button onClick={event=>{event.stopPropagation();onSelect(false);}}>预览</button>
    </footer>
  </article>;
}
