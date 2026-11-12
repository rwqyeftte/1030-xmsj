import type {Resource, SourceAnchor} from '../contracts/domain';
import {coursePdf} from './featured';
import {PdfSelectionCrop} from './PdfSelectionCrop';
import {isValidPdfSelection} from './pdf-selection';

export function PdfSourceExcerpt({resource, anchor}: {resource?:Resource; anchor:Extract<SourceAnchor,{kind:'pdf'}>}) {
  const pdf=coursePdf(resource);
  if (!pdf || anchor.resourceVersionId!==resource?.versionId || !anchor.selection || !isValidPdfSelection(anchor.selection)) return null;
  return <>{anchor.selection.ocr&&<small className="muted">识别文字 · 可对照下方原页</small>}<PdfSelectionCrop file={pdf.file} page={anchor.page} selection={anchor.selection} title={resource.title}/></>;
}
