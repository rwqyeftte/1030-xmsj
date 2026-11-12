import type {PdfSelection} from '../contracts/domain';
import {boxBetween, clamp, validImageBox} from './image-annotations';

export type PdfRect = PdfSelection['rects'][number];

export function isValidPdfSelection(value: unknown): value is PdfSelection {
  if (!value || typeof value !== 'object') return false;
  const {rects, quote, ocr} = value as Partial<PdfSelection>;
  return Array.isArray(rects) && rects.length > 0 && rects.length <= 6000
    && rects.every(rect => rect && validImageBox(rect))
    && (quote === undefined || (typeof quote === 'string' && !!quote.trim()))
    && (ocr === undefined || typeof ocr === 'boolean');
}

export function pdfSelectionBounds({rects}: PdfSelection): PdfRect {
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return {x, y, width: Math.max(...rects.map(r => r.x+r.width))-x,
    height: Math.max(...rects.map(r => r.y+r.height))-y};
}

export function selectedPdfText(layer: HTMLElement): PdfSelection | null {
  const selected = window.getSelection();
  if (!selected || selected.rangeCount !== 1 || selected.isCollapsed) return null;
  const range = selected.getRangeAt(0);
  if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer)) return null;
  const bounds = layer.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const rects: PdfRect[] = [], text: string[] = [];
  let previousLine: Element | null = null;
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  // Reading individual text nodes avoids the huge parent boxes returned for multi-line selections.
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const part = document.createRange();
    part.selectNodeContents(node);
    if (node === range.startContainer) part.setStart(node,range.startOffset);
    if (node === range.endContainer) part.setEnd(node,range.endOffset);
    if (part.collapsed) continue;
    text.push(part.toString());
    if (!part.toString().trim()) continue;
    for (const r of part.getClientRects()) {
      const box = boxBetween({x:clamp((r.left-bounds.left)/bounds.width),y:clamp((r.top-bounds.top)/bounds.height)},
        {x:clamp((r.right-bounds.left)/bounds.width),y:clamp((r.bottom-bounds.top)/bounds.height)});
      if (!validImageBox(box)) continue;
      const line = node.parentElement?.closest('.pdf-ocr-line') ?? null;
      const previous = rects.at(-1);
      const separation = previous ? (box.x-previous.x-previous.width)*bounds.width : Infinity;
      const maxGap = Math.max(r.height, previous ? previous.height*bounds.height : 0);
      if (previous && line && line===previousLine && box.x>=previous.x && separation<=maxGap) {
        const bottom = Math.max(previous.y+previous.height,box.y+box.height);
        previous.y = Math.min(previous.y,box.y);
        previous.height = bottom-previous.y;
        previous.width = Math.max(previous.width,box.x+box.width-previous.x);
      } else rects.push(box);
      previousLine = line;
    }
  }
  const result = {quote:text.join('').trim(), rects, ocr:layer.dataset.ocr === 'true'};
  return isValidPdfSelection(result) ? result : null;
}
