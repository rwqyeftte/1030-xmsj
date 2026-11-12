import type {AppData, MediaType, QueryRecord, Resource} from '../contracts/domain';
import pdfPassages from '../contracts/pdf-passages.json';
import {accessionDate, coursePdf, featuredMaterial} from './featured';
import {mediaLabels, resourceTitle} from './presentation';

export interface SearchEvidence {
  field: string;
  text: string;
  terms: string[];
  page?: number;
  paragraphId?: string;
}
export interface CatalogSearch {
  results: Resource[];
  evidence: Map<string, SearchEvidence>;
  typeCounts: Partial<Record<MediaType, number>>;
}

const fieldInfo = {
  id: ['资料编号', 12], title: ['题名', 10], subject: ['主题', 7], author: ['作者', 8],
  fulltext: ['正文', 5], description: ['资料说明', 4], visual: ['画面说明', 3],
  source: ['来源', 2], type: ['资料类型', 6], date: ['原始日期', 3],
} as const;
type Field = keyof typeof fieldInfo;
type Entry = {key:Field; text:string; label?:string; page?:number; paragraphId?:string};
type TextContent = Extract<AppData['contents'][number], {kind:'text'}>;
const pages:Record<string,string[]> = pdfPassages;
const normalize = (value:string)=>value.trim().toLowerCase();
const alternateTerms=new Map([['照相机','相机'],['相机','照相机'],['保温瓶','热水瓶'],['热水瓶','保温瓶']]);

function entries(resource:Resource, content?:TextContent): Entry[] {
  const title=resourceTitle(resource);
  const fields:Entry[]=[
    {key:'title',text:title}, {key:'id',text:resource.id},
    {key:'type',text:mediaLabels[resource.mediaType]+'资料'},
    {key:'subject',text:resource.subjects.join('、')},
    {key:'author',text:resource.authors?.join('、')||''},
    {key:'description',text:resource.description}, {key:'source',text:resource.provenance.sourceLabel},
    {key:'date',text:resource.sourceDate||''},
  ];
  if(title!==resource.title) fields.push({key:'title',label:'原题名',text:resource.title});
  const material=featuredMaterial(resource);
  if(material?.source.imageAlt) fields.push({key:'visual',text:material.source.imageAlt});

  if(content && content.id===resource.contentId && content.resourceId===resource.id
      && content.versionId===resource.versionId
      && (resource.access==='file_available'||resource.access==='demo_readable')) {
    const label=resource.mediaType==='paper'?'论文正文':resource.isDemo?'演示正文':'正文';
    for(const p of content.paragraphs){
      const page='page' in p && typeof p.page==='number'?p.page:undefined;
      fields.push({key:'fulltext',label,text:p.text,page,paragraphId:p.id});
    }
  }
  if(resource.mediaType==='book' && coursePdf(resource)){
    (pages[resource.id]||[]).forEach((text,i)=>fields.push({key:'fulltext',label:'图书原页摘录',text,page:i+1}));
  }
  return fields.filter(f=>f.text);
}

// Older saved AI searches may have no persisted interpretation.
function descriptionTerms(resources:Resource[], description:string):string[] {
  const subjects=new Set(resources.flatMap(r=>r.subjects.map(normalize)));
  const matched=[...subjects].filter(s=>s.length>1&&description.includes(s));
  return matched.filter(s=>!matched.some(other=>other!==s&&other.includes(s)));
}

function excerpt(text:string, terms:string[]) {
  const lower=text.toLowerCase(), first=Math.min(...terms.map(term=>lower.indexOf(term)));
  const start=Math.max(0,first-36);
  const end=Math.min(text.length,Math.max(start+124,first+Math.max(...terms.map(term=>term.length))));
  return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
}

function matchResource(fields:Entry[], terms:string[], modelPlan:boolean, rules:QueryRecord['rules']) {
  const rows=fields.map(entry=>({entry,lower:entry.text.toLowerCase(),words:new Set<string>()}));
  const found=new Set<string>();
  for(const row of rows){
    for(const term of terms){
      if(row.lower.includes(term)){row.words.add(term); found.add(term);}
    }
  }
  // Model keywords are already alternatives. Local synonyms only fill a missing complete query term.
  const aliases=new Set<string>();
  if(!modelPlan){
    for(const term of terms){
      const alias=alternateTerms.get(term);
      if(!alias||found.has(term)) continue;
      for(const row of rows){
        if(row.lower.includes(alias)){row.words.add(alias); found.add(term); aliases.add(alias);}
      }
    }
  }
  let hit:boolean|null=terms.length ? (modelPlan?found.size>0:found.size===terms.length) : null;
  for(const rule of rules){
    const value=normalize(rule.value);
    const matching=rows.filter(row=>row.entry.key===rule.field && value && row.lower.includes(value));
    const matches=matching.length>0;
    if(rule.operator!=='NOT') matching.forEach(row=>row.words.add(value));
    if(hit===null) hit=rule.operator==='NOT'?!matches:matches;
    else if(rule.operator==='OR') hit=hit||matches;
    else hit=hit&&(rule.operator==='NOT'?!matches:matches);
  }
  if(hit===false) return null;

  let score=0, best=0, evidence:SearchEvidence|undefined;
  for(const {entry,lower,words} of rows){
    if(!words.size) continue;
    const rank=fieldInfo[entry.key][1]+(words.has(lower)?3:0);
    score=Math.max(score,rank);
    // Prefer a readable passage when it explains the same query as the title.
    const viaAlias=[...words].some(w=>aliases.has(w));
    const detail=words.size*30+(viaAlias?25:0)+(entry.key==='fulltext'?18:entry.key==='description'?14:rank);
    if(detail<=best) continue;
    best=detail;
    const text=excerpt(entry.text,[...words]);
    const visibleWords=[...words].filter(w=>text.toLowerCase().includes(w));
    const field=(entry.label||fieldInfo[entry.key][0])+(visibleWords.some(w=>aliases.has(w))?'（同义词）':'');
    evidence={field,text,terms:visibleWords,page:entry.page,paragraphId:entry.paragraphId};
  }
  return {score:score+found.size,aliasCount:aliases.size,evidence};
}

export function searchCatalog(data:AppData, params:URLSearchParams):CatalogSearch {
  const results:Resource[]=[], evidence=new Map<string,SearchEvidence>(), typeCounts:CatalogSearch['typeCounts']={};
  const catalog={results,evidence,typeCounts};
  const resources=data.resources.filter(r=>r.visibility==='public');
  const query=data.savedQueries.find(x=>x.id===params.get('queryId'));
  if(params.get('queryId')&&!query) return catalog;
  const q=normalize(params.get('q')??query?.q??'');
  const ai=(params.get('mode')||query?.mode)==='ai';
  const plan=ai && query && normalize(query.q)===q ? query.interpretation : undefined;
  const inferred=ai&&!plan?descriptionTerms(resources,q):[];
  const terms=[...new Set((plan?.keywords??(inferred.length?inferred:q.split(/\s+/))).map(normalize).filter(Boolean))];
  const types=(params.get('types')||'').split(',').filter(Boolean);
  const subjects=(params.get('subjects')||'').split(',').filter(Boolean);
  const topicId=params.get('topicId'), topic=data.topics.find(t=>t.id===topicId);
  const access=params.get('access'), source=params.get('source'), date=params.get('date');
  const contents=new Map(data.contents.filter((c):c is TextContent=>c.kind==='text').map(c=>[c.id,c]));
  const ranking=new Map<string,{score:number;aliasCount:number}>();
  for(const r of resources){
    if(topicId&&!topic?.resourceIds.includes(r.id)) continue;
    if(access&&r.access!==access || source&&r.catalogOrigin!==source) continue;
    if((date==='known'&&!r.sourceDate)||(date==='unknown'&&r.sourceDate)) continue;
    if(subjects.length&&!subjects.some(s=>r.subjects.includes(s))) continue;
    if(plan?.types.length&&!plan.types.includes(r.mediaType)) continue;

    const fields=entries(r,r.contentId?contents.get(r.contentId):undefined);
    const match=matchResource(fields,terms,!!plan,query?.rules||[]);
    if(!match) continue;
    typeCounts[r.mediaType]=(typeCounts[r.mediaType]??0)+1;
    if(types.length&&!types.includes(r.mediaType)) continue;
    results.push(r);
    ranking.set(r.id,match);
    if(match.evidence) evidence.set(r.id,match.evidence);
  }
  switch(params.get('sort')){
    case 'catalog': break;
    case 'title': results.sort((a,b)=>resourceTitle(a).localeCompare(resourceTitle(b),'zh-CN')); break;
    case 'date': results.sort((a,b)=>(b.sourceDate||'').localeCompare(a.sourceDate||'')); break;
    case 'new': results.sort((a,b)=>Date.parse(accessionDate(b))-Date.parse(accessionDate(a))); break;
    default: results.sort((a,b)=>{
      const left=ranking.get(a.id)!,right=ranking.get(b.id)!;
      return Number(a.isDemo)-Number(b.isDemo)||left.aliasCount-right.aliasCount||right.score-left.score;
    });
  }
  return catalog;
}

export function publicResults(data:AppData, params:URLSearchParams):Resource[] {
  return searchCatalog(data,params).results;
}
