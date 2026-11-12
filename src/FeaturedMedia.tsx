import type {FeaturedItem} from './featured';
import type {PaperView} from './paper-text';
import {PaperTextPreview, PaperViewSwitch} from './PaperView';
import PdfReader from './PdfReader';

const fileLabels = {book:'下载 PDF 节选', paper:'下载 PDF 节选', article:'下载 PDF 节选', image:'查看原图', video:'打开视频节选'};

export function FeaturedMedia({item, initialPage, onPageChange, paperView='text', onPaperViewChange}: {
  item:FeaturedItem; initialPage?:number; onPageChange?:(page:number)=>void;
  paperView?:PaperView; onPaperViewChange?:(view:PaperView)=>void;
}) {
  return <figure className="featured-media">
    {item.mediaType==='paper'&&onPaperViewChange&&<PaperViewSwitch view={paperView} onChange={onPaperViewChange}/>}
    {item.mediaType==='paper'&&paperView==='text' ? <PaperTextPreview id={item.code} initialPage={initialPage} onPageChange={onPageChange}/>
      : item.mediaType==='book'||item.mediaType==='paper'||item.mediaType==='article'
        ? <PdfReader key={item.file} file={item.file} title={item.source.title} initialPage={initialPage} onPageChange={onPageChange}/>
        : item.mediaType==='video'
          ? <video controls playsInline preload="metadata" poster={item.image} src={item.file} aria-label={item.source.title}/>
          : <a href={item.file} target="_blank" rel="noreferrer" aria-label={'查看原图：'+item.source.title}><img src={item.file} alt={item.source.imageAlt}/></a>}
    <figcaption>{item.source.sourceLabel}</figcaption>
  </figure>;
}

export function FeaturedLinks({item}: {item:FeaturedItem}) {
  const isPdf=item.mediaType==='book'||item.mediaType==='paper'||item.mediaType==='article';
  return <div className="actions featured-links">
    {isPdf ? <a className="button" href={item.file} download={item.source.title+'（节选）.pdf'}>{fileLabels[item.mediaType]}</a>
      : <a className="button" href={item.file} target="_blank" rel="noreferrer">{fileLabels[item.mediaType]} ↗</a>}
  </div>;
}
