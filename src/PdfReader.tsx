import {useEffect, useRef, useState} from 'react';
import type {PointerEvent} from 'react';
import type {PdfSelection, SourceAnchor} from '../contracts/domain';
import {boxBetween,clamp} from './image-annotations';
import type {Point} from './image-annotations';
import {isValidPdfSelection, selectedPdfText} from './pdf-selection';
import {renderPdfText} from './pdf-text-layer';
import type {PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask} from 'pdfjs-dist';

interface PdfReaderProps {
  file: string;
  title: string;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  onCitePage?: (page: number) => void;
  citeLabel?: string;
  resourceId?: string;
  onCiteSelection?: (page:number,selection:PdfSelection) => void;
  onAskSelection?: (page:number,selection:PdfSelection) => void;
  highlight?: Extract<SourceAnchor,{kind:'pdf'}> | null;
}

export default function PdfReader({file, title, resourceId, initialPage = 1, onPageChange, onCitePage, onCiteSelection, onAskSelection, highlight, citeLabel = '记本页笔记'}: PdfReaderProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const start = Number.isSafeInteger(initialPage) && initialPage > 0 ? initialPage : 1;
  const [requested, setPage] = useState(start);
  const page = pdf ? Math.min(requested, pdf.numPages) : requested;
  const [renderedPage, setRenderedPage] = useState(0);
  const pageListener = useRef(onPageChange);
  pageListener.current = onPageChange;
  useEffect(() => setPage(start), [start]);
  useEffect(() => {
    if (pdf) pageListener.current?.(page);
  }, [pdf, page]);
  const [zoom, setZoom] = useState(100);
  const [width, setWidth] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [painting, setPainting] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const savedHighlight = useRef<HTMLDivElement>(null);
  const [boxMode,setBoxMode]=useState(false);
  const [picked,setPicked]=useState<PdfSelection|null>(null);
  const [textMode,setTextMode]=useState<'native'|'ocr'|'none'>('none');
  const [firstCorner,setFirstCorner]=useState<Point|null>(null);
  const drag=useRef<Point|null>(null);
  const enableSelection=!!onCiteSelection;
  const activeSelection=picked??(highlight?.page===page&&isValidPdfSelection(highlight.selection)?highlight.selection:null);
  useEffect(()=>{
    setPicked(null);setBoxMode(false);setFirstCorner(null);drag.current=null;
  },[file,page]);
  useEffect(()=>{
    if(!enableSelection || painting || boxMode) return;
    let frame=0;
    const capture=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const layer=sheet.current?.querySelector<HTMLElement>('.pdf-page-text');
        const selection=layer && selectedPdfText(layer);
        if(selection) setPicked(selection);
      });
    };
    document.addEventListener('selectionchange',capture);
    return ()=>{cancelAnimationFrame(frame);document.removeEventListener('selectionchange',capture);};
  },[enableSelection,painting,boxMode]);
  useEffect(()=>{
    if(!savedHighlight.current || !viewport.current || !highlight?.selection || highlight.page!==renderedPage || painting) return;
    const mark=savedHighlight.current.getBoundingClientRect(), pane=viewport.current.getBoundingClientRect();
    viewport.current.scrollBy({top:mark.top-pane.top-24,left:mark.left<pane.left||mark.right>pane.right?mark.left-pane.left-12:0});
  },[renderedPage,painting,highlight?.id]);
  function point(e:PointerEvent<HTMLElement>) {
    const bounds=e.currentTarget.getBoundingClientRect();
    return {x:clamp((e.clientX-bounds.left)/bounds.width),y:clamp((e.clientY-bounds.top)/bounds.height)};
  }
  function startBox(e:PointerEvent<HTMLElement>) {
    if(!e.isPrimary || e.button!==0) return;
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    drag.current=firstCorner??point(e);setPicked(null);
  }
  function updateBox(e:PointerEvent<HTMLElement>,finish=false) {
    if(!e.isPrimary || !drag.current) return;
    const start=drag.current,end=point(e),box=boxBetween(start,end);
    const bounds=e.currentTarget.getBoundingClientRect();
    const usable=box.width*bounds.width>=4 && box.height*bounds.height>=4;
    setPicked(usable?{rects:[box]}:null);
    if(finish){
      drag.current=null;
      if(usable){setBoxMode(false);setFirstCorner(null);}
      else setFirstCorner(end);
    }
  }
  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setPicked(null);setFirstCorner(null);setBoxMode(false);drag.current=null;
  }
  function toggleBox() {
    if(!boxMode)window.getSelection()?.removeAllRanges();
    setBoxMode(!boxMode);setFirstCorner(null);setPicked(null);drag.current=null;
  }

  useEffect(() => {
    let active = true;
    let loading: PDFDocumentLoadingTask | undefined;
    async function open() {
      try {
        const [engine, {default: workerUrl}] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        if (!active) return;
        engine.GlobalWorkerOptions.workerSrc = workerUrl;
        loading = engine.getDocument({url: file, isEvalSupported: false});
        const document = await loading.promise;
        if (active) setPdf(document);
      } catch {
        if (active) setError('这份 PDF 暂时无法读取。');
      }
    }
    void open();
    return () => {
      active = false;
      if (loading) void loading.destroy().catch(() => {});
    };
  }, [file, attempt]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    resize.observe(element);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    viewport.current?.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    const target = sheet.current;
    if (!target || !pdf || !width) return;
    let active = true;
    let task: RenderTask | undefined;
    async function paint(document: PDFDocumentProxy, output: HTMLDivElement) {
      setPainting(true);
      try {
        const pdfPage = await document.getPage(page);
        if (!active) return;
        const pageWidth = pdfPage.getViewport({scale: 1}).width;
        const size = pdfPage.getViewport({scale: width * zoom / 100 / pageWidth});
        const density = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(size.width, size.height));
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(size.width * density));
        canvas.height = Math.max(1, Math.round(size.height * density));
        canvas.style.width = size.width + 'px';
        canvas.style.height = size.height + 'px';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${title}，第 ${page} 页`);
        task = pdfPage.render({canvas, viewport: size, transform: [density, 0, 0, density, 0, 0]});
        await task.promise;
        if (!active) return;
        let layer:HTMLElement|undefined;
        if(enableSelection) {
          try {layer=await renderPdfText(pdfPage,size,resourceId,document.fingerprints[0]);}
          catch { /* The page and region tool also work without a text layer. */ }
        }
        if(!active)return;
        output.replaceChildren(canvas,...(layer?[layer]:[]));
        setTextMode(layer?.dataset.ocr==='true'?'ocr':layer?.textContent?.trim()?'native':'none');
        setRenderedPage(page);
        setPainting(false);
      } catch {
        if (active) setError('这一页暂时无法显示。');
      }
    }
    void paint(pdf, target);
    return () => {
      active = false;
      task?.cancel();
    };
  }, [pdf, page, zoom, width, title, enableSelection, resourceId]);

  const retry = () => {
    setError('');
    setPdf(null);
    setPainting(true);
    setAttempt(n => n + 1);
  };
  return <section className="pdf-reader" aria-label="文档阅读器" onKeyDown={e=>{if(e.key==='Escape'&&(picked||boxMode)){e.stopPropagation();clearSelection();}}}>
    <div className="pdf-toolbar">
      <div className="pdf-controls">
        <button type="button" disabled={!pdf || !!error} aria-disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>上一页</button>
        <span className="pdf-page-number" aria-live="polite">{pdf ? `第 ${page} / ${pdf.numPages} 页` : 'PDF 节选'}</span>
        <button type="button" disabled={!pdf || !!error} aria-disabled={!pdf || page >= pdf.numPages} onClick={() => pdf && setPage(Math.min(pdf.numPages, page + 1))}>下一页</button>
      </div>
      <div className="pdf-controls">
        <button type="button" aria-label="缩小" title="缩小" disabled={!pdf || !!error} aria-disabled={zoom <= 75} onClick={() => setZoom(z => Math.max(75, z - 25))}>−</button>
        <span className="pdf-zoom">{zoom}%</span>
        <button type="button" aria-label="放大" title="放大" disabled={!pdf || !!error} aria-disabled={zoom >= 250} onClick={() => setZoom(z => Math.min(250, z + 25))}>＋</button>
      </div>
      {onCitePage && <button className="primary" type="button" disabled={!pdf || !!error || painting || renderedPage !== page} onClick={() => onCitePage(page)}>{citeLabel}</button>}
    </div>
    {onCiteSelection && <div className="pdf-selection-tools">
      <button type="button" disabled={painting||!!error} aria-pressed={boxMode} onClick={toggleBox}>{boxMode?'取消框选':'框选段落'}</button>
      <button type="button" className="primary" disabled={!picked||boxMode||painting||!!error} onMouseDown={e=>e.preventDefault()} onClick={()=>{
        if(!picked)return;
        onCiteSelection(page,picked);setPicked(null);window.getSelection()?.removeAllRanges();
      }}>{citeLabel==='选为对照来源'?'选用这段原文':'为选段记笔记'}</button>
      {onAskSelection&&picked?.quote&&!boxMode&&!painting&&<button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{
        onAskSelection(page,picked);setPicked(null);window.getSelection()?.removeAllRanges();
      }}>问 AI</button>}
      {picked&&!boxMode&&<button type="button" onClick={clearSelection}>取消选段</button>}
      <span role="status">{boxMode?(firstCorner?'再点段落的另一个角。':'在原页拖框，或依次点段落的两个角。'):picked?(picked.quote?'已选中文字。':'已框选原页段落。'):textMode==='ocr'?'可拖选文字或框选段落。识别文字请与原页核对。':textMode==='native'?'可拖选文字，图表也可以框选。':'扫描图页可用「框选段落」选取原文。'}</span>
    </div>}
    {error && <div className="pdf-error" role="alert">{error} <button type="button" onClick={retry}>重新加载</button></div>}
    <div ref={viewport} className="pdf-viewport" tabIndex={0} aria-label={title + '，页内滚动'} hidden={!!error}>
      <div className="pdf-sheet" aria-busy={painting}>
        <div className="pdf-page-surface">
          <div ref={sheet} className="pdf-page-art"/>
          {enableSelection&&renderedPage===page&&!painting&&activeSelection?.rects.map((r,i)=><div key={i} ref={i===0?savedHighlight:undefined}
            className="pdf-passage-highlight" data-testid={i===0?'anchor-highlight':undefined} aria-hidden="true"
            style={{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'}}/>)}
          {boxMode&&!painting&&<div className="pdf-box-tool" aria-label="段落框选区域" data-testid="pdf-box-tool" onPointerDown={startBox}
            onPointerMove={e=>updateBox(e)} onPointerUp={e=>updateBox(e,true)} onPointerCancel={()=>{drag.current=null;setPicked(null);setFirstCorner(null);}}/>}
        </div>
      </div>
      {painting && !error && <span className="pdf-loading" role="status">正在载入书页…</span>}
    </div>
  </section>;
}
