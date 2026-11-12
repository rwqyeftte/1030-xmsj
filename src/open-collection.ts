import type {AppData,ObjectRef,Resource} from '../contracts/domain';

const retiredIds=new Set(['FLASK-PARTS','HK-FLASKS','THERMOS-AD','FLASK-GUIDE']);
const retiredTopic='vacuum-flasks';

export function retireOpenCollection(data:AppData):AppData {
  const withdrawn=data.resources.filter(r=>r.catalogOrigin==='open_collection' && r.visibility==='public' && retiredIds.has(r.id));
  if(!withdrawn.length && !data.topics.some(t=>t.id===retiredTopic))return data;

  // Preserve sources already used in this browser's notes, projects or library.
  const used=new Set([...data.personalSaves,...data.anchors].map(item=>item.resourceId));
  const remember=(ref:ObjectRef)=>{if(ref.kind==='resource')used.add(ref.id);};
  for(const member of [...data.projectMembers,...data.boardNodes])remember(member.ref);
  for(const folder of data.collections)folder.members.forEach(remember);
  for(const group of data.groups)group.memberRefs.forEach(remember);
  for(const relation of data.relations){remember(relation.from);remember(relation.to);}
  for(const plan of data.researchPlans)Object.values(plan.sections).forEach(section=>section.refs.forEach(remember));
  for(const idea of data.ideas)idea.summary?.sources.forEach(source=>remember(source.ref));
  const ids=new Set(withdrawn.map(r=>r.id));
  const resources=data.resources.flatMap((r):Resource[]=>{
    if(!ids.has(r.id))return [r];
    return used.has(r.id)?[{...r,visibility:'private',ownerId:data.session.userId||'demo-user'}]:[];
  });
  return {...data,resources,contents:data.contents.filter(c=>!ids.has(c.resourceId)||used.has(c.resourceId)),topics:data.topics.filter(t=>t.id!==retiredTopic)};
}
