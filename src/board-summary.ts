import type {AppData,BoardNode,ObjectRef,SummarySource} from '../contracts/domain';
import {resourceTitle} from './presentation';
import {freeCardPosition} from './board-geometry';

const refKey=(r:ObjectRef)=>r.kind+':'+r.id;
export const sourceBasis={text:'正文选段',note:'笔记内容',idea:'研究者记录',description:'已有文字描述',metadata:'目录信息'};
export function connectedCards(data:AppData,projectId:string,startIds:string[]):string[]{
  const valid=new Set(data.boardNodes.filter(n=>n.projectId===projectId).map(n=>n.id));
  const found=new Set(startIds.filter(id=>valid.has(id))),queue=[...found];
  const edges=data.edgeBindings.filter(e=>valid.has(e.sourceNodeId)&&valid.has(e.targetNodeId)&&data.relations.some(r=>r.id===e.relationId&&r.projectId===projectId&&r.state==='confirmed'&&r.type!=='summary_source'));
  while(queue.length){const id=queue.shift();for(const e of edges){const next=e.sourceNodeId===id?e.targetNodeId:e.targetNodeId===id?e.sourceNodeId:null;if(next&&!found.has(next)){found.add(next);queue.push(next);}}}
  return [...found];
}
function excerpts(text:string,focus:string){
  const terms=[...new Set(focus.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g)||[])].flatMap(t=>t.length>4?Array.from({length:t.length-1},(_,i)=>t.slice(i,i+2)):[t]);
  const sentences=text.split(/(?<=[。！？.!?])\s*|\n+/).map(t=>t.trim()).filter(Boolean);
  return sentences.map((t,i)=>({t,i,score:terms.reduce((n,k)=>n+(t.includes(k)?1:0),0)})).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,3).sort((a,b)=>a.i-b.i).map(x=>x.t.length>180?x.t.slice(0,180)+'…':x.t).join('\n');
}
export function summarySources(data:AppData,projectId:string,nodeIds:string[],focus=''):SummarySource[]{
  if(!data.projects.some(p=>p.id===projectId&&p.ownerId===data.session.userId))return [];
  const seen=new Set<string>();
  return nodeIds.flatMap<SummarySource>(id=>{
    const node=data.boardNodes.find(n=>n.id===id&&n.projectId===projectId);if(!node||seen.has(refKey(node.ref)))return [];seen.add(refKey(node.ref));
    const base={ref:{...node.ref},title:'',excerpt:'',anchorIds:[] as string[]};
    if(node.ref.kind==='resource'){
      const r=data.resources.find(r=>r.id===node.ref.id&&(r.visibility==='public'||r.ownerId===data.session.userId));if(!r)return [];
      const content=r.access==='demo_readable'?data.contents.find(c=>c.id===r.contentId&&c.resourceId===r.id&&c.versionId===r.versionId):undefined;
      let basis:SummarySource['basis']='metadata',text=`题名：${resourceTitle(r)}；主题：${r.subjects.join('、')||'未填写'}`;
      if(content?.kind==='text'){basis='text';text=content.paragraphs.map(p=>p.text).join('\n');}
      else if(content?.kind==='image'){basis='description';text=[content.label,...content.shapes.map(s=>s.label)].join('\n');}
      else if(content?.kind==='video_timeline'){basis='description';text=content.segments.map(s=>`${s.startSec}–${s.endSec}秒：${s.text}`).join('\n');}
      return [{...base,title:resourceTitle(r),resourceVersionId:r.versionId,basis,excerpt:excerpts(text,focus)}];
    }
    if(node.ref.kind==='note'){
      const note=data.notes.find(n=>n.id===node.ref.id&&n.ownerId===data.session.userId),revision=note?.revisions.find(r=>r.revision===(node.ref.revision||note.currentRevision));
      if(!note||!revision)return [];
      return [{...base,ref:{...node.ref,revision:revision.revision},title:note.title,basis:'note' as const,excerpt:excerpts(revision.body,focus),anchorIds:[...revision.anchorIds]}];
    }
    const idea=data.ideas.find(i=>i.id===node.ref.id&&i.projectId===projectId);return idea?[{...base,title:idea.title,basis:'idea' as const,excerpt:excerpts(idea.body,focus)}]:[];
  });
}
export function composeSummary(data:AppData,projectId:string,sources:SummarySource[],focus:string){
  const titles=new Map(sources.map((s,i)=>[refKey(s.ref),i+1]));
  const themes=new Map<string,number[]>();sources.forEach((s,i)=>{if(s.ref.kind==='resource')for(const tag of data.resources.find(r=>r.id===s.ref.id)?.subjects||[]){const ids=themes.get(tag)||[];ids.push(i+1);themes.set(tag,ids);}});
  const shared=[...themes].filter(([,ids])=>ids.length>1);
  const relations=data.relations.filter(r=>r.projectId===projectId&&r.state==='confirmed'&&r.type!=='summary_source'&&titles.has(refKey(r.from))&&titles.has(refKey(r.to)));
  const labels={same_source:'同一来源',compare:'比较',supports:'支持',contradicts:'反驳',background:'背景',hypothesis:'待验证联系',summary_source:'汇总来源'};
  const parts=[focus.trim()?`整理重点：${focus.trim()}`:'材料汇总',shared.length?'共同主题（依据已有标签）\n'+shared.map(([tag,ids])=>`${tag} ${ids.map(i=>`[${i}]`).join(' ')}`).join('\n'):'',
    '材料要点\n'+sources.map((s,i)=>`[${i+1}] ${s.title}\n${sourceBasis[s.basis]}：${s.excerpt||'暂无文字内容，待补充笔记。'}`).join('\n\n'),
    relations.length?'已记录的关系\n'+relations.map(r=>`[${titles.get(refKey(r.from))}] ${labels[r.type]} [${titles.get(refKey(r.to))}]：${r.rationale}`).join('\n'):'',
    sources.some(s=>s.basis==='metadata'||s.basis==='description')?'阅读范围\n'+sources.flatMap((s,i)=>s.basis==='metadata'?[`[${i+1}] 只有目录，未用于全文分析。`]:s.basis==='description'?[`[${i+1}] 使用已有文字描述，未识别图片或视频画面。`]:[]).join('\n'):''];
  return parts.filter(Boolean).join('\n\n');
}
export function addSummaryCard(data:AppData,projectId:string,nodeIds:string[],focus:string,title:string,id:string,createdAt:string,renderedNodes?:BoardNode[]):BoardNode{
  const project=data.projects.find(p=>p.id===projectId&&p.ownerId===data.session.userId);if(!project||project.status==='archived')throw Error('项目不可编辑。');
  const sources=summarySources(data,projectId,nodeIds,focus);if(sources.length<2)throw Error('请至少选择两张可访问的卡片。');
  if(!title.trim())throw Error('请填写汇总标题。');
  // One transaction creates the output and all provenance links; original records stay intact.
  const node:BoardNode={id:id+'-node',projectId,ref:{kind:'idea',id},...freeCardPosition(renderedNodes||data.boardNodes.filter(n=>n.projectId===projectId),300,200),width:300,height:200,groupId:null};
  data.ideas.push({id,projectId,type:'summary',title:title.trim(),body:composeSummary(data,projectId,sources,focus),isDemo:false,summary:{method:'local_extract',focus,sources,createdAt}});
  data.boardNodes.push(node);data.projectMembers.push({id:id+'-member',projectId,ref:node.ref,reading:'unread',selection:'candidate',reason:''});
  sources.forEach((s,i)=>{const source=data.boardNodes.find(n=>n.projectId===projectId&&nodeIds.includes(n.id)&&refKey(n.ref)===refKey(s.ref));if(!source)return;const rid=id+'-source-'+i;data.relations.push({id:rid,projectId,from:s.ref,to:node.ref,type:'summary_source',rationale:`汇总引用 [${i+1}] ${s.title}`,anchorIds:[...s.anchorIds],state:'confirmed',aiAssisted:false,needsReview:false});data.edgeBindings.push({id:rid+'-edge',relationId:rid,sourceNodeId:source.id,targetNodeId:node.id});});
  return node;
}
