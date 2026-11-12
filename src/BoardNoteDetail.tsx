import type {AppData, DemoContent, ObjectRef, Resource, SourceAnchor} from '../contracts/domain';
import {ImageCrop} from './ImageReader';
import {PdfSourceExcerpt} from './PdfSourceExcerpt';
import {validImageBox} from './image-annotations';
import {useImageSource} from './image-source';
import {resourceTitle} from './presentation';
import {paperParagraphs} from './paper-text';
import {anchorLabel} from './store';
import {Link, SourceLink} from './ui';
import {validVideoAnchor, videoTime} from './video-annotations';

function SourceImage({resource, content, anchor}: {
  resource:Resource;
  content:Extract<DemoContent,{kind:'image'}>;
  anchor:Extract<SourceAnchor,{kind:'image'}>;
}) {
  const image=useImageSource(resource.id);
  if (!validImageBox(anchor) || (!resource.isDemo && !image.url)) return null;
  return <ImageCrop content={content} blobUrl={image.url} box={anchor}/>;
}

function NoteSource({data, projectId, anchorId}: {data:AppData;projectId:string;anchorId:string}) {
  const anchor=data.anchors.find(item=>item.id===anchorId);
  const resource=anchor && data.resources.find(item=>item.id===anchor.resourceId && (item.visibility==='public' || item.ownerId===data.session.userId));
  if (!anchor || !resource) return <div className="board-note-source"><SourceLink anchorId={anchorId} boardProjectId={projectId}/></div>;
  const content=data.contents.find(item=>item.id===resource.contentId && item.resourceId===resource.id && item.versionId===anchor.resourceVersionId && item.versionId===resource.versionId);
  const quote=anchor.kind==='text'?anchor.quote:anchor.kind==='pdf'?anchor.selection?.quote:undefined;
  let location=anchorLabel(anchor);
  if (anchor.kind==='text' && resource.mediaType==='paper' && resource.versionId===anchor.resourceVersionId) {
    const paper=paperParagraphs(resource.id);
    const first=paper.find(p=>p.id===anchor.paragraphId)?.heading;
    const last=paper.find(p=>p.id===(anchor.endParagraphId||anchor.paragraphId))?.heading;
    if(first && last) location=location.replace(/ · 选文$/,'')+' · '+(first===last?first:first+' 至 '+last);
  }
  return <div className="board-note-source">
    <strong>{resourceTitle(resource)}</strong>
    <small>{location}</small>
    {quote && <blockquote>{quote}</blockquote>}
    {anchor.kind==='pdf' && <PdfSourceExcerpt resource={resource} anchor={anchor}/>}
    {anchor.kind==='image' && content?.kind==='image' && <SourceImage resource={resource} content={content} anchor={anchor}/>}
    {anchor.kind==='video' && content?.kind==='video_timeline' && validVideoAnchor(anchor,content.durationSec) &&
      <div className="board-video-range" aria-label="在视频全长中的位置">
        <div><i style={{left:100*anchor.startSec/content.durationSec+'%',width:100*(anchor.endSec-anchor.startSec)/content.durationSec+'%'}}/></div>
        <small>00:00</small><small>{videoTime(content.durationSec)}</small>
      </div>}
    <SourceLink boardProjectId={projectId} anchorId={anchorId}/>
  </div>;
}

export default function BoardNoteDetail({data, projectId, noteRef, readonly}: {data:AppData;projectId:string;noteRef:ObjectRef;readonly:boolean}) {
  const note=data.notes.find(item=>item.id===noteRef.id && item.ownerId===data.session.userId);
  const revision=note?.revisions.find(item=>item.revision===(noteRef.revision??note.currentRevision));
  if (!note || !revision) return <p className="muted">这张卡片引用的笔记版本暂不可用。</p>;
  return <div className="board-note-detail">
    {revision.anchorIds.length>0 && <section aria-label="原始来源">
      <h4>原始来源</h4>
      {revision.anchorIds.map(id=><NoteSource key={id} data={data} projectId={projectId} anchorId={id}/>)}
    </section>}
    <section aria-label="我的笔记">
      <h4>我的笔记</h4>
      <p className="board-observation">{revision.body || '尚未添加笔记。'}</p>
    </section>
    <Link className="board-note-open" to={'/me/notes/'+encodeURIComponent(note.id)+'?projectId='+encodeURIComponent(projectId)}>{readonly?'查看完整笔记':'编辑笔记与原文定位'} →</Link>
  </div>;
}
