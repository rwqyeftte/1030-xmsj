// Keep navigation inside the reading pane rather than also scrolling the whole page.
export function scrollToTextParagraph(viewer:HTMLElement,paragraphId:string) {
  const paragraph=Array.from(viewer.querySelectorAll<HTMLElement>('[data-text-paragraph]'))
    .find(el=>el.dataset.textParagraph===paragraphId);
  if(!paragraph)return;
  const destination=paragraph.parentElement?.querySelector<HTMLElement>('[data-outline-heading]')??paragraph;
  const toolbar=viewer.querySelector<HTMLElement>('.text-selection-toolbar');
  const inset=(toolbar?.offsetHeight||0)+12;
  if(/auto|scroll/.test(getComputedStyle(viewer).overflowY)&&viewer.scrollHeight>viewer.clientHeight){
    viewer.scrollTo({top:viewer.scrollTop+destination.getBoundingClientRect().top-viewer.getBoundingClientRect().top-viewer.clientTop-inset});
  }else destination.scrollIntoView({block:'start',inline:'nearest'});
}
