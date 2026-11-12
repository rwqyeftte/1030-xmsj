import type {PDFPageProxy, PageViewport} from 'pdfjs-dist';
type OcrPage = {width:number;height:number;lines:[string,number,number,number,number][][]};
const editions: Record<string,string> = {
  B01:'2fcc673cb42c50b509dc3bc2c33e0a18', B02:'3d44c29fa06ea3b4a19f2849fce75acf',
  A01:'cf6262604dc2fb82509f9072233bbc0f', A02:'5b9647bbc8b5b2c608fee3b7cb4f30dd',
  A03:'a6a3c95c19bec8fcbae8cb2416898753', A04:'260bb012bbaee331c1922f6b1bb2ccd7'
};

// Coordinates are pixel boxes from local Chinese OCR on these exact scanned editions.
function addOcr(layer: HTMLElement, page: OcrPage, viewport: PageViewport) {
  const metrics = document.createElement('canvas').getContext('2d');
  if (!metrics) return;
  for (const line of page.lines) {
    const row=document.createElement('span');
    row.className='pdf-ocr-line';
    line.forEach(([word,x,y,w,h],i) => {
      const span = document.createElement('span');
      const size = viewport.height * h / page.height;
      metrics.font = size+'px sans-serif';
      const length = metrics.measureText(word).width;
      Object.assign(span.style,{left:x/page.width*100+'%', top:y/page.height*100+'%',fontSize:size+'px',
        transform:'scaleX('+(length?viewport.width*w/page.width/length:1)+')'});
      span.textContent=word;
      row.append(span);
      const next=line[i+1];
      if (next && /[a-z0-9]$/i.test(word) && /^[a-z0-9]/i.test(next[0]) && next[1]>x+w+2) row.append(' ');
    });
    row.append('\n');
    layer.append(row);
  }
  layer.dataset.ocr='true';
}

export async function renderPdfText(page: PDFPageProxy, viewport: PageViewport, code?: string, fingerprint?: string|null) {
  const layer = document.createElement('div');
  layer.className = 'pdf-page-text';
  if (code && editions[code] && editions[code] === fingerprint) {
    const data: Record<string,OcrPage> = (await import(`./assets/pdf-ocr/${code}.json`)).default;
    if (data[page.pageNumber]) {
      addOcr(layer, data[page.pageNumber], viewport);
      return layer;
    }
  }
  const content = await page.getTextContent();
  const hasBody = content.items.some(item => 'str' in item && item.str.trim()
    && !(item.str.startsWith((code ?? '')+' | Source ') && /dpi preview/i.test(item.str)));
  if (!hasBody) return layer;
  const {TextLayer} = await import('pdfjs-dist');
  layer.classList.add('pdf-native-text');
  layer.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit));
  const text = new TextLayer({container: layer, textContentSource:content, viewport});
  await text.render();
  // Use the rendered sheet's exact size, including fractional zoom scaling.
  layer.style.width='100%';layer.style.height='100%';
  return layer;
}
