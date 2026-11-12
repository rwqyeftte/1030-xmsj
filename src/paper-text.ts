import raw from '../contracts/paper-texts.json';
import type {DemoContent, Resource} from '../contracts/domain';

export type PaperView = 'text' | 'pdf';
export interface PaperParagraph {id: string; page: number; heading: string; text: string}
const excerpts: Record<string, PaperParagraph[]> = raw;

export function paperParagraphs(id: string): PaperParagraph[] {
  return excerpts[id] ?? [];
}
export function paperTextContent(resource: Resource): Extract<DemoContent, {kind:'text'}> | undefined {
  const paragraphs = paperParagraphs(resource.id);
  if (resource.mediaType !== 'paper' || !paragraphs.length) return;
  return {id:'paper-text-'+resource.id, resourceId:resource.id, versionId:resource.versionId,
    kind:'text', paragraphs, warning:'文字节选依课程提供的论文原页整理。'};
}
export function paperViewFromQuery(params: URLSearchParams): PaperView {
  return params.get('view') === 'pdf' || (!params.has('view') && params.has('page')) ? 'pdf' : 'text';
}
