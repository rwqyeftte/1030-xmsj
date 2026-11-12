import type {Resource} from '../contracts/domain';
import {featuredMaterial,hasStudySource} from './featured';
import {mediaLabels,resourceDateLabel,resourceTitle} from './presentation';
import type {SearchEvidence} from './search';
import {useApp} from './store';
import {Link,ResourcePreview} from './ui';
import './SearchResultCard.css';

type Props = {
  resource:Resource;
  grid:boolean;
  selected?:boolean;
  onSelect?:()=>void;
  evidence?:SearchEvidence;
};

function HitText({text,terms}:{text:string;terms:string[]}) {
  const tokens=[...new Set(terms.filter(Boolean))].sort((a,b)=>b.length-a.length);
  if (!tokens.length) return <>{text}</>;
  const escaped=tokens.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const pieces=text.split(new RegExp('('+escaped.join('|')+')','giu'));
  return <>{pieces.map((piece,i)=>i%2?<mark key={i}>{piece}</mark>:piece)}</>;
}

export default function SearchResultCard({resource,grid,selected,onSelect,evidence}:Props) {
  const app=useApp();
  const item=featuredMaterial(resource);
  const title=resourceTitle(resource);
  const path='/resources/'+encodeURIComponent(resource.id);
  const readable=hasStudySource(app.data,resource);
  const collected=app.data.collections.some(c=>c.ownerId===app.data.session.userId&&c.members.some(m=>m.kind==='resource'&&m.id===resource.id));
  const terms=evidence?.terms??[];
  const page=evidence?.page;
  const target=new URLSearchParams();
  if(page)target.set('page',String(page));
  if(evidence?.paragraphId){
    if(resource.mediaType==='paper')target.set('view','text');
    target.set('paragraphId',evidence.paragraphId);
  }
  const hasLocation=readable&&target.size>0;
  const readUrl=path+'/read'+(hasLocation?'?'+target:'');
  const edition=item?.source.pageCount ? item.source.pageCount+' 页节选'
    :item?.source.durationSec ? item.source.durationSec+' 秒节选' : undefined;
  const access=resource.access==='restricted'?'访问受限':readable?'可精读':'仅目录';
  const journal=resource.mediaType==='paper'?resource.provenance.sourceLabel.split(' · ')[0]:null;
  const typeLabel=mediaLabels[resource.mediaType]+'资料';
  const metadata=[resource.authors?.join('、'),journal||resource.subjects.filter(s=>s!=='演示').join(' / '),
    !journal&&resource.sourceDate?resourceDateLabel(resource):null].filter((v):v is string=>!!v);
  const visibleFields=[title,typeLabel,resource.id,...metadata].map(value=>value.toLowerCase());
  const needsExcerpt=hasLocation||terms.some(term=>!visibleFields.some(value=>value.includes(term.toLowerCase())));
  const summary=needsExcerpt?evidence?.text:item?.source.description;
  const ref={kind:'resource' as const,id:resource.id};

  return <article className={'search-record '+(grid?'search-record-grid':'search-record-list')} data-selected={selected||undefined} data-testid={'resource-card-'+resource.id} data-resource-id={resource.id}>
    {item&&<figure className="search-record-cover">
      <img src={item.image} alt={item.source.imageAlt} loading="lazy" decoding="async"/>
    </figure>}
    <div className="search-record-content">
      <div className="search-record-register">
        <span className="search-record-type"><HitText text={typeLabel} terms={terms}/></span>
        <span className="search-record-code"><HitText text={resource.id} terms={terms}/></span>
        {edition&&<span>{edition}</span>}
        {resource.isDemo&&<span>合成演示</span>}
        {(!readable||!item)&&<span>{access}</span>}
        {onSelect&&<label className="search-record-select">
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label={'选择 '+title}/>
        </label>}
      </div>
      <h3 className="search-record-title"><Link to={path}><HitText text={title} terms={terms}/></Link></h3>
      {metadata.length>0&&<p className="search-record-metadata">{metadata.map((value,i)=><span key={i}><HitText text={value} terms={terms}/></span>)}</p>}
      {summary&&<p className="search-record-summary">
        <HitText text={summary} terms={terms}/>
        {hasLocation&&<Link to={readUrl} data-testid="search-hit-source">{page?'查看节选第 '+page+' 页':'查看原文段落'}</Link>}
      </p>}
      <div className="search-record-actions">
        <ResourcePreview resource={resource}/>
        {readable&&<Link className="search-record-read" to={readUrl}>进入精读</Link>}
        <button aria-label={'将 '+title+' 加入收藏夹'} onClick={()=>app.openCollectionPicker([ref])}>{collected?'已收藏':'收藏'}</button>
        <button data-testid={'add-to-project-'+resource.id} onClick={()=>app.openProjectPicker([ref])}>加入项目</button>
      </div>
    </div>
  </article>;
}
