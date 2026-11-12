import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Resource, QueryRecord, Topic } from '../contracts/domain';
import { useApp, uid, download, mediaLabels } from './store';
import { Link, nav, useLocation, useQuery, ResourceCard, Empty, Modal, AIPanel, useDraft, returnTo, contextUrl } from './ui';
import { resourceTitle, projectTitle } from './presentation';
import './Discovery.css';
import './Topics.css';
import TopicChat from './TopicChat';
import {browserHref} from './routing';
import {coursePdf,featuredMaterial,hasStudySource} from './featured';
import {recommendationCatalog,readRecommendationPreferences,recommendationPreferenceKey,type RecommendationPreferences} from './recommendations';
import {paperViewFromQuery,type PaperView} from './paper-text';
import {FeaturedMedia,FeaturedLinks} from './FeaturedMedia';
import {requestAI} from './ai';
import { searchCatalog } from './search';
import SearchResultCard from './SearchResultCard';
export { publicResults } from './search';

type Rule = QueryRecord['rules'][number];
type NamedQuery = QueryRecord & { name?: string };
const topicTitle = (topic: Topic) => topic.isDemoCuration ? topic.title.replace(/（演示专题）$/, '') : topic.title;
const refs = (ids: string[]) => ids.map(id => ({ kind: 'resource' as const, id }));
const displayFilter=(key:string,value:string)=>key==='types'?value.split(',').map(v=>mediaLabels[v as Resource['mediaType']]||v).join('、'):key==='access'?({file_available:'有资料文件',metadata_only:'仅目录',demo_readable:'可读演示材料',restricted:'受限目录'} as Record<string,string>)[value]||value:key==='source'?({center_preview:'课程预览目录',synthetic:'合成演示'} as Record<string,string>)[value]||value:key==='date'?(value==='unknown'?'未详':'已有明确日期'):value;
function patchUrl(path: string, params: URLSearchParams, changes: Record<string,string | null>) {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([k,v]) => v === null || v === '' ? next.delete(k) : next.set(k,v));
  return path + (next.size ? '?' + next.toString() : '');
}
function TargetContext() {
  const { data } = useApp(); const p = useQuery(); const l = useLocation();
  const project = data.projects.find(x => x.id === p.get('targetProjectId'));
  if (!project) return null;
  return <div className="notice discovery-target">为项目 <strong>{projectTitle(project)}</strong> 查找资料 <Link to={patchUrl(l.pathname,p,{targetProjectId:null})}>移除项目范围 ×</Link><span className="muted">只检索公开资料，不读取项目私有内容</span></div>;
}
function StrategyDialog({ q, rules, mode, onClose }: {q:string;rules:Rule[];mode?:string;onClose:()=>void}) {
  const { commit, requireLogin, data } = useApp(); const p = useQuery(); const [name,setName] = useState('');
  const source=data.savedQueries.find(item=>item.id===p.get('queryId') && item.q===q);
  return <Modal title="保存检索策略"  onClose={onClose}><form onSubmit={e=>{e.preventDefault(); if(!name.trim()) return; requireLogin(()=>{if(commit(d=>d.savedQueries.push({id:uid('query'),ownerId:d.session.userId,scope:'public',q,interpretation:source?.interpretation,mode:(mode||p.get('mode'))==='ai'?'ai':'standard',rules,targetProjectId:p.get('targetProjectId'),name:name.trim()} as NamedQuery),'检索策略已保存在本机')) onClose();});}}><label>策略名称（必填）<input autoFocus value={name} onChange={e=>setName(e.target.value)} required /></label><p>关键词：{q || '全部公开资料'} · {rules.length} 条高级条件</p><p className="muted">保存查询条件，重新运行时使用当前资料目录，不保留历史结果快照。当前已有 {data.savedQueries.length} 条策略。</p><div className="toolbar"><button type="button" onClick={onClose}>取消</button><button className="primary" type="submit">保存策略</button></div></form></Modal>;
}
function SearchBox({ advanced=false, homepage=false, inlineAdvanced=false, footer }: {advanced?:boolean;homepage?:boolean;inlineAdvanced?:boolean;footer?:(openSave:()=>void)=>React.ReactNode}) {
  const app = useApp(); const p=useQuery(); const query=app.data.savedQueries.find(x=>x.id===p.get('queryId'));
  const [q,setQ] = useDraft<string>('search-query',p.get('q')||query?.q||'');
  const [mode,setMode] = useState(p.get('mode') || query?.mode || (app.review.includes('ai-')?'ai':'standard'));
  const [rules,setRules] = useState<Rule[]>(query?.rules || (app.review.endsWith('advanced')||app.review.endsWith('invalid')?[{field:'title',operator:'AND',value:''}]:[]));
  const [expanded,setExpanded] = useState(inlineAdvanced?p.get('advanced')==='1':advanced && (app.review.includes('advanced')||app.review.endsWith('invalid')||rules.length>0));
  const [error,setError] = useState(app.review.endsWith('invalid')?'请填写高级条件关键词，或移除空条件。':'');
  const [saving,setSaving] = useState(false);
  useEffect(()=>{if(inlineAdvanced||p.has('q')||query)setQ(p.get('q')??query?.q??'');},[p.get('q'),query?.id,inlineAdvanced]);
  const pending=useRef<AbortController|null>(null);
  const [asking,setAsking]=useState(false);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setError(''); if(rules.some(r=>!r.value.trim())) {setError('请填写高级条件关键词，或移除空条件。');return;}
    const out=new URLSearchParams(p);for(const key of ['ctx','tab','featuredType','newType'])out.delete(key);out.set('q',q.trim());out.set('mode',mode);out.set('loaded','12');if(inlineAdvanced){if(expanded)out.set('advanced','1');else out.delete('advanced');}
    if(pending.current)return;
    let interpretation:QueryRecord['interpretation'];
    if(mode==='ai'&&!app.review && q.trim()){
      const controller=new AbortController();
      pending.current=controller;setAsking(true);
      try {
        interpretation=await requestAI({task:'search',question:q},controller.signal);
        if(controller.signal.aborted)return;
      } catch(e) {
        if(!controller.signal.aborted)setError(e instanceof Error?e.message:'DeepSeek 检索失败，请重试。');
        return;
      } finally {
        if(!controller.signal.aborted)setAsking(false);
        pending.current=null;
      }
    }
    const id=uid('query');
    const stored=app.commit(d=>d.savedQueries.push({id,scope:'public',ownerId:d.session.userId,q:q.trim(),interpretation,mode:mode==='ai'?'ai':'standard',rules,targetProjectId:p.get('targetProjectId')}));
    if(rules.length||interpretation){
      if(!stored){setError('检索条件未能保存在本机，请重试。');return;}
      out.set('queryId',id);
    }else out.delete('queryId');
    nav('/search/results?'+out.toString());
  };
  return <section className={'search-box '+(homepage?'home-search':'')}>
    <div className="tabs" aria-label="检索模式"><button disabled={asking} aria-pressed={mode==='standard'} onClick={()=>setMode('standard')}>常规检索</button><button disabled={asking} aria-pressed={mode==='ai'} onClick={()=>setMode('ai')}>AI 辅助检索</button></div>
    <form onSubmit={submit}><fieldset className="search-inputs" disabled={asking}>
      <label className="search-label" htmlFor="discovery-query">{mode==='ai'?'描述你要找的资料':'检索关键词'}</label>
      <div className="discovery-query-row"><input id="discovery-query" data-testid="search-input" value={q} onChange={e=>setQ(e.target.value)} placeholder={mode==='ai'?'可用自然语言描述':'输入题名、主题或公开正文中的词语'} onKeyDown={e=>{if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault();}} /><button className="primary" type="submit" data-testid="search-submit">{asking?'DeepSeek 正在解析…':'搜索资料 →'}</button>{inlineAdvanced?<button type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起高级检索':'高级检索'}</button>:!advanced&&<Link className="button" to={patchUrl('/search',p,{q,mode})}>高级检索</Link>}</div>
      {(advanced||inlineAdvanced)&&<>{!inlineAdvanced&&<button type="button" className="text-button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'− 收起':'＋ 展开'}高级检索条件</button>}{expanded&&<div className="advanced-rules">{rules.map((rule,i)=><div className="rule-row" key={i}><label>逻辑<select aria-label={`条件${i+1}逻辑`} value={rule.operator} onChange={e=>setRules(rules.map((r,n)=>n===i?{...r,operator:e.target.value as Rule['operator']}:r))}>{['AND','OR','NOT'].map(x=><option key={x}>{x}</option>)}</select></label><label>字段<select aria-label={`条件${i+1}字段`} value={rule.field} onChange={e=>setRules(rules.map((r,n)=>n===i?{...r,field:e.target.value}:r))}>{[['title','题名'],['subject','主题'],['source','来源'],['author','作者'],['date','原始日期'],['fulltext','可读全文']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><span>包含</span><label>关键词<input aria-label={`条件${i+1}关键词`} value={rule.value} onChange={e=>setRules(rules.map((r,n)=>n===i?{...r,value:e.target.value}:r))}/></label><button type="button" onClick={()=>setRules(rules.filter((_,n)=>n!==i))}>移除条件 {i+1}</button></div>)}<button type="button" onClick={()=>setRules([...rules,{field:'title',operator:'AND',value:''}])}>＋ 添加条件</button></div>}<div className="toolbar">{inlineAdvanced?expanded&&<><button className="primary" type="submit">应用条件</button><button type="button" onClick={()=>{setRules([]);setError('');}}>清空高级条件</button></>:<><button type="button" onClick={()=>setSaving(true)}>保存检索策略</button><button type="button" onClick={()=>{setQ('');setRules([]);setError('');}}>重置当前条件</button></>}</div></>}
      {error&&<p className="notice" role="alert">{error}</p>}
    </fieldset></form>{footer?.(()=>{if(rules.some(r=>!r.value.trim())){setError('请填写高级条件关键词，或移除空条件。');setExpanded(true);return;}setSaving(true);})}{saving&&<StrategyDialog q={q} rules={rules} mode={mode} onClose={()=>setSaving(false)}/>}
  </section>;
}
function topicResources(topic:Topic,resources:Resource[]) {
  const byId=new Map(resources.filter(r=>r.visibility==='public').map(r=>[r.id,r]));
  return topic.resourceIds.flatMap(id=>byId.get(id)??[]);
}
function topicDirectoryParams(p:URLSearchParams) {
  const directory=new URLSearchParams();
  for(const key of ['q','sort','category','targetProjectId']) {
    const value=p.get(key);
    if(value)directory.set(key,value);
  }
  return directory;
}
function TopicCard({topic,illustrated=false}:{topic:Topic;illustrated?:boolean}) {
  const {data}=useApp(),p=useQuery();
  const members=topicResources(topic,data.resources);
  const types=[...new Set(members.map(r=>mediaLabels[r.mediaType]))];
  const covers=illustrated?members.flatMap(r=>featuredMaterial(r)??[]).slice(0,2):[];
  const params=illustrated?topicDirectoryParams(p):new URLSearchParams();
  const path='/topics/'+encodeURIComponent(topic.id);
  const detail=patchUrl(path,params,{});
  return <article className={'topic-entry'+(illustrated?' topic-entry-illustrated':'')}>
    {covers.length>0&&<div className="topic-entry-art">{covers.map(item=><figure key={item.code}><img src={item.image} alt={item.source.imageAlt} loading="lazy"/><figcaption>{item.source.title}</figcaption></figure>)}</div>}
    <div className="topic-entry-copy">
      <p className="topic-entry-meta">{topic.status==='published'?`${members.length} 份资料`:'策划中'}{types.length>0&&<span>{types.join(' / ')}</span>}</p>
      <h3><Link to={detail}>{topicTitle(topic)}</Link></h3>
      <p>{topic.question||topic.intro}</p>
      <div className="topic-entry-links"><Link to={detail}>{topic.status==='published'?'查看专题资料':'查看策划状态'} <span aria-hidden="true">→</span></Link>
        {illustrated&&topic.status==='published'&&<Link to={patchUrl(path,params,{chat:'1'})}>专题 AI 问答</Link>}</div>
    </div>
  </article>;
}
const catalogTypes=['book','paper','image','video'] as const;
function catalogType(value:string|null) {
  return catalogTypes.find(type=>type===value);
}
function CatalogTypeFilter({label,value,onChange,counts}:{label:string;value:string|null;onChange:(type:string)=>void;counts?:Partial<Record<Resource['mediaType'],number>>}) {
  const selected=catalogType(value);
  return <div className="featured-type-filter" role="group" aria-label={label}>
    <button aria-pressed={!selected} onClick={()=>onChange('')}>全部类型</button>
    {catalogTypes.map(type=><button key={type} aria-pressed={selected===type} onClick={()=>onChange(type)}>{mediaLabels[type]}资料{counts&&<small aria-hidden="true">{counts[type]||0}</small>}</button>)}
  </div>;
}
const recommendationTabs={featured:'编辑精选',new:'新入库',interest:'兴趣推荐'} as const;
const recommendationFilterNames={featured:'精选资料类型',new:'新入库资料类型',interest:'兴趣资料类型'} as const;
const recommendationFilterKeys={featured:'featuredType',new:'newType',interest:'interestType'} as const;
function recommendationTab(value:string|null) {
  return value==='new'||value==='interest'?value:'featured';
}
function useRecommendationPreferences(review:string) {
  const [prefs,setPrefs]=useState(()=>readRecommendationPreferences(review));
  useEffect(()=>{
    const refresh=(e:StorageEvent)=>{
      if(e.key===null||e.key===recommendationPreferenceKey(review))setPrefs(readRecommendationPreferences(review));
    };
    window.addEventListener('storage',refresh);
    return ()=>window.removeEventListener('storage',refresh);
  },[review]);
  return [prefs,setPrefs] as const;
}
function replaceDiscoveryUrl(url:string) {
  history.replaceState(history.state,'',browserHref(url));
  window.dispatchEvent(new PopStateEvent('popstate',{state:{internal:true}}));
}
function readCatalogCount(value:string|null,minimum:number) {
  const count=Number(value);
  return Number.isSafeInteger(count)&&count>=minimum?count:minimum;
}
function Home() {
  const app=useApp(), filters=useQuery();
  const [retry,setRetry]=useState(false);
  const [prefs]=useRecommendationPreferences(app.review);
  const tab=recommendationTab(filters.get('tab'));
  const typeKey=recommendationFilterKeys[tab];
  const selectedType=catalogType(filters.get(typeKey));
  const catalog=recommendationCatalog(app.data,{tab,type:selectedType,review:app.review,preferences:prefs});
  const resources=catalog.results;
  const showCatalogue=!app.review&&(tab!=='interest'||catalog.total>0);
  const count=readCatalogCount(filters.get('loaded'),showCatalogue?8:4);
  const update=(changes:Record<string,string|null>)=>replaceDiscoveryUrl(patchUrl('/',filters,changes));
  const changeTab=(next:string)=>update({tab:next==='featured'?null:next,loaded:null});
  const moreUrl=patchUrl('/recommendations',new URLSearchParams(),{tab:tab==='featured'?null:tab,[typeKey]:selectedType??null,loaded:filters.get('loaded'),targetProjectId:filters.get('targetProjectId')});
  const project=[...app.data.projects].filter(x=>x.status==='active'&&x.ownerId===app.data.session.userId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  return <div className="page discovery-page" data-page-id="P01">
    <div className="home-intro"><h1>从一份资料，开始研究</h1><p>发现线索，阅读材料，整理研究准备。</p><SearchBox homepage/></div>
    <section className="continue-card panel"><div><span className="eyebrow">继续研究</span><h2>{app.data.session.userId?(project?projectTitle(project):'从一个新问题开始'):'建立自己的研究工作台'}</h2><p className="muted">{app.data.session.userId?(project?'最近更新 '+new Date(project.updatedAt).toLocaleDateString('zh-CN'):'还没有研究项目，可以从题名开始。'):'公开资料可直接浏览，保存与整理使用本地演示登录。'}</p></div>{app.data.session.userId?<Link className="button" to={project?'/me/projects/'+project.id+'/archive':'/me/projects'}>{project?'继续研究 →':'创建研究项目'}</Link>:<button onClick={()=>app.requireLogin(()=>nav('/me/projects'))}>本地演示登录</button>}</section>
    <section><div className="section-heading"><h2>发现资源</h2><Link to={moreUrl}>全部推荐 →</Link></div><div className="tabs">{[['featured','编辑精选'],['new','新入库'],['interest','兴趣推荐']].map(([v,l])=><button key={v} aria-pressed={tab===v} onClick={()=>changeTab(v)}>{l}</button>)}</div>
    {showCatalogue&&<CatalogTypeFilter label={recommendationFilterNames[tab]} value={selectedType??null} onChange={type=>update({[typeKey]:type||null,loaded:null})}/>}
    {app.review.endsWith('recommendation-error')&&!retry?<Empty title="推荐暂时无法加载"><p>搜索仍可使用。此故障仅影响当前评审推荐模块。</p><button onClick={()=>setRetry(true)}>重试推荐</button></Empty>:<>
      {!resources.length&&(tab==='interest'&&!catalog.total?<Empty title="当前兴趣范围没有推荐" showSymbol={false}><p>可以设置兴趣，或浏览编辑精选。</p><Link to={moreUrl}>设置兴趣 →</Link><button onClick={()=>changeTab('featured')}>浏览编辑精选</button></Empty>:<Empty title="暂无对应资料" showSymbol={false}><button onClick={()=>update({[typeKey]:null,loaded:null})}>查看全部类型</button></Empty>)}
      <div className="discovery-card-grid">{resources.slice(0,count).map(r=><ResourceCard key={r.id} resource={r} variant="catalog" showFeaturedCover={showCatalogue} showAccessionDate={tab==='new'&&!app.review}/>)}</div>
      {count<resources.length&&<button className="load-more" onClick={()=>update({loaded:String(count+4)})}>加载更多资源</button>}</>}</section>
    <section><div className="section-heading"><h2>专题精选</h2><Link to="/topics">全部专题 →</Link></div><div className="topic-grid">{app.data.topics.filter(t=>t.status==='published').map(t=><TopicCard key={t.id} topic={t}/>)}</div></section>
  </div>;
}
function SearchEditor(){
  const {data,commit,notify,review}=useApp();const p=useQuery();const [loadCount,setLoadCount]=useState(0);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  async function rerun(event:React.MouseEvent,query:QueryRecord){
    if(review || query.mode!=='ai' || query.interpretation || !query.q.trim() || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    event.preventDefault();
    request.current?.abort();
    const controller=new AbortController();
    request.current=controller;
    notify('DeepSeek 正在解析已保存的检索描述…');
    try{
      const interpretation=await requestAI({task:'search',question:query.q},controller.signal);
      if(controller.signal.aborted)return;
      if(commit(d=>{const saved=d.savedQueries.find(x=>x.id===query.id);if(!saved)throw Error('策略已删除');saved.interpretation=interpretation;}))
        nav(patchUrl('/search/results',p,{q:query.q,queryId:query.id,mode:query.mode,targetProjectId:query.targetProjectId}));
    }catch(e){if(!controller.signal.aborted)notify(e instanceof Error?e.message:'DeepSeek 检索失败');}
  }
  const collection=data.resources.filter(r=>r.visibility==='public'&&featuredMaterial(r));
  return <div className="page discovery-page catalog-search-entry" data-page-id="P02"><div className="page-head"><div><h1>全站统一搜索</h1><p className="muted">检索公开题录、论文正文及图书节选。</p></div></div><TargetContext/><div className="panel"><SearchBox key={`${p.get('queryId')||'new'}:${loadCount}`} advanced/>
    {collection.length>0&&<nav className="catalog-entry-links" aria-label="按类型浏览馆藏"><strong>浏览馆藏</strong>{catalogTypes.map(type=><Link key={type} to={patchUrl('/search/results',new URLSearchParams(),{types:type,source:'center_preview',targetProjectId:p.get('targetProjectId')})}>{mediaLabels[type]} <small>{collection.filter(r=>r.mediaType===type).length}</small></Link>)}</nav>}</div>
    <section className="panel strategy-list"><h2>近期检索与已保存策略</h2>{data.savedQueries.length?data.savedQueries.slice().reverse().map(query=><div className="strategy-row" key={query.id}><div><strong>{(query as NamedQuery).name||query.q||'全部公开资料'}</strong><p className="muted">{query.mode==='ai'?'AI 辅助检索':'常规检索'} · {query.rules.length} 条条件</p></div><Link className="button" onClick={e=>{if(e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey)setLoadCount(n=>n+1);}} to={patchUrl('/search',p,{q:query.q,queryId:query.id,mode:query.mode,targetProjectId:query.targetProjectId})}>使用条件</Link><Link className="button" onClick={e=>void rerun(e,query)} to={patchUrl('/search/results',p,{q:query.q,queryId:query.id,mode:query.mode,targetProjectId:query.targetProjectId})}>重新检索</Link></div>):<p className="muted">还没有保存策略。可先搜索，再保存当前条件。</p>}</section>
  </div>;
}
const resultTypes = ['book','paper','image','video','article'] as const;
const clearFacets = {types:null, subjects:null, access:null, source:null, date:null};
const facetNames = {subjects:'主题',access:'可用范围',source:'资料来源',date:'原始日期'} as const;

function Results(){
  const app=useApp(), p=useQuery(), params=p.toString();
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [scopeOpen,setScopeOpen]=useState(false);
  const [reviewAI,setReviewAI]=useState(app.review.endsWith('ai-error'));
  const [selectionOpen,setSelectionOpen]=useState(false);
  const [recovered,setRecovered]=useState(false);
  const query=app.data.savedQueries.find(x=>x.id===p.get('queryId'));
  const queryMissing=!!p.get('queryId')&&!query;
  const phrase=(p.get('q')??query?.q??'').trim();
  const interpretation=(p.get('mode')||query?.mode)==='ai'&&query?.q.trim().toLowerCase()===phrase.toLowerCase()?query.interpretation:undefined;
  const [selected,setSelected]=useDraft<string[]>('result-selection-'+p.get('q'),app.review.endsWith('bulk')?['DEMO-TEXT','DEMO-IMAGE']:[]);
  const requested=p.get('view')||(app.review.endsWith('grid')?'grid':app.review.endsWith('grouped')?'grouped':'list');
  const view=requested==='grid'||requested==='grouped'?requested:'list';
  const catalog=useMemo(()=>searchCatalog(app.data,new URLSearchParams(params)),[app.data,params]);
  const result=!recovered&&app.review.endsWith('empty')?[]:catalog.results;
  const loaded=readCatalogCount(p.get('loaded'),12), displayed=result.slice(0,loaded);
  const allPublic=app.data.resources.filter(r=>r.visibility==='public');
  const subjects=[...new Set(allPublic.flatMap(r=>r.subjects))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const selectedTypes=(p.get('types')||'').split(',').filter(Boolean);
  const filterCount=selectedTypes.length+Object.keys(facetNames).filter(k=>p.get(k)).length;
  const topic=app.data.topics.find(t=>t.id===p.get('topicId'));
  function update(changes:Record<string,string|null>, filter=false) {
    setRecovered(true);
    if(filter&&selected.length)app.notify('筛选已更新，已保留选择。');
    nav(patchUrl('/search/results',p,filter?{loaded:null,...changes}:changes),{preserveScroll:true});
  }
  const toggleType=(type:string)=>update({types:(selectedTypes.includes(type)?selectedTypes.filter(t=>t!==type):[...selectedTypes,type]).join(',')},true);
  function browseAll() {
    setRecovered(true);setFiltersOpen(false);
    nav(patchUrl('/search/results',new URLSearchParams(),{targetProjectId:p.get('targetProjectId'),view:p.get('view')}));
  }
  const chosen=selected.filter(id=>allPublic.some(r=>r.id===id));
  const hiddenCount=chosen.filter(id=>!displayed.some(r=>r.id===id)).length;
  const comparable=chosen.length===2&&chosen.every(id=>hasStudySource(app.data,allPublic.find(r=>r.id===id)));
  const toggle=(id:string)=>setSelected(chosen.includes(id)?chosen.filter(x=>x!==id):[...chosen,id]);
  function exportCSV() {
    const rows=allPublic.filter(r=>chosen.includes(r.id));
    download('公开资料目录.csv','\uFEFF'+[['ID','题名','类型','来源','日期','内容范围'],...rows.map(r=>[r.id,resourceTitle(r),mediaLabels[r.mediaType],r.provenance.sourceLabel,r.sourceDate||'未详',r.availabilityNote])].map(row=>row.map(x=>'"'+x.replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');
  }
  const cards=<div className={view==='grid'?'discovery-card-grid results-grid':'result-list'}>{displayed.map(r=><SearchResultCard key={r.id} resource={r} grid={view==='grid'} selected={chosen.includes(r.id)} onSelect={()=>toggle(r.id)} evidence={catalog.evidence.get(r.id)}/>)}</div>;
  return <div className="page discovery-page results-page catalog-results" data-page-id="P03">
    <header className="catalog-search-head"><h1>馆藏检索</h1><Link to={patchUrl('/search',p,{})}>修改检索策略 →</Link></header>
    <TargetContext/>
    <div className="search-strip catalog-search-strip">
      <SearchBox key={(p.get('queryId')||'new')+':'+(p.get('mode')||'standard')} inlineAdvanced footer={openSave=><div className="search-secondary-actions"><button onClick={openSave}>保存策略</button><button onClick={()=>setScopeOpen(true)}>检索范围</button>{app.review&&<button onClick={()=>setReviewAI(!reviewAI)} aria-expanded={reviewAI}>AI 辅助理解</button>}</div>}/>
    </div>
    {interpretation&&<p className="search-interpretation" data-testid="gpt-search-plan"><strong>AI 检索条件</strong> {[...interpretation.keywords,...interpretation.types.map(t=>mediaLabels[t as Resource['mediaType']])].join(' · ')||'全部公开资料'}{interpretation.model&&<small>{interpretation.model}</small>}</p>}
    <div className="catalog-search-layout">
      <button type="button" className="mobile-search-filters" aria-expanded={filtersOpen} aria-controls="catalog-facets" onClick={()=>setFiltersOpen(!filtersOpen)}>筛选条件{filterCount>0?'（'+filterCount+'）':''}<span aria-hidden="true">{filtersOpen?'−':'＋'}</span></button>
      <aside className={'catalog-facets'+(filtersOpen?' is-open':'')} id="catalog-facets" aria-label="筛选条件">
        <div className="facet-heading"><h2>筛选条件</h2><button className="text-button" onClick={()=>update(clearFacets,true)}>清除筛选</button></div>
        <fieldset className="type-facets"><legend>资料类型</legend>{resultTypes.map(type=><label key={type}><input type="checkbox" checked={selectedTypes.includes(type)} onChange={()=>toggleType(type)}/><span>{mediaLabels[type]}</span><span className="facet-count">{catalog.typeCounts[type]||0}</span></label>)}</fieldset>
        <label>主题／对象<select aria-label="主题／对象" value={p.get('subjects')||''} onChange={e=>update({subjects:e.target.value},true)}><option value="">全部主题</option>{subjects.map(s=><option key={s}>{s}</option>)}</select></label>
        <label>可用范围<select aria-label="可用范围" value={p.get('access')||''} onChange={e=>update({access:e.target.value},true)}><option value="">全部范围</option><option value="file_available">有资料文件</option><option value="metadata_only">仅目录</option><option value="demo_readable">可读演示材料</option><option value="restricted">受限目录</option></select></label>
        <label>资料来源<select aria-label="资料来源" value={p.get('source')||''} onChange={e=>update({source:e.target.value},true)}><option value="">全部来源</option><option value="center_preview">课程馆藏</option><option value="synthetic">合成演示</option></select></label>
        <label>原始日期<select aria-label="原始日期" value={p.get('date')||''} onChange={e=>update({date:e.target.value},true)}><option value="">全部日期</option><option value="unknown">未详</option><option value="known">已有明确日期</option></select></label>
        <button className="mobile-show-results" onClick={()=>setFiltersOpen(false)}>查看 {result.length} 份结果</button>
      </aside>
      <section className="catalog-result-main" aria-label="检索结果">
        <header className="catalog-result-heading"><div><h2>{phrase?'“'+phrase+'”':p.get('topicId')&&topic?topicTitle(topic):'全部公开资料'}</h2><span role="status" data-testid="results-count">共 <strong>{result.length}</strong> 份公开资料</span></div>
          <label>排序<select aria-label="结果排序" value={p.get('sort')||'relevance'} onChange={e=>update({sort:e.target.value,loaded:null})}><option value="relevance">相关度</option><option value="new">最新入库</option><option value="title">题名排序</option><option value="date">原始日期（由近及远）</option><option value="catalog">目录原顺序</option></select></label>
        </header>
        <div className="active-filters">
          {selectedTypes.map(t=><button key={t} aria-label={'移除'+(mediaLabels[t as Resource['mediaType']]||t)+'筛选'} onClick={()=>toggleType(t)}>{mediaLabels[t as Resource['mediaType']]||t} ×</button>)}
          {(Object.keys(facetNames) as (keyof typeof facetNames)[]).filter(k=>p.get(k)).map(k=><button key={k} onClick={()=>update({[k]:null},true)}>{facetNames[k]} · {displayFilter(k,p.get(k)||'')} ×</button>)}
          {p.get('topicId')&&<button onClick={()=>update({topicId:null},true)}>专题 · {topic?topicTitle(topic):'专题不可用'} ×</button>}
          {query?.rules.map((rule,i)=><span key={i} className="catalog-rule">{i>0||rule.operator==='NOT'?rule.operator+' ':''}{({title:'题名',subject:'主题',source:'来源',author:'作者',date:'日期',fulltext:'正文'} as Record<string,string>)[rule.field]} · {rule.value}</span>)}
        </div>
        <div className="catalog-view-tools"><div className="tabs" aria-label="结果视图">{[['list','列表'],['grid','图文'],['grouped','归类']].map(([v,l])=><button key={v} aria-pressed={view===v} onClick={()=>update({view:v})}>{l}</button>)}</div>
          {displayed.length>0&&<label className="select-all"><input type="checkbox" checked={displayed.every(r=>chosen.includes(r.id))} onChange={e=>setSelected(e.target.checked?[...new Set([...chosen,...displayed.map(r=>r.id)])]:chosen.filter(id=>!displayed.some(r=>r.id===id)))}/>选择当前 {displayed.length} 份</label>}
        </div>
        <div className="catalog-selection" hidden={!chosen.length}><strong>已选 {chosen.length} 份</strong>
          {hiddenCount>0&&<span>含当前未显示的 {hiddenCount} 份</span>}<button onClick={()=>setSelectionOpen(true)}>查看选择</button><button disabled={!chosen.length} onClick={()=>setSelected([])}>清空选择</button>
          <button onClick={()=>app.requireLogin(()=>app.commit(d=>{chosen.forEach(id=>{if(!d.personalSaves.some(s=>s.userId===d.session.userId&&s.resourceId===id))d.personalSaves.push({userId:d.session.userId!,resourceId:id,savedAt:new Date().toISOString()});});},'已保存到我的资料'))}>保存到我的资料</button>
          <button onClick={()=>app.openProjectPicker(refs(chosen))}>加入项目</button><button disabled={!comparable} onClick={()=>nav(contextUrl('/compare?left='+chosen[0]+'&right='+chosen[1]))}>对照阅读</button><button onClick={exportCSV}>导出目录 CSV</button>
          {chosen.length>0&&!comparable&&<small>对照阅读需选择两份有可读内容的资料。</small>}
        </div>
        {queryMissing||!result.length?<div className="catalog-empty">
          <h3>{queryMissing?'检索条件不可恢复':filterCount?'当前筛选无匹配资料':'没有找到匹配的公开资料'}</h3>
          <p>{queryMissing?'这条策略没有保存在当前浏览器中。':filterCount?'试着放宽资料类型或来源，查看同一检索词的其他结果。':'可尝试较短的题名、作者姓名，或改用资料编号。'}</p>
          <div>{queryMissing?<Link className="button" to="/search">重新构造检索</Link>:filterCount>0&&<button onClick={()=>update(clearFacets,true)}>移除筛选，保留检索词</button>}
          <button onClick={browseAll}>浏览全部公开资料</button></div>
        </div>:<>
          {view==='grouped'&&<div className="catalog-groups"><h3>按资料类型分布</h3><div className="catalog-group-bars">{resultTypes.map(type=>{const n=result.filter(r=>r.mediaType===type).length;return n>0&&<button key={type} onClick={()=>update({types:type},true)}><span>{mediaLabels[type]}</span><span className="bar-track"><span style={{width:100*n/result.length+'%'}}/></span><strong>{n}</strong></button>;})}</div>
            <h3>结果中的主题</h3><div className="catalog-subjects">{subjects.filter(s=>result.some(r=>r.subjects.includes(s))).map(s=><button key={s} onClick={()=>update({subjects:s},true)}>{s} <span>{result.filter(r=>r.subjects.includes(s)).length}</span></button>)}</div>
          </div>}
          {cards}
          {loaded<result.length?<button className="load-more" onClick={()=>update({loaded:String(loaded+12)})}>加载更多（已显示 {displayed.length} / {result.length}）</button>:<p className="end-marker">已显示全部 {result.length} 份结果</p>}
        </>}
      </section>
    </div>
    {scopeOpen&&<Modal title="检索范围" onClose={()=>setScopeOpen(false)}><p>检索公开资料的题名、作者、主题、来源和内容说明。图书可检索已核对的原页摘录，论文可检索已收录的正文节选。</p><p>图片和视频按编目信息检索。私人上传和个人笔记仅在个人空间中可见。</p><button onClick={()=>setScopeOpen(false)}>关闭</button></Modal>}
    {app.review&&reviewAI&&<Modal title="AI 辅助理解" onClose={()=>setReviewAI(false)}><AIPanel resourceIds={result.map(r=>r.id)} onClose={()=>setReviewAI(false)}/></Modal>}
    {selectionOpen&&<Modal title="当前选择" onClose={()=>setSelectionOpen(false)}><p>已选择 {chosen.length} 份公开资料。</p>{chosen.length>0&&<ul className="selected-resource-list">{allPublic.filter(r=>chosen.includes(r.id)).map(r=><li key={r.id}><Link to={'/resources/'+r.id}>{resourceTitle(r)}</Link><button onClick={()=>toggle(r.id)} aria-label={'取消选择 '+resourceTitle(r)}>取消选择</button></li>)}</ul>}<div className="toolbar"><button onClick={()=>setSelectionOpen(false)}>返回检索</button><button disabled={!chosen.length} onClick={()=>setSelected([])}>清空选择</button></div></Modal>}
  </div>;
}

function Recommendations(){
  const app=useApp(), p=useQuery();
  const defaultTab=app.review.endsWith('no-interest')||app.review.endsWith('no-match')?'interest':'featured';
  const tab=recommendationTab(p.get('tab')||defaultTab);
  const typeKey=recommendationFilterKeys[tab];
  const selectedType=catalogType(p.get(typeKey));
  const loaded=readCatalogCount(p.get('loaded'),8);
  const [prefs,setPrefs]=useRecommendationPreferences(app.review);
  const [draft,setDraft]=useState(prefs);
  const [settings,setSettings]=useState(false);
  const [staleInfo,setStaleInfo]=useState(false);
  const [prefsError,setPrefsError]=useState('');
  const [undo,setUndo]=useState<RecommendationPreferences|null>(null);
  const {results,total,typeCounts,subjects,project}=recommendationCatalog(app.data,{tab,type:selectedType,review:app.review,preferences:prefs});
  const projects=app.data.projects.filter(item=>item.ownerId===app.data.session.userId);
  const subjectOptions=[...new Set([...subjects,...prefs.subjects])];
  const interest=tab==='interest';
  const hasInterests=!!(prefs.subjects.length||project);
  const searchUrl=patchUrl('/search/results',new URLSearchParams(),{source:'center_preview',access:'file_available',targetProjectId:p.get('targetProjectId')});
  function updateList(changes:Record<string,string|null>) {
    replaceDiscoveryUrl(patchUrl('/recommendations',p,changes));
  }
  function chooseTab(next:string) {
    if(next!==tab)updateList({tab:next,loaded:null});
  }
  function chooseType(type:string) {
    updateList({[typeKey]:type||null,loaded:null});
  }
  function openSettings() {
    setDraft({...prefs,projectId:project?.id||''});
    setPrefsError('');
    setSettings(true);
  }
  function persist(next:RecommendationPreferences) {
    try {
      localStorage.setItem(recommendationPreferenceKey(app.review),JSON.stringify(next));
    } catch {
      setPrefsError('偏好未保存，本地存储不可用。请重试。');
      return false;
    }
    setUndo(prefs);
    setPrefs(next);
    setPrefsError('');
    return true;
  }
  function savePreferences(){
    if(persist(draft)){
      setSettings(false);
      updateList({interestType:null,loaded:null});
      app.notify('推荐偏好已保存在本机');
    }
  }
  return <div className="page discovery-page recommendation-workspace" data-page-id="P04">
    <header className="recommendation-heading"><h1>研究资源推荐</h1><Link to={searchUrl}>检索全部馆藏 <span aria-hidden="true">→</span></Link></header>
    <div className="tabs recommendation-tabs" role="group" aria-label="推荐栏目">{Object.entries(recommendationTabs).map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>chooseTab(key)}>{label}</button>)}</div>
    {interest&&hasInterests&&<div className="recommendation-interests">
      <div>{!!prefs.subjects.length&&<p>研究兴趣 <strong>{prefs.subjects.join('、')}</strong></p>}{project&&<p>参考项目 <strong>{projectTitle(project)}</strong></p>}</div>
      <button onClick={openSettings}>调整兴趣</button>
    </div>}
    {!!prefs.hiddenTypes.length&&<p className="recommendation-preference-note">已隐藏{prefs.hiddenTypes.map(t=>mediaLabels[t as Resource['mediaType']]||t).join('、')}资料 <button className="text-button" onClick={()=>persist({...prefs,hiddenTypes:[]})}>恢复全部类型</button></p>}
    {tab==='interest'&&undo&&<button className="text-button preference-undo" onClick={()=>{if(persist(undo)){setUndo(null);chooseType('');}}}>撤销上次偏好修改</button>}
    {prefsError&&!settings&&<p role="alert">{prefsError}</p>}
    {(!interest||total>0)&&<div className="recommendation-filters">
      {!app.review&&<CatalogTypeFilter label={recommendationFilterNames[tab]} value={selectedType??null} counts={typeCounts} onChange={chooseType}/>}
      <p role="status">{tab==='new'&&<span>按入库日期排序</span>}{selectedType?`${results.length} / ${total} 份资料`:`共 ${total} 份资料`}</p>
    </div>}
    {app.review.endsWith('stale-resource')&&<article className="panel stale-resource"><h2>金龙牌热水瓶广告</h2><p>原件暂时无法获取，仍可查看目录。</p><Link className="button" to="/resources/I05?review=P07__source-missing">查看失效来源说明</Link><button onClick={()=>setStaleInfo(true)}>查看原推荐依据</button></article>}
    {staleInfo&&<Modal title="原推荐依据" onClose={()=>setStaleInfo(false)}><p>《金龙牌热水瓶广告》原按公开目录中的广告主题收录，当前原件已失效。</p><button onClick={()=>setStaleInfo(false)}>知道了</button></Modal>}
    {results.length>0?<><div className="recommendation-grid">{results.slice(0,loaded).map(r=><ResourceCard key={r.id} resource={r} variant={app.review?'catalog':'recommendation'} showFeaturedCover={!app.review} showAccessionDate={!app.review&&tab==='new'} hideMetadataFooter/>)}</div>
      {loaded<results.length?<button className="load-more" onClick={()=>updateList({loaded:String(loaded+8)})}>加载更多（{loaded} / {results.length}）</button>:<p className="end-marker">已显示全部 {results.length} 份资料</p>}</>
    :interest&&!hasInterests?<Empty showSymbol={false} title="尚未设置研究兴趣"><p>选择关心的主题，或根据一个研究项目的题名和问题查找资料。</p><button onClick={openSettings}>调整兴趣</button></Empty>
    :<Empty showSymbol={false} title={selectedType?'这一类型暂无资料':interest?'此兴趣范围暂无匹配资料':'当前范围暂无资料'}>{selectedType?<button onClick={()=>chooseType('')}>查看全部类型</button>:interest?<button onClick={()=>chooseTab('featured')}>浏览编辑精选</button>:<Link to={searchUrl}>前往馆藏检索</Link>}</Empty>}
    {settings&&<Modal title="研究兴趣设置" onClose={()=>setSettings(false)}>
      <fieldset><legend>主题／研究对象</legend><div className="interest-options">{subjectOptions.map(s=><label key={s}><input type="checkbox" checked={draft.subjects.includes(s)} onChange={e=>setDraft({...draft,subjects:e.target.checked?[...draft.subjects,s]:draft.subjects.filter(x=>x!==s)})}/>{s}</label>)}</div></fieldset>
      <label>参考项目（可选）<select value={draft.projectId} onChange={e=>setDraft({...draft,projectId:e.target.value})}><option value="">不参考项目</option>{projects.map(item=><option key={item.id} value={item.id}>{projectTitle(item)}</option>)}</select></label>
      <p className="muted">选中项目后，将在本机用它的题名和研究问题匹配馆藏。</p>
      {prefsError&&<p role="alert">{prefsError}</p>}<div className="toolbar"><button onClick={()=>setDraft({subjects:[],hiddenTypes:[],projectId:''})}>清空设置草稿</button><button onClick={()=>setSettings(false)}>取消</button><button className="primary" onClick={savePreferences}>确认保存偏好</button></div>
    </Modal>}
  </div>;
}
function Topics(){
  const {data,review}=useApp(),p=useQuery();
  const q=p.get('q')??(!p.has('adjusted')&&review.endsWith('filtered-empty')?'没有这个专题':'');
  const status=p.get('category')??(!p.has('adjusted')&&review.endsWith('unpublished')?'planned':'');
  const sort=p.get('sort')||'curated';
  const query=q.trim().toLocaleLowerCase();
  const topics=data.topics.filter(topic=>{
    if(status&&topic.status!==status)return false;
    if(!query)return true;
    const names=topicResources(topic,data.resources).map(r=>[resourceTitle(r),...r.subjects].join(' '));
    return [topicTitle(topic),topic.question,topic.intro,...names].join(' ').toLocaleLowerCase().includes(query);
  });
  if(sort==='title')topics.sort((a,b)=>topicTitle(a).localeCompare(topicTitle(b),'zh-CN'));
  const update=(changes:Record<string,string|null>)=>replaceDiscoveryUrl(patchUrl('/topics',p,{...changes,adjusted:review?'1':null}));
  return <div className="page discovery-page topic-workspace" data-page-id="P05">
    <header className="topic-page-heading"><h1>专题板块</h1><Link to="/search">检索全部资料 <span aria-hidden="true">→</span></Link></header>
    <div className="topic-directory-controls">
      <label>查找专题<input type="search" value={q} onChange={e=>update({q:e.target.value})} placeholder="搜索专题、资料题名或主题"/></label>
      {(status||data.topics.some(t=>t.status==='planned'))&&<label>专题状态<select value={status} onChange={e=>update({category:e.target.value})}><option value="">全部状态</option><option value="published">已开放</option><option value="planned">策划中</option></select></label>}
      <label>排序<select value={sort} onChange={e=>update({sort:e.target.value==='title'?'title':null})}><option value="curated">策划顺序</option><option value="title">专题题名</option></select></label>
    </div>
    <p className="topic-count" role="status">共 {topics.length} 个专题</p>
    {topics.length?<div className="topic-grid topic-directory-grid">{topics.map(t=><TopicCard key={t.id} topic={t} illustrated/>)}</div>
    :<Empty title="没有匹配的专题" showSymbol={false}><button onClick={()=>update({q:null,category:null})}>清除专题筛选</button><Link to={patchUrl('/search/results',new URLSearchParams(),{q:q.trim()})}>在馆藏中检索</Link></Empty>}
  </div>;
}
function TopicDetail(){
  const app=useApp(),loc=useLocation(),p=useQuery();
  const topic=app.data.topics.find(t=>t.id===loc.pathname.split('/')[2]);
  const type=p.get('type')||'';
  const chat=p.get('chat')==='1'||(!p.has('chat')&&app.review.endsWith('ai-no-evidence'));
  const tabBar=useRef<HTMLDivElement>(null);
  const directory=patchUrl('/topics',topicDirectoryParams(p),{});
  const update=(changes:Record<string,string|null>)=>replaceDiscoveryUrl(patchUrl(loc.pathname,p,changes));
  useEffect(()=>{
    if(!chat||!tabBar.current)return;
    const tabs=tabBar.current;
    if(tabs.getBoundingClientRect().top>window.innerHeight*0.45)tabs.scrollIntoView({block:'start'});
  },[chat]);
  if(!topic)return <div className="page" data-page-id="P06"><Empty title="专题不存在或已移除"><Link to={directory}>返回专题目录</Link></Empty></div>;
  if(topic.status==='planned')return <div className="page" data-page-id="P06"><Link to={directory}>← 返回专题目录</Link><Empty title={topicTitle(topic)} showSymbol={false}><p>专题正在策划中。</p><Link to="/topics?category=published">浏览已开放专题</Link></Empty></div>;
  const resources=topicResources(topic,app.data.resources);
  const types=[...new Set(resources.map(r=>r.mediaType))];
  const shown=type?resources.filter(r=>r.mediaType===type):resources;
  const searchUrl=patchUrl('/search/results',new URLSearchParams(),{topicId:topic.id,targetProjectId:p.get('targetProjectId'),types:type||null});
  const addTopic=()=>app.openProjectPicker(refs(resources.map(r=>r.id)));
  const closeChat=()=>update({chat:app.review.endsWith('ai-no-evidence')?'0':null});
  return <div className="page discovery-page topic-workspace" data-page-id="P06">
    <nav className="topic-breadcrumb" aria-label="专题导航"><Link to={directory}>← 返回专题目录</Link></nav>
    <header className="topic-detail-heading"><h1>{topicTitle(topic)}</h1><p className="topic-detail-question">{topic.question}</p>
      <p className="topic-detail-intro">{topic.intro}</p></header>
    <div className="topic-navigation" ref={tabBar}><div className="tabs topic-tabs" role="group" aria-label="专题视图">
      <button aria-pressed={!chat} onClick={closeChat}>专题资料</button>
      <button aria-pressed={chat} onClick={()=>update({chat:'1'})}>专题 AI 问答</button>
    </div></div>
    {chat?<section className="topic-conversation">{app.review?<AIPanel resourceIds={resources.map(r=>r.id)} onClose={closeChat}/>:<TopicChat topic={topic} resources={resources} onClose={closeChat}/>}</section>:<>
      <section aria-label="专题资料集">
        <div className="topic-collection-tools">
          <div className="topic-member-types" role="group" aria-label="专题资料类型"><button aria-pressed={!type} onClick={()=>update({type:null})}>全部资料 <span>{resources.length}</span></button>{types.map(t=><button key={t} aria-pressed={type===t} onClick={()=>update({type:t})}>{mediaLabels[t]}资料 <span>{resources.filter(r=>r.mediaType===t).length}</span></button>)}</div>
          <div className="topic-collection-actions"><Link to={searchUrl}>在专题内检索</Link><button onClick={addTopic} disabled={!resources.length}>将资料集加入项目</button></div>
        </div>
        {app.review.endsWith('partial-access')&&<p className="notice">部分成员只能查看目录。</p>}
        {app.review.endsWith('bulk-partial')&&<section className="panel"><h2>批量加入前核对</h2><p>目标项目：{app.data.projects.find(p=>p.id==='project-demo-01')?.title}</p>{resources.map(r=><p key={r.id}>{resourceTitle(r)} · {app.data.projectMembers.some(m=>m.projectId==='project-demo-01'&&m.ref.id===r.id)?'项目已存在':r.access==='restricted'?'新增受限目录引用':'可新增引用'}</p>)}<button onClick={addTopic}>选择目标并确认可加入项目</button></section>}
        {shown.length>0?<div className="topic-members">{shown.map(r=><SearchResultCard key={r.id} resource={r} grid={false}/>)}</div>:<Empty showSymbol={false} title="当前范围暂无专题资料">{type&&<button onClick={()=>update({type:null})}>查看全部资料</button>}</Empty>}
      </section>
    </>}
  </div>;
}
function ResourcePreview({resource}:{resource:Resource}){
  const{data}=useApp();const content=data.contents.find(c=>c.resourceId===resource.id);
  if(!content)return <div className="detail-placeholder"><span className="placeholder-icon" aria-hidden="true">▤</span><strong>原件未提供</strong><p>当前仅有{mediaLabels[resource.mediaType]}目录记录</p><small>此区域为线框占位，不是史料原图</small></div>;
  if(content.kind==='text')return <div className="detail-text-preview"><div className="tag">合成阅读测试文本</div><h3>正文片段预览</h3>{content.paragraphs.slice(0,2).map(p=><p key={p.id}>{p.text}</p>)}<small>{content.paragraphs.length} 个可定位段落 · 无原始印刷页码</small></div>;
  if(content.kind==='image')return <div className="detail-image-preview"><p>{content.label}</p><svg viewBox={`0 0 ${content.width} ${content.height}`} role="img" aria-label={content.label}><rect width={content.width} height={content.height} fill="#fafafa" stroke="#555"/>{content.shapes.map((s,i)=><g key={i}><rect x={s.x} y={s.y} width={s.width} height={s.height} fill="#eee" stroke="#777"/><text x={s.x+s.width/2} y={s.y+s.height/2} textAnchor="middle" fill="#222" fontSize="28">{s.label}</text></g>)}</svg><p className="muted">不是广告原图 · 可在阅读器中选区</p></div>;
  return <div className="detail-timeline-preview"><span className="tag">合成时间轴</span><h3>观察过程 / {content.durationSec} 秒</h3><p>{content.warning}</p>{content.segments.map(s=><div key={s.startSec} className="timeline-segment"><strong>{s.startSec}—{s.endSec}s</strong><p>{s.text}</p></div>)}</div>;
}
function ResourceDetail(){
  const app=useApp(),loc=useLocation(),p=useQuery();let id=decodeURIComponent(loc.pathname.split('/')[2]||'');
  if(app.review.startsWith('P07__synthetic-'))id='DEMO-'+app.review.split('synthetic-')[1].toUpperCase();if(app.review==='P07__restricted')id='DEMO-RESTRICTED';
  const r=app.data.resources.find(r=>r.id===id);const [feedback,setFeedback]=useState(false);const [body,setBody]=useDraft('feedback-'+id,'');const [tab,setTab]=useState('range');
  if(!r||r.visibility==='private'&&r.ownerId!==app.data.session.userId)return <div className="page" data-page-id="P07"><Empty title="资料不存在或无权查看"><p>私有资料需要对应的本地演示会话。当前不展示其题名和内容。</p><Link to="/search">返回公开搜索</Link>{!app.data.session.userId&&<button onClick={()=>app.requireLogin(()=>undefined)}>本地演示登录后重试</button>}</Empty></div>;
  const item=featuredMaterial(r);
  const pdf=coursePdf(r);
  const requestedPage=Number(p.get('page'));
  const page=Number.isInteger(requestedPage)&&requestedPage>=1&&requestedPage<=(pdf?.source.pageCount??0)?requestedPage:1;
  const paperView=paperViewFromQuery(p);
  function showPaperView(view:PaperView) {
    const url=patchUrl(loc.pathname,p,{view});
    history.replaceState(history.state,'',browserHref(url));
    window.dispatchEvent(new PopStateEvent('popstate',{state:{internal:true}}));
  }
  function showPage(nextPage:number) {
    if(nextPage===page)return;
    const url=patchUrl(loc.pathname,p,{page:String(nextPage),view:r?.mediaType==='paper'?paperView:null});
    history.replaceState(history.state,'',browserHref(url));
    window.dispatchEvent(new PopStateEvent('popstate',{state:{internal:true}}));
  }
  const missing=app.review==='P07__source-missing';const readable=!missing&&hasStudySource(app.data,r);
  const saved=app.data.personalSaves.some(x=>x.resourceId===r.id&&x.userId===app.data.session.userId);const content=app.data.contents.find(c=>c.resourceId===r.id);
  const related=app.data.resources.filter(x=>x.id!==r.id&&x.visibility==='public'&&x.subjects.some(s=>r.subjects.includes(s))).slice(0,3);
  const readUrl=patchUrl('/resources/'+encodeURIComponent(r.id)+'/read',p,{page:pdf?String(page):null,view:r.mediaType==='paper'?paperView:null,projectId:p.get('projectId')||p.get('targetProjectId'),ctx:null,anchorId:null});
  return <div className="page discovery-page resource-detail" data-page-id="P07" data-resource-id={r.id}><div className="detail-breadcrumb"><button className="text-button" onClick={()=>returnTo('/search/results')}>← 返回来源页面</button></div><div className="page-head"><div><div className="toolbar"><span className="tag">{mediaLabels[r.mediaType]}</span>{r.isDemo&&<span className="tag">合成演示 · 非史料</span>}{r.visibility==='private'&&<span className="tag">仅本地个人可见</span>}<span className="muted">记录编号 {r.id}</span></div><h1>{resourceTitle(r)}</h1></div>
    </div>
    <div className="detail-actions toolbar"><div className="toolbar"><button title="保存到全部资料，暂不分类" data-testid={'save-resource-'+r.id} onClick={()=>app.saveResource(r.id)}>{saved?'已保存到我的资料':'保存到我的资料'}</button><button title="选择收藏夹分类整理，资料也会出现在全部资料中" onClick={()=>app.openCollectionPicker(refs([r.id]))}>加入收藏夹</button><button data-testid={'add-to-project-'+r.id} onClick={()=>app.openProjectPicker(refs([r.id]))}>加入项目</button></div><div className="toolbar detail-secondary-actions"><button onClick={()=>setFeedback(true)}>反馈资料问题</button></div></div>
    <div className="resource-detail-grid"><section className="panel detail-media">{missing?<Empty title="来源暂时失效"><p>当前无法定位可读内容。记录级信息保留；未显示替代原文。</p></Empty>:item?<FeaturedMedia item={item} initialPage={page} onPageChange={showPage} paperView={paperView} onPaperViewChange={showPaperView}/>:<ResourcePreview resource={r}/>}</section><section className="panel detail-metadata"><span className="eyebrow">判断资料的身份与可用范围</span><h2>编目说明</h2><p>{r.description}</p><dl><dt>记录版本</dt><dd>{r.versionId}</dd><dt>作者／机构</dt><dd>{r.authors?.join('、')||'未详，待核实'}</dd><dt>原始日期</dt><dd>{r.sourceDate||'未详'}<small>{r.dateNote}</small></dd><dt>来源</dt><dd>{item && !pdf?<a href={item.file} target="_blank" rel="noreferrer">{r.provenance.sourceLabel} ↗</a>:r.provenance.sourceLabel}{r.provenance.sourcePage?`，第 ${r.provenance.sourcePage} 页`:''}</dd><dt>主题标签</dt><dd>{r.subjects.map(s=><span key={s} className="tag">{s}</span>)}</dd><dt>获取范围</dt><dd>{r.availabilityNote}</dd><dt>授权情况</dt><dd>{item?item.source.license:r.rightsStatus==='synthetic_demo'?'仅为合成演示，不代表真实原件授权':'未核实；本原型不提供原件下载'}</dd><dt>识别／转写</dt><dd>{r.mediaType==='paper'?'按原页整理的文字节选，可与 PDF 原页对照':item?'原始资料预览':r.isDemo?'任务包合成内容，非 OCR 识别结果':'未读取原件，无 OCR 或全文转写'}</dd></dl><div className="toolbar detail-access-actions">
      {readable&&<Link className="button primary detail-reader-entry" to={readUrl}>进入精读</Link>}
      {item&&<FeaturedLinks item={item}/>}
    </div></section></div>
    <section className="panel detail-sections"><div className="tabs">{[['range','目录与可读范围'],['related','相关资料'],['source','来源与处理说明']].map(([v,l])=><button key={v} aria-pressed={tab===v} onClick={()=>setTab(v)}>{l}</button>)}</div>{tab==='range'?<><h2>当前可以查看什么</h2>{item?<p>{r.availabilityNote}</p>:content&&readable?<p>{content.kind==='text'?`${content.paragraphs.length} 个合成段落，可逐段定位和创建笔记。`:content.kind==='image'?`合成画面 ${content.width} × ${content.height}，可保存归一化选区。`:`${content.durationSec} 秒模拟时间轴，可选择起止时间。没有真实视频文件。`}</p>:<p>本任务包仅附目录记录；原目录、页序、正文和实际尺寸未提供。不依据题名生成全文、摘要或历史引文。</p>}</>:tab==='source'?<><h2>来源追溯</h2><p>{r.provenance.note||r.provenance.sourceLabel}</p><p>来源类型：{item?'文献研究中心课程资料包':r.provenance.kind==='synthetic'?'任务包合成':r.provenance.kind==='user_input'?'用户本地输入':'课程资料目录摘录'}；原记录不可在本界面改写。研究者的判断应保存为独立笔记。</p></>:<><h2>相同主题标签的资料</h2><p className="muted">仅以元数据标签匹配，不表示已证实的历史联系。</p><div className="discovery-card-grid">{related.map(x=><ResourceCard key={x.id} resource={x}/>)}</div></>}</section>
    {feedback&&<Modal title="资料问题反馈草稿" onClose={()=>setFeedback(false)}><p>无后台反馈接口。下方仅保存为你下载的草稿，不会对外提交。</p><label>问题说明<textarea value={body} onChange={e=>setBody(e.target.value)} rows={6}/></label><div className="toolbar"><button onClick={()=>setFeedback(false)}>取消并保留草稿</button><button disabled={!body.trim()} onClick={()=>download(r.id+'-反馈草稿.md',`# 资料反馈草稿（未提交）\n\n记录：${r.id}\n题名：${resourceTitle(r)}\n来源：${r.provenance.sourceLabel}\n\n${body}`,'text/markdown;charset=utf-8')}>下载反馈草稿</button></div></Modal>}
  </div>;
}
export default function Discovery({pageId}:{pageId:string}) {
  const pages:Record<string,React.ComponentType>={P01:Home,P02:SearchEditor,P03:Results,P04:Recommendations,P05:Topics,P06:TopicDetail,P07:ResourceDetail};const Page=pages[pageId];return Page?<Page/>:<Empty title="页面不存在"/>;
}
