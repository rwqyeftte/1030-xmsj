import type { Resource } from '../contracts/domain';
import { mediaLabels } from './store';

/** A typographic catalogue label, never a reconstruction of the missing original. */
export default function CatalogVisual({ resource }: { resource: Resource }) {
  return <div className={`catalog-visual catalog-${resource.mediaType}`} aria-hidden="true">
    <div className="catalog-register"><span>{mediaLabels[resource.mediaType]}资料</span><span>{resource.id}</span></div>
    <div className="catalog-label" />
    <div className="catalog-caption">{resource.subjects.slice(0, 2).join(' / ') || '待整理资料'}</div>
  </div>;
}
