import articles from '../contracts/course-articles.json';
import books from '../contracts/featured-books.json';
import images from '../contracts/featured-images.json';
import videos from '../contracts/featured-videos.json';
import arrivalImages from '../contracts/new-arrivals-images.json';
import arrivalVideos from '../contracts/new-arrivals-videos.json';
import curatedTopics from '../contracts/topics.json';
import {paperTextContent} from './paper-text';
import type {AppData, DemoContent, MediaType, Resource, Topic} from '../contracts/domain';

interface CourseSource {
  title: string;
  description: string;
  authors: string[];
  date: string | null;
  dateNote: string;
  subjects: string[];
  sourceLabel: string;
  license: string;
  imageAlt: string;
  filename: string;
  width?: number;
  height?: number;
  durationSec?: number;
  pageCount?: number;
}

function assetUrl(filename: string) {
  return new URL(`./assets/featured/${filename}`, import.meta.url).href;
}

function catalogue(records: Record<string, CourseSource>, mediaType: MediaType, fileAddedAt?: string) {
  return Object.entries(records).map(([code, source]) => ({
    code, source, mediaType, fileAddedAt,
    image: assetUrl(code + '.webp'),
    file: assetUrl(source.filename),
  }));
}

const editorPicks = [...catalogue(books, 'book'), ...catalogue(images, 'image'), ...catalogue(videos, 'video'), ...catalogue(articles, 'paper')];
const editorialIds = new Set(editorPicks.map(item=>item.code));
// This date records when the previously catalogue-only files were added to the site.
const novemberIntake = '2026-11-12';
const items = [...editorPicks, ...catalogue(arrivalImages, 'image', novemberIntake), ...catalogue(arrivalVideos, 'video', novemberIntake)];
export type FeaturedItem = typeof items[number];
const byId = new Map(items.map(item => [item.code, item]));

export function featuredMaterial(resource: Resource) {
  return resource.access === 'file_available' ? byId.get(resource.id) : undefined;
}

export function isEditorPick(resource: Resource) {
  return !!featuredMaterial(resource) && editorialIds.has(resource.id);
}

export function accessionDate(resource: Resource) {
  return featuredMaterial(resource)?.fileAddedAt ?? resource.createdAt;
}

export function coursePdf(resource?: Resource) {
  if (!resource || (resource.mediaType !== 'book' && resource.mediaType !== 'article' && resource.mediaType !== 'paper')) return;
  const item = featuredMaterial(resource);
  if (item?.mediaType === resource.mediaType && item.source.pageCount) return item;
}

export function hasStudySource(data: AppData, resource?: Resource) {
  if (!resource) return false;
  return !!coursePdf(resource) || ((resource.access === 'demo_readable' || !!featuredMaterial(resource)) && data.contents.some(
    content => content.id === resource.contentId && content.resourceId === resource.id && content.versionId === resource.versionId
  ));
}

function courseContent(item: FeaturedItem, resource: Resource): DemoContent | undefined {
  if (item.mediaType === 'paper') return paperTextContent(resource);
  const {source} = item;
  const base = {id: 'course-media-' + resource.id, resourceId: resource.id, versionId: resource.versionId, warning: source.sourceLabel};
  if (item.mediaType === 'image' && source.width && source.height)
    return {...base, kind:'image', label:source.imageAlt, width:source.width, height:source.height, shapes:[]};
  if (item.mediaType === 'video' && source.durationSec)
    return {...base, kind:'video_timeline', durationSec:source.durationSec, segments:[]};
}

// Enrich the existing catalogue on display so saved references and local project data keep their IDs.
export function withCourseFiles(data: AppData): AppData {
  const added = new Map<string, DemoContent>();
  const resources = data.resources.map((resource): Resource => {
    const item = byId.get(resource.id);
    if (!item || resource.catalogOrigin !== 'center_preview' || resource.access !== 'metadata_only' || resource.visibility !== 'public') return resource;
    const {source} = item;
    const isDocument = item.mediaType === 'book' || item.mediaType === 'article' || item.mediaType === 'paper';
    const availabilityNote = item.mediaType === 'paper' ? '可阅读论文文字节选，并与 PDF 原页对照。'
      : isDocument ? '可在本站逐页阅读课程资料包中的 PDF 节选。'
      : item.mediaType === 'image' ? '可查看完整图片，框选局部记录观察。'
      : `可播放 ${source.durationSec} 秒视频节选，按时间点或片段记笔记。`;
    const enriched: Resource = {
      ...resource, mediaType:item.mediaType, title: source.title, description: source.description, subjects: source.subjects,
      authors: source.authors.length ? source.authors : null, sourceDate: source.date, dateNote: source.dateNote,
      sourceDateType: source.date && isDocument ? 'publication' : null,
      access: 'file_available', availabilityNote,
      provenance: {kind: 'course_catalog', sourceLabel: source.sourceLabel, sourceUrl: item.file, rightsLabel: source.license},
    };
    const content = courseContent(item, enriched);
    if (!content) return enriched;
    added.set(content.id, content);
    return {...enriched, contentId:content.id};
  });
  const contents = [...data.contents.filter(c=>!added.has(c.id)), ...added.values()];
  const enrichedData={...data,resources,contents};
  const readable=new Set(resources.filter(r=>r.visibility==='public' && !r.isDemo && r.catalogOrigin==='center_preview'
    && featuredMaterial(r)?.mediaType===r.mediaType && hasStudySource(enrichedData,r)).map(r=>r.id));
  const topics=(curatedTopics as Topic[]).map(topic=>({...topic,resourceIds:topic.resourceIds.filter(id=>readable.has(id))}));
  const curatedIds=new Set(topics.map(topic=>topic.id));
  return {...enrichedData, topics:[...topics,...data.topics.filter(t=>!t.isDemoCuration&&!curatedIds.has(t.id))]};
}
