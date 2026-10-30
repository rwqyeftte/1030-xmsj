import type { AppData, Resource } from '../contracts/domain';
import { resourceTitle } from './presentation';

export function publicResults(data:AppData, params:URLSearchParams):Resource[]{
  const q=(params.get('q')||'').toLocaleLowerCase().trim(), types=(params.get('types')||'').split(',').filter(Boolean),subjects=(params.get('subjects')||'').split(',').filter(Boolean);
  const query=data.savedQueries.find(x=>x.id===params.get('queryId'));if(params.get('queryId')&&!query)return [];
  const getField=(r:Resource,field:string)=>field==='title'?`${r.title} ${resourceTitle(r)}`:field==='subject'?r.subjects.join(' '):field==='source'?r.provenance.sourceLabel:field==='author'?r.authors?.join(' ')||'':field==='date'?r.sourceDate||'':data.contents.filter(c=>c.resourceId===r.id&&c.kind==='text').flatMap(c=>c.kind==='text'?c.paragraphs.map(p=>p.text):[]).join(' ');
  let result=data.resources.filter(r=>{if(r.visibility!=='public')return false;
    const hay=[getField(r,'title'),r.description,r.id,r.subjects.join(' '),r.authors?.join(' ')||'',r.provenance.sourceLabel,getField(r,'fulltext')].join(' ').toLocaleLowerCase();
    let hit:boolean|null=q?q.split(/\s+/).every(part=>hay.includes(part)):query?.rules.length?null:true;
    for(const rule of query?.rules||[]){const match=getField(r,rule.field).toLocaleLowerCase().includes(rule.value.toLocaleLowerCase());hit=hit===null?(rule.operator==='NOT'?!match:match):rule.operator==='OR'?hit||match:rule.operator==='NOT'?hit&&!match:hit&&match;}
    if(!hit||types.length&&!types.includes(r.mediaType)||subjects.length&&!subjects.some(s=>r.subjects.includes(s)))return false;
    if(params.get('access')&&params.get('access')!==r.access)return false;
    if(params.get('source')&&params.get('source')!==r.catalogOrigin)return false;
    if(params.get('date')==='unknown'&&r.sourceDate)return false;
    if(params.get('date')==='known'&&!r.sourceDate)return false;
    const topic=data.topics.find(t=>t.id===params.get('topicId'));if(params.get('topicId')&&(!topic||!topic.resourceIds.includes(r.id)))return false;return true;
  });
  if(params.get('sort')==='title')result.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
  if(params.get('sort')==='date')result.sort((a,b)=>(b.sourceDate||'').localeCompare(a.sourceDate||''));
  if(params.get('sort')==='new')result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return result;
}
