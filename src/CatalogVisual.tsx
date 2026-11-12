import {featuredMaterial} from './featured';
import type { Resource } from '../contracts/domain';
import { mediaLabels } from './store';


export default function CatalogVisual({ resource, showFeaturedCover = false }: { resource: Resource; showFeaturedCover?: boolean }) {
  const item=showFeaturedCover ? featuredMaterial(resource) : undefined;
  return <div className={`catalog-visual catalog-${resource.mediaType}${item?' featured-cover':''}`} aria-hidden={item?undefined:true}>
    <div className="catalog-register"><span>{mediaLabels[resource.mediaType]}资料</span><span>{resource.id}</span></div>
    <div className="catalog-label">{item&&<img src={item.image} alt={item.source.imageAlt} loading="lazy" decoding="async"/>}</div>
    <div className="catalog-caption">{resource.subjects.slice(0, 2).join(' / ') || '待整理资料'}</div>
  </div>;
}
