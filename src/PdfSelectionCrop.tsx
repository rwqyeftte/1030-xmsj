import {useEffect, useRef, useState} from 'react';
import type {PDFDocumentLoadingTask, RenderTask} from 'pdfjs-dist';
import type {PdfSelection} from '../contracts/domain';
import {isValidPdfSelection,pdfSelectionBounds} from './pdf-selection';

export function PdfSelectionCrop({file, page, selection, title}: {file:string;page:number;selection:PdfSelection;title:string}) {
  const output = useRef<HTMLDivElement>(null);
  const [failed,setFailed] = useState(false);
  useEffect(() => {
    const target=output.current;
    if (!target || !isValidPdfSelection(selection)) return;
    let active=true, loading:PDFDocumentLoadingTask|undefined, render:RenderTask|undefined;
    target.replaceChildren();setFailed(false);
    async function crop() {
      const [engine,{default:workerUrl}]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
      if (!active) return;
      engine.GlobalWorkerOptions.workerSrc=workerUrl;
      loading=engine.getDocument({url:file,isEvalSupported:false});
      const doc=await loading.promise;
      if (!active) return;
      const pdfPage=await doc.getPage(page);
      if (!active) return;
      const original=pdfPage.getViewport({scale:1});
      const bounds=pdfSelectionBounds(selection);
      const scale=Math.min(5,900/(original.width*bounds.width),1000/(original.height*bounds.height));
      const view=pdfPage.getViewport({scale});
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.ceil(view.width*bounds.width));
      canvas.height=Math.max(1,Math.ceil(view.height*bounds.height));
      render=pdfPage.render({canvas,viewport:view,transform:[1,0,0,1,-bounds.x*view.width,-bounds.y*view.height]});
      await render.promise;
      if (active) target!.replaceChildren(canvas);
    }
    void crop().catch(()=>{if(active)setFailed(true);}).finally(()=>{if(loading)void loading.destroy().catch(()=>{});});
    return ()=>{active=false;render?.cancel();if(loading)void loading.destroy().catch(()=>{});};
  },[file,page,selection]);
  return <div className="pdf-selection-crop" aria-label={title+'，第 '+page+' 页所选原文'} role="img" ref={output}>{failed?'选区图像载入失败，可从来源链接查看原页。':null}</div>;
}
